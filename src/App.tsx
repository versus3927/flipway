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
  RefreshCw,
  Banknote,
  ShieldCheck,
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
        side: 0,
        pageSize: 20,
        maxPages: 5,
      });
      setRawCount(rc);
      setDebug(dbg);

      if (items.length === 0) {
        setError("Bybit не вернул объявления. Серверный прокси не ответил. Проверь лог отладки ниже и попробуй ещё раз через 5 сек.");
        return;
      }

      const wantedMin = parseInt(amt.replace(/\D/g, ""), 10);
      const filtered: ResultItem[] = [];
      for (const it of items) {
        const priceNum = parseFloat(it.price);
        const minNum = parseFloat(String(it.minAmount).replace(/,/g, ""));
        if (!isBankTransfer(it.payments)) continue;
        if (Math.abs(minNum - wantedMin) > 0.5) continue;
        const filter = checkDescription(it.remark);
        if (!filter.allowed) continue;
        filtered.push({ ...it, filter, priceNum, minNum, maxNum: parseFloat(String(it.maxAmount).replace(/,/g, "")) });
      }
      filtered.sort((a, b) => a.priceNum - b.priceNum);
      setResults(filtered);
      if (filtered.length === 0) {
        setError(`Нашлось ${rc} объявлений Bank Transfer, но после фильтров (ровно от ${formatAmount(amt)} RUB и «принимает от 3 лиц») ничего не осталось.`);
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
    <div className="min-h-screen bg-[#0B0E11] text-[#EAECEF] selection:bg-[#FCD535]/30">
      {/* thin top line like Bybit */}
      <div className="h-[2px] w-full bg-[#FCD535]" />

      <div className="mx-auto max-w-[1120px] px-4 sm:px-6 py-5">
        {/* HEADER - Bybit style: black, sharp, yellow accent */}
        <header className="bg-[#151A21] border border-[#2B3139] border-l-[3px] border-l-[#FCD535] flex flex-col sm:flex-row sm:items-center justify-between gap-4 px-4 py-3.5">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 bg-[#FCD535] flex items-center justify-center text-black font-black text-[16px] leading-none">◈</div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-[18px] font-black tracking-[0.04em] text-white">FLIPWAY</h1>
                <span className="text-[10px] tracking-[0.16em] font-bold px-2 py-0.5 bg-[#2B3139] text-[#848E9C] border border-[#2B3139]">P2P PARSER</span>
                <span className="hidden sm:inline text-[10px] font-bold px-1.5 py-0.5 bg-[#FCD535] text-black">BYBIT</span>
              </div>
              <p className="text-[12px] leading-none text-[#848E9C] font-medium">Bybit · USDT/RUB · Bank Transfer · от 3-х лиц</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#0B0E11] border border-[#2B3139] text-[11px] font-bold tracking-wide text-[#848E9C]">
              <span className="h-2 w-2 bg-[#0ECB81]" /> LIVE P2P
            </span>
            <a
              href="https://www.bybit.com/fiat/trade/otc/?actionType=0&token=USDT&fiat=RUB&amount=5000"
              target="_blank"
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#FCD535] text-black font-black text-[12px] tracking-wide hover:bg-[#F0B90B] transition"
            >
              ОТКРЫТЬ BYBIT P2P <ExternalLink size={14} />
            </a>
          </div>
        </header>

        {/* FILTERS PANEL - sharp, black/gray, bybit style */}
        <div className="mt-4 bg-[#151A21] border border-[#2B3139] overflow-hidden">
          {/* title bar */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-[#2B3139] bg-[#1E2329]">
            <h2 className="text-[13px] font-black tracking-wide flex items-center gap-2 text-white">
              <Filter size={14} className="text-[#FCD535]" /> ФИЛЬТРЫ
            </h2>
            <span className="hidden sm:inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 bg-[#0B0E11] border border-[#2B3139] text-[#848E9C]">
              <ShieldCheck size={12} className="text-[#0ECB81]" /> Безопасный фильтр по описанию
            </span>
          </div>

          <div className="p-4 flex flex-col gap-4">
            <p className="text-[12px] leading-5 text-[#848E9C]">
              Ищем <b className="text-white font-black">покупку USDT за RUB</b> · оплата <b className="text-white font-black">Bank Transfer</b> · лимит{" "}
              <b className="text-white font-black">ровно от 5 000 RUB</b> · в описании <b className="text-[#FCD535]">явно разрешено от 3-х лиц</b>. Если пусто — скип.
              Если есть суммы в тексте — покажем отдельным блоком.
            </p>

            <div className="grid grid-cols-12 gap-3">
              <div className="col-span-12 sm:col-span-5 lg:col-span-3">
                <label className="text-[11px] tracking-[0.12em] font-black text-[#848E9C]">СУММА ПОКУПКИ</label>
                <div className="mt-1.5 relative">
                  <Banknote size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#474D57]" />
                  <input
                    value={amount}
                    onChange={(e) => setAmount(e.target.value.replace(/[^\d\s]/g, ""))}
                    placeholder="5000"
                    className="w-full h-11 pl-9 pr-12 bg-[#0B0E11] border border-[#2B3139] outline-none focus:border-[#FCD535] text-[15px] font-bold mono text-white placeholder:text-[#474D57]"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-black text-[#848E9C]">RUB</span>
                </div>
                <div className="mt-1 text-[11px] text-[#5E6673]">Только где min = {formatAmount(amount || "5000")} ₽</div>
              </div>

              <div className="col-span-12 sm:col-span-7 lg:col-span-5 grid grid-cols-3 gap-2 self-end">
                {[
                  { k: "USDT", v: "USDT", sub: "крипта" },
                  { k: "RUB", v: "RUB", sub: "фиат" },
                  { k: "BANK", v: "Bank Transfer", sub: "оплата" },
                ].map((b) => (
                  <div key={b.k} className="h-11 bg-[#0B0E11] border border-[#2B3139] flex flex-col justify-center px-3">
                    <div className="text-[12px] font-black leading-none text-white">{b.v}</div>
                    <div className="text-[10px] tracking-[0.12em] text-[#848E9C] font-bold">{b.sub.toUpperCase()}</div>
                  </div>
                ))}
              </div>

              <div className="col-span-12 lg:col-span-4 flex items-end gap-2">
                <button
                  onClick={doSearch}
                  disabled={loading}
                  className="flex-1 h-11 bg-[#FCD535] text-black font-black text-[13px] tracking-[0.06em] flex items-center justify-center gap-2 hover:bg-[#F0B90B] active:brightness-95 transition disabled:opacity-60"
                >
                  {loading ? <RefreshCw size={16} className="animate-spin" /> : <Search size={16} />}
                  {loading ? "ИЩЕМ..." : "НАЙТИ ПРЕДЛОЖЕНИЯ"}
                </button>
                <button
                  onClick={() => setShowDebug((s) => !s)}
                  className="h-11 w-11 bg-[#0B0E11] border border-[#2B3139] flex items-center justify-center hover:bg-[#1E2329] transition text-[#848E9C]"
                  title="Отладка"
                >
                  <ChevronDown size={16} className={`transition ${showDebug ? "rotate-180" : ""}`} />
                </button>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-[11px] font-bold">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-[#0B0E11] border border-[#2B3139] text-[#848E9C]">
                <ArrowUpDown size={12} /> Сортировка: от меньшей цены к большей
              </span>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-[#FCD535]/10 border border-[#FCD535]/30 text-[#FCD535]">
                Bank Transfer
              </span>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-[#1E2329] border border-[#2B3139] text-[#848E9C]">
                <MessageSquareText size={12} /> Пустое описание = скип
              </span>
            </div>
          </div>

          {showDebug && (
            <div className="border-t border-[#2B3139] bg-[#0B0E11] p-4">
              <div className="text-[11px] tracking-[0.14em] font-black text-[#848E9C]">ОТЛАДКА / ЛОГИ</div>
              <div className="mt-2 grid sm:grid-cols-2 gap-3">
                <div className="bg-[#151A21] border border-[#2B3139] p-3">
                  <div className="text-[12px] font-black text-white">Параметры</div>
                  <div className="mono text-[12px] text-[#848E9C] mt-1">token=USDT · fiat=RUB · amount={amount} · side=0 · через /api/bybit/p2p</div>
                </div>
                <div className="bg-[#151A21] border border-[#2B3139] p-3">
                  <div className="text-[12px] font-black text-white">Лог</div>
                  <div className="mono text-[11px] text-[#848E9C] mt-1 max-h-28 overflow-auto whitespace-pre-wrap">{debug.length ? debug.join("\n") : "— нажми Найти —"}</div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* STATS */}
        {(results.length > 0 || rawCount > 0) && (
          <div className="mt-4 grid grid-cols-12 gap-3">
            <div className="col-span-12 sm:col-span-5 lg:col-span-4 bg-[#151A21] border border-[#2B3139] p-3.5 flex items-center justify-between">
              <div>
                <div className="text-[11px] tracking-[0.14em] font-black text-[#848E9C]">НАЙДЕНО ПОДХОДЯЩИХ</div>
                <div className="text-[24px] font-black leading-none mt-1 text-white">{results.length}</div>
                <div className="text-[11px] text-[#848E9C] font-bold">из {rawCount} проверенных</div>
              </div>
              <div className="h-10 w-10 bg-[#0ECB81]/10 border border-[#0ECB81]/20 flex items-center justify-center text-[#0ECB81]">
                <CheckCircle2 size={18} />
              </div>
            </div>
            <div className="col-span-12 sm:col-span-7 lg:col-span-5 bg-[#151A21] border border-[#2B3139] p-3.5">
              <div className="text-[11px] tracking-[0.14em] font-black text-[#848E9C]">ЦЕНЫ (RUB за USDT)</div>
              {stats ? (
                <div className="mt-1 flex items-baseline gap-3 flex-wrap text-white">
                  <div className="text-[13px] font-black">
                    от <span className="mono text-[#FCD535]">{stats.min.toFixed(2)}</span> ₽
                  </div>
                  <div className="text-[13px] font-black">
                    до <span className="mono">{stats.max.toFixed(2)}</span> ₽
                  </div>
                  <div className="text-[11px] text-[#848E9C] font-bold">
                    средн <span className="mono">{stats.avg.toFixed(2)}</span>
                  </div>
                </div>
              ) : (
                <div className="text-sm text-[#474D57] mt-1">—</div>
              )}
              <div className="text-[11px] text-[#5E6673] mt-1 flex items-center gap-1 font-bold tracking-wide">
                <Info size={11} /> Сортировка от дешевых к дорогим
              </div>
            </div>
            <div className="hidden lg:flex col-span-3 bg-[#FCD535] border border-[#FCD535] p-3.5 items-center gap-3 text-black">
              <div className="h-10 w-10 bg-black text-[#FCD535] flex items-center justify-center font-black">✓</div>
              <div>
                <div className="text-[12px] font-black leading-none">Только «от 3 лиц»</div>
                <div className="text-[11px] font-bold opacity-70">Пустые описания отфильтрованы</div>
              </div>
            </div>
          </div>
        )}

        {error && (
          <div className="mt-4 bg-[#2A1A0A] border border-[#F0B90B]/30 border-l-[3px] border-l-[#F0B90B] p-3.5 flex gap-3">
            <AlertTriangle size={18} className="text-[#F0B90B] shrink-0 mt-0.5" />
            <div className="text-[13px] leading-5 text-[#EAECEF] font-medium">{error}</div>
          </div>
        )}

        <div className="mt-5">
          {!results.length && !loading && !error && (
            <div className="bg-[#151A21] border border-[#2B3139] p-8 sm:p-10 text-center">
              <div className="mx-auto h-12 w-12 bg-[#0B0E11] border border-[#2B3139] flex items-center justify-center">
                <Search size={20} className="text-[#848E9C]" />
              </div>
              <div className="mt-3 text-[15px] font-black text-white tracking-wide">ГОТОВ К ПОИСКУ</div>
              <div className="mt-1 text-[13px] text-[#848E9C] max-w-[560px] mx-auto">
                Нажми <span className="text-white font-black">«НАЙТИ ПРЕДЛОЖЕНИЯ»</span> — парсер пойдет через серверный прокси, отфильтрует по Bank
                Transfer, лимиту ровно {formatAmount(amount || "5000")} ₽ и тексту «от 3 лиц».
              </div>
              <div className="mt-4 inline-flex items-center gap-2 text-[11px] font-bold px-3 py-1.5 bg-[#0B0E11] border border-[#2B3139] text-[#848E9C]">
                <ShieldCheck size={12} /> Работает по кнопке через бэкенд — без CORS
              </div>
            </div>
          )}

          {loading && (
            <div className="grid gap-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="bg-[#151A21] border border-[#2B3139] p-4 animate-pulse">
                  <div className="h-4 w-32 bg-[#2B3139]" />
                  <div className="mt-3 h-3 w-full bg-[#1E2329]" />
                  <div className="mt-2 h-3 w-2/3 bg-[#1E2329]" />
                </div>
              ))}
              <div className="text-center text-[12px] text-[#848E9C] font-bold">Запрашиваем Bybit P2P через сервер…</div>
            </div>
          )}

          {!!results.length && (
            <div className="grid gap-3">
              <div className="text-[11px] tracking-[0.14em] font-black text-[#848E9C] px-1">РЕЗУЛЬТАТЫ — {results.length} · ОТ ДЕШЕВЫХ К ДОРОГИМ</div>
              {results.map((it) => (
                <div key={it.id} className="bg-[#151A21] border border-[#2B3139] hover:border-[#474D57] transition overflow-hidden">
                  <div className="p-4 flex flex-col gap-3">
                    <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-3">
                      <div className="flex gap-3">
                        <div className="shrink-0 min-w-[150px]">
                          <div className="text-[11px] tracking-[0.14em] font-black text-[#848E9C]">ЦЕНА</div>
                          <div className="flex items-baseline gap-1">
                            <span className="text-[22px] font-black mono leading-none text-white">{Number(it.price).toFixed(2)}</span>
                            <span className="text-[12px] font-black text-[#848E9C]">₽</span>
                            <span className="text-[11px] text-[#5E6673] font-bold">/ USDT</span>
                          </div>
                          <div className="mt-1 inline-flex items-center gap-1.5 text-[11px] font-bold px-2 py-1 bg-[#0B0E11] border border-[#2B3139] mono text-[#EAECEF]">
                            <Wallet size={11} /> {formatAmount(it.minAmount)} – {formatAmount(it.maxAmount)} RUB
                          </div>
                        </div>

                        <div className="hidden sm:block w-px bg-[#2B3139] self-stretch mx-1" />

                        <div className="min-w-0">
                          <div className="text-[11px] tracking-[0.14em] font-black text-[#848E9C]">МЕРЧАНТ</div>
                          <div className="flex items-center gap-2 mt-1">
                            <div className="h-8 w-8 bg-[#2B3139] border border-[#474D57] flex items-center justify-center font-black text-[12px] text-white">
                              {it.nickName.slice(0, 1).toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <div className="text-[13px] font-black leading-none flex items-center gap-1.5 text-white">
                                <span className="truncate max-w-[160px] sm:max-w-[200px]">{it.nickName}</span>
                                {it.isAuthMaker && (
                                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-[#0ECB81]/15 border border-[#0ECB81]/30 text-[#0ECB81] text-[10px] font-black">
                                    <BadgeCheck size={10} /> ВЕРИФ
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-2 mt-1 text-[11px] font-bold text-[#848E9C]">
                                <span className="inline-flex items-center gap-1">
                                  <User size={11} /> {it.finishedNum ?? it.recentOrderNum ?? "—"} ордеров
                                </span>
                                <span className="hidden sm:inline text-[#2B3139]">|</span>
                                <span className="inline-flex items-center gap-1 text-[#0ECB81]">
                                  <CheckCircle2 size={11} /> {it.completedRate ? `${Number(it.completedRate).toFixed(0)}%` : it.recentExecuteRate ? `${Number(it.recentExecuteRate).toFixed(0)}%` : "—"} выполн.
                                </span>
                              </div>
                            </div>
                          </div>
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {it.payments.slice(0, 4).map((p, idx) => (
                              <span key={idx} className="text-[10px] font-black tracking-wide px-2 py-1 bg-[#FCD535]/10 border border-[#FCD535]/30 text-[#FCD535]">
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
                          className="flex-1 lg:flex-none inline-flex items-center justify-center gap-2 h-10 px-4 bg-[#FCD535] text-black font-black text-[12px] tracking-wide hover:bg-[#F0B90B] transition"
                        >
                          ОТКРЫТЬ НА BYBIT <ExternalLink size={14} />
                        </a>
                        <button
                          onClick={() => copyLink(it)}
                          className="h-10 px-3 bg-[#0B0E11] border border-[#2B3139] hover:bg-[#1E2329] transition inline-flex items-center gap-1.5 text-[12px] font-black text-[#EAECEF]"
                        >
                          <Copy size={14} /> {copiedId === it.id ? "СКОПИРОВАНО" : "ССЫЛКА"}
                        </button>
                      </div>
                    </div>

                    {it.filter.extractedAmounts.length > 0 && (
                      <div className="bg-[#FCD535]/10 border border-[#FCD535]/30 border-l-[3px] border-l-[#FCD535] px-3 py-2 flex flex-wrap items-center gap-2">
                        <span className="inline-flex items-center gap-1.5 text-[11px] font-black tracking-[0.12em] text-[#FCD535]">
                          <AlertTriangle size={12} /> ТОЛЬКО НА СУММЫ:
                        </span>
                        <span className="flex flex-wrap gap-1.5">
                          {it.filter.extractedAmounts.map((a) => (
                            <span key={a} className="mono text-[12px] font-black px-2 py-1 bg-[#FCD535] text-black">
                              {a} ₽
                            </span>
                          ))}
                        </span>
                        <span className="text-[11px] text-[#848E9C] font-bold">из описания</span>
                      </div>
                    )}

                    <div className="bg-[#0B0E11] border border-[#2B3139] p-3">
                      <div className="flex items-center gap-2 text-[11px] tracking-[0.14em] font-black text-[#848E9C]">
                        <MessageSquareText size={12} /> ОПИСАНИЕ МЕРЧАНТА
                        <span className="ml-auto inline-flex items-center gap-1.5 text-[11px] font-black px-2 py-1 bg-[#0ECB81]/10 border border-[#0ECB81]/30 text-[#0ECB81]">
                          <CheckCircle2 size={11} /> {it.filter.reason}
                        </span>
                      </div>
                      <div className="mt-2 text-[13px] leading-5 text-[#EAECEF] whitespace-pre-wrap break-words font-medium">{it.remark || "—"}</div>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {it.filter.positiveFound.map((t) => (
                          <span key={t} className="text-[10px] font-black px-2 py-1 bg-[#0ECB81]/10 border border-[#0ECB81]/30 text-[#0ECB81]">
                            ✓ {t}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 text-[11px] text-[#5E6673] font-bold mono">
                      <span>ID: {it.id.slice(0, 12)}…</span>
                      <span className="text-[#2B3139]">|</span>
                      <span>
                        Лимит: {formatAmount(it.minAmount)}–{formatAmount(it.maxAmount)} ₽
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <footer className="mt-8 bg-[#151A21] border border-[#2B3139] p-4 flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
          <div className="text-[12px] text-[#848E9C] font-medium">
            Flipway — парсер Bybit P2P · фильтрует только лимиты <b className="text-white font-black">ровно от {formatAmount(amount || "5000")} ₽</b>, Bank Transfer и явные упоминания о 3-х лицах. Сортировка по цене.
          </div>
          <div className="text-[11px] text-[#5E6673] font-bold">Не является финансовым советом. Проверяй мерчанта на Bybit.</div>
        </footer>
      </div>
    </div>
  );
}
