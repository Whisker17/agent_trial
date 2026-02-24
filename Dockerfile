FROM node:22-slim AS base

RUN apt-get update && \
    apt-get install -y --no-install-recommends \
      ca-certificates \
      curl \
      unzip \
      python3 \
      make \
      g++ && \
    curl -fsSL https://bun.sh/install -o /tmp/install-bun.sh && \
    bash /tmp/install-bun.sh && \
    rm /tmp/install-bun.sh && \
    ln -s /root/.bun/bin/bun /usr/local/bin/bun && \
    ln -s /root/.bun/bin/bunx /usr/local/bin/bunx && \
    apt-get clean && rm -rf /var/lib/apt/lists/*


FROM base AS builder

WORKDIR /app

COPY package.json package-lock.json bun.lock ./
RUN npm ci --legacy-peer-deps --no-audit --no-fund

COPY vite.config.ts tailwind.config.js tsconfig.json ./
COPY src ./src
COPY skills ./skills

RUN npx vite build


FROM base

WORKDIR /app

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist/frontend ./dist/frontend
COPY --from=builder /app/package.json ./

COPY src ./src
COPY skills ./skills

ENV NODE_ENV=production
EXPOSE 3000

CMD ["bun", "src/index.ts"]
