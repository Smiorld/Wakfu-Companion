// ==========================================
// SESSION RECAP MODULE
// Handles parsing and tracking of session statistics
// ==========================================

let sessionStats = {
  kamas: { earned: 0, spent: 0 },
  quests: 0,
  challenges: 0,
  xp: {
    Combat: 0,
    Armorer: 0,
    Baker: 0,
    Chef: 0,
    Handyman: 0,
    Jeweler: 0,
    "Leather Dealer": 0,
    Tailor: 0,
    "Weapons Master": 0,
    Farmer: 0,
    Fisherman: 0,
    Herbalist: 0,
    Lumberjack: 0,
    Miner: 0,
    Trapper: 0,
  },
};

let sessionStartTime = null;
let sessionTimerInterval = null;

const REGEX_KAMAS = /(?:won|earned|gained|gagn?|ganado|ganhou|spent|lost|perdu|perdio|gasto|gastou|\u5f97\u5230|\u83b7\u5f97|\u5931\u53bb|\u82b1\u8d39)\S*\s*([\d\s.,\u00A0]+)\s*(?:kamas?|\u5361\u739b)/i;
const REGEX_KAMAS_SPENT = /(?:spent|lost|perdu|perdio|gasto|gastou|\u5931\u53bb|\u82b1\u8d39)/i;
const REGEX_XP = /(?:won|earned|gained|gagné|ganado|ganhou|\+|经验\s*\+)\s*([\d\s.,\u00A0]+)\s*(?:xp|经验)?/i;
const REGEX_QUEST = /(?:quest finished|quest completed|completed the quest|finished the quest|won the quest|failed to complete the quest|quête terminée|terminé la quête|mission accomplie|misión cumplida|completado la misión|missão cumprida|completou a missão|任务“.*?”开始了|你完成了任务“.*?”|".*?"任务(?:失败|获胜)|“.*?”任务(?:失败|获胜)|任务完成|完成任务)/i;

const PROFESSION_LABEL_MAP = {
  Armorer: "Armorer",
  Baker: "Baker",
  Chef: "Chef",
  Handyman: "Handyman",
  Jeweler: "Jeweler",
  "Leather Dealer": "Leather Dealer",
  Tailor: "Tailor",
  "Weapons Master": "Weapons Master",
  Farmer: "Farmer",
  Fisherman: "Fisherman",
  Herbalist: "Herbalist",
  Lumberjack: "Lumberjack",
  Miner: "Miner",
  Trapper: "Trapper",
  制甲: "Armorer",
  制甲师: "Armorer",
  面点: "Baker",
  面点师: "Baker",
  厨师: "Chef",
  工匠: "Handyman",
  珠宝: "Jeweler",
  珠宝师: "Jeweler",
  皮匠: "Leather Dealer",
  裁缝: "Tailor",
  武器大师: "Weapons Master",
  种植: "Farmer",
  农夫: "Farmer",
  钓鱼: "Fisherman",
  渔夫: "Fisherman",
  草药: "Herbalist",
  草药师: "Herbalist",
  伐木: "Lumberjack",
  伐木工: "Lumberjack",
  采矿: "Miner",
  矿工: "Miner",
  畜牧: "Trapper",
  牧人: "Trapper",
};

const PROFESSION_DISPLAY_LABELS = {
  Combat: "战斗",
  Armorer: "制甲",
  Baker: "面点",
  Chef: "厨师",
  Handyman: "工匠",
  Jeweler: "珠宝",
  "Leather Dealer": "皮匠",
  Tailor: "裁缝",
  "Weapons Master": "武器大师",
  Farmer: "种植",
  Fisherman: "钓鱼",
  Herbalist: "草药",
  Lumberjack: "伐木",
  Miner: "采矿",
  Trapper: "畜牧",
};

