import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: "1mb" }));

function log(...args) {
  console.log(new Date().toISOString(), ...args);
}

// Normalize p2p.army items to Bybit format
function normalizeP2PArmyToBybit(ads) {
  return ads.map((a) => ({
    id: String(a.adv_id || a.id || Math.random()),
    price: String(a.price),
    minAmount: String(a.min_fiat ?? a.minAmount ?? a.min_amount ?? 0),
    maxAmount: String(a.max_fiat ?? a.maxAmount ?? a.max_amount ?? 0),
    nickName: String(a.user_name || a.nickName || "—"),
    userId: String(a.user_id || a.userId || ""),
    isOnline: true,
    isAuthMaker: !!a.is_merchant,
    recentOrderNum: String(a.user_orders ?? 0),
    recentExecuteRate: String((a.user_rate ?? 100)),
    payments: Array.isArray(a.payment_methods) ? a.payment_methods : (a.payment_method ? [a.payment_method] : []),
    paymentVoList: (Array.isArray(a.payment_methods) ? a.payment_methods : []).map((n) => ({ paymentName: n })),
    remark: String(a.text || a.remark || ""),
    currencyId: String(a.fiat || "RUB"),
    tokenId: String(a.asset || "USDT"),
    side: 1,
    lastQuantity: String(a.surplus_amount ?? 0),
    quantity: String(a.surplus_amount ?? 0),
  }));
}

async function fetchBybitDirect(payload) {
  const endpoints = [
    "https://api2.bybit.com/fiat/otc/item/online",
    "https://www.bybit.com/x-api/fiat/otc/item/list",
  ];
  // RU IP to bypass geo-block for RUB
  const spoofHeaders = {
    "Content-Type": "application/json",
    Accept: "application/json",
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    Referer: "https://www.bybit.com/fiat/trade/otc/",
    Origin: "https://www.bybit.com",
    lang: "ru",
    "Accept-Language": "ru-RU,ru;q=0.9,en;q=0.8",
    "X-Forwarded-For": "185.71.67.15",
    "X-Real-IP": "185.71.67.15",
    "CF-Connecting-IP": "185.71.67.15",
  };

  for (const url of endpoints) {
    try {
      log(`→ Bybit ${url} payload=${JSON.stringify(payload)}`);
      const r = await fetch(url, {
        method: "POST",
        headers: spoofHeaders,
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(10000),
      });
      const text = await r.text();
      let json;
      try { json = JSON.parse(text); } catch { log(`Non-JSON ${url}: ${text.slice(0,300)}`); continue; }
      const itemsCount = json?.result?.items?.length ?? 0;
      log(`← Bybit ${url} status=${r.status} ret_code=${json.ret_code} items=${itemsCount}`);
      if (r.ok && json.ret_code === 0 && itemsCount > 0) {
        return { json, url, itemsCount, payload };
      }
      // Keep empty json for fallback tracking
      if (json.ret_code === 0) return { json, url, itemsCount: 0, payload, empty: true };
    } catch (e) {
      log(`Bybit ${url} error: ${e.message}`);
    }
  }
  return null;
}

async function fetchP2PArmy(payload) {
  const bodies = [
    { market: "bybit", fiat: "RUB", asset: "USDT", side: "BUY", limit: 50 },
    { market: "bybit", fiat: "RUB", asset: "USDT", side: "BUY", limit: 50, payment_method: "Bank Transfer" },
    { market: "bybit", fiat: "RUB", asset: "USDT", side: "BUY", payment_method: "Bank Transfer", limit: 30 },
  ];
  for (const b of bodies) {
    try {
      const url = "https://p2p.army/v1/api/get_p2p_order_book";
      log(`→ p2p.army ${url} body=${JSON.stringify(b)}`);
      const r = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", "User-Agent": "Flipway/1.0" },
        body: JSON.stringify(b),
        signal: AbortSignal.timeout(10000),
      });
      const text = await r.text();
      let json;
      try { json = JSON.parse(text); } catch { log(`p2p.army non-JSON: ${text.slice(0,300)}`); continue; }
      const ads = json?.ads || json?.result?.ads || [];
      log(`← p2p.army status=${r.status} ads=${ads.length}`);
      if (r.ok && ads.length > 0) {
        return { json, ads };
      }
    } catch (e) {
      log(`p2p.army error: ${e.message}`);
    }
  }
  return null;
}

app.post("/api/bybit/p2p", async (req, res) => {
  try {
    const body = req.body || {};
    const basePayload = {
      userId: "",
      tokenId: body.tokenId || "USDT",
      currencyId: body.currencyId || "RUB",
      payment: [],
      side: String(body.side ?? "1"),
      size: String(body.size ?? "50"),
      page: String(body.page ?? "1"),
      amount: "",
      authMaker: false,
      canTrade: false,
    };

    // 1) Try Bybit direct with empty amount (like p2p-monitor) - most reliable
    let bybitRes = await fetchBybitDirect(basePayload);
    if (bybitRes && !bybitRes.empty) {
      log(`✓ Bybit direct success ${bybitRes.itemsCount} items`);
      return res.json(bybitRes.json);
    }

    // 2) Try Bybit with specific amount if provided
    if (body.amount) {
      const withAmount = { ...basePayload, amount: String(body.amount) };
      bybitRes = await fetchBybitDirect(withAmount);
      if (bybitRes && !bybitRes.empty) {
        log(`✓ Bybit with amount success ${bybitRes.itemsCount}`);
        return res.json(bybitRes.json);
      }
    }

    // 3) Fallback to p2p.army (has RUB mirror, works from EU IP)
    log(`⚠ Bybit empty (geo-block?), trying p2p.army fallback`);
    const p2p = await fetchP2PArmy(basePayload);
    if (p2p && p2p.ads.length > 0) {
      log(`✓ p2p.army returned ${p2p.ads.length} ads`);
      const normalized = normalizeP2PArmyToBybit(p2p.ads);
      // Return in same shape as Bybit so frontend doesn't need changes
      return res.json({ ret_code: 0, ret_msg: "SUCCESS via p2p.army fallback", result: { items: normalized, count: normalized.length } });
    }

    // 4) Last resort: return whatever Bybit gave (even empty) so frontend shows debug
    if (bybitRes) {
      log(`No fallback worked, returning empty Bybit response`);
      return res.json(bybitRes.json);
    }
    res.status(502).json({ ret_code: -1, ret_msg: "All sources failed", result: { items: [] } });
  } catch (e) {
    log("server error", e);
    res.status(500).json({ error: e.message });
  }
});

app.get("/api/health", (_, res) => res.json({ ok: true }));

const distPath = path.join(__dirname, "dist");
app.use(express.static(distPath));

app.get("/*splat", (req, res) => {
  if (req.path.startsWith("/api/")) return res.status(404).json({ error: "not found" });
  res.sendFile(path.join(distPath, "index.html"));
});

app.listen(PORT, "0.0.0.0", () => {
  log(`Flipway server listening on ${PORT}`);
});
