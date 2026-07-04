const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT_DIR = path.join(__dirname, "..");
const ITEMS_DATA_PATH = path.join(ROOT_DIR, "public", "assets", "js", "data", "items.js");
const DATABASE_PATH = path.join(ROOT_DIR, "public", "assets", "js", "data", "database.js");
const I18N_MAP_PATH = path.join(
  ROOT_DIR,
  "public",
  "assets",
  "js",
  "data",
  "item_i18n_map.js"
);

function parseArgs(argv) {
  const options = {
    name: "",
    contains: "",
    kind: "all",
    verify: false,
    limit: 20,
    imageId: "",
    input: "",
    inputFile: "",
    url: "",
  };

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--name") {
      options.name = String(argv[index + 1] || "").trim();
      index += 1;
      continue;
    }
    if (value === "--contains") {
      options.contains = String(argv[index + 1] || "").trim();
      index += 1;
      continue;
    }
    if (value === "--kind") {
      options.kind = String(argv[index + 1] || "all").trim().toLowerCase();
      index += 1;
      continue;
    }
    if (value === "--limit") {
      const parsed = Number(argv[index + 1]);
      options.limit = Number.isFinite(parsed) && parsed > 0 ? parsed : 20;
      index += 1;
      continue;
    }
    if (value === "--verify") {
      options.verify = true;
      continue;
    }
    if (value === "--image-id") {
      options.imageId = String(argv[index + 1] || "").trim();
      index += 1;
      continue;
    }
    if (value === "--input") {
      options.input = String(argv[index + 1] || "");
      index += 1;
      continue;
    }
    if (value === "--input-file") {
      options.inputFile = String(argv[index + 1] || "").trim();
      index += 1;
      continue;
    }
    if (value === "--url") {
      options.url = String(argv[index + 1] || "").trim();
      index += 1;
    }
  }

  return options;
}

function loadScriptGlobals(filePath, exportedNames) {
  const code = fs.readFileSync(filePath, "utf8");
  const trailer = `\nmodule.exports = { ${exportedNames.join(", ")} };`;
  const context = {
    module: { exports: {} },
    exports: {},
    console,
  };
  vm.createContext(context);
  vm.runInContext(code + trailer, context, { filename: filePath });
  return context.module.exports;
}

