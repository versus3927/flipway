import { useState, useMemo } from "react";
import { fetchBybitP2P, formatAmount, isBankTransfer, type BybitItem } from "./lib/bybit";
import { checkDescription } from "./lib/filters";
import {
  Search,
  ExternalLink,
  Filter,
  ArrowUpDown,
  BadgeCheck,
  User,
  Wallet,
  MessageSquareText,
  AlertTriangle,
  CheckCircle2,
  Sparkles,
  RefreshCw,
  Banknote,
  ShieldCheck,
  Timer,
  Copy,
  ChevronDown,
  Info,
} from "lucide-react";

type ResultItem = BybitItem & {
  filter: ReturnType<typeof checkDescription>;
  priceNum: number;
  minNum: number;
  maxNum: number;
};

export default function App() {
  const [amount, setAmount] = useState("5000");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<ResultItem[]>([]);
  const [rawCount, setRawCount] = useState(0);
  const [debug, setDebug] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showDebug, setShowDebug] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const stats = useMemo(() => {
    if (!results.length) return null;
    const prices = results.map((r) => r.priceNum);
    return {
      min: Math.min(...prices),
      max: Math.max(...prices),
      avg: prices.reduce((a, b) => a + b, 0) / prices.length,
    };
  }, [results]);

  const doSearch = async () => {
    setLoading(true);
    setError(null);
    setResults([]);
    setDebug([]);
    setRawCount(0);
    try {
      const amt = amount.replace(/\s/g, "") || "5000";
      const { items, rawCount: rc, debug: dbg } = await fetchBybitP2P({
        amount: amt,
        tokenId: "USDT",
        currencyId: "RUB",
        side: 0, // покупаем USDT
        pageSize: 20,
        maxPages: 5,
      });
      setRawCount(rc);
      setDebug(dbg);

      if (items.length === 0) {
        setError(
          "Bybit не вернул объявления. Это бывает из-за блокировки CORS в браузере. Попробуй: 1) включить VPN, 2) открыть через dev-прокси (npm run dev), 3) проверить что Bybit P2P доступен в твоей стране. Логи ниже в отладке."
        );
        return;
      }

      // Фильтр 1: Bank Transfer + лимит от 5к
      const wantedMin = parseInt(amt.replace(/\D/g, ""), 10);

      const filtered: ResultItem[] = [];

      for (const it of items) {
        const priceNum = parseFloat(it.price);
        const minNum = parseFloat(String(it.minAmount).replace(/,/g, ""));
        const maxNum = parseFloat(String(it.maxAmount).replace(/,/g, ""));

        // оплата
        const hasBank = isBankTransfer(it.payments);
        if (!hasBank) continue;

        // лимит именно от 5к: minAmount == wantedMin
        // допускаем небольшую погрешность 0.01, но требуем точное совпадение
        if (Math.abs(minNum - wantedMin) > 0.5) continue;

        // описание фильтр
        const filter = checkDescription(it.remark);
        if (!filter.allowed) continue;

        filtered.push({
          ...it,
          filter,
          priceNum,
          minNum,
          maxNum,
        });
      }

      // сортировка по цене от меньшей к большей
      filtered.sort((a, b) => a.priceNum - b.priceNum);

      setResults(filtered);
      if (filtered.length === 0) {
        setError(
          `Нашлось ${rc} объявлений Bank Transfer, но после фильтров (ровно от ${formatAmount(amt)} RUB и «принимает от 3 лиц») ничего не осталось. Попробуй снять часть фильтров или проверить другой способ оплаты.`
        );
      }
    } catch (e: any) {
      setError(e?.message || "Ошибка запроса");
    } finally {
      setLoading(false);
    }
  };

  const copyLink = async (it: ResultItem) => {
    const url = `https://www.bybit.com/fiat/trade/otc/maker/${it.userId}?actionType=0&token=USDT&fiat=RUB&amount=${amount}`;
    await navigator.clipboard.writeText(url);
    setCopiedId(it.id);
    setTimeout(() => setCopiedId(null), 1800);
  };

  return (
    <div className="min-h-screen bg-[#080a12] text-white selection:bg-[#2dd4bf]/30">
      {/* BG glow */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute -top-[30%] left-1/2 -translate-x-1/2 w-[120%] h-[70%] bg-[radial-gradient(ellipse_at_center,_rgba(45,212,191,0.14),transparent_65%)]" />
        <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-cyan-400/30 to-transparent" />
      </div>

      <div className="relative mx-auto max-w-[1100px] px-4 sm:px-6 py-6 sm:py-8">
        {/* Header */}
        <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="h-11 w-11 rounded-2xl bg-gradient-to-br from-cyan-400 to-teal-500 flex items-center justify-center shadow-[0_0_24px_rgba(45,212,191,0.4)]">
              <span className="text-[22px]">◈</span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-[22px] font-extrabold tracking-tight">FLIPWAY</h1>
                <span className="text-[10px] tracking-[0.18em] font-semibold px-2 py-1 rounded-full bg-white/10 border border-white/10">
                  P2P PARSER
                </span>
              </div>
              <p className="text-[13px] leading-none text-white/55">Bybit · USDT/RUB · Bank Transfer · от 3-х лиц</p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-[12px]">
            <span className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-white/60">
              <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" /> LIVE P2P
            </span>
            <a
              href="https://www.bybit.com/fiat/trade/otc/?actionType=0&token=USDT&fiat=RUB&amount=5000"
              target="_blank"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white text-black font-semibold hover:bg-white/90 transition"
            >
              Открыть Bybit P2P <ExternalLink size={14} />
            </a>
          </div>
        </header>

        {/* Control panel */}
        <div className="mt-6 rounded-[20px] bg-white/[0.06] border border-white/10 backdrop-blur-xl overflow-hidden">
          <div className="p-4 sm:p-5 flex flex-col gap-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-[15px] font-bold flex items-center gap-2">
                  <Filter size={16} className="text-cyan-300" /> Фильтры
                </h2>
                <p className="text-[12.5px] text-white/55 mt-1 max-w-[640px]">
                  Ищем <span className="text-white font-semibold">покупку USDT за RUB</span> · оплата{" "}
                  <span className="text-white font-semibold">Bank Transfer</span> · лимит{" "}
                  <span className="text-white font-semibold">ровно от 5 000 RUB</span> · в описании{" "}
                  <span className="text-emerald-300 font-semibold">явно разрешено от 3-х лиц</span>. Если пусто — скип. Если есть
                  суммы в тексте — покажем бейджами.
                </p>
              </div>
              <div className="hidden sm:flex items-center gap-1.5 text-[11px] px-2.5 py-1.5 rounded-full bg-emerald-400/10 border border-emerald-400/20 text-emerald-300">
                <ShieldCheck size={14} /> Безопасный фильтр по описанию
              </div>
            </div>

            <div className="grid grid-cols-12 gap-3">
              <div className="col-span-12 sm:col-span-5 lg:col-span-3">
                <label className="text-[11px] tracking-widest font-semibold text-white/55">СУММА ПОКУПКИ</label>
                <div className="mt-1.5 relative">
                  <Banknote size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40" />
                  <input
                    value={amount}
                    onChange={(e) => setAmount(e.target.value.replace(/[^\d\s]/g, ""))}
                    placeholder="5000"
                    className="w-full h-11 pl-9 pr-12 rounded-xl bg-[#0f1320] border border-white/10 outline-none focus:border-cyan-400/40 text-[15px] font-semibold mono"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[12px] font-bold text-white/50">RUB</span>
                </div>
                <div className="mt-1 text-[11px] text-white/40">Фильтруем только где min = {formatAmount(amount || "5000")} ₽</div>
              </div>

              <div className="col-span-12 sm:col-span-7 lg:col-span-5 grid grid-cols-3 gap-2 self-end">
                {[
                  { k: "USDT", v: "USDT", sub: "крипта" },
                  { k: "RUB", v: "RUB", sub: "фиат" },
                  { k: "BANK", v: "Bank Transfer", sub: "оплата" },
                ].map((b) => (
                  <div key={b.k} className="h-11 rounded-xl bg-[#0f1320] border border-white/10 flex flex-col justify-center px-3">
                    <div className="text-[12px] font-extrabold leading-none">{b.v}</div>
                    <div className="text-[10px] tracking-widest text-white/40 font-semibold">{b.sub.toUpperCase()}</div>
                  </div>
                ))}
              </div>

              <div className="col-span-12 lg:col-span-4 flex items-end gap-2">
                <button
                  onClick={doSearch}
                  disabled={loading}
                  className="flex-1 h-11 rounded-xl bg-gradient-to-r from-cyan-400 to-teal-400 text-black font-extrabold text-[14px] tracking-wide flex items-center justify-center gap-2 hover:brightness-110 active:scale-[0.99] transition disabled:opacity-60"
                >
                  {loading ? <RefreshCw size={18} className="animate-spin" /> : <Search size={18} />}
                  {loading ? "ИЩЕМ..." : "НАЙТИ ПРЕДЛОЖЕНИЯ"}
                </button>
                <button
                  onClick={() => setShowDebug((s) => !s)}
                  className="h-11 w-11 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center hover:bg-white/10 transition"
                  title="Отладка"
                >
                  <ChevronDown size={18} className={`transition ${showDebug ? "rotate-180" : ""}`} />
                </button>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-[11.5px]">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/[0.06] border border-white/10 text-white/70">
                <ArrowUpDown size={12} /> Сортировка: от меньшей цены к большей
              </span>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-400/10 border border-amber-400/20 text-amber-200">
                <Timer size={12} /> Банк: Bank Transfer
              </span>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-violet-400/10 border border-violet-400/20 text-violet-200">
                <MessageSquareText size={12} /> Пустое описание = скип
              </span>
            </div>
          </div>

          {showDebug && (
            <div className="border-t border-white/10 bg-black/20 p-4">
              <div className="text-[11px] tracking-widest font-bold text-white/50">ОТЛАДКА / ЛОГИ</div>
              <div className="mt-2 grid sm:grid-cols-2 gap-3">
                <div className="rounded-xl bg-[#0f1320] border border-white/10 p-3">
                  <div className="text-[12px] font-bold">Параметры запроса</div>
                  <div className="mono text-[12px] text-white/70 mt-1">
                    token=USDT · fiat=RUB · amount={amount} · side=0 (buy) · size=20
                  </div>
                  <div className="text-[11px] text-white/40 mt-2">
                    Endpoint: api2.bybit.com/fiat/otc/item/online → fallback x-api + corsproxy
                  </div>
                </div>
                <div className="rounded-xl bg-[#0f1320] border border-white/10 p-3">
                  <div className="text-[12px] font-bold">Лог запросов</div>
                  <div className="mono text-[11px] text-white/60 mt-1 max-h-28 overflow-auto whitespace-pre-wrap">
                    {debug.length ? debug.join("\n") : "— нажми Найти —"}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Stats */}
        {(results.length > 0 || rawCount > 0) && (
          <div className="mt-4 grid grid-cols-12 gap-3">
            <div className="col-span-12 sm:col-span-5 lg:col-span-3 rounded-2xl bg-white/[0.06] border border-white/10 p-3.5 flex items-center justify-between">
              <div>
                <div className="text-[11px] tracking-widest font-bold text-white/45">НАЙДЕНО ПОДХОДЯЩИХ</div>
                <div className="text-[22px] font-extrabold leading-none mt-1">{results.length}</div>
                <div className="text-[11px] text-white/45">из {rawCount} проверенных</div>
              </div>
              <div className="h-10 w-10 rounded-xl bg-emerald-400/15 border border-emerald-400/20 flex items-center justify-center text-emerald-300">
                <CheckCircle2 size={18} />
              </div>
            </div>
            <div className="col-span-12 sm:col-span-7 lg:col-span-5 rounded-2xl bg-white/[0.06] border border-white/10 p-3.5">
              <div className="text-[11px] tracking-widest font-bold text-white/45">ЦЕНЫ (RUB за USDT)</div>
              {stats ? (
                <div className="mt-1 flex items-baseline gap-3 flex-wrap">
                  <div className="text-[13px] font-bold">
                    от <span className="mono text-emerald-300">{stats.min.toFixed(2)}</span> ₽
                  </div>
                  <div className="text-[13px] font-bold">
                    до <span className="mono text-white">{stats.max.toFixed(2)}</span> ₽
                  </div>
                  <div className="text-[11px] text-white/50">
                    средн <span className="mono">{stats.avg.toFixed(2)}</span>
                  </div>
                </div>
              ) : (
                <div className="text-sm text-white/40 mt-1">—</div>
              )}
              <div className="text-[11px] text-white/40 mt-1 flex items-center gap-1">
                <Info size={11} /> Сортировка от дешевых к дорогим — лучшие сверху
              </div>
            </div>
            <div className="hidden lg:flex col-span-4 rounded-2xl bg-gradient-to-br from-cyan-500/15 to-teal-500/15 border border-cyan-400/20 p-3.5 items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-white text-black flex items-center justify-center">
                <Sparkles size={18} />
              </div>
              <div>
                <div className="text-[12px] font-extrabold">Только «от 3 лиц»</div>
                <div className="text-[11px] text-white/60">Пустые описания отфильтрованы</div>
              </div>
            </div>
          </div>
        )}

        {/* Error/info */}
        {error && (
          <div className="mt-4 rounded-2xl border border-amber-400/20 bg-amber-400/10 p-3.5 flex gap-3">
            <AlertTriangle size={18} className="text-amber-300 shrink-0 mt-0.5" />
            <div className="text-[13px] leading-5 text-amber-100/90">{error}</div>
          </div>
        )}

        {/* Results */}
        <div className="mt-5">
          {!results.length && !loading && !error && (
            <div className="rounded-[20px] bg-white/[0.03] border border-white/10 p-8 sm:p-10 text-center">
              <div className="mx-auto h-12 w-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center">
                <Search size={20} className="text-white/60" />
              </div>
              <div className="mt-3 text-[15px] font-bold">Готов к поиску</div>
              <div className="mt-1 text-[13px] text-white/55 max-w-[560px] mx-auto">
                Нажми <span className="text-white font-semibold">«Найти предложения»</span> — парсер запросит Bybit P2P напрямую из
                твоего браузера, отфильтрует по Bank Transfer, лимиту ровно {formatAmount(amount || "5000")} ₽ и тексту «от 3 лиц»,
                и отсортирует от меньшей цены.
              </div>
              <div className="mt-4 inline-flex items-center gap-2 text-[11px] px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-white/50">
                <ShieldCheck size={12} /> Работает на сайте по кнопке — без сервера
              </div>
            </div>
          )}

          {loading && (
            <div className="grid gap-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="rounded-2xl bg-white/[0.04] border border-white/10 p-4 animate-pulse">
                  <div className="h-4 w-32 bg-white/10 rounded" />
                  <div className="mt-3 h-3 w-full bg-white/5 rounded" />
                  <div className="mt-2 h-3 w-2/3 bg-white/5 rounded" />
                </div>
              ))}
              <div className="text-center text-[12px] text-white/50">Запрашиваем Bybit P2P… может занять 3–7 сек</div>
            </div>
          )}

          {!!results.length && (
            <div className="grid gap-3">
              <div className="text-[11px] tracking-widest font-bold text-white/45 px-1">
                РЕЗУЛЬТАТЫ — {results.length} · ОТ ДЕШЕВЫХ К ДОРОГИМ
              </div>
              {results.map((it) => (
                <div
                  key={it.id}
                  className="group rounded-[18px] bg-white/[0.06] border border-white/10 backdrop-blur hover:bg-white/[0.08] hover:border-white/15 transition overflow-hidden"
                >
                  <div className="p-4 sm:p-4.5 flex flex-col gap-3">
                    {/* top row: price + limits + merchant */}
                    <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-3">
                      <div className="flex gap-3">
                        <div className="shrink-0">
                          <div className="text-[11px] tracking-widest font-bold text-white/45">ЦЕНА</div>
                          <div className="flex items-baseline gap-1.5">
                            <span className="text-[22px] font-extrabold mono leading-none">{Number(it.price).toFixed(2)}</span>
                            <span className="text-[12px] font-bold text-white/60">₽</span>
                            <span className="text-[11px] text-white/40">/ USDT</span>
                          </div>
                          <div className="mt-1 inline-flex items-center gap-1.5 text-[11px] px-2 py-1 rounded-full bg-white/5 border border-white/10 mono">
                            <Wallet size={11} /> {formatAmount(it.minAmount)} – {formatAmount(it.maxAmount)} RUB
                          </div>
                        </div>

                        <div className="hidden sm:block w-px bg-white/10 self-stretch mx-1" />

                        <div className="min-w-0">
                          <div className="text-[11px] tracking-widest font-bold text-white/45">МЕРЧАНТ</div>
                          <div className="flex items-center gap-2 mt-1">
                            <div className="h-8 w-8 rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center font-extrabold text-[12px]">
                              {it.nickName.slice(0, 1).toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <div className="text-[13px] font-bold leading-none flex items-center gap-1.5">
                                <span className="truncate max-w-[160px] sm:max-w-[200px]">{it.nickName}</span>
                                {it.isAuthMaker && (
                                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-sky-400/15 border border-sky-400/20 text-sky-300 text-[10px] font-bold">
                                    <BadgeCheck size={10} /> Вериф
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-2 mt-1 text-[11px] text-white/55">
                                <span className="inline-flex items-center gap-1">
                                  <User size={11} /> {it.finishedNum ?? it.recentOrderNum ?? "—"} ордеров
                                </span>
                                <span className="hidden sm:inline">·</span>
                                <span className="inline-flex items-center gap-1 text-emerald-300">
                                  <CheckCircle2 size={11} />{" "}
                                  {it.completedRate
                                    ? `${Number(it.completedRate).toFixed(0)}%`
                                    : it.recentExecuteRate
                                      ? `${Number(it.recentExecuteRate).toFixed(0)}%`
                                      : "—"}{" "}
                                  выполн.
                                </span>
                              </div>
                            </div>
                          </div>
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {it.payments.slice(0, 4).map((p, idx) => (
                              <span
                                key={idx}
                                className="text-[10px] font-bold tracking-wide px-2 py-1 rounded-full bg-emerald-400/10 border border-emerald-400/20 text-emerald-200"
                              >
                                {p}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>

                      <div className="flex lg:flex-col gap-2">
                        <a
                          href={`https://www.bybit.com/fiat/trade/otc/maker/${it.userId}?actionType=0&token=USDT&fiat=RUB&amount=${amount}`}
                          target="_blank"
                          rel="noreferrer"
                          className="flex-1 lg:flex-none inline-flex items-center justify-center gap-2 h-10 px-4 rounded-xl bg-white text-black font-extrabold text-[13px] hover:bg-white/90 transition"
                        >
                          Открыть на Bybit <ExternalLink size={14} />
                        </a>
                        <button
                          onClick={() => copyLink(it)}
                          className="h-10 px-3 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition inline-flex items-center gap-1.5 text-[12px] font-semibold"
                        >
                          <Copy size={14} /> {copiedId === it.id ? "Скопировано" : "Ссылка"}
                        </button>
                      </div>
                    </div>

                    {/* amounts badge */}
                    {it.filter.extractedAmounts.length > 0 && (
                      <div className="rounded-xl bg-amber-400/10 border border-amber-400/20 px-3 py-2 flex flex-wrap items-center gap-2">
                        <span className="inline-flex items-center gap-1.5 text-[11px] font-extrabold tracking-widest text-amber-200">
                          <AlertTriangle size={12} /> ТОЛЬКО НА СУММЫ:
                        </span>
                        <span className="flex flex-wrap gap-1.5">
                          {it.filter.extractedAmounts.map((a) => (
                            <span
                              key={a}
                              className="mono text-[12px] font-bold px-2 py-1 rounded-full bg-amber-400 text-black"
                            >
                              {a} ₽
                            </span>
                          ))}
                        </span>
                        <span className="text-[11px] text-amber-200/70">вытащено из описания</span>
                      </div>
                    )}

                    {/* remark */}
                    <div className="rounded-xl bg-[#0f1320] border border-white/10 p-3">
                      <div className="flex items-center gap-2 text-[11px] tracking-widest font-bold text-white/45">
                        <MessageSquareText size={12} /> ОПИСАНИЕ МЕРЧАНТА
                        <span className="ml-auto inline-flex items-center gap-1.5 text-[11px] font-semibold px-2 py-1 rounded-full bg-emerald-400/10 border border-emerald-400/20 text-emerald-200">
                          <CheckCircle2 size={11} /> {it.filter.reason}
                        </span>
                      </div>
                      <div className="mt-2 text-[13px] leading-5 text-white/85 whitespace-pre-wrap break-words">
                        {it.remark || "—"}
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {it.filter.positiveFound.map((t) => (
                          <span
                            key={t}
                            className="text-[10px] font-bold px-2 py-1 rounded-full bg-emerald-400/15 border border-emerald-400/20 text-emerald-200"
                          >
                            ✓ {t}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 text-[11px] text-white/40">
                      <span className="mono">ID: {it.id.slice(0, 12)}…</span>
                      <span>·</span>
                      <span>Лимит: {formatAmount(it.minAmount)}–{formatAmount(it.maxAmount)} ₽</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <footer className="mt-8 rounded-2xl bg-white/[0.03] border border-white/10 p-4 flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
          <div className="text-[12px] text-white/55">
            Flipway — парсер Bybit P2P · фильтрует только лимиты <b className="text-white">ровно от {formatAmount(amount || "5000")} ₽</b>,
            Bank Transfer и явные упоминания о 3-х лицах. Сортировка по цене.
          </div>
          <div className="text-[11px] text-white/30">Не является финансовым советом. Проверяй мерчанта на Bybit.</div>
        </footer>
      </div>
    </div>
  );
}
