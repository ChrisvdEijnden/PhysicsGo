// Stores a Brotli (.br) and a gzip (.gz) copy next to each built file that compresses well, so the
// server (server/index.js) can send browsers the small copy: the modeling page's code editor goes from
// about 3.4 MB to under 0.7 MB. Done once after `vite build`, so serving costs no CPU.
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { brotliCompressSync, constants, gzipSync } from "node:zlib";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.resolve(root, process.argv[2] ?? "dist");
// Fonts in woff2 and images are compressed already
const COMPRESSIBLE = new Set([".js", ".mjs", ".css", ".html", ".json", ".svg", ".wasm", ".ttf", ".txt"]);
// Below this, compressing doesn't help enough to be worth a second request path
const MIN_BYTES = 1024;

function* files(dir) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) yield* files(full);
        else if (COMPRESSIBLE.has(path.extname(entry.name)) && statSync(full).size >= MIN_BYTES) yield full;
    }
}

let before = 0;
let after = 0;
for (const file of files(dist)) {
    const contents = readFileSync(file);
    const brotli = brotliCompressSync(contents, {
        params: { [constants.BROTLI_PARAM_QUALITY]: constants.BROTLI_MAX_QUALITY, [constants.BROTLI_PARAM_SIZE_HINT]: contents.length },
    });
    const gzip = gzipSync(contents, { level: 9 });
    // Only kept when clearly smaller
    if (brotli.length < contents.length * 0.9) writeFileSync(`${file}.br`, brotli);
    if (gzip.length < contents.length * 0.9) writeFileSync(`${file}.gz`, gzip);
    before += contents.length;
    after += Math.min(contents.length, brotli.length);
}
console.log(`Compressed the built files: ${(before / 1e6).toFixed(1)} MB → ${(after / 1e6).toFixed(1)} MB with Brotli`);
