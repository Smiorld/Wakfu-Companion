let dragSrcIndex = null;
let sortDirection = 1; // 1 = Ascending, -1 = Descending
let trackerCatalog = [];
let trackerLookup = new Map();
let trackerDecreaseOnLoss =
  localStorage.getItem("wakfu_tracker_decrease_on_loss") === "true";

const PROFESSION_SORT_ORDER = {
  Armorer: 1,
  Jeweler: 2,
  Baker: 3,
  Chef: 4,
  Handyman: 5,
  "Weapon Master": 6,
  "Leather Dealer": 7,
  Tailor: 8,
};

const TRACKER_PROFESSION_LABELS = {
  Armorer: "制甲",
  Baker: "面点",
  Chef: "厨师",
  Handyman: "工匠",
  Jeweler: "珠宝",
  "Leather Dealer": "皮匠",
  Tailor: "裁缝",
  "Weapon Master": "武器大师",
  "Weapons Master": "武器大师",
  Farmer: "种植",
  Fisherman: "钓鱼",
  Herbalist: "草药",
  Lumberjack: "伐木",
  Miner: "采矿",
  Trapper: "畜牧",
  ALL: "全部",
};

function getTrackerProfessionLabel(name) {
  return TRACKER_PROFESSION_LABELS[name] || name;
}

