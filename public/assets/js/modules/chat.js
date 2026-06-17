// CHAT MODULE: Handles Chat, Logs, Formatting, and Translation
const chatListEl = document.getElementById("chat-list");
const scrollBtn = document.getElementById("chat-scroll-btn");
const REGEX_WAIT = /(?:wait (\d+) seconds|保留\s+(\d+)\s+秒到下一回合|等待[:：]?\s*(\d+)\s*秒?)/i;

const CHAT_CHANNEL_ALIASES = {
  logs: [
    "game log",
    "fight log",
    "combat",
    "information",
    "informaci?n",
    "registro",
    "lutas",
    "\u6218\u6597\u65e5\u5fd7",
    "\u9519\u8bef\u4fe1\u606f",
    "\u7cfb\u7edf",
  ],
  vicinity: ["vicinity", "proximit", "local", "vizinhan?a", "\u672c\u5730", "\u9644\u8fd1"],
  private: ["private", "whisper", "priv", "sussurro", "\u79c1\u804a", "\u5bc6\u8bed"],
  group: ["group", "groupe", "grupo", "\u7ec4\u961f", "\u961f\u4f0d"],
  guild: ["guild", "guilde", "gremio", "\u516c\u4f1a"],
  trade: ["trade", "commerce", "comercio", "\u4ea4\u6613"],
  community: ["community", "communaut", "comunidad", "comunidade", "\u793e\u533a"],
  recruitment: [
    "recruitment",
    "recrutement",
    "reclutamiento",
    "recrutamento",
    "\u62db\u52df",
    "\u82f1\u6587\u62db\u52df",
  ],
  politics: ["politic"],
  pvp: ["pvp", "jcj", "camp"],
};

function containsChineseText(text) {
  return /[\u3400-\u9FFF]/.test(text);
}

function getDefaultTranslationTarget(text, preferredTarget) {
  return containsChineseText(text) ? preferredTarget : "zh-CN";
}

function getChatListNode() {
  if (chatListEl) return chatListEl;
  if (typeof getUI === "function") return getUI("chat-list");
  return document.getElementById("chat-list");
}

function getChatElement(id) {
  if (typeof getUI === "function") return getUI(id);
  return document.getElementById(id);
}

function isTargetLanguageMatch(detectedLang, targetLang) {
  const detected = String(detectedLang || "").toLowerCase();
  const target = String(targetLang || "").toLowerCase();
  if (!detected || !target) return false;

  if (target.startsWith("en")) return detected.startsWith("en");
  if (target.startsWith("fr")) return detected.startsWith("fr");
  if (target.startsWith("es")) return detected.startsWith("es");
  if (target.startsWith("pt")) return detected.startsWith("pt");
  if (target.startsWith("zh")) return detected.startsWith("zh");

  return detected === target;
}

const WAKFU_FIXED_TRANSLATION_TERMS = [
  ["Farmer", "种植"],
  ["Fisherman", "钓鱼"],
  ["Herbalist", "草药"],
  ["Trapper", "畜牧"],
  ["Lumberjack", "伐木"],
  ["Miner", "采矿"],
  ["Baker", "面点"],
  ["Armorer", "制甲"],
  ["Jeweler", "珠宝"],
  ["Handyman", "工匠"],
  ["Leather Dealer", "皮匠"],
  ["Tailor", "裁缝"],
  ["Weapons Master", "武器大师"],
  ["Weapon Master", "武器大师"],
  ["Chef", "厨师"],
  ["Combat", "战斗"],
  ["Kamas", "卡玛"],
  ["Kama", "卡玛"],
  ["Heaven Bag", "庇护袋"],
  ["Bilbyza", "喱维萨"],
  ["Kel'Dwa Ring", "菌菇戒指"],
];

let wakfuTranslationAliases = null;
let wakfuTranslationAliasPromise = null;
let wakfuExternalGlossary = null;
let wakfuExternalGlossaryPromise = null;
let wakfuExactTermMap = null;
let wakfuFuzzyAliasIndex = null;
let azureGuideHtmlCache = "";

const WAKFU_GLOSSARY_URL = "assets/data/wakfu_term_glossary.json?v=20260617a";
const TRANSLATION_CONFIG_STORAGE_KEY = "wakfu_translation_config";
const AZURE_TRANSLATOR_ENDPOINT =
  "https://api.cognitive.microsofttranslator.com/translate?api-version=3.0";
const AZURE_TARGET_LANGUAGE_MAP = {
  "zh-CN": "zh-Hans",
};
const WAKFU_GENERIC_LATIN_ALIAS_WORDS = new Set([
  "all",
  "any",
  "area",
  "attack",
  "available",
  "back",
  "bag",
  "bags",
  "battlefield",
  "battlefields",
  "bonus",
  "book",
  "books",
  "box",
  "boxes",
  "category",
  "change",
  "chest",
  "chests",
  "color",
  "container",
  "containers",
  "control",
  "damage",
  "door",
  "doors",
  "dungeon",
  "dungeons",
  "effect",
  "effects",
  "event",
  "events",
  "filter",
  "guild",
  "hero",
  "heroes",
  "item",
  "items",
  "key",
  "market",
  "marketplace",
  "marketplaces",
  "name",
  "path",
  "player",
  "quest",
  "quests",
  "reward",
  "rewards",
  "road",
  "score",
  "sign",
  "signs",
  "spell",
  "spells",
  "state",
  "statue",
  "statues",
  "support",
  "surface",
  "title",
  "treasure",
  "treasures",
  "type",
  "wall",
  "water",
  "workspaces",
  "exit",
]);
const WAKFU_LATIN_CONNECTOR_WORDS = new Set([
  "of",
  "the",
  "and",
  "to",
  "in",
  "on",
  "for",
  "a",
  "an",
  "de",
  "du",
  "la",
  "le",
  "des",
  "da",
  "do",
  "del",
]);

