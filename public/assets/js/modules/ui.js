// UI MODULE

let lastRenderSignature = "";

function renderMeter() {
  if (isMeterDragActive) return;

  // 1. DETERMINE DATA SOURCE
  let sourceFight, sourceClasses, sourceOverrides;

  if (currentViewIndex === "live") {
    sourceFight = fightData;
    sourceClasses = playerClasses;
    sourceOverrides = manualOverrides;
    const ind = document.getElementById("live-indicator");
    if (ind) ind.style.color = "#0f0";
  } else {
    const snapshot = fightHistory[currentViewIndex];
    if (!snapshot) return;
    sourceFight = snapshot.damage;
    sourceClasses = snapshot.classes || {};
    sourceOverrides = snapshot.overrides || {};
    const ind = document.getElementById("live-indicator");
    if (ind) ind.style.color = "#e74c3c";
  }

  let dataSet;
  if (activeMeterMode === "damage") dataSet = sourceFight;
  else if (activeMeterMode === "healing")
    dataSet =
      currentViewIndex === "live"
        ? healData
        : fightHistory[currentViewIndex]?.healing || {};
  else
    dataSet =
      currentViewIndex === "live"
        ? armorData
        : fightHistory[currentViewIndex]?.armor || {};

  if (!dataSet) return;

  const players = Object.values(dataSet);

  // --- MEMORY OPTIMIZATION: DIRTY CHECK ---
  const totalGlobal = players.reduce((acc, p) => acc + p.total, 0);
  const currentSignature = `${currentViewIndex}-${activeMeterMode}-${players.length}-${totalGlobal}-${expandedPlayers.size}`;

  if (currentSignature === lastRenderSignature) {
    return;
  }
  lastRenderSignature = currentSignature;
  // ----------------------------------------

  // Prune cache if too large
  if (Object.keys(playerIconCache).length > 100) {
    playerIconCache = {};
  }

  const alliesContainer = getUI("list-allies");
  const enemiesContainer = getUI("list-enemies");
  const alliesTotalEl = getUI("allies-total-val");
  const enemiesTotalEl = getUI("enemies-total-val");

  if (!alliesContainer || !enemiesContainer) return;

  if (players.length === 0) {
    alliesContainer.innerHTML = `<div class="empty-state">${
      currentViewIndex === "live" ? "等待战斗日志..." : "暂无记录"
    }</div>`;
    enemiesContainer.innerHTML = "";
    if (alliesTotalEl) alliesTotalEl.textContent = "0";
    if (enemiesTotalEl) enemiesTotalEl.textContent = "0";
    return;
  }

  const allies = [];
  const enemies = [];

  players.forEach((p) => {
    if (isPlayerAlly(p, sourceClasses, sourceOverrides)) {
      allies.push(p);
    } else {
      enemies.push(p);
    }
  });

  const totalAllyVal = allies.reduce((acc, p) => acc + p.total, 0);
  const totalEnemyVal = enemies.reduce((acc, p) => acc + p.total, 0);

  if (alliesTotalEl) alliesTotalEl.textContent = totalAllyVal.toLocaleString();
  if (enemiesTotalEl)
    enemiesTotalEl.textContent = totalEnemyVal.toLocaleString();

  allies.sort((a, b) => b.total - a.total);
  enemies.sort((a, b) => b.total - a.total);

  const renderList = (list, container, categoryTotal) => {
    container.textContent = "";

    if (list.length === 0) {
      container.innerHTML =
        '<div style="padding:10px;color:#555;font-style:italic;text-align:center;">无</div>';
      return;
    }

    const maxVal = list[0].total;
    const fragment = document.createDocumentFragment();

    for (let i = 0; i < list.length; i++) {
      const p = list[i];
      const barPercent = (p.total / maxVal) * 100;
      const totalPercent =
        categoryTotal > 0
          ? ((p.total / categoryTotal) * 100).toFixed(1) + "%"
          : "0.0%";
      const isExpanded = expandedPlayers.has(p.name);

      let iconHtml = playerIconCache[p.name];

      // Icon Generation (Cached)
      if (currentViewIndex !== "live" || !iconHtml) {
        const lowerName = p.name.toLowerCase().trim();
        // Lookup monster ID
        let monsterImgId = monsterLookup[lowerName];

        if (monsterImgId) {
          // FIX: Ensure extension exists
          if (!String(monsterImgId).endsWith(".png")) {
            monsterImgId += ".png";
          }

          // MONSTER FOUND
          iconHtml = `<img src="./assets/img/monsters/${monsterImgId}" class="class-icon" onerror="this.src='./assets/img/resources/not_found.png';">`;
        } else {
          // PLAYER CLASS
          const classIconName = sourceClasses[p.name];
          if (classIconName) {
            const isAlt = playerVariantState[p.name];
            const currentSrc = isAlt
              ? `./assets/img/classes/${classIconName}-f.png`
              : `./assets/img/classes/${classIconName}.png`;
            iconHtml = `<img src="${currentSrc}" class="class-icon player-icon-img" data-name="${p.name.replace(
              /"/g,
              "&quot;"
            )}" onerror="this.src='./assets/img/classes/not_found.png';">`;
          } else {
            // UNKNOWN ENTITY
            iconHtml = `<img src="./assets/img/classes/not_found.png" class="class-icon">`;
          }
        }
        if (currentViewIndex === "live") playerIconCache[p.name] = iconHtml;
      }

      // ROW CONSTRUCTION
      const rowBlock = document.createElement("div");
      rowBlock.className = `player-block ${isExpanded ? "expanded" : ""}`;
      rowBlock.dataset.name = p.name;
      rowBlock.setAttribute("draggable", "true");

      let barClass =
        activeMeterMode === "damage"
          ? "damage-bar"
          : activeMeterMode === "healing"
          ? "healing-bar"
          : "armor-bar";
      let textClass =
        activeMeterMode === "damage"
          ? "damage-text"
          : activeMeterMode === "healing"
          ? "healing-text"
          : "armor-text";

      rowBlock.innerHTML = `
        <div class="player-row">
            <div class="player-bg-bar ${barClass}" style="width: ${barPercent}%"></div>
            <div class="player-name"><span class="caret">▶</span>${iconHtml}${
        p.name
      }</div>
            <div class="player-total ${textClass}">${p.total.toLocaleString()}</div>
            <div class="player-percent">${totalPercent}</div>
        </div>
      `;

      if (isExpanded) {
        const spellContainer = document.createElement("div");
        spellContainer.className = "spell-list open";

        const spells = Object.entries(p.spells)
          .map(([key, data]) => ({
            val: data.val,
            element: data.element,
            realName: data.realName || key.split("|")[0],
          }))
          .sort((a, b) => b.val - a.val);

        let spellsHtml = "";
        for (let j = 0; j < spells.length; j++) {
          const s = spells[j];
          const spellBarPercent = (s.val / p.total) * 100;
          const spellContribPercent =
            p.total > 0 ? ((s.val / p.total) * 100).toFixed(1) + "%" : "0.0%";
          let iconName = (s.element || "neutral").toLowerCase();

          spellsHtml += `
                <div class="spell-row">
                    <div class="spell-bg-bar" style="width: ${spellBarPercent}%"></div>
                    <div class="spell-info">
                        <img src="./assets/img/elements/${iconName}.png" class="spell-icon" onerror="this.src='./assets/img/elements/neutral.png'">
                        <span class="spell-name">${s.realName}</span>
                    </div>
                    <div class="spell-val">${s.val.toLocaleString()}</div>
                    <div class="spell-percent">${spellContribPercent}</div>
                </div>`;
        }
        spellContainer.innerHTML = spellsHtml;
        rowBlock.appendChild(spellContainer);
      }

      fragment.appendChild(rowBlock);
    }
    container.appendChild(fragment);
  };

  renderList(allies, alliesContainer, totalAllyVal);
  renderList(enemies, enemiesContainer, totalEnemyVal);
}

