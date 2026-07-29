# syntax=docker/dockerfile:1

FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.15.4 --activate
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY apps/web/package.json ./apps/web/
COPY apps/worker/package.json ./apps/worker/
COPY packages/db/package.json ./packages/db/
COPY packages/shared/package.json ./packages/shared/
COPY packages/rbac/package.json ./packages/rbac/
COPY packages/notifications/package.json ./packages/notifications/
COPY packages/ai/package.json ./packages/ai/
RUN pnpm install --frozen-lockfile

FROM base AS runner
ENV NODE_ENV=production
WORKDIR /app
COPY --from=deps /app ./
COPY apps/worker ./apps/worker
COPY packages/db ./packages/db
COPY packages/shared ./packages/shared
WORKDIR /app/apps/worker
CMD ["node", "src/main.js"]
