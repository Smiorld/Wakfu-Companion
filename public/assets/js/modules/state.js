// ==========================================
// CONFIG & STATE
// ==========================================
let fileHandle,
  fileOffset = 0,
  isReading = false;
let parseIntervalId = null,
  watchdogIntervalId = null;
let pipWindow = null;
let trackerViewMode = "grid";
let combatLineCache = new Set();
let logLineCache = new Set();
let allKnownSpells = new Set();
const MAX_CACHE_SIZE = 200;
const MAX_CHAT_HISTORY = 500;
const MAX_FIGHT_HISTORY = 5;
let trackerDirty = false;
let fightHistory = []; // Stores objects: { damage: {}, healing: {}, armor: {} }
let currentViewIndex = "live"; // 'live' or 0-4
let hasUnsavedChanges = false; // Prevents duplicate saves
let showTrackerFooter = localStorage.getItem("wakfu_show_totals") === "true";

// 1. AUTO RESET DEFAULT (True unless user saved 'false')
const storedReset = localStorage.getItem("wakfu_auto_reset");
let isAutoResetOn = storedReset === null ? true : storedReset === "true";
let currentTrackerFilter =
  localStorage.getItem("wakfu_tracker_filter") || "SHOW_ALL";

// Global function to handle the toggle and save state
window.toggleIconVariant = function (playerName, imgEl) {
  // 1. Toggle State
  playerVariantState[playerName] = !playerVariantState[playerName];

  // 2. Get Class Name
  const className = playerClasses[playerName];
  if (!className) return;

  // 3. Update Image Source Immediately
  const newSrc = playerVariantState[playerName]
    ? `././assets/img/classes/${className}-f.png`
    : `././assets/img/classes/${className}.png`;
  imgEl.src = newSrc;

  // 4. Clear Cache (So the next re-render generates the correct version)
  delete playerIconCache[playerName];
};

// Combat State
let fightData = {}; // Damage
let healData = {}; // Healing
let armorData = {}; // Armor
let playerClasses = {}; // Map player Name -> Class Icon Filename
let summonBindings = {}; // Map: SummonName -> MasterName
let playerIconCache = {}; // Cache for icon HTML strings to avoid re-calc
let playerVariantState = {}; // Stores true/false for gender toggle
let manualOverrides = JSON.parse(
  localStorage.getItem("wakfu_overrides") || "{}"
); // Map player Name -> 'ally' | 'enemy'
let activeMeterMode = "damage"; // 'damage', 'healing', 'armor'
let currentCaster = "Unknown";
let currentSpell = "Unknown Spell";
let expandedPlayers = new Set();
let lastCombatTime = Date.now();
let resetDelayMs = 120000;

// Spell Map (Built at runtime)
let spellToClassMap = {};

// Chat State
const translationQueue = [];
let isTranslating = false;
const transConfig = {
  enabled: true,
};
let currentChatFilter = "all";

// Item Tracker State
let trackedItems = [];

// Auto Fight State
let awaitingNewFight = false;
