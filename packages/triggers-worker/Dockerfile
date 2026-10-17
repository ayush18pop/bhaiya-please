# Arkiv Triggers worker. Build from the REPO ROOT (workspace deps):
#   docker build -f packages/triggers-worker/Dockerfile -t arkiv-triggers-worker .
#   docker run -p 8787:8787 -v triggers-data:/data --env-file .env arkiv-triggers-worker
FROM node:20-slim
ENV NODE_ENV=production \
    PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    TRIGGERS_DATA_DIR=/data \
    TRIGGERS_PORT=8787
RUN corepack enable
WORKDIR /app

# Manifests first for layer caching. Only the packages the worker needs are copied.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY packages/core/package.json packages/core/
COPY packages/triggers/package.json packages/triggers/
COPY packages/triggers-worker/package.json packages/triggers-worker/
RUN pnpm install --frozen-lockfile --filter @arkiv-triggers/worker...

COPY tsconfig.base.json ./
COPY packages/core packages/core
COPY packages/triggers packages/triggers
COPY packages/triggers-worker packages/triggers-worker

RUN mkdir -p /data && chown node:node /data
USER node
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=5s CMD node -e "fetch('http://127.0.0.1:'+(process.env.TRIGGERS_PORT||8787)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
WORKDIR /app/packages/triggers-worker
CMD ["pnpm", "start"]
