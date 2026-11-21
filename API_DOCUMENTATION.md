# Post API

HTTP API for posts, built to serve both the Next.js web UI and an **offline-first** mobile client (e.g. Expo + SQLite).

- **REST endpoints** (`/api/posts`) — classic online CRUD. They only ever show _live_ posts.
- **Sync endpoints** (`/api/sync/*`) — what an offline client uses: pull every change since a cursor, and push a queue of local changes.

Base URL in development: `http://localhost:3000`. All bodies are JSON (`Content-Type: application/json`). There is no authentication yet.

---

## Contents

- [Data model](#data-model)
- [Conventions](#conventions)
- [REST endpoints](#rest-endpoints)
  - [List posts](#list-posts) · [Create a post](#create-a-post) · [Get a post](#get-a-post) · [Update a post (PATCH)](#update-a-post-patch) · [Replace a post (PUT)](#replace-a-post-put) · [Delete a post](#delete-a-post)
- [Sync endpoints](#sync-endpoints)
  - [Pull changes](#pull-changes) · [Push changes](#push-changes)
- [Offline-first client guide](#offline-first-client-guide)
- [Known limitations](#known-limitations)

---

## Data model

Defined in [`src/prisma/contract.prisma`](src/prisma/contract.prisma):

```prisma
model Post {
  id        String   @id @onCreate(uuid(7))
  title     String
  content   String?
  createdAt DateTime @default(now()) @onCreate(now())
  updatedAt temporal.UpdatedAt
  deletedAt DateTime?

  @@index([updatedAt])
  @@map("posts")
}
```

### `Post` object

| Field       | Type                   | Notes                                                                                           |
| ----------- | ---------------------- | ----------------------------------------------------------------------------------------------- |
| `id`        | `string` (UUID)        | Normally a UUIDv7. Clients may generate it themselves so a post has its final id while offline. |
| `title`     | `string`               | 1–255 characters, trimmed.                                                                      |
| `content`   | `string \| null`       |                                                                                                 |
| `createdAt` | `string` (ISO-8601)    | Set by the server on insert.                                                                    |
| `updatedAt` | `string` (ISO-8601)    | Set by the server on every write, **including a delete**. This is the version used by sync.     |
| `deletedAt` | `string \| null` (ISO) | `null` for live posts. Set when a post is deleted (a _tombstone_).                              |

```json
{
  "id": "0193a6f2-5b1e-7c3d-8e9f-0a1b2c3d4e5f",
  "title": "Hello",
  "content": "World",
  "createdAt": "2026-11-21T10:00:00.000Z",
  "updatedAt": "2026-11-21T10:05:00.000Z",
  "deletedAt": null
}
```

### Why these fields

- **UUID ids** — an offline client can't ask the server for the next auto-increment id, so it makes its own. UUIDv7 is time-ordered, which keeps the primary-key index compact.
- **Soft delete (`deletedAt`)** — if a row were really deleted, other devices would never find out. A tombstone travels through sync like any other change.
- **`updatedAt` index** — sync reads "everything changed after X", ordered by `updatedAt`.

---

## Conventions

### Success envelope

```json
{ "data": <Post | Post[] | PushResult[]>, "meta": { ... } }
```

`meta` is only present on list/sync responses. `DELETE` returns `204 No Content` with no body.

### Error envelope

```json
{ "message": "Validation failed", "errors": { "title": "Title is required" } }
```

`errors` (field → message) is only present for validation errors.

| Status | When                                                              |
| ------ | ----------------------------------------------------------------- |
| `400`  | Malformed JSON, invalid post id in the URL, invalid sync cursor.  |
| `404`  | Post does not exist **or is soft-deleted** (REST endpoints only). |
| `409`  | `POST /api/posts` with a client `id` that already exists.         |
| `422`  | Body is valid JSON but fails validation.                          |

### Ids in the URL

`:id` must be a UUID (versions 1–8, any case; it is lower-cased before lookup). Anything else returns `400 { "message": "Invalid post id" }`.

---

## REST endpoints

### List posts

```
GET /api/posts?page=1&limit=10&search=hello
```

Live posts only, newest first (`createdAt desc, id desc`).

| Query    | Default | Notes                                                                     |
| -------- | ------- | ------------------------------------------------------------------------- |
| `page`   | `1`     | Positive integer; invalid values fall back to the default.                |
| `limit`  | `10`    | Positive integer, capped at `100`.                                        |
| `search` | —       | Case-insensitive substring match on `title`. `%` and `_` match literally. |

**200**

```json
{
  "data": [
    {
      "id": "…",
      "title": "Hello",
      "content": null,
      "createdAt": "…",
      "updatedAt": "…",
      "deletedAt": null
    }
  ],
  "meta": {
    "page": 1,
    "limit": 10,
    "total": 1,
    "totalPages": 1,
    "search": "hello"
  }
}
```

> Offset pagination is fine for the web UI but is not stable while data changes. Offline clients should use [Pull changes](#pull-changes).

### Create a post

```
POST /api/posts
```

| Body field | Required | Notes                                                            |
| ---------- | -------- | ---------------------------------------------------------------- |
| `id`       | no       | UUID chosen by the client. Server generates a UUIDv7 if omitted. |
| `title`    | yes      | Non-empty string, max 255 chars, trimmed.                        |
| `content`  | no       | `string` or `null`. Defaults to `null`.                          |

```json
{
  "id": "0193a6f2-5b1e-7c3d-8e9f-0a1b2c3d4e5f",
  "title": "Hello",
  "content": "World"
}
```

| Status | Body                                                                                        |
| ------ | ------------------------------------------------------------------------------------------- |
| `201`  | `{ "data": Post }`                                                                          |
| `400`  | `{ "message": "Invalid JSON body" }`                                                        |
| `409`  | `{ "message": "A post with this id already exists" }`                                       |
| `422`  | `{ "message": "Validation failed", "errors": { "title": "…", "id": "id must be a UUID" } }` |

### Get a post

```
GET /api/posts/:id
```

| Status | Body                                                            |
| ------ | --------------------------------------------------------------- |
| `200`  | `{ "data": Post }`                                              |
| `400`  | `{ "message": "Invalid post id" }`                              |
| `404`  | `{ "message": "Post not found" }` — also for soft-deleted posts |

### Update a post (PATCH)

```
PATCH /api/posts/:id
```

Partial update. Send at least one of `title`, `content`; any field you send must be valid.

```json
{ "content": null }
```

| Status | Body                                                                                  |
| ------ | ------------------------------------------------------------------------------------- |
| `200`  | `{ "data": Post }`                                                                    |
| `400`  | Invalid id or malformed JSON                                                          |
| `404`  | Missing or soft-deleted                                                               |
| `422`  | `{ "errors": { "body": "Provide at least one of: title, content" } }` or field errors |

### Replace a post (PUT)

```
PUT /api/posts/:id
```

Full replace: `title` is required, a missing `content` becomes `null`. Same responses as PATCH.

```json
{ "title": "New title", "content": "New body" }
```

### Delete a post

```
DELETE /api/posts/:id
```

**Soft delete**: sets `deletedAt` (and bumps `updatedAt`) so sync clients receive a tombstone. The post disappears from every REST endpoint.

| Status | Body                               |
| ------ | ---------------------------------- |
| `204`  | _(empty)_                          |
| `400`  | `{ "message": "Invalid post id" }` |
| `404`  | Missing or already deleted         |

---

## Sync endpoints

### Pull changes

```
GET /api/sync/pull?cursor=<token>&limit=100
```

Returns every post — **including tombstones** — whose `(updatedAt, id)` comes after the cursor, ordered by `updatedAt asc, id asc`.

**Safety lag:** only rows whose `updatedAt` is at least **2 seconds old** are returned (`PULL_SAFETY_LAG_MS` in `src/lib/post.ts`). A write gets its `updatedAt` when it runs but only becomes visible when its transaction commits; a push batch can hold up to 100 such writes. Without the lag, a client could move its cursor past rows that later commit with older timestamps and never see them. Rows inside the window are returned by the next pull. Your own pushed changes therefore don't show up in an immediate pull, which is fine because push already returns them.

| Query    | Default | Notes                                                                    |
| -------- | ------- | ------------------------------------------------------------------------ |
| `cursor` | —       | Opaque token from a previous `meta.cursor`. Omit on the very first sync. |
| `limit`  | `100`   | Positive integer, capped at `500`.                                       |

**200**

```json
{
  "data": [
    {
      "id": "…a",
      "title": "Hello",
      "content": null,
      "createdAt": "…",
      "updatedAt": "2026-11-21T10:05:00.000Z",
      "deletedAt": null
    },
    {
      "id": "…b",
      "title": "Old",
      "content": null,
      "createdAt": "…",
      "updatedAt": "2026-11-21T10:06:00.000Z",
      "deletedAt": "2026-11-21T10:06:00.000Z"
    }
  ],
  "meta": {
    "cursor": "eyJ1IjoiMjAyNi0xMS0yMVQxMDowNjowMC4wMDBaIiwiaSI6Ii4uLmIifQ",
    "hasMore": false,
    "serverTime": "2026-11-21T10:07:12.345Z"
  }
}
```

| `meta` field | Meaning                                                                                                                   |
| ------------ | ------------------------------------------------------------------------------------------------------------------------- |
| `cursor`     | Save it and send it next time. If nothing (settled) changed it is the cursor you sent (or `null` on an empty first sync). |
| `hasMore`    | `true` → call again right away with the new cursor.                                                                       |
| `serverTime` | Server clock at response time; handy for showing "last synced".                                                           |

| Status | Body                              |
| ------ | --------------------------------- |
| `400`  | `{ "message": "Invalid cursor" }` |

**Applying a pulled row locally**: if `deletedAt` is set, delete (or hide) the local row; otherwise upsert it by `id`. Treat the cursor as opaque — its format may change.

### Push changes

```
POST /api/sync/push
```

Sends the client's queue of offline changes. The batch runs **in order, inside one database transaction**, and every change gets its own result — an invalid change is reported as `rejected` without failing the others.

**Body**

```json
{
  "changes": [
    {
      "op": "upsert",
      "id": "0193a6f2-…",
      "title": "Written offline",
      "content": "…",
      "baseUpdatedAt": null
    },
    {
      "op": "upsert",
      "id": "0193a6f3-…",
      "title": "Edited",
      "baseUpdatedAt": "2026-11-21T10:05:00.000Z"
    },
    {
      "op": "delete",
      "id": "0193a6f4-…",
      "baseUpdatedAt": "2026-11-21T09:00:00.000Z"
    }
  ]
}
```

`changes` must contain 1–100 items.

| Change field    | Required     | Notes                                                                                                          |
| --------------- | ------------ | -------------------------------------------------------------------------------------------------------------- |
| `op`            | yes          | `"upsert"` (create or update) or `"delete"`.                                                                   |
| `id`            | yes          | UUID. For a new post this is the id the client generated.                                                      |
| `title`         | for `upsert` | Same rules as REST.                                                                                            |
| `content`       | no           | `string \| null`; defaults to `null` (an upsert is a full replace).                                            |
| `baseUpdatedAt` | no           | The server `updatedAt` this edit was based on. Enables conflict detection; omit or `null` for last-write-wins. |

**How each change is applied**

Rules are checked top to bottom; the first that matches wins.

| #   | Server state                                       | `upsert`                                    | `delete`                                |
| --- | -------------------------------------------------- | ------------------------------------------- | --------------------------------------- |
| 1   | No row with this `id`                              | create → `applied`                          | nothing to do → `applied`, `post: null` |
| 2   | Tombstone (already deleted)                        | `conflict` — deletes are final              | `applied`, no write                     |
| 3   | Live row whose `title` and `content` already match | `applied`, no write (`updatedAt` unchanged) | —                                       |
| 4   | Live row, `updatedAt > baseUpdatedAt`              | `conflict` (server copy returned)           | `conflict` (server copy returned)       |
| 5   | Live row, otherwise                                | update → `applied`                          | set `deletedAt` → `applied`             |

Because rules 1–3 run before the version check, **retrying a batch is safe** even when the first response was lost: the first attempt bumped `updatedAt` past the change's `baseUpdatedAt`, but the retry matches rule 2 (delete) or rule 3 (same values) and comes back `applied` instead of a false `conflict`. A side effect of rule 3: if another device already wrote identical values, your edit is reported as `applied`, which is accurate since the result is the same.

**200**

```json
{
  "data": [
    {
      "id": "0193a6f2-…",
      "status": "applied",
      "post": {
        "id": "0193a6f2-…",
        "title": "Written offline",
        "updatedAt": "…",
        "deletedAt": null
      }
    },
    {
      "id": "0193a6f3-…",
      "status": "conflict",
      "post": {
        "id": "0193a6f3-…",
        "title": "Changed on the web",
        "updatedAt": "…"
      }
    },
    {
      "id": null,
      "status": "rejected",
      "errors": { "id": "id must be a UUID" }
    }
  ],
  "meta": { "serverTime": "2026-11-21T10:07:12.345Z" }
}
```

`data[i]` is the result for `changes[i]`.

| `status`   | What the client should do                                                                                                                                              |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `applied`  | Remove the change from the queue. Store `post` (its `updatedAt` is the new base for the next edit).                                                                    |
| `conflict` | The server kept its own copy (`post`). Resolve it: overwrite the local row with `post`, or show both to the user and push again with `baseUpdatedAt = post.updatedAt`. |
| `rejected` | The change can never succeed as-is (see `errors`). Drop it or ask the user to fix it — retrying won't help.                                                            |

| Status | Body                                                                                                                                 |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| `400`  | `{ "message": "Invalid JSON body" }`                                                                                                 |
| `422`  | `{ "message": "Validation failed", "errors": { "changes": "changes must be an array" } }` or `"changes must contain 1 to 100 items"` |

---

## Offline-first client guide

A minimal sync loop for an Expo app with a local SQLite table that mirrors `Post`, plus an `outbox` table of pending changes.

**Local writes (always, online or not)**

1. Create: generate an id with a UUIDv7 library (e.g. `uuidv7`), insert locally, enqueue `{ op: "upsert", id, title, content, baseUpdatedAt: null }`.
2. Edit: update locally, enqueue `{ op: "upsert", …, baseUpdatedAt: <server updatedAt last seen for this row> }`.
3. Delete: hide/delete locally, enqueue `{ op: "delete", id, baseUpdatedAt }`.
   Collapse the queue where possible (several edits of one post → the last one; create + delete of a never-synced post → nothing).

**Sync (on app start, on reconnect, after local writes, on pull-to-refresh)**

```ts
async function sync() {
  // 1. Push first. The push results already carry the server's copy of our
  //    own writes (the pull holds them back for the safety lag).
  const queue = await outbox.peek(100);
  if (queue.length) {
    const { data } = await api.post("/api/sync/push", { changes: queue });
    for (const [i, result] of data.entries()) {
      if (result.status === "applied") await local.save(result.post);
      if (result.status === "conflict")
        await resolveConflict(queue[i], result.post);
      await outbox.remove(queue[i]); // applied, conflict (now resolved) and rejected all leave the queue
    }
  }

  // 2. Pull until caught up.
  let cursor = await storage.get("syncCursor");
  for (;;) {
    const qs = new URLSearchParams({ limit: "500", ...(cursor && { cursor }) });
    const { data, meta } = await api.get(`/api/sync/pull?${qs}`);
    await local.transaction(async () => {
      for (const post of data) {
        // Don't clobber a row that still has unsent local edits.
        if (await outbox.has(post.id)) continue;
        post.deletedAt ? await local.remove(post.id) : await local.upsert(post);
      }
      await storage.set("syncCursor", meta.cursor);
    });
    cursor = meta.cursor;
    if (!meta.hasMore) break;
  }
}
```

Tips:

- Save the cursor in the **same local transaction** as the rows it covers, so a crash can't skip changes.
- Network errors on push: keep the queue and retry later — pushes are idempotent.
- Only one `sync()` should run at a time.

---

## Known limitations

- **Clock source.** `updatedAt` comes from the API server's clock. Several servers with skewed clocks could order writes wrongly.
- **The pull safety lag is a heuristic.** It covers transactions that commit within 2 seconds of stamping their rows. A transaction that runs longer (e.g. stuck waiting on a row lock), or clock skew between several API servers, can still let a client skip a row. A complete fix in Postgres means filtering on transaction snapshots (`pg_current_snapshot()` / `xmin`) instead of timestamps. Raise `PULL_SAFETY_LAG_MS` if you see long-running writes.
- **Tombstones are kept forever.** Nothing purges old soft-deleted rows yet; a cleanup job must not remove tombstones newer than the oldest cursor still in use.
- **Field-level merges.** Conflicts are detected per post, not per field — two devices editing different fields of the same post still conflict.
- **No auth / per-user scoping.** Every client sees every post.
