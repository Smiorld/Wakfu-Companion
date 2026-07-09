const HELPER_PORT_STORAGE_KEY = "wakfu_helper_port_v1";
const HELPER_SEEN_STORAGE_KEY = "wakfu_helper_seen_v1";
const HELPER_PORT_SCAN_START = 18446;
const HELPER_PORT_SCAN_END = 18456;
const HELPER_LAUNCH_URI = "wakfuhelper://launch";
const HELPER_PROBE_TIMEOUT_MS = 450;
const HELPER_REQUEST_TIMEOUT_MS = 3000;
const HELPER_POLL_INTERVAL_ACTIVE_MS = 5000;
const HELPER_POLL_INTERVAL_IDLE_MS = 15000;

function loadHelperSeenState() {
  try {
    return localStorage.getItem(HELPER_SEEN_STORAGE_KEY) === "1";
  } catch (_error) {}
  return false;
}

function saveHelperSeenState(seen) {
  try {
    localStorage.setItem(HELPER_SEEN_STORAGE_KEY, seen ? "1" : "0");
  } catch (_error) {}
}

const helperState = {
  logsReady: false,
  available: false,
  wasAvailableOnce: loadHelperSeenState(),
  status: null,
  config: null,
  events: [],
  lastResult: null,
  lastError: "",
};

let helperPollTimer = null;
let helperPollInFlight = null;
let helperActiveBaseUrl = null;
let helperCurrentPollIntervalMs = 0;

function loadStoredHelperPort() {
  try {
    const parsed = Number(localStorage.getItem(HELPER_PORT_STORAGE_KEY) || "");
    if (Number.isInteger(parsed) && parsed >= 1025 && parsed <= 65535) return parsed;
  } catch (_error) {}
  return null;
}

function saveStoredHelperPort(port) {
  if (!Number.isInteger(port)) return;
  try {
    localStorage.setItem(HELPER_PORT_STORAGE_KEY, String(port));
  } catch (_error) {}
}

function buildHelperBaseUrl(port) {
  return `http://127.0.0.1:${port}/`;
}

function getHelperProbePorts() {
  const ports = [];
  const pushPort = (value) => {
    const numeric = Number(value);
    if (!Number.isInteger(numeric) || numeric < 1025 || numeric > 65535) return;
    if (!ports.includes(numeric)) ports.push(numeric);
  };

  pushPort(loadStoredHelperPort());
  for (let port = HELPER_PORT_SCAN_START; port <= HELPER_PORT_SCAN_END; port += 1) {
    pushPort(port);
  }

  return ports;
}

function getHelperBaseUrl() {
  return helperActiveBaseUrl || buildHelperBaseUrl(loadStoredHelperPort() || HELPER_PORT_SCAN_START);
}

function getHelperElement(id) {
  return document.getElementById(id);
}

function getHelperSidebar() {
  return getHelperElement("helper-sidebar");
}

function getHelperButton() {
  return getHelperElement("helper-control-btn");
}

function isHelperSidebarOpen() {
  const sidebar = getHelperSidebar();
  return Boolean(sidebar && sidebar.classList.contains("open"));
}

function formatHelperMode(mode) {
  switch (String(mode || "").trim().toLowerCase()) {
    case "activate-only":
      return "自动激活";
    case "space-burst-return":
      return "自动跳过";
    case "off":
    default:
      return "关闭";
  }
}