function escapeTranslationRegex(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeTranslationAlias(text) {
  return String(text || "")
    .replace(/\u00A0/g, " ")
    .replace(/\u3000/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeLatinAlias(text) {
  return normalizeTranslationAlias(text)
    .toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isCjkAlias(text) {
  return /[\u3400-\u9FFF]/.test(String(text || ""));
}

function isLatinAlias(text) {
  const value = String(text || "");
  return /[A-Za-z]/.test(value) && !isCjkAlias(value);
}

function isLowValueLatinAlias(text) {
  const words = normalizeLatinAlias(text)
    .split(" ")
    .filter(Boolean)
    .filter((word) => !WAKFU_LATIN_CONNECTOR_WORDS.has(word));

  if (words.length === 0) return true;
  if (words.length === 1) {
    return WAKFU_GENERIC_LATIN_ALIAS_WORDS.has(words[0]);
  }
  return words.every((word) => WAKFU_GENERIC_LATIN_ALIAS_WORDS.has(word));
}

function shouldIndexForFuzzyMatch(entry, normalizedAlias, normalizedLatin) {
  if (!normalizedLatin) return false;

  const wordCount = normalizedLatin.split(" ").filter(Boolean).length;
  if (wordCount < 1 || wordCount > 3) return false;
  if (normalizedLatin.length < 4 || normalizedLatin.length > 24) return false;

  // Single-word fuzzy matching produces too many false positives in normal chat,
  // for example "fine" drifting into item terms such as "Fins".
  // Keep typo tolerance mainly for multi-word game names, and only allow
  // longer force-protected single words as a narrow exception.
  if (wordCount === 1) {
    return Boolean(entry.forceProtect) && normalizedLatin.length >= 6;
  }

  return true;
}

function isLikelyStandaloneGlossaryInput(text) {
  const value = normalizeTranslationAlias(text);
  if (!value || value.length > 48) return false;
  if (/[\r\n]/.test(value)) return false;
  if (/[.!?;:,，。！？；：]/.test(value)) return false;
  return value.split(/\s+/).filter(Boolean).length <= 5;
}

function buildLatinBoundaryPattern(alias) {
  return new RegExp(
    `(^|[^A-Za-z0-9])(${escapeTranslationRegex(alias)})(?=$|[^A-Za-z0-9])`,
    "gi"
  );
}

async function loadWakfuExternalGlossary() {
  if (Array.isArray(wakfuExternalGlossary)) return wakfuExternalGlossary;
  if (wakfuExternalGlossaryPromise) return wakfuExternalGlossaryPromise;

  wakfuExternalGlossaryPromise = fetch(WAKFU_GLOSSARY_URL)
    .then((response) => (response.ok ? response.json() : []))
    .then((data) => {
      wakfuExternalGlossary = Array.isArray(data) ? data : [];
      return wakfuExternalGlossary;
    })
    .catch(() => {
      wakfuExternalGlossary = [];
      return wakfuExternalGlossary;
    })
    .finally(() => {
      wakfuExternalGlossaryPromise = null;
    });

  return wakfuExternalGlossaryPromise;
}

function extractPrimaryChineseTerm(rawValue, englishName) {
  const normalizedValue = normalizeTranslationAlias(rawValue);
  if (!normalizedValue) return "";

  const withoutEnglish = normalizedValue
    .replace(new RegExp(`\\s*${escapeTranslationRegex(englishName)}\\s*$`, "i"), "")
    .trim();

  return withoutEnglish || normalizedValue;
}

async function buildWakfuTranslationAliases() {
  if (wakfuTranslationAliases) return wakfuTranslationAliases;
  if (wakfuTranslationAliasPromise) return wakfuTranslationAliasPromise;

  wakfuTranslationAliasPromise = (async () => {
    const termEntries = new Map();
    const externalGlossary = await loadWakfuExternalGlossary();

    const registerTerm = (englishName, chineseName, extraAliases = [], options = {}) => {
      const english = normalizeTranslationAlias(englishName);
      const chinese = normalizeTranslationAlias(chineseName);
      if (!english || !chinese) return;

      const existing = termEntries.get(english) || {
        english,
        chinese,
        aliases: new Set(),
        forceProtect: false,
      };

      existing.chinese = existing.chinese || chinese;
      existing.forceProtect = existing.forceProtect || Boolean(options.forceProtect);
      existing.aliases.add(english);
      existing.aliases.add(chinese);
      existing.aliases.add(`${chinese} ${english}`);

      extraAliases.forEach((alias) => {
        const normalizedAlias = normalizeTranslationAlias(alias);
        if (!normalizedAlias) return;
        existing.aliases.add(normalizedAlias);

        const primaryChinese = extractPrimaryChineseTerm(normalizedAlias, english);
        if (primaryChinese) {
          existing.aliases.add(primaryChinese);
          existing.aliases.add(`${primaryChinese} ${english}`);
        }
      });

      termEntries.set(english, existing);
    };

    if (typeof ITEM_I18N_MAP !== "undefined") {
      Object.entries(ITEM_I18N_MAP).forEach(([englishName, aliases]) => {
        if (!Array.isArray(aliases) || aliases.length === 0) return;
        const chineseName = extractPrimaryChineseTerm(aliases[0], englishName);
        registerTerm(englishName, chineseName, aliases, { forceProtect: true });
      });
    }

    WAKFU_FIXED_TRANSLATION_TERMS.forEach(([englishName, chineseName]) => {
      registerTerm(englishName, chineseName, [], { forceProtect: true });
    });

    externalGlossary.forEach((pair) => {
      if (!Array.isArray(pair) || pair.length < 2) return;
      registerTerm(pair[0], pair[1]);
    });

    const exactTermMap = new Map();
    const fuzzyAliasIndex = new Map();

    wakfuTranslationAliases = [...termEntries.values()]
      .flatMap((entry) =>
        [...entry.aliases].map((alias) => {
          const normalizedAlias = normalizeTranslationAlias(alias);
          if (!normalizedAlias || normalizedAlias.length < 2) return null;

          const latin = isLatinAlias(normalizedAlias);
          const normalizedLatin = latin ? normalizeLatinAlias(normalizedAlias) : "";
          const shouldSkipLowValueLatin =
            latin && !entry.forceProtect && isLowValueLatinAlias(normalizedAlias);

          if (shouldSkipLowValueLatin) {
            return null;
          }

          if (latin && normalizedLatin) {
            exactTermMap.set(`latin:${normalizedLatin}`, entry);
          } else if (!latin) {
            exactTermMap.set(`text:${normalizedAlias}`, entry);
          }

          if (latin) {
            const wordCount = normalizedLatin ? normalizedLatin.split(" ").filter(Boolean).length : 0;
            if (shouldIndexForFuzzyMatch(entry, normalizedAlias, normalizedLatin)) {
              const indexKey = `${wordCount}:${normalizedLatin[0]}`;
              const bucket = fuzzyAliasIndex.get(indexKey) || [];
              bucket.push({
                alias: normalizedAlias,
                normalizedLatin,
                entry,
              });
              fuzzyAliasIndex.set(indexKey, bucket);
            }
          }

          return {
            alias: normalizedAlias,
            entry,
            isLatin: latin,
            pattern: latin
              ? buildLatinBoundaryPattern(normalizedAlias)
              : new RegExp(escapeTranslationRegex(normalizedAlias), "g"),
          };
        })
      )
      .filter(Boolean)
      .sort((a, b) => b.alias.length - a.alias.length);

    wakfuExactTermMap = exactTermMap;
    wakfuFuzzyAliasIndex = fuzzyAliasIndex;
    return wakfuTranslationAliases;
  })().finally(() => {
    wakfuTranslationAliasPromise = null;
  });

  return wakfuTranslationAliasPromise;
}

function getProtectedTermOutput(entry, targetLang) {
  const target = String(targetLang || "").toLowerCase();
  if (target.startsWith("zh")) {
    return `${entry.chinese} ${entry.english}`;
  }
  return entry.english;
}

function createProtectedToken(placeholders, entry, targetLang) {
  const token = `__WAKFU_TERM_${placeholders.length}__`;
  placeholders.push({
    token,
    replacement: getProtectedTermOutput(entry, targetLang),
  });
  return token;
}

function replaceExactProtectedTerms(sourceText, aliasRows, placeholders, targetLang) {
  let protectedText = sourceText;

  aliasRows.forEach(({ pattern, entry, isLatin }) => {
    if (isLatin) {
      protectedText = protectedText.replace(pattern, (match, prefix) => {
        return `${prefix}${createProtectedToken(placeholders, entry, targetLang)}`;
      });
    } else {
      protectedText = protectedText.replace(pattern, () =>
        createProtectedToken(placeholders, entry, targetLang)
      );
    }
  });

  return protectedText;
}

function splitProtectedSegments(text) {
  return String(text || "").split(/(__WAKFU_TERM_\d+__)/g);
}

function getTypoToleranceThreshold(value) {
  if (value.length <= 6) return 1;
  if (value.length <= 12) return 2;
  return 2;
}

function getBoundedLevenshteinDistance(a, b, maxDistance) {
  if (Math.abs(a.length - b.length) > maxDistance) return maxDistance + 1;

  const prev = new Array(b.length + 1);
  const next = new Array(b.length + 1);

  for (let j = 0; j <= b.length; j++) prev[j] = j;

  for (let i = 1; i <= a.length; i++) {
    next[0] = i;
    let rowMin = next[0];

    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      next[j] = Math.min(
        prev[j] + 1,
        next[j - 1] + 1,
        prev[j - 1] + cost
      );
      rowMin = Math.min(rowMin, next[j]);
    }

    if (rowMin > maxDistance) return maxDistance + 1;

    for (let j = 0; j <= b.length; j++) prev[j] = next[j];
  }

  return prev[b.length];
}

function replaceFuzzyLatinTermsInSegment(segment, placeholders, targetLang) {
  if (!wakfuFuzzyAliasIndex || !segment || !/[A-Za-z]/.test(segment)) {
    return segment;
  }

  const words = [];
  const wordRegex = /[A-Za-z][A-Za-z'’-]*/g;
  let match;

  while ((match = wordRegex.exec(segment))) {
    words.push({
      value: match[0],
      start: match.index,
      end: match.index + match[0].length,
    });
  }

  if (words.length === 0) return segment;

  let output = "";
  let cursor = 0;
  let index = 0;

  while (index < words.length) {
    let matched = false;

    for (let wordCount = 3; wordCount >= 1; wordCount--) {
      if (index + wordCount > words.length) continue;

      let gapsAreSpaces = true;
      for (let gapIndex = index; gapIndex < index + wordCount - 1; gapIndex++) {
        const gap = segment.slice(words[gapIndex].end, words[gapIndex + 1].start);
        if (!/^\s+$/.test(gap)) {
          gapsAreSpaces = false;
          break;
        }
      }
      if (!gapsAreSpaces) continue;

      const start = words[index].start;
      const end = words[index + wordCount - 1].end;
      const rawCandidate = segment.slice(start, end);
      const normalizedCandidate = normalizeLatinAlias(rawCandidate);
      if (normalizedCandidate.length < 4) continue;

      const indexKey = `${wordCount}:${normalizedCandidate[0]}`;
      const bucket = wakfuFuzzyAliasIndex.get(indexKey);
      if (!bucket || bucket.length === 0) continue;

      const tolerance = getTypoToleranceThreshold(normalizedCandidate);
      const bestMatch = bucket.find(({ normalizedLatin }) => {
        const distance = getBoundedLevenshteinDistance(
          normalizedCandidate,
          normalizedLatin,
          tolerance
        );
        return distance <= tolerance;
      });

      if (!bestMatch) continue;

      output += segment.slice(cursor, start);
      output += createProtectedToken(placeholders, bestMatch.entry, targetLang);
      cursor = end;
      index += wordCount;
      matched = true;
      break;
    }

    if (!matched) {
      index += 1;
    }
  }

  output += segment.slice(cursor);
  return output;
}

function replaceFuzzyLatinTerms(text, placeholders, targetLang) {
  return splitProtectedSegments(text)
    .map((segment) =>
      /^__WAKFU_TERM_\d+__$/.test(segment)
        ? segment
        : replaceFuzzyLatinTermsInSegment(segment, placeholders, targetLang)
    )
    .join("");
}

async function lookupExactGlossaryTranslation(text, targetLang) {
  await buildWakfuTranslationAliases();

  const sourceText = String(text || "").trim();
  if (!sourceText || !wakfuExactTermMap || !isLikelyStandaloneGlossaryInput(sourceText)) {
    return null;
  }

  const latinKey = normalizeLatinAlias(sourceText);
  const directLatin = latinKey ? wakfuExactTermMap.get(`latin:${latinKey}`) : null;
  if (directLatin) {
    return {
      text: getProtectedTermOutput(directLatin, targetLang),
      lang: containsChineseText(sourceText) ? "zh-CN" : "en",
    };
  }

  const directText = wakfuExactTermMap.get(`text:${normalizeTranslationAlias(sourceText)}`);
  if (directText) {
    return {
      text: getProtectedTermOutput(directText, targetLang),
      lang: containsChineseText(sourceText) ? "zh-CN" : "en",
    };
  }

  return null;
}

async function protectWakfuTerms(text, targetLang) {
  const sourceText = String(text || "");
  if (!sourceText) {
    return { protectedText: "", placeholders: [], targetLang };
  }

  const aliasRows = await buildWakfuTranslationAliases();
  const placeholders = [];
  let protectedText = replaceExactProtectedTerms(
    sourceText,
    aliasRows,
    placeholders,
    targetLang
  );
  protectedText = replaceFuzzyLatinTerms(protectedText, placeholders, targetLang);

  return { protectedText, placeholders, targetLang };
}

function restoreWakfuTerms(text, protectedPayload) {
  let restored = String(text || "");
  (protectedPayload?.placeholders || []).forEach(({ token, replacement }) => {
    restored = restored.split(token).join(replacement);
  });
  return restored;
}

function saveTranslationConfig() {
  localStorage.setItem(
    TRANSLATION_CONFIG_STORAGE_KEY,
    JSON.stringify({
      enabled: transConfig.enabled,
      engine: transConfig.engine,
      azureApiKey: transConfig.azureApiKey,
      azureRegion: transConfig.azureRegion,
    })
  );
}

function setTranslationStatus(message, tone = "") {
  const statusEl = getChatElement("translation-test-status");
  if (!statusEl) return;

  statusEl.textContent = message || "";
  statusEl.classList.remove("is-success", "is-error");
  if (tone === "success") statusEl.classList.add("is-success");
  if (tone === "error") statusEl.classList.add("is-error");
}

function escapeGuideHtml(text) {
  return String(text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderGuideInlineMarkdown(text) {
  return escapeGuideHtml(text)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(
      /\[([^\]]+)\]\(([^)]+)\)/g,
      (_match, label, href) =>
        `<a href="${resolveGuideAssetUrl(
          href
        )}" target="_blank" rel="noopener noreferrer">${label}</a>`
    );
}

function resolveGuideAssetUrl(url) {
  const raw = String(url || "").trim();
  if (!raw) return raw;
  if (/^(?:https?:|file:|data:|blob:)/i.test(raw)) return raw;

  const normalized = raw.startsWith("/") ? raw.slice(1) : raw;
  try {
    return new URL(normalized, window.location.href).toString();
  } catch (error) {
    return raw;
  }
}

function renderAzureGuideMarkdown(markdown) {
  const lines = String(markdown || "").replace(/\r/g, "").split("\n");
  const html = [];
  let paragraphLines = [];
  let listType = null;
  let listItems = [];

  const flushParagraph = () => {
    if (!paragraphLines.length) return;
    html.push(`<p>${renderGuideInlineMarkdown(paragraphLines.join(" "))}</p>`);
    paragraphLines = [];
  };

  const flushList = () => {
    if (!listType || !listItems.length) return;
    html.push(`<${listType}>${listItems.join("")}</${listType}>`);
    listType = null;
    listItems = [];
  };

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    const trimmed = line.trim();

    if (!trimmed) {
      flushParagraph();
      flushList();
      continue;
    }

    const headingMatch = trimmed.match(/^(#{1,3})\s+(.+)$/);
    if (headingMatch) {
      flushParagraph();
      flushList();
      const level = Math.min(3, headingMatch[1].length);
      html.push(
        `<h${level}>${renderGuideInlineMarkdown(headingMatch[2])}</h${level}>`
      );
      continue;
    }

    const imageMatch = trimmed.match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
    if (imageMatch) {
      flushParagraph();
      flushList();
      html.push(
        `<figure class="markdown-guide-figure"><img src="${resolveGuideAssetUrl(
          imageMatch[2]
        )}" alt="${escapeGuideHtml(
          imageMatch[1]
        )}" />${
          imageMatch[1]
            ? `<figcaption>${escapeGuideHtml(imageMatch[1])}</figcaption>`
            : ""
        }</figure>`
      );
      continue;
    }

    const orderedMatch = trimmed.match(/^\d+\.\s+(.+)$/);
    if (orderedMatch) {
      flushParagraph();
      if (listType && listType !== "ol") flushList();
      listType = "ol";
      listItems.push(`<li>${renderGuideInlineMarkdown(orderedMatch[1])}</li>`);
      continue;
    }

    const unorderedMatch = trimmed.match(/^-\s+(.+)$/);
    if (unorderedMatch) {
      flushParagraph();
      if (listType && listType !== "ul") flushList();
      listType = "ul";
      listItems.push(`<li>${renderGuideInlineMarkdown(unorderedMatch[1])}</li>`);
      continue;
    }

    flushList();
    paragraphLines.push(trimmed);
  }

  flushParagraph();
  flushList();
  return html.join("");
}

async function ensureAzureGuideRendered() {
  const container = getChatElement("azure-guide-content");
  if (!container) return;

  if (azureGuideHtmlCache) {
    container.innerHTML = azureGuideHtmlCache;
    return;
  }

  container.innerHTML =
    '<div class="translation-provider-note">\u6b63\u5728\u52a0\u8f7d\u6559\u7a0b...</div>';

  try {
    const markdown =
      typeof window.AZURE_TRANSLATOR_GUIDE_MARKDOWN === "string"
        ? window.AZURE_TRANSLATOR_GUIDE_MARKDOWN
        : "";
    if (!markdown) {
      throw new Error("Guide markdown is unavailable.");
    }
    azureGuideHtmlCache = renderAzureGuideMarkdown(markdown);
    container.innerHTML = azureGuideHtmlCache;
  } catch (error) {
    container.innerHTML =
      '<div class="markdown-guide-error">\u6559\u7a0b\u52a0\u8f7d\u5931\u8d25\uff0c\u8bf7\u7a0d\u540e\u91cd\u8bd5\u3002</div>';
  }
}

async function openAzureGuideModal() {
  const modal = getChatElement("azure-guide-modal");
  if (modal) {
    modal.style.display = "flex";
    await ensureAzureGuideRendered();
  }
}

function closeAzureGuideModal() {
  const modal = getChatElement("azure-guide-modal");
  if (modal) modal.style.display = "none";
}

function toggleAzureApiKeyVisibility() {
  const input = getChatElement("azure-api-key-input");
  const toggleBtn = document.querySelector(".translation-secret-toggle");
  if (!input) return;

  const isHidden = input.type === "password";
  input.type = isHidden ? "text" : "password";
  if (toggleBtn) {
    toggleBtn.setAttribute(
      "title",
      isHidden
        ? "\u9690\u85cf\u5bc6\u94a5"
        : "\u663e\u793a\u6216\u9690\u85cf\u5bc6\u94a5"
    );
  }
}

function openTranslationConfigModal() {
  syncTranslationConfigUI();
  setTranslationStatus("");
  const modal = getChatElement("translation-config-modal");
  if (modal) modal.style.display = "flex";
}

function closeTranslationConfigModal() {
  const modal = getChatElement("translation-config-modal");
  if (modal) modal.style.display = "none";
}

function mapTargetLanguageForEngine(engine, targetLang) {
  if (engine === "azure") {
    return AZURE_TARGET_LANGUAGE_MAP[targetLang] || targetLang;
  }
  return targetLang;
}

function getActiveTranslationEngine() {
  return transConfig.engine === "azure" ? "azure" : "google";
}

async function requestGoogleTranslation(text, targetLang) {
  const sourceUrl = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${targetLang}&dt=t&q=${encodeURIComponent(text)}`;
  const response = await fetch(sourceUrl);
  if (!response.ok) {
    throw new Error(`Google translation request failed: ${response.status}`);
  }
  const data = await response.json();
  if (!data || !data[0]) return null;

  return {
    text: data[0].map((x) => x[0]).join(""),
    lang: data[2] || "",
  };
}

async function requestAzureTranslation(text, targetLang) {
  const apiKey = String(transConfig.azureApiKey || "").trim();
  const region = String(transConfig.azureRegion || "").trim();

  if (!apiKey) {
    throw new Error("Missing Azure API key");
  }

  const resolvedTarget = mapTargetLanguageForEngine("azure", targetLang);
  const response = await fetch(
    `${AZURE_TRANSLATOR_ENDPOINT}&to=${encodeURIComponent(resolvedTarget)}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=UTF-8",
        "Ocp-Apim-Subscription-Key": apiKey,
        ...(region ? { "Ocp-Apim-Subscription-Region": region } : {}),
      },
      body: JSON.stringify([{ Text: text }]),
    }
  );

  if (!response.ok) {
    let errorMessage = `Azure translation request failed: ${response.status}`;
    try {
      const errorData = await response.json();
      const details = errorData?.error?.message || errorData?.message;
      if (details) errorMessage = details;
    } catch (error) {}
    throw new Error(errorMessage);
  }

  const data = await response.json();
  const firstResult = Array.isArray(data) ? data[0] : null;
  const firstTranslation = firstResult?.translations?.[0];
  if (!firstTranslation?.text) return null;

  return {
    text: firstTranslation.text,
    lang: firstResult?.detectedLanguage?.language || "",
  };
}

async function requestTranslationViaProvider(text, targetLang, engine = getActiveTranslationEngine()) {
  if (engine === "azure") {
    return requestAzureTranslation(text, targetLang);
  }
  return requestGoogleTranslation(text, targetLang);
}

async function translateWithProtectedTerms(text, targetLang) {
  const exactMatch = await lookupExactGlossaryTranslation(text, targetLang);
  if (exactMatch) return exactMatch;

  const protectedPayload = await protectWakfuTerms(text, targetLang);
  const translationResult = await requestTranslationViaProvider(
    protectedPayload.protectedText,
    targetLang
  );

  if (!translationResult) return null;

  return {
    text: restoreWakfuTerms(translationResult.text, protectedPayload),
    lang: translationResult.lang,
  };
}

if (chatListEl && scrollBtn) {
  chatListEl.addEventListener("scroll", () => {
    const distanceToBottom = chatListEl.scrollHeight - chatListEl.scrollTop - chatListEl.clientHeight;
    if (distanceToBottom > 150) {
      scrollBtn.classList.add("visible");
    } else {
      scrollBtn.classList.remove("visible");
    }
  });
}

function scrollToChatBottom() {
  const list = getChatListNode();
  if (list) {
    list.scrollTop = list.scrollHeight;
    if (typeof parseFile === "function") {
      parseFile();
    }
  }
}

window.scrollToChatBottom = scrollToChatBottom;

const CHAT_COLORS = {
  Vicinity: "#cccccc",
  Private: "#00e1ff",
  Group: "#aa66ff",
  Guild: "#ffaa00",
  Trade: "#dd7700",
  Politics: "#ffff00",
  PvP: "#00aaaa",
  Community: "#3366ff",
  Recruitment: "#ff2255",
  Logs: "#bbbbbb",
  Default: "#888888",
};

let currentChatSearchTerm = "";

function processChatLog(line) {
  const parts = line.split(" - ");
  if (parts.length < 2) return;

  const rawTime = parts[0].split(",")[0];
  const localTime = formatLocalTime(rawTime);
  const rest = parts.slice(1).join(" - ");

  let channel = "General";
  let author = "";
  let message = rest;

  const bracketMatch = rest.match(/^\[(.*?)\] (.*)/);
  if (bracketMatch) {
    channel = bracketMatch[1];
    const contentAfter = bracketMatch[2];
    const authorSplit = contentAfter.indexOf(" : ");
    if (authorSplit !== -1) {
      author = contentAfter.substring(0, authorSplit);
      message = contentAfter.substring(authorSplit + 3);
    } else {
      message = contentAfter;
    }
  } else {
    const authorSplit = rest.indexOf(" : ");
    if (authorSplit !== -1) {
      author = rest.substring(0, authorSplit);
      message = rest.substring(authorSplit + 3);
      if (channel === "General") channel = "Vicinity";
    }
  }

  const cleanMessage = (" " + message).slice(1);
  addChatMessage(localTime, channel, author, cleanMessage);
}

function addChatMessage(time, channel, author, message, skipAuto = false) {
  const list = getChatListNode();
  if (!list) return;
  const isAtBottom = list.scrollHeight - list.scrollTop - list.clientHeight <= 50;

  const emptyState = list.querySelector(".empty-state");
  if (emptyState) list.innerHTML = "";

  const waitMatch = message.match(REGEX_WAIT);
  if (waitMatch) {
    const seconds = parseInt(waitMatch[1] || waitMatch[2] || waitMatch[3], 10);
    if (!Number.isNaN(seconds)) triggerChatCooldown(seconds);
  }

  while (list.children.length >= MAX_CHAT_HISTORY) {
    list.removeChild(list.firstChild);
  }

  const div = document.createElement("div");
  div.className = "chat-msg";

  const category = getCategoryFromChannel(channel);
  div.setAttribute("data-category", category);
  const color = getChannelColor(category);

  div._searchText = `[${channel}] ${author} ${message}`.toLowerCase();
  div._rawMessage = message;

  let isVisible = true;
  if (currentChatFilter === "all") {
    if (category === "logs") isVisible = false;
  } else if (currentChatFilter === "logs") {
    if (category !== "logs") isVisible = false;
  } else if (category === currentChatFilter) {
    isVisible = true;
  } else if ((category === "vicinity" || category === "private") && category !== "logs") {
    isVisible = true;
  } else {
    isVisible = false;
  }

  if (isVisible && currentChatSearchTerm.trim() !== "" && !div._searchText.includes(currentChatSearchTerm)) {
    isVisible = false;
  }

  if (!isVisible) div.classList.add("hidden-msg");

  let displayMessage = message;
  const lowerChan = channel.toLowerCase();

  if (lowerChan.includes("game log") || lowerChan.includes("\u7cfb\u7edf")) {
    displayMessage = formatGameLog(message);
  } else if (
    lowerChan.includes("fight log") ||
    lowerChan.includes("combat") ||
    lowerChan.includes("lutas") ||
    lowerChan.includes("information") ||
    lowerChan.includes("\u6218\u6597\u65e5\u5fd7")
  ) {
    displayMessage = formatFightLog(message);
  }

  const transId = "trans-" + Date.now() + "-" + Math.floor(Math.random() * 1000);
  const channelTag = `[${channel}]`;

  div.innerHTML = `
    <div class="chat-meta">
      <span class="chat-time">${time}</span>
      <span class="chat-channel" style="color:${color}">${channelTag}</span>
      <span class="chat-author" style="color:${color}">${author}</span>
      <button class="manual-trans-btn" data-tid="${transId}">翻译</button>
    </div>
    <div class="chat-content">${displayMessage}</div>
    <div id="${transId}" class="translated-block" style="display:none;"></div>
  `;

  list.appendChild(div);

  if (isAtBottom) {
    list.scrollTop = list.scrollHeight;
  }

  if (transConfig.enabled && !skipAuto) {
    if (category === "logs") return;
    queueTranslation(message, transId, false);
  }
}

if (chatListEl) {
  chatListEl.addEventListener("click", (e) => {
    if (e.target.classList.contains("manual-trans-btn")) {
      const btn = e.target;
      const msgDiv = btn.closest(".chat-msg");
      const transId = btn.dataset.tid;

      if (msgDiv && msgDiv._rawMessage) {
        queueTranslation(msgDiv._rawMessage, transId, true);
      }
    }
  });
}

function setChatFilter(filter) {
  currentChatFilter = filter;
  const docs = [document];
  if (pipWindow && pipWindow.document) docs.push(pipWindow.document);
  docs.forEach((doc) => {
    doc.querySelectorAll(".filter-btn").forEach((btn) => btn.classList.remove("active"));
  });

  let btnId = "filterALL";
  if (filter !== "all") {
    if (filter === "recruitment") btnId = "filterRECRUIT";
    else if (filter === "community") btnId = "filterCOMM";
    else if (filter === "logs") btnId = "filterLOGS";
    else btnId = "filter" + filter.toUpperCase();
  }

  docs.forEach((doc) => {
    const activeBtn = doc.getElementById(btnId);
    if (activeBtn) activeBtn.classList.add("active");
  });

  refreshChatVisibility();
}

function refreshChatVisibility() {
  const list = getChatListNode();
  if (!list) return;
  const messages = list.children;
  const isSearchActive = currentChatSearchTerm.trim() !== "";

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    if (msg.classList.contains("empty-state")) continue;

    const category = msg.getAttribute("data-category");
    let isVisible = true;

    if (currentChatFilter === "all") {
      if (category === "logs") isVisible = false;
    } else if (currentChatFilter === "logs") {
      if (category !== "logs") isVisible = false;
    } else {
      const isExact = category === currentChatFilter;
      const isExc = category === "vicinity" || category === "private";
      if (!isExact && (!isExc || currentChatFilter === "logs")) isVisible = false;
    }

    if (isVisible && isSearchActive && !msg._searchText.includes(currentChatSearchTerm)) {
      isVisible = false;
    }

    msg.classList.toggle("hidden-msg", !isVisible);
  }

  list.scrollTop = list.scrollHeight;
}

function onChatSearchInput(val) {
  currentChatSearchTerm = val.toLowerCase().trim();
  refreshChatVisibility();
}

function clearChatSearch() {
  const input = getChatElement("chat-text-filter");
  if (input) input.value = "";
  currentChatSearchTerm = "";
  refreshChatVisibility();
}

function formatGameLog(message) {
  let formatted = message;
  let isKama = false;
  const kamaRegex = /(\d+(?:[.,\s\u00A0]\d+)*)([\s\u00A0]+)(kamas?|卡玛)/gi;

  if (kamaRegex.test(formatted)) {
    isKama = true;
    formatted = formatted.replace(kamaRegex, '<span class="kama-log">$1</span>$2<span class="kama-log">$3</span>');
  }

  if (!isKama && typeof LOOT_KEYWORDS !== "undefined") {
    if (LOOT_KEYWORDS.some((kw) => message.toLowerCase().includes(kw))) {
      formatted = formatted.replace(/(?<!>)\b(\d+(?:[.,]\d+)*\s*x?)\b(?![^<]*<\/span>)/g, '<span class="loot-log">$1</span>');
    }
  }

  return formatted.replace(/"([^"<]+)"(?![^<]*>)/g, '"<b>$1</b>"');
}

