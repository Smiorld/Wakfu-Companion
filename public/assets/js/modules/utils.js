let activeTooltip = null;

function showTooltip(text, e) {
  // Determine which document we are in (Main or PiP)
  const targetDoc = e.target.ownerDocument;

  if (!activeTooltip) {
    activeTooltip = targetDoc.createElement("div");
    activeTooltip.className = "global-tooltip";
    targetDoc.body.appendChild(activeTooltip);
  }

  activeTooltip.textContent = text;
  activeTooltip.style.display = "block";

  updateTooltipPosition(e);
}

function updateTooltipPosition(e) {
  if (!activeTooltip) return;

  const gap = 15;
  let x = e.clientX + gap;
  let y = e.clientY + gap;

  // Smart bounds checking (prevent cropping)
  const tw = activeTooltip.offsetWidth;
  const th = activeTooltip.offsetHeight;
  const winW = e.target.ownerDocument.defaultView.innerWidth;
  const winH = e.target.ownerDocument.defaultView.innerHeight;

  if (x + tw > winW) x = e.clientX - tw - gap; // Flip to left
  if (y + th > winH) y = e.clientY - th - gap; // Flip to top

  activeTooltip.style.left = x + "px";
  activeTooltip.style.top = y + "px";
}

function hideTooltip() {
  if (activeTooltip) {
    activeTooltip.style.display = "none";
    // Clean up to prevent multi-window ghosting
    if (activeTooltip.parentNode)
      activeTooltip.parentNode.removeChild(activeTooltip);
    activeTooltip = null;
  }
}

function exportToDiscord() {
  let dataSet;
  let titlePrefix;
  let sourceObj;

  // 1. Determine Data Source (Live or History Snapshot)
  if (currentViewIndex === "live") {
    sourceObj = { damage: fightData, healing: healData, armor: armorData };
    titlePrefix = "LIVE";
  } else {
    const snapshot = fightHistory[currentViewIndex];
    if (!snapshot) return alert("No history data recorded for this slot.");
    sourceObj = snapshot;
    titlePrefix = `HISTORY #${currentViewIndex + 1}`;
  }

  // 2. Select specific mode based on active tab
  let modeTitle;
  if (activeMeterMode === "damage") {
    dataSet = sourceObj.damage;
    modeTitle = "伤害";
  } else if (activeMeterMode === "healing") {
    dataSet = sourceObj.healing;
    modeTitle = "治疗";
  } else {
    dataSet = sourceObj.armor;
    modeTitle = "护甲";
  }

  // 3. Validation
  const players = Object.values(dataSet);
  if (players.length === 0) return alert("No data to export.");

  // 4. Processing (Sorting Allies/Enemies)
  const allies = [];
  const enemies = [];
  players.forEach((p) => {
    if (isPlayerAlly(p)) allies.push(p);
    else enemies.push(p);
  });

  // Sort High to Low
  allies.sort((a, b) => b.total - a.total);
  enemies.sort((a, b) => b.total - a.total);

  // Calculate Totals
  const totalAlly = allies.reduce((acc, p) => acc + p.total, 0);
  const totalEnemy = enemies.reduce((acc, p) => acc + p.total, 0);

  // Formatters
  const formatNum = (num) => num.toLocaleString();
  const getPercent = (val, total) =>
    total > 0 ? Math.round((val / total) * 100) + "%" : "0%";

  // 5. Build String (Markdown Code Block for Discord)
  let report = `\`\`\`ini\n[ ${titlePrefix} - ${modeTitle} REPORT ]\n`;
  report += `Total: ${formatNum(totalAlly)} (Allies) vs ${formatNum(
    totalEnemy
  )} (Enemies)\n\n`;

  if (allies.length > 0) {
    report += `[ ALLIES ]\n`;
    allies.forEach((p, i) => {
      // Limit to top 15 to avoid hitting Discord char limits
      if (i < 15) {
        // Formatting: 1. Name..... : 1,200,000 (45%)
        report += `${i + 1}. ${p.name.padEnd(15)} : ${formatNum(p.total).padEnd(
          10
        )} (${getPercent(p.total, totalAlly)})\n`;
      }
    });
    if (allies.length > 15) report += `... (+${allies.length - 15} more)\n`;
    report += `\n`;
  }

  if (enemies.length > 0) {
    report += `[ ENEMIES ]\n`;
    enemies.forEach((p, i) => {
      if (i < 10) {
        report += `${i + 1}. ${p.name.padEnd(15)} : ${formatNum(p.total).padEnd(
          10
        )}\n`;
      }
    });
  }

  report += `\`\`\``;

  // 6. Copy to Clipboard with Visual Feedback
  navigator.clipboard
    .writeText(report)
    .then(() => {
      const btn = document.getElementById("discordBtn");
      const originalText = btn.textContent;
      btn.textContent = "✅"; // Change icon to checkmark
      btn.style.color = "#2ecc71"; // Green

      setTimeout(() => {
        btn.textContent = originalText;
        btn.style.color = ""; // Reset color
      }, 1500);
    })
    .catch((err) => {
      console.error("Export failed", err);
      alert("Failed to copy to clipboard.");
    });
}

