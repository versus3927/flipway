export interface BybitItem {
  id: string;
  price: string;
  minAmount: string;
  maxAmount: string;
  quantity?: string;
  minQuantity?: string;
  maxQuantity?: string;
  nickName: string;
  userId: string;
  isOnline: boolean;
  isAuthMaker: boolean;
  completedRate?: string;
  finishedNum?: number;
  recentOrderNum?: string;
  recentExecuteRate?: string;
  payments: string[]; // payment names
  paymentsDetailed?: { name: string; id: string }[];
  remark: string;
  currencyId: string;
  tokenId: string;
  side: number;
  authStatus?: string;
  // raw
  [k: string]: any;
}

const PAYMENT_MAP_RUB: Record<string, string> = {
  "14": "Bank Transfer",
  "585": "Sberbank",
  "614": "Tinkoff",
  "75": "SBPay",
  "62": "Raiffeisen",
};

async function fetchWithFallback(url: string, init: RequestInit): Promise<Response> {
  // 1) try direct
  try {
    const r = await fetch(url, init);
    if (r.ok) return r;
    // if not ok, try proxy
    throw new Error(`HTTP ${r.status}`);
  } catch (e) {
    // 2) try corsproxy.io
    const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(url)}`;
    try {
      const r2 = await fetch(proxyUrl, init);
      if (r2.ok) return r2;
    } catch {}
    // 3) try allorigins
    const aoUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`;
    const r3 = await fetch(aoUrl, init);
    return r3;
  }
}

function normalizeItem(raw: any): BybitItem | null {
  try {
    const payments: string[] = [];
    if (Array.isArray(raw.payments)) payments.push(...raw.payments);
    else if (Array.isArray(raw.paymentTypes)) payments.push(...raw.paymentTypes);
    else if (Array.isArray(raw.paymentsName)) payments.push(...raw.paymentsName);
    else if (typeof raw.payments === "string") payments.push(raw.payments);

    // alternative fields
    if (raw.paymentsDetail) {
      for (const p of raw.paymentsDetail) {
        if (p.paymentName) payments.push(p.paymentName);
        if (p.paymentType) payments.push(p.paymentType);
      }
    }

    // paymentVoList is common
    if (Array.isArray(raw.paymentVoList)) {
      for (const p of raw.paymentVoList) {
        if (p.paymentName) payments.push(p.paymentName);
        if (p.paymentType) payments.push(p.paymentType);
      }
    }

    const item: BybitItem = {
      id: String(raw.id ?? raw.itemId ?? raw.uuid ?? Math.random()),
      price: String(raw.price ?? raw.unitPrice ?? "0"),
      minAmount: String(raw.minAmount ?? raw.minLimit ?? raw.limitMin ?? "0"),
      maxAmount: String(raw.maxAmount ?? raw.maxLimit ?? raw.limitMax ?? "0"),
      quantity: raw.quantity ? String(raw.quantity) : undefined,
      nickName: String(raw.nickName ?? raw.makerNickName ?? raw.userName ?? raw.nick ?? "—"),
      userId: String(raw.userId ?? raw.makerUserId ?? raw.uid ?? ""),
      isOnline: raw.isOnline ?? true,
      isAuthMaker: !!raw.isAuthMaker,
      completedRate: raw.recentExecuteRate ?? raw.finishRate ?? raw.completedRate,
      finishedNum: raw.recentOrderNum ?? raw.finishNum ?? raw.orderNum,
      recentOrderNum: raw.recentOrderNum,
      recentExecuteRate: raw.recentExecuteRate,
      payments: payments.length ? payments : (raw.payments ? [String(raw.payments)] : []),
      remark: String(raw.remark ?? raw.introduction ?? raw.desc ?? ""),
      currencyId: String(raw.currencyId ?? raw.fiat ?? "RUB"),
      tokenId: String(raw.tokenId ?? raw.crypto ?? "USDT"),
      side: Number(raw.side ?? 0),
      authStatus: raw.authStatus,
      ...raw,
    };
    return item;
  } catch {
    return null;
  }
}

