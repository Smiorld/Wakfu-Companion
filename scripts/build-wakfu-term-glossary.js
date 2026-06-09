const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const SOURCE_REF =
  process.argv[2] ||
  "backup-pre-v1-clean-history:artifacts/wakfu-i18n/wakfu_i18n_en_zh.json";
const OUTPUT_PATH =
  process.argv[3] ||
  path.join(__dirname, "..", "public", "assets", "data", "wakfu_term_glossary.json");

const CONNECTOR_WORDS = new Set([
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
  "ii",
  "iii",
  "iv",
  "v",
  "vi",
  "vii",
  "viii",
  "ix",
  "x",
  "xi",
]);

const BAD_START_WORDS = new Set([
  "can",
  "cannot",
  "makes",
  "make",
  "offer",
  "offers",
  "use",
  "uses",
  "performs",
  "prevents",
  "increases",
  "reduces",
  "gives",
  "teleports",
  "turns",
  "deactivates",
  "captures",
  "calls",
  "summons",
  "attacks",
  "throws",
  "carries",
  "links",
  "transfers",
  "adds",
  "withdraws",
  "switches",
  "tries",
  "discovers",
  "stabilizes",
  "reveals",
  "removes",
  "corresponds",
  "asks",
  "transforms",
  "misses",
  "healing",
  "opens",
  "close",
  "closes",
  "leave",
  "defeat",
  "speak",
  "intercept",
  "catch",
  "consult",
  "repair",
  "collect",
  "end",
  "finding",
]);

const BAD_INLINE_WORDS = new Set([
  "your",
  "my",
  "his",
  "her",
  "their",
  "while",
  "already",
  "still",
  "cannot",
  "impossible",
  "target",
  "allies",
  "enemies",
]);

const GENERIC_WORDS = new Set([
  "all",
  "any",
  "area",
  "attack",
  "available",
  "back",
  "bag",
  "bags",
  "barrel",
  "battlefield",
  "battlefields",
  "bed",
  "beds",
  "bid",
  "blue",
  "boat",
  "boats",
  "bomb",
  "bonus",
  "book",
  "books",
  "board",
  "boards",
  "box",
  "boxes",
  "bridge",
  "bulletin",
  "cannon",
  "cannons",
  "capture",
  "category",
  "challenge",
  "challenges",
  "change",
  "chest",
  "chests",
  "chief",
  "color",
  "completed",
  "container",
  "containers",
  "control",
  "corner",
  "crate",
  "damage",
  "database",
  "death",
  "decoration",
  "decorations",
  "directory",
  "door",
  "doors",
  "dungeon",
  "dungeons",
  "earth",
  "effect",
  "elements",
  "event",
  "events",
  "factory",
  "filter",
  "fire",
  "flower",
  "flowers",
  "follow",
  "free",
  "furious",
  "gear",
  "general",
  "glyph",
  "great",
  "guild",
  "headquarters",
  "heals",
  "hero",
  "heroes",
  "home",
  "hour",
  "island",
  "item",
  "items",
  "key",
  "lamp",
  "lamps",
  "library",
  "lights",
  "login",
  "logbook",
  "lower",
  "machine",
  "machines",
  "market",
  "marketplace",
  "marketplaces",
  "miscellaneous",
  "mobility",
  "monitor",
  "name",
  "neutral",
  "notification",
  "orb",
  "password",
  "path",
  "pillar",
  "player",
  "positioning",
  "power",
  "prisms",
  "private",
  "profession",
  "protection",
  "quest",
  "quests",
  "range",
  "rating",
  "rewards",
  "road",
  "root",
  "run",
  "saga",
  "score",
  "secondary",
  "sign",
  "signs",
  "soon",
  "speed",
  "spells",
  "state",
  "statue",
  "statues",
  "storage",
  "support",
  "surface",
  "swords",
  "tab",
  "tabs",
  "teleporter",
  "teleporters",
  "temple",
  "title",
  "treasure",
  "treasures",
  "type",
  "unknown",
  "village",
  "walk",
  "wall",
  "water",
  "workspaces",
  "exit",
]);

const BANNED_CONTENT_BUCKETS = new Set(["62", "64", "76", "92", "93", "121", "155"]);
const SINGLE_WORD_CONTENT_BUCKETS = new Set([
  "15",
  "35",
  "54",
  "89",
  "106",
  "107",
  "137",
  "151",
  "152",
]);