function formatFightLog(message) {
  let formatted = message;
  const lower = message.toLowerCase();

  const elementMap = {
    "Fire|Feu|Fuego|Fogo|火系": { cls: "dmg-fire", icon: "sFIRE.png" },
    "Air|Aire|Ar|风系": { cls: "dmg-air", icon: "sAIR.png" },
    "Earth|Terre|Tierra|Terra|地系": { cls: "dmg-earth", icon: "sEARTH.png" },
    "Water|Eau|Agua|Água|水系": { cls: "dmg-water", icon: "sWATER.png" },
    "Light|Lumière|Luz|光系": { cls: "dmg-light", icon: "sLIGHT.png" },
    "Stasis|Stase|Estasis|Estase|创生|创生力": { cls: "dmg-stasis", icon: "sSTASIS.png" },
  };

  formatted = formatted.replace(/(?<!>)([-+]?\s?[\d,.]+)(\s+Elemental Resistance|[\s\u3000]+元素抗性)/gi, (match, numberStr) => {
    let cleanNum = numberStr.trim();
    const val = parseFloat(cleanNum.replace(/[,.\s]/g, ""));
    if (val > 0 && !cleanNum.includes("+") && !cleanNum.includes("-")) {
      cleanNum = "+" + cleanNum;
    }
    return `<span style="font-weight:bold; color:#ccc;">${cleanNum}</span> <img src="./assets/img/elements/Elemental_Resistance.png" class="element-icon" alt="Res" title="Elemental Resistance">`;
  });

  for (const [pattern, data] of Object.entries(elementMap)) {
    const regex = new RegExp(`(-\\s?[\\d,.]+)\\s+(HP|PV|PdV|生命)\\s+[（(]\\s*((?:${pattern}))\\s*[)）]`, "gi");
    formatted = formatted.replace(regex, `<span class="${data.cls}">$1 $2</span> <span class="copy-only">($3)</span><img src="./assets/img/elements/${data.icon}" class="element-icon" alt="">`);
  }

  formatted = formatted.replace(
    /(?<!>)(-\s?[\d,.]+)\s(HP|PV|PdV|生命)(?!\s*<span)(?!\s*<img)(?![^<]*<\/span>)/g,
    `<span class="game-log-number">$1 $2</span> <img src="./assets/img/elements/sNEUTRAL.png" class="element-icon" alt="">`
  );

  for (const [pattern, data] of Object.entries(elementMap)) {
    const regex = new RegExp(`(?<!>)[（(]\\s*((?:${pattern}))\\s*[)）]`, "gi");
    formatted = formatted.replace(regex, `<span class="copy-only">($1)</span><img src="./assets/img/elements/${data.icon}" class="element-icon" alt="">`);
  }

  if (lower.includes("level") || lower.includes("lvl") || lower.includes("niveau") || lower.includes("nivel") || lower.includes("级") || lower.includes("等级")) {
    formatted = formatted.replace(/(?<!>)(?:\+|-)?\b\d+(?:[.,]\d+)*\b(?![^<]*>)/g, '<span class="game-log-number">$&</span>');
  }

  return formatted.replace(/[（(]([^<>()（）]+)[)）]/g, "(<b>$1</b>)");
}

