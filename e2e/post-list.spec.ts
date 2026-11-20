/**
 * The home page list: search, pagination and deleting from the list.
 *
 * The list keeps its state in the URL (`/?search=…&page=2`). That's great for
 * e2e tests: we can assert on the URL, and jump straight to a state with
 * `page.goto("/?page=2")` instead of clicking our way there.
 */
import { expect, test, type Post } from "./fixtures";
import type { Page } from "@playwright/test";

// ---------------------------------------------------------------------------
// Small locator helpers. Wrapping locators in functions keeps the tests
// readable, and if the markup changes there's only one place to fix.
// (Larger suites often grow this into a "Page Object" class.)
// ---------------------------------------------------------------------------

/** Every post card in the list (each one is an <li>). */
const items = (page: Page) => page.getByRole("listitem");

/**
 * The card for one post, found by its exact title.
 *
 * Why not `items(page).filter({ hasText: "Post 1" })`? `hasText` matches
 * substrings, so "Post 1" would also match "Post 10" and "Post 11". Instead
 * we keep the <li> that CONTAINS a heading whose name is EXACTLY the title.
 */
const card = (page: Page, title: string) =>
  items(page).filter({
    has: page.getByRole("heading", { name: title, exact: true }),
  });

/** The text between the Previous/Next buttons, e.g. "Page 1 of 2 · 12 posts". */
const pageInfo = (page: Page) =>
  page.getByRole("navigation", { name: "Pagination" });

const searchBox = (page: Page) =>
  page.getByRole("searchbox", { name: "Search posts by title" });

// ---------------------------------------------------------------------------

test.describe("search", () => {
  // `beforeEach` inside a describe runs before each test in this group only.
  // It can use fixtures too: here we seed three posts for every search test.
  test.beforeEach(async ({ posts }) => {
    await posts.create({ title: "Learning Playwright" });
    await posts.create({ title: "Next.js tips" });
    await posts.create({ title: "Playwright fixtures" });
  });

  test("filters by title as you type and updates the URL", async ({ page }) => {
    await page.goto("/");
    await expect(items(page)).toHaveCount(3);

    // The input waits 300ms after the last keystroke before searching.
    // We don't sleep 300ms ourselves: the assertions below simply retry
    // until the URL and the list have caught up.
    await searchBox(page).fill("playwright");

    // Search is case-insensitive (Postgres ILIKE on the server).
    await expect(page).toHaveURL("/?search=playwright");
    await expect(items(page)).toHaveCount(2);
    await expect(card(page, "Learning Playwright")).toBeVisible();
    await expect(card(page, "Playwright fixtures")).toBeVisible();
    await expect(card(page, "Next.js tips")).toHaveCount(0);
  });

  test("shows a friendly message when nothing matches", async ({ page }) => {
    await page.goto("/");
    await searchBox(page).fill("zzz");

    await expect(page.getByText('No posts match "zzz".')).toBeVisible();
    await expect(items(page)).toHaveCount(0);
  });

  test("clearing the search shows everything again", async ({ page }) => {
    // Start directly in the "searched" state via the URL.
    await page.goto("/?search=next");
    // The search box is filled in from the URL.
    await expect(searchBox(page)).toHaveValue("next");
    await expect(items(page)).toHaveCount(1);

    await searchBox(page).clear();
    await expect(page).toHaveURL("/");
    await expect(items(page)).toHaveCount(3);
  });

  test("special characters are matched literally", async ({ page, posts }) => {
    // `%` and `_` are wildcards in SQL LIKE; the API escapes them. Without
    // that, searching "100%" would match every title that contains "100".
    await posts.create({ title: "100% done" });
    await posts.create({ title: "1000 things" });

    await page.goto("/");
    await searchBox(page).fill("100%");

    // URLSearchParams encodes "%" as "%25".
    await expect(page).toHaveURL("/?search=100%25");
    await expect(items(page)).toHaveCount(1);
    await expect(card(page, "100% done")).toBeVisible();
  });
});

