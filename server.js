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

// Proxy endpoint for Bybit P2P
app.post("/api/bybit/p2p", async (req, res) => {
  try {
    const body = req.body || {};
    // Default body handling - ensure required fields
    const payload = {
      userId: body.userId ?? "",
      tokenId: body.tokenId || "USDT",
      currencyId: body.currencyId || "RUB",
      payment: body.payment ?? [],
      side: body.side ?? "0",
      size: body.size ?? "20",
      page: body.page ?? "1",
      amount: body.amount ?? "5000",
      authMaker: false,
      canTrade: false,
      ...body,
    };

    // Try primary endpoint
    const endpoints = [
      "https://api2.bybit.com/fiat/otc/item/online",
      "https://www.bybit.com/x-api/fiat/otc/item/list",
    ];

    let lastError = null;
    for (const url of endpoints) {
      try {
        const r = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            Referer: "https://www.bybit.com/",
            Origin: "https://www.bybit.com",
            lang: "ru",
          },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(8000),
        });
        const text = await r.text();
        let json;
        try {
          json = JSON.parse(text);
        } catch {
          lastError = `Non-JSON from ${url}: ${text.slice(0, 500)}`;
          continue;
        }
        if (r.ok) {
          // log success
          // Add CORS headers already via cors middleware
          return res.json(json);
        } else {
          lastError = `HTTP ${r.status} from ${url}: ${text.slice(0, 500)}`;
        }
      } catch (e) {
        lastError = `${url} error: ${e.message}`;
      }
    }

    // If both failed, return error but with 200 and empty items to let frontend fallback
    res.status(502).json({ error: "Bybit API failed", details: lastError });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Health
app.get("/api/health", (_, res) => res.json({ ok: true }));

// Serve static dist
const distPath = path.join(__dirname, "dist");
app.use(express.static(distPath));

// SPA fallback - express 5 needs named wildcard
app.get("/*splat", (req, res) => {
  if (req.path.startsWith("/api/")) return res.status(404).json({ error: "not found" });
  res.sendFile(path.join(distPath, "index.html"));
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Flipway server listening on ${PORT}`);
});
