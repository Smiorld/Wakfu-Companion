document.addEventListener("DOMContentLoaded", () => {
  initializeProfessionCalculator();
});

const PROFESSION_LEVEL_XP_STEP = 150;
const PROF_CALC_MODE_EXPERIENCE = "experience";
const PROF_CALC_MODE_MANUAL = "manual";
const PROF_CALC_STORAGE_KEY = "wakfu_prof_calc_state_v2";
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
    { name: "材料1", qty: "", price: "" },
    { name: "材料2", qty: "", price: "" },
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
          <span>原材料</span>
          <span>个数</span>
          <span>单价</span>
        </div>
        <button type="button" id="prof-add-material-btn" class="prof-add-btn prof-material-header-btn">+</button>
      </div>
      <div id="prof-material-rows" class="prof-material-rows"></div>
      <div class="prof-output-builder">
        <div class="prof-form-row-header">
          <span>产物</span>
          <span>个数</span>
          <span>单价</span>
        </div>
        <div class="prof-output-row">
          <input type="text" id="prof-output-name" class="prof-level-input prof-output-name" value="产物" />
          <input type="number" id="prof-output-qty" class="prof-level-input prof-output-qty" min="0" step="1" placeholder="默认 1" />
          <input type="number" id="prof-output-price" class="prof-level-input prof-output-price" min="0" step="0.01" placeholder="默认 0" />
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
      ? Array.from(
          root.querySelectorAll(
            ".prof-level-input, #prof-output-name"
          )
        )
      : [];

  inputs.forEach((input) => {
    if (input.dataset.profCalcBound === "true") return;
    input.dataset.profCalcBound = "true";

    const handler = () => {
      saveProfessionCalculatorState();
      runProfessionCalculationIfEnabled();
    };

    input.addEventListener("input", handler);
    input.addEventListener("change", handler);
  });
}

