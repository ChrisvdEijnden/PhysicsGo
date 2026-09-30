import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import monacoEditorPlugin from 'vite-plugin-monaco-editor';
// @ts-expect-error type error without @types/node package
import process from "node:process";
import pkg from "./package.json" with { type: "json" };
const host = process.env.TAURI_DEV_HOST;

export default defineConfig(() => ({
    plugins: [
        react(),
        // @ts-expect-error - plugin type definitions might need a bypass
        monacoEditorPlugin.default({})
    ],
    // Shown on the sign-in pages, so the version is only kept in package.json
    define: { __APP_VERSION__: JSON.stringify(pkg.version) },
    clearScreen: false,
    server: {
        port: 1420,
        proxy: { "/api": "http://localhost:3001" },
        strictPort: true,
        host: host || false,
        hmr: host
            ? {
                protocol: "ws",
                host,
                port: 1421,
            }
            : undefined,
        watch: {
            ignored: ["**/src-tauri/**"],
        },
    },
}));