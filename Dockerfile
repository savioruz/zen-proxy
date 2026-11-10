FROM oven/bun:1-alpine

LABEL org.opencontainers.image.title="zen-proxy" \
      org.opencontainers.image.description="Zero-dependency local proxy unlocking OpenCode Zen free models" \
      org.opencontainers.image.licenses="MIT"

WORKDIR /app

# Ensure data directory exists with correct permissions for non-root bun user
RUN mkdir -p /app/data && chown -R bun:bun /app

# Copy application files
COPY --chown=bun:bun package.json zen-proxy.mjs models.json agent-tools.json agent-preamble.txt ./
COPY --chown=bun:bun public ./public
COPY --chown=bun:bun assets ./assets
COPY --chown=bun:bun claude ./claude

USER bun

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=8787 \
    ZEN_PROXY_CONFIG=/app/data/zen-proxy.json

VOLUME ["/app/data"]

EXPOSE 8787

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD ["bun", "-e", "fetch('http://127.0.0.1:8787/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]

CMD ["bun", "zen-proxy.mjs"]