function applyProfessionCalcMode() {
  const experienceFields = Array.from(
    document.querySelectorAll?.(".prof-mode-experience") || []
  );
  const manualFields = Array.from(
    document.querySelectorAll?.(".prof-mode-manual") || []
  );
  const buttons = Array.from(
    document.querySelectorAll?.(".prof-mode-btn") || []
  );
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

function renderProfessionCalculationResult() {
  const resultContainer = document.getElementById("profession-results-list");
  if (!resultContainer) return;

  const currentLevel = parseInteger("prof-current-lvl");
  const currentLevelExp = parseInteger("prof-base-exp");
  const targetLevel = parseInteger("prof-target-lvl");
  const craftXp = parseOptionalFloat("prof-craft-xp");
  const manualCraftCount = parseOptionalInteger("prof-craft-count");
  const outputName = (
    document.getElementById("prof-output-name")?.value || "产物"
  ).trim() || "产物";
  const outputQty = parseOptionalInteger("prof-output-qty", 1);
  const outputPrice = parseOptionalFloat("prof-output-price", 0);

  let craftsNeeded = 0;
  let totalXpNeeded = null;

  if (currentProfCalcMode === PROF_CALC_MODE_MANUAL) {
    if (manualCraftCount === null || manualCraftCount < 0) {
      resultContainer.innerHTML =
        '<div class="empty-state">请填写不小于 0 的生产个数。</div>';
      return;
    }
    craftsNeeded = manualCraftCount;
  } else {
    if (
      Number.isNaN(currentLevel) ||
      Number.isNaN(currentLevelExp) ||
      Number.isNaN(targetLevel) ||
      craftXp === null
    ) {
      resultContainer.innerHTML =
        '<div class="empty-state">请完整填写等级、经验与单次制作经验。</div>';
      return;
    }

    if (currentLevel >= targetLevel) {
      resultContainer.innerHTML =
        '<div class="empty-state">目标等级必须高于当前等级。</div>';
      return;
    }

    if (craftXp <= 0) {
      resultContainer.innerHTML =
        '<div class="empty-state">单次制作经验必须大于 0。</div>';
      return;
    }

    const ranges = getGenericProfessionRanges();
    const currentRange = ranges.find(
      (range) => currentLevel >= range.min && currentLevel < range.max
    );

    if (!currentRange) {
      resultContainer.innerHTML =
        '<div class="empty-state">当前等级超出可计算范围。</div>';
      return;
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
      resultContainer.innerHTML = `<div class="empty-state">当前级经验应在 0 到 ${
        currentLevelRequirement - 1
      } 之间。</div>`;
      return;
    }

    totalXpNeeded = -currentLevelExp;
    for (let level = currentLevel; level < targetLevel; level++) {
      const range = ranges.find(
        (entry) => level >= entry.min && level < entry.max
      );
      if (!range) {
        resultContainer.innerHTML =
          '<div class="empty-state">目标等级超出可计算范围。</div>';
        return;
      }
      totalXpNeeded += getLevelXpRequirement(level, range);
    }

    craftsNeeded = Math.ceil(totalXpNeeded / craftXp);
  }

  const materials = readProfessionMaterialRows();
  renderProfessionResults({
    resultContainer,
    totalXpNeeded,
    craftsNeeded,
    craftXp,
    outputName,
    outputQty,
    outputPrice,
    materials,
    isManualMode: currentProfCalcMode === PROF_CALC_MODE_MANUAL,
  });
}

function readProfessionMaterialRows() {
  const rows = Array.from(
    document.querySelectorAll?.("#prof-material-rows .prof-material-row") || []
  );

  return rows.map((row, index) => {
    const nameInput = row.querySelector(".prof-material-name");
    const qtyInput = row.querySelector(".prof-material-qty");
    const priceInput = row.querySelector(".prof-material-price");

    const rawName = nameInput?.value?.trim() || "";
    const qty = parseInt(qtyInput?.value || "", 10);
    const price = parseFloat(priceInput?.value || "");

    return {
      name: rawName || `材料${index + 1}`,
      qty: Number.isNaN(qty) ? 1 : qty,
      price: Number.isNaN(price) ? 0 : price,
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
                  <span class="prof-cost-name">${escapeHtml(material.name)}</span>
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

function addProfessionMaterialRow(name = "", qty = "", price = "") {
  const rowsContainer = document.getElementById("prof-material-rows");
  if (!rowsContainer) return;

  materialRowId += 1;
  const displayName = name || `材料${materialRowId}`;

  const row = document.createElement("div");
  row.className = "prof-material-row";
  row.dataset.rowId = String(materialRowId);
  row.innerHTML = `
    <input type="text" class="prof-level-input prof-material-name" value="${escapeHtmlAttribute(
      displayName
    )}" />
    <input type="number" class="prof-level-input prof-material-qty" min="0" step="1" placeholder="默认 1" value="${escapeHtmlAttribute(
      qty
    )}" />
    <input type="number" class="prof-level-input prof-material-price" min="0" step="0.01" placeholder="默认 0" value="${escapeHtmlAttribute(
      price
    )}" />
    <button type="button" class="prof-add-btn prof-remove-material-btn">-</button>
  `;

  rowsContainer.appendChild(row);
  bindProfessionCalculatorInputs(row);

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
    materials: materialRows.map((row, index) => ({
      name:
        row.querySelector(".prof-material-name")?.value || `材料${index + 1}`,
      qty: row.querySelector(".prof-material-qty")?.value || "",
      price: row.querySelector(".prof-material-price")?.value || "",
    })),
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
      addProfessionMaterialRow(material.name, material.qty, material.price);
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
    copyBtn: document.getElementById("prof-transfer-copy-btn"),
    applyBtn: document.getElementById("prof-transfer-apply-btn"),
  };
}

function openProfessionTransferModal(mode = "export") {
  professionTransferMode = mode === "import" ? "import" : "export";
  const { modal, title, note, text, copyBtn, applyBtn } = getProfessionTransferElements();
  if (!modal || !title || !note || !text || !copyBtn || !applyBtn) return;

  if (professionTransferMode === "import") {
    title.textContent = "生产计算导入";
    note.textContent =
      "把之前导出的生产计算文本粘贴到这里，导入后会覆盖当前原材料区、产物区以及相关计算设置。";
    text.value = "";
    text.readOnly = false;
    copyBtn.style.display = "none";
    applyBtn.style.display = "";
  } else {
    title.textContent = "生产计算导出";
    note.textContent =
      "导出完整生产计算状态，包含原材料区、产物区以及当前计算设置。";
    text.value = JSON.stringify(
      {
        version: 1,
        type: "wakfu-profession-calc",
        data: getProfessionCalculatorState(),
      },
      null,
      2
    );
    text.readOnly = true;
    copyBtn.style.display = "";
    applyBtn.style.display = "none";
    text.select();
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

function applyProfessionImport() {
  const { text } = getProfessionTransferElements();
  if (!text) return;

  try {
    const parsed = JSON.parse(text.value || "{}");
    const payload =
      parsed?.type === "wakfu-profession-calc" && parsed?.data
        ? parsed.data
        : parsed;
    applyProfessionCalculatorState(payload);
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
  const parsed = parseInt(value, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
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
    .map(
      (chunk) => `<span class="recipe-detail-chunk">${String(chunk)}</span>`
    )
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
