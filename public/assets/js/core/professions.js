document.addEventListener("DOMContentLoaded", () => {
  initializeProfessionCalculator();
});

const PROFESSION_LEVEL_XP_STEP = 150;
const PROF_CALC_MODE_EXPERIENCE = "experience";
const PROF_CALC_MODE_MANUAL = "manual";
const PROF_CALC_STORAGE_KEY = "wakfu_prof_calc_state_v2";
const PROFESSION_TRANSFER_SCHEMA = "wakfu-companion-transfer";
const PROFESSION_TRANSFER_VERSION = 1;
const DEFAULT_PROF_CALC_RANGES = [
  { min: 0, max: 10, xpReq: 7500 },
  { min: 10, max: 20, xpReq: 22500 },
  { min: 20, max: 30, xpReq: 37500 },
  { min: 30, max: 40, xpReq: 52500 },
  { min: 40, max: 50, xpReq: 67500 },
  { min: 50, max: 60, xpReq: 82500 },
  { min: 60, max: 70, xpReq: 97500 },
  { min: 70, max: 80, xpReq: 112500 },
  { min: 80, max: 90, xpReq: 127500 },
  { min: 90, max: 100, xpReq: 142500 },
  { min: 100, max: 110, xpReq: 157500 },
  { min: 110, max: 120, xpReq: 172500 },
  { min: 120, max: 130, xpReq: 187500 },
  { min: 130, max: 140, xpReq: 202500 },
  { min: 140, max: 150, xpReq: 217500 },
  { min: 150, max: 160, xpReq: 232500 },
];

const DEFAULT_PROF_CALC_STATE = {
  mode: PROF_CALC_MODE_EXPERIENCE,
  autoCalculate: false,
  currentLevel: "0",
  currentLevelExp: "0",
  targetLevel: "20",
  craftXp: "600",
  craftCount: "",
  outputName: "产物",
  outputQty: "",
  outputPrice: "",
  materials: [
    { name: "材料1", englishName: "", displayName: "", chineseName: "", qty: "", price: "" },
    { name: "材料2", englishName: "", displayName: "", chineseName: "", qty: "", price: "" },
  ],
};

let materialRowId = 0;
let currentProfCalcMode = PROF_CALC_MODE_EXPERIENCE;
let professionCalcAutoCalculate = false;
let professionTransferMode = "export";

function initializeProfessionCalculator() {
  syncProfessionCalculatorText();
  buildProfessionCalculatorLayout();
  hideProfessionSelector();
  restoreProfessionCalculatorState();
  bindProfessionCalculatorEvents();
  applyProfessionCalcMode();
  updateProfessionCalcToggleUI();
  if (professionCalcAutoCalculate) {
    renderProfessionCalculationResult();
  }
}

function syncProfessionCalculatorText() {
  const labels =
    typeof document.querySelectorAll === "function"
      ? Array.from(document.querySelectorAll(".prof-level-label"))
      : [];
  const calcBtn =
    typeof document.querySelector === "function"
      ? document.querySelector(".prof-calc-btn")
      : null;
  const sidebarTitle =
    typeof document.querySelector === "function"
      ? document.querySelector("#professions-sidebar .sidebar-header h3")
      : null;
  const resultContainer = document.getElementById("profession-results-list");
  const currentExpInput = document.getElementById("prof-base-exp");

  if (labels[0]) labels[0].textContent = "当前级经验";
  if (labels[1]) labels[1].textContent = "当前等级";
  if (labels[2]) labels[2].textContent = "目标等级";

  if (currentExpInput) {
    currentExpInput.min = "0";
    if (!currentExpInput.value) currentExpInput.value = "0";
  }

  if (sidebarTitle) {
    const icon = sidebarTitle.querySelector("img");
    sidebarTitle.innerHTML = icon ? `${icon.outerHTML} 生产计算` : "生产计算";
  }

  if (calcBtn) calcBtn.textContent = "运算";

  if (resultContainer && !resultContainer.dataset.professionCalculatorReady) {
    resetProfessionCalculationResult();
    resultContainer.dataset.professionCalculatorReady = "true";
  }
}

function buildProfessionCalculatorLayout() {
  const levelsContainer =
    typeof document.querySelector === "function"
      ? document.querySelector(".prof-levels")
      : null;
  const calcBtn =
    typeof document.querySelector === "function"
      ? document.querySelector(".prof-calc-btn")
      : null;

  if (!levelsContainer || !calcBtn) return;

  levelsContainer.classList.add("prof-levels-grid");

  const sidebarHeader =
    typeof document.querySelector === "function"
      ? document.querySelector("#professions-sidebar .sidebar-header")
      : null;
  if (sidebarHeader && !document.getElementById("prof-header-actions")) {
    const closeBtn = sidebarHeader.querySelector(".close-sidebar-btn");
    const headerActions = document.createElement("div");
    headerActions.id = "prof-header-actions";
    headerActions.className = "prof-header-actions";
    headerActions.innerHTML = `
      <button type="button" id="prof-import-btn" class="tracker-action-btn prof-header-btn">导入</button>
      <button type="button" id="prof-export-btn" class="tracker-action-btn prof-header-btn">导出</button>
      <button type="button" id="prof-track-btn" class="tracker-action-btn prof-header-btn">追踪</button>
    `;
    if (closeBtn?.parentNode) {
      closeBtn.parentNode.insertBefore(headerActions, closeBtn);
    } else {
      sidebarHeader.appendChild(headerActions);
    }
  }

  if (!document.getElementById("prof-calc-mode-switch")) {
    const modeSwitch = document.createElement("div");
    modeSwitch.id = "prof-calc-mode-switch";
    modeSwitch.className = "prof-calc-mode-switch";
    modeSwitch.innerHTML = `
      <button type="button" class="prof-mode-btn" data-mode="${PROF_CALC_MODE_EXPERIENCE}">经验推算次数</button>
      <button type="button" class="prof-mode-btn" data-mode="${PROF_CALC_MODE_MANUAL}">手填生产次数</button>
    `;
    levelsContainer.parentNode.insertBefore(modeSwitch, levelsContainer);
  }

  ensureInputGroup(levelsContainer, "单次制作经验", "prof-craft-xp", {
    min: "1",
    value: "600",
    groupClassName: "prof-mode-experience",
  });

  ensureInputGroup(levelsContainer, "生产个数", "prof-craft-count", {
    min: "0",
    step: "1",
    placeholder: "手动填写",
    groupClassName: "prof-mode-manual",
  });

  if (!document.getElementById("prof-materials-builder")) {
    const materialsBuilder = document.createElement("div");
    materialsBuilder.id = "prof-materials-builder";
    materialsBuilder.className = "prof-materials-builder";
    materialsBuilder.innerHTML = `
      <div class="prof-materials-header">
        <div class="prof-form-row-header prof-form-row-header-materials">
          <span>图标</span>
          <span>原材料</span>
          <span>个数</span>
          <span>单价</span>
        </div>
        <button type="button" id="prof-add-material-btn" class="prof-add-btn prof-material-header-btn">+</button>
      </div>
      <div id="prof-material-rows" class="prof-material-rows"></div>
      <div class="prof-output-builder">
        <div class="prof-form-row-header prof-form-row-header-output">
          <span>产物</span>
          <span>个数</span>
          <span>单价</span>
        </div>
        <div class="prof-output-row">
          <input type="text" id="prof-output-name" class="prof-level-input prof-output-name" value="产物" />
          <input type="text" id="prof-output-qty" class="prof-level-input prof-output-qty prof-expression-input" inputmode="numeric" placeholder="1" />
          <input type="text" id="prof-output-price" class="prof-level-input prof-output-price prof-expression-input" inputmode="numeric" placeholder="0" />
        </div>
      </div>
    `;
    calcBtn.parentNode.insertBefore(materialsBuilder, calcBtn);
  }

  if (!document.getElementById("prof-action-row")) {
    const actionRow = document.createElement("div");
    actionRow.id = "prof-action-row";
    actionRow.className = "prof-action-row";

    const clearBtn = document.createElement("button");
    clearBtn.type = "button";
    clearBtn.id = "prof-clear-btn";
    clearBtn.className = "prof-clear-btn";
    clearBtn.textContent = "清空";

    calcBtn.parentNode.insertBefore(actionRow, calcBtn);
    actionRow.appendChild(clearBtn);
    actionRow.appendChild(calcBtn);
  }
}

