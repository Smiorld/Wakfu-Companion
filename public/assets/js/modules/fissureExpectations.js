const FISSURE_EXPECTATION_STATE_KEY = "wakfu_fissure_expectation_state_v1";
const FISSURE_EXPECTATION_PRICES_KEY = "wakfu_fissure_expectation_prices_v1";

const FISSURE_VIEW_MODES = Object.freeze({
  summary: "summary",
  table: "table",
});

const FISSURE_SORT_OPTIONS = Object.freeze({
  "fissure-asc": { type: "fissure", direction: 1 },
  "fissure-desc": { type: "fissure", direction: -1 },
  "expected-desc": { type: "expected", direction: -1 },
  "expected-asc": { type: "expected", direction: 1 },
});

const FISSURE_PARAM_LIMITS = Object.freeze({
  prospecting: { min: 0, max: 200 },
  wip: { min: 0, max: 1 },
  compressionLevel: { min: 20, max: 245 },
  killWaves: { min: 0, max: 999 },
});

let fissureRows = [];
let fissureGroups = [];
let fissureRowMap = new Map();
let fissureState = createDefaultFissureState();
let fissurePriceOverrides = {};
let activeFissureHoverGroupKey = "";

function getFissureDataset() {
  if (typeof FISSURE_EXPECTATION_DATA !== "undefined") {
    return FISSURE_EXPECTATION_DATA;
  }
  return window.FISSURE_EXPECTATION_DATA;
}

function createDefaultFissureState() {
  const defaults = getFissureDataset()?.defaults || {};
  return {
    viewMode: FISSURE_VIEW_MODES.summary,
    compareEnabled: false,
    sortKey: "fissure-asc",
    plans: {
      plan1: normalizeFissurePlanState(defaults.plan1, "plan1"),
      plan2: normalizeFissurePlanState(defaults.plan2, "plan2"),
    },
  };
}

function normalizeFissurePlanState(rawPlan = {}, planKey = "plan1") {
  const fallback =
    getFissureDataset()?.defaults?.[planKey] ||
    getFissureDataset()?.defaults?.plan1 || {
      prospecting: 0,
      wip: 1,
      compressionLevel: 155,
      killWaves: 20,
    };

  return {
    prospecting: clampInteger(rawPlan.prospecting, fallback.prospecting, FISSURE_PARAM_LIMITS.prospecting),
    wip: clampInteger(rawPlan.wip, fallback.wip, FISSURE_PARAM_LIMITS.wip),
    compressionLevel: normalizeCompressionLevel(rawPlan.compressionLevel ?? fallback.compressionLevel),
    killWaves: clampInteger(rawPlan.killWaves, fallback.killWaves, FISSURE_PARAM_LIMITS.killWaves),
  };
}

function clampInteger(value, fallback, limits = {}) {
  const parsed = parseFissureRoundedInteger(value, fallback);
  if (parsed === null || Number.isNaN(parsed)) return fallback;
  const min = Number.isFinite(limits.min) ? limits.min : parsed;
  const max = Number.isFinite(limits.max) ? limits.max : parsed;
  return Math.max(min, Math.min(max, parsed));
}

function normalizeCompressionLevel(value) {
  const dataset = getFissureDataset();
  const available = Array.isArray(dataset?.compressionLevels)
    ? dataset.compressionLevels
    : [];
  const parsed = parseFissureRoundedInteger(value, available[0] || 20);
  if (available.includes(parsed)) return parsed;
  return available.reduce((closest, level) => {
    if (closest === null) return level;
    return Math.abs(level - parsed) < Math.abs(closest - parsed) ? level : closest;
  }, available[0] || 20);
}

