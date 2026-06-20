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
const bugReportBtn = document.getElementById("bug-report-btn");

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

let pendingDroppedHandles = {
  mainLogHandle: null,
  chatLogHandle: null,
};

function getOrCreateDropStatusLine() {
  if (!dropZone) return null;

  let statusEl = document.getElementById("drop-zone-file-status");
  if (statusEl) return statusEl;

  statusEl = document.createElement("p");
  statusEl.id = "drop-zone-file-status";
  statusEl.style.marginTop = "10px";
  statusEl.style.color = "#8fdcff";
  statusEl.style.fontSize = "0.9rem";
  statusEl.style.lineHeight = "1.6";

  const pathContainer = dropZone.querySelector(".path-container");
  if (pathContainer?.parentNode) {
    pathContainer.parentNode.insertBefore(statusEl, pathContainer.nextSibling);
  } else {
    dropZone.appendChild(statusEl);
  }

  return statusEl;
}

function resetPendingDropHandles() {
  pendingDroppedHandles = {
    mainLogHandle: null,
    chatLogHandle: null,
  };
}

function renderPendingDropStatus() {
  const statusEl = getOrCreateDropStatusLine();
  if (!statusEl) return;

  const mainReady = Boolean(pendingDroppedHandles.mainLogHandle);
  const chatReady = Boolean(pendingDroppedHandles.chatLogHandle);

  if (!mainReady && !chatReady) {
    statusEl.textContent =
      "\u652f\u6301\u5206\u4e24\u6b21\u62d6\u5165\uff1a\u53ef\u4ee5\u5148\u62d6\u4e00\u4e2a\uff0c\u518d\u62d6\u53e6\u4e00\u4e2a\u3002";
    return;
  }

  statusEl.textContent =
    `\u5df2\u9009\uff1a wakfu.log ${mainReady ? "\u2713" : "\u2026"}  |  ` +
    `wakfu_chat.log ${chatReady ? "\u2713" : "\u2026"}`;
}

function initializeDualFilePromptUI() {
  if (document.title) {
    document.title = "\u6c83\u571f\u4f34\u4fa3 | T2\u85af\u6761";
  }

  const dropTitle = dropZone?.querySelector("h3");
  if (dropTitle) {
    dropTitle.textContent =
      "\u628a `wakfu.log` \u548c `wakfu_chat.log` \u62d6\u5230\u8fd9\u91cc";
  }

  const dropParagraphs = dropZone?.querySelectorAll("p");
  if (dropParagraphs?.[0]) {
    dropParagraphs[0].textContent =
      "\u9ed8\u8ba4\u8def\u5f84\uff08\u53ef\u590d\u5236\u5230\u8d44\u6e90\u7ba1\u7406\u5668\uff09\uff1a";
  }
  if (dropParagraphs?.[1]) {
    dropParagraphs[1].textContent =
      "\u53ef\u4ee5\u4e00\u6b21\u62d6\u4e24\u4e2a\uff0c\u4e5f\u53ef\u4ee5\u5206\u4e24\u6b21\u62d6\u5165\u3002";
  }

  if (copyPathBtn) copyPathBtn.textContent = "\u590d\u5236";

  const reconnectLabel = reconnectContainer?.querySelector(".prev-file-label");
  if (reconnectLabel) {
    reconnectLabel.textContent = "\u53d1\u73b0\u4e0a\u6b21\u4f7f\u7528\u7684\u6587\u4ef6\uff1a";
  }

  if (reconnectBtn) reconnectBtn.textContent = "\u91cd\u65b0\u8fde\u63a5";
  if (newFileBtn) newFileBtn.textContent = "\u91cd\u65b0\u9009\u62e9\u6587\u4ef6";

  const browserWarning = reconnectContainer?.querySelector(".browser-warning");
  if (browserWarning) {
    browserWarning.textContent =
      "\uff08\u6d4f\u89c8\u5668\u4f1a\u518d\u6b21\u786e\u8ba4\u8fd9\u4e24\u4e2a\u6587\u4ef6\u7684\u8bfb\u53d6\u6743\u9650\uff09";
  }

  if (activeFilename && !fileHandle && !chatFileHandle) {
    activeFilename.textContent = "\u672a\u9009\u62e9\u6587\u4ef6";
  }

  renderPendingDropStatus();
}

function requestImmediateLogCatchup(reason = "") {
  if ((!fileHandle && !chatFileHandle) || typeof parseTrackedFiles !== "function") return;

  Promise.resolve()
    .then(() => parseTrackedFiles())
    .catch((error) => {
      console.warn(`[Nexus] Immediate log catch-up failed${reason ? ` (${reason})` : ""}:`, error);
    });
}