function ensureInputGroup(container, labelText, inputId, attrs = {}) {
  if (document.getElementById(inputId)) return;
  container.appendChild(createInputGroup(labelText, inputId, attrs));
}

function createInputGroup(labelText, inputId, attrs = {}) {
  const group = document.createElement("div");
  group.className = "prof-level-input-group";
  if (attrs.groupClassName) {
    group.classList.add(attrs.groupClassName);
  }

  const label = document.createElement("label");
  label.className = "prof-level-label";
  label.textContent = labelText;

  const input = document.createElement("input");
  input.type = "number";
  input.id = inputId;
  input.className = "prof-level-input";

  Object.entries(attrs).forEach(([key, value]) => {
    if (key === "groupClassName") return;
    input.setAttribute(key, value);
  });

  group.appendChild(label);
  group.appendChild(input);
  return group;
}

function hideProfessionSelector() {
  const selectGroup =
    typeof document.querySelector === "function"
      ? document.querySelector(".prof-header-group")
      : null;
  if (selectGroup) selectGroup.style.display = "none";
}

function bindProfessionCalculatorEvents() {
  Array.from(document.querySelectorAll?.(".prof-mode-btn") || []).forEach(
    (button) => {
      button.onclick = () => {
        currentProfCalcMode = button.dataset.mode || PROF_CALC_MODE_EXPERIENCE;
        applyProfessionCalcMode();
        saveProfessionCalculatorState();
        runProfessionCalculationIfEnabled();
      };
    }
  );

  const addBtn = document.getElementById("prof-add-material-btn");
  if (addBtn) {
    addBtn.onclick = () => {
      addProfessionMaterialRow();
    };
  }

  const clearBtn = document.getElementById("prof-clear-btn");
  if (clearBtn) {
    clearBtn.onclick = () => {
      resetProfessionCalculatorState();
    };
  }

  const importBtn = document.getElementById("prof-import-btn");
  if (importBtn) {
    importBtn.onclick = () => {
      openProfessionTransferModal("import");
    };
  }

  const exportBtn = document.getElementById("prof-export-btn");
  if (exportBtn) {
    exportBtn.onclick = () => {
      openProfessionTransferModal("export");
    };
  }

  const trackBtn = document.getElementById("prof-track-btn");
  if (trackBtn) {
    trackBtn.onclick = () => {
      sendProfessionMaterialsToTracker();
    };
  }

  bindProfessionSidebarDropZone();

  const transferFileInput = document.getElementById("prof-transfer-file-input");
  if (transferFileInput && transferFileInput.dataset.bound !== "true") {
    transferFileInput.dataset.bound = "true";
    transferFileInput.addEventListener("change", async (event) => {
      const file = event.target?.files?.[0];
      if (!file) return;
      await loadProfessionTransferFile(file);
      event.target.value = "";
    });
  }

  const calcBtn = document.querySelector(".prof-calc-btn");
  if (calcBtn) {
    calcBtn.onclick = () => {
      professionCalcAutoCalculate = !professionCalcAutoCalculate;
      updateProfessionCalcToggleUI();
      saveProfessionCalculatorState();
      if (professionCalcAutoCalculate) {
        renderProfessionCalculationResult();
      }
    };
  }

  bindProfessionCalculatorInputs(document);
}

function bindProfessionCalculatorInputs(root) {
  const inputs =
    typeof root.querySelectorAll === "function"
      ? Array.from(root.querySelectorAll(".prof-level-input, #prof-output-name"))
      : [];

  inputs.forEach((input) => {
    if (input.dataset.profCalcBound === "true") return;
    input.dataset.profCalcBound = "true";

    if (input.classList.contains("prof-expression-input")) {
      bindProfessionExpressionInput(input);
      return;
    }

    const handler = () => {
      saveProfessionCalculatorState();
      runProfessionCalculationIfEnabled();
    };

    input.addEventListener("input", handler);
    input.addEventListener("change", handler);
  });

  const materialInputs =
    typeof root.querySelectorAll === "function"
      ? Array.from(root.querySelectorAll(".prof-material-name"))
      : [];

  materialInputs.forEach((input) => {
    if (input.dataset.profMaterialBound === "true") return;
    input.dataset.profMaterialBound = "true";
    input.setAttribute("list", "item-datalist");
    input.setAttribute("autocomplete", "off");
    input.setAttribute("autocorrect", "off");
    input.setAttribute("autocapitalize", "off");
    input.setAttribute("spellcheck", "false");

    input.addEventListener("input", () => {
      const row = input.closest(".prof-material-row");
      if (!row) return;
      syncProfessionMaterialRow(row, { fromTyping: true });
      saveProfessionCalculatorState();
      runProfessionCalculationIfEnabled();
    });

    input.addEventListener("change", () => {
      const row = input.closest(".prof-material-row");
      if (!row) return;
      syncProfessionMaterialRow(row);
      saveProfessionCalculatorState();
      runProfessionCalculationIfEnabled();
    });

    input.addEventListener("blur", () => {
      const row = input.closest(".prof-material-row");
      if (!row) return;
      syncProfessionMaterialRow(row);
      saveProfessionCalculatorState();
      runProfessionCalculationIfEnabled();
    });
  });
}

function bindProfessionExpressionInput(input) {
  if (!input || input.dataset.profExpressionBound === "true") return;
  input.dataset.profExpressionBound = "true";
  input.dataset.prevCommittedValue = input.value || "";

  input.addEventListener("focus", () => {
    input.dataset.prevCommittedValue = input.value || "";
  });

  input.addEventListener("blur", () => {
    finalizeProfessionExpressionInput(input);
  });

  input.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    input.blur();
  });
}

