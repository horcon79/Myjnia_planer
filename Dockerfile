# syntax=docker/dockerfile:1

# ---------- Stage 1: Dependencies ----------
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ---------- Stage 2: Build ----------
FROM node:22-alpine AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
# Zainstaluj git, aby móc wyliczyć wersję z liczby commitów podczas budowania obrazu
RUN apk add --no-cache git
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Zezwól na odczyt repozytorium git wewnątrz kontenera (omija problem dubious ownership)
RUN git config --global --add safe.directory '*' || true
# Wygeneruj klienta Prisma i zbuduj aplikację
RUN npx prisma generate
RUN npm run build

# ---------- Stage 3: Runtime ----------
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
ENV TZ=Europe/Warsaw
ENV DATABASE_URL=file:/data/myjnia.db

# Użytkownik nie-root; katalog /data na wolumen bazy SQLite
RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nextjs \
  && mkdir -p /data \
  && chown -R nextjs:nodejs /data

# Pełne node_modules (Prisma CLI + klient + tsx do seedu), build i pliki
COPY --from=builder --chown=nextjs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nextjs:nodejs /app/.next ./.next
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma
COPY --from=builder --chown=nextjs:nodejs /app/package.json ./package.json
COPY --from=builder --chown=nextjs:nodejs /app/next.config.ts ./next.config.ts
COPY --from=builder --chown=nextjs:nodejs /app/tsconfig.json ./tsconfig.json
COPY --from=builder --chown=nextjs:nodejs /app/next-env.d.ts ./next-env.d.ts

COPY docker/entrypoint.sh /app/docker/entrypoint.sh
RUN chmod +x /app/docker/entrypoint.sh

USER nextjs
EXPOSE 3000
ENTRYPOINT ["/app/docker/entrypoint.sh"]