function formatHelperTime(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("zh-CN", {
    hour12: false,
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function escapeHelperHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function normalizeHelperResult(data, fallbackTitle = "操作已完成") {
  const result = data?.result || null;
  const message = String(
    result?.message || data?.message || data?.error || fallbackTitle || "操作已完成。"
  ).trim();
  const processId = result?.processId ?? null;
  const ok = Boolean(data?.ok);
  return {
    kind: ok ? "success" : "error",
    title: fallbackTitle,
    message,
    meta: processId ? `进程 ID：${processId}` : "",
    at: Date.now(),
  };
}

function setHelperLastResult(result) {
  helperState.lastResult = result;
  renderHelperPanel();
}

function setHelperAvailability(available, errorMessage = "") {
  helperState.available = Boolean(available);
  if (helperState.available) {
    helperState.wasAvailableOnce = true;
    saveHelperSeenState(true);
  }
  helperState.lastError = available ? "" : String(errorMessage || "").trim();
  if (!available) {
    helperState.status = null;
    helperState.config = null;
    helperState.events = [];
  }
  renderHelperPanel();
}

function updateHelperButtonVisibility() {
  const button = getHelperButton();
  if (!button) return;
  const shouldShow = helperState.wasAvailableOnce;
  button.style.display = shouldShow ? "inline-flex" : "none";
  button.classList.toggle("is-offline", shouldShow && !helperState.available);

  const indicator = getHelperElement("helper-control-indicator");
  if (indicator) {
    indicator.classList.toggle("is-online", helperState.available);
    indicator.classList.toggle("is-offline", !helperState.available);
  }
}

function renderHelperMetaGrid() {
  const container = getHelperElement("helper-meta-grid");
  if (!container) return;

  const status = helperState.status;
  const config = helperState.config;

  const metaItems = [
    {
      label: "当前模式",
      value: formatHelperMode(status?.automationMode || config?.defaultActionMode || "off"),
    },
    {
      label: "停止热键",
      value: status?.stopHotkey || config?.stopHotkey || "—",
    },
    {
      label: "监听端口",
      value: status?.httpPort || config?.httpPort || "18446",
    },
    {
      label: "最近更新",
      value: formatHelperTime(status?.lastUpdatedAt),
    },
  ];

  container.innerHTML = metaItems
    .map(
      (item) => `
        <div class="helper-meta-item">
          <div class="helper-meta-label">${escapeHelperHtml(item.label)}</div>
          <div class="helper-meta-value">${escapeHelperHtml(item.value)}</div>
        </div>
      `
    )
    .join("");
}

function renderHelperEvents() {
  const container = getHelperElement("helper-events-list");
  if (!container) return;

  if (!helperState.available) {
    container.innerHTML = '<div class="empty-state-mini">本地 helper 未运行。</div>';
    return;
  }

  const events = Array.isArray(helperState.events) ? [...helperState.events].reverse() : [];
  if (!events.length) {
    container.innerHTML = '<div class="empty-state-mini">暂无事件。</div>';
    return;
  }

  container.innerHTML = events
    .map((entry) => {
      const level = String(entry?.level || "info").toLowerCase();
      const data = entry?.data && typeof entry.data === "object" ? entry.data : null;
      const dataText = data
        ? Object.entries(data)
            .map(([key, value]) => `${key}=${value}`)
            .join(" · ")
        : "";

      return `
        <div class="helper-event-item">
          <div class="helper-event-topline">
            <div class="helper-event-badges">
              <span class="helper-event-level ${escapeHelperHtml(level)}">${escapeHelperHtml(level)}</span>
              <span class="helper-event-type">${escapeHelperHtml(entry?.eventType || "event")}</span>
            </div>
            <span class="helper-event-time">${escapeHelperHtml(formatHelperTime(entry?.timestamp))}</span>
          </div>
          <div class="helper-event-message">${escapeHelperHtml(entry?.message || "—")}</div>
          ${dataText ? `<div class="helper-event-data">${escapeHelperHtml(dataText)}</div>` : ""}
        </div>
      `;
    })
    .join("");
}

function renderHelperResultCard() {
  const card = getHelperElement("helper-result-card");
  if (!card) return;

  const result = helperState.lastResult;
  card.className = "helper-result-card";

  if (!result) {
    card.classList.add("is-empty");
    card.textContent = "暂无操作结果。";
    return;
  }

  if (result.kind === "success") {
    card.classList.add("is-success");
  } else if (result.kind === "error") {
    card.classList.add("is-error");
  }

  card.innerHTML = `
    <div class="helper-result-title">${escapeHelperHtml(result.title || "最近返回")}</div>
    <div class="helper-result-message">${escapeHelperHtml(result.message || "—")}</div>
    <div class="helper-result-meta">
      ${escapeHelperHtml(result.meta || "")}
      ${result.meta ? " · " : ""}${escapeHelperHtml(formatHelperTime(result.at))}
    </div>
  `;
}

function renderHelperModeButtons() {
  const activeMode = String(
    helperState.status?.automationMode || helperState.config?.defaultActionMode || "off"
  ).toLowerCase();

  document.querySelectorAll(".helper-mode-btn").forEach((button) => {
    const mode = String(button.dataset.helperMode || "").toLowerCase();
    button.classList.toggle("is-active", mode === activeMode);
    button.disabled = !helperState.available;
  });
}

function renderHelperActionButtons() {
  const buttons = [
    "helper-start-worker-btn",
    "helper-stop-worker-btn",
    "helper-detect-window-btn",
    "helper-dry-run-btn",
    "helper-refresh-btn",
    "helper-shutdown-btn",
  ];

  buttons.forEach((id) => {
    const button = getHelperElement(id);
    if (!button) return;
    button.disabled = !helperState.available;
  });
}

function renderHelperPanel() {
  updateHelperButtonVisibility();

  const serviceBadge = getHelperElement("helper-service-badge");
  const workerBadge = getHelperElement("helper-worker-badge");
  const modeBadge = getHelperElement("helper-mode-badge");
  const summaryLine = getHelperElement("helper-summary-line");
  const launchRow = getHelperElement("helper-launch-row");

  if (serviceBadge) {
    serviceBadge.className = `helper-pill ${helperState.available ? "is-online" : "is-offline"}`;
    serviceBadge.textContent = helperState.available ? "本地服务在线" : "本地服务离线";
  }

  if (workerBadge) {
    const workerRunning = Boolean(helperState.status?.workerRunning);
    workerBadge.className = `helper-pill ${workerRunning ? "is-running" : "is-muted"}`;
    workerBadge.textContent = workerRunning ? "挂机监听运行中" : "挂机监听未启动";
  }

  if (modeBadge) {
    modeBadge.className = "helper-pill is-muted";
    modeBadge.textContent = `模式：${formatHelperMode(
      helperState.status?.automationMode || helperState.config?.defaultActionMode || "off"
    )}`;
  }

  if (summaryLine) {
    if (!helperState.logsReady) {
      summaryLine.textContent = "等待日志导入后探测本地 helper…";
    } else if (!helperState.available) {
      summaryLine.textContent =
        helperState.lastError || "未检测到本地 helper。可先点击下方按钮唤醒本机 helper。";
    } else {
      summaryLine.textContent =
        helperState.status?.lastActionMessage || "本地 helper 已连接，可以直接在这里控制。";
    }
  }

  if (launchRow) {
    launchRow.style.display = helperState.available ? "none" : "flex";
  }

  renderHelperMetaGrid();
  renderHelperModeButtons();
  renderHelperActionButtons();
  renderHelperResultCard();
  renderHelperEvents();
}

function scheduleHelperPolling(intervalMs) {
  const numericInterval = Number(intervalMs) || 0;
  if (numericInterval <= 0) {
    stopHelperPolling();
    return;
  }
  if (helperPollTimer && helperCurrentPollIntervalMs === numericInterval) {
    return;
  }
  stopHelperPolling();
  helperCurrentPollIntervalMs = numericInterval;
  helperPollTimer = window.setInterval(() => {
    refreshHelperSnapshot({ full: isHelperSidebarOpen() });
  }, numericInterval);
}

async function helperFetchJson(path, options = {}, timeoutMs = HELPER_REQUEST_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const method = String(options.method || "GET").toUpperCase();
    const headers = { ...(options.headers || {}) };
    if (options.body && !headers["Content-Type"]) {
      headers["Content-Type"] = "application/json";
    }
    const response = await fetch(new URL(path, getHelperBaseUrl()), {
      ...options,
      signal: controller.signal,
      method,
      headers,
    });
    const text = await response.text();
    const data = text ? JSON.parse(text) : {};
    if (!response.ok) {
      throw new Error(data?.error || data?.message || `HTTP ${response.status}`);
    }
    return data;
  } finally {
    window.clearTimeout(timer);
  }
}

async function probeHelperHealthAtPort(port) {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), HELPER_PROBE_TIMEOUT_MS);
  try {
    const response = await fetch(new URL("health", buildHelperBaseUrl(port)), {
      method: "GET",
      signal: controller.signal,
    });
    if (!response.ok) return false;
    const data = await response.json().catch(() => null);
    return Boolean(data?.ok);
  } catch (_error) {
    return false;
  } finally {
    window.clearTimeout(timer);
  }
}