function applyProfessionCalcMode() {
  const experienceFields = Array.from(
    document.querySelectorAll?.(".prof-mode-experience") || []
  );
  const manualFields = Array.from(
    document.querySelectorAll?.(".prof-mode-manual") || []
  );
  const buttons = Array.from(document.querySelectorAll?.(".prof-mode-btn") || []);
  const currentLevelGroup = document.getElementById("prof-current-lvl")?.closest(
    ".prof-level-input-group"
  );
  const currentExpGroup = document.getElementById("prof-base-exp")?.closest(
    ".prof-level-input-group"
  );
  const targetLevelGroup = document.getElementById("prof-target-lvl")?.closest(
    ".prof-level-input-group"
  );

  experienceFields.forEach((field) => {
    field.classList.toggle(
      "is-hidden",
      currentProfCalcMode !== PROF_CALC_MODE_EXPERIENCE
    );
  });

  manualFields.forEach((field) => {
    field.classList.toggle(
      "is-hidden",
      currentProfCalcMode !== PROF_CALC_MODE_MANUAL
    );
  });

  [currentLevelGroup, currentExpGroup, targetLevelGroup].forEach((field) => {
    if (field) {
      field.classList.toggle(
        "is-hidden",
        currentProfCalcMode !== PROF_CALC_MODE_EXPERIENCE
      );
    }
  });

  buttons.forEach((button) => {
    button.classList.toggle(
      "is-active",
      button.dataset.mode === currentProfCalcMode
    );
  });
}

function updateProfessionCalcToggleUI() {
  const calcBtn = document.querySelector(".prof-calc-btn");
  if (!calcBtn) return;

  calcBtn.classList.toggle("is-active", professionCalcAutoCalculate);
  calcBtn.textContent = professionCalcAutoCalculate ? "运算中" : "运算";
}

function runProfessionCalculationIfEnabled() {
  if (!professionCalcAutoCalculate) return;
  renderProfessionCalculationResult();
}

function getProfessionCalculationSnapshot() {
  const currentLevel = parseInteger("prof-current-lvl");
  const currentLevelExp = parseInteger("prof-base-exp");
  const targetLevel = parseInteger("prof-target-lvl");
  const craftXp = parseOptionalFloat("prof-craft-xp");
  const manualCraftCount = parseOptionalInteger("prof-craft-count");
  const outputName =
    (document.getElementById("prof-output-name")?.value || "产物").trim() || "产物";
  const outputQty = parseOptionalInteger("prof-output-qty", 1);
  const outputPrice = parseOptionalInteger("prof-output-price", 0);

  let craftsNeeded = 0;
  let totalXpNeeded = null;

  if (currentProfCalcMode === PROF_CALC_MODE_MANUAL) {
    if (manualCraftCount === null || manualCraftCount < 0) {
      return { error: "请填写不小于 0 的生产个数。" };
    }
    craftsNeeded = manualCraftCount;
  } else {
    if (
      Number.isNaN(currentLevel) ||
      Number.isNaN(currentLevelExp) ||
      Number.isNaN(targetLevel) ||
      craftXp === null
    ) {
      return { error: "请完整填写等级、经验与单次制作经验。" };
    }

    if (currentLevel >= targetLevel) {
      return { error: "目标等级必须高于当前等级。" };
    }

    if (craftXp <= 0) {
      return { error: "单次制作经验必须大于 0。" };
    }

    const ranges = getGenericProfessionRanges();
    const currentRange = ranges.find(
      (range) => currentLevel >= range.min && currentLevel < range.max
    );

    if (!currentRange) {
      return { error: "当前等级超出可计算范围。" };
    }

    const currentLevelRequirement = getLevelXpRequirement(
      currentLevel,
      currentRange
    );
    if (
      currentLevelExp < 0 ||
      currentLevelRequirement <= 0 ||
      currentLevelExp >= currentLevelRequirement
    ) {
      return {
        error: `当前级经验应在 0 到 ${currentLevelRequirement - 1} 之间。`,
      };
    }

    totalXpNeeded = -currentLevelExp;
    for (let level = currentLevel; level < targetLevel; level++) {
      const range = ranges.find(
        (entry) => level >= entry.min && level < entry.max
      );
      if (!range) {
        return { error: "目标等级超出可计算范围。" };
      }
      totalXpNeeded += getLevelXpRequirement(level, range);
    }

    craftsNeeded = Math.ceil(totalXpNeeded / craftXp);
  }

  const materials = readProfessionMaterialRows();
  if (materials.some((material) => material.rawInput && !material.englishName)) {
    return { error: "请先从搜索结果中选择所有原材料。" };
  }

  return {
    totalXpNeeded,
    craftsNeeded,
    craftXp,
    outputName,
    outputQty,
    outputPrice,
    materials,
    isManualMode: currentProfCalcMode === PROF_CALC_MODE_MANUAL,
  };
}

function renderProfessionCalculationResult() {
  const resultContainer = document.getElementById("profession-results-list");
  if (!resultContainer) return;

  const snapshot = getProfessionCalculationSnapshot();
  if (snapshot.error) {
    resultContainer.innerHTML = `<div class="empty-state">${escapeHtml(
      snapshot.error
    )}</div>`;
    return;
  }

  renderProfessionResults({ resultContainer, ...snapshot });
}

function readProfessionMaterialRows() {
  const rows = Array.from(
    document.querySelectorAll?.("#prof-material-rows .prof-material-row") || []
  );

  return rows.map((row, index) => {
    const qtyInput = row.querySelector(".prof-material-qty");
    const priceInput = row.querySelector(".prof-material-price");
    const qty = parseProfessionRoundedInteger(qtyInput?.value, null);
    const price = parseProfessionRoundedInteger(priceInput?.value, null);
    const materialMeta = readProfessionMaterialRow(row, index);

    return {
      ...materialMeta,
      qty: qty === null || Number.isNaN(qty) ? 1 : qty,
      price: price === null || Number.isNaN(price) ? 0 : price,
    };
  });
}