function loadSessionData() {
  const stored = localStorage.getItem("wakfu_session_stats");
  const storedTime = localStorage.getItem("wakfu_session_start");
  const storedLastActive = localStorage.getItem("wakfu_session_last_active");

  if (stored) {
    try {
      const parsed = JSON.parse(stored);
      sessionStats.kamas = { ...sessionStats.kamas, ...parsed.kamas };
      sessionStats.quests = parsed.quests || 0;
      sessionStats.challenges = parsed.challenges || 0;

      if (parsed.xp) {
        for (const key in parsed.xp) {
          if (
            key === "Weapon Master" &&
            sessionStats.xp["Weapons Master"] !== undefined
          ) {
            sessionStats.xp["Weapons Master"] += parsed.xp[key];
          } else if (sessionStats.xp[key] !== undefined) {
            sessionStats.xp[key] = parsed.xp[key];
          }
        }
      }
    } catch (e) {
      console.error("Failed to load session stats", e);
    }
  }

  if (storedTime) {
    sessionStartTime = parseInt(storedTime, 10);

    if (storedLastActive) {
      const lastActive = parseInt(storedLastActive, 10);
      const now = Date.now();
      const gap = now - lastActive;

      if (gap > 60000) {
        sessionStartTime += gap;
        saveSessionData();
      }
    }
  }
}

function saveSessionData() {
  localStorage.setItem("wakfu_session_stats", JSON.stringify(sessionStats));
  if (sessionStartTime) {
    localStorage.setItem("wakfu_session_start", sessionStartTime.toString());
    localStorage.setItem("wakfu_session_last_active", Date.now().toString());
  } else {
    localStorage.removeItem("wakfu_session_start");
    localStorage.removeItem("wakfu_session_last_active");
  }
}

function getSessionProfessionCategory(line) {
  for (const [label, canonical] of Object.entries(PROFESSION_LABEL_MAP)) {
    if (
      line.includes(`${label}:`) ||
      line.includes(`${label}：`) ||
      line.includes(`${label} `)
    ) {
      return canonical;
    }
  }
  return "Combat";
}

function extractSessionQuestName(line) {
  const match =
    line.match(/任务“([^”]*)”/) ||
    line.match(/"([^"]*)"任务/) ||
    line.match(/“([^”]*)”任务/);
  return match ? match[1].trim() : "";
}

function isEnvironmentalChallengeQuest(name) {
  return /^(合作|竞争|竞速|单人|特殊挑战)[:：]/.test(name) || name === "特殊挑战";
}

function processSessionLog(line) {
  if (!line) return;
  const lower = line.toLowerCase();
  let statChanged = false;

  const kamaMatch = line.match(REGEX_KAMAS);
  if (kamaMatch) {
    const amount = parseInt(kamaMatch[1].replace(/[\s.,\u00A0]/g, ""), 10);
    if (!isNaN(amount)) {
      if (
        REGEX_KAMAS_SPENT.test(line) ||
        lower.includes("spent") ||
        lower.includes("lost") ||
        lower.includes("perdu") ||
        lower.includes("perdio") ||
        lower.includes("gasto")
      ) {
        sessionStats.kamas.spent += amount;
      } else {
        sessionStats.kamas.earned += amount;
      }
      statChanged = true;
    }
  }

  const xpMatch = line.match(REGEX_XP);
  if (xpMatch && line.includes("经验")) {
    const amount = parseInt(xpMatch[1].replace(/[\s.,\u00A0]/g, ""), 10);
    if (!isNaN(amount)) {
      const category = getSessionProfessionCategory(line);
      if (sessionStats.xp[category] === undefined) sessionStats.xp[category] = 0;
      sessionStats.xp[category] += amount;
      statChanged = true;
    }
  }

  const questName = extractSessionQuestName(line);
  if (questName) {
    if (isEnvironmentalChallengeQuest(questName)) {
      sessionStats.challenges++;
    } else {
      sessionStats.quests++;
    }
    statChanged = true;
  } else if (REGEX_QUEST.test(lower)) {
    sessionStats.quests++;
    statChanged = true;
  }

  if (statChanged) {
    if (sessionStartTime === null) {
      startSessionTimer();
    }
    updateSessionUI();
    saveSessionData();
  }
}

function startSessionTimer() {
  if (sessionStartTime === null) {
    sessionStartTime = Date.now();
    localStorage.setItem("wakfu_session_start", sessionStartTime.toString());
  }
  updateCurrentSessionDuration();
}

