# Deploying PhysicsGo

PhysicsGo is a web app. One Node.js process runs the API and serves the built app, with a SQLite database and a folder of uploaded photos and videos next to it. Put it behind a reverse proxy that provides HTTPS.

```
browser ──HTTPS──> reverse proxy (Caddy, nginx, …) ──HTTP──> node server/index.js (:3001)
                                                              ├─ dist/          the built app
                                                              ├─ physicsgo.db   accounts, classes, work
                                                              ├─ media/         uploaded photos and videos
                                                              └─ backups/       daily database copies
```

## With Docker

```sh
docker build -t physicsgo .
docker run -d --name physicsgo --restart unless-stopped \
  -p 127.0.0.1:3001:3001 -v physicsgo-data:/data \
  -e TRUST_PROXY=1 physicsgo
```

Everything that has to be kept is in the `/data` volume: the database, `media/` and `backups/`. The container reports its health from `/api/health`.

## Without Docker

Requirements: Node.js 22, pnpm (`corepack enable`), Rust with the `wasm32-unknown-unknown` target and [wasm-pack](https://rustwasm.github.io/wasm-pack/) (the build compiles the modeling interpreter).

```sh
pnpm install --frozen-lockfile
pnpm build                                   # the app, into dist/
NODE_ENV=production TRUST_PROXY=1 PHYSICSGO_DB=/var/lib/physicsgo/physicsgo.db \
  PHYSICSGO_MEDIA_DIR=/var/lib/physicsgo/media PHYSICSGO_BACKUP_DIR=/var/lib/physicsgo/backups \
  node server/index.js
```

Run it as a service (systemd, pm2, …) under its own user that can write to those folders.

## First accounts

```sh
node server/create-teacher-code.js 1 "Your school"   # prints an invitation code (in Docker: docker exec physicsgo node server/create-teacher-code.js …)
# sign up with it in the app, then:
node server/make-admin.js you@school.nl
```

After that, administrators add schools, invite teachers and manage accounts on the Administration page. Without a school name, the invitation is for the only school there is (or a new "Mijn school" when there's none yet).

## Settings

| Variable | Default | Purpose |
| --- | --- | --- |
| `NODE_ENV` | | Set to `production`: the session cookie is then only sent over HTTPS |
| `PORT` | `3001` | Port the server listens on |
| `TRUST_PROXY` | | The number of proxies in front (usually `1`), so rate limits see the real client IP. Leave empty when nothing is in front |
| `PHYSICSGO_DB` | `server/physicsgo.db` | Database file |
| `PHYSICSGO_MEDIA_DIR` | `server/media` | Uploaded photos and videos |
| `PHYSICSGO_BACKUP_DIR` | `server/backups` | Daily database copies |
| `PHYSICSGO_BACKUPS` | `14` | How many daily copies are kept; `0` turns backups off |
| `PHYSICSGO_STATIC` | `dist` | The built app; the server only serves the API when it isn't there |
| `PHYSICSGO_MEDIA_MAX_MB` | `200` | Largest upload |
| `PHYSICSGO_MEDIA_QUOTA_MB` | `2048` | Storage per account |
| `PHYSICSGO_WORK_QUOTA_MB` | `50` | Saved work (code, graphs, points) per account |
| `SESSION_IDLE_HOURS` | `8` | Signed out after this long without use |
| `ACCOUNT_RETENTION_DAYS` | `730` | Unused accounts are deleted after this long; `0` keeps them |
| `AUDIT_RETENTION_DAYS` | `365` | How long the audit log (Administration → Activity) is kept; `0` keeps it |
| `PHYSICSGO_REQUEST_LOG` | | `off` stops the request log on standard output (it has no personal data) |

## HTTPS with a reverse proxy

Caddy gets and renews a certificate by itself:

```
physicsgo.school.nl {
    reverse_proxy 127.0.0.1:3001
}
```

With nginx (certificate from e.g. certbot), allow uploads up to the media limit:

```nginx
server {
    listen 443 ssl;
    server_name physicsgo.school.nl;
    client_max_body_size 200m;
    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

The server sends its own security headers (a Content Security Policy that only allows the app's own files, HSTS, no framing). The build stores Brotli and gzip copies of the app's files, and the server sends those to browsers that accept them, so the proxy doesn't need to compress them again.

## Backups

Once a day the server copies the database into `PHYSICSGO_BACKUP_DIR` (`physicsgo-YYYY-MM-DD.db`, made with SQLite's online backup, so it's consistent while the server runs) and keeps the last 14. Copy that folder and the media folder to another machine as well, for example nightly:

```sh
rsync -a /var/lib/physicsgo/backups/ /var/lib/physicsgo/media/ backup-host:/srv/physicsgo/
```

To restore: stop the server, copy a backup over `PHYSICSGO_DB` (and remove any `-wal`/`-shm` files next to it), put the media folder back, and start the server.

## Updating

Pull the new version and build again (`docker build …` or `pnpm install && pnpm build`), then restart. Database changes run by themselves when the server starts (server/db.js); make a backup first. Browsers pick up the new app on their next page load.

## Monitoring

`GET /api/health` answers `{ "ok": true, "version": "…" }` when the server runs and the database can be read. Errors are written to the process's output (`docker logs physicsgo`).

## The desktop app

The Tauri shell in `src-tauri/` is for development only. PhysicsGo is deployed as a web app: the app expects the API on the same address (`/api`) with a same-site session cookie, which a desktop build doesn't provide.
