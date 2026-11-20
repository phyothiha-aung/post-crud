/**
 * The main user journeys: create, read, update and delete a post.
 *
 * Three ideas you'll see over and over:
 *
 * 1. LOCATORS find elements the way a user would: by role and visible name
 *    (`getByRole("button", { name: "Create post" })`), not by CSS classes. If
 *    a locator is hard to write, the page is often hard to use with a screen
 *    reader too, so it's a useful signal.
 *
 * 2. AUTO-WAITING. `click()`, `fill()` and friends wait until the element is
 *    visible, enabled and stable before acting. `await expect(locator)...`
 *    assertions keep retrying (5s by default) until they pass. So you almost
 *    never need `waitForTimeout(…)`; a fixed sleep is slow and still flaky.
 *
 * 3. Always `await` both actions and `expect(...)`. A missing `await` is the
 *    #1 Playwright bug: the test moves on before the check has finished.
 *
 * Tip: `npx playwright codegen http://localhost:3000` opens a browser and
 * writes locator code as you click around. Handy for learning.
 */
import { expect, test } from "./fixtures";

// The largest id Postgres `int4` can hold: a valid id that will never exist.
const MISSING_ID = 2147483647;

// `test.describe` just groups tests. The name shows up in the report.
test.describe("creating a post", () => {
  // No `posts` argument needed: the auto fixture in fixtures.ts has already
  // emptied the database before this test starts.
  test("from the empty list to the new post's page", async ({ page }) => {
    // `page.goto` is relative to `baseURL` from playwright.config.ts.
    await page.goto("/");
    await expect(
      page.getByText("No posts yet. Create your first one."),
    ).toBeVisible();

    // "+ New post" is a <Link>, so its role is "link", not "button".
    await page.getByRole("link", { name: "+ New post" }).click();

    // Client-side navigation is async, so assert on the URL, which retries.
    await expect(page).toHaveURL("/posts/new");
    await expect(page).toHaveTitle("New post · Posts");

    // Why getByRole("textbox") rather than getByLabel("Title")?
    // Next keeps recently visited pages mounted but hidden (React <Activity>).
    // Role locators skip hidden elements by default; some other locators
    // don't, and would complain that "Title" matched two inputs.
    const title = page.getByRole("textbox", { name: "Title" });
    const content = page.getByRole("textbox", { name: /Content/ }); // label is "Content (optional)"

    // The title input has `autoFocus`; checking it catches regressions.
    await expect(title).toBeFocused();

    // `fill` clears the field, then types the whole value in one go.
    // (`pressSequentially` types key by key if you need real keystrokes.)
    await title.fill("My first e2e post");
    await content.fill("Written by a robot.\nSecond line.");
    await page.getByRole("button", { name: "Create post" }).click();

    // We land on /posts/<new id>. A regex matches any id.
    await expect(page).toHaveURL(/\/posts\/\d+$/);
    await expect(
      page.getByRole("heading", { name: "My first e2e post" }),
    ).toBeVisible();
    // Content is shown with `whitespace-pre-wrap`, so newlines are kept.
    await expect(
      page.getByText(/Written by a robot\.\s+Second line\./),
    ).toBeVisible();

    // Back on the list, the new post is there.
    await page.getByRole("link", { name: /All posts/ }).click();
    await expect(page).toHaveURL("/");
    await expect(
      page.getByRole("heading", { name: "My first e2e post" }),
    ).toBeVisible();
  });

  test("shows a validation error when the title is blank", async ({ page }) => {
    await page.goto("/posts/new");

    const title = page.getByRole("textbox", { name: "Title" });
    await title.fill("   "); // only spaces: the form trims it to empty
    await page.getByRole("button", { name: "Create post" }).click();

    await expect(page.getByText("Title is required")).toBeVisible();
    // Check accessibility too: the input is marked invalid for screen readers.
    await expect(title).toHaveAttribute("aria-invalid", "true");
    // And we did NOT navigate away.
    await expect(page).toHaveURL("/posts/new");

    // Prove nothing was saved by asking the API directly.
    // `page.request` is an HTTP client that shares the page's cookies.
    const res = await page.request.get("/api/posts");
    expect((await res.json()).meta.total).toBe(0);
  });

  test("Cancel goes back to the list without saving", async ({ page }) => {
    await page.goto("/posts/new");
    await page.getByRole("textbox", { name: "Title" }).fill("Never saved");
    await page.getByRole("link", { name: "Cancel" }).click();

    await expect(page).toHaveURL("/");
    await expect(
      page.getByText("No posts yet. Create your first one."),
    ).toBeVisible();
  });
});

