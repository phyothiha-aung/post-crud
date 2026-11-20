/**
 * Playwright config — end-to-end (e2e) tests.
 *
 * Unit tests (Vitest) render one component in a fake DOM (jsdom) with a fake
 * API (MSW). E2E tests are the opposite: a REAL browser talks to the REAL Next
 * server, which talks to a REAL Postgres database. Slower, but it proves the
 * pieces actually work together.
 *
 * Run:  npm run e2e          (headless, all browsers)
 *       npm run e2e:ui       (interactive UI mode — great for learning/debugging)
 *       npm run e2e:report   (open the HTML report of the last run)
 *
 * Docs: https://playwright.dev/docs/test-configuration
 */
import { defineConfig, devices } from "@playwright/test";
import dotenv from "dotenv";

// Load DATABASE_URL for the dedicated e2e database (post_crud_e2e).
// We do NOT reuse .env.test: Vitest's API tests wipe that database, so running
// `npm test` and `npm run e2e` at the same time would make both flaky.
// `quiet: true` just silences dotenv's "injected env" log line.
dotenv.config({ path: ".env.e2e", quiet: true });

// A port that won't collide with your normal `npm run dev` on :3000.
const PORT = 3100;
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  // Where Playwright looks for `*.spec.ts` files.
  testDir: "./e2e",

  // All tests share ONE database, and every test resets it in `beforeEach`.
  // If two tests ran at once, one could delete the other's posts mid-test.
  // So: run test files one after another, in a single worker process.
  // (Bigger apps solve this with per-test data, e.g. unique titles, so they
  // can run in parallel — but serial is the simplest correct choice here.)
  fullyParallel: false,
  workers: 1,

  // On CI, fail if someone committed a `test.only` (it would skip every
  // other test silently).
  forbidOnly: !!process.env.CI,

  // Retry flaky tests on CI only. Locally you want failures to be loud.
  retries: process.env.CI ? 2 : 0,

  // "list" prints each test as it runs in the terminal; "html" writes a
  // browsable report to playwright-report/ (open it with `npm run e2e:report`).
  // `open: "never"` stops it auto-opening a browser tab after failures.
  reporter: [["list"], ["html", { open: "never" }]],

  // Options applied to every test (each `project` below can override them).
  use: {
    // Lets tests write `page.goto("/posts/new")` instead of the full URL.
    baseURL: BASE_URL,

    // A trace is a recording of the test: DOM snapshots, network, console,
    // for each step. Record one only when a failed test is retried, so passing
    // runs stay fast. View it in the HTML report or `npx playwright show-trace`.
    trace: "on-first-retry",

    // Keep a screenshot of the page at the moment a test fails.
    screenshot: "only-on-failure",
  },

  // A "project" = the whole test suite run with a particular setup. Here each
  // project is a browser engine, so every test runs 3 times.
  // Run just one with:  npm run e2e -- --project=chromium
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
  ],

  // Playwright starts the app for us before the tests and stops it after.
  webServer: {
    // A production build is closer to what users get than `next dev`. (Next
    // also refuses to start a second `next dev` in the same folder, and you
    // probably already have one running on :3000.)
    command: `npm run build && npm run start -- --port ${PORT}`,

    // Playwright polls this URL and starts the tests once it responds.
    url: BASE_URL,

    // Point the server at the e2e database. Real env vars win over values in
    // .env, so the app's own `.env` (dev database) is ignored for this run.
    env: { DATABASE_URL: process.env.DATABASE_URL! },

    // Locally, if something is already serving :3100 (e.g. you left
    // `npm run start -- --port 3100` running), reuse it to save the build.
    // On CI always start fresh.
    reuseExistingServer: !process.env.CI,

    // Build + start can take a while on a cold machine.
    timeout: 120_000,
  },
});
