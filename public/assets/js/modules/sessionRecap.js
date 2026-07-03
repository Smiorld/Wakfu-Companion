// ==========================================
// SESSION RECAP MODULE
// Handles parsing and tracking of session statistics
// ==========================================

let sessionStats = {
  kamas: { earned: 0, spent: 0, details: { earned: [], spent: [] } },
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
let sessionKamaDetailMode = "earned";
let lastSessionContextLine = null;

const REGEX_QUEST_SUCCESS_ONLY =
  /(?:quest finished|quest completed|completed the quest|finished the quest|won the quest|quête terminée|terminé la quête|mission accomplie|misión cumplida|completado la misión|missão cumprida|completou a missão|你完成了任务|任务完成|完成任务|".*?"任务(?:获胜|完成))/i;
const REGEX_KAMAS =
  /(?:won|earned|gained|gagn(?:é|e)?|ganado|ganhou|spent|lost|perdu|perdio|gasto|gastou|得到|获得|失去|花费)\S*\s*([\d\s.,\u00A0]+)\s*(?:kamas?|卡玛)/i;
const REGEX_KAMAS_SPENT =
  /(?:spent|lost|perdu|perdio|gasto|gastou|失去|花费)/i;
const REGEX_XP =
  /(?:won|earned|gained|gagn(?:é|e)?|ganado|ganhou|\+|经验\s*\+)\s*([\d\s.,\u00A0]+)\s*(?:xp|经验)?/i;
const REGEX_XP_CONTEXT =
  /(?:\bXP\b|经验|next level|prochain niveau|siguiente nivel|pr[oó]ximo n[ií]vel)/i;

const SESSION_ENVIRONMENTAL_CHALLENGE_PREFIXES = [
  "合作",
  "竞争",
  "竞速",
  "单人",
  "特殊挑战",
  "cooperation",
  "competition",
  "speed",
  "solo",
  "special challenge",
  "cooperation challenge",
  "competitive challenge",
  "speed challenge",
  "solo challenge",
];

const PROFESSION_LABEL_MAP = {
  Armorer: "Armorer",
  Baker: "Baker",
  Chef: "Chef",
  Handyman: "Handyman",
  Jeweler: "Jeweler",
  "Leather Dealer": "Leather Dealer",
  Tailor: "Tailor",
  "Weapons Master": "Weapons Master",
  "Weapon Master": "Weapons Master",
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

function createEmptySessionKamaDetails() {
  return { earned: [], spent: [] };
}

function sanitizeSessionKamaDetails(details) {
  const next = createEmptySessionKamaDetails();
  if (!details || typeof details !== "object") return next;

  ["earned", "spent"].forEach((key) => {
    const source = Array.isArray(details[key]) ? details[key] : [];
    next[key] = source
      .filter((entry) => entry && typeof entry === "object")
      .map((entry) => ({
        time: String(entry.time || "").trim(),
        amount: Number(entry.amount) || 0,
        source: String(entry.source || "").trim(),
      }))
      .filter((entry) => entry.amount > 0);
  });

  return next;
}

function extractSessionLogTime(line) {
  const match = String(line || "").match(/\b(\d{2}:\d{2}:\d{2})(?:,\d{3})?\b/);
  return match ? match[1] : "";
}

function extractSessionMessage(line) {
  const text = String(line || "");
  const markerIndex = text.indexOf(" - ");
  return markerIndex >= 0 ? text.slice(markerIndex + 3).trim() : text.trim();
}

function isStandaloneKamaMessage(message) {
  return /^(?:\[[^\]]+\]\s*)?(?:你获得了|你失去了|获得了|失去了|won|earned|gained|spent|lost)\s*[\d\s.,\u00A0]+\s*(?:kamas?|卡玛)[。.]?$/i.test(
    String(message || "").trim()
  );
}

function toSessionTimeSeconds(value) {
  const match = String(value || "").match(/^(\d{2}):(\d{2}):(\d{2})$/);
  if (!match) return null;
  return (
    parseInt(match[1], 10) * 3600 +
    parseInt(match[2], 10) * 60 +
    parseInt(match[3], 10)
  );
}

function isNearbySessionTime(a, b, maxDeltaSeconds = 10) {
  const aSeconds = toSessionTimeSeconds(a);
  const bSeconds = toSessionTimeSeconds(b);
  if (aSeconds === null || bSeconds === null) return false;
  return Math.abs(aSeconds - bSeconds) <= maxDeltaSeconds;
}

function buildSessionKamaDetail(kind, amount, line) {
  const time = extractSessionLogTime(line);
  const message = extractSessionMessage(line);
  let source = message;

  if (
    isStandaloneKamaMessage(message) &&
    lastSessionContextLine?.message &&
    lastSessionContextLine.message !== message &&
    isNearbySessionTime(time, lastSessionContextLine.time)
  ) {
    source = `${lastSessionContextLine.message} / ${message}`;
  }

  return { time, amount, source };
}

function appendSessionKamaDetail(kind, amount, line) {
  if (!sessionStats.kamas.details || typeof sessionStats.kamas.details !== "object") {
    sessionStats.kamas.details = createEmptySessionKamaDetails();
  }
  if (!Array.isArray(sessionStats.kamas.details[kind])) {
    sessionStats.kamas.details[kind] = [];
  }
  sessionStats.kamas.details[kind].push(buildSessionKamaDetail(kind, amount, line));
}

function renderSessionKamaDetail() {
  const listEl = document.getElementById("session-kama-detail-list");
  const summaryEl = document.getElementById("session-kama-detail-summary");
  const titleEl = document.getElementById("session-kama-detail-title");
  if (!listEl || !summaryEl || !titleEl) return;

  const kind = sessionKamaDetailMode === "spent" ? "spent" : "earned";
  const details = Array.isArray(sessionStats.kamas.details?.[kind])
    ? sessionStats.kamas.details[kind]
    : [];
  const total = sessionStats.kamas[kind] || 0;
  const title = kind === "spent" ? "卡玛花费明细" : "卡玛获得明细";

  titleEl.textContent = title;
  summaryEl.textContent = `共 ${details.length} 笔，合计 ${total.toLocaleString()} ₭`;

  if (!details.length) {
    listEl.innerHTML = '<div class="empty-state-mini">暂无明细记录。</div>';
    return;
  }

  listEl.innerHTML = details
    .slice()
    .reverse()
    .map(
      (entry) => `
        <div class="session-kama-detail-item">
          <div class="session-kama-detail-meta">
            <span class="session-kama-detail-time">${entry.time || "--:--:--"}</span>
            <span class="session-kama-detail-amount ${kind}">${kind === "spent" ? "-" : "+"}${entry.amount.toLocaleString()} ₭</span>
          </div>
          <div class="session-kama-detail-source">${entry.source || "未记录来源"}</div>
        </div>
      `
    )
    .join("");
}

function positionSessionKamaDetailWindow() {
  const detailWindow = document.getElementById("session-kama-detail-window");
  const sessionWindow = document.getElementById("session-window");
  if (!detailWindow || !sessionWindow) return;

  const sessionRect = sessionWindow.getBoundingClientRect();
  const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0;
  const rightPreferredLeft = sessionRect.right + 12;
  const fitsRight = rightPreferredLeft + detailWindow.offsetWidth <= viewportWidth - 12;

  detailWindow.style.top = `${Math.max(12, Math.round(sessionRect.top))}px`;
  if (fitsRight) {
    detailWindow.style.left = `${Math.round(rightPreferredLeft)}px`;
  } else {
    detailWindow.style.left = `${Math.max(12, Math.round(sessionRect.left - detailWindow.offsetWidth - 12))}px`;
  }
}

function openSessionKamaDetail(mode = "earned") {
  const detailWindow = document.getElementById("session-kama-detail-window");
  if (!detailWindow) return;

  sessionKamaDetailMode = mode === "spent" ? "spent" : "earned";
  renderSessionKamaDetail();
  detailWindow.style.display = "flex";
  positionSessionKamaDetailWindow();
}

function closeSessionKamaDetail() {
  const detailWindow = document.getElementById("session-kama-detail-window");
  if (detailWindow) detailWindow.style.display = "none";
}

function loadSessionData() {
  const stored = localStorage.getItem("wakfu_session_stats");
  const storedTime = localStorage.getItem("wakfu_session_start");
  const storedLastActive = localStorage.getItem("wakfu_session_last_active");

  if (stored) {
    try {
      const parsed = JSON.parse(stored);
      sessionStats.kamas = {
        ...sessionStats.kamas,
        ...parsed.kamas,
        details: sanitizeSessionKamaDetails(parsed.kamas?.details),
      };
      sessionStats.quests = parsed.quests || 0;
      sessionStats.challenges = parsed.challenges || 0;

      if (parsed.xp) {
        for (const key in parsed.xp) {
          const canonical = key === "Weapon Master" ? "Weapons Master" : key;
          if (sessionStats.xp[canonical] !== undefined) {
            sessionStats.xp[canonical] = parsed.xp[key];
          }
        }
      }
    } catch (error) {
      console.error("Failed to load session stats", error);
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
  const patterns = [
    /任务[“"]([^”"]*)[”"]/,
    /[“"]([^”"]*)[”"]任务/,
    /quest\s+[“"]([^”"]*)[”"]/i,
    /[“"]([^”"]*)[”"]\s+quest/i,
    /qu[êe]te\s+[“"]([^”"]*)[”"]/i,
    /[“"]([^”"]*)[”"]\s+qu[êe]te/i,
    /misi[oó]n\s+[“"]([^”"]*)[”"]/i,
    /[“"]([^”"]*)[”"]\s+misi[oó]n/i,
    /miss[aã]o\s+[“"]([^”"]*)[”"]/i,
    /[“"]([^”"]*)[”"]\s+miss[aã]o/i,
  ];

  for (const pattern of patterns) {
    const match = line.match(pattern);
    if (match) return match[1].trim();
  }

  return "";
}

function normalizeSessionQuestName(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[“”"']/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function isEnvironmentalChallengeQuest(name) {
  const normalizedName = normalizeSessionQuestName(name);
  if (!normalizedName) return false;

  if (
    normalizedName === "特殊挑战" ||
    normalizedName === "special challenge"
  ) {
    return true;
  }

  return SESSION_ENVIRONMENTAL_CHALLENGE_PREFIXES.some(
    (prefix) =>
      normalizedName === prefix ||
      normalizedName.startsWith(`${prefix}:`) ||
      normalizedName.startsWith(`${prefix}：`)
  );
}

function processSessionLog(line) {
  if (!line) return;

  const lower = line.toLowerCase();
  let statChanged = false;

  const kamaMatch = line.match(REGEX_KAMAS);
  if (kamaMatch) {
    const amount = parseInt(kamaMatch[1].replace(/[\s.,\u00A0]/g, ""), 10);
    if (!Number.isNaN(amount)) {
      if (
        REGEX_KAMAS_SPENT.test(line) ||
        lower.includes("spent") ||
        lower.includes("lost") ||
        lower.includes("perdu") ||
        lower.includes("perdio") ||
        lower.includes("gasto")
      ) {
        sessionStats.kamas.spent += amount;
        appendSessionKamaDetail("spent", amount, line);
      } else {
        sessionStats.kamas.earned += amount;
        appendSessionKamaDetail("earned", amount, line);
      }
      statChanged = true;
    }
  }

  const xpMatch = line.match(REGEX_XP);
  if (xpMatch && REGEX_XP_CONTEXT.test(line)) {
    const amount = parseInt(xpMatch[1].replace(/[\s.,\u00A0]/g, ""), 10);
    if (!Number.isNaN(amount)) {
      const category = getSessionProfessionCategory(line);
      if (sessionStats.xp[category] === undefined) {
        sessionStats.xp[category] = 0;
      }
      sessionStats.xp[category] += amount;
      statChanged = true;
    }
  }

  const questName = extractSessionQuestName(line);
  const isQuestSuccess = REGEX_QUEST_SUCCESS_ONLY.test(line);
  if (isQuestSuccess) {
    if (questName && isEnvironmentalChallengeQuest(questName)) {
      sessionStats.challenges++;
    } else {
      sessionStats.quests++;
    }
    statChanged = true;
  }

  if (statChanged) {
    if (sessionStartTime === null) {
      startSessionTimer();
    }
    updateSessionUI();
    saveSessionData();
  }

  const message = extractSessionMessage(line);
  if (message && !isStandaloneKamaMessage(message)) {
    lastSessionContextLine = {
      time: extractSessionLogTime(line),
      message,
    };
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

  elEarned.textContent = `${sessionStats.kamas.earned.toLocaleString()} ₭`;
  elEarned.className = "stat-val gold";

  document.getElementById("sess-kamas-spent").textContent =
    `${sessionStats.kamas.spent.toLocaleString()} ₭`;

  const net = sessionStats.kamas.earned - sessionStats.kamas.spent;
  const elNet = document.getElementById("sess-kamas-net");
  elNet.textContent = `${net > 0 ? "+" : ""}${net.toLocaleString()} ₭`;
  elNet.className = `stat-val ${net >= 0 ? "positive" : "negative"}`;

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
    if (val <= 0) return;

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
  });

  if (!hasXp) {
    xpContainer.innerHTML = '<div class="empty-state-mini">暂无经验记录。</div>';
  }

  renderSessionKamaDetail();
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
    closeSessionKamaDetail();

    if (sessionTimerInterval !== null) {
      clearInterval(sessionTimerInterval);
      sessionTimerInterval = null;
    }
  }
}

function resetSessionStats() {
  sessionStats.kamas.earned = 0;
  sessionStats.kamas.spent = 0;
  sessionStats.kamas.details = createEmptySessionKamaDetails();
  sessionStats.quests = 0;
  sessionStats.challenges = 0;

  for (const key in sessionStats.xp) {
    sessionStats.xp[key] = 0;
  }

  sessionStartTime = Date.now();
  lastSessionContextLine = null;
  saveSessionData();
  updateSessionUI();
  updateCurrentSessionDuration();
}

loadSessionData();

window.toggleSessionWindow = toggleSessionWindow;
window.resetSessionStats = resetSessionStats;
window.startSessionTimer = startSessionTimer;
window.openSessionKamaDetail = openSessionKamaDetail;
window.closeSessionKamaDetail = closeSessionKamaDetail;

window.addEventListener("beforeunload", () => {
  saveSessionData();
});