function normalizeFissureMathExpression(value) {
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

function parseFissureRoundedInteger(value, fallback = null) {
  if (value === undefined || value === null) return fallback;
  const normalized = normalizeFissureMathExpression(String(value));
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

function initializeFissureExpectationData() {
  const dataset = getFissureDataset();
  if (!dataset || !Array.isArray(dataset.rows)) return false;

  fissureRows = dataset.rows.map((row) => ({
    ...row,
    fissureLabel: String(row.fissureLabel || row.fissureKey || ""),
    rowKey: String(row.rowKey || ""),
  }));

  fissureRowMap = new Map(fissureRows.map((row) => [row.rowKey, row]));

  const groupMap = new Map();
  fissureRows.forEach((row) => {
    if (!groupMap.has(row.fissureKey)) {
      groupMap.set(row.fissureKey, {
        fissureKey: row.fissureKey,
        fissureLabel: row.fissureLabel,
        fissureSortKey: Number(row.fissureSortKey || 0),
        isUltimate: Boolean(row.isUltimate),
        rows: [],
      });
    }
    groupMap.get(row.fissureKey).rows.push(row);
  });

  fissureGroups = [...groupMap.values()]
    .map((group) => ({
      ...group,
      rows: group.rows.sort((a, b) => Number(a.groupIndex || 0) - Number(b.groupIndex || 0)),
    }))
    .sort((a, b) => a.fissureSortKey - b.fissureSortKey);

  return true;
}

function loadFissureExpectationState() {
  const defaults = createDefaultFissureState();
  try {
    const parsed = JSON.parse(localStorage.getItem(FISSURE_EXPECTATION_STATE_KEY) || "{}");
    fissureState = {
      viewMode:
        parsed.viewMode === FISSURE_VIEW_MODES.table ? FISSURE_VIEW_MODES.table : FISSURE_VIEW_MODES.summary,
      compareEnabled: parsed.compareEnabled === true,
      sortKey: Object.prototype.hasOwnProperty.call(FISSURE_SORT_OPTIONS, parsed.sortKey)
        ? parsed.sortKey
        : defaults.sortKey,
      plans: {
        plan1: normalizeFissurePlanState(parsed.plans?.plan1, "plan1"),
        plan2: normalizeFissurePlanState(parsed.plans?.plan2, "plan2"),
      },
    };
  } catch {
    fissureState = defaults;
  }
}

function saveFissureExpectationState() {
  localStorage.setItem(FISSURE_EXPECTATION_STATE_KEY, JSON.stringify(fissureState));
}

function loadFissurePriceOverrides() {
  try {
    const parsed = JSON.parse(localStorage.getItem(FISSURE_EXPECTATION_PRICES_KEY) || "{}");
    fissurePriceOverrides =
      parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    fissurePriceOverrides = {};
  }
}

function saveFissurePriceOverrides() {
  localStorage.setItem(FISSURE_EXPECTATION_PRICES_KEY, JSON.stringify(fissurePriceOverrides));
}

function getFissureDefaultPrice(row, tier) {
  return Number(row?.prices?.[tier] ?? 0) || 0;
}

function isFissurePriceLocked(row, tier) {
  return getFissureDefaultPrice(row, tier) === 0;
}

function getFissureOverridePrice(rowKey, tier) {
  const rowOverrides = fissurePriceOverrides[String(rowKey || "")];
  if (!rowOverrides || typeof rowOverrides !== "object") return null;
  if (!Object.prototype.hasOwnProperty.call(rowOverrides, tier)) return null;
  const parsed = parseFissureRoundedInteger(rowOverrides[tier], null);
  return parsed === null || Number.isNaN(parsed) ? null : parsed;
}

function getFissureEffectivePrice(row, tier) {
  if (isFissurePriceLocked(row, tier)) return 0;
  const override = getFissureOverridePrice(row.rowKey, tier);
  return override === null ? getFissureDefaultPrice(row, tier) : override;
}

function setFissureEffectivePrice(rowKey, tier, nextValue) {
  const row = fissureRowMap.get(String(rowKey || ""));
  if (!row || isFissurePriceLocked(row, tier)) return false;
  const parsed = parseFissureRoundedInteger(nextValue, null);
  if (parsed === null || Number.isNaN(parsed)) return false;

  const key = String(rowKey);
  const defaultPrice = getFissureDefaultPrice(row, tier);
  if (!fissurePriceOverrides[key]) {
    fissurePriceOverrides[key] = {};
  }

  if (parsed === defaultPrice) {
    delete fissurePriceOverrides[key][tier];
    if (Object.keys(fissurePriceOverrides[key]).length === 0) {
      delete fissurePriceOverrides[key];
    }
  } else {
    fissurePriceOverrides[key][tier] = parsed;
  }

  saveFissurePriceOverrides();
  return true;
}

function resetFissurePriceOverrides() {
  fissurePriceOverrides = {};
  saveFissurePriceOverrides();
}

function getFissureStartWave(group, compressionLevel) {
  const cells = getFissureDataset()?.startWaves?.[group.fissureLabel];
  if (!cells) return null;
  const cell = cells[String(compressionLevel)];
  return cell && Number.isFinite(Number(cell.value)) ? Number(cell.value) : null;
}

function getFissureDropRate(group, tier) {
  const rates = getFissureDataset()?.dropRates?.[group.fissureLabel];
  const value = Number(rates?.[tier] ?? 0);
  return Number.isFinite(value) ? value : 0;
}

function calculateFissureRowExpectation(row, group, plan) {
  const startWave = getFissureStartWave(group, plan.compressionLevel);
  if (startWave === null) {
    return {
      available: false,
      total: 0,
      tiers: {},
      startWave: null,
    };
  }

  const coeff = group.isUltimate ? 2 : 4;
  const growthFactor = group.isUltimate ? 0.18 : 0.08;
  const commonMultiplier =
    plan.killWaves *
    coeff *
    (1 + plan.prospecting / 100 + 0.5 * plan.wip) *
    (1 + (startWave + plan.killWaves) * growthFactor);

  const tiers = {};
  let total = 0;
  ["1", "2", "3"].forEach((tier) => {
    const dropRate = getFissureDropRate(group, tier);
    const price = getFissureEffectivePrice(row, tier);
    const runExpectation = dropRate * commonMultiplier;
    const expectedValue = price * runExpectation;
    total += expectedValue;
    tiers[tier] = {
      tier,
      price,
      dropRate,
      runExpectation,
      expectedValue,
      averageRuns:
        runExpectation > 0 && price > 0 ? 1 / runExpectation : runExpectation > 0 ? 1 / runExpectation : null,
      locked: isFissurePriceLocked(row, tier),
    };
  });

  return {
    available: true,
    total,
    tiers,
    startWave,
  };
}

function buildFissureGroupSummary(group, plan) {
  const rows = group.rows.map((row) => {
    const calculated = calculateFissureRowExpectation(row, group, plan);
    return {
      row,
      ...calculated,
    };
  });

  const available = rows.some((row) => row.available);
  const totalExpected = rows.reduce((sum, row) => sum + row.total, 0);
  const startWave = getFissureStartWave(group, plan.compressionLevel);

  return {
    ...group,
    available,
    totalExpected,
    startWave,
    rows,
  };
}

function getSortedFissureSummaries(plan) {
  const summaries = fissureGroups
    .map((group) => buildFissureGroupSummary(group, plan))
    .filter((summary) => summary.available);

  const sorter = FISSURE_SORT_OPTIONS[fissureState.sortKey] || FISSURE_SORT_OPTIONS["fissure-asc"];
  summaries.sort((a, b) => {
    if (sorter.type === "expected") {
      if (a.totalExpected === b.totalExpected) {
        return a.fissureSortKey - b.fissureSortKey;
      }
      return sorter.direction * (a.totalExpected - b.totalExpected);
    }
    return sorter.direction * (a.fissureSortKey - b.fissureSortKey);
  });
  return summaries;
}

function formatFissureNumber(value, digits = 0) {
  const numeric = Number(value || 0);
  return new Intl.NumberFormat("zh-CN", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(numeric);
}

function formatFissureExpectedValue(value) {
  return `${formatFissureNumber(value, 0)} ₭`;
}

function formatFissureRuns(value) {
  if (!Number.isFinite(value) || value <= 0) return "无";
  if (value >= 1000) return `平均${formatFissureNumber(value, 0)}把/张`;
  if (value >= 100) return `平均${formatFissureNumber(value, 1)}把/张`;
  return `平均${formatFissureNumber(value, 2)}把/张`;
}

function getFissurePriceBandClass(price, locked = false) {
  if (locked || !Number.isFinite(Number(price)) || Number(price) <= 0) {
    return "is-locked";
  }
  const value = Number(price);
  if (value <= 10000) return "is-band-1";
  if (value <= 100000) return "is-band-2";
  if (value <= 500000) return "is-band-3";
  return "is-band-4";
}

function escapeFissureHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderFissureExpectationModal() {
  const results = document.getElementById("fissure-results");
  const parameterGrid = document.getElementById("fissure-parameter-grid");
  const sortSelect = document.getElementById("fissure-sort-select");
  const summaryBtn = document.getElementById("fissure-mode-summary-btn");
  const tableBtn = document.getElementById("fissure-mode-table-btn");
  const compareBtn = document.getElementById("fissure-compare-btn");
  const importBtn = document.getElementById("fissure-import-btn");
  const exportBtn = document.getElementById("fissure-export-btn");
  const resetBtn = document.getElementById("fissure-reset-btn");
  if (!results || !parameterGrid || !sortSelect || !summaryBtn || !tableBtn || !compareBtn || !importBtn || !exportBtn || !resetBtn) return;

  sortSelect.value = fissureState.sortKey;
  summaryBtn.classList.toggle("is-active", fissureState.viewMode === FISSURE_VIEW_MODES.summary && !fissureState.compareEnabled);
  tableBtn.classList.toggle("is-active", fissureState.viewMode === FISSURE_VIEW_MODES.table && !fissureState.compareEnabled);
  compareBtn.classList.toggle("is-active", fissureState.compareEnabled);
  compareBtn.textContent = fissureState.compareEnabled ? "退出比对" : "比对";
  tableBtn.disabled = fissureState.compareEnabled;
  const showInlineTableActions =
    !fissureState.compareEnabled && fissureState.viewMode === FISSURE_VIEW_MODES.table;
  importBtn.style.display = "none";
  exportBtn.style.display = "none";
  resetBtn.style.display = "none";

  parameterGrid.className = fissureState.compareEnabled
    ? "fissure-parameter-grid fissure-parameter-grid-compare"
    : "fissure-parameter-grid";
  parameterGrid.innerHTML = fissureState.compareEnabled
    ? `
      ${renderFissurePlanCard("plan1", "方案1参数", fissureState.plans.plan1)}
      ${renderFissurePlanCard("plan2", "方案2参数", fissureState.plans.plan2)}
    `
    : renderFissureSinglePanel(showInlineTableActions);

  bindFissureParameterEvents(parameterGrid);
  bindFissureInlineTableActions(parameterGrid);

  if (fissureState.compareEnabled) {
    results.innerHTML = renderFissureCompareLayout();
  } else if (fissureState.viewMode === FISSURE_VIEW_MODES.table) {
    results.innerHTML = renderFissureTableLayout();
    bindFissureTableEvents(results);
  } else {
    results.innerHTML = renderFissureSummaryLayout(fissureState.plans.plan1, "");
  }

  bindFissureSummaryHover(results);
  if (fissureState.viewMode !== FISSURE_VIEW_MODES.summary && !fissureState.compareEnabled) {
    hideFissureHoverPreview();
  }
}

function renderFissureSinglePanel(showInlineTableActions) {
  if (!showInlineTableActions) {
    return renderFissurePlanCard("plan1", "参数", fissureState.plans.plan1);
  }

  return `
    <div class="fissure-single-parameter-row">
      ${renderFissurePlanCard("plan1", "参数", fissureState.plans.plan1)}
      <div class="fissure-table-inline-actions">
        <button class="tracker-action-btn fissure-inline-btn" type="button" data-fissure-inline-action="import">导入</button>
        <button class="tracker-action-btn fissure-inline-btn" type="button" data-fissure-inline-action="export">导出</button>
        <button class="tracker-action-btn fissure-inline-btn" type="button" data-fissure-inline-action="reset">重置价格</button>
      </div>
    </div>
  `;
}

function renderFissurePlanCard(planKey, title, plan) {
  const options = (getFissureDataset()?.compressionLevels || [])
    .map(
      (level) =>
        `<option value="${level}"${level === plan.compressionLevel ? " selected" : ""}>${level}</option>`
    )
    .join("");

  return `
    <section class="fissure-plan-card" data-plan-key="${planKey}">
      <div class="fissure-plan-card-header">
        <div class="fissure-plan-title">${title}</div>
        <div class="fissure-plan-subtitle">参数修改后立即刷新结果</div>
      </div>
      <div class="fissure-plan-fields">
        <label class="fissure-plan-field">
          <span>勘探(0-200)</span>
          <input class="fissure-param-input" inputmode="numeric" pattern="[0-9]*" data-plan-key="${planKey}" data-param-key="prospecting" value="${plan.prospecting}" />
        </label>
        <label class="fissure-plan-field fissure-plan-field-wip">
          <span>WIP</span>
          <div class="fissure-wip-switch${plan.wip === 1 ? " is-on" : ""}" data-plan-key="${planKey}" role="switch" aria-checked="${plan.wip === 1 ? "true" : "false"}" tabindex="0">
            <span class="fissure-wip-switch-track">
              <span class="fissure-wip-switch-thumb"></span>
            </span>
          </div>
        </label>
        <label class="fissure-plan-field fissure-plan-field-compression">
          <span>压级等级</span>
          <select class="translation-select fissure-param-select" data-plan-key="${planKey}" data-param-key="compressionLevel">${options}</select>
        </label>
        <label class="fissure-plan-field">
          <span>击杀波数</span>
          <input class="fissure-param-input" inputmode="numeric" pattern="[0-9]*" data-plan-key="${planKey}" data-param-key="killWaves" value="${plan.killWaves}" />
        </label>
      </div>
    </section>
  `;
}

function renderFissureSummaryLayout(plan, planLabel) {
  const summaries = getSortedFissureSummaries(plan);
  if (!summaries.length) {
    return `<div class="daily-forecast-status">当前压级等级下没有可刷裂缝。</div>`;
  }

  const cards = summaries.map((summary) => renderFissureSummaryCard(summary)).join("");
  return `
    <div class="fissure-summary-shell">
      <div class="fissure-summary-header">
        <div class="fissure-summary-title">${planLabel ? `${planLabel}裂缝汇总` : "裂缝汇总"}</div>
        <div class="fissure-summary-meta">压级 ${plan.compressionLevel} / 击杀 ${plan.killWaves} 波</div>
      </div>
      <div class="fissure-summary-list">${cards}</div>
    </div>
  `;
}

function renderFissureSummaryCard(summary) {
  return `
    <article class="daily-forecast-item fissure-summary-card" data-fissure-detail-key="${escapeFissureHtml(summary.fissureKey)}">
      <span class="daily-forecast-item-badge fissure-summary-badge ${getFissureBadgeClass(summary)}">${getFissureBadgeLabel(summary)}</span>
      <div class="fissure-summary-body">
        <div class="fissure-summary-topline">
          <div class="fissure-summary-name">裂缝 ${escapeFissureHtml(summary.fissureLabel)}</div>
          <div class="fissure-summary-value">${formatFissureExpectedValue(summary.totalExpected)}</div>
        </div>
        <div class="fissure-summary-subline">
          <span>起始波数 ${summary.startWave ?? "无"}</span>
          <span>${summary.rows.length} 条升华</span>
          <span>悬停查看明细</span>
        </div>
      </div>
    </article>
  `;
}

function getFissureBadgeLabel(summary) {
  return summary.isUltimate ? "终极裂缝" : "普通裂缝";
}

function getFissureBadgeClass(summary) {
  return summary.isUltimate ? "ultimate" : "normal";
}

function renderFissureDetailPanel(summary) {
  if (!summary) {
    return `<div class="daily-forecast-status">把鼠标移动到右侧裂缝卡片上查看升华明细。</div>`;
  }

  const details = summary.rows.map((rowSummary) => renderFissureDetailRow(rowSummary)).join("");
  return `
    <div class="fissure-detail-panel-card">
      <div class="fissure-detail-panel-header">
        <span class="daily-forecast-item-badge fissure-summary-badge ${getFissureBadgeClass(summary)}">${getFissureBadgeLabel(summary)}</span>
        <div class="fissure-detail-panel-title-wrap">
          <div class="fissure-detail-popover-title">裂缝 ${escapeFissureHtml(summary.fissureLabel)} 明细</div>
          <div class="fissure-summary-meta">起始波数 ${summary.startWave ?? "无"} / ${summary.rows.length} 条升华 / 总期望 ${formatFissureExpectedValue(summary.totalExpected)}</div>
        </div>
      </div>
      <div class="fissure-detail-table">
        <div class="fissure-detail-head">
          <span>升华</span>
          <span>1级</span>
          <span>2级</span>
          <span>3级</span>
        </div>
        ${details}
      </div>
    </div>
  `;
}

function renderFissureDetailRow(rowSummary) {
  const tierHtml = ["1", "2", "3"]
    .map((tier) => {
      const data = rowSummary.tiers[tier];
      const priceText = data.locked ? "无" : formatFissureNumber(data.price, 0);
      const runsText = data.locked ? "无" : formatFissureRuns(data.averageRuns);
      const expectedText = data.locked ? "无" : `期望 ${formatFissureExpectedValue(data.expectedValue)}`;
      return `
        <div class="fissure-tier-card ${getFissurePriceBandClass(data.price, data.locked)}">
          <div class="fissure-tier-price">${priceText}</div>
          <div class="fissure-tier-meta">${runsText}</div>
          <div class="fissure-tier-meta">${expectedText}</div>
        </div>
      `;
    })
    .join("");

  return `
    <div class="fissure-detail-row">
      <div class="fissure-detail-sublimation">${escapeFissureHtml(rowSummary.row.sublimation)}</div>
      ${tierHtml}
    </div>
  `;
}

function renderFissureCompareLayout() {
  return `
    <div class="fissure-compare-layout">
      <div class="fissure-compare-column">${renderFissureSummaryLayout(fissureState.plans.plan1, "方案1")}</div>
      <div class="fissure-compare-column">${renderFissureSummaryLayout(fissureState.plans.plan2, "方案2")}</div>
    </div>
  `;
}

function bindFissureSummaryHover(container) {
  if (!container) return;
  container.querySelectorAll(".fissure-summary-card").forEach((card) => {
    if (card.dataset.hoverBound === "true") return;
    card.dataset.hoverBound = "true";
    card.addEventListener("mouseenter", () => {
      const summary = resolveFissureCardSummary(card);
      if (!summary) return;
      activeFissureHoverGroupKey = summary.fissureKey;
      showFissureHoverPreview(summary);
    });
    card.addEventListener("mouseleave", () => {
      hideFissureHoverPreviewSoon(card.dataset.fissureDetailKey);
    });
  });
}

function resolveFissureCardSummary(card) {
  const compareColumn = card.closest(".fissure-compare-column");
  const plan = compareColumn && compareColumn.textContent.includes("方案2")
    ? fissureState.plans.plan2
    : fissureState.plans.plan1;
  return fissureGroups
    .map((group) => buildFissureGroupSummary(group, plan))
    .find((entry) => entry.fissureKey === card.dataset.fissureDetailKey);
}

function renderFissureTableLayout() {
  const rowsHtml = fissureRows
    .map((row) => {
      const group = fissureGroups.find((entry) => entry.fissureKey === row.fissureKey);
      const planSummary = group ? calculateFissureRowExpectation(row, group, fissureState.plans.plan1) : null;
      return `
        <tr>
          <td class="fissure-table-level-cell">${formatFissureTableLabel(row.fissureLabel)}</td>
          <td>${escapeFissureHtml(row.sublimation)}</td>
          ${["1", "2", "3"]
            .map((tier) => renderFissurePriceCell(row, tier))
            .join("")}
          <td>${planSummary?.available ? formatFissureExpectedValue(planSummary.total) : "不可刷"}</td>
        </tr>
      `;
    })
    .join("");

  return `
    <div class="fissure-table-shell">
      <div class="fissure-table-note">总表模式用于改价。默认 0 价的升华等级视为不存在，显示为“无”，不可编辑。</div>
      <div class="fissure-table-scroll">
        <table class="fissure-info-table">
          <colgroup>
            <col class="fissure-col-level" />
            <col class="fissure-col-name" />
            <col class="fissure-col-price" />
            <col class="fissure-col-price" />
            <col class="fissure-col-price" />
            <col class="fissure-col-expected" />
          </colgroup>
          <thead>
            <tr>
              <th>裂缝</th>
              <th>升华</th>
              <th>1级价格</th>
              <th>2级价格</th>
              <th>3级价格</th>
              <th>期望</th>
            </tr>
          </thead>
          <tbody>${rowsHtml}</tbody>
        </table>
      </div>
    </div>
  `;
}

function formatFissureTableLabel(label) {
  const text = String(label || "").trim();
  const match = text.match(/^(\d+)\s*(终极裂缝)$/);
  if (!match) return escapeFissureHtml(text);
  return `${escapeFissureHtml(match[1])}<br /><span class="fissure-table-level-sub">${escapeFissureHtml("终极")}</span>`;
}

function renderFissurePriceCell(row, tier) {
  if (isFissurePriceLocked(row, tier)) {
    return `<td class="fissure-price-cell is-locked"><div class="fissure-price-locked-cell"><span class="fissure-price-locked">无</span></div></td>`;
  }

  const value = getFissureEffectivePrice(row, tier);
  return `
    <td class="fissure-price-cell">
      <input
        class="fissure-price-input"
        data-row-key="${row.rowKey}"
        data-tier="${tier}"
        value="${value}"
        title="${escapeFissureHtml(row.sublimation)} ${tier}级价格" />
    </td>
  `;
}

function bindFissureParameterEvents(container) {
  container.querySelectorAll(".fissure-param-input").forEach((input) => {
    if (input.dataset.bound === "true") return;
    input.dataset.bound = "true";
    input.dataset.prevCommittedValue = input.value;
    input.addEventListener("input", () => {
      input.value = String(input.value || "").replace(/[^\d]/g, "");
    });

    const commit = () => {
      const planKey = input.dataset.planKey;
      const paramKey = input.dataset.paramKey;
      if (!planKey || !paramKey) return;
      const previousValue = input.dataset.prevCommittedValue || "";
      const rawValue = String(input.value || "").trim();
      const plan = fissureState.plans[planKey];
      if (!plan) return;

      const fallback = plan[paramKey];
      const parsed = parseFissureRoundedInteger(rawValue, null);
      if (parsed === null || Number.isNaN(parsed)) {
        input.value = previousValue;
        return;
      }
      const nextValue = clampInteger(parsed, fallback, FISSURE_PARAM_LIMITS[paramKey]);

      fissureState.plans[planKey] = {
        ...plan,
        [paramKey]: nextValue,
      };
      input.value = String(nextValue);
      input.dataset.prevCommittedValue = input.value;
      saveFissureExpectationState();
      renderFissureExpectationModal();
    };

    input.addEventListener("blur", commit);
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        input.blur();
      }
    });
  });

  container.querySelectorAll(".fissure-wip-switch").forEach((toggle) => {
    if (toggle.dataset.bound === "true") return;
    toggle.dataset.bound = "true";

    const commitToggle = () => {
      const planKey = toggle.dataset.planKey;
      const plan = fissureState.plans[planKey];
      if (!plan) return;
      plan.wip = plan.wip === 1 ? 0 : 1;
      saveFissureExpectationState();
      renderFissureExpectationModal();
    };

    toggle.addEventListener("click", commitToggle);
    toggle.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        commitToggle();
      }
    });
  });

  container.querySelectorAll(".fissure-param-select").forEach((select) => {
    if (select.dataset.bound === "true") return;
    select.dataset.bound = "true";
    select.addEventListener("change", () => {
      const planKey = select.dataset.planKey;
      const plan = fissureState.plans[planKey];
      if (!plan) return;
      plan.compressionLevel = normalizeCompressionLevel(select.value);
      saveFissureExpectationState();
      renderFissureExpectationModal();
    });
  });
}

