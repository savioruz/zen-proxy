FROM node:alpine

LABEL org.opencontainers.image.title="zen-proxy" \
      org.opencontainers.image.description="Zero-dependency local proxy unlocking OpenCode Zen free models" \
      org.opencontainers.image.licenses="MIT"

WORKDIR /app

# Ensure data directory exists with correct permissions for non-root user
RUN mkdir -p /app/data && chown -R node:node /app

# Copy application files
COPY --chown=node:node package.json zen-proxy.mjs models.json agent-tools.json agent-preamble.txt ./
COPY --chown=node:node public ./public
COPY --chown=node:node assets ./assets
COPY --chown=node:node claude ./claude

USER node

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=8787 \
    ZEN_PROXY_CONFIG=/app/data/zen-proxy.json

VOLUME ["/app/data"]

EXPOSE 8787

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -q --spider http://127.0.0.1:8787/health || exit 1

CMD ["node", "zen-proxy.mjs"]