function normalizeTrackerText(value) {
  return String(value || "")
    .replace(/\u00A0/g, " ")
    .replace(/\u3000/g, " ")
    .replace(/[。．]/g, ".")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function extractTrackerNameVariants(rawName) {
  const source = String(rawName || "")
    .replace(/\u00A0/g, " ")
    .replace(/\u3000/g, " ")
    .replace(/\s+/g, " ")
    .replace(/[。．]+$/g, "")
    .trim();
  const variants = new Set();
  if (!source) return [];

  variants.add(source);

  const spacedParts = source
    .split(/\s{2,}/)
    .map((part) => part.trim())
    .filter(Boolean);
  spacedParts.forEach((part) => variants.add(part));

  const mixedParts = source.split(/\s+/).filter(Boolean);
  const latinParts = mixedParts.filter((part) => /[A-Za-z]/.test(part));
  const cjkParts = mixedParts.filter((part) => /[\u3400-\u9FFF]/.test(part));

  if (latinParts.length) variants.add(latinParts.join(" "));
  if (cjkParts.length) variants.add(cjkParts.join(""));

  return [...variants]
    .map((part) => normalizeTrackerText(part))
    .filter(Boolean);
}

function getTrackerChineseAliases(itemName) {
  if (typeof ITEM_I18N_MAP === "undefined") return [];
  return Array.isArray(ITEM_I18N_MAP[itemName]) ? ITEM_I18N_MAP[itemName] : [];
}

function escapeTrackerRegex(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getPrimaryChineseLabel(itemName) {
  const chineseAliases = getTrackerChineseAliases(itemName);
  if (!chineseAliases.length) return "";
  const stripped = chineseAliases[0]
    .replace(new RegExp(`\\s*${escapeTrackerRegex(itemName)}\\s*$`, "i"), "")
    .replace(/\u00A0/g, " ")
    .replace(/\u3000/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return stripped || chineseAliases[0];
}

function getTrackerDisplayName(itemName) {
  const chineseName = getPrimaryChineseLabel(itemName);
  return chineseName ? `${chineseName}  ${itemName}` : itemName;
}

function buildTrackerCatalog() {
  trackerCatalog = [];
  trackerLookup = new Map();
  const registeredNames = new Set();

  const registerItem = (itemData, profession) => {
    const englishName = itemData.name;
    const canonicalName = normalizeTrackerText(englishName);
    if (!canonicalName || registeredNames.has(canonicalName)) return;
    registeredNames.add(canonicalName);

    const chineseAliases = getTrackerChineseAliases(englishName);
    const aliases = new Set([englishName, ...chineseAliases]);
    chineseAliases.forEach((alias) => {
      extractTrackerNameVariants(alias).forEach((variant) => aliases.add(variant));
    });

    const entry = {
      ...itemData,
      name: englishName,
      profession,
      chineseAliases,
      displayName: getTrackerDisplayName(englishName),
      aliases: [...aliases],
    };

    trackerCatalog.push(entry);
    entry.aliases.forEach((alias) => {
      const normalized = normalizeTrackerText(alias);
      if (normalized && !trackerLookup.has(normalized)) {
        trackerLookup.set(normalized, entry);
      }
    });
  };

  for (const prof in professionItems) {
    professionItems[prof].forEach((itemData) => registerItem(itemData, prof));
  }

  if (typeof monsterResources !== "undefined") {
    monsterResources.forEach((itemData) => registerItem(itemData, "ALL"));
  }
}

function hydrateTrackedItem(item) {
  const originalDisplayName = item.displayName;
  const originalAliases = JSON.stringify(item.chineseAliases || []);
  const catalogItem = trackerLookup.get(normalizeTrackerText(item.name));
  if (catalogItem) {
    item.displayName = catalogItem.displayName;
    item.chineseAliases = catalogItem.chineseAliases;
  } else if (!item.displayName) {
    item.displayName = item.name;
  }
  item._needsMigration =
    originalDisplayName !== item.displayName ||
    originalAliases !== JSON.stringify(item.chineseAliases || []);
  return item;
}

function findTrackerCatalogItem(query) {
  const variants = extractTrackerNameVariants(query);
  for (const variant of variants) {
    if (trackerLookup.has(variant)) return trackerLookup.get(variant);
  }
  return null;
}

function parseTrackedItemLog(line) {
  const englishMatch = line.match(/picked up\s+(\d+)x\s+(.+?)\s*[.。]?$/i);
  if (englishMatch) {
    return {
      type: "gain",
      qty: parseInt(englishMatch[1], 10),
      variants: extractTrackerNameVariants(englishMatch[2]),
    };
  }

  const chineseGainMatch = line.match(/\u4f60\u5f97\u5230\u4e86\s*(.+?)\s+x(\d+)\s*[。.]?$/);
  if (chineseGainMatch) {
    return {
      type: "gain",
      qty: parseInt(chineseGainMatch[2], 10),
      variants: extractTrackerNameVariants(chineseGainMatch[1]),
    };
  }

  const chineseLossMatch = line.match(/\u4f60\u5931\u53bb\u4e86\s*(.+?)\s+x(\d+)\s*[。.]?$/);
  if (chineseLossMatch) {
    return {
      type: "loss",
      qty: parseInt(chineseLossMatch[2], 10),
      variants: extractTrackerNameVariants(chineseLossMatch[1]),
    };
  }

  return null;
}

function initTrackerDropdowns() {
  if (typeof professionItems === "undefined") return;

  const itemDatalist = getUI("item-datalist");
  const itemInput = getUI("item-input");
  if (!itemDatalist || !itemInput) return;

  buildTrackerCatalog();
  itemInput.value = "";
  itemDatalist.innerHTML = "";

  trackerCatalog.forEach((itemData) => {
    const optionValue = String(itemData.displayName || itemData.name || "").trim();
    if (!optionValue) return;
    const opt = document.createElement("option");
    opt.value = optionValue;
    itemDatalist.appendChild(opt);
  });

  loadTrackerState();
  updateTrackerLossToggleUI();
  setTrackerFilter(currentTrackerFilter);
}

function processItemLog(line) {
  const parsed = parseTrackedItemLog(line);
  if (!parsed || parsed.qty <= 0) return;
  if (parsed.type === "loss" && !trackerDecreaseOnLoss) return;

  let updated = false;
  trackedItems.forEach((item) => {
    const trackedAliases = new Set([normalizeTrackerText(item.name)]);
    (item.chineseAliases || []).forEach((alias) => trackedAliases.add(normalizeTrackerText(alias)));
    extractTrackerNameVariants(item.displayName || item.name).forEach((alias) => trackedAliases.add(alias));

    if (parsed.variants.some((variant) => trackedAliases.has(variant))) {
      const wasComplete = item.current >= item.target;
      const delta = parsed.type === "loss" ? -parsed.qty : parsed.qty;

      item.current = Math.max(0, item.current + delta);
      updated = true;

      const iconPath =
        item.profession === "ALL" && item.imgId
          ? `./assets/img/items/${item.imgId}.png`
          : `./assets/img/resources/${item.name.replace(/\s+/g, "_")}.png`;

      if (typeof sendWindowsNotification === "function") {
        sendWindowsNotification(
          parsed.type === "loss" ? "失去物品" : "获得物品",
          `${delta > 0 ? "+" : ""}${delta} ${item.displayName || item.name} (${item.current}/${item.target})`,
          iconPath
        );
      }

      showTrackerNotification(parsed.qty, item.displayName || item.name, parsed.type);

      if (parsed.type !== "loss" && !wasComplete && item.current >= item.target) {
        setTimeout(() => {
          showTrackerNotification(null, item.displayName || item.name, true);
        }, 200);

        const goalSound = new Audio("./assets/sfx/tracking_completed.mp3");
        goalSound.volume = 0.05;
        goalSound.play().catch((e) => {});
      }
    }
  });

  if (updated) {
    trackerDirty = true;
  }
}

// --- View Toggle ---
function toggleTrackerView() {
  trackerViewMode = trackerViewMode === "grid" ? "list" : "grid";

  // Update button icon
  const btn = getUI("tracker-view-toggle");
  if (btn) btn.textContent = trackerViewMode === "grid" ? "☰" : "⊞";

  renderTracker();
}

// --- Persistence Helpers ---
function saveTrackerState() {
  localStorage.setItem("wakfu_tracker_data", JSON.stringify(trackedItems));
}

function loadTrackerState() {
  const data = localStorage.getItem("wakfu_tracker_data");
  if (data) {
    try {
      trackedItems = JSON.parse(data).map(hydrateTrackedItem);
      if (trackedItems.some((item) => item._needsMigration)) {
        trackedItems.forEach((item) => delete item._needsMigration);
        saveTrackerState();
      } else {
        trackedItems.forEach((item) => delete item._needsMigration);
      }
      renderTracker();
    } catch (e) {
      console.error("Error loading tracker state", e);
      trackedItems = [];
    }
  }
}

// --- Actions ---
function addTrackedItem() {
  const itemInput = getUI("item-input");
  const itemName = itemInput.value.trim();
  if (!itemName) return alert("请先搜索并选择一个物品。");

  const foundItem = findTrackerCatalogItem(itemName);
  if (!foundItem) return alert(`未在数据库中找到“${itemName}”。`);

  // Dupe check
  if (
    trackedItems.find(
      (t) => t.name === foundItem.name && t.rarity === foundItem.rarity
    )
  ) {
    alert("这个物品已经在追踪列表中了。");
    itemInput.value = "";
    return;
  }

  let target = prompt("目标数量？", "100");
  if (target === null) return;

  trackedItems.push({
    id: Date.now(),
    name: foundItem.name,
    displayName: foundItem.displayName,
    chineseAliases: foundItem.chineseAliases,
    current: 0,
    target: parseInt(target) || 100,
    level: foundItem.level,
    rarity: foundItem.rarity,
    profession: foundItem.profession,
    imgId: foundItem.imgId || null,
  });

  itemInput.value = "";
  saveTrackerState();
  renderTracker();
}

function updateItemValue(id, key, val) {
  const item = trackedItems.find((t) => t.id === id);
  if (item) {
    item[key] = parseInt(val) || 0;
    saveTrackerState();
    renderTracker();
  }
}

function removeTrackedItem(id) {
  // Force tooltip to hide immediately when deleting
  hideTooltip();

  // Filter the array to exclude the item with the matching ID
  trackedItems = trackedItems.filter((t) => t.id !== id);

  // Save the new state to LocalStorage
  saveTrackerState();

  // Refresh the UI
  renderTracker();
}

function sortTrackerItems() {
  if (!trackedItems || trackedItems.length === 0) return;

  // Toggle direction on each click
  sortDirection *= -1;

  // Update Button Text
  const docs = [document];
  if (pipWindow && pipWindow.document) docs.push(pipWindow.document);
  docs.forEach((doc) => {
    const btn = doc.getElementById("tracker-sort-btn");
    if (btn) btn.textContent = sortDirection === 1 ? "↓" : "↑";
  });

  trackedItems.sort((a, b) => {
    const profA = a.profession || "Z_Other";
    const profB = b.profession || "Z_Other";

    // 1. Sort by Custom Priority
    const prioA = PROFESSION_SORT_ORDER[profA] || 100;
    const prioB = PROFESSION_SORT_ORDER[profB] || 100;

    if (prioA !== prioB) {
      return (prioA - prioB) * sortDirection;
    }

    // 2. Secondary Sort: Profession Name (for non-priority jobs like Miner/Farmer)
    const profCompare = profA.localeCompare(profB);
    if (profCompare !== 0) return profCompare * sortDirection;

    // 3. Tertiary Sort: Item Level (INVERTED: High to Low)
    if (a.level !== b.level) {
      return (b.level - a.level) * sortDirection;
    }

    // 4. Quaternary Sort: Item Name (Alphabetical)
    return a.name.localeCompare(b.name);
  });

  // Persist the new order and re-render
  saveTrackerState();
  renderTracker();
}

function setTrackerFilter(filter) {
  currentTrackerFilter = filter;

  // SAVE STATE
  localStorage.setItem("wakfu_tracker_filter", filter);

  // Update UI State
  const docs = [document];
  if (pipWindow && pipWindow.document) docs.push(pipWindow.document);
  docs.forEach((doc) => {
    const buttons = doc.querySelectorAll(".tracker-filters .filter-icon-btn");
    buttons.forEach((btn) => btn.classList.remove("active"));
  });

  // Determine ID based on filter
  let btnId = "tf-all";
  if (filter !== "SHOW_ALL") {
    btnId = "tf-" + filter.toLowerCase();
  }

  docs.forEach((doc) => {
    const activeBtn = doc.getElementById(btnId);
    if (activeBtn) activeBtn.classList.add("active");
  });

  renderTracker();
}

// Function to Toggle Footer
function toggleTrackerTotals() {
  showTrackerFooter = !showTrackerFooter;
  localStorage.setItem("wakfu_show_totals", showTrackerFooter);
  renderTracker(); // Re-render to apply display state
}

function toggleTrackerLossMode() {
  trackerDecreaseOnLoss = !trackerDecreaseOnLoss;
  localStorage.setItem(
    "wakfu_tracker_decrease_on_loss",
    trackerDecreaseOnLoss.toString()
  );
  updateTrackerLossToggleUI();
}

function updateTrackerLossToggleUI() {
  const docs = [document];
  if (pipWindow && pipWindow.document) docs.push(pipWindow.document);

  docs.forEach((doc) => {
    const btn = doc.getElementById("tracker-loss-toggle");
    if (!btn) return;
    btn.classList.toggle("active", trackerDecreaseOnLoss);
    btn.title = trackerDecreaseOnLoss
      ? "失去物品时扣减进度：开启"
      : "失去物品时扣减进度：关闭";
  });
}

// --- Drag & Drop Handlers ---
function handleTrackDragStart(e) {
  this.classList.add("dragging");
  dragSrcIndex = this.dataset.index;
  e.dataTransfer.effectAllowed = "move";
  e.dataTransfer.setData("text/plain", dragSrcIndex);
}

function handleTrackDragOver(e) {
  if (e.preventDefault) e.preventDefault(); // Necessary to allow dropping
  e.dataTransfer.dropEffect = "move";
  return false;
}

function handleTrackDragEnter(e) {
  // Only highlight if we are entering a different row than the one we are dragging
  if (this.dataset.index !== dragSrcIndex) {
    this.classList.add("drag-over");
  }
}

function handleTrackDragLeave(e) {
  this.classList.remove("drag-over");
}

function handleTrackDrop(e) {
  if (e.stopPropagation) e.stopPropagation();

  const destIndex = this.dataset.index;

  // Don't do anything if dropping on itself
  if (dragSrcIndex !== destIndex && dragSrcIndex !== null) {
    // Reorder Array
    const fromIdx = parseInt(dragSrcIndex, 10);
    const toIdx = parseInt(destIndex, 10);

    // Remove item from old position
    const movedItem = trackedItems.splice(fromIdx, 1)[0];
    // Insert at new position
    trackedItems.splice(toIdx, 0, movedItem);

    saveTrackerState();
    renderTracker();
  }
  return false;
}

function handleTrackDragEnd(e) {
  this.classList.remove("dragging");
  const docs = [document];
  if (pipWindow && pipWindow.document) docs.push(pipWindow.document);
  docs.forEach((doc) => {
    const rows = doc.querySelectorAll(".tracked-item-row");
    rows.forEach((row) => row.classList.remove("drag-over"));
  });
  dragSrcIndex = null;
}

function showTrackerNotification(qty, itemName, type = "pickup") {
  // Define where to show notifications: Main Window + PiP Window (if open)
  const targets = [document];
  if (pipWindow && pipWindow.document) {
    targets.push(pipWindow.document);
  }

  // Loop through all active windows and spawn the toast
  targets.forEach((doc) => {
    let container = doc.getElementById("tracker-notifications");

    // Safety: Create the container if it doesn't exist in this document
    if (!container) {
      container = doc.createElement("div");
      container.id = "tracker-notifications";
      doc.body.appendChild(container);
    }

    const toast = doc.createElement("div");
    toast.className = "tracker-toast";

    // Handle legacy boolean calls (true = completion, false = pickup)
    if (type === true) type = "completion";
    if (type === false) type = "pickup";

    if (type === "completion") {
      // GOAL REACHED STYLE
      toast.innerHTML = `<strong>目标达成：</strong> ${itemName}`;
      toast.style.borderColor = "#2ecc71"; // Green
      toast.style.color = "#2ecc71";
      toast.style.boxShadow = "0 0 10px rgba(46, 204, 113, 0.4)";
      toast.style.fontSize = "0.95rem";
    } else if (type === "custom") {
      // CUSTOM MESSAGE STYLE (For Professions Calc, etc)
      toast.textContent = itemName; // itemName holds the full message
      toast.style.borderColor = "var(--accent)"; // Blue/Cyan
      toast.style.color = "#fff";
    } else if (type === "loss") {
      toast.textContent = `失去 ${qty}x ${itemName}`;
      toast.style.borderColor = "#ff7b7b";
      toast.style.color = "#ffb3b3";
    } else {
      // STANDARD PICKUP STYLE
      toast.textContent = `获得 ${qty}x ${itemName}`;
    }

    container.appendChild(toast);

    // Lasts longer if it's a completion message
    setTimeout(
      () => {
        if (toast.parentNode) toast.parentNode.removeChild(toast);
      },
      type === "completion" ? 5000 : 3000
    );
  });
}

function getItemUsage(itemName) {
  if (typeof PROFESSIONS_DATA === "undefined") return "";

  const usedIn = new Set();
  const targetName = itemName.toLowerCase().trim();

  // Iterate over all professions in the database
  for (const [profName, profData] of Object.entries(PROFESSIONS_DATA)) {
    if (!profData.ranges) continue;

    // Iterate over level ranges
    for (const range of profData.ranges) {
      let found = false;

      // Check standard ingredients list
      if (range.ingredients) {
        if (
          range.ingredients.some((ing) => ing.name.toLowerCase() === targetName)
        ) {
          found = true;
        }
      }

      // Check recipe variants (array of arrays)
      if (!found && range.recipes) {
        for (const recipe of range.recipes) {
          if (recipe.some((ing) => ing.name.toLowerCase() === targetName)) {
            found = true;
            break;
          }
        }
      }

      // If found in this profession, add to Set and stop checking this profession
      if (found) {
        usedIn.add(profName);
        break;
      }
    }
  }

  if (usedIn.size > 0) {
    // Return formatted string for tooltip
    const sortedProfs = Array.from(usedIn)
      .sort()
      .map((prof) => getTrackerProfessionLabel(prof))
      .join("、");
    return `\n用途：${sortedProfs}`;
  }
  return "";
}

function openTrackerModal(itemId) {
  const item = trackedItems.find((t) => t.id === itemId);
  if (!item) return;

  const modal = document.getElementById("tracker-modal");

  // MAIN ITEM ICON
  const itemIconPath =
    item.profession === "ALL" && item.imgId
      ? `./assets/img/items/${item.imgId}.png`
      : `./assets/img/resources/${item.name.replace(/\s+/g, "_")}.png`;

  document.getElementById("modal-item-name").textContent =
    item.displayName || item.name;
  const modalIcon = document.getElementById("modal-item-icon");
  modalIcon.src = itemIconPath;

  modalIcon.onerror = function () {
    this.src = "./assets/img/resources/not_found.png";
    this.onerror = null;
  };

  // Get Inputs
  const curInput = document.getElementById("modal-input-current");
  const tarInput = document.getElementById("modal-input-target");
  const priceInput = document.getElementById("modal-input-price");

  // Set Initial Values
  curInput.value = item.current;
  tarInput.value = item.target;
  priceInput.value = item.price || 0;

  // --- CALCULATION LOGIC ---
  const calcCurrentEl = document.getElementById("modal-calc-current");
  const calcTargetEl = document.getElementById("modal-calc-target");

  function updateModalCalc() {
    const c = parseInt(curInput.value) || 0;
    const t = parseInt(tarInput.value) || 0;
    const p = parseInt(priceInput.value) || 0;

    const totalCur = c * p;
    const totalTar = t * p;

    // Append symbol here to ensure single text block alignment
    calcCurrentEl.textContent = totalCur.toLocaleString() + " ₭";
    calcTargetEl.textContent = totalTar.toLocaleString() + " ₭";
  }

  // Real-time listeners
  curInput.oninput = updateModalCalc;
  tarInput.oninput = updateModalCalc;
  priceInput.oninput = updateModalCalc;

  // Run calculation immediately
  updateModalCalc();

  // SAVE BUTTON
  document.getElementById("modal-save-btn").onclick = () => {
    const newCur = parseInt(curInput.value) || 0;
    const newTar = parseInt(tarInput.value) || 0;
    const newPrice = parseInt(priceInput.value) || 0;

    item.current = newCur;
    item.target = newTar;
    item.price = newPrice;

    saveTrackerState();
    renderTracker();
    closeTrackerModal();
  };

  document.getElementById("modal-delete-btn").onclick = () => {
    if (confirm(`停止追踪 ${item.displayName || item.name}？`)) {
      removeTrackedItem(item.id);
      closeTrackerModal();
    }
  };

  modal.style.display = "flex";
}

function closeTrackerModal() {
  document.getElementById("tracker-modal").style.display = "none";
}

window.toggleTrackerLossMode = toggleTrackerLossMode;
