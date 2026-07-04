const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT_DIR = path.join(__dirname, "..");
const ITEMS_DATA_PATH = path.join(ROOT_DIR, "public", "assets", "js", "data", "items.js");
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
    inputFile: "",
    apply: false,
    zhMapFile: "",
  };

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--input-file") {
      options.inputFile = String(argv[index + 1] || "").trim();
      index += 1;
      continue;
    }
    if (value === "--zh-map-file") {
      options.zhMapFile = String(argv[index + 1] || "").trim();
      index += 1;
      continue;
    }
    if (value === "--apply") {
      options.apply = true;
    }
  }

  return options;
}

function requireInputFile(filePath) {
  if (!filePath) {
    throw new Error("Missing required --input-file");
  }
  const resolvedPath = path.isAbsolute(filePath) ? filePath : path.join(ROOT_DIR, filePath);
  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`Input file not found: ${resolvedPath}`);
  }
  return resolvedPath;
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

function parseManualListItems(text) {
  const sourceText = String(text || "");
  const rowRegex =
    /\/encyclopedia\/resources\/(\d+)-([^"]+)"><img src="[^"]*\/(\d+)\.w\d+h\d+\.png"[^>]*alt="([^"]+)"[\s\S]*?ak-rarity-(\d)[^>]*title="([^"]+)"[\s\S]*?<td class="item-type"><img [^>]*title="([^"]+)"[\s\S]*?<td class="item-level">Lvl (\d+)<\/td>/gi;

  const seen = new Set();
  const items = [];

  for (const match of sourceText.matchAll(rowRegex)) {
    const encyclopediaId = String(match[1] || "").trim();
    const slug = String(match[2] || "").trim();
    const imgId = String(match[3] || "").trim();
    const name = String(match[4] || "").trim();
    const rarity = String(match[6] || "").trim();
    const type = String(match[7] || "").trim();
    const level = Number(match[8] || 0);
    const dedupeKey = `${encyclopediaId}:${imgId}`;
    if (!encyclopediaId || seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    items.push({
      encyclopediaId,
      slug,
      imgId,
      name,
      rarity,
      type,
      level,
    });
  }

  return items;
}

function normalizeRarity(encyclopediaRarity) {
  const value = String(encyclopediaRarity || "").trim().toLowerCase();
  if (value === "unusual") return "Common";
  if (value === "rare") return "Rare";
  if (value === "mythical") return "Mythical";
  if (value === "legendary") return "Legendary";
  if (value === "souvenir") return "Souvenir";
  return encyclopediaRarity || "Common";
}

function loadZhMap(filePath) {
  if (!filePath) return {};
  const resolvedPath = path.isAbsolute(filePath) ? filePath : path.join(ROOT_DIR, filePath);
  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`zh map file not found: ${resolvedPath}`);
  }
  return JSON.parse(fs.readFileSync(resolvedPath, "utf8"));
}

function buildMissingPlan(listItems, monsterResources, itemI18nMap, zhMap) {
  const existingNames = new Set((monsterResources || []).map((item) => String(item.name || "").trim()));
  const existingI18nKeys = new Set(Object.keys(itemI18nMap || {}));

  const missingItems = [];
  const missingI18n = [];

  listItems.forEach((item) => {
    if (!existingNames.has(item.name)) {
      missingItems.push({
        name: item.name,
        level: item.level,
        rarity: normalizeRarity(item.rarity),
        imgId: item.imgId,
        encyclopediaId: item.encyclopediaId,
        slug: item.slug,
      });
    }

    if (!existingI18nKeys.has(item.name)) {
      const zhValue = String(zhMap[item.name] || "").trim();
      missingI18n.push({
        name: item.name,
        zh: zhValue,
        canApply: Boolean(zhValue),
      });
    }
  });

  return { missingItems, missingI18n };
}

function formatMonsterResourceEntry(item) {
  return [
    "  {",
    `    name: "${escapeJsString(item.name)}",`,
    `    level: ${Number(item.level || 0)},`,
    `    rarity: "${escapeJsString(item.rarity)}",`,
    `    imgId: "${escapeJsString(item.imgId)}",`,
    "  },",
  ].join("\n");
}

function formatI18nEntry(item) {
  return [
    "  ,",
    `  "${escapeJsString(item.name)}": [`,
    `    "${escapeJsString(`${item.zh}　${item.name}`)}"`,
    "  ]",
  ].join("\n");
}

function escapeJsString(value) {
  return String(value || "")
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"');
}

function applyMissingItems(filePath, missingItems) {
  if (!missingItems.length) return false;
  const original = fs.readFileSync(filePath, "utf8");
  const insertion = `\n${missingItems.map(formatMonsterResourceEntry).join("\n")}\n`;
  const next = original.replace(/\n\];\s*$/, `${insertion}];`);
  if (next === original) {
    throw new Error(`Could not locate array end in ${filePath}`);
  }
  fs.writeFileSync(filePath, next, "utf8");
  return true;
}

function applyMissingI18n(filePath, missingI18n) {
  const applicable = missingI18n.filter((item) => item.canApply);
  if (!applicable.length) return false;
  const original = fs.readFileSync(filePath, "utf8");
  const insertion = `\n${applicable.map(formatI18nEntry).join("\n")}\n`;
  const next = original.replace(/\n};\s*$/, `${insertion}};`);
  if (next === original) {
    throw new Error(`Could not locate object end in ${filePath}`);
  }
  fs.writeFileSync(filePath, next, "utf8");
  return true;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const inputPath = requireInputFile(options.inputFile);
  const html = fs.readFileSync(inputPath, "utf8");
  const listItems = parseManualListItems(html);
  const { monsterResources } = loadScriptGlobals(ITEMS_DATA_PATH, ["monsterResources"]);
  const { ITEM_I18N_MAP } = loadScriptGlobals(I18N_MAP_PATH, ["ITEM_I18N_MAP"]);
  const zhMap = loadZhMap(options.zhMapFile);

  const plan = buildMissingPlan(listItems, monsterResources, ITEM_I18N_MAP, zhMap);

  let wroteItems = false;
  let wroteI18n = false;
  if (options.apply) {
    wroteItems = applyMissingItems(ITEMS_DATA_PATH, plan.missingItems);
    wroteI18n = applyMissingI18n(I18N_MAP_PATH, plan.missingI18n);
  }

  console.log(
    JSON.stringify(
      {
        inputFile: inputPath,
        parsedCount: listItems.length,
        missingItemsCount: plan.missingItems.length,
        missingItems: plan.missingItems,
        missingI18nCount: plan.missingI18n.length,
        missingI18n: plan.missingI18n,
        applied: options.apply,
        wroteItems,
        wroteI18n,
        skippedI18nWithoutZh: plan.missingI18n.filter((item) => !item.canApply).map((item) => item.name),
      },
      null,
      2
    )
  );
}

main();
