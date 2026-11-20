import { configDefaults, defineConfig } from "vitest/config";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: ".env.test" });

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: "tests/setup.ts",
    // DB-backed tests share one database, so run test files one at a time.
    fileParallelism: false,
    // e2e/ holds Playwright specs; they run with `npm run e2e`, not Vitest.
    exclude: [
      ...configDefaults.exclude,
      "migrations/**",
      "src/**/*.d.ts",
      "e2e/**",
    ],

    coverage: {
      provider: "v8",
      enabled: true,
      include: ["src/**/*.{js,jsx,ts,tsx}"],
      exclude: ["src/**/*.d.ts", "src/prisma/contract.json"],
    },
  },
});
