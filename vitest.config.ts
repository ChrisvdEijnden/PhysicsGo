import { defineConfig } from "vitest/config";

// Unit tests for the app's plain logic (no browser needed). Kept apart from vite.config.ts so the
// editor plugin isn't loaded for tests. The API has its own tests in server/test.
export default defineConfig({
    test: {
        include: ["src/**/*.test.ts"],
        environment: "node",
    },
});
