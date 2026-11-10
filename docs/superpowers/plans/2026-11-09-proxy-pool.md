# Proxy Pool Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement an outbound HTTP/HTTPS Proxy Pool with Round-Robin & Auto-Failover routing for zen-proxy, including Web UI dashboard management and automated tests.

**Architecture:** Build a zero-dependency proxy dispatcher using Node.js built-in `node:http`, `node:https`, `node:tls`, and `node:net` modules that plugs into global `fetch({ dispatcher })`. Add stateful pool management supporting Round-Robin and Fallback routing strategies with circuit breaking on 429/network errors. Expose management endpoints via `/api/config` and `/api/proxy/test`, and add a dedicated "Proxy Pool" tab in the web UI.

**Tech Stack:** Node.js (>= 18, ESM, zero npm dependencies), vanilla HTML5/CSS/JS web dashboard, Node test runner (`node:test`).

**Spec:** `docs/proxy-pool-design.md`

## Global Constraints
- Zero external npm dependencies (keep `package.json` zero dependencies).
- Strict backward compatibility: if no proxy pool is configured, behavior is identical to existing zen-proxy direct connection.
- Mask proxy credentials (`http://user:password@host`) in all API responses, web UI, and logs.
- Support both plain HTTP and HTTPS CONNECT tunneling for outbound requests.

---

### Task 1: Proxy Pool Engine & Zero-Dependency Dispatcher

**Files:**
- Modify: `zen-proxy.mjs`
- Test: `test/proxy-pool.test.mjs`

**Interfaces:**
- Produces:
  - `parseProxyUrl(rawUrl)` -> `{ id, url, protocol, hostname, port, auth, enabled, status, failCount }`
  - `createProxyDispatcher(proxyUrl)` -> Dispatcher object compatible with `fetch({ dispatcher })`
  - `getOutboundDispatcher()` -> `{ dispatcher, proxy }` or `null`
  - `reportProxyResult(proxy, success, status)` -> Updates proxy stats and circuit-breaker state

- [ ] **Step 1.1: Write failing test for proxy URL parsing and masking**
- [ ] **Step 1.2: Implement `parseProxyUrl` and credential masking**
- [ ] **Step 1.3: Write failing test for `createProxyDispatcher` (HTTP forward & HTTPS CONNECT)**
- [ ] **Step 1.4: Implement `createProxyDispatcher` using `node:http`, `node:https`, `node:tls`, and `node:net`**
- [ ] **Step 1.5: Write failing test for pool rotation (Round-Robin & Fallback on 429/error)**
- [ ] **Step 1.6: Implement pool manager with Round-Robin, Fallback, and failure tracking**
- [ ] **Step 1.7: Run test suite and ensure all pass**

---

### Task 2: Upstream Integration & API Endpoints

**Files:**
- Modify: `zen-proxy.mjs`
- Test: `test/proxy-pool.test.mjs`

**Interfaces:**
- Updates:
  - `DEFAULT_CONFIG` with `proxyPool`, `proxyStrategy`, `proxyRetryLimit`
  - `handleApiConfig` to sanitize and save proxy settings
  - `handleMessages`, `handleChat`, `probeModel`, `handleTest` to use `getOutboundDispatcher()`
  - Add route `POST /api/proxy/test` to test individual proxies

- [ ] **Step 2.1: Write failing test for `/api/config` GET/PUT with proxy pool**
- [ ] **Step 2.2: Implement config loading, sanitization, and updating for `proxyPool`**
- [ ] **Step 2.3: Write failing test for `POST /api/proxy/test`**
- [ ] **Step 2.4: Implement `handleTestProxy` endpoint**
- [ ] **Step 2.5: Wire `getOutboundDispatcher()` into `handleMessages`, `handleChat`, `probeModel`, `handleTest`**
- [ ] **Step 2.6: Run tests and ensure all pass**

---

### Task 3: Dashboard Web UI Integration

**Files:**
- Modify: `public/index.html`
- Modify: `zen-proxy.mjs` (serve UI)
- Test: `test/wrapper.test.mjs`

**Interfaces:**
- Produces:
  - New tab `<button data-tab="proxies">Proxy Pool</button>`
  - Section `<section class="tab" id="tab-proxies">` with:
    - Proxy list table with status badges (Active, Degraded, Disabled)
    - Add Proxy form with URL input and "Add Proxy" button
    - "Test" button per row that calls `/api/proxy/test`
    - Strategy selector (Round-Robin vs Fallback)
    - Save button

- [ ] **Step 3.1: Add HTML markup for Proxy Pool tab and panel**
- [ ] **Step 3.2: Add CSS styling matching dashboard theme (neobrutalist/paper palette)**
- [ ] **Step 3.3: Implement JavaScript handlers in `index.html` for loading, adding, deleting, testing, and toggling proxies**
- [ ] **Step 3.4: Verify dashboard UI rendering and static test suites**

---

### Task 4: Documentation & Compose Config Update

**Files:**
- Modify: `README.md`
- Modify: `contrib/.env.example`
- Modify: `contrib/README.md`

- [ ] **Step 4.1: Update `README.md` with Proxy Pool documentation**
- [ ] **Step 4.2: Update `contrib/.env.example` and `contrib/README.md` with `PROXY_POOL` variable**
- [ ] **Step 4.3: Run full project test suite (`npm test`)**