function queueTranslation(text, elementId, isManual) {
  translationQueue.push({ text, elementId, isManual });
  processTranslationQueue();
}

async function processTranslationQueue() {
  if (isTranslating || translationQueue.length === 0) return;

  const item = translationQueue[0];

  if (!transConfig.enabled && !item.isManual) {
    translationQueue.length = 0;
    return;
  }

  isTranslating = true;
  translationQueue.shift();

  try {
    if (!item.isManual && item.text.length < 3) throw new Error("Short");
    if (item.text.length < 500) {
      const result = await fetchTranslation(item.text);
      if (result) {
        const l = result.lang.toLowerCase();
        const show = item.isManual || !l.startsWith("zh");

        if (show) {
          const el = getChatElement(item.elementId);
          if (el) {
            el.style.display = "flex";
            el.innerHTML = `<span class="trans-icon">译</span> ${result.text}`;
          }
        }
      }
    }
  } catch (e) {}

  isTranslating = false;
  setTimeout(processTranslationQueue, 50);
}

async function fetchTranslation(text, targetLang = "zh-CN") {
  try {
    return await translateWithProtectedTerms(text, targetLang);
  } catch (e) {
    return null;
  }
}

function syncTranslationConfigUI() {
  const engineSelect = getChatElement("translation-engine-select");
  const azureKeyInput = getChatElement("azure-api-key-input");
  const azureRegionInput = getChatElement("azure-region-input");
  const googlePanel = getChatElement("translation-provider-google");
  const azurePanel = getChatElement("translation-provider-azure");
  const engine = getActiveTranslationEngine();

  if (engineSelect) {
    engineSelect.value = engine;
  }
  if (azureKeyInput) {
    azureKeyInput.value = transConfig.azureApiKey || "";
  }
  if (azureRegionInput) {
    azureRegionInput.value = transConfig.azureRegion || "";
  }
  if (googlePanel) {
    googlePanel.classList.toggle("hidden", engine !== "google");
  }
  if (azurePanel) {
    azurePanel.classList.toggle("hidden", engine !== "azure");
  }
}