export async function fetchBybitP2P(options: {
  amount: string;
  tokenId?: string;
  currencyId?: string;
  side?: number;
  pageSize?: number;
  maxPages?: number;
}): Promise<{ items: BybitItem[]; rawCount: number; debug: string[] }> {
  const tokenId = options.tokenId || "USDT";
  const currencyId = options.currencyId || "RUB";
  const side = options.side ?? 0; // 0 = buy USDT (sell ads)
  const pageSize = options.pageSize ?? 20;
  const maxPages = options.maxPages ?? 5;

  const debug: string[] = [];
  const allItems: BybitItem[] = [];

  // Try endpoints in priority order
  const endpoints = [
    {
      url: "https://api2.bybit.com/fiat/otc/item/online",
      body: (page: number) => ({
        userId: "",
        tokenId,
        currencyId,
        payment: [],
        side: String(side),
        size: String(pageSize),
        page: String(page),
        amount: options.amount,
        authMaker: false,
        canTrade: false,
      }),
    },
    {
      url: "https://www.bybit.com/x-api/fiat/otc/item/list",
      body: (page: number) => ({
        tokenId,
        currencyId,
        payment: [],
        side,
        size: pageSize,
        page,
        amount: options.amount,
      }),
    },
  ];

  // For dev proxy, rewrite urls
  const isLocalhost = typeof window !== "undefined" && (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1");
  const proxiedEndpoints = endpoints.map((e) => {
    if (isLocalhost) {
      if (e.url.includes("api2.bybit.com")) return { ...e, url: "/bybit-api/fiat/otc/item/online" };
      if (e.url.includes("www.bybit.com")) return { ...e, url: "/bybit-x-api/fiat/otc/item/list" };
    }
    return e;
  });

  let successEndpoint: typeof endpoints[0] | null = null;

  for (const ep of proxiedEndpoints) {
    debug.push(`пробую ${ep.url}`);
    let endpointWorked = false;
    for (let page = 1; page <= maxPages; page++) {
      const body = ep.body(page);
      try {
        const headers: Record<string, string> = {
          "Content-Type": "application/json",
          Accept: "application/json",
          lang: "ru",
          platform: "PC",
          origin: "https://www.bybit.com",
          Referer: "https://www.bybit.com/",
        };
        // For direct browser fetch we need to avoid forbidden headers, so filter
        const safeHeaders: Record<string, string> = {
          "Content-Type": "application/json",
          Accept: "application/json",
        };
        const useHeaders = ep.url.startsWith("/") ? headers : safeHeaders;

        const resp = await fetch(ep.url, {
          method: "POST",
          headers: useHeaders,
          body: JSON.stringify(body),
        });

        if (!resp.ok) {
          debug.push(`  стр ${page}: HTTP ${resp.status}`);
          // try fallback proxy
          const proxyResp = await fetchWithFallback(ep.url, {
            method: "POST",
            headers: safeHeaders,
            body: JSON.stringify(body),
          });
          if (!proxyResp.ok) {
            debug.push(`  стр ${page} proxy: HTTP ${proxyResp.status}`);
            continue;
          }
          const j = await proxyResp.json();
          const items = j?.result?.items ?? j?.result?.list ?? j?.data?.items ?? j?.items ?? [];
          if (items.length === 0) {
            debug.push(`  стр ${page} proxy: 0 объявлений`);
            break;
          }
          endpointWorked = true;
          successEndpoint = ep;
          for (const raw of items) {
            const n = normalizeItem(raw);
            if (n) allItems.push(n);
          }
          debug.push(`  стр ${page} proxy: ${items.length} шт`);
          if (items.length < pageSize) break;
          continue;
        }

        const json = await resp.json();
        const items = json?.result?.items ?? json?.result?.list ?? json?.data?.items ?? json?.data ?? json?.items ?? [];
        if (!Array.isArray(items)) {
          debug.push(`  стр ${page}: неожиданный формат ${JSON.stringify(json).slice(0,200)}`);
          break;
        }
        if (items.length === 0) {
          debug.push(`  стр ${page}: 0 объявлений — конец`);
          endpointWorked = true;
          break;
        }
        endpointWorked = true;
        successEndpoint = ep;
        for (const raw of items) {
          const n = normalizeItem(raw);
          if (n) allItems.push(n);
        }
        debug.push(`  стр ${page}: ${items.length} шт, цена от ${items[0]?.price}`);
        if (items.length < pageSize) break;
      } catch (err: any) {
        debug.push(`  стр ${page}: ошибка ${err?.message || err}`);
        // try via proxy
        try {
          const proxyResp2 = await fetchWithFallback(ep.url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          });
          const j = await proxyResp2.json();
          const items = j?.result?.items ?? j?.result?.list ?? [];
          if (items.length > 0) {
            endpointWorked = true;
            successEndpoint = ep;
            for (const raw of items) allItems.push(normalizeItem(raw)!);
            debug.push(`  стр ${page} fallback proxy: ${items.length} шт`);
            if (items.length < pageSize) break;
            continue;
          }
        } catch {}
        break;
      }
    }
    if (endpointWorked && allItems.length > 0) break;
    // try next endpoint
  }

  // If still 0, try demo data for preview (so UI works even if Bybit blocked)
  if (allItems.length === 0) {
    debug.push("Bybit API не ответил — проверь сеть / CORS. Попробуй VPN или прокси.");
  }

  return { items: allItems, rawCount: allItems.length, debug };
}

export function formatAmount(v: string | number) {
  const n = Number(String(v).replace(/,/g, ""));
  if (isNaN(n)) return String(v);
  return n.toLocaleString("ru-RU", { maximumFractionDigits: 2 });
}

export function isBankTransfer(payments: string[]): boolean {
  if (!payments || payments.length === 0) return false;
  const joined = payments.join(" ").toLowerCase();
  return (
    joined.includes("bank") ||
    joined.includes("банк") ||
    joined.includes("перевод") ||
    joined.includes("bank transfer") ||
    payments.some((p) => p.toLowerCase().includes("bank"))
  );
}
