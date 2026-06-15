# ── Build stage ──────────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

COPY package*.json ./
# npm install (not ci): the lockfile is generated on macOS/npm 11 and omits
# some linux-only optional deps (rolldown/vitest bindings) that strict `npm ci`
# rejects on this alpine image. install reconciles them for the build platform.
RUN npm install --ignore-scripts --no-audit --no-fund

COPY . .
RUN npx nx build api --configuration=production

# ── Runtime stage ─────────────────────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

# Copy only the compiled output and production node_modules
COPY --from=builder /app/dist/apps/api ./dist
COPY --from=builder /app/node_modules ./node_modules

EXPOSE 3333

CMD ["node", "dist/main.js"]
