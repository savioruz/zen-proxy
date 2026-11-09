# Running zen-proxy with Docker & Docker Compose

This directory contains configuration files for deploying **zen-proxy** via Docker and Docker Compose.

## Prerequisites

- [Docker](https://docs.docker.com/get-docker/) installed and running
- [Docker Compose](https://docs.docker.com/compose/) v2 or later

---

## Quick Start with Docker Compose

1. **Navigate to the `contrib` folder:**
   ```bash
   cd contrib
   ```

2. **(Optional) Configure environment variables:**
   ```bash
   cp .env.example .env
   ```

3. **Start the container:**
   ```bash
   docker compose up -d
   ```

   > **Note:** By default, docker compose will attempt to pull the pre-built image from GHCR (`ghcr.io/savioruz/zen-proxy:latest`). If building from local source, run:
   > ```bash
   > docker compose up -d --build
   > ```

4. **Verify it is running:**
   ```bash
   docker compose ps
   curl -i http://localhost:8787/health
   ```

5. **Open the Dashboard:**
   Visit [http://localhost:8787/ui](http://localhost:8787/ui) in your browser.

6. **Stop the container:**
   ```bash
   docker compose down
   ```

---

## Data Persistence

Configuration changes made through the web UI (or initial setup) are stored in `./data/zen-proxy.json`.
The `./data` directory is mounted into the container at `/app/data`, ensuring your API keys, models, proxy pool settings, and preferences persist across container restarts and image updates without file-lock or inode detachment issues.

---

## Outbound Proxy Pool (ala 9router)

To route outbound requests through external HTTP/HTTPS proxies, either configure them directly in the Web UI under the **Proxy Pool** tab, or set the `PROXY_POOL` variable in `.env`:

```env
PROXY_POOL=http://user:pass@proxy1.example.com:8080,http://proxy2.example.com:8080
PROXY_STRATEGY=round-robin
```

---

## Running with Docker Directly (CLI)

```bash
docker run -d \
  --name zen-proxy \
  --restart unless-stopped \
  -p 8787:8787 \
  -v "$(pwd)/data:/app/data" \
  ghcr.io/savioruz/zen-proxy:latest
```
