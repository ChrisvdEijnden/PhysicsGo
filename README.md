# PhysicsGo

Computer modeling and video analysis for secondary-school physics. Students write models in a small
Dutch-keyword language (`als`, `stop als`), run them, graph the results and compare them with points
measured in videos; teachers manage classes, publish projects and review what students hand in.

- `src/` — the web app (React + TypeScript, Vite)
- `server/` — the API (Express + SQLite)
- `InterpreterGo/` — the modeling language (Rust, compiled to WebAssembly into `src/wasm`)
- `src-tauri/` — desktop shell (Tauri)

## Requirements

- Node.js 20 or newer and [pnpm](https://pnpm.io) for the app; npm for the server
- Rust ([rustup.rs](https://rustup.rs)) and wasm-pack (`cargo install wasm-pack`) for the interpreter

## Getting started

```sh
pnpm install              # the app
npm --prefix server install   # the API
pnpm dev:all              # API on :3001 and the app on http://localhost:1420
```

`pnpm dev` and `pnpm build` first build the interpreter into `src/wasm` when it's missing or out of
date (`scripts/check-wasm.mjs`); `pnpm build:wasm` builds it by hand.

## Accounts

Everyone signs up with a code. The first teacher needs an invitation from the server:

```sh
cd server
node create-teacher-code.js        # prints a one-use teacher invitation code
node reset-password.js <email>     # a one-time code to set a new password (e.g. for a teacher)
```

Teachers create classes in the app; each class has a code students sign up or join with.

## Server settings

| Variable | Default | |
|---|---|---|
| `PORT` | `3001` | |
| `PHYSICSGO_DB` | `server/physicsgo.db` | SQLite database; migrations run on start |
| `PHYSICSGO_MEDIA_DIR` | `server/media` | uploaded videos and photos |
| `PHYSICSGO_MEDIA_MAX_MB` | `200` | largest upload |
| `PHYSICSGO_MEDIA_QUOTA_MB` | `2048` | storage per account |
| `SESSION_IDLE_HOURS` | `8` | signed out after this long without use |
| `TRUST_PROXY` | off | behind a reverse proxy: number of proxies (e.g. `1`) |
| `NODE_ENV` | | `production` makes session cookies HTTPS-only |

## Checks

```sh
pnpm exec tsc --noEmit                   # types
cd InterpreterGo && cargo test --lib     # the modeling language
```
