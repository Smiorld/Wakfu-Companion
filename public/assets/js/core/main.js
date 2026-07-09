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

function getServerSelectionOptionsMarkup(selectedServerKey) {
  const current =
    typeof window.getCurrentBroadcastServerKey === "function"
      ? window.getCurrentBroadcastServerKey()
      : "ogrest";
  const normalized = String(selectedServerKey || current || "ogrest").toLowerCase();
  const options = [
    { value: "ogrest", label: "Ogrest" },
    { value: "rubilax", label: "Rubilax" },
    { value: "pandora", label: "Pandora" },
  ];

  return options
    .map(
      (option) =>
        `<option value="${option.value}"${
          option.value === normalized ? " selected" : ""
        }>${option.label}</option>`
    )
    .join("");
}

function ensureBroadcastServerSelectionUI() {
  const createPicker = (container, id, selectId, anchor, placement = "after") => {
    if (!container) return null;

    let wrapper = document.getElementById(id);
    if (!wrapper) {
      wrapper = document.createElement("div");
      wrapper.id = id;
      wrapper.className = "drop-zone-server-picker";
      wrapper.innerHTML = `
        <label class="drop-zone-server-label" for="${selectId}">当前服务器</label>
        <select
          id="${selectId}"
          class="translation-select drop-zone-server-select"
          data-broadcast-server-select="${id}">${getServerSelectionOptionsMarkup()}</select>
      `;

      if (placement === "append" && anchor) {
        anchor.appendChild(wrapper);
      } else if (anchor?.parentNode) {
        anchor.parentNode.insertBefore(wrapper, anchor.nextSibling);
      } else {
        container.appendChild(wrapper);
      }

      const serverSelect = wrapper.querySelector("select");
      if (serverSelect) {
        serverSelect.addEventListener("change", (event) => {
          if (typeof window.setBroadcastServerKey === "function") {
            window.setBroadcastServerKey(event.target.value, { source: "manual" });
          }
        });
      }
    }

    return wrapper;
  };

  const dropAnchor = dropZone?.querySelector("#drop-zone-server-slot");
  const reconnectAnchor = reconnectContainer?.querySelector(".prev-filename");
  return {
    drop: createPicker(
      dropZone,
      "drop-zone-server-picker",
      "drop-zone-server-select",
      dropAnchor,
      "append"
    ),
    reconnect: createPicker(
      reconnectContainer,
      "reconnect-server-picker",
      "reconnect-server-select",
      reconnectAnchor
    ),
  };
}

function updateBroadcastServerSelectionUI(serverKey) {
  const normalized = String(serverKey || "ogrest").toLowerCase();
  ["drop-zone-server-select", "reconnect-server-select"].forEach((id) => {
    const selector = document.getElementById(id);
    if (selector && selector.value !== normalized) {
      selector.value = normalized;
    }
  });
}