// --- INITIALIZATION ---
document.addEventListener("DOMContentLoaded", () => {
  initializeDualFilePromptUI();

  if (typeof initMonsterDatabase === "function") initMonsterDatabase();
  if (typeof generateSpellMap === "function") generateSpellMap();
  if (typeof initTrackerDropdowns === "function") initTrackerDropdowns();

  if (typeof checkPreviousFile === "function") checkPreviousFile();
  if (typeof loadFightHistory === "function") loadFightHistory();
  if (typeof initForecast === "function") initForecast();
  if (typeof initSoundSettings === "function") initSoundSettings();
  if (typeof initBroadcastSystem === "function") initBroadcastSystem();

  if (typeof loadLiveCombatState === "function") {
    loadLiveCombatState();
  }

  if (typeof renderMeter === "function") renderMeter();
  if (typeof setupDragAndDrop === "function") setupDragAndDrop();
  if (typeof updateDailyTimer === "function") updateDailyTimer();
  if (typeof updateWatchdogUI === "function") updateWatchdogUI();
  if (typeof syncTranslationConfigUI === "function") syncTranslationConfigUI();
  if (typeof updateLangButtons === "function") updateLangButtons();

  const translationCloseBtn = document.querySelector(
    "#translation-config-modal .close-modal"
  );
  const azureGuideCloseBtn = document.querySelector(
    "#azure-guide-modal .close-modal"
  );
  if (translationCloseBtn) translationCloseBtn.textContent = "\u00d7";
  if (azureGuideCloseBtn) azureGuideCloseBtn.textContent = "\u00d7";

  setInterval(updateDailyTimer, 60000);

  if (typeof startMaintenanceRoutine === "function") {
    startMaintenanceRoutine();
  }

  const qtWindow = document.getElementById("quick-trans-modal");
  const qtHandle = document.getElementById("qt-drag-handle");
  if (qtWindow && qtHandle) {
    makeDraggable(qtWindow, qtHandle);
  }

  const translationConfigWindow = document.getElementById("translation-config-modal");
  const translationConfigHandle = document.getElementById("translation-config-drag-handle");
  if (translationConfigWindow && translationConfigHandle) {
    makeDraggable(translationConfigWindow, translationConfigHandle);
  }

  const azureGuideWindow = document.getElementById("azure-guide-modal");
  const azureGuideHandle = document.getElementById("azure-guide-drag-handle");
  if (azureGuideWindow && azureGuideHandle) {
    makeDraggable(azureGuideWindow, azureGuideHandle);
  }

  const sessWindow = document.getElementById("session-window");
  const sessHandle = document.getElementById("session-drag-handle");
  if (sessWindow && sessHandle) {
    makeDraggable(sessWindow, sessHandle);
  }

  const soundSettingsWindow = document.getElementById("sound-settings-modal");
  const soundSettingsHandle = document.getElementById("sound-settings-drag-handle");
  if (soundSettingsWindow && soundSettingsHandle) {
    makeDraggable(soundSettingsWindow, soundSettingsHandle);
  }

  if (typeof loadScript === "function") {
    loadScript("assets/js/data/professions_data.js")
      .then(() => {
        if (typeof renderTracker === "function") renderTracker();
      })
      .catch((error) => console.warn("Background load failed:", error));
  }
});

// --- EVENT LISTENERS ---
dropZone.addEventListener("dragover", (event) => event.preventDefault());

dropZone.addEventListener("drop", async (event) => {
  event.preventDefault();
  const items = Array.from(event.dataTransfer.items || []).filter(
    (item) => item.kind === "file"
  );

  if (!items.length) return;

  try {
    const handles = await Promise.all(items.map((item) => item.getAsFileSystemHandle()));
    let recognizedCount = 0;

    handles.forEach((handle) => {
      const fileName = String(handle.name || "").toLowerCase();
      if (fileName === "wakfu.log") {
        pendingDroppedHandles.mainLogHandle = handle;
        recognizedCount += 1;
      } else if (fileName === "wakfu_chat.log") {
        pendingDroppedHandles.chatLogHandle = handle;
        recognizedCount += 1;
      }
    });

    if (!recognizedCount) {
      alert(
        "\u6587\u4ef6\u4e0d\u6b63\u786e\u3002\n\u8bf7\u62d6\u5165 `wakfu.log` \u6216 `wakfu_chat.log`\u3002"
      );
      return;
    }

    renderPendingDropStatus();

    if (!pendingDroppedHandles.mainLogHandle || !pendingDroppedHandles.chatLogHandle) {
      return;
    }

    window.isRestoredSession = false;
    fileHandle = pendingDroppedHandles.mainLogHandle;
    chatFileHandle = pendingDroppedHandles.chatLogHandle;
    await startTracking(fileHandle, chatFileHandle);
  } catch (error) {
    console.error(error);
    alert("\u8bfb\u53d6\u6587\u4ef6\u5931\u8d25\uff0c\u8bf7\u91cd\u8bd5\u3002");
  }
});

