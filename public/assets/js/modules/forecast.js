let currentForecastDate = new Date();
let forecastViewMode = "tab"; // 'tab' or 'grid'
let activeDungeonTab = "classic"; // 'classic' or 'modular'
let currentForecastLang = localStorage.getItem("wakfu_forecast_lang") || "en";
const DAILY_FORECAST_SHEET_URL =
  "https://docs.google.com/spreadsheets/d/1YXdxmQC9U3Ux7AuNnT8Cm3DR7kp1YYHenWuU3eQ5wbY/gviz/tq?gid=287118977";
const DAILY_FORECAST_COLUMN_INDEX = 3;
const DAILY_FORECAST_PREFETCH_DAYS = 7;
const DAILY_FORECAST_STORAGE_KEY = "wakfu_daily_forecast_weekly_cache";
const QUICK_DAILY_FORECAST_NAME_OVERRIDES = {
  "Lenald Empelol's Temple": "福狸王的宫殿 Lenald Empelol's Temple",
  Larventura: "变异虫巢穴 Larventura",
  "Treechnee Dungeon": "树人地下城 Treechnee Dungeon",
  "The Mineral Tower": "矿石之塔 The Mineral Tower",
  "Bwork Dungeon": "兽人地下城 Bwork Dungeon",
  "Abandoned Strichery": "废旧鸵鸟城堡 Abandoned Strichery",
  Miseryum: "迷荫地 Miseryum",
  Miseryeum: "迷荫地 Miseryeum",
  "Dancehall Arena": "劲舞秀场 Dancehall Arena",
  "The Whirlway Station": "旋车公路 The Whirlway Station",
  "Treechnid Dungeon": "树精洞窟 Treechnid Dungeon",
  "Enurado Dungeon": "埃努卓地下城 Enurado Dungeon",
  "Elite Riktus Dungeon": "土匪老巢 Elite Riktus Dungeon",
  "Forbidden City": "紫禁城 Forbidden City",
  "Dreggons' Sanctuary": "蛋龙庇护地 Dreggons' Sanctuary",
  "Crabstacean Dungeon": "壳甲地下城 Crabstacean Dungeon",
  "Horridemon Dungeon": "恐惧地下城 Horridemon Dungeon",
  "Ferociraptor Dungeon": "猛恐龙地下城 Ferociraptor Dungeon",
  "Raised Vault": "恐怖地穴 Raised Vault",
  SrambadDungeon: "斯拉姆地下城 Srambad Dungeon",
  "Streye Dungeon?": "巨眼地下城？ Streye Dungeon?",
  "The Mineral Tower (lvl 215)": "215级矿石之塔 The Mineral Tower (lvl 215)",
  "The Minerall Tower (lvl 200)": "200级矿石之塔 The Minerall Tower (lvl 200)",
  "Timeless Theater Dungeon": "无尽剧场 Timeless Theater Dungeon",
};

const quickDailyForecastState = {
  rows: [],
  activeParisDate: "",
  loadedAt: 0,
  loadingPromise: null,
  isInitialized: false,
  weeklyCache: null,
};

async function initForecast() {
  const parisString = new Date().toLocaleString("en-US", {
    timeZone: "Europe/Paris",
  });
  currentForecastDate = new Date(parisString);
  initQuickDailyForecast();
  renderForecastUI();
}

function initQuickDailyForecast() {
  if (quickDailyForecastState.isInitialized) return;
  quickDailyForecastState.isInitialized = true;
  renderQuickDailyForecastStatus(
    "\u70b9\u51fb\u5c55\u5f00\u52a0\u8f7d\u4eca\u5929\u7684\u526f\u672c\u6e05\u5355\u3002"
  );
}

function toggleDailyForecastBlock() {
  const section = document.getElementById("sec-forecast");
  if (!section) return;

  section.classList.toggle("collapsed");
  if (!section.classList.contains("collapsed")) {
    void refreshQuickDailyForecast();
  }
}

