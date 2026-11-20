/**
 * Shared test setup for every e2e spec.
 *
 * Spec files import `test` and `expect` from HERE instead of from
 * "@playwright/test". Our `test` is Playwright's `test` extended with an extra
 * fixture called `posts`.
 *
 * What's a fixture? Something a test asks for by name in its arguments:
 *
 *     test("…", async ({ page, posts }) => { … })
 *
 * `page` is built in (a fresh browser tab per test). `posts` is ours (defined
 * below). Normally Playwright creates a fixture only for tests that ask for
 * it: it runs the setup code, hands the value to the test, then runs any
 * cleanup. It does the same job as beforeEach/afterEach, but it's reusable
 * and typed.
 *
 * Docs: https://playwright.dev/docs/test-fixtures
 */
import { test as base, expect, type APIRequestContext } from "@playwright/test";

/** The shape our API returns for one post (see src/app/api/posts). */
export type Post = {
  id: number;
  title: string;
  content: string | null;
  createdAt: string;
  updatedAt: string;
};

/**
 * Helpers that set up data through the HTTP API, not the UI.
 *
 * A good e2e rule: test the thing you're testing through the UI, but set up
 * everything else the fastest reliable way. If a test is about *searching*,
 * it shouldn't click "New post" 12 times first. That would be slow, and a bug
 * in the create form would then also fail the search test.
 */
class PostsApi {
  // `request` is Playwright's HTTP client. It already knows `baseURL` from
  // playwright.config.ts, so relative URLs like "/api/posts" just work.
  constructor(private request: APIRequestContext) {}

  /** Delete every post so each test starts from a known, empty state. */
  async reset() {
    // The API caps `limit` at 100, so keep fetching page 1 until it's empty.
    for (;;) {
      const res = await this.request.get("/api/posts?limit=100");
      // `expect(res).toBeOK()` fails with a readable message if status ≥ 400.
      // Without it, a broken API would show up later as a confusing UI error.
      await expect(res).toBeOK();
      const { data } = (await res.json()) as { data: Post[] };
      if (data.length === 0) return;
      for (const post of data) {
        await expect(
          await this.request.delete(`/api/posts/${post.id}`),
        ).toBeOK();
      }
    }
  }

  /** Create one post and return it (including its new `id`). */
  async create(input: { title: string; content?: string | null }) {
    const res = await this.request.post("/api/posts", { data: input });
    await expect(res).toBeOK();
    return ((await res.json()) as { data: Post }).data;
  }

  /**
   * Create posts titled "<prefix> 1", "<prefix> 2", … one at a time, in that
   * order. The list shows newest first, so "<prefix> N" ends up at the top.
   * (They're created sequentially, not with Promise.all, so the order is
   * predictable.)
   */
  async createMany(count: number, prefix = "Post") {
    const created: Post[] = [];
    for (let i = 1; i <= count; i++) {
      created.push(await this.create({ title: `${prefix} ${i}` }));
    }
    return created;
  }
}

// `base.extend<{ … }>` declares the new fixture's name and type.
export const test = base.extend<{ posts: PostsApi }>({
  // A fixture is a function: ({ other fixtures }, use) => { … }.
  // Ours depends on the built-in `request` fixture.
  //
  // The `[fn, { auto: true }]` form makes it AUTOMATIC: it runs for every
  // test, even ones that never mention `posts`. So every test starts with an
  // empty database. Tests that need data just add `posts` to their arguments.
  posts: [
    async ({ request }, use) => {
      const posts = new PostsApi(request);
      await posts.reset(); // setup: runs before the test body
      await use(posts); //    the test runs here
      // Anything after `use` is teardown. We don't need any: the next test
      // resets anyway, and leftover data helps you inspect a failure.
    },
    { auto: true },
  ],
});

// Re-export so specs need just one import line.
export { expect };