function renderProfessionResults({
  resultContainer,
  totalXpNeeded,
  craftsNeeded,
  craftXp,
  outputName,
  outputQty,
  outputPrice,
  materials,
  isManualMode,
}) {
  const singleCraftCost = materials.reduce(
    (sum, material) => sum + material.qty * material.price,
    0
  );
  const totalCost = singleCraftCost * craftsNeeded;
  const totalOutput = outputQty * craftsNeeded;
  const totalRevenue = totalOutput * outputPrice;
  const totalProfit = totalRevenue - totalCost;

  const summaryLine = isManualMode
    ? renderRecipeDetailChunks([
        "按手填生产次数计算",
        `需制作 ${formatNumber(craftsNeeded)} 次`,
      ])
    : renderRecipeDetailChunks([
        `还需经验 ${formatNumber(totalXpNeeded)}`,
        `单次制作经验 ${formatNumber(craftXp)}`,
        `需制作 ${formatNumber(craftsNeeded)} 次`,
      ]);

  const costLine = renderRecipeDetailChunks([
    `单次制造成本 ${formatNumber(singleCraftCost)}`,
    `总开销 ${formatNumber(totalCost)}`,
  ]);

  const outputLine = `
    <span class="recipe-detail-line">${escapeHtml(outputName)}：</span>
    <span class="recipe-detail-line">${renderRecipeDetailChunks([
      `总生产个数 ${formatNumber(totalOutput)}`,
      `单价 ${formatNumber(outputPrice)}`,
    ])}</span>
    <span class="recipe-detail-line">${renderRecipeDetailChunks([
      `总收入 ${formatNumber(totalRevenue)}`,
      `总利润 ${formatNumber(totalProfit)}`,
    ])}</span>
  `;

  const materialRowsHtml =
    materials.length > 0
      ? materials
          .map((material) => {
            const totalQty = material.qty * craftsNeeded;
            const totalMaterialCost = material.price * totalQty;

            return `
              <div class="ing-row prof-cost-row">
                <div class="ing-left prof-cost-main">
                  <span class="prof-cost-name">${escapeHtml(material.displayName || material.name)}</span>
                  <span class="ing-multiplier">单次消耗 ${formatNumber(
                    material.qty
                  )}</span>
                </div>
                <div class="ing-right prof-cost-meta">
                  <span class="ing-multiplier">单价 ${formatNumber(
                    material.price
                  )}</span>
                  <span class="ing-total">总个数 ${formatNumber(
                    totalQty
                  )} / 总成本 ${formatNumber(totalMaterialCost)}</span>
                </div>
              </div>
            `;
          })
          .join("")
      : '<div class="empty-state-mini">暂无材料行。</div>';

  resultContainer.innerHTML = `
    <div class="prof-recipe-card">
      <div class="recipe-card-header prof-results-header">
        <div class="recipe-card-meta">
          <div class="recipe-name">生产计算</div>
          <div class="recipe-details">${summaryLine}</div>
          <div class="recipe-details">${costLine}</div>
          <div class="recipe-details">${outputLine}</div>
        </div>
      </div>
      <div class="recipe-card-ingredients">
        ${materialRowsHtml}
        <div class="ing-row prof-output-summary-row">
          <div class="ing-left prof-cost-main">
            <span class="prof-cost-name">${escapeHtml(outputName)}</span>
            <span class="ing-multiplier">单次产出 ${formatNumber(
              outputQty
            )}</span>
          </div>
          <div class="ing-right prof-cost-meta">
            <span class="ing-multiplier">单价 ${formatNumber(
              outputPrice
            )}</span>
            <span class="ing-total">总个数 ${formatNumber(
              totalOutput
            )} / 总收入 ${formatNumber(totalRevenue)}</span>
          </div>
        </div>
      </div>
    </div>
  `;
}

function getGenericProfessionRanges() {
  if (typeof PROFESSIONS_DATA === "undefined") return DEFAULT_PROF_CALC_RANGES;
  const firstProfession = Object.values(PROFESSIONS_DATA)[0];
  return firstProfession?.ranges || DEFAULT_PROF_CALC_RANGES;
}

function getLevelXpRequirement(level, range) {
  const levelsInRange = range.max - range.min;
  if (levelsInRange <= 0) return 0;

  const averageXp = range.xpReq / levelsInRange;
  const firstLevelXp =
    averageXp - (PROFESSION_LEVEL_XP_STEP * (levelsInRange - 1)) / 2;

  return Math.round(
    firstLevelXp + (level - range.min) * PROFESSION_LEVEL_XP_STEP
  );
}

function addProfessionMaterialRow(name = "", qty = "", price = "", options = {}) {
  const rowsContainer = document.getElementById("prof-material-rows");
  if (!rowsContainer) return;

  materialRowId += 1;
  const defaultName = `材料${materialRowId}`;
  const seed = typeof name === "object" && name !== null ? name : { name };
  const lookupName =
    seed.englishName || seed.displayName || seed.name || "";
  const catalogItem =
    typeof window.findTrackerCatalogItem === "function" && lookupName
      ? window.findTrackerCatalogItem(lookupName)
      : null;
  const displayName =
    catalogItem?.displayName ||
    seed.displayName ||
    (isProfessionMaterialPlaceholderName(seed.name) ? "" : String(seed.name || ""));
  const englishName = catalogItem?.name || String(seed.englishName || "");
  const chineseName =
    seed.chineseName ||
    (catalogItem && typeof window.getPrimaryChineseLabel === "function"
      ? window.getPrimaryChineseLabel(catalogItem.name)
      : "");
  const iconPath = getProfessionMaterialIconPath(catalogItem);

  const row = document.createElement("div");
  row.className = "prof-material-row";
  row.dataset.rowId = String(materialRowId);
  row.dataset.defaultName = defaultName;
  row.innerHTML = `
    <div class="resource-icon-wrap prof-material-icon-wrap">
      <img src="${escapeHtmlAttribute(iconPath)}" class="resource-icon prof-material-icon" onerror="this.style.display='none';">
      <span class="rare-star-badge" aria-hidden="true" style="display:none">&#9733;</span>
    </div>
    <input type="text" class="prof-level-input prof-material-name" value="${escapeHtmlAttribute(
      displayName
    )}" placeholder="${escapeHtmlAttribute(defaultName)}" data-english-name="${escapeHtmlAttribute(
      englishName
    )}" data-display-name="${escapeHtmlAttribute(
      displayName
    )}" data-chinese-name="${escapeHtmlAttribute(chineseName)}" title="${escapeHtmlAttribute(
      displayName
    )}" />
    <input type="text" class="prof-level-input prof-material-qty prof-expression-input" inputmode="numeric" placeholder="1" value="${escapeHtmlAttribute(
      qty
    )}" />
    <input type="text" class="prof-level-input prof-material-price prof-expression-input" inputmode="numeric" placeholder="0" value="${escapeHtmlAttribute(
      price
    )}" />
    <button type="button" class="prof-add-btn prof-remove-material-btn">-</button>
  `;

  rowsContainer.appendChild(row);
  bindProfessionCalculatorInputs(row);
  syncProfessionMaterialRow(row, { silent: true, priceSource: options.priceSource || "preserve" });

  const removeBtn = row.querySelector(".prof-remove-material-btn");
  if (removeBtn) {
    removeBtn.onclick = () => {
      row.remove();
      if (rowsContainer.children.length === 0) {
        addProfessionMaterialRow();
      }
      saveProfessionCalculatorState();
      runProfessionCalculationIfEnabled();
    };
  }
}

function getProfessionCalculatorState() {
  const materialRows = Array.from(
    document.querySelectorAll?.("#prof-material-rows .prof-material-row") || []
  );

  return {
    mode: currentProfCalcMode,
    autoCalculate: professionCalcAutoCalculate,
    currentLevel: document.getElementById("prof-current-lvl")?.value || "0",
    currentLevelExp: document.getElementById("prof-base-exp")?.value || "0",
    targetLevel: document.getElementById("prof-target-lvl")?.value || "20",
    craftXp: document.getElementById("prof-craft-xp")?.value || "600",
    craftCount: document.getElementById("prof-craft-count")?.value || "",
    outputName: document.getElementById("prof-output-name")?.value || "产物",
    outputQty: document.getElementById("prof-output-qty")?.value || "",
    outputPrice: document.getElementById("prof-output-price")?.value || "",
    materials: materialRows.map((row, index) => {
      const materialMeta = readProfessionMaterialRow(row, index);
      return {
        name: materialMeta.name,
        englishName: materialMeta.englishName,
        displayName: materialMeta.displayName,
        chineseName: materialMeta.chineseName,
        qty: row.querySelector(".prof-material-qty")?.value || "",
        price: row.querySelector(".prof-material-price")?.value || "",
      };
    }),
  };
}

