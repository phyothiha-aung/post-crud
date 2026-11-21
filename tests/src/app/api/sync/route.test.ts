// @vitest-environment node
import { NextRequest } from "next/server";
import { GET as pull } from "@/app/api/sync/pull/route";
import { POST as push } from "@/app/api/sync/push/route";
import { PULL_SAFETY_LAG_MS } from "@/lib/post";
import { db } from "@/prisma/db";

const A = "0190f3a8-0000-7000-8000-00000000000a";
const B = "0190f3a8-0000-7000-8000-00000000000b";

const pullJson = async (qs = "") =>
  (await pull(new NextRequest(`http://localhost/api/sync/pull${qs}`))).json();

const pushReq = (body: unknown) =>
  push(
    new NextRequest("http://localhost/api/sync/push", {
      method: "POST",
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );
const pushJson = async (changes: unknown[]) =>
  (await pushReq({ changes })).json();

const clearPosts = () =>
  db.orm.public.Post.where((p) => p.id.isNotNull()).deleteAll();

describe("/api/sync", () => {
  beforeEach(clearPosts);
  afterAll(async () => {
    await clearPosts();
    await db.close();
  });

  describe("GET /pull", () => {
    // Freeze the clock (Date only, so DB driver timers keep working) and step
    // it past the safety lag whenever written rows should become pullable.
    beforeEach(() => {
      vi.useFakeTimers({ toFake: ["Date"] });
    });
    afterEach(() => {
      vi.useRealTimers();
    });
    const settle = () => vi.setSystemTime(Date.now() + PULL_SAFETY_LAG_MS + 1);

    it("holds back changes newer than the safety lag", async () => {
      await db.orm.public.Post.create({ id: A, title: "Fresh", content: null });

      const early = await pullJson();
      expect(early.data).toEqual([]);
      expect(early.meta.cursor).toBeNull();

      vi.setSystemTime(Date.now() + PULL_SAFETY_LAG_MS - 1);
      expect((await pullJson()).data).toEqual([]);

      vi.setSystemTime(Date.now() + 1);
      const later = await pullJson();
      expect(later.data.map((p: { id: string }) => p.id)).toEqual([A]);
    });

    it("returns everything on first sync, including tombstones", async () => {
      await db.orm.public.Post.create({ id: A, title: "Live", content: null });
      await db.orm.public.Post.create({ id: B, title: "Gone", content: null });
      await db.orm.public.Post.where({ id: B }).update({
        deletedAt: new Date(),
      });

      settle();
      const { data, meta } = await pullJson();
      expect(data.map((p: { id: string }) => p.id)).toEqual([A, B]);
      expect(data[1].deletedAt).not.toBeNull();
      expect(meta.hasMore).toBe(false);
      expect(meta.cursor).toEqual(expect.any(String));
      expect(new Date(meta.serverTime).getTime()).not.toBeNaN();
    });

    it("pages with the cursor and only returns later changes", async () => {
      for (let i = 0; i < 5; i++)
        await db.orm.public.Post.create({ title: `P${i}`, content: null });

      settle();
      const first = await pullJson("?limit=3");
      expect(first.data).toHaveLength(3);
      expect(first.meta.hasMore).toBe(true);

      const second = await pullJson(`?limit=3&cursor=${first.meta.cursor}`);
      expect(second.data).toHaveLength(2);
      expect(second.meta.hasMore).toBe(false);

      // Nothing new: the cursor is handed back unchanged.
      const idle = await pullJson(`?cursor=${second.meta.cursor}`);
      expect(idle.data).toEqual([]);
      expect(idle.meta.cursor).toBe(second.meta.cursor);

      // Editing a row moves it past the cursor.
      await db.orm.public.Post.where({ title: "P0" }).update({ title: "P0!" });
      settle();
      const changed = await pullJson(`?cursor=${second.meta.cursor}`);
      expect(changed.data.map((p: { title: string }) => p.title)).toEqual([
        "P0!",
      ]);
    });

    it("returns 400 for an invalid cursor", async () => {
      const res = await pull(
        new NextRequest("http://localhost/api/sync/pull?cursor=nope"),
      );
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ message: "Invalid cursor" });
    });
  });

  describe("POST /push", () => {
    it("creates, updates and deletes in order", async () => {
      const { data } = await pushJson([
        { op: "upsert", id: A, title: "Draft" },
        { op: "upsert", id: A, title: "Final", content: "Body" },
        { op: "upsert", id: B, title: "Temp" },
        { op: "delete", id: B },
      ]);
      expect(data.map((r: { status: string }) => r.status)).toEqual([
        "applied",
        "applied",
        "applied",
        "applied",
      ]);
      expect(data[1].post).toMatchObject({
        id: A,
        title: "Final",
        content: "Body",
      });
      expect(data[3].post.deletedAt).not.toBeNull();

      expect(await db.orm.public.Post.first({ id: A })).toMatchObject({
        title: "Final",
      });
    });

    it("is idempotent when a batch is retried", async () => {
      const changes = [
        { op: "upsert", id: A, title: "Once" },
        { op: "delete", id: B },
      ];
      await pushJson(changes);
      const { data } = await pushJson(changes);
      expect(data.map((r: { status: string }) => r.status)).toEqual([
        "applied",
        "applied",
      ]);
      const rows = await db.orm.public.Post.where((p) =>
        p.id.isNotNull(),
      ).all();
      expect(rows).toHaveLength(1);
    });

    it("reports a conflict when the server copy is newer than the base", async () => {
      const created = await db.orm.public.Post.create({
        id: A,
        title: "Server",
        content: null,
      });
      const stale = new Date(created.updatedAt.getTime() - 1000).toISOString();

      const { data } = await pushJson([
        { op: "upsert", id: A, title: "Client", baseUpdatedAt: stale },
      ]);
      expect(data[0]).toMatchObject({
        id: A,
        status: "conflict",
        post: { title: "Server" },
      });

      // With the current base the edit goes through.
      const ok = await pushJson([
        {
          op: "upsert",
          id: A,
          title: "Client",
          baseUpdatedAt: created.updatedAt.toISOString(),
        },
      ]);
      expect(ok.data[0]).toMatchObject({
        status: "applied",
        post: { title: "Client" },
      });
    });

    it("treats a retried edit with a now-stale base as applied", async () => {
      const created = await db.orm.public.Post.create({
        id: A,
        title: "Before",
        content: null,
      });
      const edit = {
        op: "upsert",
        id: A,
        title: "After",
        content: "Body",
        baseUpdatedAt: created.updatedAt.toISOString(),
      };
      const first = await pushJson([edit]);
      expect(first.data[0].status).toBe("applied");

      // The response was lost; the client resends the same change.
      const retry = await pushJson([edit]);
      expect(retry.data[0]).toMatchObject({
        status: "applied",
        post: { title: "After", content: "Body" },
      });
      // No second write: updatedAt stays where the first attempt left it.
      expect(retry.data[0].post.updatedAt).toBe(first.data[0].post.updatedAt);
    });

    it("treats a retried delete with a now-stale base as applied", async () => {
      const created = await db.orm.public.Post.create({
        id: A,
        title: "Doomed",
        content: null,
      });
      const del = {
        op: "delete",
        id: A,
        baseUpdatedAt: created.updatedAt.toISOString(),
      };
      expect((await pushJson([del])).data[0].status).toBe("applied");

      const retry = await pushJson([del]);
      expect(retry.data[0].status).toBe("applied");
      expect(retry.data[0].post.deletedAt).not.toBeNull();
    });

    it("does not resurrect a deleted post", async () => {
      await pushJson([
        { op: "upsert", id: A, title: "Doomed" },
        { op: "delete", id: A },
      ]);
      const { data } = await pushJson([{ op: "upsert", id: A, title: "Back" }]);
      expect(data[0]).toMatchObject({
        status: "conflict",
        post: { title: "Doomed" },
      });
      expect(data[0].post.deletedAt).not.toBeNull();
    });

    it("rejects invalid changes without failing the batch", async () => {
      const { data } = await pushJson([
        { op: "upsert", id: "nope", title: "x" },
        { op: "upsert", id: A, title: "Valid" },
      ]);
      expect(data[0]).toEqual({
        id: null,
        status: "rejected",
        errors: { id: "id must be a UUID" },
      });
      expect(data[1].status).toBe("applied");
    });

    it.each([
      [{}, "changes must be an array"],
      [{ changes: [] }, "changes must contain 1 to 100 items"],
      [
        { changes: Array.from({ length: 101 }, () => ({})) },
        "changes must contain 1 to 100 items",
      ],
    ])("returns 422 for body %#", async (body, message) => {
      const res = await pushReq(body);
      expect(res.status).toBe(422);
      expect((await res.json()).errors).toEqual({ changes: message });
    });

    it("returns 400 for malformed JSON", async () => {
      expect((await pushReq("{nope")).status).toBe(400);
    });
  });
});