function setupDragAndDrop() {
  // We attach listeners to the PARENT container only once.
  const container = document.getElementById("meter-split-container");
  if (!container) return;

  // Remove old listeners if any (safety)
  const newContainer = container.cloneNode(true);
  container.parentNode.replaceChild(newContainer, container);

  // Re-select fresh nodes (Allies/Enemies lists inside the container)
  const alliesList = document.getElementById("list-allies");
  const enemiesList = document.getElementById("list-enemies");

  // 1. CLICK HANDLING (Expand/Collapse + Icon Toggle)
  newContainer.addEventListener("click", (e) => {
    // Handle Icon Variant Toggle
    if (e.target.classList.contains("player-icon-img")) {
      const name = e.target.dataset.name;
      if (name && window.toggleIconVariant) {
        window.toggleIconVariant(name, e.target);
      }
      return;
    }

    // Handle Row Click (Expand)
    const row = e.target.closest(".player-row");
    if (row) {
      const block = row.closest(".player-block");
      if (block && block.dataset.name) {
        togglePlayer(block.dataset.name);
      }
    }
  });

  // 2. DRAG START
  newContainer.addEventListener("dragstart", (e) => {
    const block = e.target.closest(".player-block");
    if (block && block.dataset.name) {
      isMeterDragActive = true;
      activeMeterDragName = block.dataset.name;
      e.dataTransfer.setData("text/plain", block.dataset.name);
      e.dataTransfer.effectAllowed = "move";
      block.style.opacity = "0.5";
    }
  });

  // 3. DRAG END
  newContainer.addEventListener("dragend", (e) => {
    const block = e.target.closest(".player-block");
    if (block) block.style.opacity = "1";
    isMeterDragActive = false;
    activeMeterDragName = null;
    lastRenderSignature = "";
    renderMeter();
  });

  // 4. DRAG OVER / LEAVE / DROP (On the Lists themselves)
  const handleDragOver = (e) => {
    e.preventDefault();
    e.currentTarget.classList.add("drag-over");
  };

  const handleDragLeave = (e) => {
    e.currentTarget.classList.remove("drag-over");
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.currentTarget.classList.remove("drag-over");
    const playerName = e.dataTransfer.getData("text/plain");
    if (!playerName) return;

    const targetType = e.currentTarget.id === "list-allies" ? "ally" : "enemy";
    manualOverrides[playerName] = targetType;

    try {
      localStorage.setItem("wakfu_overrides", JSON.stringify(manualOverrides));
    } catch (e) {}

    isMeterDragActive = false;
    activeMeterDragName = null;
    // Force render immediately
    lastRenderSignature = "";
    renderMeter();
  };

  // Attach Drop logic to the specific list containers
  if (alliesList) {
    alliesList.addEventListener("dragover", handleDragOver);
    alliesList.addEventListener("dragleave", handleDragLeave);
    alliesList.addEventListener("drop", handleDrop);
  }
  if (enemiesList) {
    enemiesList.addEventListener("dragover", handleDragOver);
    enemiesList.addEventListener("dragleave", handleDragLeave);
    enemiesList.addEventListener("drop", handleDrop);
  }

  // 5. MERGE SUMMON (Drop on a Player Block)
  newContainer.addEventListener("dragover", (e) => {
    const block = e.target.closest(".player-block");
    if (block) {
      e.preventDefault();
      block.classList.add("drag-target");
    }
  });

  newContainer.addEventListener("dragleave", (e) => {
    const block = e.target.closest(".player-block");
    if (block) {
      block.classList.remove("drag-target");
    }
  });

  newContainer.addEventListener("drop", (e) => {
    const block = e.target.closest(".player-block");
    if (block && currentViewIndex === "live") {
      e.preventDefault();
      block.classList.remove("drag-target");
      const draggedName = e.dataTransfer.getData("text/plain");
      const targetName = block.dataset.name;

      if (draggedName && targetName && draggedName !== targetName) {
        mergeSummonData(draggedName, targetName);
        summonBindings[draggedName] = targetName;
        if (typeof saveLiveCombatState === "function") saveLiveCombatState();
        isMeterDragActive = false;
        activeMeterDragName = null;
        lastRenderSignature = "";
        renderMeter();
        e.stopPropagation(); // Prevent bubbling to the list drop handler
      }
    }
  });
}