function getOrCreateDropStatusLine() {
  if (!dropZone) return null;

  let statusEl = document.getElementById("drop-zone-file-status");
  if (statusEl) return statusEl;

  statusEl = document.createElement("div");
  statusEl.id = "drop-zone-file-status";
  statusEl.className = "setup-log-status";

  const dropNote = document.getElementById("setup-step-drop-note");
  if (dropNote?.parentNode) {
    dropNote.parentNode.insertBefore(statusEl, dropNote.nextSibling);
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

function ingestSelectedLogHandles(handles) {
  let recognizedCount = 0;

  handles.forEach((handle) => {
    const fileName = String(handle?.name || "").toLowerCase();
    if (fileName === "wakfu.log") {
      pendingDroppedHandles.mainLogHandle = handle;
      recognizedCount += 1;
    } else if (fileName === "wakfu_chat.log") {
      pendingDroppedHandles.chatLogHandle = handle;
      recognizedCount += 1;
    }
  });

  return recognizedCount;
}

async function tryStartTrackingFromPendingHandles() {
  renderPendingDropStatus();

  if (!pendingDroppedHandles.mainLogHandle || !pendingDroppedHandles.chatLogHandle) {
    return false;
  }

  window.isRestoredSession = false;
  fileHandle = pendingDroppedHandles.mainLogHandle;
  chatFileHandle = pendingDroppedHandles.chatLogHandle;
  await startTracking(fileHandle, chatFileHandle);
  return true;
}

function renderPendingDropStatus() {
  const statusEl = getOrCreateDropStatusLine();
  if (!statusEl) return;

  const mainReady = Boolean(pendingDroppedHandles.mainLogHandle);
  const chatReady = Boolean(pendingDroppedHandles.chatLogHandle);
  const chips = [
    {
      label: "\u4e3b\u65e5\u5fd7 `wakfu.log`",
      ready: mainReady,
    },
    {
      label: "\u804a\u5929\u65e5\u5fd7 `wakfu_chat.log`",
      ready: chatReady,
    },
  ];

  statusEl.innerHTML = chips
    .map(
      (chip) => `
        <div class="setup-log-chip ${chip.ready ? "is-ready" : "is-missing"}">
          <span class="setup-log-chip-icon">${chip.ready ? "\u2713" : "\u2715"}</span>
          <span class="setup-log-chip-label">${chip.label}</span>
        </div>
      `
    )
    .join("");
}

function buildSetupPanelLayout() {
  if (!dropZone) return;
}

function initializeDualFilePromptUI() {
  if (document.title) {
    document.title = "\u6c83\u571f\u4f34\u4fa3 | T2\u85af\u6761";
  }

  buildSetupPanelLayout();

  const browserTitle = document.getElementById("setup-step-browser-title");
  const serverTitle = document.getElementById("setup-step-server-title");
  const pathTitle = document.getElementById("setup-step-path-title");
  const dropTitle = document.getElementById("setup-step-drop-title");
  const dropNote = document.getElementById("setup-step-drop-note");

  if (browserTitle) browserTitle.textContent = "1. 用 Chrome 或 Edge 浏览器启动本工具。";
  if (serverTitle) serverTitle.textContent = "2. 选择服务器：";
  if (pathTitle) pathTitle.textContent = "3. 打开“我的电脑”，把下面这个路径粘贴到地址栏然后回车。";
  if (dropTitle) dropTitle.textContent = "4. 把 `wakfu.log` 和 `wakfu_chat.log` 拖进来。";
  if (dropNote) dropNote.textContent = "也可能叫 `wakfu` 和 `wakfu_chat`。";

  if (copyPathBtn) copyPathBtn.textContent = "\u590d\u5236";

  ensureBroadcastServerSelectionUI();
  updateBroadcastServerSelectionUI(
    typeof window.getCurrentBroadcastServerKey === "function"
      ? window.getCurrentBroadcastServerKey()
      : "ogrest"
  );

  const reconnectLabel = reconnectContainer?.querySelector(".prev-file-label");
  if (reconnectLabel) {
    reconnectLabel.textContent = "\u53d1\u73b0\u4e0a\u6b21\u4f7f\u7528\u7684\u65e5\u5fd7\u6587\u4ef6\uff1a";
  }

  if (reconnectBtn) reconnectBtn.textContent = "\u91cd\u65b0\u8fde\u63a5";
  if (newFileBtn) newFileBtn.textContent = "\u91cd\u65b0\u9009\u62e9\u6587\u4ef6";

  const browserWarning = reconnectContainer?.querySelector(".browser-warning");
  if (browserWarning) {
    browserWarning.textContent =
      "\uff08\u6d4f\u89c8\u5668\u4f1a\u518d\u6b21\u786e\u8ba4\u8fd9\u4e24\u4e2a\u6587\u4ef6\u7684\u8bfb\u53d6\u6743\u9650\uff09";
  }

  if (activeFilename && !fileHandle && !chatFileHandle) {
    activeFilename.textContent = "\u672a\u9009\u62e9\u65e5\u5fd7\u6587\u4ef6";
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

function disablePasswordManagerPrompts() {
  const selector = [
    "input:not([type='file']):not([type='checkbox']):not([type='radio']):not([type='range'])",
    "textarea",
    "select",
  ].join(", ");

  document.querySelectorAll(selector).forEach((element) => {
    if (!element) return;

    if (!element.getAttribute("autocomplete")) {
      element.setAttribute("autocomplete", "off");
    }

    if (element instanceof HTMLInputElement && element.type === "password") {
      element.setAttribute("autocomplete", "new-password");
    }

    element.setAttribute("autocorrect", "off");
    element.setAttribute("autocapitalize", "off");
    element.setAttribute("spellcheck", "false");
    element.setAttribute("data-form-type", "other");
    element.setAttribute("data-lpignore", "true");
    element.setAttribute("data-1p-ignore", "true");
    element.setAttribute("data-bwignore", "true");
  });
}

// --- INITIALIZATION ---
document.addEventListener("DOMContentLoaded", () => {
  initializeDualFilePromptUI();
  disablePasswordManagerPrompts();

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

  const sessionKamaDetailWindow = document.getElementById("session-kama-detail-window");
  const sessionKamaDetailHandle = document.getElementById("session-kama-detail-drag-handle");
  if (sessionKamaDetailWindow && sessionKamaDetailHandle) {
    makeDraggable(sessionKamaDetailWindow, sessionKamaDetailHandle);
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
    const recognizedCount = ingestSelectedLogHandles(handles);

    if (!recognizedCount) {
      alert(
        "\u6587\u4ef6\u4e0d\u6b63\u786e\u3002\n\u8bf7\u62d6\u5165主日志 wakfu\uff08\u6216 wakfu.log\uff09\u3001聊天日志 wakfu_chat\uff08\u6216 wakfu_chat.log\uff09\u3002"
      );
      return;
    }

    await tryStartTrackingFromPendingHandles();
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
        if (typeof window.resetHelperIntegrationState === "function") {
          window.resetHelperIntegrationState();
        }
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
      if (typeof window.resetHelperIntegrationState === "function") {
        window.resetHelperIntegrationState();
      }
      reconnectContainer.style.display = "none";
      dropZone.style.display = "block";
    }
  });
}

if (newFileBtn) {
  newFileBtn.addEventListener("click", () => {
    if (typeof window.resetHelperIntegrationState === "function") {
      window.resetHelperIntegrationState();
    }
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
window.updateBroadcastServerSelectionUI = updateBroadcastServerSelectionUI;

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
  parseIntervalId = setInterval(parseTrackedFiles, 500);
  parseTrackedFiles();
  startWatchdog();

  if (typeof window.onHelperLogsImported === "function") {
    await window.onHelperLogsImported();
  }

  if (typeof window.enableBroadcastNetwork === "function") {
    window.enableBroadcastNetwork("logs-imported");
  }

  if (typeof window.onboardingAfterLogsImported === "function") {
    window.onboardingAfterLogsImported();
  }
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