function updateSessionUI() {
  const elEarned = document.getElementById("sess-kamas-earned");
  if (!elEarned) return;

  elEarned.textContent = sessionStats.kamas.earned.toLocaleString() + " ₭";
  elEarned.className = "stat-val gold";

  document.getElementById("sess-kamas-spent").textContent =
    sessionStats.kamas.spent.toLocaleString() + " ₭";

  const net = sessionStats.kamas.earned - sessionStats.kamas.spent;
  const elNet = document.getElementById("sess-kamas-net");
  elNet.textContent = (net > 0 ? "+" : "") + net.toLocaleString() + " ₭";
  elNet.className = "stat-val " + (net >= 0 ? "positive" : "negative");

  document.getElementById("sess-quests-count").textContent = sessionStats.quests;

  const elChal = document.getElementById("sess-challenges-count");
  if (elChal) elChal.textContent = sessionStats.challenges;

  const xpContainer = document.getElementById("session-xp-list");
  xpContainer.innerHTML = "";

  let hasXp = false;

  const categories = Object.keys(sessionStats.xp).sort((a, b) => {
    if (a === "Combat") return -1;
    if (b === "Combat") return 1;
    return a.localeCompare(b);
  });

  categories.forEach((cat) => {
    const val = sessionStats.xp[cat];
    if (val > 0) {
      hasXp = true;
      const row = document.createElement("div");
      row.className = "stat-row";

      let iconPath = "";
      let iconClass = "session-list-icon";

      if (cat === "Combat") {
        iconPath = "./assets/img/headers/combat.png";
        iconClass = "session-combat-icon";
      } else {
        let safeName = cat.toLowerCase().replace(/ /g, "_");
        if (safeName === "weapons_master") safeName = "weapon_master";
        iconPath = `./assets/img/jobs/${safeName}.png`;
      }

      const displayLabel = PROFESSION_DISPLAY_LABELS[cat] || cat;
      row.innerHTML = `
        <div class="session-label-group">
          <img src="${iconPath}" class="${iconClass}" onerror="this.style.display='none'">
          <span class="stat-label">${displayLabel}:</span>
        </div>
        <span class="stat-val text-accent">${val.toLocaleString()} XP</span>
      `;
      xpContainer.appendChild(row);
    }
  });

  if (!hasXp) {
    xpContainer.innerHTML = '<div class="empty-state-mini">暂无经验记录。</div>';
  }

  updateCurrentSessionDuration();
}

function updateCurrentSessionDuration() {
  const durationEl = document.getElementById("sess-current-duration");
  if (!durationEl) return;

  if (sessionStartTime === null) {
    durationEl.textContent = "00:00:00";
    return;
  }

  const elapsedMs = Date.now() - sessionStartTime;
  const hours = Math.floor(elapsedMs / (1000 * 60 * 60));
  const minutes = Math.floor((elapsedMs % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((elapsedMs % (1000 * 60)) / 1000);

  durationEl.textContent = `${hours.toString().padStart(2, "0")}:${minutes
    .toString()
    .padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
}

function toggleSessionWindow() {
  const win = document.getElementById("session-window");
  if (win.style.display === "none") {
    win.style.display = "flex";
    updateSessionUI();

    if (sessionTimerInterval === null) {
      updateCurrentSessionDuration();
      sessionTimerInterval = setInterval(updateCurrentSessionDuration, 1000);
    }
  } else {
    win.style.display = "none";

    if (sessionTimerInterval !== null) {
      clearInterval(sessionTimerInterval);
      sessionTimerInterval = null;
    }
  }
}

function resetSessionStats() {
  sessionStats.kamas.earned = 0;
  sessionStats.kamas.spent = 0;
  sessionStats.quests = 0;
  sessionStats.challenges = 0;
  for (const key in sessionStats.xp) {
    sessionStats.xp[key] = 0;
  }

  sessionStartTime = Date.now();
  saveSessionData();

  updateSessionUI();
  updateCurrentSessionDuration();
}

loadSessionData();

window.toggleSessionWindow = toggleSessionWindow;
window.resetSessionStats = resetSessionStats;
window.startSessionTimer = startSessionTimer;

window.addEventListener("beforeunload", () => {
  saveSessionData();
});