// Standard UI Functions
function updateDailyTimer() {
  const timerEl = document.getElementById("daily-val");
  if (!timerEl) return;
  const now = new Date();
  const parisTimeStr = now.toLocaleString("en-US", {
    timeZone: "Europe/Paris",
  });
  const parisDate = new Date(parisTimeStr);
  const nextMidnight = new Date(parisDate);
  nextMidnight.setHours(24, 0, 0, 0);
  const diffMs = nextMidnight - parisDate;
  const hours = Math.floor((diffMs / (1000 * 60 * 60)) % 24);
  const minutes = Math.floor((diffMs / (1000 * 60)) % 60);
  const hStr = hours.toString().padStart(2, "0");
  const mStr = minutes.toString().padStart(2, "0");
  timerEl.textContent = `${hStr}h${mStr}m`;
}

function toggleSidebar() {
  const sidebar = document.getElementById("info-sidebar");
  const dungeonSidebar = document.getElementById("dungeon-sidebar");
  const profSidebar = document.getElementById("professions-sidebar");
  if (dungeonSidebar) dungeonSidebar.classList.remove("open");
  if (profSidebar) profSidebar.classList.remove("open");
  sidebar.classList.toggle("open");
}

async function toggleDungeonSidebar() {
  const sidebar = document.getElementById("dungeon-sidebar");
  const infoSidebar = document.getElementById("info-sidebar");
  const profSidebar = document.getElementById("professions-sidebar");

  if (infoSidebar) infoSidebar.classList.remove("open");
  if (profSidebar) profSidebar.classList.remove("open");

  if (sidebar) {
    //  Only load data when opening the sidebar
    if (!sidebar.classList.contains("open")) {
      try {
        await loadScript("assets/js/data/forecast_data.js");
        // Re-init forecast now that data exists
        if (typeof initForecast === "function") initForecast();
      } catch (e) {
        console.error(e);
        return;
      }
    }
    sidebar.classList.toggle("open");
    // Ensure UI is rendered
    if (sidebar.classList.contains("open")) renderForecastUI();
  }
}