function normalizeProfessionCalculatorState(input) {
  const source = input && typeof input === "object" ? input : {};
  const fallbackMaterials = Array.isArray(DEFAULT_PROF_CALC_STATE.materials)
    ? DEFAULT_PROF_CALC_STATE.materials
    : [];
  const materialsSource =
    Array.isArray(source.materials) && source.materials.length > 0
      ? source.materials
      : fallbackMaterials;

  return {
    mode:
      source.mode === PROF_CALC_MODE_MANUAL
        ? PROF_CALC_MODE_MANUAL
        : PROF_CALC_MODE_EXPERIENCE,
    autoCalculate: Boolean(source.autoCalculate),
    currentLevel: String(source.currentLevel ?? DEFAULT_PROF_CALC_STATE.currentLevel),
    currentLevelExp: String(
      source.currentLevelExp ?? DEFAULT_PROF_CALC_STATE.currentLevelExp
    ),
    targetLevel: String(source.targetLevel ?? DEFAULT_PROF_CALC_STATE.targetLevel),
    craftXp: String(source.craftXp ?? DEFAULT_PROF_CALC_STATE.craftXp),
    craftCount: String(source.craftCount ?? DEFAULT_PROF_CALC_STATE.craftCount),
    outputName: String(source.outputName ?? DEFAULT_PROF_CALC_STATE.outputName),
    outputQty: String(source.outputQty ?? DEFAULT_PROF_CALC_STATE.outputQty),
    outputPrice: String(source.outputPrice ?? DEFAULT_PROF_CALC_STATE.outputPrice),
    materials: materialsSource.map((material, index) => ({
      name: String(material?.name ?? `材料${index + 1}`),
      englishName: String(material?.englishName ?? ""),
      displayName: String(material?.displayName ?? ""),
      chineseName: String(material?.chineseName ?? ""),
      qty: String(material?.qty ?? ""),
      price: String(material?.price ?? ""),
    })),
  };
}

function saveProfessionCalculatorState() {
  try {
    localStorage.setItem(
      PROF_CALC_STORAGE_KEY,
      JSON.stringify(getProfessionCalculatorState())
    );
  } catch {}
}

function restoreProfessionCalculatorState() {
  let savedState = null;

  try {
    savedState = JSON.parse(localStorage.getItem(PROF_CALC_STORAGE_KEY) || "null");
  } catch {
    savedState = null;
  }

  applyProfessionCalculatorState(savedState || DEFAULT_PROF_CALC_STATE);
}

function resetProfessionCalculatorState() {
  applyProfessionCalculatorState(DEFAULT_PROF_CALC_STATE);
  resetProfessionCalculationResult();
  saveProfessionCalculatorState();
  updateProfessionCalcToggleUI();
}

function applyProfessionCalculatorState(inputState) {
  const state = normalizeProfessionCalculatorState(inputState);
  currentProfCalcMode = state.mode;
  professionCalcAutoCalculate = state.autoCalculate;

  setInputValue("prof-current-lvl", state.currentLevel);
  setInputValue("prof-base-exp", state.currentLevelExp);
  setInputValue("prof-target-lvl", state.targetLevel);
  setInputValue("prof-craft-xp", state.craftXp);
  setInputValue("prof-craft-count", state.craftCount);
  setInputValue("prof-output-name", state.outputName);
  setInputValue("prof-output-qty", state.outputQty);
  setInputValue("prof-output-price", state.outputPrice);

  const rowsContainer = document.getElementById("prof-material-rows");
  if (rowsContainer) {
    rowsContainer.innerHTML = "";
    materialRowId = 0;
    state.materials.forEach((material) => {
      addProfessionMaterialRow(material, material.qty, material.price, {
        priceSource: "preserve",
      });
    });
  }

  applyProfessionCalcMode();
  updateProfessionCalcToggleUI();
}

function getProfessionTransferElements() {
  return {
    modal: document.getElementById("prof-transfer-modal"),
    title: document.getElementById("prof-transfer-title"),
    note: document.getElementById("prof-transfer-note"),
    text: document.getElementById("prof-transfer-text"),
    fileBtn: document.getElementById("prof-transfer-file-btn"),
    fileInput: document.getElementById("prof-transfer-file-input"),
    copyBtn: document.getElementById("prof-transfer-copy-btn"),
    applyBtn: document.getElementById("prof-transfer-apply-btn"),
  };
}

function openProfessionTransferModal(mode = "export") {
  professionTransferMode = mode === "import" ? "import" : "export";
  const { modal, title, note, text, fileBtn, copyBtn, applyBtn } = getProfessionTransferElements();
  if (!modal || !title || !note || !text || !fileBtn || !copyBtn || !applyBtn) return;

  if (professionTransferMode === "import") {
    title.textContent = "生产计算导入";
    note.textContent =
      "支持把 JSON 文本粘贴到这里，或把导出的文件拖进来。也兼容追踪器导出，追踪目标会转成原材料列表。";
    text.value = "";
    text.readOnly = false;
    fileBtn.style.display = "inline-flex";
    copyBtn.style.display = "none";
    applyBtn.style.display = "";
    bindTransferDropZone(modal, text, loadProfessionTransferFile);
    text.focus();
  } else {
    const state = getProfessionCalculatorState();
    const normalizedOutputName = String(state.outputName || "").trim();
    const suggestedName = sanitizeTransferFilename(
      normalizedOutputName || "生产计算导出"
    );
    const promptedName = prompt("导出文件名：", suggestedName);
    if (promptedName === null) return;
    const fileName = promptedName || suggestedName;
    downloadTransferFile(
      buildProfessionTransferPayload(),
      sanitizeTransferFilename(fileName) || suggestedName
    );
    closeProfessionTransferModal();
    return;
  }

  modal.style.display = "flex";
}

function closeProfessionTransferModal() {
  const { modal } = getProfessionTransferElements();
  if (modal) modal.style.display = "none";
}

async function copyProfessionTransferText() {
  const { text } = getProfessionTransferElements();
  if (!text) return;

  try {
    await navigator.clipboard.writeText(text.value || "");
  } catch {
    text.select();
    document.execCommand("copy");
  }
}