function bindFissureTableEvents(results) {
  results.querySelectorAll(".fissure-price-input").forEach((input) => {
    if (input.dataset.bound === "true") return;
    input.dataset.bound = "true";
    input.dataset.prevCommittedValue = input.value;

    const commit = () => {
      const previousValue = input.dataset.prevCommittedValue || "";
      const parsed = parseFissureRoundedInteger(input.value, null);
      if (parsed === null || Number.isNaN(parsed)) {
        input.value = previousValue;
        return;
      }

      const changed = setFissureEffectivePrice(input.dataset.rowKey, input.dataset.tier, parsed);
      input.value = String(parsed);
      input.dataset.prevCommittedValue = input.value;
      if (changed) {
        renderFissureExpectationModal();
      }
    };

    input.addEventListener("blur", commit);
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        input.blur();
      }
    });
  });
}

function bindFissureInlineTableActions(container) {
  if (!container) return;
  container.querySelectorAll("[data-fissure-inline-action]").forEach((button) => {
    if (button.dataset.bound === "true") return;
    button.dataset.bound = "true";
    button.addEventListener("click", () => {
      const action = button.dataset.fissureInlineAction;
      if (action === "import") {
        openFissureExpectationImportModal();
        return;
      }
      if (action === "export") {
        exportFissureExpectationCsv();
        return;
      }
      if (action === "reset") {
        if (!confirm("确定恢复默认价格吗？")) return;
        resetFissurePriceOverrides();
        renderFissureExpectationModal();
      }
    });
  });
}