test.describe("pagination", () => {
  // The list shows 10 posts per page. Created "Post 1" … "Post 12", newest
  // first, so page 1 = Post 12 … Post 3 and page 2 = Post 2, Post 1.
  let created: Post[];
  test.beforeEach(async ({ posts }) => {
    created = await posts.createMany(12);
  });

  test("moves between pages with Next and Previous", async ({ page }) => {
    await page.goto("/");

    await expect(pageInfo(page)).toContainText("Page 1 of 2 · 12 posts");
    await expect(items(page)).toHaveCount(10);
    // `.first()` / `.nth(i)` pick one element out of many matches.
    await expect(items(page).first()).toContainText("Post 12");
    await expect(
      page.getByRole("button", { name: "← Previous" }),
    ).toBeDisabled();

    await page.getByRole("button", { name: "Next →" }).click();

    await expect(page).toHaveURL("/?page=2");
    await expect(pageInfo(page)).toContainText("Page 2 of 2");
    // `toHaveText` with an array checks every match, in order.
    await expect(items(page).getByRole("heading")).toHaveText([
      "Post 2",
      "Post 1",
    ]);
    await expect(page.getByRole("button", { name: "Next →" })).toBeDisabled();

    await page.getByRole("button", { name: "← Previous" }).click();
    await expect(page).toHaveURL("/");
    await expect(items(page)).toHaveCount(10);
  });

  test("a page in the URL survives a reload", async ({ page }) => {
    await page.goto("/?page=2");
    await expect(pageInfo(page)).toContainText("Page 2 of 2");

    await page.reload();
    await expect(pageInfo(page)).toContainText("Page 2 of 2");
    await expect(items(page)).toHaveCount(2);
  });

  test("searching jumps back to page 1", async ({ page }) => {
    await page.goto("/?page=2");
    await expect(pageInfo(page)).toContainText("Page 2 of 2");

    // "Post 1" matches Post 1, Post 10, Post 11 and Post 12.
    await searchBox(page).fill("Post 1");
    await expect(page).toHaveURL("/?search=Post+1");
    await expect(items(page)).toHaveCount(4);
    // Only 4 results fit on one page, so no pagination bar.
    await expect(pageInfo(page)).toHaveCount(0);
  });

  test("clicking a card opens that post", async ({ page }) => {
    await page.goto("/");
    // Clicking the heading clicks the link wrapping it.
    await card(page, "Post 7").getByRole("heading").click();

    const post7 = created.find((p) => p.title === "Post 7")!;
    await expect(page).toHaveURL(`/posts/${post7.id}`);
    await expect(page.getByRole("heading", { name: "Post 7" })).toBeVisible();
  });
});

test.describe("card actions", () => {
  test("removes the card after confirming", async ({ page, posts }) => {
    await posts.createMany(3);
    await page.goto("/");
    await expect(items(page)).toHaveCount(3);

    // `page.on` (not `once`) accepts EVERY dialog until the test ends.
    page.on("dialog", (dialog) => dialog.accept());

    // Scope the button to one card. The page has three "Delete" buttons, and
    // Playwright's "strict mode" throws if a locator you act on matches more
    // than one element, rather than guessing which one you meant.
    await card(page, "Post 2").getByRole("button", { name: "Delete" }).click();

    await expect(items(page)).toHaveCount(2);
    await expect(card(page, "Post 2")).toHaveCount(0);
  });

  test("deleting the last post on a page goes back a page", async ({
    page,
    posts,
  }) => {
    // 11 posts → page 2 holds just one: "Post 1".
    await posts.createMany(11);
    await page.goto("/?page=2");
    await expect(items(page)).toHaveCount(1);

    page.on("dialog", (dialog) => dialog.accept());
    await card(page, "Post 1").getByRole("button", { name: "Delete" }).click();

    // Page 2 no longer exists, so we're sent back to page 1. With 10 posts
    // left there's only one page, and the pagination bar disappears.
    await expect(page).toHaveURL("/");
    await expect(items(page)).toHaveCount(10);
    await expect(pageInfo(page)).toHaveCount(0);
  });

  test("the Edit link on a card opens the edit form", async ({
    page,
    posts,
  }) => {
    const post = await posts.create({ title: "Edit me", content: "Body" });
    await page.goto("/");

    // `exact: true` matters here. By default `name` is a case-insensitive
    // SUBSTRING match, and the card's main link is named after everything
    // inside it ("Edit me Body Nov 20, …"), which also contains "Edit".
    // Two matches → strict mode error. `exact` means "the whole name, exactly".
    await card(page, "Edit me")
      .getByRole("link", { name: "Edit", exact: true })
      .click();

    await expect(page).toHaveURL(`/posts/${post.id}/edit`);
    await expect(page.getByRole("textbox", { name: "Title" })).toHaveValue(
      "Edit me",
    );
  });
});
