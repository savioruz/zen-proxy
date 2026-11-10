import { test, describe, before, after } from "node:test"
import assert from "node:assert/strict"
import http from "node:http"
import https from "node:https"
import tls from "node:tls"
import net from "node:net"
import {
  parseProxyUrl,
  maskProxyUrl,
  createProxyDispatcher,
  ProxyPool,
  handleApiConfig,
  handleTestProxy,
  saveConfig,
  sanitize,
  config,
} from "../zen-proxy.mjs"

function mockReq(over = {}) {
  const body = over._body ?? ""
  return {
    headers: { host: "127.0.0.1:8787", ...over.headers },
    socket: { remoteAddress: over.remoteAddress ?? "127.0.0.1" },
    method: over.method ?? "POST",
    url: over.url ?? "/api/config",
    signal: new AbortController().signal,
    on: () => {},
    destroy: () => {},
    [Symbol.asyncIterator]: async function* () {
      yield body
    },
    ...over,
  }
}

function mockRes() {
  const res = {
    state: { status: 200, headers: {} },
    body: "",
    writeHead(status, headers = {}) {
      res.state.status = status
      res.state.headers = { ...res.state.headers, ...headers }
    },
    setHeader(name, val) {
      res.state.headers[name.toLowerCase()] = val
    },
    end(chunk = "") {
      res.body += chunk
    },
  }
  return res
}

describe("Proxy URL parsing & masking", () => {
  test("parseProxyUrl parses valid HTTP proxy with credentials", () => {
    const parsed = parseProxyUrl("http://alice:secret123@proxy.example.com:8080")
    assert.equal(parsed.protocol, "http:")
    assert.equal(parsed.hostname, "proxy.example.com")
    assert.equal(parsed.port, "8080")
    assert.equal(parsed.auth, "alice:secret123")
    assert.equal(parsed.enabled, true)
    assert.equal(parsed.status, "active")
  })

  test("parseProxyUrl defaults port when missing", () => {
    const httpP = parseProxyUrl("http://proxy.example.com")
    assert.equal(httpP.port, "80")
    const httpsP = parseProxyUrl("https://proxy.example.com")
    assert.equal(httpsP.port, "443")
  })

  test("parseProxyUrl rejects invalid URLs", () => {
    assert.equal(parseProxyUrl("not a url"), null)
    assert.equal(parseProxyUrl("ftp://proxy.example.com"), null)
  })

  test("maskProxyUrl hides password in proxy url", () => {
    const masked = maskProxyUrl("http://alice:supersecret@127.0.0.1:8080")
    assert.equal(masked, "http://alice:***@127.0.0.1:8080")
  })

  test("maskProxyUrl leaves URL without auth untouched", () => {
    const masked = maskProxyUrl("http://127.0.0.1:8080")
    assert.equal(masked, "http://127.0.0.1:8080")
  })
})