async function probeHelperHealth() {
  const ports = getHelperProbePorts();
  for (const port of ports) {
    // Keep this sequential to avoid spraying localhost with concurrent requests.
    // The candidate set is small and the timeout is short.
    const ok = await probeHelperHealthAtPort(port);
    if (ok) {
      helperActiveBaseUrl = buildHelperBaseUrl(port);
      saveStoredHelperPort(port);
      return true;
    }
  }

  helperActiveBaseUrl = null;
  return false;
}

async function refreshHelperSnapshot({ full = true } = {}) {
  if (helperPollInFlight) {
    return helperPollInFlight;
  }

  helperPollInFlight = (async () => {
    const available = await probeHelperHealth();
    if (!available) {
      setHelperAvailability(false);
      return false;
    }

    setHelperAvailability(true);

    if (full) {
      const [statusPayload, configPayload, eventsPayload] = await Promise.all([
        helperFetchJson("api/v1/status", { method: "GET" }),
        helperFetchJson("api/v1/config", { method: "GET" }),
        helperFetchJson("api/v1/events", { method: "GET" }),
      ]);

      helperState.status = statusPayload?.status || null;
      helperState.config = configPayload?.config || null;
      helperState.events = Array.isArray(eventsPayload?.events) ? eventsPayload.events : [];
    }

    renderHelperPanel();
    return true;
  })()
    .catch((error) => {
      setHelperAvailability(false, error?.message || "无法连接本地 helper。");
      return false;
    })
    .finally(() => {
      helperPollInFlight = null;
    });

  return helperPollInFlight;
}