async function refreshQuickDailyForecast(force = false) {
  try {
    if (
      typeof DUNGEON_TRANSLATIONS === "undefined" &&
      typeof loadScript === "function"
    ) {
      await loadScript("assets/js/data/forecast_data.js?v=20260618b");
    }
    renderQuickDailyForecastStatus(
      "\u6b63\u5728\u62c9\u53d6\u4eca\u5929\u7684\u526f\u672c\u6570\u636e..."
    );
    const rows = await fetchQuickDailyForecast(force);
    await renderQuickDailyForecastList(rows);
  } catch (error) {
    console.error("Failed to load quick daily forecast:", error);
    const detail =
      error && typeof error.message === "string" && error.message
        ? ` (${escapeHtml(error.message)})`
        : "";
    renderQuickDailyForecastStatus(
      `\u4eca\u65e5\u526f\u672c\u52a0\u8f7d\u5931\u8d25${detail}\u3002`
    );
  }
}

async function fetchQuickDailyForecast(force = false) {
  const parisNow = getParisNow();
  const parisDateKey = formatParisDateKey(parisNow);

  if (!force && quickDailyForecastState.activeParisDate === parisDateKey) {
    const inMemoryRows = getQuickDailyForecastRowsFromCache(
      quickDailyForecastState.weeklyCache,
      parisDateKey
    );
    if (inMemoryRows.length > 0) {
      quickDailyForecastState.rows = inMemoryRows;
      return inMemoryRows;
    }
  }

  if (!force) {
    const storedCache = readQuickDailyForecastWeeklyCache();
    const storedRows = getQuickDailyForecastRowsFromCache(storedCache, parisDateKey);
    if (storedRows.length > 0) {
      quickDailyForecastState.weeklyCache = storedCache;
      quickDailyForecastState.activeParisDate = parisDateKey;
      quickDailyForecastState.rows = storedRows;
      quickDailyForecastState.loadedAt = Date.now();
      return storedRows;
    }
  }

  if (quickDailyForecastState.loadingPromise) {
    return quickDailyForecastState.loadingPromise;
  }

  quickDailyForecastState.loadingPromise = (async () => {
    let weeklyCache = null;

    try {
      const response = await loadQuickDailyForecastJsonp(Date.now());
      weeklyCache = buildQuickDailyForecastWeeklyCache(response, parisNow);
    } catch (jsonpError) {
      console.warn(
        "Daily forecast JSONP failed, trying stored/fallback data:",
        jsonpError
      );

      const storedCache = readQuickDailyForecastWeeklyCache();
      if (getQuickDailyForecastRowsFromCache(storedCache, parisDateKey).length > 0) {
        weeklyCache = storedCache;
      } else if (Array.isArray(window.WAKFU_DAILY_FORECAST_FALLBACK)) {
        weeklyCache = buildFallbackWeeklyCache(parisDateKey);
      } else {
        throw new Error("JSONP script error; fallback unavailable");
      }
    }

    const activeRows = getQuickDailyForecastRowsFromCache(weeklyCache, parisDateKey);
    if (activeRows.length === 0) {
      throw new Error("No forecast rows available for today's Paris date");
    }

    quickDailyForecastState.weeklyCache = weeklyCache;
    quickDailyForecastState.activeParisDate = parisDateKey;
    quickDailyForecastState.rows = activeRows;
    quickDailyForecastState.loadedAt = Date.now();
    persistQuickDailyForecastWeeklyCache(weeklyCache);
    return activeRows;
  })().finally(() => {
    quickDailyForecastState.loadingPromise = null;
  });

  return quickDailyForecastState.loadingPromise;
}

function getParisNow() {
  return new Date(
    new Date().toLocaleString("en-US", { timeZone: "Europe/Paris" })
  );
}

function formatParisDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDaysToDateKey(dateKey, offset) {
  const [year, month, day] = String(dateKey)
    .split("-")
    .map((value) => Number(value));
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() + offset);
  return formatParisDateKey(date);
}

function parseSheetMonthDayLabel(label) {
  const match = String(label || "").match(/(\d{1,2})-(\d{1,2})/);
  if (!match) return null;
  return {
    month: Number(match[1]),
    day: Number(match[2]),
  };
}