test.describe("viewing a post", () => {
  test("shows title, content and a placeholder when content is empty", async ({
    page,
    posts,
  }) => {
    // Arrange through the API (fast), then act and assert through the UI.
    const withBody = await posts.create({
      title: "Has body",
      content: "Hello",
    });
    const empty = await posts.create({ title: "No body" });

    await page.goto(`/posts/${withBody.id}`);
    await expect(page.getByRole("heading", { name: "Has body" })).toBeVisible();
    await expect(page.getByText("Hello")).toBeVisible();

    await page.goto(`/posts/${empty.id}`);
    await expect(page.getByRole("heading", { name: "No body" })).toBeVisible();
    await expect(page.getByText("No content.")).toBeVisible();
  });

  // `for` + `test` makes one test per case. They show up separately in the
  // report, so you can see exactly which input failed.
  for (const id of [String(MISSING_ID), "abc"]) {
    test(`shows "Post not found." for /posts/${id}`, async ({ page }) => {
      await page.goto(`/posts/${id}`);
      await expect(page.getByText("Post not found.")).toBeVisible();
    });
  }
});

test.describe("editing a post", () => {
  test("saves changes and marks the post as edited", async ({
    page,
    posts,
  }) => {
    const post = await posts.create({ title: "Before", content: "Old body" });

    await page.goto(`/posts/${post.id}`);
    // A freshly created post has not been edited yet.
    // `not.toBeVisible()` also retries, until the element is gone or hidden.
    await expect(page.getByText(/Edited/)).not.toBeVisible();

    // `exact: true`: the whole name must be "Edit" (see post-list.spec.ts).
    await page.getByRole("link", { name: "Edit", exact: true }).click();
    await expect(page).toHaveURL(`/posts/${post.id}/edit`);

    const title = page.getByRole("textbox", { name: "Title" });
    const content = page.getByRole("textbox", { name: /Content/ });

    // The form loads the post, then fills the fields. `toHaveValue` waits.
    await expect(title).toHaveValue("Before");
    await expect(content).toHaveValue("Old body");

    await title.fill("After");
    // Emptying content saves it as null, which shows "No content.".
    await content.fill("");
    await page.getByRole("button", { name: "Save changes" }).click();

    await expect(page).toHaveURL(`/posts/${post.id}`);
    await expect(page.getByRole("heading", { name: "After" })).toBeVisible();
    await expect(page.getByText("No content.")).toBeVisible();
    await expect(page.getByText(/· Edited/)).toBeVisible();

    // Double-check the database through the API, not just the screen.
    const res = await page.request.get(`/api/posts/${post.id}`);
    expect((await res.json()).data).toMatchObject({
      title: "After",
      content: null,
    });
  });

  test("survives a page reload (the data comes from the server)", async ({
    page,
    posts,
  }) => {
    const post = await posts.create({ title: "Reload me" });
    await page.goto(`/posts/${post.id}/edit`);
    await expect(page.getByRole("textbox", { name: "Title" })).toHaveValue(
      "Reload me",
    );

    await page.reload();
    await expect(page.getByRole("textbox", { name: "Title" })).toHaveValue(
      "Reload me",
    );
  });
});

test.describe("deleting a post from its page", () => {
  // The app asks with the browser's native `confirm()` dialog. By default
  // Playwright auto-DISMISSES dialogs (like clicking "Cancel"). To answer
  // it ourselves, register a handler BEFORE the click that opens it.

  test("asks for confirmation, then deletes and returns to the list", async ({
    page,
    posts,
  }) => {
    const post = await posts.create({ title: "Doomed" });
    await page.goto(`/posts/${post.id}`);

    // `once` = handle only the next dialog, then stop listening.
    page.once("dialog", async (dialog) => {
      expect(dialog.type()).toBe("confirm");
      expect(dialog.message()).toBe(`Delete "Doomed"? This can't be undone.`);
      await dialog.accept(); // click "OK"
    });
    await page.getByRole("button", { name: "Delete" }).click();

    await expect(page).toHaveURL("/");
    await expect(
      page.getByText("No posts yet. Create your first one."),
    ).toBeVisible();

    // The API agrees it's gone.
    expect((await page.request.get(`/api/posts/${post.id}`)).status()).toBe(
      404,
    );
  });

  test("keeps the post when the dialog is cancelled", async ({
    page,
    posts,
  }) => {
    const post = await posts.create({ title: "Survivor" });
    await page.goto(`/posts/${post.id}`);

    page.once("dialog", (dialog) => dialog.dismiss()); // click "Cancel"
    await page.getByRole("button", { name: "Delete" }).click();

    // Nothing changed: same URL, post still there.
    await expect(page).toHaveURL(`/posts/${post.id}`);
    await expect(page.getByRole("heading", { name: "Survivor" })).toBeVisible();
    await expect(await page.request.get(`/api/posts/${post.id}`)).toBeOK();
  });
});
