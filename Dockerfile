FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN npm ci
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/* && npm run db:generate && npm run build

FROM node:24-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
ARG RUNTIME_UID=10001
ARG RUNTIME_GID=10001
RUN groupmod -g "$RUNTIME_GID" node && usermod -u "$RUNTIME_UID" -g "$RUNTIME_GID" node
COPY --from=build /app /app
# Keep code and browsers root-owned; only runtime data/cache need write access.
RUN npx playwright install --with-deps chromium \
    && mkdir -p /app/.private-files /app/apps/web/.next/cache \
    && chown -R node:node /app/.private-files /app/apps/web/.next/cache
USER node
CMD ["node", "apps/api/dist/src/main.js"]