function buildQuickDailyForecastWeeklyCache(response, parisNow) {
  const rows = Array.isArray(response?.table?.rows) ? response.table.rows : [];
  if (rows.length === 0) {
    throw new Error("Sheet returned no rows");
  }

  const headerRow = rows[0];
  const headerLabel = String(headerRow?.c?.[DAILY_FORECAST_COLUMN_INDEX]?.v || "").trim();
  const headerMonthDay = parseSheetMonthDayLabel(headerLabel);
  const parisMonth = parisNow.getMonth() + 1;
  const parisDay = parisNow.getDate();

  if (
    !headerMonthDay ||
    headerMonthDay.month !== parisMonth ||
    headerMonthDay.day !== parisDay
  ) {
    throw new Error("Sheet today column is not aligned with current Paris date");
  }

  const startDateKey = formatParisDateKey(parisNow);
  const days = {};

  for (let offset = 0; offset < DAILY_FORECAST_PREFETCH_DAYS; offset++) {
    const colIndex = DAILY_FORECAST_COLUMN_INDEX + offset;
    const dateKey = addDaysToDateKey(startDateKey, offset);
    const dailyRows = rows
      .slice(1)
      .map((row) => ({
        type: String(row?.c?.[0]?.v || "").trim(),
        name: String(row?.c?.[colIndex]?.v || "").trim(),
      }))
      .filter((row) => row.type.startsWith("DJ") && row.name);

    if (dailyRows.length > 0) {
      days[dateKey] = dailyRows;
    }
  }

  if (!days[startDateKey] || days[startDateKey].length === 0) {
    throw new Error("Sheet did not provide today's dungeon rows");
  }

  return {
    startDateKey,
    fetchedForParisDate: startDateKey,
    fetchedAt: Date.now(),
    days,
  };
}

function buildFallbackWeeklyCache(startDateKey) {
  const rows = window.WAKFU_DAILY_FORECAST_FALLBACK.map((row) => ({
    type: String(row?.type || "").trim(),
    name: String(row?.name || "").trim(),
  })).filter((row) => row.type.startsWith("DJ") && row.name);

  return {
    startDateKey,
    fetchedForParisDate: startDateKey,
    fetchedAt: Date.now(),
    days: {
      [startDateKey]: rows,
    },
  };
}

function getQuickDailyForecastRowsFromCache(cache, parisDateKey) {
  if (!cache || typeof cache !== "object" || !cache.days) return [];
  const rows = cache.days[parisDateKey];
  return Array.isArray(rows) ? rows : [];
}