function startHelperPolling() {
  scheduleHelperPolling(
    isHelperSidebarOpen() ? HELPER_POLL_INTERVAL_ACTIVE_MS : HELPER_POLL_INTERVAL_IDLE_MS
  );
}

function stopHelperPolling() {
  if (helperPollTimer) {
    window.clearInterval(helperPollTimer);
    helperPollTimer = null;
  }
  helperCurrentPollIntervalMs = 0;
}

function closeOtherSidebarsForHelper() {
  ["info-sidebar", "dungeon-sidebar", "professions-sidebar"].forEach((id) => {
    const sidebar = document.getElementById(id);
    if (sidebar) sidebar.classList.remove("open");
  });

  if (typeof window.closeFissureExpectationModal === "function") {
    window.closeFissureExpectationModal();
  } else {
    const fissureSidebar = document.getElementById("fissure-expectation-sidebar");
    if (fissureSidebar) fissureSidebar.classList.remove("open");
  }
}

async function handleHelperAction(actionName, requestFactory, resultTitle) {
  try {
    const payload = await requestFactory();
    setHelperLastResult(normalizeHelperResult(payload, resultTitle));
    await refreshHelperSnapshot({ full: true });
  } catch (error) {
    setHelperLastResult({
      kind: "error",
      title: resultTitle,
      message: error?.message || "请求失败。",
      meta: "",
      at: Date.now(),
    });
    await refreshHelperSnapshot({ full: false });
  }
}

