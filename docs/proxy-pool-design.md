# Proxy Pool Architecture Specification (Ala 9router)

## 1. Overview

Fitur **Proxy Pool** pada **zen-proxy** dirancang untuk merutekan outbound request ke upstream (OpenCode Zen API) melalui pool proxy HTTP/HTTPS eksternal. Fitur ini mengadopsi fungsionalitas proxy pool pada [9router](https://github.com/decolua/9router), guna mengatasi pembatasan IP (429 Rate Limits, Cloudflare challenge, atau IP bans) dan mendukung multi-node outbound routing.

---

## 2. Struktur Konfigurasi (`zen-proxy.json`)

Konfigurasi disimpan di `zen-proxy.json` (di dalam direktori data `/app/data` saat berjalan di Docker):

```json
{
  "proxyPool": [
    {
      "id": "proxy-1",
      "url": "http://user:password@proxy1.example.com:8080",
      "enabled": true,
      "protocol": "http",
      "failCount": 0,
      "lastChecked": 1710000000000,
      "status": "active"
    },
    {
      "id": "proxy-2",
      "url": "socks5://proxy2.example.com:1080",
      "enabled": true,
      "protocol": "socks5",
      "failCount": 0,
      "lastChecked": 1710000000000,
      "status": "active"
    }
  ],
  "proxyStrategy": "round-robin",
  "proxyRetryLimit": 3,
  "proxyTimeoutMs": 10000
}
```

### Environment Variables Fallback:
* `PROXY_POOL`: Daftar proxy yang dipisahkan koma (misal: `http://p1:8080,http://p2:8080`).
* `PROXY_STRATEGY`: `round-robin` | `fallback` | `random`.

---

## 3. Strategi Routing & Failover

1. **Round-Robin:**
   * Setiap request outbound baru memilih proxy sehat berikutnya dalam pool secara berurutan.
2. **Fallback:**
   * Selalu menggunakan proxy utama (urutan pertama). Jika gagal (timeout, network error, 429), beralih ke proxy cadangan berikutnya.
3. **Auto-Failover saat 429 / 5xx:**
   * Jika upstream merespons dengan HTTP `429 (Rate Limit)` atau kegagalan koneksi TCP, proxy tersebut ditandai dengan kenaikan `failCount`.
   * Request langsung di-retry ke proxy berikutnya dalam pool hingga mencapai `proxyRetryLimit`.
   * Jika `failCount` melampaui ambang batas, status proxy berubah menjadi `degraded` sementara, dan secara bertahap diuji ulang (circuit breaker).

---

## 4. Implementasi Backend (`zen-proxy.mjs`)

* Menggunakan `undici.ProxyAgent` (bawaan Node.js >= 18) untuk zero external npm dependencies.
* Integrasi pada fungsi pemanggilan upstream `fetch()`:
  ```javascript
  import { ProxyAgent } from "undici"

  function getNextDispatcher() {
    const activeProxy = selectNextProxy()
    if (!activeProxy) return undefined
    return getOrCreateProxyAgent(activeProxy.url)
  }
  ```

---

## 5. Integrasi Web UI Dashboard (`/public/index.html`)

Sama seperti pada 9router, Web UI zen-proxy menyediakan antarmuka manajemen:
1. **Daftar Proxy Pool:**
   * Menampilkan URL proxy (dengan masking kredensial), protokol, status (`Active`, `Degraded`, `Disabled`), dan latency terakhir.
2. **Tambah / Edit / Hapus Proxy:**
   * Input endpoint proxy HTTP/HTTPS.
   * Toggle enable / disable.
3. **Tombol "Test Proxy":**
   * Mengirim request uji coba ke upstream via proxy terpilih untuk memverifikasi apakah IP terkena blokir atau responsif.
4. **Strategi Pemilihan:**
   * Dropdown pemilihan strategi (`Round-Robin` / `Fallback`).