function readQuickDailyForecastWeeklyCache() {
  try {
    const raw = localStorage.getItem(DAILY_FORECAST_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch (error) {
    return null;
  }
}

function persistQuickDailyForecastWeeklyCache(cache) {
  if (!cache || typeof cache !== "object") return;
  try {
    localStorage.setItem(DAILY_FORECAST_STORAGE_KEY, JSON.stringify(cache));
  } catch (error) {
    console.warn("Failed to persist daily forecast weekly cache:", error);
  }
}

function loadQuickDailyForecastJsonp(cacheToken) {
  return new Promise((resolve, reject) => {
    const callbackName = `wakfuDailyForecastCallback_${Date.now()}_${Math.random()
      .toString(36)
      .slice(2)}`;
    const script = document.createElement("script");
    const timeoutId = window.setTimeout(() => {
      cleanup();
      reject(new Error("JSONP timeout"));
    }, 12000);

    const cleanup = () => {
      window.clearTimeout(timeoutId);
      if (script.parentNode) {
        script.parentNode.removeChild(script);
      }
      try {
        delete window[callbackName];
      } catch (error) {
        window[callbackName] = undefined;
      }
    };

    window[callbackName] = (payload) => {
      cleanup();
      resolve(payload);
    };

    script.onerror = () => {
      cleanup();
      reject(new Error("JSONP script error"));
    };

    const params = new URLSearchParams({
      tqx: `responseHandler:${callbackName};out:json`,
      t: String(cacheToken),
    });

    script.src = `${DAILY_FORECAST_SHEET_URL}&${params.toString()}`;
    document.body.appendChild(script);
  });
}

function renderQuickDailyForecastStatus(message) {
  const content = document.getElementById("daily-forecast-content");
  if (!content) return;
  content.innerHTML = `<div class="daily-forecast-status">${message}</div>`;
}

async function renderQuickDailyForecastList(rows) {
  const content = document.getElementById("daily-forecast-content");
  if (!content) return;

  if (!Array.isArray(rows) || rows.length === 0) {
    renderQuickDailyForecastStatus(
      "\u4eca\u5929\u6ca1\u6709\u8bfb\u53d6\u5230\u526f\u672c\u6570\u636e\u3002"
    );
    return;
  }

  const translatedRows = await Promise.all(
    rows.map(async (row) => ({
      ...row,
      displayName: await getQuickDailyForecastDisplayName(row.name),
    }))
  );

  const itemsHtml = translatedRows
    .map((row) => {
      const styles = getDungeonStyles(row.type);
      return `
        <div class="daily-forecast-item">
          <span class="daily-forecast-item-badge" style="background:${styles.badgeColor};">${styles.typeLabel}</span>
          <div class="daily-forecast-item-name">${formatQuickDailyForecastName(row.displayName, row.name)}</div>
        </div>
      `;
    })
    .join("");

  const timeLabel = new Date(quickDailyForecastState.loadedAt).toLocaleTimeString(
    "zh-CN",
    {
      hour: "2-digit",
      minute: "2-digit",
    }
  );

  content.innerHTML = `
    <div class="daily-forecast-list">${itemsHtml}</div>
    <div class="daily-forecast-meta">\u6700\u8fd1\u66f4\u65b0 ${timeLabel}</div>
  `;
}

async function getQuickDailyForecastDisplayName(name) {
  const originalName = String(name || "").trim();
  if (!originalName) return "";

  if (
    typeof DUNGEON_TRANSLATIONS !== "undefined" &&
    DUNGEON_TRANSLATIONS[originalName]?.zh
  ) {
    return ensureBilingualQuickDailyName(
      DUNGEON_TRANSLATIONS[originalName].zh,
      originalName
    );
  }

  if (QUICK_DAILY_FORECAST_NAME_OVERRIDES[originalName]) {
    return QUICK_DAILY_FORECAST_NAME_OVERRIDES[originalName];
  }

  if (typeof lookupExactGlossaryTranslation === "function") {
    const exact = await lookupExactGlossaryTranslation(originalName, "zh-CN");
    if (exact?.text) return ensureBilingualQuickDailyName(exact.text, originalName);
  }

  if (
    typeof protectWakfuTerms === "function" &&
    typeof restoreWakfuTerms === "function"
  ) {
    const payload = await protectWakfuTerms(originalName, "zh-CN");
    const restored = restoreWakfuTerms(payload.protectedText, payload);
    if (restored && restored !== originalName) {
      return ensureBilingualQuickDailyName(restored, originalName);
    }
  }

  return originalName;
}

function formatQuickDailyForecastName(displayName, fallbackEnglish) {
  const rawName = String(displayName || fallbackEnglish || "").trim();
  const englishName = String(fallbackEnglish || "").trim();
  if (!rawName) return "";

  if (englishName && rawName.endsWith(englishName)) {
    const chineseName = rawName
      .slice(0, rawName.length - englishName.length)
      .trim();
    if (chineseName) {
      return `<span class="daily-name-zh">${chineseName}</span> <span class="daily-name-en">${englishName}</span>`;
    }
  }

  return `<span class="daily-name-zh">${rawName}</span>`;
}

function escapeHtml(text) {
  return String(text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function ensureBilingualQuickDailyName(text, englishName) {
  const normalizedText = String(text || "").trim();
  const normalizedEnglish = String(englishName || "").trim();

  if (!normalizedText) return normalizedEnglish;
  if (!normalizedEnglish) return normalizedText;
  if (normalizedText.endsWith(normalizedEnglish)) return normalizedText;
  return `${normalizedText} ${normalizedEnglish}`;
}
function changeForecastDay(days) {
  currentForecastDate.setDate(currentForecastDate.getDate() + days);
  renderForecastUI();
}

function toggleForecastViewMode() {
  forecastViewMode = forecastViewMode === "tab" ? "grid" : "tab";
  renderForecastUI();
}

function setDungeonTab(tab) {
  activeDungeonTab = tab;
  renderForecastUI();
}

function setForecastLanguage(lang) {
  currentForecastLang = lang;
  localStorage.setItem("wakfu_forecast_lang", lang);
  renderForecastUI();
}

function getFormattedDate(dateObj) {
  const d = String(dateObj.getDate()).padStart(2, "0");
  const m = String(dateObj.getMonth() + 1).padStart(2, "0");
  const y = dateObj.getFullYear();
  return `${d}/${m}/${y}`;
}

// --- Helper: Get Translated Name ---
function getDungeonName(originalName) {
  if (typeof DUNGEON_TRANSLATIONS === "undefined") return originalName;

  const entry = DUNGEON_TRANSLATIONS[originalName];
  if (entry && entry[currentForecastLang]) {
    return entry[currentForecastLang];
  }
  return originalName; // Fallback to English key
}

// --- Main Render Function ---
function renderForecastUI() {
  const displayDate = getFormattedDate(currentForecastDate);
  const nowParis = new Date(
    new Date().toLocaleString("en-US", { timeZone: "Europe/Paris" })
  );
  const isToday =
    currentForecastDate.getDate() === nowParis.getDate() &&
    currentForecastDate.getMonth() === nowParis.getMonth() &&
    currentForecastDate.getFullYear() === nowParis.getFullYear();

  const headerContainer = document.getElementById("forecast-header-sticky");
  const listContainer = document.getElementById("forecast-list-scrollable");
  const langContainer = document.getElementById("forecast-lang-selector");

  if (!headerContainer || !listContainer) return;

  // 1. Render Header (Nav + Tabs)
  const titleGuild =
    UI_TRANSLATIONS["GUILD_HUNTERS"][currentForecastLang] || "GUILD HUNTERS";
  const titleMod = UI_TRANSLATIONS["MODULUX"][currentForecastLang] || "MODULUX";

  headerContainer.innerHTML = `
        <div class="forecast-nav">
            <button onclick="changeForecastDay(-1)">&lt;</button>
            <span id="fc-date-display">${
              isToday ? `今天 (${displayDate})` : displayDate
            }</span>
            <button onclick="changeForecastDay(1)">&gt;</button>
            <button class="forecast-view-btn" onclick="toggleForecastViewMode()">
                ${forecastViewMode === "tab" ? "⊞" : "☰"}
            </button>
        </div>
        
        ${
          forecastViewMode === "tab"
            ? `
            <div class="forecast-tabs">
                <div class="fc-tab ${
                  activeDungeonTab === "classic" ? "active" : ""
                }" onclick="setDungeonTab('classic')" title="${titleGuild}">
                    🎯 ${titleGuild}
                </div>
                <div class="fc-tab ${
                  activeDungeonTab === "modular" ? "active" : ""
                }" onclick="setDungeonTab('modular')" title="${titleMod}">
                    ⚔️ ${titleMod}
                </div>
            </div>
        `
            : ""
        }
    `;

  // 2. Render Language Flags
  if (langContainer) {
    langContainer.innerHTML = `
        <button class="fc-lang-btn ${
          currentForecastLang === "en" ? "active" : ""
        }" onclick="setForecastLanguage('en')" title="英语">
            <img src="./assets/img/flags/en.png" alt="GB">
        </button>
        <button class="fc-lang-btn ${
          currentForecastLang === "es" ? "active" : ""
        }" onclick="setForecastLanguage('es')" title="Español">
            <img src="./assets/img/flags/es.png" alt="ES">
        </button>
        <button class="fc-lang-btn ${
          currentForecastLang === "fr" ? "active" : ""
        }" onclick="setForecastLanguage('fr')" title="Français">
            <img src="./assets/img/flags/fr.png" alt="FR">
        </button>
        <button class="fc-lang-btn ${
          currentForecastLang === "pt" ? "active" : ""
        }" onclick="setForecastLanguage('pt')" title="Português">
            <img src="./assets/img/flags/pt.png" alt="BR">
        </button>
      `;
  }

  // 3. Process Lists
  const dungeons =
    typeof FORECAST_DB !== "undefined" ? FORECAST_DB[displayDate] : null;

  if (!dungeons || dungeons.length === 0) {
    listContainer.innerHTML =
      '<div style="text-align:center; padding:20px; color:#666;">当天没有数据。</div>';
    return;
  }

  const classic = dungeons.filter((d) => d.type.startsWith("DJ"));

  // FILTER MODULAR: Include Modulox AND Neo-Dungeon (if date <= Feb 5, 2026)
  const modular = dungeons.filter((d) => {
    if (d.type.startsWith("Modulox")) return true;
    if (d.type === "Neo-Dungeon") {
      // Date Logic: Show until Feb 5th 2026
      const y = currentForecastDate.getFullYear();
      const m = currentForecastDate.getMonth(); // 0-indexed (Jan=0, Feb=1)
      const day = currentForecastDate.getDate();

      if (y < 2026) return true; // 2025 is fine
      if (y === 2026) {
        // Jan (0) is fine
        if (m === 0) return true;
        // Feb (1): Only up to 5th
        if (m === 1 && day <= 5) return true;
      }
      return false;
    }
    return false;
  });

  const classicNames = new Set(classic.map((d) => d.name));
  const modularNames = new Set(modular.map((d) => d.name));
  const intersections = new Set(
    [...classicNames].filter((x) => modularNames.has(x))
  );

  if (forecastViewMode === "grid") {
    renderGridView(listContainer, classic, modular, intersections);
  } else {
    renderTabView(listContainer, classic, modular, intersections);
  }
}

// Full Grid View function
function renderGridView(container, classicList, modularList, intersections) {
  const titleGuild =
    UI_TRANSLATIONS["GUILD_HUNTERS"][currentForecastLang] || "GUILD HUNTERS";
  const titleMod = UI_TRANSLATIONS["MODULUX"][currentForecastLang] || "MODULUX";

  let html = `<div class="forecast-grid">`;
  html += renderGridColumn(
    classicList,
    titleGuild,
    "🎯",
    "type-classic",
    intersections
  );
  html += renderGridColumn(
    modularList,
    titleMod,
    "⚔️",
    "type-modular",
    intersections
  );
  html += `</div>`;
  container.innerHTML = html;
}

function renderGridColumn(list, title, emoji, typeClass, intersections) {
  let colHtml = `<div class="forecast-col">
        <div class="forecast-subsection-header">
            <div class="header-left"><span>${emoji} ${title}</span></div>
        </div>
        <div class="forecast-subsection-content">`;

  if (list.length === 0)
    colHtml += `<div style="padding:10px; font-size:0.8em; color:#666;">无</div>`;
  else {
    list.forEach((d) => {
      const { badgeColor, typeLabel } = getDungeonStyles(d.type);
      const isIntersected = intersections.has(d.name) ? "is-intersected" : "";
      const displayName = getDungeonName(d.name);
      const location =
        typeof DUNGEON_LOCATIONS !== "undefined" && DUNGEON_LOCATIONS[d.name]
          ? DUNGEON_LOCATIONS[d.name]
          : "";

      colHtml += `
            <div class="compact-forecast-item ${typeClass} ${isIntersected}" title="${displayName}" data-tooltip="${location}">
                <span class="compact-badge" style="background:${badgeColor};">${typeLabel}</span>
                <span class="compact-name">${displayName}</span>
            </div>`;
    });
  }
  colHtml += `</div></div>`;
  return colHtml;
}

// Full Tab View function
function renderTabView(container, classicList, modularList, intersections) {
  const targetList = activeDungeonTab === "classic" ? classicList : modularList;
  const typeClass =
    activeDungeonTab === "classic" ? "type-classic" : "type-modular";

  let html = `<div class="forecast-list-container">`;
  if (targetList.length === 0) {
    html += `<div style="padding:20px; text-align:center; color:#888; font-style:italic;">当天没有地下城。</div>`;
  } else {
    targetList.forEach((d) => {
      const { badgeColor, typeLabel } = getDungeonStyles(d.type);
      const isIntersected = intersections.has(d.name) ? "is-intersected" : "";
      const displayName = getDungeonName(d.name);
      const location =
        typeof DUNGEON_LOCATIONS !== "undefined" && DUNGEON_LOCATIONS[d.name]
          ? DUNGEON_LOCATIONS[d.name]
          : "";

      html += `
            <div class="full-forecast-item ${typeClass} ${isIntersected}" data-tooltip="${location}">
                <span class="badge" style="background:${badgeColor};">${typeLabel}</span>
                <span class="name">${displayName}</span>
            </div>`;
    });
  }
  html += `</div>`;
  container.innerHTML = html;
}

// --- Shared Helper for Colors/Labels ---
function getDungeonStyles(rawType) {
  // SPECIAL: Neo Dungeon
  if (rawType === "Neo-Dungeon") {
    return {
      badgeColor: "#ff0055", // Hot Pink/Red for Neo
      typeLabel: "NEO",
    };
  }

  // STANDARD: Level Ranges
  let badgeColor = "#27ae60"; // Default Green

  if (rawType.includes("231")) badgeColor = "#e67e22"; // Orange
  else if (rawType.includes("216")) badgeColor = "#9b59b6"; // Purple
  else if (rawType.includes("201") || rawType.includes("186"))
    badgeColor = "#3498db"; // Blue

  let rawRange = rawType.replace(/^(DJ|Modulox)\s*/i, "").trim();

  return {
    badgeColor: badgeColor,
    typeLabel: `等级 ${rawRange}`,
  };
}
