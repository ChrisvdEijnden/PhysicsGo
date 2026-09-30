// Linting (pnpm lint, and in CI): mistakes, not formatting. The app is TypeScript + React; the
// server and scripts are plain JavaScript on Node.
import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

const unused = ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_", destructuredArrayIgnorePattern: "^_", caughtErrors: "none" }];

export default tseslint.config(
    { ignores: ["dist", "src/wasm", "src-tauri", "InterpreterGo", "**/node_modules", "public", "server/media", "server/backups"] },
    {
        files: ["src/**/*.{ts,tsx}", "vite.config.ts"],
        extends: [js.configs.recommended, ...tseslint.configs.recommended],
        languageOptions: { globals: globals.browser },
        plugins: { "react-hooks": reactHooks },
        rules: {
            "react-hooks/rules-of-hooks": "error",
            "react-hooks/exhaustive-deps": "warn",
            "@typescript-eslint/no-unused-vars": unused,
        },
    },
    {
        files: ["server/**/*.js", "scripts/**/*.{js,mjs}"],
        extends: [js.configs.recommended],
        languageOptions: { globals: globals.node },
        rules: { "no-unused-vars": unused },
    },
);