function bindFissureToolbarEvents() {
  const summaryBtn = document.getElementById("fissure-mode-summary-btn");
  const tableBtn = document.getElementById("fissure-mode-table-btn");
  const compareBtn = document.getElementById("fissure-compare-btn");
  const sortSelect = document.getElementById("fissure-sort-select");
  const importBtn = document.getElementById("fissure-import-btn");
  const exportBtn = document.getElementById("fissure-export-btn");
  const resetBtn = document.getElementById("fissure-reset-btn");

  if (summaryBtn && summaryBtn.dataset.bound !== "true") {
    summaryBtn.dataset.bound = "true";
    summaryBtn.addEventListener("click", () => {
      fissureState.viewMode = FISSURE_VIEW_MODES.summary;
      fissureState.compareEnabled = false;
      saveFissureExpectationState();
      renderFissureExpectationModal();
    });
  }

  if (tableBtn && tableBtn.dataset.bound !== "true") {
    tableBtn.dataset.bound = "true";
    tableBtn.addEventListener("click", () => {
      fissureState.viewMode = FISSURE_VIEW_MODES.table;
      fissureState.compareEnabled = false;
      saveFissureExpectationState();
      renderFissureExpectationModal();
    });
  }

  if (compareBtn && compareBtn.dataset.bound !== "true") {
    compareBtn.dataset.bound = "true";
    compareBtn.addEventListener("click", () => {
      fissureState.compareEnabled = !fissureState.compareEnabled;
      if (fissureState.compareEnabled) {
        fissureState.viewMode = FISSURE_VIEW_MODES.summary;
      }
      saveFissureExpectationState();
      renderFissureExpectationModal();
    });
  }

  if (sortSelect && sortSelect.dataset.bound !== "true") {
    sortSelect.dataset.bound = "true";
    sortSelect.addEventListener("change", () => {
      fissureState.sortKey = Object.prototype.hasOwnProperty.call(FISSURE_SORT_OPTIONS, sortSelect.value)
        ? sortSelect.value
        : "fissure-asc";
      saveFissureExpectationState();
      renderFissureExpectationModal();
    });
  }

  if (importBtn && importBtn.dataset.bound !== "true") {
    importBtn.dataset.bound = "true";
    importBtn.addEventListener("click", () => openFissureExpectationImportModal());
  }

  if (exportBtn && exportBtn.dataset.bound !== "true") {
    exportBtn.dataset.bound = "true";
    exportBtn.addEventListener("click", exportFissureExpectationCsv);
  }

  if (resetBtn && resetBtn.dataset.bound !== "true") {
    resetBtn.dataset.bound = "true";
    resetBtn.addEventListener("click", () => {
      if (!confirm("确定恢复默认价格吗？")) return;
      resetFissurePriceOverrides();
      renderFissureExpectationModal();
    });
  }
}