async function toggleProfSidebar() {
  const sidebar = document.getElementById("professions-sidebar");
  const infoSidebar = document.getElementById("info-sidebar");
  const dungeonSidebar = document.getElementById("dungeon-sidebar");

  if (infoSidebar) infoSidebar.classList.remove("open");
  if (dungeonSidebar) dungeonSidebar.classList.remove("open");

  // Only load data when opening
  if (!sidebar.classList.contains("open")) {
    try {
      await loadScript("assets/js/data/professions_data.js");
      // Re-run init to populate dropdowns now that data exists
      if (typeof initProfessionSelector === "function")
        initProfessionSelector();
    } catch (e) {
      console.error(e);
      return;
    }
  }

  if (sidebar.classList.contains("open")) {
    sidebar.classList.remove("open");
  } else {
    sidebar.classList.add("open");
  }
}

function toggleSidebarSection(id) {
  const section = document.getElementById(id);
  if (section) section.classList.toggle("collapsed");
}

function updateWatchdogUI() {
  if (!autoResetText || !autoResetBtn) return;
  if (!isAutoResetOn) {
    autoResetText.textContent = "自动重置：关闭";
    autoResetBtn.style.borderColor = "#444";
    autoResetText.style.color = "#aaa";
    return;
  }
  if (awaitingNewFight) {
    autoResetText.textContent = "待命中（等待下一场战斗）";
    autoResetText.style.color = "#00e1ff";
    autoResetBtn.style.borderColor = "#00e1ff";
  } else if (Object.keys(fightData).length > 0) {
    autoResetText.textContent = "本场结束后，下场战斗开始时自动清空";
    autoResetText.style.color = "#fff";
    autoResetBtn.style.borderColor = "var(--btn-active-green)";
  } else {
    autoResetText.textContent = "自动重置：开启";
    autoResetText.style.color = "#fff";
    autoResetBtn.style.borderColor = "var(--btn-active-green)";
  }
}

function switchMeterMode(mode) {
  activeMeterMode = mode;
  document
    .getElementById("tab-damage")
    .classList.toggle("active", mode === "damage");
  document
    .getElementById("tab-healing")
    .classList.toggle("active", mode === "healing");
  document
    .getElementById("tab-armor")
    .classList.toggle("active", mode === "armor");

  if (pipWindow && pipWindow.document) {
    const pDmg = pipWindow.document.getElementById("pip-tab-damage");
    const pHeal = pipWindow.document.getElementById("pip-tab-healing");
    const pArm = pipWindow.document.getElementById("pip-tab-armor");
    if (pDmg && pHeal && pArm) {
      pDmg.className = "pip-tab" + (mode === "damage" ? " active-dmg" : "");
      pHeal.className = "pip-tab" + (mode === "healing" ? " active-heal" : "");
      pArm.className = "pip-tab" + (mode === "armor" ? " active-armor" : "");
    }
  }

  lastRenderSignature = "";
  renderMeter();
}

