import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import monacoEditorPlugin from 'vite-plugin-monaco-editor';
// @ts-expect-error type error without @types/node package
import process from "node:process";
const host = process.env.TAURI_DEV_HOST;

export default defineConfig(() => ({
    plugins: [
        react(),
        // @ts-expect-error - plugin type definitions might need a bypass
        monacoEditorPlugin.default({})
    ],
    clearScreen: false,
    server: {
        port: 1420,
        roxy: { "/api": "http://localhost:3001" },
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