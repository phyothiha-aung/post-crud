/**
 * In-memory fake of the /api/posts endpoints, served through MSW.
 * Mirrors the real route handlers' response shapes and status codes.
 */
import { http, HttpResponse } from "msw/http";
import { setupServer } from "msw/node";
import type { Post } from "@/lib/api";

export const store = { posts: [] as Post[], nextId: 1 };

export function makePost(overrides: Partial<Post> = {}): Post {
  const id = overrides.id ?? String(store.nextId++);
  const seq = Number(id) || 0;
  const createdAt = new Date(Date.UTC(2026, 0, 1) + seq * 60_000).toISOString();
  return {
    id,
    title: `Post ${id}`,
    content: `Content ${id}`,
    createdAt,
    updatedAt: createdAt,
    deletedAt: null,
    ...overrides,
  };
}

/** Add posts to the fake DB. Pass a number to create that many default posts. */
export function seed(postsOrCount: Partial<Post>[] | number): Post[] {
  const list =
    typeof postsOrCount === "number"
      ? Array.from({ length: postsOrCount }, () => ({}))
      : postsOrCount;
  const created = list.map((p) => makePost(p));
  store.posts.push(...created);
  return created;
}

const find = (id: string) => store.posts.find((p) => p.id === id);
const notFound = () =>
  HttpResponse.json({ message: "Post not found" }, { status: 404 });

function validate(body: Record<string, unknown>) {
  if (typeof body.title !== "string" || !body.title.trim())
    return HttpResponse.json(
      { message: "Validation failed", errors: { title: "Title is required" } },
      { status: 422 },
    );
}

export const handlers = [
  http.get("/api/posts", ({ request }) => {
    const qs = new URL(request.url).searchParams;
    const page = Number(qs.get("page") ?? 1);
    const limit = Number(qs.get("limit") ?? 10);
    const search = qs.get("search") ?? "";
    const matches = store.posts
      .filter((p) => p.title.toLowerCase().includes(search.toLowerCase()))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return HttpResponse.json({
      data: matches.slice((page - 1) * limit, page * limit),
      meta: {
        page,
        limit,
        total: matches.length,
        totalPages: Math.ceil(matches.length / limit),
        search: search || null,
      },
    });
  }),

  http.get("/api/posts/:id", ({ params }) => {
    if (!/^\d+$/.test(String(params.id)) || params.id === "0")
      return HttpResponse.json({ message: "Invalid post id" }, { status: 400 });
    const post = find(String(params.id));
    return post ? HttpResponse.json({ data: post }) : notFound();
  }),

  http.post("/api/posts", async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    const invalid = validate(body);
    if (invalid) return invalid;
    const [post] = seed([
      {
        title: String(body.title).trim(),
        content: (body.content as string | null) ?? null,
      },
    ]);
    return HttpResponse.json({ data: post }, { status: 201 });
  }),

  http.put("/api/posts/:id", async ({ params, request }) => {
    const post = find(String(params.id));
    if (!post) return notFound();
    const body = (await request.json()) as Record<string, unknown>;
    const invalid = validate(body);
    if (invalid) return invalid;
    Object.assign(post, {
      title: String(body.title).trim(),
      content: (body.content as string | null) ?? null,
      updatedAt: new Date(Date.parse(post.updatedAt) + 3_600_000).toISOString(),
    });
    return HttpResponse.json({ data: post });
  }),

  http.delete("/api/posts/:id", ({ params }) => {
    const post = find(String(params.id));
    if (!post) return notFound();
    store.posts = store.posts.filter((p) => p !== post);
    return new HttpResponse(null, { status: 204 });
  }),
];

export const server = setupServer(...handlers);

/** Start MSW for the current test file and reset the fake DB between tests. */
export function setupMockApi() {
  beforeAll(() => server.listen({ onUnhandledFrame: "error" }));
  afterEach(() => {
    server.resetHandlers();
    store.posts = [];
    store.nextId = 1;
  });
  afterAll(() => server.close());
}

/** A promise you resolve by hand — for holding a request open to assert pending UI. */
export function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => (resolve = r));
  return { promise, resolve };
}
