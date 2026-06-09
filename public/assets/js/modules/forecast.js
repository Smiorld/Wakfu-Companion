let currentForecastDate = new Date();
let forecastViewMode = "tab"; // 'tab' or 'grid'
let activeDungeonTab = "classic"; // 'classic' or 'modular'
let currentForecastLang = localStorage.getItem("wakfu_forecast_lang") || "en";

async function initForecast() {
  const parisString = new Date().toLocaleString("en-US", {
    timeZone: "Europe/Paris",
  });
  currentForecastDate = new Date(parisString);
  renderForecastUI();
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
