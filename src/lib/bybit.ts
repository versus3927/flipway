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
  payments: string[];
  paymentsDetailed?: { name: string; id: string }[];
  remark: string;
  currencyId: string;
  tokenId: string;
  side: number;
  authStatus?: string;
  [k: string]: any;
}

function normalizeItem(raw: any): BybitItem | null {
  try {
    const payments: string[] = [];
    if (Array.isArray(raw.payments)) payments.push(...raw.payments);
    else if (Array.isArray(raw.paymentTypes)) payments.push(...raw.paymentTypes);
    else if (Array.isArray(raw.paymentsName)) payments.push(...raw.paymentsName);
    else if (typeof raw.payments === "string") payments.push(raw.payments);

    if (raw.paymentsDetail) {
      for (const p of raw.paymentsDetail) {
        if (p.paymentName) payments.push(p.paymentName);
        if (p.paymentType) payments.push(p.paymentType);
      }
    }
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

async function fetchViaServer(payload: any): Promise<any> {
  const r = await fetch("/api/bybit/p2p", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`Server proxy ${r.status}: ${t.slice(0, 300)}`);
  }
  return r.json();
}

async function fetchDirect(payload: any, url: string): Promise<any> {
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(payload),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
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
  const side = options.side ?? 0;
  const pageSize = options.pageSize ?? 20;
  const maxPages = options.maxPages ?? 5;

  const debug: string[] = [];
  const allItems: BybitItem[] = [];

  for (let page = 1; page <= maxPages; page++) {
    const payload = {
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
    };

    let json: any = null;
    let success = false;

    // 1) Try server proxy (works on Railway)
    try {
      debug.push(`стр ${page}: через сервер /api/bybit/p2p`);
      json = await fetchViaServer(payload);
      success = true;
      debug.push(`  -> сервер OK`);
    } catch (e: any) {
      debug.push(`  -> сервер ошибка: ${e.message}`);
      // 2) Try vite dev proxy (local)
      try {
        const isLocal = typeof window !== "undefined" && (window.location.hostname === "localhost" || window.location.hostname.includes("e2b.app"));
        if (isLocal) {
          debug.push(`  пробую /bybit-api/fiat/otc/item/online (vite proxy)`);
          json = await fetchDirect(payload, "/bybit-api/fiat/otc/item/online");
          success = true;
        } else throw new Error("not local");
      } catch (e2: any) {
        // 3) Try direct + public cors proxy as last resort
        try {
          debug.push(`  пробую прямой api2.bybit.com`);
          json = await fetchDirect(payload, "https://api2.bybit.com/fiat/otc/item/online");
          success = true;
        } catch (e3: any) {
          debug.push(`  -> все методы не сработали: ${e3.message}`);
          continue;
        }
      }
    }

    if (!success || !json) continue;

    const items = json?.result?.items ?? json?.result?.list ?? json?.data?.items ?? json?.data ?? json?.items ?? [];
    if (!Array.isArray(items)) {
      debug.push(`  неожиданный формат: ${JSON.stringify(json).slice(0, 200)}`);
      break;
    }
    if (items.length === 0) {
      debug.push(`  стр ${page}: 0 объявлений — конец`);
      break;
    }
    for (const raw of items) {
      const n = normalizeItem(raw);
      if (n) allItems.push(n);
    }
    debug.push(`  стр ${page}: ${items.length} шт, цена от ${items[0]?.price}`);
    if (items.length < pageSize) break;
  }

  if (allItems.length === 0) {
    debug.push("Ничего не нашли — проверь доступность Bybit.");
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
  return joined.includes("bank") || joined.includes("банк") || joined.includes("перевод") || payments.some((p) => p.toLowerCase().includes("bank"));
}
