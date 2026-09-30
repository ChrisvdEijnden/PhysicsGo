# PhysicsGo

A physics modeling environment for secondary schools: students write numerical models, run them, and compare the results with measurements from video. Teachers manage classes, publish projects and review handed-in work.

- `src/`: the web app (React, TypeScript, Vite)
- `server/`: the API (Express, SQLite), which stores accounts, classes, projects and student work
- `InterpreterGo/`: the modeling-language interpreter (Rust), compiled to WebAssembly for the app
- `src-tauri/`: the desktop shell (Tauri)

## Prerequisites

- **Node.js 22.18** or newer (Node loads the TypeScript Vite config itself)
- **pnpm 10** ([pnpm.io](https://pnpm.io/installation), or `corepack enable`, which picks the version from `package.json`)
- **Rust** ([rustup.rs](https://rustup.rs)) with the WebAssembly target, plus **wasm-pack**:

  ```sh
  rustup target add wasm32-unknown-unknown
  cargo install wasm-pack
  ```

## Getting started

```sh
pnpm install   # the web app and the API (one pnpm workspace, one lockfile)
pnpm dev:all   # API on :3001 and the app on http://localhost:1420
```

`pnpm dev` and `pnpm build` compile the interpreter into `src/wasm` first when it's missing or older than its Rust sources. `pnpm build:wasm` forces a rebuild. `src/wasm` is generated and isn't committed.

The app sends `/api` requests to the API through Vite's proxy, so both have to run. `pnpm dev` starts only the app; `pnpm --filter server dev` only the API.

Use pnpm rather than npm: `pnpm-lock.yaml` is the only lockfile.

### The first teacher and administrator

Students join with a class code (or the join link and QR code on the Classes page), and teachers sign up with an invitation code. Create the first invitation from the command line, sign up with it, and make that account an administrator:

```sh
node server/create-teacher-code.js      # one use; pass a number for more
node server/make-admin.js <email>       # --remove takes it away again
```

Open the app, choose "No account yet? Use a class code" and enter the invitation code. From then on, administrators do the rest on the Administration page (in the account menu): invite teachers, find accounts, change roles, make password reset codes, and deactivate or delete accounts.

`node server/reset-password.js <email>` still prints a reset code, for when no administrator can sign in.

## Checks

```sh
pnpm test                                            # unit tests (src/**/*.test.ts) and API tests (server/test)
cargo test --manifest-path InterpreterGo/Cargo.toml  # interpreter tests
pnpm exec tsc --noEmit                               # type-check the app
pnpm build                                           # production build into dist/
```

The API tests start their own server on a temporary database, so they don't touch yours. GitHub Actions runs all of these on every push to `main` and on pull requests (`.github/workflows/ci.yml`).

## Server configuration

Set these environment variables for the API (all optional):

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `3001` | Port the API listens on |
| `NODE_ENV` | | `production` makes the session cookie `Secure` (HTTPS only) |
| `TRUST_PROXY` | | Behind a reverse proxy: the number of proxies in front (usually `1`) or their addresses, so rate limits see the real client IP |
| `SESSION_IDLE_HOURS` | `8` | A session ends after this many hours without use |
| `PHYSICSGO_DB` | `server/physicsgo.db` | SQLite database file |
| `PHYSICSGO_MEDIA_DIR` | `server/media` | Where uploaded videos and photos are stored |
| `PHYSICSGO_MEDIA_MAX_MB` | `200` | Largest upload |
| `PHYSICSGO_MEDIA_QUOTA_MB` | `2048` | Storage per account |
| `ACCOUNT_RETENTION_DAYS` | `730` | Accounts not used for this many days are deleted (administrators, and teachers who are a class's only teacher, are kept); `0` keeps them |

The database and media folder hold student data; neither is committed. What is stored and for how long is described for schools in [docs/privacy.md](docs/privacy.md), and for students and teachers in the app's privacy statement (`#/privacy`).

## Desktop app

`pnpm tauri dev` starts the Tauri shell around the dev server. The desktop app still needs the API running and reachable at `/api`. Its version is read from `package.json`.

## Recommended editor setup

[VS Code](https://code.visualstudio.com/) with the [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) and [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer) extensions.