function launchLocalHelper() {
  try {
    window.location.href = HELPER_LAUNCH_URI;
    setHelperLastResult({
      kind: "success",
      title: "启动本地helper",
      message: "已尝试唤醒本地 helper。若无反应，请先运行同目录下的协议注册脚本。",
      meta: HELPER_LAUNCH_URI,
      at: Date.now(),
    });
    window.setTimeout(() => {
      refreshHelperSnapshot({ full: true });
    }, 1600);
  } catch (_error) {
    setHelperLastResult({
      kind: "error",
      title: "启动本地helper",
      message: "唤醒失败。请先运行同目录下的协议注册脚本。",
      meta: HELPER_LAUNCH_URI,
      at: Date.now(),
    });
  }
}

function bindHelperControls() {
  if (document.body.dataset.helperControlsBound === "true") return;
  document.body.dataset.helperControlsBound = "true";

  const launchButton = getHelperElement("helper-launch-btn");
  if (launchButton) {
    launchButton.addEventListener("click", launchLocalHelper);
  }

  document.querySelectorAll(".helper-mode-btn").forEach((button) => {
    button.addEventListener("click", () => {
      const mode = String(button.dataset.helperMode || "").trim();
      if (!mode) return;
      handleHelperAction(
        `mode:${mode}`,
        () =>
          helperFetchJson("api/v1/mode", {
            method: "POST",
            body: JSON.stringify({ mode }),
          }),
        `模式切换：${formatHelperMode(mode)}`
      );
    });
  });

  const actionMap = {
    "helper-start-worker-btn": {
      title: "启动监听",
      request: () => helperFetchJson("api/v1/worker/start", { method: "POST", body: "{}" }),
    },
    "helper-stop-worker-btn": {
      title: "停止监听",
      request: () => helperFetchJson("api/v1/worker/stop", { method: "POST", body: "{}" }),
    },
    "helper-detect-window-btn": {
      title: "识别窗口",
      request: () => helperFetchJson("api/v1/actions/detect-window", { method: "POST", body: "{}" }),
    },
    "helper-dry-run-btn": {
      title: "测试跳过",
      request: () =>
        helperFetchJson("api/v1/actions/trigger-space?dryRun=true", {
          method: "POST",
          body: "{}",
        }),
    },
    "helper-refresh-btn": {
      title: "刷新状态",
      request: async () => {
        await refreshHelperSnapshot({ full: true });
        return { ok: true, message: "状态已刷新。" };
      },
    },
    "helper-shutdown-btn": {
      title: "关闭本地helper",
      request: () => helperFetchJson("api/v1/helper/exit", { method: "POST", body: "{}" }),
    },
  };

  Object.entries(actionMap).forEach(([id, config]) => {
    const button = getHelperElement(id);
    if (!button) return;
    button.addEventListener("click", () =>
      handleHelperAction(id, config.request, config.title)
    );
  });
}

function openHelperSidebar() {
  const sidebar = getHelperSidebar();
  if (!sidebar) return;
  closeOtherSidebarsForHelper();
  sidebar.classList.add("open");
  bindHelperControls();
  renderHelperPanel();
  startHelperPolling();
  refreshHelperSnapshot({ full: true });
}

function closeHelperSidebar() {
  const sidebar = getHelperSidebar();
  if (!sidebar) return;
  sidebar.classList.remove("open");
  startHelperPolling();
}

async function onHelperLogsImported() {
  helperState.logsReady = true;
  renderHelperPanel();
  await refreshHelperSnapshot({ full: true });
  startHelperPolling();
}

function resetHelperIntegrationState() {
  helperState.logsReady = false;
  helperState.available = false;
  helperState.status = null;
  helperState.config = null;
  helperState.events = [];
  helperState.lastError = "";
  stopHelperPolling();
  closeHelperSidebar();
  renderHelperPanel();
}

document.addEventListener("DOMContentLoaded", () => {
  bindHelperControls();
  renderHelperPanel();
  startHelperPolling();
  refreshHelperSnapshot({ full: false });
});

window.openHelperSidebar = openHelperSidebar;
window.closeHelperSidebar = closeHelperSidebar;
window.onHelperLogsImported = onHelperLogsImported;
window.resetHelperIntegrationState = resetHelperIntegrationState;
