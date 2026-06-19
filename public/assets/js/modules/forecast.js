let currentForecastDate = new Date();
let forecastViewMode = "tab"; // 'tab' or 'grid'
let activeDungeonTab = "classic"; // 'classic' or 'modular'
let currentForecastLang = localStorage.getItem("wakfu_forecast_lang") || "en";
const QUICK_DAILY_FORECAST_ROTATION_URL =
  "assets/data/daily_dungeon_rotation.js";
const GOOGLE_SHEETS_DATE_EPOCH_UTC_MS = Date.UTC(1899, 11, 30);
const QUICK_DAILY_FORECAST_NAME_OVERRIDES = {
  Miseryum: "迷荫地 Miseryum",
  Miseryeum: "迷荫地 Miseryeum",
  SrambadDungeon: "斯拉姆地下城 SrambadDungeon",
  "Streye Dungeon?": "巨眼地下城？ Streye Dungeon?",
  "The Minerall Tower (lvl 200)": "200级矿石之塔 The Minerall Tower (lvl 200)",
};

const quickDailyForecastState = {
  rows: [],
  activeParisDate: "",
  loadedAt: 0,
  isInitialized: false,
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
  renderQuickDailyForecastStatus("正在按法国时间推算今天的副本轮换...");
  void refreshQuickDailyForecast();
}

function toggleDailyForecastBlock() {
  const section = document.getElementById("sec-forecast");
  if (!section) return;

  section.classList.toggle("collapsed");
  if (!section.classList.contains("collapsed")) {
    void refreshQuickDailyForecast();
  }
}

async function refreshQuickDailyForecast() {
  try {
    if (
      typeof DUNGEON_TRANSLATIONS === "undefined" &&
      typeof loadScript === "function"
    ) {
      await loadScript("assets/js/data/forecast_data.js?v=20260619a");
    }
    if (
      typeof window.WAKFU_DAILY_DUNGEON_ROTATION === "undefined" &&
      typeof loadScript === "function"
    ) {
      await loadScript(`${QUICK_DAILY_FORECAST_ROTATION_URL}?v=20260619a`);
    }

    renderQuickDailyForecastStatus("正在按本地轮换表推算今天的副本数据...");

    const parisNow = getParisNow();
    const rows = buildQuickDailyForecastRows(parisNow);

    quickDailyForecastState.rows = rows;
    quickDailyForecastState.activeParisDate = formatParisDateKey(parisNow);
    quickDailyForecastState.loadedAt = Date.now();

    await renderQuickDailyForecastList(rows);
  } catch (error) {
    console.error("Failed to load quick daily forecast:", error);
    const detail =
      error && typeof error.message === "string" && error.message
        ? ` (${escapeHtml(error.message)})`
        : "";
    renderQuickDailyForecastStatus(`今日副本加载失败${detail}。`);
  }
}

function buildQuickDailyForecastRows(parisNow) {
  const rotation = window.WAKFU_DAILY_DUNGEON_ROTATION;
  if (!Array.isArray(rotation) || rotation.length === 0) {
    throw new Error("Rotation data unavailable");
  }

  const sheetSerial = getGoogleSheetsDateSerial(parisNow);

  return rotation
    .map((entry) => {
      const type = String(entry?.type || "").trim();
      const names = Array.isArray(entry?.names)
        ? entry.names.map((name) => String(name || "").trim()).filter(Boolean)
        : [];

      if (!type || names.length === 0) return null;

      return {
        type,
        name: names[positiveModulo(sheetSerial, names.length)],
      };
    })
    .filter(Boolean);
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

function getGoogleSheetsDateSerial(date) {
  const utcDate = Date.UTC(
    date.getFullYear(),
    date.getMonth(),
    date.getDate()
  );
  return Math.floor((utcDate - GOOGLE_SHEETS_DATE_EPOCH_UTC_MS) / 86400000);
}

function positiveModulo(value, divisor) {
  return ((value % divisor) + divisor) % divisor;
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
    renderQuickDailyForecastStatus("今天没有读取到副本数据。");
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

  content.innerHTML = `
    <div class="daily-forecast-list">${itemsHtml}</div>
    <div class="daily-forecast-meta">按法国时间 ${quickDailyForecastState.activeParisDate} 本地推算</div>
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