async function togglePiP(elementId, title) {
  const originalElement = document.getElementById(elementId);
  if (!originalElement) return;

  const useWholePanel =
    elementId === "chat-list" || elementId === "tracker-list";
  const playerElement = useWholePanel
    ? originalElement.closest(".tool-panel")
    : originalElement;
  if (!playerElement) return;

  // If PiP is already open, close it
  if (pipWindow) {
    pipWindow.close();
    pipWindow = null;
    return;
  }

  // Check for browser support
  if (!("documentPictureInPicture" in window)) {
    alert("Your browser does not support Document Picture-in-Picture.");
    return;
  }

  try {
    pipWindow = await window.documentPictureInPicture.requestWindow({
      width: elementId === "chat-list" ? 520 : elementId === "tracker-list" ? 560 : 450,
      height: elementId === "meter-split-container" ? 500 : 760,
    });

    // --- FUNCTION BRIDGING ---

    // UI / Utilities
    pipWindow.switchMeterMode = window.switchMeterMode;
    pipWindow.togglePiP = window.togglePiP;
    pipWindow.toggleIconVariant = window.toggleIconVariant;
    pipWindow.modifyExpansion = window.modifyExpansion;
    pipWindow.showTooltip = window.showTooltip;
    pipWindow.updateTooltipPosition = window.updateTooltipPosition;
    pipWindow.hideTooltip = window.hideTooltip;

    // Tracker Functions
    pipWindow.removeTrackedItem = window.removeTrackedItem;
    pipWindow.openTrackerModal = window.openTrackerModal;
    pipWindow.updateItemValue = window.updateItemValue;
    pipWindow.addTrackedItem = window.addTrackedItem;
    pipWindow.setTrackerFilter = window.setTrackerFilter;
    pipWindow.sortTrackerItems = window.sortTrackerItems;
    pipWindow.toggleTrackerLossMode = window.toggleTrackerLossMode;
    pipWindow.toggleTrackerTotals = window.toggleTrackerTotals;
    pipWindow.toggleTrackerView = window.toggleTrackerView;

    // Chat Functions
    pipWindow.openQuickTransModal = window.openQuickTransModal;
    pipWindow.closeQuickTransModal = window.closeQuickTransModal;
    pipWindow.performQuickTrans = window.performQuickTrans;
    pipWindow.copyQuickTrans = window.copyQuickTrans;
    pipWindow.toggleMasterSwitch = window.toggleMasterSwitch;
    pipWindow.setChatFilter = window.setChatFilter;
    pipWindow.onChatSearchInput = window.onChatSearchInput;
    pipWindow.clearChatSearch = window.clearChatSearch;
    pipWindow.scrollToChatBottom = window.scrollToChatBottom;

    // Copy Styles
    [...document.styleSheets].forEach((styleSheet) => {
      try {
        if (styleSheet.cssRules) {
          const newStyle = pipWindow.document.createElement("style");
          [...styleSheet.cssRules].forEach((rule) => {
            newStyle.appendChild(
              pipWindow.document.createTextNode(rule.cssText)
            );
          });
          pipWindow.document.head.appendChild(newStyle);
        } else if (styleSheet.href) {
          const newLink = pipWindow.document.createElement("link");
          newLink.rel = "stylesheet";
          newLink.href = styleSheet.href;
          pipWindow.document.head.appendChild(newLink);
        }
      } catch (e) {
        const link = pipWindow.document.createElement("link");
        link.rel = "stylesheet";
        link.href = styleSheet.href;
        pipWindow.document.head.appendChild(link);
      }
    });

    // Set PiP Body Styles
    pipWindow.document.body.style.background = "#121212";
    pipWindow.document.body.style.display = "flex";
    pipWindow.document.body.style.flexDirection = "column";
    pipWindow.document.body.style.margin = "0";
    pipWindow.document.body.className = "pip-window";

    // INJECT HEADER IF COMBAT METER
    if (elementId === "meter-split-container") {
      const header = pipWindow.document.createElement("div");
      header.className = "pip-header";
      header.innerHTML = `
                <div id="pip-tab-damage" class="pip-tab ${
                  activeMeterMode === "damage" ? "active-dmg" : ""
                }" onclick="switchMeterMode('damage')">
                    <img src="././assets/img/headers/damage.png" class="tab-icon">
                    <span>伤害</span>
                </div>
                <div id="pip-tab-healing" class="pip-tab ${
                  activeMeterMode === "healing" ? "active-heal" : ""
                }" onclick="switchMeterMode('healing')">
                    <img src="././assets/img/headers/healing.png" class="tab-icon">
                    <span>治疗</span>
                </div>
                <div id="pip-tab-armor" class="pip-tab ${
                  activeMeterMode === "armor" ? "active-armor" : ""
                }" onclick="switchMeterMode('armor')">
                    <img src="././assets/img/headers/armor.png" class="tab-icon">
                    <span>护甲</span>
                </div>
            `;
      pipWindow.document.body.appendChild(header);
    }

    // Move the element into the PiP window
    const parent = playerElement.parentElement;
    const placeholder = document.createElement("div");
    placeholder.id = elementId + "-placeholder";
    placeholder.className = "empty-state";
    placeholder.textContent = "Viewing in Picture-in-Picture mode...";

    const originalParent = parent;
    parent.replaceChild(placeholder, playerElement);
    playerElement.classList.add("pip-active");
    pipWindow.document.body.appendChild(playerElement);

    // Handle closing
    pipWindow.addEventListener("pagehide", () => {
      pipWindow = null;
      playerElement.classList.remove("pip-active");
      const currentPlaceholder = document.getElementById(
        elementId + "-placeholder"
      );
      if (currentPlaceholder) {
        originalParent.replaceChild(playerElement, currentPlaceholder);
      }
      renderMeter();
      renderTracker();
      if (elementId === "chat-list") {
        refreshChatVisibility();
        chatList.scrollTop = chatList.scrollHeight;
      }
    });

    // Force renders
    renderMeter();
    renderTracker();
    if (elementId === "chat-list") refreshChatVisibility();
  } catch (err) {
    console.error("Failed to open PiP window:", err);
  }
}

