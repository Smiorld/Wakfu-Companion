// ==========================================
// MAIN.JS - EVENT MANAGER & ENTRY POINT
// ==========================================

// --- GLOBAL DOM ELEMENTS ---
const setupPanel = document.getElementById("setup-panel");
const dropZone = document.getElementById("drop-zone");
const activeFilename = document.getElementById("active-filename");
const liveIndicator = document.getElementById("live-indicator");
const chatList = document.getElementById("chat-list");
const autoResetBtn = document.getElementById("autoResetToggle");
const autoResetText = document.getElementById("autoResetText");
const clearChatBtn = document.getElementById("clearChatBtn");

// Reconnect Elements
const reconnectContainer = document.getElementById("reconnect-container");
const reconnectBtn = document.getElementById("reconnect-btn");
const newFileBtn = document.getElementById("new-file-btn");
const prevFilenameEl = document.getElementById("prev-filename");

// Copy Button
const copyPathBtn = document.getElementById("copy-path-btn");
const logPathEl = document.getElementById("log-path");

// Item Tracker Elements
const profSelect = document.getElementById("prof-select");
const itemInput = document.getElementById("item-input");
const itemDatalist = document.getElementById("item-datalist");
const trackerList = document.getElementById("tracker-list");

// --- INITIALIZATION ---
document.addEventListener("DOMContentLoaded", () => {
  // 1. Data Preparation
  if (typeof initMonsterDatabase === "function") initMonsterDatabase();
  if (typeof generateSpellMap === "function") generateSpellMap();
  if (typeof initTrackerDropdowns === "function") initTrackerDropdowns();

  // 2. Core Logic & State Restoration
  if (typeof checkPreviousFile === "function") checkPreviousFile();
  if (typeof loadFightHistory === "function") loadFightHistory();
  if (typeof initForecast === "function") initForecast();

  // 3. Restore Live Combat Data
  if (typeof loadLiveCombatState === "function") {
    loadLiveCombatState();
  }

  // 4. UI Rendering
  if (typeof renderMeter === "function") renderMeter();
  if (typeof setupDragAndDrop === "function") setupDragAndDrop();
  if (typeof updateDailyTimer === "function") updateDailyTimer();
  if (typeof updateWatchdogUI === "function") updateWatchdogUI();

  // 5. Background Tasks
  setInterval(updateDailyTimer, 60000);

  // Memory Maintenance
  if (typeof startMaintenanceRoutine === "function") {
    startMaintenanceRoutine();
  }

  // 6. Draggable Windows
  const qtWindow = document.getElementById("quick-trans-modal");
  const qtHandle = document.getElementById("qt-drag-handle");
  if (qtWindow && qtHandle) {
    makeDraggable(qtWindow, qtHandle);
  }

  const sessWindow = document.getElementById("session-window");
  const sessHandle = document.getElementById("session-drag-handle");
  if (sessWindow && sessHandle) {
    makeDraggable(sessWindow, sessHandle);
  }

  // 7. ASYNC DATA LOAD (Fix for Missing Tooltips)
  // Load professions data in background, then refresh tracker to populate "Used In" tooltips
  if (typeof loadScript === "function") {
    loadScript("assets/js/data/professions_data.js")
      .then(() => {
        // Re-render tracker now that data is available
        if (typeof renderTracker === "function") renderTracker();
      })
      .catch((err) => console.warn("Background load failed:", err));
  }
});

// --- EVENT LISTENERS ---

// 1. File Drop Logic
dropZone.addEventListener("dragover", (e) => e.preventDefault());

dropZone.addEventListener("drop", async (e) => {
  e.preventDefault();
  const items = e.dataTransfer.items;

  if (items && items[0] && items[0].kind === "file") {
    try {
      const handle = await items[0].getAsFileSystemHandle();
      const fileName = handle.name.toLowerCase();

      if (fileName !== "wakfu_chat.log") {
        alert("文件不正确。\n请只拖入 `wakfu_chat.log`。");
        return;
      }

      // NEW: Force a reset if dragging a new file (ignores restored data)
      window.isRestoredSession = false;

      fileHandle = handle;
      await startTracking(fileHandle);
    } catch (err) {
      console.error(err);
      alert("读取文件失败，请重试。");
    }
  }
});

// 2. Reconnect Button Logic
if (reconnectBtn) {
  reconnectBtn.addEventListener("click", async () => {
    const handle = await getSavedHandle(); // filesystem.js
    if (handle) {
      const opts = { mode: "read" };
      try {
        if (
          (await handle.queryPermission(opts)) === "granted" ||
          (await handle.requestPermission(opts)) === "granted"
        ) {
          fileHandle = handle;
          await startTracking(fileHandle); // parser.js
        } else {
          alert("读取权限被拒绝，请重新选择文件。");
          reconnectContainer.style.display = "none";
          dropZone.style.display = "block";
        }
      } catch (e) {
        console.error("Permission error:", e);
        reconnectContainer.style.display = "none";
        dropZone.style.display = "block";
      }
    }
  });
}

// 3. New File Button
if (newFileBtn) {
  newFileBtn.addEventListener("click", () => {
    reconnectContainer.style.display = "none";
    dropZone.style.display = "block";
  });
}

// 4. Copy Path Logic
if (copyPathBtn && logPathEl) {
  copyPathBtn.addEventListener("click", () => {
    navigator.clipboard.writeText(logPathEl.textContent).then(() => {
      const originalText = copyPathBtn.textContent;
      copyPathBtn.textContent = "已复制";
      copyPathBtn.style.background = "var(--accent, #00e1ff)";
      copyPathBtn.style.color = "#000";

      setTimeout(() => {
        copyPathBtn.textContent = originalText;
        copyPathBtn.style.background = "#444";
        copyPathBtn.style.color = "#fff";
      }, 1500);
    });
  });
}

// 5. Chat Clear
clearChatBtn.addEventListener("click", () => {
  chatList.innerHTML = '<div class="empty-state">Chat cleared</div>';
});

// 6. Watchdog Toggle
autoResetBtn.addEventListener("click", () => {
  isAutoResetOn = !isAutoResetOn;
  localStorage.setItem("wakfu_auto_reset", isAutoResetOn);
  autoResetBtn.classList.toggle("active", isAutoResetOn);
  updateWatchdogUI(); // ui.js
});

window.startSessionTimer = startSessionTimer;

async function startTracking(handle) {
  await saveFileHandleToDB(handle);

  document.getElementById("setup-panel").style.display = "none";
  activeFilename.textContent = handle.name;
  liveIndicator.style.display = "inline-block";

  // Only reset if this ISN'T a restored session
  if (window.isRestoredSession) {
    window.isRestoredSession = false; // Consume flag
    renderMeter(); // Ensure UI matches data
  } else {
    performReset(true);
  }

  // Start Session Timer (for Session Recap)
  if (typeof window.startSessionTimer === "function") {
    window.startSessionTimer(); // This function inside sessionRecap handles its own persistence checks
  }

  chatList.innerHTML =
    '<div class="empty-state">等待聊天日志...</div>';

  try {
    const file = await handle.getFile();
    fileOffset = file.size;
  } catch (e) {
    fileOffset = 0;
  }

  if (parseIntervalId) clearInterval(parseIntervalId);
  parseIntervalId = setInterval(parseFile, 1000);
  startWatchdog();
}

// Maintenance Routine to periodically purge internal caches.
function startMaintenanceRoutine() {
  setInterval(() => {
    // 1. Clear Parser Cache
    if (typeof logLineCache !== "undefined") {
      logLineCache.clear();
    }
  }, 300000); // Every 5 minutes
}