describe("Proxy Dispatcher", () => {
  let mockProxyServer
  let mockProxyPort
  let proxyRequests = []
  let connectRequests = []

  before(async () => {
    mockProxyServer = http.createServer((req, res) => {
      proxyRequests.push({ url: req.url, method: req.method, headers: req.headers })
      const u = new URL(req.url)
      const targetReq = http.request({
        host: u.hostname,
        port: u.port,
        path: u.pathname + u.search,
        method: req.method,
        headers: req.headers,
      }, (targetRes) => {
        res.writeHead(targetRes.statusCode, targetRes.headers)
        targetRes.pipe(res)
      })
      req.pipe(targetReq)
    })

    mockProxyServer.on("connect", (req, clientSocket, head) => {
      connectRequests.push({ url: req.url, headers: req.headers })
      const [targetHost, targetPort] = req.url.split(":")
      const serverSocket = net.connect(Number(targetPort || 443), targetHost, () => {
        clientSocket.write("HTTP/1.1 200 Connection Established\r\n\r\n")
        if (head && head.length) serverSocket.write(head)
        serverSocket.pipe(clientSocket)
        clientSocket.pipe(serverSocket)
      })
      serverSocket.on("error", () => clientSocket.end())
      clientSocket.on("error", () => serverSocket.end())
    })

    await new Promise((resolve) => mockProxyServer.listen(0, "127.0.0.1", resolve))
    mockProxyPort = mockProxyServer.address().port
  })

  after(async () => {
    await new Promise((resolve) => mockProxyServer.close(resolve))
  })

  test("dispatches HTTP request through HTTP forward proxy", async () => {
    let targetHits = 0
    const targetServer = http.createServer((req, res) => {
      targetHits++
      res.writeHead(200, { "content-type": "application/json" })
      res.end(JSON.stringify({ ok: true, path: req.url }))
    })
    await new Promise((r) => targetServer.listen(0, "127.0.0.1", r))
    const targetPort = targetServer.address().port

    try {
      const dispatcher = createProxyDispatcher(`http://127.0.0.1:${mockProxyPort}`)
      const res = await fetch(`http://127.0.0.1:${targetPort}/api/hello`, {
        dispatcher,
        proxy: `http://127.0.0.1:${mockProxyPort}`,
      })
      const data = await res.json()
      assert.equal(res.status, 200)
      assert.equal(data.ok, true)
      assert.equal(targetHits, 1)
      assert.ok(proxyRequests.some((r) => r.url.includes(`/api/hello`)))
    } finally {
      await new Promise((r) => targetServer.close(r))
    }
  })

  test("supports legacy onHeaders/onData/onComplete undici handler (Node 18/20/22)", async () => {
    let targetHits = 0
    const targetServer = http.createServer((req, res) => {
      targetHits++
      res.writeHead(200, { "content-type": "application/json" })
      res.end(JSON.stringify({ legacy: true }))
    })
    await new Promise((r) => targetServer.listen(0, "127.0.0.1", r))
    const targetPort = targetServer.address().port

    try {
      const dispatcher = createProxyDispatcher(`http://127.0.0.1:${mockProxyPort}`)
      let headersCalled = false
      let dataChunks = []
      let completeCalled = false

      const legacyHandler = {
        onHeaders(status, headers, resume, statusText) {
          headersCalled = true
          assert.equal(status, 200)
        },
        onData(chunk) {
          dataChunks.push(chunk)
        },
        onComplete() {
          completeCalled = true
        },
        onError(err) {
          assert.fail("should not error: " + err.message)
        },
      }

      dispatcher.dispatch({
        origin: `http://127.0.0.1:${targetPort}`,
        path: "/legacy-test",
        method: "GET",
        headers: {},
      }, legacyHandler)

      await new Promise((r) => setTimeout(r, 100))
      assert.ok(headersCalled, "onHeaders must be called")
      assert.ok(completeCalled, "onComplete must be called")
      const body = Buffer.concat(dataChunks).toString("utf8")
      assert.equal(JSON.parse(body).legacy, true)
    } finally {
      await new Promise((r) => targetServer.close(r))
    }
  })
})

describe("ProxyPool state and rotation", () => {
  test("returns null when pool is empty", () => {
    const pool = new ProxyPool([])
    assert.equal(pool.getNextDispatcher(), null)
  })

  test("rotates round-robin among active proxies", () => {
    const pool = new ProxyPool([
      "http://127.0.0.1:8001",
      "http://127.0.0.1:8002",
      "http://127.0.0.1:8003",
    ], { strategy: "round-robin" })

    const p1 = pool.getNext()
    const p2 = pool.getNext()
    const p3 = pool.getNext()
    const p4 = pool.getNext()

    assert.equal(p1.url, "http://127.0.0.1:8001")
    assert.equal(p2.url, "http://127.0.0.1:8002")
    assert.equal(p3.url, "http://127.0.0.1:8003")
    assert.equal(p4.url, "http://127.0.0.1:8001")
  })

  test("fallback strategy stays on primary unless degraded", () => {
    const pool = new ProxyPool([
      "http://127.0.0.1:8001",
      "http://127.0.0.1:8002",
    ], { strategy: "fallback" })

    assert.equal(pool.getNext().url, "http://127.0.0.1:8001")
    assert.equal(pool.getNext().url, "http://127.0.0.1:8001")

    // Mark primary as failed (e.g. 429)
    pool.reportResult("http://127.0.0.1:8001", false, 429)
    pool.reportResult("http://127.0.0.1:8001", false, 429)
    pool.reportResult("http://127.0.0.1:8001", false, 429)

    // Primary should be degraded; fallback kicks in
    assert.equal(pool.getNext().url, "http://127.0.0.1:8002")
  })
})

