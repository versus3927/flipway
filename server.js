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

// Detailed logging
function log(...args) {
  console.log(new Date().toISOString(), ...args);
}

// Proxy endpoint for Bybit P2P - matches working p2p-monitor payload
app.post("/api/bybit/p2p", async (req, res) => {
  try {
    const body = req.body || {};
    // p2p-monitor uses empty amount to fetch all ads, then client filters by min/max
    // Also side mapping: SELL (merchant sells, user buys) = "1", BUY = "0"
    const payload = {
      userId: "",
      tokenId: body.tokenId || "USDT",
      currencyId: body.currencyId || "RUB",
      payment: [],
      side: body.side ?? "1", // default to 1 = user buys USDT
      size: String(body.size ?? "20"),
      page: String(body.page ?? "1"),
      amount: "", // send empty to get all, like p2p-monitor does - client will filter by min=5000
      authMaker: false,
      canTrade: false,
    };
    // If caller explicitly wants amount filter, allow override with body.amount if not empty
    // But we prioritize empty to maximize results; frontend will filter strictly by min=5000
    // To support both, we try with empty first, if 0 results then try with amount
    const payloadsToTry = [payload];
    if (body.amount && body.amount !== "") {
      payloadsToTry.push({ ...payload, amount: String(body.amount) });
    }

    const endpoints = [
      "https://api2.bybit.com/fiat/otc/item/online",
      "https://www.bybit.com/x-api/fiat/otc/item/list",
    ];

    let lastError = null;
    let lastJson = null;

    for (const tryPayload of payloadsToTry) {
      for (const url of endpoints) {
        try {
          log(`→ ${url} payload=${JSON.stringify(tryPayload)}`);
          const r = await fetch(url, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Accept: "application/json",
              "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
              Referer: "https://www.bybit.com/fiat/trade/otc/",
              Origin: "https://www.bybit.com",
              lang: "ru",
              "Accept-Language": "ru-RU,ru;q=0.9,en;q=0.8",
            },
            body: JSON.stringify(tryPayload),
            signal: AbortSignal.timeout(10000),
          });
          const text = await r.text();
          let json;
          try {
            json = JSON.parse(text);
          } catch {
            lastError = `Non-JSON ${url}: ${text.slice(0, 500)}`;
            log(lastError);
            continue;
          }
          log(`← ${url} status=${r.status} ret_code=${json.ret_code} items=${json?.result?.items?.length ?? "?"}`);
          if (r.ok && json.ret_code === 0) {
            const items = json?.result?.items ?? [];
            // If we got results, return immediately
            if (items.length > 0) {
              log(`✓ returning ${items.length} items from ${url}`);
              return res.json(json);
            }
            // Remember empty result but continue trying other payload/endpoint
            lastJson = json;
            lastError = `empty from ${url} with payload amount='${tryPayload.amount}'`;
          } else {
            lastError = `HTTP ${r.status} ${url}: ${json.ret_msg || text.slice(0, 500)}`;
            log(lastError);
            lastJson = json;
          }
        } catch (e) {
          lastError = `${url} error: ${e.message}`;
          log(lastError);
        }
      }
    }

    // If all tried but got at least one response (even empty), return it so frontend can show debug
    if (lastJson) {
      return res.json(lastJson);
    }
    res.status(502).json({ error: "Bybit API failed", details: lastError });
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
