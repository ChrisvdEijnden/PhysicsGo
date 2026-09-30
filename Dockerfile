# PhysicsGo in one container: the API serves the built web app too (see docs/deployment.md).
#   docker build -t physicsgo .
#   docker run -d -p 3001:3001 -v physicsgo-data:/data --name physicsgo physicsgo

# 1. The modeling interpreter (Rust) compiled to WebAssembly
FROM rust:1-slim AS interpreter
RUN apt-get update && apt-get install -y --no-install-recommends pkg-config libssl-dev \
    && rm -rf /var/lib/apt/lists/* \
    && rustup target add wasm32-unknown-unknown \
    && cargo install wasm-pack --locked
WORKDIR /build
COPY InterpreterGo ./InterpreterGo
RUN wasm-pack build InterpreterGo --release --target web --out-dir /build/wasm

# 2. The web app
FROM node:22-slim AS web
RUN corepack enable
WORKDIR /build
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY server/package.json ./server/
RUN pnpm install --frozen-lockfile
COPY . .
COPY --from=interpreter /build/wasm ./src/wasm
# The interpreter is already built, so this skips ensure-wasm and only type-checks and bundles
RUN pnpm exec tsc && pnpm exec vite build --configLoader native

# 3. What runs: Node, the API's production dependencies, the API and the built app
FROM node:22-slim
RUN corepack enable
ENV NODE_ENV=production \
    PORT=3001 \
    PHYSICSGO_DB=/data/physicsgo.db \
    PHYSICSGO_MEDIA_DIR=/data/media \
    PHYSICSGO_BACKUP_DIR=/data/backups
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY server/package.json ./server/
RUN pnpm install --frozen-lockfile --prod --filter server
COPY server ./server
COPY --from=web /build/dist ./dist
RUN mkdir -p /data && chown node:node /data
USER node
VOLUME /data
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s \
    CMD node -e "fetch('http://localhost:' + process.env.PORT + '/api/health').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"
CMD ["node", "server/index.js"]
