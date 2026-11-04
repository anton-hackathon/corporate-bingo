# Build context is the REPOSITORY ROOT, not web/, because the task pool
# (tasks.json) lives one level above the application.
#   docker build -f web/Dockerfile .

# ---- dependencies ----
FROM node:22-alpine AS deps
WORKDIR /app
COPY web/package.json web/package-lock.json ./
COPY web/prisma ./prisma
RUN npm ci --ignore-scripts \
 && npm rebuild sharp @prisma/engines \
 && npx prisma generate

# ---- build ----
FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY web/ ./
RUN npx prisma generate && npx next build --no-lint

# ---- runtime ----
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV TASKS_FILE=/app/tasks.json
RUN addgroup -S app && adduser -S app -G app

COPY --from=build /app/public ./public
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static

# Schema, migrations and the generated client. The Prisma CLI is deliberately
# NOT here: it drags in its own dependency tree. Migrations run in the separate
# `migrate` service, which uses the build stage with full node_modules.
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build /app/node_modules/@prisma ./node_modules/@prisma

# The task pool, read by `prisma db seed`.
COPY tasks.json ./tasks.json

RUN mkdir -p /app/.uploads && chown -R app:app /app/.uploads
USER app
EXPOSE 3000
CMD ["node", "server.js"]