function normalizeText(value) {
  return String(value || "")
    .replace(/\u00A0/g, " ")
    .replace(/\u3000/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function buildChineseAliasesMap(itemI18nMap) {
  const result = new Map();
  Object.entries(itemI18nMap || {}).forEach(([englishName, aliases]) => {
    const normalizedAliases = Array.isArray(aliases)
      ? aliases
          .map((alias) => String(alias || "").replace(/\u00A0/g, " ").replace(/\u3000/g, " ").trim())
          .filter(Boolean)
      : [];
    result.set(englishName, normalizedAliases);
  });
  return result;
}

function resolveResourceIconPath(item) {
  const imageName = String(item.imgName || item.name || "not_found").replace(/\s+/g, "_");
  return {
    localPath: path.join(ROOT_DIR, "public", "assets", "img", "resources", `${imageName}.png`),
    relativePath: `public/assets/img/resources/${imageName}.png`,
  };
}

function resolveItemIconPath(item) {
  const imageId = String(item.imgId || "").trim();
  return {
    localPath: imageId
      ? path.join(ROOT_DIR, "public", "assets", "img", "items", `${imageId}.png`)
      : "",
    relativePath: imageId ? `public/assets/img/items/${imageId}.png` : "",
    wakassetsUrl: imageId ? `https://vertylo.github.io/wakassets/items/${imageId}.png` : "",
  };
}

function pushAlias(aliasSet, value) {
  const text = String(value || "").trim();
  if (!text) return;
  aliasSet.add(text);
}

function buildEntries() {
  const { monsterResources } = loadScriptGlobals(ITEMS_DATA_PATH, ["monsterResources"]);
  const { professionItems } = loadScriptGlobals(DATABASE_PATH, ["professionItems"]);
  const { ITEM_I18N_MAP } = loadScriptGlobals(I18N_MAP_PATH, ["ITEM_I18N_MAP"]);
  const chineseAliasesMap = buildChineseAliasesMap(ITEM_I18N_MAP);

  const entries = [];
  const dedupeKeys = new Set();

  Object.entries(professionItems || {}).forEach(([profession, items]) => {
    (items || []).forEach((item) => {
      const name = String(item?.name || "").trim();
      if (!name) return;
      const dedupeKey = `resource:${profession}:${name}:${item.rarity || ""}:${item.level || 0}`;
      if (dedupeKeys.has(dedupeKey)) return;
      dedupeKeys.add(dedupeKey);

      const aliases = new Set();
      pushAlias(aliases, name);
      (chineseAliasesMap.get(name) || []).forEach((alias) => pushAlias(aliases, alias));

      const icon = resolveResourceIconPath(item);
      entries.push({
        source: "local",
        kind: "resource",
        profession,
        name,
        level: Number(item.level || 0),
        rarity: String(item.rarity || "Common"),
        imgId: "",
        imgName: String(item.imgName || item.name || ""),
        aliases: [...aliases],
        localIconPath: icon.localPath,
        localIconRelativePath: icon.relativePath,
        localIconExists: fs.existsSync(icon.localPath),
        wakassetsUrl: "",
      });
    });
  });

  (monsterResources || []).forEach((item) => {
    const name = String(item?.name || "").trim();
    if (!name) return;
    const dedupeKey = `item:${name}:${item.rarity || ""}:${item.level || 0}:${item.imgId || ""}`;
    if (dedupeKeys.has(dedupeKey)) return;
    dedupeKeys.add(dedupeKey);

    const aliases = new Set();
    pushAlias(aliases, name);
    (chineseAliasesMap.get(name) || []).forEach((alias) => pushAlias(aliases, alias));

    const icon = resolveItemIconPath(item);
    entries.push({
      source: "local",
      kind: "item",
      profession: "ALL",
      name,
      level: Number(item.level || 0),
      rarity: String(item.rarity || "Common"),
      imgId: String(item.imgId || ""),
      imgName: "",
      aliases: [...aliases],
      localIconPath: icon.localPath,
      localIconRelativePath: icon.relativePath,
      localIconExists: icon.localPath ? fs.existsSync(icon.localPath) : false,
      wakassetsUrl: icon.wakassetsUrl,
    });
  });

  return entries;
}

function matchesEntry(entry, options) {
  if (options.kind !== "all" && entry.kind !== options.kind) {
    return false;
  }

  const exactName = normalizeText(options.name);
  const contains = normalizeText(options.contains);
  const searchHaystack = [entry.name, ...(entry.aliases || [])].map(normalizeText);

  if (exactName && !searchHaystack.includes(exactName)) {
    return false;
  }

  if (contains && !searchHaystack.some((value) => value.includes(contains))) {
    return false;
  }

  return true;
}

function mapImageId(imageId) {
  const normalizedId = String(imageId || "").trim();
  const localPath = normalizedId
    ? path.join(ROOT_DIR, "public", "assets", "img", "items", `${normalizedId}.png`)
    : "";
  return {
    imgId: normalizedId,
    localIconPath: localPath,
    localIconRelativePath: normalizedId ? `public/assets/img/items/${normalizedId}.png` : "",
    localIconExists: localPath ? fs.existsSync(localPath) : false,
    wakassetsUrl: normalizedId
      ? `https://vertylo.github.io/wakassets/items/${normalizedId}.png`
      : "",
  };
}

function readManualInput(options) {
  if (options.inputFile) {
    const filePath = path.isAbsolute(options.inputFile)
      ? options.inputFile
      : path.join(ROOT_DIR, options.inputFile);
    return fs.readFileSync(filePath, "utf8");
  }

  if (options.input) return options.input;
  if (options.url) return options.url;
  return "";
}

function parseManualSource(text) {
  const sourceText = String(text || "");

  const listItems = parseManualListItems(sourceText);
  if (listItems.length) {
    return {
      source: "manual-list",
      kind: "resource-list",
      count: listItems.length,
      items: listItems,
    };
  }

  const encyclopediaMatch =
    sourceText.match(
      /https?:\/\/www\.wakfu\.com\/[a-z]{2}\/mmorpg\/encyclopedia\/(resources|items)\/(\d+)(?:-([a-z0-9-]+))?/i
    ) ||
    sourceText.match(/\/(resources|items)\/(\d+)(?:-([a-z0-9-]+))?/i);

  const imageIdMatch =
    sourceText.match(/(?:\/|^)(\d{4,})\.(?:w\d+h\d+\.)?png\b/i) ||
    sourceText.match(/content=["'][^"']*\/(\d{4,})\.png["']/i);

  const titleMatch =
    sourceText.match(/<title>\s*([^<]+?)\s*-\s*WAKFU/i) ||
    sourceText.match(/property=["']og:title["']\s+content=["']([^"']+)["']/i) ||
    sourceText.match(/<h1[^>]*>\s*([^<]+)\s*<\/h1>/i);

  const kind = encyclopediaMatch
    ? encyclopediaMatch[1].toLowerCase() === "resources"
      ? "resource"
      : "item"
    : "item";
  const encyclopediaId = encyclopediaMatch ? encyclopediaMatch[2] : "";
  const slug = encyclopediaMatch ? encyclopediaMatch[3] || "" : "";
  const imageId = imageIdMatch ? imageIdMatch[1] : "";
  const rawName = titleMatch ? titleMatch[1].trim() : "";
  const name = rawName
    .replace(/\s+[–-]\s+WAKFU.*$/i, "")
    .replace(/\s+[–-]\s+(Monster Resource|Resource|Equipment|Items?)$/i, "")
    .trim();

  const mappedImage = mapImageId(imageId);

  return {
    source: "manual-input",
    kind,
    encyclopediaId,
    slug,
    name,
    wakfuUrl: encyclopediaId
      ? `https://www.wakfu.com/en/mmorpg/encyclopedia/${kind === "resource" ? "resources" : "items"}/${encyclopediaId}${slug ? `-${slug}` : ""}`
      : "",
    ...mappedImage,
  };
}

function parseManualListItems(text) {
  const sourceText = String(text || "");
  const rowRegex =
    /\/encyclopedia\/resources\/(\d+)-([^"]+)"><img src="[^"]*\/(\d+)\.w\d+h\d+\.png"[^>]*alt="([^"]+)"[\s\S]*?ak-rarity-(\d)[^>]*title="([^"]+)"[\s\S]*?<td class="item-type"><img [^>]*title="([^"]+)"[\s\S]*?<td class="item-level">Lvl (\d+)<\/td>/gi;

  const seen = new Set();
  const items = [];

  for (const match of sourceText.matchAll(rowRegex)) {
    const encyclopediaId = String(match[1] || "").trim();
    const slug = String(match[2] || "").trim();
    const imageId = String(match[3] || "").trim();
    const name = String(match[4] || "").trim();
    const rarityRank = Number(match[5] || 0);
    const rarityLabel = String(match[6] || "").trim();
    const typeLabel = String(match[7] || "").trim();
    const level = Number(match[8] || 0);
    const dedupeKey = `${encyclopediaId}:${imageId}`;
    if (!encyclopediaId || seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    const mappedImage = mapImageId(imageId);
    items.push({
      source: "manual-list-item",
      kind: "resource",
      encyclopediaId,
      slug,
      name,
      level,
      rarityRank,
      rarity: rarityLabel,
      type: typeLabel,
      wakfuUrl: `https://www.wakfu.com/en/mmorpg/encyclopedia/resources/${encyclopediaId}${slug ? `-${slug}` : ""}`,
      ...mappedImage,
    });
  }

  return items;
}

function main() {
  const options = parseArgs(process.argv.slice(2));

  if (options.input || options.inputFile || options.url) {
    const manualInput = readManualInput(options);
    console.log(
      JSON.stringify(
        {
          query: {
            inputFile: options.inputFile || "",
            url: options.url || "",
            hasInlineInput: Boolean(options.input),
          },
          result: parseManualSource(manualInput),
        },
        null,
        2
      )
    );
    return;
  }

  if (options.imageId) {
    console.log(
      JSON.stringify(
        {
          query: { imageId: options.imageId },
          result: mapImageId(options.imageId),
        },
        null,
        2
      )
    );
    return;
  }

  const entries = buildEntries();
  const filtered = entries.filter((entry) => matchesEntry(entry, options));
  const limited = filtered.slice(0, options.limit).map((entry) => {
    if (options.verify) {
      return entry;
    }

    const { localIconPath, ...rest } = entry;
    return rest;
  });

  console.log(
    JSON.stringify(
      {
        query: {
          name: options.name || "",
          contains: options.contains || "",
          kind: options.kind,
          verify: options.verify,
          limit: options.limit,
        },
        source:
          "local catalog -> local icon / wakassets image id (official encyclopedia bulk scraping intentionally disabled due CloudFront 403)",
        totalIndexed: entries.length,
        matched: filtered.length,
        items: limited,
      },
      null,
      2
    )
  );
}

main();