function setTranslationEngine(engine) {
  transConfig.engine = engine === "azure" ? "azure" : "google";
  saveTranslationConfig();
  syncTranslationConfigUI();
  setTranslationStatus(
    transConfig.engine === "azure"
      ? "\u5df2\u5207\u6362\u5230 Microsoft Azure \u7ffb\u8bd1\u3002"
      : "\u5df2\u5207\u6362\u5230\u8c37\u6b4c\u7ffb\u8bd1\u3002"
  );
}

function updateAzureTranslationConfig() {
  const azureKeyInput = getChatElement("azure-api-key-input");
  const azureRegionInput = getChatElement("azure-region-input");

  transConfig.azureApiKey = String(azureKeyInput?.value || "").trim();
  transConfig.azureRegion = String(azureRegionInput?.value || "").trim();
  saveTranslationConfig();
}

async function testTranslationProvider(engine) {
  const provider = engine === "azure" ? "azure" : "google";
  setTranslationStatus(
    provider === "azure"
      ? "\u6b63\u5728\u6d4b\u8bd5 Azure \u7ffb\u8bd1\u8fde\u63a5..."
      : "\u6b63\u5728\u6d4b\u8bd5\u8c37\u6b4c\u7ffb\u8bd1\u8fde\u63a5..."
  );

  try {
    if (provider === "azure") {
      updateAzureTranslationConfig();
      if (!transConfig.azureApiKey) {
        throw new Error("\u8bf7\u5148\u586b\u5199 Azure API Key\u3002");
      }
    }

    const result = await requestTranslationViaProvider(
      "Hello from Wakfu Companion",
      "zh-CN",
      provider
    );

    if (!result?.text) {
      throw new Error("\u672a\u6536\u5230\u53ef\u7528\u7684\u7ffb\u8bd1\u7ed3\u679c\u3002");
    }

    setTranslationStatus(
      `${provider === "azure" ? "Azure" : "\u8c37\u6b4c"}\u6d4b\u8bd5\u6210\u529f\uff1a${result.text}`,
      "success"
    );
  } catch (error) {
    setTranslationStatus(
      `${provider === "azure" ? "Azure" : "\u8c37\u6b4c"}\u6d4b\u8bd5\u5931\u8d25\uff1a${error.message || error}`,
      "error"
    );
  }
}