function importProfessionTransferText(rawText) {
  try {
    const parsed = JSON.parse(String(rawText || "{}"));
    const payload = parseProfessionImportPayload(parsed);
    const materials = Array.isArray(payload.materials) ? payload.materials : [];
    const priceMode = shouldAskProfessionImportPriceChoice(materials)
      ? confirm("是否使用文件单价覆盖本地单价？")
        ? "file"
        : "local"
      : "local";
    const nextPayload = {
      ...payload,
      materials: resolveProfessionImportMaterialPrices(materials, priceMode),
    };
    applyProfessionCalculatorState(nextPayload);
    saveProfessionCalculatorState();
    if (professionCalcAutoCalculate) {
      renderProfessionCalculationResult();
    } else {
      resetProfessionCalculationResult();
    }
    closeProfessionTransferModal();
  } catch (error) {
    console.error("Failed to import profession calculator state:", error);
    alert("生产计算导入失败，请确认内容是完整的导出文本。");
  }
}

function applyProfessionImport() {
  const { text } = getProfessionTransferElements();
  if (!text) return;
  importProfessionTransferText(text.value);
}

async function loadProfessionTransferFile(file) {
  try {
    const text = await file.text();
    const elements = getProfessionTransferElements();
    if (elements.text) {
      elements.text.value = text;
    }
    if (professionTransferMode === "import") {
      applyProfessionImport();
      return;
    }
    importProfessionTransferText(text);
  } catch (error) {
    console.error("Failed to read profession transfer file:", error);
    alert("读取生产计算导入文件失败。");
  }
}

function bindProfessionSidebarDropZone() {
  const sidebar = document.getElementById("professions-sidebar");
  if (!sidebar || sidebar.dataset.professionSidebarDropBound === "true") return;
  sidebar.dataset.professionSidebarDropBound = "true";

  const isSupportedTransferFile = (file) => {
    const fileName = String(file?.name || "").toLowerCase();
    const fileType = String(file?.type || "").toLowerCase();
    return (
      fileName.endsWith(".json") ||
      fileName.endsWith(".txt") ||
      fileType.includes("json") ||
      fileType.startsWith("text/")
    );
  };

  const getDroppedTransferFile = (event) =>
    Array.from(event.dataTransfer?.files || []).find((file) =>
      isSupportedTransferFile(file)
    );

  ["dragenter", "dragover"].forEach((eventName) => {
    sidebar.addEventListener(eventName, (event) => {
      if (!getDroppedTransferFile(event)) return;
      event.preventDefault();
    });
  });

  sidebar.addEventListener("drop", (event) => {
    const file = getDroppedTransferFile(event);
    if (!file) return;
    event.preventDefault();
    loadProfessionTransferFile(file);
  });
}

function bindTransferDropZone(modal, textArea, onFileDrop) {
  if (!modal || !textArea || modal.dataset.transferDropBound === "true") return;
  modal.dataset.transferDropBound = "true";

  const setDragState = (active) => {
    textArea.classList.toggle("is-drag-over", active);
  };

  ["dragenter", "dragover"].forEach((eventName) => {
    modal.addEventListener(eventName, (event) => {
      if (professionTransferMode !== "import") return;
      event.preventDefault();
      setDragState(true);
    });
  });

  ["dragleave", "dragend"].forEach((eventName) => {
    modal.addEventListener(eventName, () => {
      setDragState(false);
    });
  });

  modal.addEventListener("drop", (event) => {
    if (professionTransferMode !== "import") return;
    event.preventDefault();
    setDragState(false);
    const file = event.dataTransfer?.files?.[0];
    if (file) {
      onFileDrop(file);
      return;
    }
    const droppedText = event.dataTransfer?.getData("text/plain");
    if (droppedText) {
      textArea.value = droppedText;
    }
  });
}