function togglePlayer(name) {
  if (expandedPlayers.has(name)) expandedPlayers.delete(name);
  else expandedPlayers.add(name);
  lastRenderSignature = "";
  renderMeter();
}

function expandAll() {
  let dataSet;
  if (activeMeterMode === "damage") dataSet = fightData;
  else if (activeMeterMode === "healing") dataSet = healData;
  else dataSet = armorData;
  Object.keys(dataSet).forEach((name) => expandedPlayers.add(name));
  lastRenderSignature = "";
  renderMeter();
}

function collapseAll() {
  expandedPlayers.clear();
  lastRenderSignature = "";
  renderMeter();
}

function modifyExpansion(category, action) {
  let dataSet;
  if (activeMeterMode === "damage") dataSet = fightData;
  else if (activeMeterMode === "healing") dataSet = healData;
  else dataSet = armorData;
  const players = Object.values(dataSet);
  players.forEach((p) => {
    const isAlly = isPlayerAlly(p);
    if (
      (category === "allies" && isAlly) ||
      (category === "enemies" && !isAlly)
    ) {
      if (action === "expand") expandedPlayers.add(p.name);
      else expandedPlayers.delete(p.name);
    }
  });
  lastRenderSignature = "";
  renderMeter();
}

const UI_TRANSLATIONS = {
  GUILD_HUNTERS: {
    en: "GUILD HUNTERS",
    es: "GREMIO DE CAZADORES",
    fr: "GUILDE DES CHASSEURS",
    pt: "GUILDA DOS CAÇADORES",
  },
  MODULUX: { en: "MODULOX", es: "MODULOX", fr: "MODULOX", pt: "MODULOX" },
};

function startWatchdog() {
  if (watchdogIntervalId) clearInterval(watchdogIntervalId);
  watchdogIntervalId = setInterval(updateWatchdogUI, 500);
}

// Ensure Drag and Drop is setup after DOM Load
document.addEventListener("DOMContentLoaded", () => {
  setupDragAndDrop();
});