function getCategoryFromChannel(channelName) {
  const lower = channelName.toLowerCase();
  for (const [category, aliases] of Object.entries(CHAT_CHANNEL_ALIASES)) {
    if (aliases.some((alias) => lower.includes(alias.toLowerCase()))) return category;
  }
  return "other";
}

function getChannelColor(category) {
  const map = {
    logs: CHAT_COLORS.Logs,
    vicinity: CHAT_COLORS.Vicinity,
    private: CHAT_COLORS.Private,
    group: CHAT_COLORS.Group,
    guild: CHAT_COLORS.Guild,
    trade: CHAT_COLORS.Trade,
    politics: CHAT_COLORS.Politics,
    pvp: CHAT_COLORS.PvP,
    community: CHAT_COLORS.Community,
    recruitment: CHAT_COLORS.Recruitment,
  };
  return map[category] || CHAT_COLORS.Default;
}

function openQuickTransModal() {
  const modal = document.getElementById("quick-trans-modal");
  const input = document.getElementById("qt-input");
  const counter = document.getElementById("qt-char-count");

  input.value = "";
  counter.textContent = "0";
  document.getElementById("qt-output").textContent = "...";
  document.getElementById("qt-output").style.color = "#666";

  input.oninput = function () {
    counter.textContent = this.value.length;
  };

  modal.style.display = "flex";
  input.focus();
}

