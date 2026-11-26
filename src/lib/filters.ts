export interface FilterResult {
  allowed: boolean;
  positiveFound: string[];
  negativeFound: string[];
  isEmpty: boolean;
  extractedAmounts: string[];
  reason: string;
}

// Позитивные паттерны - явно разрешают 3-х лиц
const POSITIVE_PATTERNS: { re: RegExp; label: string }[] = [
  { re: /от\s*3[\s\-–]*(их|х|ех)?\s*лиц/i, label: "от 3 лиц" },
  { re: /третьих\s*лиц/i, label: "третьих лиц" },
  { re: /третьи\s*лица/i, label: "третьи лица" },
  { re: /3\s*лица/i, label: "3 лица" },
  { re: /\b3\s*лиц\b/i, label: "3 лиц" },
  { re: /3[\s\-–]*е\s*лиц[оа]/i, label: "3-е лицо" },
  { re: /с\s*чужих/i, label: "с чужих" },
  { re: /с\s*третьих/i, label: "с третьих" },
  { re: /чужая\s*карта/i, label: "чужая карта" },
  { re: /чужой\s*карт/i, label: "чужой карт" },
  { re: /принимаю\s*с\s*(чужих|третьих|любых|сторонних)/i, label: "принимаю с чужих/третьих" },
  { re: /с\s*любой\s*карты/i, label: "с любой карты" },
  { re: /любой\s*карты/i, label: "любой карты" },
  { re: /оплата\s*с\s*любой/i, label: "оплата с любой" },
  { re: /не\s*важно\s*чья/i, label: "не важно чья" },
  { re: /неважно\s*чья/i, label: "неважно чья" },
  { re: /не\s*важно\s*на\s*кого/i, label: "не важно на кого" },
  { re: /принимаю\s*от\s*всех/i, label: "принимаю от всех" },
  { re: /от\s*любых\s*лиц/i, label: "от любых лиц" },
  { re: /сторонн/i, label: "сторонн" },
  { re: /от\s*3[\s\-–]*го\s*лица/i, label: "от 3-го лица" },
  { re: /3\s*лица\s*можно/i, label: "3 лица можно" },
  { re: /3\s*лиц\s*можно/i, label: "3 лиц можно" },
];

// Негативные паттерны - запрещают 3-х лиц
const NEGATIVE_PATTERNS: { re: RegExp; label: string }[] = [
  { re: /не\s*принимаю\s*(от|с)\s*(3|третьих|чужих|сторонних)/i, label: "не принимаю от 3/третьих" },
  { re: /третьи\s*лица\s*не/i, label: "третьи лица не" },
  { re: /третьих\s*лиц\s*не\s*принима/i, label: "третьих лиц не принимаю" },
  { re: /только\s*(со\s*своей|с\s*личной|с\s*своей|со\s*своего)/i, label: "только со своей" },
  { re: /только\s*личн/i, label: "только личн" },
  { re: /только\s*на\s*сво[еёйю]/i, label: "только на своё" },
  { re: /только\s*сво[яиё]/i, label: "только своя" },
  { re: /своя\s*карта/i, label: "своя карта (негатив контекст)" },
  { re: /своё\s*имя/i, label: "своё имя" },
  { re: /своего\s*имени/i, label: "своего имени" },
  { re: /на\s*ваше\s*имя/i, label: "на ваше имя" },
  { re: /личная\s*карта/i, label: "личная карта" },
  { re: /личного\s*кабинета/i, label: "личного кабинета" },
  { re: /с\s*чуж[ойих]+\s*(карт|счет).*не/i, label: "с чужой не" },
  { re: /чуж[ао]я\s*не\s*принима/i, label: "чужая не принимаю" },
  { re: /запрещ.*третьих/i, label: "запрещ третьих" },
  { re: /не\s*работаю\s*с\s*третьими/i, label: "не работаю с третьими" },
  { re: /оплата\s*только\s*с\s*личн/i, label: "оплата только с личн" },
  { re: /карта\s*должна\s*быть\s*на\s*ваше/i, label: "карта должна быть на ваше" },
  { re: /ф\s*и\s*о\s*совпадать/i, label: "фио совпадать" },
  { re: /фио\s*должно\s*совпад/i, label: "фио должно совпадать" },
  { re: /именн(ая|ой)\s*карт/i, label: "именная карта" },
];

export function extractSpecificAmounts(text: string): string[] {
  if (!text) return [];
  // ищем числа 4-6 цифр, возможно с пробелом или точкой: 5 300, 5300, 10 000, 53,000, 5300р
  // также 5к, 10к
  const amounts: Set<string> = new Set();

  // 1) числа типа 5300, 5 300, 10 000, 100000
  const numRe = /\b(\d{1,3}(?:[\s.,]\d{3})+|\d{4,6})\s*(?:р|руб|₽)?\b/gi;
  let m: RegExpExecArray | null;
  while ((m = numRe.exec(text)) !== null) {
    const raw = m[0];
    const digits = raw.replace(/[^\d]/g, "");
    const n = parseInt(digits, 10);
    if (n >= 1000 && n <= 200000) {
      // фильтруем только суммы в диапазоне p2p, исключаем года/прочее
      // форматируем красиво: 5300 -> 5 300
      const formatted = n.toLocaleString("ru-RU");
      amounts.add(formatted);
    }
  }

  // 2) сокращения 5к, 10к, 5.3к
  const kRe = /\b(\d{1,3}(?:[.,]\d+)?)\s*к\b/gi;
  while ((m = kRe.exec(text)) !== null) {
    const val = parseFloat(m[1].replace(",", "."));
    if (!isNaN(val)) {
      const n = Math.round(val * 1000);
      if (n >= 5000 && n <= 200000) {
        amounts.add(n.toLocaleString("ru-RU"));
      }
    }
  }

  return Array.from(amounts).sort((a, b) => parseInt(a.replace(/\D/g, "")) - parseInt(b.replace(/\D/g, "")));
}

export function checkDescription(raw: string | null | undefined): FilterResult {
  const text = (raw || "").trim();
  const extractedAmounts = extractSpecificAmounts(text);

  if (!text) {
    return {
      allowed: false,
      positiveFound: [],
      negativeFound: [],
      isEmpty: true,
      extractedAmounts,
      reason: "Пустое описание — скип",
    };
  }

  const positiveFound: string[] = [];
  const negativeFound: string[] = [];

  for (const p of NEGATIVE_PATTERNS) {
    if (p.re.test(text)) negativeFound.push(p.label);
  }
  // если есть негатив — сразу не подходит, даже если есть позитив
  if (negativeFound.length > 0) {
    return {
      allowed: false,
      positiveFound: [],
      negativeFound,
      isEmpty: false,
      extractedAmounts,
      reason: `Найден запрет: ${negativeFound.join(", ")}`,
    };
  }

  for (const p of POSITIVE_PATTERNS) {
    if (p.re.test(text)) positiveFound.push(p.label);
  }

  if (positiveFound.length === 0) {
    return {
      allowed: false,
      positiveFound: [],
      negativeFound: [],
      isEmpty: false,
      extractedAmounts,
      reason: "Нет явного разрешения от 3 лиц — скип",
    };
  }

  return {
    allowed: true,
    positiveFound,
    negativeFound: [],
    isEmpty: false,
    extractedAmounts,
    reason: `Разрешено: ${positiveFound.join(", ")}`,
  };
}