function buildFissureCsvRows() {
  const header = ["rowKey", "裂缝等级", "升华", "1级价格", "2级价格", "3级价格"];
  const rows = fissureRows.map((row) => [
    row.rowKey,
    row.fissureLabel,
    row.sublimation,
    isFissurePriceLocked(row, "1") ? 0 : getFissureEffectivePrice(row, "1"),
    isFissurePriceLocked(row, "2") ? 0 : getFissureEffectivePrice(row, "2"),
    isFissurePriceLocked(row, "3") ? 0 : getFissureEffectivePrice(row, "3"),
  ]);
  return [header, ...rows];
}

function toCsvLine(values) {
  return values
    .map((value) => {
      const text = String(value ?? "");
      if (/[",\n]/.test(text)) {
        return `"${text.replace(/"/g, '""')}"`;
      }
      return text;
    })
    .join(",");
}

function exportFissureExpectationCsv() {
  const defaultName = "裂缝期望价格表";
  const fileName = sanitizeFissureFileName(defaultName) || defaultName;
  const csv = buildFissureCsvRows().map(toCsvLine).join("\r\n");
  const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });

  if (typeof window.saveBlobWithPicker === "function") {
    return window.saveBlobWithPicker(blob, {
      downloadName: `${fileName}.csv`,
      pickerId: "wakfu-fissure-export",
      types: [
        {
          description: "CSV Files",
          accept: {
            "text/csv": [".csv"],
          },
        },
        {
          description: "Text Files",
          accept: {
            "text/plain": [".txt"],
          },
        },
      ],
    });
  }

  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `${fileName}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  return Promise.resolve({ method: "download-fallback" });
}

function sanitizeFissureFileName(value) {
  return String(value || "")
    .trim()
    .replace(/[\\/:*?"<>|]+/g, "_")
    .replace(/\s+/g, " ");
}

function splitCsvLine(line) {
  const result = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += char;
    }
  }

  result.push(current);
  return result.map((cell) => cell.trim());
}

function parseFissureImportText(rawText) {
  const lines = String(rawText || "")
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length < 2) {
    throw new Error("导入内容为空。");
  }

  const header = splitCsvLine(lines[0]);
  const rowKeyIndex = header.findIndex((cell) => /rowkey/i.test(cell));
  const fissureIndex = header.findIndex((cell) => /裂缝/.test(cell));
  const sublimationIndex = header.findIndex((cell) => /升华/.test(cell));
  const tierIndices = {
    "1": header.findIndex((cell) => /1级/.test(cell)),
    "2": header.findIndex((cell) => /2级/.test(cell)),
    "3": header.findIndex((cell) => /3级/.test(cell)),
  };

  if (Object.values(tierIndices).some((index) => index < 0)) {
    throw new Error("缺少 1/2/3 级价格列。");
  }

  return lines.slice(1).map((line) => {
    const cells = splitCsvLine(line);
    return {
      rowKey: rowKeyIndex >= 0 ? cells[rowKeyIndex] : "",
      fissureLabel: fissureIndex >= 0 ? cells[fissureIndex] : "",
      sublimation: sublimationIndex >= 0 ? cells[sublimationIndex] : "",
      prices: {
        "1": cells[tierIndices["1"]],
        "2": cells[tierIndices["2"]],
        "3": cells[tierIndices["3"]],
      },
    };
  });
}

function findFissureImportTarget(entry) {
  if (entry.rowKey && fissureRowMap.has(String(entry.rowKey))) {
    return fissureRowMap.get(String(entry.rowKey));
  }

  return fissureRows.find(
    (row) =>
      String(row.fissureLabel || "") === String(entry.fissureLabel || "") &&
      String(row.sublimation || "") === String(entry.sublimation || "")
  );
}

function applyParsedFissureImport(entries) {
  let updated = 0;
  let skipped = 0;
  let ignoredLocked = 0;

  entries.forEach((entry) => {
    const row = findFissureImportTarget(entry);
    if (!row) {
      skipped += 1;
      return;
    }

    ["1", "2", "3"].forEach((tier) => {
      const rawValue = String(entry.prices?.[tier] ?? "").trim();
      if (!rawValue) return;
      if (isFissurePriceLocked(row, tier)) {
        ignoredLocked += 1;
        return;
      }
      const parsed = parseFissureRoundedInteger(rawValue, null);
      if (parsed === null || Number.isNaN(parsed)) {
        skipped += 1;
        return;
      }
      setFissureEffectivePrice(row.rowKey, tier, parsed);
      updated += 1;
    });
  });

  return { updated, skipped, ignoredLocked };
}

function openFissureExpectationModal() {
  const sidebar = document.getElementById("fissure-expectation-sidebar");
  if (!sidebar) return;
  if (typeof window.closeHelperSidebar === "function") {
    window.closeHelperSidebar();
  }
  sidebar.classList.add("open");
  renderFissureExpectationModal();
}

function closeFissureExpectationModal() {
  const sidebar = document.getElementById("fissure-expectation-sidebar");
  if (sidebar) sidebar.classList.remove("open");
  hideFissureHoverPreview();
}

function getFissureImportElements() {
  return {
    modal: document.getElementById("fissure-transfer-modal"),
    text: document.getElementById("fissure-transfer-text"),
    fileInput: document.getElementById("fissure-transfer-file-input"),
    note: document.getElementById("fissure-transfer-note"),
  };
}

function openFissureExpectationImportModal() {
  const { modal, text, fileInput } = getFissureImportElements();
  if (!modal || !text || !fileInput) return;
  modal.style.display = "flex";
  text.value = "";
  bindFissureImportDropZone(modal, text);
  if (fileInput.dataset.bound !== "true") {
    fileInput.dataset.bound = "true";
    fileInput.addEventListener("change", async (event) => {
      const file = event.target?.files?.[0];
      if (!file) return;
      const content = await file.text();
      text.value = content;
      event.target.value = "";
    });
  }
  text.focus();
}

function closeFissureExpectationImportModal() {
  const { modal } = getFissureImportElements();
  if (modal) modal.style.display = "none";
}

function bindFissureImportDropZone(modal, textArea) {
  if (!modal || !textArea || modal.dataset.fissureDropBound === "true") return;
  modal.dataset.fissureDropBound = "true";

  const setDragState = (active) => {
    textArea.classList.toggle("is-drag-over", active);
  };

  ["dragenter", "dragover"].forEach((eventName) => {
    modal.addEventListener(eventName, (event) => {
      event.preventDefault();
      setDragState(true);
    });
  });

  ["dragleave", "dragend"].forEach((eventName) => {
    modal.addEventListener(eventName, () => {
      setDragState(false);
    });
  });

  modal.addEventListener("drop", async (event) => {
    event.preventDefault();
    setDragState(false);
    const file = event.dataTransfer?.files?.[0];
    if (file) {
      textArea.value = await file.text();
      return;
    }
    const droppedText = event.dataTransfer?.getData("text/plain");
    if (droppedText) {
      textArea.value = droppedText;
    }
  });
}

function applyFissureExpectationImport() {
  const { text } = getFissureImportElements();
  if (!text) return;
  try {
    const entries = parseFissureImportText(text.value);
    const summary = applyParsedFissureImport(entries);
    closeFissureExpectationImportModal();
    renderFissureExpectationModal();
    alert(`导入完成：更新 ${summary.updated} 项，跳过 ${summary.skipped} 项，忽略锁死价格 ${summary.ignoredLocked} 项。`);
  } catch (error) {
    alert(`导入失败：${error.message}`);
  }
}

function bindFissureModalDismiss() {
  ["fissure-transfer-modal"].forEach((id) => {
    const modal = document.getElementById(id);
    if (!modal || modal.dataset.dismissBound === "true") return;
    modal.dataset.dismissBound = "true";
    modal.addEventListener("click", (event) => {
      if (event.target !== modal) return;
      closeFissureExpectationImportModal();
    });
  });
}

function initFissureExpectationTool() {
  if (!initializeFissureExpectationData()) return;
  loadFissureExpectationState();
  loadFissurePriceOverrides();
  bindFissureToolbarEvents();
  bindFissureModalDismiss();
  bindFissureHoverPreviewLifecycle();
}

function getFissureHoverPreviewElement() {
  return document.getElementById("fissure-hover-preview");
}

function showFissureHoverPreview(summary) {
  const preview = getFissureHoverPreviewElement();
  const sidebar = document.getElementById("fissure-expectation-sidebar");
  if (!preview || !sidebar || !sidebar.classList.contains("open")) return;

  preview.innerHTML = renderFissureDetailPanel(summary);
  preview.style.display = "block";
  preview.classList.add("is-visible");

  const sidebarRect = sidebar.getBoundingClientRect();
  const previewWidth = Math.min(660, Math.max(540, Math.round(window.innerWidth * 0.38)));
  preview.style.width = `${previewWidth}px`;
  preview.style.left = `${Math.max(12, sidebarRect.left - previewWidth - 18)}px`;
  preview.style.top = `${Math.max(12, Math.min(sidebarRect.top + 18, window.innerHeight - preview.offsetHeight - 12))}px`;
}

function hideFissureHoverPreview() {
  const preview = getFissureHoverPreviewElement();
  if (!preview) return;
  preview.classList.remove("is-visible");
  preview.style.display = "none";
  preview.innerHTML = "";
  activeFissureHoverGroupKey = "";
}

function hideFissureHoverPreviewSoon(groupKey) {
  window.setTimeout(() => {
    const preview = getFissureHoverPreviewElement();
    if (!preview) return;
    const hoveredCard = document.querySelector(`.fissure-summary-card[data-fissure-detail-key="${groupKey}"]:hover`);
    if (hoveredCard || preview.matches(":hover")) return;
    if (activeFissureHoverGroupKey === groupKey) {
      hideFissureHoverPreview();
    }
  }, 60);
}

function bindFissureHoverPreviewLifecycle() {
  const preview = getFissureHoverPreviewElement();
  if (!preview || preview.dataset.bound === "true") return;
  preview.dataset.bound = "true";
  preview.addEventListener("mouseleave", () => hideFissureHoverPreviewSoon(activeFissureHoverGroupKey));
}

window.openFissureExpectationModal = openFissureExpectationModal;
window.closeFissureExpectationModal = closeFissureExpectationModal;
window.openFissureExpectationImportModal = openFissureExpectationImportModal;
window.closeFissureExpectationImportModal = closeFissureExpectationImportModal;
window.applyFissureExpectationImport = applyFissureExpectationImport;

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initFissureExpectationTool);
} else {
  initFissureExpectationTool();
}
