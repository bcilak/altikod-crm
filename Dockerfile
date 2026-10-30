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
COPY --from=build /app /app
RUN npx playwright install --with-deps chromium && mkdir -p /app/.private-files && chown -R node:node /app /ms-playwright
USER node
CMD ["node", "apps/api/dist/src/main.js"]