function formatLocalTime(rawTimeStr) {
  const [hours, mins] = rawTimeStr.split(":");
  const date = new Date();
  date.setHours(parseInt(hours), parseInt(mins), 0);
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

// --- Drag Function ---
function makeDraggable(element, handle) {
  let pos3 = 0,
    pos4 = 0;

  handle.onmousedown = dragMouseDown;

  function dragMouseDown(e) {
    e = e || window.event;
    e.preventDefault();

    // 1. Get the EXACT visual position on screen right now
    const rect = element.getBoundingClientRect();

    // 2. Disable the CSS centering logic immediately
    // This prevents the jump when we start moving
    element.style.transform = "none";

    // 3. Freeze the element at its current pixel coordinates
    // For position: fixed, rect.left/top maps 1:1 to style.left/top
    element.style.left = rect.left + "px";
    element.style.top = rect.top + "px";

    // 4. Capture start mouse position
    pos3 = e.clientX;
    pos4 = e.clientY;

    document.onmouseup = closeDragElement;
    document.onmousemove = elementDrag;
  }

  function elementDrag(e) {
    e = e || window.event;
    e.preventDefault();

    // Calculate how much the mouse moved
    const deltaX = pos3 - e.clientX;
    const deltaY = pos4 - e.clientY;

    // Update stored mouse position for next frame
    pos3 = e.clientX;
    pos4 = e.clientY;

    // Apply that difference to the element's position
    element.style.top = element.offsetTop - deltaY + "px";
    element.style.left = element.offsetLeft - deltaX + "px";
  }

  function closeDragElement() {
    document.onmouseup = null;
    document.onmousemove = null;
  }
}

// Helper to find elements in either the main document or the PiP document
function getUI(id) {
  if (pipWindow && pipWindow.document) {
    const pipEl = pipWindow.document.getElementById(id);
    if (pipEl) return pipEl;
  }
  return document.getElementById(id);
}

// --- Lazy Loader Utility ---
const loadedScripts = new Set();

function loadScript(path) {
  return new Promise((resolve, reject) => {
    if (loadedScripts.has(path)) {
      resolve(); // Already loaded
      return;
    }

    const script = document.createElement("script");
    script.src = path;
    script.onload = () => {
      loadedScripts.add(path);
      resolve();
    };
    script.onerror = () => reject(`Failed to load script: ${path}`);
    document.body.appendChild(script);
  });
}