describe("ProxyPool config & API handling", () => {
  test("sanitize masks credentials in proxyPool", () => {
    const cfg = {
      proxyPool: [
        { id: "p1", url: "http://user:secret@127.0.0.1:8080", enabled: true, status: "active" },
        { id: "p2", url: "http://127.0.0.1:9090", enabled: true, status: "active" },
      ],
    }
    const clean = sanitize(cfg)
    assert.equal(clean.proxyPool[0].url, "http://user:***@127.0.0.1:8080")
    assert.equal(clean.proxyPool[1].url, "http://127.0.0.1:9090")
  })

  test("handleApiConfig PUT saves proxyPool and preserves masked credentials", async () => {
    saveConfig({
      proxyPool: [
        { id: "p1", url: "http://alice:supersecret@127.0.0.1:8080", enabled: true, status: "active" },
      ],
      proxyStrategy: "round-robin",
    })

    const req = mockReq({
      method: "PUT",
      headers: { "content-type": "application/json" },
      _body: JSON.stringify({
        proxyPool: [
          { id: "p1", url: "http://alice:***@127.0.0.1:8080", enabled: true, status: "active" },
          { id: "p2", url: "http://127.0.0.1:8081", enabled: true, status: "active" },
        ],
        proxyStrategy: "fallback",
        port: config.port,
      }),
    })
    const res = mockRes()
    await handleApiConfig(req, res)

    assert.equal(res.state.status, 200)
    assert.equal(config.proxyStrategy, "fallback")
    assert.equal(config.proxyPool.length, 2)
    assert.equal(config.proxyPool[0].url, "http://alice:supersecret@127.0.0.1:8080")
    assert.equal(config.proxyPool[1].url, "http://127.0.0.1:8081")
  })

  test("handleTestProxy tests connectivity through a proxy", async () => {
    const testServer = http.createServer((req, res) => {
      res.writeHead(200, { "content-type": "application/json" })
      res.end(JSON.stringify({ ok: true }))
    })
    await new Promise((r) => testServer.listen(0, "127.0.0.1", r))
    const testPort = testServer.address().port

    const proxyServer = http.createServer((req, res) => {
      const u = new URL(req.url)
      const targetReq = http.request({
        host: u.hostname,
        port: u.port,
        path: u.pathname + u.search,
        method: req.method,
        headers: req.headers,
      }, (targetRes) => {
        res.writeHead(targetRes.statusCode, targetRes.headers)
        targetRes.pipe(res)
      })
      req.pipe(targetReq)
    })
    await new Promise((r) => proxyServer.listen(0, "127.0.0.1", r))
    const proxyPort = proxyServer.address().port

    try {
      const req = mockReq({
        method: "POST",
        url: "/api/proxy/test",
        headers: { "content-type": "application/json" },
        _body: JSON.stringify({
          proxyUrl: `http://127.0.0.1:${proxyPort}`,
          testUrl: `http://127.0.0.1:${testPort}/health`,
        }),
      })
      const res = mockRes()
      await handleTestProxy(req, res)

      assert.equal(res.state.status, 200)
      const data = JSON.parse(res.body)
      assert.equal(data.ok, true)
      assert.ok(typeof data.latencyMs === "number")
    } finally {
      await new Promise((r) => testServer.close(r))
      await new Promise((r) => proxyServer.close(r))
    }
  })
})