function closeQuickTransModal() {
  document.getElementById("quick-trans-modal").style.display = "none";
}

async function performQuickTrans(targetLang) {
  const text = document.getElementById("qt-input").value.trim();
  const outputEl = document.getElementById("qt-output");

  if (!text) return;
  outputEl.textContent = "\u7ffb\u8bd1\u4e2d...";
  outputEl.style.color = "#888";

  try {
    const result = await translateWithProtectedTerms(text, targetLang);

    if (result) {
      const translatedText = isTargetLanguageMatch(result.lang, targetLang)
        ? text
        : result.text;
      outputEl.textContent = translatedText;
      outputEl.style.color = "var(--accent)";
    } else {
      outputEl.textContent = "\u7ffb\u8bd1\u5931\u8d25\u3002";
      outputEl.style.color = "#e74c3c";
    }
  } catch (e) {
    console.error("Quick Trans Error:", e);
    outputEl.textContent = "\u7f51\u7edc\u9519\u8bef\u3002";
    outputEl.style.color = "#e74c3c";
  }
}

function copyQuickTrans() {
  const outputEl = document.getElementById("qt-output");
  const text = outputEl.textContent;
  const btn = document.querySelector(".qt-copy-btn");

  if (
    text &&
    text !== "..." &&
    text !== "\u7ffb\u8bd1\u4e2d..." &&
    text !== "\u7f51\u7edc\u9519\u8bef\u3002"
  ) {
    navigator.clipboard.writeText(text).then(() => {
      btn.textContent = "✓";
      btn.style.color = "#2ecc71";
      setTimeout(() => {
        btn.textContent = "复制";
        btn.style.color = "";
      }, 1500);
    });
  }
}

