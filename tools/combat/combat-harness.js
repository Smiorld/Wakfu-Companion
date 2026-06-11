const fs = require("fs");
const path = require("path");
const vm = require("vm");

// Maintenance note:
// This harness intentionally reuses the live browser parser from
// public/assets/js/modules/combat.js instead of duplicating combat logic.
// When combat.js changes its runtime dependencies, boot order, or expected
// globals, update this harness stub/loading sequence as well.

function createStubElement() {
  return {
    addEventListener() {},
    removeEventListener() {},
    appendChild() {},
    querySelector() {
      return null;
    },
    querySelectorAll() {
      return [];
    },
    classList: {
      add() {},
      remove() {},
      contains() {
        return false;
      },
    },
    style: {},
    innerHTML: "",
    textContent: "",
    value: "",
    checked: false,
    disabled: false,
    title: "",
  };
}

function createLocalStorage() {
  const store = new Map();
  return {
    getItem(key) {
      return store.has(key) ? store.get(key) : null;
    },
    setItem(key, value) {
      store.set(key, String(value));
    },
    removeItem(key) {
      store.delete(key);
    },
    clear() {
      store.clear();
    },
  };
}

function loadScriptIntoContext(context, absolutePath) {
  const code = fs.readFileSync(absolutePath, "utf8");
  const script = new vm.Script(code, { filename: absolutePath });
  script.runInContext(context);
}

function injectHarness(context) {
  const harnessCode = `
    function __combatClone(value) {
      return JSON.parse(JSON.stringify(value));
    }

    globalThis.__combatTraceBuffer = [];

    globalThis.__combatHarness__ = {
      reset() {
        if (typeof performReset === "function") {
          performReset(true);
        }
      },
      snapshot() {
        return {
          currentCaster,
          currentSpell,
          fightData: __combatClone(fightData),
          healData: __combatClone(healData),
          armorData: __combatClone(armorData),
          stateSources: __combatClone(stateSources),
          stateOwnershipMeta: __combatClone(stateOwnershipMeta),
          pendingIndirectAttribution: pendingIndirectAttribution ? __combatClone(pendingIndirectAttribution) : null,
        };
      },
      clearTraceBuffer() {
        globalThis.__combatTraceBuffer = [];
      },
      consumeTraceBuffer() {
        const out = globalThis.__combatTraceBuffer.slice();
        globalThis.__combatTraceBuffer.length = 0;
        return out;
      },
    };

    const __originalUpdateCombatData = updateCombatData;
    updateCombatData = function (dataSet, player, spell, amount, element) {
      let category = "damage";
      if (dataSet === armorData) category = "armor";
      else if (dataSet === healData) category = "healing";

      globalThis.__combatTraceBuffer.push({
        category,
        player,
        spell,
        amount,
        element: element || null,
        currentCaster,
        currentSpell,
        pendingIndirectAttribution: pendingIndirectAttribution ? __combatClone(pendingIndirectAttribution) : null,
      });

      return __originalUpdateCombatData(dataSet, player, spell, amount, element);
    };
  `;

  new vm.Script(harnessCode, { filename: "combat-harness-inject.js" }).runInContext(context);
}

function createCombatHarness() {
  const repoRoot = path.resolve(__dirname, "..", "..");
  const context = {
    console,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    Date,
    Math,
    JSON,
    RegExp,
    Map,
    Set,
    Array,
    Object,
    String,
    Number,
    Boolean,
    parseInt,
    parseFloat,
    isNaN,
  };

  context.window = context;
  context.window.addEventListener = () => {};
  context.window.removeEventListener = () => {};
  context.window.lastReadTime = 0;
  context.document = {
    getElementById() {
      return createStubElement();
    },
    querySelector() {
      return null;
    },
    querySelectorAll() {
      return [];
    },
    addEventListener() {},
  };
  context.localStorage = createLocalStorage();
  context.renderMeter = () => {};
  context.updateWatchdogUI = () => {};
  context.updateHistoryButtons = () => {};
  context.processChatLog = () => {};
  context.processItemLog = () => {};
  context.alert = () => {};

  const vmContext = vm.createContext(context);

  loadScriptIntoContext(vmContext, path.join(repoRoot, "public/assets/js/data/database.js"));
  loadScriptIntoContext(vmContext, path.join(repoRoot, "public/assets/js/data/wakfu_monsters.js"));
  loadScriptIntoContext(vmContext, path.join(repoRoot, "public/assets/js/modules/state.js"));
  loadScriptIntoContext(vmContext, path.join(repoRoot, "public/assets/js/modules/combat.js"));
  injectHarness(vmContext);

  if (typeof vmContext.generateSpellMap === "function") {
    vmContext.generateSpellMap();
  }
  if (typeof vmContext.initMonsterDatabase === "function") {
    vmContext.initMonsterDatabase();
  }
  if (typeof vmContext.performReset === "function") {
    vmContext.performReset(true);
  }

  return {
    context: vmContext,
    processFightLog(line) {
      vmContext.processFightLog(line);
    },
    snapshot() {
      return vmContext.__combatHarness__.snapshot();
    },
    clearTraceBuffer() {
      vmContext.__combatHarness__.clearTraceBuffer();
    },
    consumeTraceBuffer() {
      return vmContext.__combatHarness__.consumeTraceBuffer();
    },
    reset() {
      vmContext.__combatHarness__.reset();
    },
  };
}

module.exports = {
  createCombatHarness,
};