function sanitizeTransferFilename(value) {
  return String(value || "")
    .trim()
    .replace(/[\\/:*?"<>|]+/g, "_")
    .replace(/\s+/g, " ");
}

function downloadTransferFile(payload, baseName) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json;charset=utf-8",
  });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `${baseName || "导出"}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

function isProfessionMaterialPlaceholderName(value) {
  const text = String(value || "").trim();
  return /^材料\d+$/i.test(text) || /^material\s*\d+$/i.test(text);
}

function getProfessionMaterialIconPath(catalogItem) {
  if (catalogItem && typeof window.getTrackerCatalogItemIconPath === "function") {
    return window.getTrackerCatalogItemIconPath(catalogItem);
  }
  return "";
}

function getProfessionStoredMaterialIconPath(englishName) {
  const name = String(englishName || "").trim();
  if (!name) return "";
  return `./assets/img/resources/${name.replace(/\s+/g, "_")}.png`;
}

function syncProfessionMaterialRarity(row, catalogItem) {
  const iconWrap = row?.querySelector(".prof-material-icon-wrap");
  const rareBadge = row?.querySelector(".rare-star-badge");
  if (!iconWrap || !rareBadge) return;

  const rarityName = String(catalogItem?.rarity || "").trim().toLowerCase();
  const isRare = rarityName === "rare";
  iconWrap.classList.toggle("is-rare", isRare);
  rareBadge.style.display = isRare ? "" : "none";
}

function getProfessionAuthorityPrice(englishName) {
  return typeof window.getTrackerAuthoritativePrice === "function"
    ? window.getTrackerAuthoritativePrice(englishName, 0)
    : 0;
}

function syncProfessionAuthorityPriceForRow(row) {
  const input = row?.querySelector(".prof-material-name");
  const priceInput = row?.querySelector(".prof-material-price");
  const englishName = String(input?.dataset.englishName || "").trim();
  if (!englishName || !priceInput) return false;
  if (typeof window.setTrackerAuthoritativePrice !== "function") return false;

  const parsedPrice = parseProfessionRoundedInteger(priceInput.value, null);
  if (parsedPrice === null || Number.isNaN(parsedPrice)) return false;

  return window.setTrackerAuthoritativePrice(englishName, parsedPrice, {
    allowZeroOverride: false,
  });
}

function syncProfessionAuthorityPricesFromMaterials() {
  const rows = Array.from(
    document.querySelectorAll?.("#prof-material-rows .prof-material-row") || []
  );
  let changed = false;
  rows.forEach((row) => {
    changed = syncProfessionAuthorityPriceForRow(row) || changed;
  });
  return changed;
}

function applyProfessionMaterialPriceSource(row, matchedItem, options = {}) {
  const priceInput = row?.querySelector(".prof-material-price");
  if (!priceInput || !matchedItem?.name) return;

  const authorityPrice = getProfessionAuthorityPrice(matchedItem.name);
  const currentValue = String(priceInput.value || "").trim();
  const nextPrice =
    options.priceSource === "authority"
      ? authorityPrice
      : options.priceSource === "preserve"
        ? currentValue
        : currentValue;

  if (options.priceSource === "authority") {
    priceInput.value = authorityPrice > 0 ? String(authorityPrice) : currentValue;
    priceInput.dataset.prevCommittedValue = priceInput.value;
    return;
  }

  if (!currentValue && authorityPrice > 0 && options.fillIfEmpty !== false) {
    priceInput.value = String(authorityPrice);
    priceInput.dataset.prevCommittedValue = priceInput.value;
    return;
  }

  if (nextPrice !== currentValue) {
    priceInput.value = String(nextPrice || "");
    priceInput.dataset.prevCommittedValue = priceInput.value;
  }
}

function syncProfessionMaterialRow(row, options = {}) {
  const input = row?.querySelector(".prof-material-name");
  const icon = row?.querySelector(".prof-material-icon");
  const iconWrap = row?.querySelector(".prof-material-icon-wrap");
  if (!row || !input || !icon || !iconWrap) return;

  const rawValue = input.value.trim();
  const storedEnglishName = String(input.dataset.englishName || "").trim();
  if (!rawValue) {
    input.dataset.englishName = "";
    input.dataset.displayName = "";
    input.dataset.chineseName = "";
    input.title = "";
    icon.src = getProfessionMaterialIconPath(null);
    iconWrap.classList.add("is-empty");
    syncProfessionMaterialRarity(row, null);
    row.classList.remove("is-invalid");
    return;
  }

  const matchedItem =
    typeof window.findTrackerCatalogItem === "function"
      ? window.findTrackerCatalogItem(rawValue)
      : null;

  if (matchedItem) {
    const displayName = matchedItem.displayName || matchedItem.name;
    const chineseName =
      typeof window.getPrimaryChineseLabel === "function"
        ? window.getPrimaryChineseLabel(matchedItem.name)
        : "";
    input.value = displayName;
    input.dataset.englishName = matchedItem.name;
    input.dataset.displayName = displayName;
    input.dataset.chineseName = chineseName;
    input.title = displayName;
    icon.src = getProfessionMaterialIconPath(matchedItem);
    icon.style.display = "";
    iconWrap.classList.remove("is-empty");
    syncProfessionMaterialRarity(row, matchedItem);
    applyProfessionMaterialPriceSource(row, matchedItem, {
      priceSource: options.priceSource || "authority",
      fillIfEmpty: options.fillIfEmpty,
    });
    syncProfessionAuthorityPriceForRow(row);
    row.classList.remove("is-invalid");
    return;
  }

  if (storedEnglishName && typeof window.findTrackerCatalogItem !== "function") {
    input.dataset.displayName = rawValue;
    input.title = rawValue;
    icon.src = getProfessionStoredMaterialIconPath(storedEnglishName);
    icon.style.display = "";
    iconWrap.classList.remove("is-empty");
    syncProfessionMaterialRarity(row, null);
    row.classList.remove("is-invalid");
    return;
  }

  input.dataset.englishName = "";
  input.dataset.displayName = rawValue;
  input.dataset.chineseName = "";
  input.title = rawValue;
  icon.src = getProfessionMaterialIconPath(null);
  icon.style.display = "";
  iconWrap.classList.add("is-empty");
  syncProfessionMaterialRarity(row, null);
  row.classList.toggle("is-invalid", !options.silent);
}

function refreshProfessionMaterialCatalogBindings() {
  const rows = Array.from(
    document.querySelectorAll?.("#prof-material-rows .prof-material-row") || []
  );
  rows.forEach((row) => {
    syncProfessionMaterialRow(row, { silent: true });
  });
  saveProfessionCalculatorState();
  runProfessionCalculationIfEnabled();
}

function readProfessionMaterialRow(row, index) {
  const input = row?.querySelector(".prof-material-name");
  const defaultName = row?.dataset.defaultName || `材料${index + 1}`;
  const rawInput = String(input?.value || "").trim();
  const englishName = String(input?.dataset.englishName || "").trim();
  const displayName = String(input?.dataset.displayName || rawInput || "").trim();
  const chineseName = String(input?.dataset.chineseName || "").trim();

  if (!rawInput && !englishName && !displayName) {
    return {
      name: "",
      englishName: "",
      displayName: "",
      chineseName: "",
      rawInput: "",
    };
  }

  return {
    name: englishName || defaultName,
    englishName,
    displayName: displayName || defaultName,
    chineseName,
    rawInput,
  };
}

function shouldAskProfessionImportPriceChoice(materials) {
  return materials.some((material) => {
    const englishName = String(material?.englishName || "").trim();
    if (!englishName) return false;
    const localPrice = getProfessionAuthorityPrice(englishName);
    const importedPrice = Math.max(
      0,
      parseProfessionRoundedInteger(material?.price, 0) || 0
    );
    return localPrice > 0 && importedPrice > 0 && localPrice !== importedPrice;
  });
}

function resolveProfessionImportMaterialPrices(materials, priceMode = "local") {
  return materials.map((material) => {
    const englishName = String(material?.englishName || "").trim();
    const localPrice = englishName ? getProfessionAuthorityPrice(englishName) : 0;
    const importedPrice = Math.max(
      0,
      parseProfessionRoundedInteger(material?.price, 0) || 0
    );

    let nextPrice = importedPrice;
    if (priceMode === "local") {
      nextPrice = localPrice > 0 ? localPrice : importedPrice;
    } else if (priceMode === "file") {
      nextPrice = importedPrice > 0 ? importedPrice : localPrice;
    }

    return {
      ...material,
      price: String(nextPrice > 0 ? nextPrice : ""),
    };
  });
}

function buildProfessionTransferPayload() {
  const state = getProfessionCalculatorState();
  const materials = state.materials.map((material, index) => ({
    name: material.displayName || material.name || "",
    englishName: material.englishName || "",
    chineseName: material.chineseName || "",
    qty:
      material.qty === undefined || material.qty === null || String(material.qty).trim() === ""
        ? ""
        : String(parseInt(material.qty, 10) || 1),
    price:
      material.price === undefined || material.price === null || String(material.price).trim() === ""
        ? ""
        : String(parseInt(material.price, 10) || 0),
  }));

  return {
    schema: PROFESSION_TRANSFER_SCHEMA,
    version: PROFESSION_TRANSFER_VERSION,
    source: "profession-recipe",
    exportedAt: new Date().toISOString(),
    output: {
      name: state.outputName,
      qty: String(parseInt(state.outputQty, 10) || 1),
      price: String(parseInt(state.outputPrice, 10) || 0),
    },
    materials,
    recipe: {
      output: {
        name: state.outputName,
        qty: String(parseInt(state.outputQty, 10) || 1),
        price: String(parseInt(state.outputPrice, 10) || 0),
      },
      materials,
    },
  };
}

function sendProfessionMaterialsToTracker() {
  syncProfessionAuthorityPricesFromMaterials();
  const snapshot = getProfessionCalculationSnapshot();
  if (snapshot.error) {
    alert(snapshot.error);
    return;
  }

  const craftsMultiplier = Math.max(0, snapshot.craftsNeeded || 0);
  const items = snapshot.materials
    .filter((material) => material.englishName)
    .map((material) => ({
      englishName: material.englishName,
      chineseName: material.chineseName,
      displayName: material.displayName,
      target: Math.max(0, (material.qty || 1) * craftsMultiplier),
      price: Math.max(0, material.price || 0),
    }));

  if (items.length === 0) {
    alert("没有可推送到追踪器的原材料。");
    return;
  }

  if (typeof window.mergeTrackerTransferItems !== "function") {
    alert("追踪器尚未初始化。");
    return;
  }
  const { addedCount, updatedCount, skippedCount } =
    window.mergeTrackerTransferItems(items, { priceMode: "keep" });
  const summary = `追踪器已同步：新增 ${addedCount}，更新 ${updatedCount}，跳过 ${skippedCount}。`;
  if (typeof window.showTrackerNotification === "function") {
    window.showTrackerNotification(null, summary, "custom");
  } else {
    alert(summary);
  }
}

function parseProfessionImportPayload(parsed) {
  if (parsed?.type === "wakfu-profession-calc" && parsed?.data) {
    return parsed.data;
  }

  const materialData =
    (Array.isArray(parsed?.materials) && parsed.materials) ||
    (Array.isArray(parsed?.recipe?.materials) && parsed.recipe.materials) ||
    (Array.isArray(parsed?.data?.materials) && parsed.data.materials);

  if (materialData || parsed?.output || parsed?.recipe?.output) {
    return {
      ...DEFAULT_PROF_CALC_STATE,
      mode: currentProfCalcMode,
      autoCalculate: professionCalcAutoCalculate,
      outputName:
        parsed?.output?.name ??
        parsed?.recipe?.output?.name ??
        DEFAULT_PROF_CALC_STATE.outputName,
      outputQty:
        parsed?.output?.qty ??
        parsed?.recipe?.output?.qty ??
        DEFAULT_PROF_CALC_STATE.outputQty,
      outputPrice:
        parsed?.output?.price ??
        parsed?.recipe?.output?.price ??
        DEFAULT_PROF_CALC_STATE.outputPrice,
      materials: materialData || [],
    };
  }

  const trackerItems = Array.isArray(parsed?.items)
    ? parsed.items
    : Array.isArray(parsed)
      ? parsed
      : null;

  if (trackerItems) {
    return {
      ...DEFAULT_PROF_CALC_STATE,
      mode: currentProfCalcMode,
      autoCalculate: professionCalcAutoCalculate,
      materials: trackerItems.map((item, index) => {
        const lookupName =
          item?.englishName || item?.displayName || item?.name || item?.chineseName || "";
        const catalogItem =
          typeof window.findTrackerCatalogItem === "function"
            ? window.findTrackerCatalogItem(lookupName)
            : null;
        const qty = item?.target ?? item?.qty ?? item?.count ?? item?.current ?? "";
        return {
          name: catalogItem?.name || `材料${index + 1}`,
          englishName: catalogItem?.name || "",
          displayName:
            catalogItem?.displayName ||
            item?.name ||
            item?.displayName ||
            `材料${index + 1}`,
          chineseName:
            item?.chineseName ||
            (catalogItem && typeof window.getPrimaryChineseLabel === "function"
              ? window.getPrimaryChineseLabel(catalogItem.name)
              : ""),
          qty: String(qty ?? ""),
          price: String(item?.price ?? ""),
        };
      }),
    };
  }

  return parsed;
}

function resetProfessionCalculationResult() {
  const resultContainer = document.getElementById("profession-results-list");
  if (!resultContainer) return;
  resultContainer.innerHTML =
    '<div class="empty-state" style="font-size: 0.9em; padding: 20px">先选择计算模式。</div>';
}

function setInputValue(id, value) {
  const input = document.getElementById(id);
  if (input) input.value = value;
}

function parseInteger(id) {
  const value = document.getElementById(id)?.value;
  return parseInt(value, 10);
}

function parseOptionalFloat(id, fallback = null) {
  const value = document.getElementById(id)?.value;
  if (value === undefined || value === null || String(value).trim() === "") {
    return fallback;
  }
  const parsed = parseFloat(value);
  return Number.isNaN(parsed) ? fallback : parsed;
}

function parseOptionalInteger(id, fallback = null) {
  const value = document.getElementById(id)?.value;
  if (value === undefined || value === null || String(value).trim() === "") {
    return fallback;
  }
  const parsed = parseProfessionRoundedInteger(value, fallback);
  return parsed === null || Number.isNaN(parsed) ? fallback : parsed;
}

function finalizeProfessionExpressionInput(input) {
  if (!input) return;
  const rawValue = String(input.value ?? "");
  const trimmedValue = rawValue.trim();
  const previousValue = input.dataset.prevCommittedValue ?? "";

  if (!trimmedValue) {
    input.value = "";
    input.dataset.prevCommittedValue = "";
    if (input.classList.contains("prof-material-price")) {
      const row = input.closest(".prof-material-row");
      if (row) syncProfessionAuthorityPriceForRow(row);
    }
    saveProfessionCalculatorState();
    runProfessionCalculationIfEnabled();
    return;
  }

  const parsedValue = parseProfessionRoundedInteger(trimmedValue, null);
  if (parsedValue === null || Number.isNaN(parsedValue)) {
    input.value = previousValue;
    input.dataset.prevCommittedValue = previousValue;
  } else {
    input.value = String(parsedValue);
    input.dataset.prevCommittedValue = input.value;
  }

  if (input.classList.contains("prof-material-price")) {
    const row = input.closest(".prof-material-row");
    if (row) syncProfessionAuthorityPriceForRow(row);
  }

  saveProfessionCalculatorState();
  runProfessionCalculationIfEnabled();
}

function parseProfessionRoundedInteger(value, fallback = null) {
  if (value === undefined || value === null) return fallback;
  const normalized = normalizeProfessionMathExpression(String(value));
  if (!normalized) return fallback;
  if (!/^[\d+\-*/().\s^]*$/.test(normalized)) return fallback;

  const jsExpression = normalized.replace(/\^/g, "**");
  try {
    const result = Function(`"use strict"; return (${jsExpression});`)();
    if (!Number.isFinite(result)) return fallback;
    return Math.max(0, Math.round(result));
  } catch {
    return fallback;
  }
}

function normalizeProfessionMathExpression(value) {
  return String(value)
    .trim()
    .replace(/[（﹙｟❨❪❬❮❰〔【［｛〈《「『]/g, "(")
    .replace(/[）﹚｠❩❫❭❯❱〕】］｝〉》」』]/g, ")")
    .replace(/[xX×＊*]/g, "*")
    .replace(/[／÷]/g, "/")
    .replace(/[＋]/g, "+")
    .replace(/[－—–]/g, "-")
    .replace(/[，]/g, ".")
    .replace(/\s+/g, " ");
}

function formatNumber(value) {
  return Number(value || 0).toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

function renderRecipeDetailChunks(chunks) {
  return chunks
    .filter(Boolean)
    .map((chunk) => `<span class="recipe-detail-chunk">${String(chunk)}</span>`)
    .join('<span class="recipe-detail-separator">·</span>');
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeHtmlAttribute(value) {
  return escapeHtml(value).replace(/`/g, "&#96;");
}

window.openProfessionTransferModal = openProfessionTransferModal;
window.closeProfessionTransferModal = closeProfessionTransferModal;
window.copyProfessionTransferText = copyProfessionTransferText;
window.applyProfessionImport = applyProfessionImport;
window.refreshProfessionMaterialCatalogBindings = refreshProfessionMaterialCatalogBindings;
