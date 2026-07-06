# syntax=docker/dockerfile:1.7

# ---------- Build stage ----------
FROM oven/bun:1.1-alpine AS build
WORKDIR /app

# Install deps first (better layer caching)
COPY package.json bun.lock* bun.lockb* ./
RUN bun install --frozen-lockfile || bun install

# Copy the rest of the source and build
COPY . .

# Build TanStack Start with the Node server preset (default is Cloudflare Workers).
ENV NITRO_PRESET=node-server
RUN bun run build

# ---------- Runtime stage ----------
FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0

# Copy the Nitro-generated Node server output
COPY --from=build /app/.output ./.output
COPY --from=build /app/package.json ./package.json

EXPOSE 3000
CMD ["node", ".output/server/index.mjs"]