function renderTracker() {
  const listEl = getUI("tracker-list");
  const footerEl = getUI("tracker-total-footer");
  const toggleBtn = getUI("btn-toggle-totals");
  if (!listEl) return;

  if (footerEl) footerEl.style.display = showTrackerFooter ? "flex" : "none";
  if (toggleBtn) {
    toggleBtn.style.background = showTrackerFooter ? "#333" : "transparent";
    toggleBtn.style.borderColor = showTrackerFooter ? "#ffd700" : "#444";
  }

  listEl.innerHTML = "";
  if (trackedItems.length === 0) {
    listEl.innerHTML = '<div class="empty-state">添加要追踪的物品...</div>';
    if (footerEl) {
      const currentEl = getUI("tf-val-current");
      const targetEl = getUI("tf-val-target");
      if (currentEl) currentEl.textContent = "0 ₭";
      if (targetEl) targetEl.textContent = "0 ₭";
    }
    return;
  }

  let displayItems = trackedItems;
  if (currentTrackerFilter !== "SHOW_ALL") {
    displayItems = trackedItems.filter((item) => {
      if (currentTrackerFilter === "Trapper")
        return item.profession === "Trapper" || item.profession === "ALL";
      return item.profession === currentTrackerFilter;
    });
  }

  let totalCurVal = 0;
  let totalTarVal = 0;
  displayItems.forEach((item) => {
    const p = item.price || 0;
    totalCurVal += item.current * p;
    totalTarVal += item.target * p;
  });

  if (footerEl) {
    const currentEl = getUI("tf-val-current");
    const targetEl = getUI("tf-val-target");
    if (currentEl) currentEl.textContent = totalCurVal.toLocaleString() + " ₭";
    if (targetEl) targetEl.textContent = totalTarVal.toLocaleString() + " ₭";
  }

  if (displayItems.length === 0) {
    listEl.innerHTML =
      '<div class="empty-state">当前分类下没有物品。</div>';
    return;
  }

  const isGrid = trackerViewMode === "grid";
  listEl.classList.toggle("grid-view", isGrid);

  displayItems.forEach((item, index) => {
    const isComplete = item.current >= item.target && item.target > 0;
    const progress = Math.min((item.current / (item.target || 1)) * 100, 100);
    const displayName = item.displayName || item.name;
    const profNameRaw = item.profession || "z_other";
    const profFilename =
      profNameRaw === "ALL"
        ? "monster_resource"
        : profNameRaw.toLowerCase().replace(/\s+/g, "_");
    const profIconPath = `./assets/img/resources/${profFilename}.png`;

    let itemIconPath;
    if (item.profession === "ALL" && item.imgId) {
      itemIconPath = `./assets/img/items/${item.imgId}.png`;
    } else {
      const safeItemName = (item.imgName || item.name).replace(/\s+/g, "_");
      itemIconPath = `./assets/img/resources/${safeItemName}.png`;
    }

    const rarityName = (item.rarity || "common").toLowerCase();
    const usageInfo = getItemUsage(item.name);
    const priceInfo = item.price
      ? `\n当前价值：${(item.current * item.price).toLocaleString()} ₭`
      : "";
    const tooltipText = `${
      displayName
    }\n进度：${item.current.toLocaleString()} / ${item.target.toLocaleString()} (${Math.floor(
      progress
    )}%)${priceInfo}${usageInfo}`;

    if (isGrid) {
      const slot = document.createElement("div");
      slot.className = `inventory-slot ${isComplete ? "complete" : ""}`;
      slot.setAttribute("draggable", "true");
      slot.dataset.index = index;
      slot.onmouseenter = (e) => showTooltip(tooltipText, e);
      slot.onmousemove = (e) => updateTooltipPosition(e);
      slot.onmouseleave = () => hideTooltip();
      slot.onclick = () => openTrackerModal(item.id);

      // Inline events for tracker are fine as list size is small
      slot.addEventListener("dragstart", handleTrackDragStart);
      slot.addEventListener("dragover", handleTrackDragOver);
      slot.addEventListener("drop", handleTrackDrop);

      slot.innerHTML = `
        <button class="slot-delete-btn" onclick="event.stopPropagation(); removeTrackedItem(${
          item.id
        })">×</button>
        <img src="${profIconPath}" class="slot-prof-icon" onerror="this.style.display='none'">
        <img src="${itemIconPath}" class="slot-icon" onerror="this.onerror=null; this.src='./assets/img/resources/not_found.png';">
        <div class="slot-count">${item.current.toLocaleString()}</div>
        <div class="slot-progress-container"><div class="slot-progress-bar" style="width: ${progress}%"></div></div>
      `;
      listEl.appendChild(slot);
    } else {
      const row = document.createElement("div");
      row.className = `tracked-item-row ${isComplete ? "complete" : ""}`;
      row.setAttribute("draggable", "true");
      row.dataset.index = index;
      row.addEventListener("dragstart", handleTrackDragStart);
      row.addEventListener("dragover", handleTrackDragOver);
      row.addEventListener("drop", handleTrackDrop);

      row.innerHTML = `
        <div class="t-left-group" style="cursor: pointer;" onclick="openTrackerModal(${
          item.id
        })">
            <img src="${itemIconPath}" class="resource-icon" onerror="this.onerror=null; this.src='./assets/img/resources/not_found.png';">
            <div class="t-info-text">
                <img src="./assets/img/quality/${rarityName}.png" class="rarity-icon" onerror="this.style.display='none'">
                <span class="t-level-badge">Lvl. ${item.level}</span>
                <span class="t-item-name">${displayName}</span>
            </div>
        </div>
        <div class="t-input-container">
            <input type="number" class="t-input" value="${
              item.current
            }" onchange="updateItemValue(${item.id}, 'current', this.value)">
            <span class="t-separator">/</span>
            <input type="number" class="t-input" value="${
              item.target
            }" onchange="updateItemValue(${item.id}, 'target', this.value)">
        </div>
        <div class="t-right-group">
            <img src="${profIconPath}" class="t-job-icon" onerror="this.style.display='none'">
            <div class="t-status-col">
                <button class="t-delete-btn" onclick="removeTrackedItem(${
                  item.id
                })">×</button>
                <span class="t-progress-text">${Math.floor(progress)}%</span>
            </div>
        </div>
      `;
      const infoArea = row.querySelector(".t-left-group");
      infoArea.onmouseenter = (e) => showTooltip(tooltipText, e);
      infoArea.onmousemove = (e) => updateTooltipPosition(e);
      infoArea.onmouseleave = () => hideTooltip();
      listEl.appendChild(row);
    }
  });
}