function normalizeText(text) {
  return String(text || "")
    .replace(/\u00A0|\u3000/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeRegex(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function stripTrailingEnglish(chinese, english) {
  return normalizeText(chinese)
    .replace(new RegExp(`\\s*${escapeRegex(english)}\\s*$`, "i"), "")
    .trim();
}

function hasPlaceholder(text) {
  return /\[#|\{[^}]*\}|<[^>]*>|%\d|%s|%1|\\n|\\t/.test(text);
}

function tokenizeEnglish(text) {
  return normalizeText(text)
    .toLowerCase()
    .split(/[^a-z0-9']+/)
    .filter(Boolean);
}

function getContentBucket(key) {
  const match = /^content\.(\d+)\./.exec(key);
  return match ? match[1] : "";
}

function isGenericEnglishTerm(english, key) {
  if (/^breed\./i.test(key) || /\.boussole\./i.test(key)) return false;

  const words = tokenizeEnglish(english).filter((word) => !CONNECTOR_WORDS.has(word));
  if (!words.length) return true;
  if (words.length === 1) return GENERIC_WORDS.has(words[0]);
  return words.every((word) => GENERIC_WORDS.has(word));
}

function looksLikeTerm(entry, english) {
  if (!english || english.length < 2 || english.length > 42) return false;
  if (!/^[A-Za-z]/.test(english)) return false;
  if (/[.!?;:,[\]()]/.test(english)) return false;
  if (/\d{4,}/.test(english)) return false;
  if (hasPlaceholder(english) || /"|\\|\*|->/.test(english)) return false;

  const words = english.split(" ").filter(Boolean);
  if (words.length === 0 || words.length > 5) return false;

  const firstWord = words[0].toLowerCase().replace(/[^a-z]/g, "");
  if (BAD_START_WORDS.has(firstWord)) return false;

  if (words.length === 1 && !/^breed\./i.test(entry.key) && !/\.boussole\./i.test(entry.key)) {
    const bucket = getContentBucket(entry.key);
    if (!SINGLE_WORD_CONTENT_BUCKETS.has(bucket)) return false;
  }

  let uppercaseTokens = 0;
  let invalidLowerTokens = 0;

  for (const word of words) {
    const bare = word.replace(/^[^A-Za-z]+|[^A-Za-z]+$/g, "");
    if (!bare) continue;

    const lower = bare.toLowerCase();
    if (BAD_INLINE_WORDS.has(lower)) return false;
    if (/^[IVX]+$/i.test(bare) || /^\d+$/.test(bare)) {
      uppercaseTokens += 1;
      continue;
    }
    if (/^[A-Z][A-Za-z'’-]*$/.test(bare)) {
      uppercaseTokens += 1;
      continue;
    }
    if (CONNECTOR_WORDS.has(lower)) continue;
    invalidLowerTokens += 1;
  }

  if (uppercaseTokens < 1 || invalidLowerTokens > 0) return false;
  if (isGenericEnglishTerm(english, entry.key)) return false;
  return true;
}

function looksLikeChineseTerm(chinese) {
  return /[\u3400-\u9FFF]/.test(chinese) &&
    chinese.length <= 24 &&
    !hasPlaceholder(chinese) &&
    !/[!?！？]/.test(chinese);
}

function isEligibleEntry(entry) {
  if (/^breed\./i.test(entry.key) || /\.boussole\./i.test(entry.key)) return true;
  if (/^battleground\.gameplay\.name\./i.test(entry.key)) return true;

  const bucket = getContentBucket(entry.key);
  if (!bucket) return false;
  return !BANNED_CONTENT_BUCKETS.has(bucket);
}

function scoreEntry(entry, chinese) {
  let score = 0;
  if (/^breed\./i.test(entry.key)) score += 50;
  if (/\.boussole\./i.test(entry.key)) score += 40;
  if (/^content\.(15|35|54|89|137)\./i.test(entry.key)) score += 10;
  if (!/[A-Za-z]/.test(chinese)) score += 25;
  if (!/[!?！？]/.test(chinese)) score += 10;
  if (/^content\.77\./i.test(entry.key)) score -= 10;
  score -= chinese.length * 0.2;
  return score;
}

function loadSourceEntries(ref) {
  const raw = execFileSync("git", ["show", ref], {
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 64,
  }).replace(/^\uFEFF/, "");

  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) {
    throw new Error("Expected source glossary JSON array.");
  }
  return parsed;
}

function buildGlossary(entries) {
  const bestByEnglish = new Map();

  for (const entry of entries) {
    if (!isEligibleEntry(entry)) continue;

    const english = normalizeText(entry.english);
    const chinese = stripTrailingEnglish(entry.chinese, english);

    if (!looksLikeTerm(entry, english) || !looksLikeChineseTerm(chinese)) continue;

    const key = english.toLowerCase();
    const candidate = {
      english,
      chinese,
      score: scoreEntry(entry, chinese),
    };
    const current = bestByEnglish.get(key);

    if (
      !current ||
      candidate.score > current.score ||
      (candidate.score === current.score && candidate.chinese.length < current.chinese.length)
    ) {
      bestByEnglish.set(key, candidate);
    }
  }

  return [...bestByEnglish.values()]
    .sort((a, b) => a.english.localeCompare(b.english))
    .map(({ english, chinese }) => [english, chinese]);
}

function main() {
  const entries = loadSourceEntries(SOURCE_REF);
  const glossary = buildGlossary(entries);

  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(glossary));

  console.log(
    JSON.stringify(
      {
        source: SOURCE_REF,
        output: OUTPUT_PATH,
        count: glossary.length,
      },
      null,
      2
    )
  );
}

main();