if (reconnectBtn) {
  reconnectBtn.addEventListener("click", async () => {
    const handles = await getSavedHandles();
    if (!handles.mainLogHandle || !handles.chatLogHandle) return;

    const opts = { mode: "read" };
    try {
      const mainGranted =
        (await handles.mainLogHandle.queryPermission(opts)) === "granted" ||
        (await handles.mainLogHandle.requestPermission(opts)) === "granted";
      const chatGranted =
        (await handles.chatLogHandle.queryPermission(opts)) === "granted" ||
        (await handles.chatLogHandle.requestPermission(opts)) === "granted";

      if (!mainGranted || !chatGranted) {
        alert("\u8bfb\u53d6\u6743\u9650\u88ab\u62d2\u7edd\uff0c\u8bf7\u91cd\u65b0\u9009\u62e9\u6587\u4ef6\u3002");
        resetPendingDropHandles();
        renderPendingDropStatus();
        reconnectContainer.style.display = "none";
        dropZone.style.display = "block";
        return;
      }

      fileHandle = handles.mainLogHandle;
      chatFileHandle = handles.chatLogHandle;
      await startTracking(fileHandle, chatFileHandle);
    } catch (error) {
      console.error("Permission error:", error);
      reconnectContainer.style.display = "none";
      dropZone.style.display = "block";
    }
  });
}

if (newFileBtn) {
  newFileBtn.addEventListener("click", () => {
    resetPendingDropHandles();
    renderPendingDropStatus();
    reconnectContainer.style.display = "none";
    dropZone.style.display = "block";
  });
}

if (copyPathBtn && logPathEl) {
  copyPathBtn.addEventListener("click", () => {
    navigator.clipboard.writeText(logPathEl.textContent).then(() => {
      const originalText = copyPathBtn.textContent;
      copyPathBtn.textContent = "\u5df2\u590d\u5236";
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

clearChatBtn.addEventListener("click", () => {
  chatList.innerHTML = '<div class="empty-state">\u804a\u5929\u5df2\u6e05\u7a7a</div>';
});

autoResetBtn.addEventListener("click", () => {
  isAutoResetOn = !isAutoResetOn;
  localStorage.setItem("wakfu_auto_reset", isAutoResetOn);
  autoResetBtn.classList.toggle("active", isAutoResetOn);
  updateWatchdogUI();
});

if (bugReportBtn) {
  bugReportBtn.addEventListener("click", async () => {
    if (typeof exportBugReportLog === "function") {
      await exportBugReportLog();
    }
  });
}

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") {
    requestImmediateLogCatchup("visibilitychange");
  }
});

window.addEventListener("focus", () => {
  requestImmediateLogCatchup("focus");
});

window.addEventListener("pageshow", () => {
  requestImmediateLogCatchup("pageshow");
});

window.startSessionTimer = startSessionTimer;

async function startTracking(mainLogHandle, nextChatHandle) {
  fileHandle = mainLogHandle;
  chatFileHandle = nextChatHandle;
  resetPendingDropHandles();
  renderPendingDropStatus();

  await saveFileHandlesToDB({
    mainLogHandle,
    chatLogHandle: nextChatHandle,
  });

  document.getElementById("setup-panel").style.display = "none";
  activeFilename.textContent = `${mainLogHandle.name} + ${nextChatHandle.name}`;
  liveIndicator.style.display = "inline-block";

  if (window.isRestoredSession) {
    window.isRestoredSession = false;
    renderMeter();
  } else {
    performReset(true);
  }

  if (typeof window.startSessionTimer === "function") {
    window.startSessionTimer();
  }

  chatList.innerHTML = '<div class="empty-state">\u7b49\u5f85\u804a\u5929\u65e5\u5fd7...</div>';

  try {
    const mainFile = await mainLogHandle.getFile();
    fileOffset = mainFile.size;
  } catch (error) {
    fileOffset = 0;
  }

  try {
    const chatFile = await nextChatHandle.getFile();
    chatFileOffset = chatFile.size;
  } catch (error) {
    chatFileOffset = 0;
  }

  logLineCache.clear();
  combatLineCache.clear();
  chatLineCache.clear();

  if (parseIntervalId) clearInterval(parseIntervalId);
  parseIntervalId = setInterval(parseTrackedFiles, 1000);
  parseTrackedFiles();
  startWatchdog();
}

function startMaintenanceRoutine() {
  setInterval(() => {
    if (typeof logLineCache !== "undefined") {
      logLineCache.clear();
    }
    if (typeof combatLineCache !== "undefined") {
      combatLineCache.clear();
    }
    if (typeof chatLineCache !== "undefined") {
      chatLineCache.clear();
    }

    if (
      typeof playerIconCache !== "undefined" &&
      playerIconCache &&
      Object.keys(playerIconCache).length > 0
    ) {
      playerIconCache = {};
    }
  }, 300000);
}