function toggleMasterSwitch() {
  transConfig.enabled = !transConfig.enabled;
  if (!transConfig.enabled) {
    translationQueue.length = 0;
    isTranslating = false;
  }
  saveTranslationConfig();
  updateLangButtons();
}

function updateLangButtons() {
  const btnMaster = getChatElement("btnMaster");
  if (!btnMaster) return;
  if (transConfig.enabled) {
    btnMaster.className = "lang-btn master-on";
    btnMaster.textContent = "\u5df2\u5f00\u542f";
  } else {
    btnMaster.className = "lang-btn master-off";
    btnMaster.textContent = "\u5df2\u5173\u95ed";
  }
}

function triggerChatCooldown(seconds) {
  const container = getChatElement("chat-cooldown-container");
  if (!container) return;

  if (container.children.length >= 2) {
    container.removeChild(container.firstElementChild);
  }

  const pill = document.createElement("div");
  pill.className = "cooldown-pill";

  const timerId = Date.now() + Math.random();
  pill.innerHTML = `<span class="cooldown-icon">⏳</span> <span id="cd-${timerId}">${seconds}s</span>`;
  container.appendChild(pill);

  let remaining = seconds;
  const span = pill.querySelector(`#cd-${timerId}`);

  const interval = setInterval(() => {
    remaining--;
    if (span) span.textContent = `${remaining}s`;

    if (remaining <= 0) {
      clearInterval(interval);
      pill.style.animation = "fadeOutRight 0.3s ease forwards";
      setTimeout(() => {
        if (pill.parentNode) pill.parentNode.removeChild(pill);
      }, 300);
    }
  }, 1000);
}
