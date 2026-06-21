const BROADCAST_STORAGE_KEY = "wakfu_tribe_broadcast_state_v4";
const BROADCAST_VIEW_STORAGE_KEY = "wakfu_tribe_broadcast_view_v2";
const BROADCAST_SERVER_KEY_STORAGE = "wakfu_tribe_current_server_v1";
const BROADCAST_ENDPOINT_CACHE_KEY = "wakfu_tribe_broadcast_endpoint_v1";
const BROADCAST_ENDPOINT_CACHE_TTL_MS = 5 * 60 * 1000;
const BROADCAST_SERVICE_CANDIDATES = [
  {
    id: "oracle",
    label: "Oracle",
    health: "http://168.110.57.124.sslip.io/health",
    socket: "ws://168.110.57.124.sslip.io/connect",
    secureOnly: false,
  },
  {
    id: "cloudflare",
    label: "Cloudflare",
    health: "https://wakfu-tribe-sync.q1541599745.workers.dev/health",
    socket: "wss://wakfu-tribe-sync.q1541599745.workers.dev/connect",
    secureOnly: true,
  },
];
const TRIBE_NOTICE_DURATION_MS = 30 * 60 * 1000;
const BROADCAST_REFRESH_MS = 1000;
const BROADCAST_MAX_RECORDS = 200;
const KNOWN_BROADCAST_SERVERS = new Set(["ogrest", "rubilax", "pandora"]);
const BROADCAST_SERVER_OPTIONS = [
  { value: "ogrest", label: "Ogrest" },
  { value: "rubilax", label: "Rubilax" },
  { value: "pandora", label: "Pandora" },
];

let broadcastSocket = null;
let broadcastPeerId = "";
let broadcastRefreshTimer = null;
let broadcastReconnectTimer = null;
let broadcastFilterText = "";
let currentBroadcastServerKey = loadBroadcastServerKey();
let broadcastState = loadBroadcastState();
let broadcastViewState = loadBroadcastViewState();
let broadcastPreviewTribes = {};
let broadcastServiceEndpoint = null;
let broadcastConnection = {
  status: "idle",
  message: "部族通知网络未启动。",
  peerCount: 0,
};

function normalizeBroadcastServerKey(serverKey) {
  const normalized = String(serverKey || "").trim().toLowerCase();
  if (KNOWN_BROADCAST_SERVERS.has(normalized)) return normalized;
  return "unknown";
}

function loadBroadcastServerKey() {
  try {
    const stored = normalizeBroadcastServerKey(localStorage.getItem(BROADCAST_SERVER_KEY_STORAGE) || "");
    return stored === "unknown" ? "ogrest" : stored;
  } catch (error) {
    return "ogrest";
  }
}

function saveBroadcastServerKey() {
  localStorage.setItem(BROADCAST_SERVER_KEY_STORAGE, currentBroadcastServerKey);
}

function getCurrentBroadcastServerKey() {
  const normalized = normalizeBroadcastServerKey(currentBroadcastServerKey);
  return normalized === "unknown" ? "ogrest" : normalized;
}

function createEmptyBroadcastServerState() {
  return { tribes: {} };
}

function createEmptyBroadcastViewServerState() {
  return { dismissed: {} };
}

function getBroadcastServerOptionsMarkup(selectedServerKey = getCurrentBroadcastServerKey()) {
  const normalizedSelected = normalizeBroadcastServerKey(selectedServerKey);
  return BROADCAST_SERVER_OPTIONS.map(
    (option) =>
      `<option value="${option.value}"${
        option.value === normalizedSelected ? " selected" : ""
      }>${option.label}</option>`
  ).join("");
}

function syncBroadcastServerSelectors() {
  const currentServerKey = getCurrentBroadcastServerKey();
  document.querySelectorAll("[data-broadcast-server-select]").forEach((selector) => {
    if (selector.value !== currentServerKey) {
      selector.value = currentServerKey;
    }
  });
}

function notifyBroadcastServerChanged(serverKey) {
  const normalized = normalizeBroadcastServerKey(serverKey);
  syncBroadcastServerSelectors();
  if (typeof window.updateBroadcastServerSelectionUI === "function") {
    window.updateBroadcastServerSelectionUI(normalized);
  }
}

function getBroadcastServerLabel(serverKey = getCurrentBroadcastServerKey()) {
  const normalized = normalizeBroadcastServerKey(serverKey);
  if (normalized === "unknown") return "未识别";
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function loadBroadcastState() {
  try {
    const parsed = JSON.parse(localStorage.getItem(BROADCAST_STORAGE_KEY) || "{}");
    return normalizeLedgerState(parsed);
  } catch (error) {
    return { servers: {} };
  }
}

function saveBroadcastState() {
  localStorage.setItem(BROADCAST_STORAGE_KEY, JSON.stringify(broadcastState));
}

function loadBroadcastViewState() {
  try {
    const parsed = JSON.parse(localStorage.getItem(BROADCAST_VIEW_STORAGE_KEY) || "{}");
    return normalizeBroadcastViewState(parsed);
  } catch (error) {
    return { servers: {} };
  }
}

function saveBroadcastViewState() {
  localStorage.setItem(BROADCAST_VIEW_STORAGE_KEY, JSON.stringify(broadcastViewState));
}

function isSecureBroadcastContext() {
  return window.location.protocol === "https:";
}

function getAvailableBroadcastCandidates() {
  return BROADCAST_SERVICE_CANDIDATES.filter((candidate) => {
    if (!isSecureBroadcastContext()) return true;
    return candidate.secureOnly;
  });
}

function loadCachedBroadcastEndpoint() {
  try {
    const cached = JSON.parse(sessionStorage.getItem(BROADCAST_ENDPOINT_CACHE_KEY) || "null");
    if (!cached || !cached.id || !cached.socket || !cached.cachedAt) return null;
    if (Date.now() - Number(cached.cachedAt || 0) > BROADCAST_ENDPOINT_CACHE_TTL_MS) return null;
    const candidate = getAvailableBroadcastCandidates().find((item) => item.id === cached.id);
    return candidate || null;
  } catch (error) {
    return null;
  }
}

function saveCachedBroadcastEndpoint(candidate) {
  if (!candidate) return;
  sessionStorage.setItem(
    BROADCAST_ENDPOINT_CACHE_KEY,
    JSON.stringify({
      id: candidate.id,
      socket: candidate.socket,
      cachedAt: Date.now(),
    })
  );
}

function clearCachedBroadcastEndpoint() {
  sessionStorage.removeItem(BROADCAST_ENDPOINT_CACHE_KEY);
}

function probeBroadcastEndpoint(candidate, timeoutMs = 2500) {
  return new Promise((resolve, reject) => {
    let settled = false;
    let socket = null;
    const startedAt = performance.now();
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      try {
        if (socket) socket.close();
      } catch (error) {}
      reject(new Error(`Probe timeout for ${candidate.id}`));
    }, timeoutMs);

    try {
      socket = new WebSocket(candidate.socket);
    } catch (error) {
      clearTimeout(timer);
      reject(error);
      return;
    }

    const finish = (ok, error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        if (socket) socket.close();
      } catch (closeError) {}
      if (ok) {
        resolve({
          candidate,
          latency: Math.round(performance.now() - startedAt),
        });
        return;
      }
      reject(error || new Error(`Probe failed for ${candidate.id}`));
    };

    socket.addEventListener("open", () => finish(true));
    socket.addEventListener("error", () => finish(false, new Error(`Probe failed for ${candidate.id}`)));
  });
}

async function selectBroadcastEndpoint() {
  const cached = loadCachedBroadcastEndpoint();
  if (cached) return cached;

  const candidates = getAvailableBroadcastCandidates();
  if (!candidates.length) throw new Error("No broadcast candidate available");

  const results = await Promise.allSettled(candidates.map((candidate) => probeBroadcastEndpoint(candidate)));
  const success = results
    .filter((result) => result.status === "fulfilled")
    .map((result) => result.value)
    .sort((left, right) => left.latency - right.latency);

  if (!success.length) throw new Error("No broadcast endpoint reachable");

  saveCachedBroadcastEndpoint(success[0].candidate);
  return success[0].candidate;
}

function getBroadcastElement(id) {
  if (typeof getUI === "function") return getUI(id);
  return document.getElementById(id);
}

function getCurrentBroadcastServerState() {
  const serverKey = getCurrentBroadcastServerKey();
  if (!broadcastState.servers || typeof broadcastState.servers !== "object") {
    broadcastState.servers = {};
  }
  if (!broadcastState.servers[serverKey]) {
    broadcastState.servers[serverKey] = createEmptyBroadcastServerState();
  }
  return broadcastState.servers[serverKey];
}

function getCurrentBroadcastViewServerState() {
  const serverKey = getCurrentBroadcastServerKey();
  if (!broadcastViewState.servers || typeof broadcastViewState.servers !== "object") {
    broadcastViewState.servers = {};
  }
  if (!broadcastViewState.servers[serverKey]) {
    broadcastViewState.servers[serverKey] = createEmptyBroadcastViewServerState();
  }
  return broadcastViewState.servers[serverKey];
}

function resetBroadcastServerCache(serverKey) {
  const normalizedServerKey = normalizeBroadcastServerKey(serverKey);
  if (normalizedServerKey === "unknown") return;

  if (!broadcastState.servers || typeof broadcastState.servers !== "object") {
    broadcastState.servers = {};
  }
  if (!broadcastViewState.servers || typeof broadcastViewState.servers !== "object") {
    broadcastViewState.servers = {};
  }

  broadcastState.servers[normalizedServerKey] = createEmptyBroadcastServerState();
  broadcastViewState.servers[normalizedServerKey] = createEmptyBroadcastViewServerState();
}

function escapeBroadcastHtml(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function normalizeTribeName(name) {
  return String(name || "")
    .replace(/^部族[:：]?\s*/, "")
    .replace(/^合作[:：]?\s*/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function getTribeRecordKey(name) {
  return normalizeTribeName(name).toLowerCase();
}

function formatBroadcastTime(timestamp) {
  if (!timestamp) return "";
  try {
    return new Date(timestamp).toLocaleString("zh-CN", {
      hour12: false,
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch (error) {
    return "";
  }
}

function formatDurationFromNow(timestamp) {
  const elapsedMs = Math.max(0, Date.now() - Number(timestamp || 0));
  const totalMinutes = Math.floor(elapsedMs / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0) return `${hours}小时${minutes}分钟`;
  return `${minutes}分钟`;
}

function formatRemainingDuration(expiresAt) {
  const remainingMs = Math.max(0, Number(expiresAt || 0) - Date.now());
  const totalSeconds = Math.ceil(remainingMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function formatElapsedDuration(timestamp) {
  const elapsedMs = Math.max(0, Date.now() - Number(timestamp || 0));
  const totalSeconds = Math.floor(elapsedMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function normalizeLedgerRecord(record) {
  if (!record) return null;
  const name = normalizeTribeName(record.name || record.challengeName || "");
  const key = String(record.key || getTribeRecordKey(name)).trim().toLowerCase();
  if (!name || !key) return null;

  const activatedAt = Number(record.activatedAt || record.detectedAt || Date.now());
  const expiresAt = Number(record.expiresAt || activatedAt + TRIBE_NOTICE_DURATION_MS);
  const endedAt = Number(record.endedAt || 0);

  return {
    key,
    serverKey: normalizeBroadcastServerKey(
      record.serverKey || record.server || record.serverName || getCurrentBroadcastServerKey()
    ),
    name,
    challengeId: String(record.challengeId || ""),
    activatedAt,
    expiresAt,
    updatedAt: Number(record.updatedAt || Math.max(activatedAt, endedAt || 0) || Date.now()),
    endedAt,
    senderPeerId: String(record.senderPeerId || ""),
  };
}

function normalizeLedgerState(input) {
  const next = { servers: {} };
  const sourceServers =
    input && typeof input.servers === "object" && !Array.isArray(input.servers) ? input.servers : null;

  if (sourceServers) {
    Object.entries(sourceServers).forEach(([serverKey, serverState]) => {
      const normalizedServerKey = normalizeBroadcastServerKey(serverKey);
      const nextServerState = createEmptyBroadcastServerState();
      const sourceTribes =
        serverState && typeof serverState.tribes === "object" && !Array.isArray(serverState.tribes)
          ? serverState.tribes
          : {};

      Object.values(sourceTribes).forEach((record) => {
        const normalized = normalizeLedgerRecord({ ...record, serverKey: normalizedServerKey });
        if (!normalized) return;
        nextServerState.tribes[normalized.key] = normalized;
      });

      next.servers[normalizedServerKey] = nextServerState;
    });
    return next;
  }

  const legacySource =
    input && typeof input.tribes === "object" && !Array.isArray(input.tribes) ? input.tribes : {};
  const legacyServerKey = getCurrentBroadcastServerKey();
  const legacyServerState = createEmptyBroadcastServerState();

  Object.values(legacySource).forEach((record) => {
    const normalized = normalizeLedgerRecord({ ...record, serverKey: legacyServerKey });
    if (!normalized) return;
    legacyServerState.tribes[normalized.key] = normalized;
  });

  if (Object.keys(legacyServerState.tribes).length) {
    next.servers[legacyServerKey] = legacyServerState;
  }
  return next;
}

function normalizeBroadcastViewState(input) {
  const next = { servers: {} };
  const sourceServers =
    input && typeof input.servers === "object" && !Array.isArray(input.servers) ? input.servers : null;

  if (sourceServers) {
    Object.entries(sourceServers).forEach(([serverKey, serverState]) => {
      const normalizedServerKey = normalizeBroadcastServerKey(serverKey);
      const dismissed =
        serverState && typeof serverState.dismissed === "object" && !Array.isArray(serverState.dismissed)
          ? serverState.dismissed
          : {};
      next.servers[normalizedServerKey] = {
        dismissed,
      };
    });
    return next;
  }

  const legacyDismissed =
    input && typeof input.dismissed === "object" && !Array.isArray(input.dismissed) ? input.dismissed : {};
  if (Object.keys(legacyDismissed).length) {
    next.servers[getCurrentBroadcastServerKey()] = {
      dismissed: legacyDismissed,
    };
  }
  return next;
}

function replaceBroadcastLedger(state, options = {}) {
  const { notify = false } = options;
  const serverKey = getCurrentBroadcastServerKey();
  const previousRecords = { ...(getCurrentBroadcastServerState().tribes || {}) };
  const normalizedInput =
    state && typeof state.servers === "object"
      ? normalizeLedgerState(state)
      : { servers: { [serverKey]: normalizeLedgerState({ servers: { [serverKey]: state } }).servers[serverKey] } };
  const nextServerState =
    normalizedInput.servers?.[serverKey] || createEmptyBroadcastServerState();
  const nextRecords = Object.values(nextServerState.tribes || {});

  broadcastState.servers[serverKey] = nextServerState;
  pruneBroadcastState();
  pruneBroadcastViewState();
  saveBroadcastState();
  saveBroadcastViewState();
  renderBroadcastStrip();
  renderBroadcastHistory();

  if (!notify) return;

  nextRecords.forEach((record) => {
    const previous = previousRecords[record.key];
    const shouldNotify =
      String(record.senderPeerId || "") !== broadcastPeerId &&
      shouldNotifyForActivatedRecord(previous, record);

    if (!shouldNotify) return;
    playBroadcastTribeSound();
    showBroadcastToast(record);
  });
}

function pruneBroadcastState() {
  const serverState = getCurrentBroadcastServerState();
  const nextTribes = {};
  const records = Object.values(serverState.tribes || {})
    .map(normalizeLedgerRecord)
    .filter(Boolean)
    .sort((left, right) => Number(right.updatedAt || 0) - Number(left.updatedAt || 0))
    .slice(0, BROADCAST_MAX_RECORDS);

  records.forEach((record) => {
    nextTribes[record.key] = record;
  });

  serverState.tribes = nextTribes;
}

function pruneBroadcastViewState() {
  const serverState = getCurrentBroadcastServerState();
  const viewServerState = getCurrentBroadcastViewServerState();
  const nextDismissed = {};

  Object.entries(viewServerState.dismissed || {}).forEach(([key, dismissedAt]) => {
    const record = serverState.tribes?.[key];
    if (!record) return;
    if (!canRestoreRecord(record) && !isLocallyDismissed(key)) return;
    if (canRestoreRecord(record)) {
      nextDismissed[key] = Number(dismissedAt || 0);
    }
  });

  viewServerState.dismissed = nextDismissed;
}

function pruneBroadcastPreviewState() {
  const nextTribes = {};
  const records = Object.values(broadcastPreviewTribes || {})
    .filter((record) => record && record.key && record.name && record.activatedAt)
    .sort((left, right) => Number(right.activatedAt || 0) - Number(left.activatedAt || 0))
    .slice(0, BROADCAST_MAX_RECORDS);

  records.forEach((record) => {
    if (!isRecordWithinWindow(record)) return;
    nextTribes[record.key] = record;
  });

  broadcastPreviewTribes = nextTribes;
}

function getBroadcastRecords() {
  pruneBroadcastState();
  pruneBroadcastPreviewState();
  const serverState = getCurrentBroadcastServerState();
  const currentServerKey = getCurrentBroadcastServerKey();
  const filterValue = broadcastFilterText.trim().toLowerCase();
  return [
    ...Object.values(serverState.tribes || {}),
    ...Object.values(broadcastPreviewTribes || {}).filter(
      (record) => normalizeBroadcastServerKey(record?.serverKey || "") === currentServerKey
    ),
  ]
    .filter((record) => {
      if (!filterValue) return true;
      return String(record.name || "").toLowerCase().includes(filterValue);
    })
    .sort((left, right) => {
      const leftValue = Number(left.updatedAt || left.activatedAt || 0);
      const rightValue = Number(right.updatedAt || right.activatedAt || 0);
      return rightValue - leftValue;
    });
}

function isRecordWithinWindow(record) {
  return Number(record?.expiresAt || 0) > Date.now();
}

function isRecordEnded(record) {
  return Number(record?.endedAt || 0) > 0;
}

function isLocallyDismissed(recordKey) {
  return Number(getCurrentBroadcastViewServerState().dismissed?.[recordKey] || 0) > 0;
}

function canRestoreRecord(record) {
  return !!record && isRecordWithinWindow(record) && !isRecordEnded(record);
}

function isRecordVisibleActive(record) {
  return isRecordWithinWindow(record) && !isRecordEnded(record) && !isLocallyDismissed(record.key);
}

function recordsShareBroadcastWindow(left, right) {
  const leftActivatedAt = Number(left?.activatedAt || 0);
  const rightActivatedAt = Number(right?.activatedAt || 0);
  const leftExpiresAt = Number(left?.expiresAt || leftActivatedAt + TRIBE_NOTICE_DURATION_MS);
  const rightExpiresAt = Number(right?.expiresAt || rightActivatedAt + TRIBE_NOTICE_DURATION_MS);
  return leftActivatedAt <= rightExpiresAt && rightActivatedAt <= leftExpiresAt;
}

function shouldNotifyForActivatedRecord(existing, incoming) {
  if (!isRecordWithinWindow(incoming) || isRecordEnded(incoming)) return false;
  if (!existing) return true;
  if (!isRecordWithinWindow(existing)) return true;

  const sameWindow = recordsShareBroadcastWindow(existing, incoming);
  if (!sameWindow) return true;

  return isRecordEnded(existing);
}

function getActiveBroadcastRecords() {
  return getBroadcastRecords().filter((record) => isRecordVisibleActive(record));
}

function getInactiveBroadcastRecords() {
  return getBroadcastRecords().filter((record) => !isRecordVisibleActive(record));
}

function getLatestActiveBroadcastRecord() {
  return getActiveBroadcastRecords()[0] || null;
}

function updateBroadcastConnection(status, message) {
  broadcastConnection.status = status;
  broadcastConnection.message = message;
  renderBroadcastStrip();
  renderBroadcastHistory();
}

function scheduleBroadcastReconnect(delayMs = 10000) {
  if (broadcastReconnectTimer) return;
  broadcastReconnectTimer = setTimeout(() => {
    broadcastReconnectTimer = null;
    connectBroadcastNetwork();
  }, delayMs);
}

function parseBroadcastMessage(raw) {
  try {
    return JSON.parse(raw);
  } catch (error) {
    return null;
  }
}

function sendBroadcastMessage(type, payload) {
  if (!broadcastSocket || broadcastSocket.readyState !== WebSocket.OPEN) return false;
  try {
    broadcastSocket.send(
      JSON.stringify({
        type,
        ...payload,
      })
    );
    return true;
  } catch (error) {
    console.warn("[Broadcast] send failed:", error);
    return false;
  }
}

function playBroadcastTribeSound() {
  if (typeof playNotificationSound === "function") {
    playNotificationSound("tribe");
  }
}

function showBroadcastToast(record) {
  if (typeof showTrackerNotification === "function") {
    showTrackerNotification(null, record.name, "tribe");
  }
}

function buildStartRecord(input) {
  const normalizedName = normalizeTribeName(input?.challengeName || input?.name || "");
  if (!normalizedName) return null;

  const activatedAt = Number(input?.activatedAt || input?.detectedAt || Date.now());
  const serverKey = normalizeBroadcastServerKey(input?.serverKey || getCurrentBroadcastServerKey());
  return {
    key: getTribeRecordKey(normalizedName),
    serverKey,
    name: normalizedName,
    challengeId: String(input?.challengeId || ""),
    activatedAt,
    expiresAt: Number(input?.expiresAt || activatedAt + TRIBE_NOTICE_DURATION_MS),
    updatedAt: Number(input?.updatedAt || activatedAt),
    endedAt: Number(input?.endedAt || 0),
    senderPeerId: String(input?.senderPeerId || ""),
  };
}

function applyServerRecord(record, options = {}) {
  const { notify = false } = options;
  const normalized = normalizeLedgerRecord(record);
  if (!normalized) return false;
  if (normalized.serverKey !== getCurrentBroadcastServerKey()) return false;

  const serverState = getCurrentBroadcastServerState();
  const existing = serverState.tribes[normalized.key];
  const changed = JSON.stringify(existing || null) !== JSON.stringify(normalized);
  const shouldNotify = notify && shouldNotifyForActivatedRecord(existing, normalized);

  serverState.tribes[normalized.key] = normalized;
  pruneBroadcastState();
  pruneBroadcastViewState();
  saveBroadcastState();
  saveBroadcastViewState();
  renderBroadcastStrip();
  renderBroadcastHistory();

  if (changed && shouldNotify) {
    playBroadcastTribeSound();
    showBroadcastToast(normalized);
  }

  return changed;
}

function dismissBroadcastTribe(recordKey) {
  const record = getCurrentBroadcastServerState().tribes?.[recordKey];
  if (!canRestoreRecord(record)) return false;

  getCurrentBroadcastViewServerState().dismissed[recordKey] = Date.now();
  saveBroadcastViewState();
  renderBroadcastStrip();
  renderBroadcastHistory();
  return true;
}

function restoreBroadcastTribe(recordKey) {
  const record = getCurrentBroadcastServerState().tribes?.[recordKey];
  if (!canRestoreRecord(record)) return false;
  delete getCurrentBroadcastViewServerState().dismissed[recordKey];
  saveBroadcastViewState();
  renderBroadcastStrip();
  renderBroadcastHistory();
  return true;
}

function resolveBroadcastTribeLocal(input) {
  const recordKey = getTribeRecordKey(input?.challengeName || input?.name || "");
  if (!recordKey) return false;

  const record = getCurrentBroadcastServerState().tribes?.[recordKey];
  if (!record) return false;
  const resolvedAt = Number(input?.resolvedAt || Date.now());
  if (resolvedAt < Number(record.activatedAt || 0)) return false;

  return applyServerRecord(
    {
      ...record,
      endedAt: resolvedAt,
      updatedAt: Math.max(Number(record.updatedAt || 0), resolvedAt),
    },
    { notify: false }
  );
}

function resolveBroadcastTribe(input) {
  const recordKey = getTribeRecordKey(input?.challengeName || input?.name || "");
  if (!recordKey) return false;

  const record = getCurrentBroadcastServerState().tribes?.[recordKey];
  if (!record) return false;

  const resolvedAt = Number(input?.resolvedAt || Date.now());
  applyServerRecord(
    {
      ...record,
      endedAt: resolvedAt,
      updatedAt: Math.max(Number(record.updatedAt || 0), resolvedAt),
    },
    { notify: false }
  );

  sendBroadcastMessage("tribe-end", {
    key: recordKey,
    serverKey: record.serverKey || getCurrentBroadcastServerKey(),
    resolvedAt,
  });
  return true;
}

function getBroadcastStripName(name) {
  return String(name || "")
    .replace(/^合作[:：]?\s*/, "")
    .replace(/部族$/, "")
    .trim();
}

function renderBroadcastStrip() {
  const strip = getBroadcastElement("chat-broadcast-strip");
  if (!strip) return;

  const latestRecord = getLatestActiveBroadcastRecord();
  if (!latestRecord) {
    strip.innerHTML = `
      <button class="broadcast-pill empty" type="button" onclick="openBroadcastModal()">
        无部族 <span class="broadcast-pill-peers">${escapeBroadcastHtml(
          `在线${Math.max(1, Number(broadcastConnection.peerCount || 0))}人`
        )}</span>
      </button>
    `;
    strip.title = "当前没有激活的部族通知。";
    return;
  }

  const stripName = getBroadcastStripName(latestRecord.name) || latestRecord.name;

  strip.innerHTML = `
    <button class="broadcast-pill tribe" type="button" onclick="openBroadcastModal()">
      <span class="broadcast-pill-type">部族</span>
      <span class="broadcast-pill-text">${escapeBroadcastHtml(stripName)}</span>
      <span class="broadcast-pill-countdown">${escapeBroadcastHtml(
        formatElapsedDuration(latestRecord.activatedAt)
      )}</span>
    </button>
  `;
  strip.title = `${latestRecord.name}\n本轮开始于：${formatBroadcastTime(latestRecord.activatedAt)}`;
}

function buildInactiveRecordNote(record) {
  if (record.__preview) return "预览测试消息";
  if (isRecordEnded(record)) return `已结束：${formatBroadcastTime(record.endedAt)}`;
  if (isLocallyDismissed(record.key) && canRestoreRecord(record)) return "已手动取消激活";
  return `最近记录：${formatBroadcastTime(record.activatedAt)}`;
}

function renderBroadcastList(target, records, emptyText, activeMode = false) {
  if (!target) return;

  if (!records.length) {
    target.innerHTML = `<div class="broadcast-empty-state">${escapeBroadcastHtml(emptyText)}</div>`;
    return;
  }

  target.innerHTML = records
    .map((record) => {
      const timeLabel = activeMode
        ? `已持续 ${formatElapsedDuration(record.activatedAt)}`
        : isRecordEnded(record)
          ? `距今 ${formatDurationFromNow(record.endedAt || record.updatedAt)}`
          : `距上次记录 ${formatDurationFromNow(record.activatedAt)}`;
      const footer = activeMode
        ? `本轮开始于：${formatBroadcastTime(record.activatedAt)}`
        : buildInactiveRecordNote(record);
      const canRestore = !activeMode && !record.__preview && canRestoreRecord(record) && isLocallyDismissed(record.key);

      return `
        <div class="broadcast-history-item ${activeMode ? "active" : "inactive"}">
          <div class="broadcast-history-meta">
            <span class="broadcast-history-badge tribe">部族</span>
            <span class="broadcast-history-author">${escapeBroadcastHtml(record.name)}</span>
            <span class="broadcast-history-countdown">${escapeBroadcastHtml(timeLabel)}</span>
          </div>
          <div class="broadcast-history-footer">
            <span>${escapeBroadcastHtml(footer)}</span>
            <span class="broadcast-history-actions">
              ${
                record.challengeId
                  ? `<span class="broadcast-muted-note">ID ${escapeBroadcastHtml(
                      record.challengeId
                    )}</span>`
                  : ""
              }
              ${
                activeMode
                  ? `<button class="tracker-action-btn" type="button" onclick="dismissBroadcastTribe('${escapeBroadcastHtml(
                      record.key
                    )}')">取消激活</button>`
                  : canRestore
                    ? `<button class="tracker-action-btn" type="button" onclick="restoreBroadcastTribe('${escapeBroadcastHtml(
                        record.key
                      )}')">恢复激活</button>`
                    : ""
              }
            </span>
          </div>
        </div>
      `;
    })
    .join("");
}

function renderBroadcastHistory() {
  const statusLine = getBroadcastElement("broadcast-connection-status");
  const filterInput = getBroadcastElement("broadcast-filter-input");
  const activeList = getBroadcastElement("broadcast-active-list");
  const historyList = getBroadcastElement("broadcast-history-list");

  if (statusLine) {
    statusLine.textContent = `部族通知网络：${broadcastConnection.message} · 当前 ${Math.max(
      1,
      Number(broadcastConnection.peerCount || 0)
    )} 人在线`;
    statusLine.dataset.status = broadcastConnection.status;
  }

  if (filterInput && filterInput.value !== broadcastFilterText) {
    filterInput.value = broadcastFilterText;
  }

  renderBroadcastList(activeList, getActiveBroadcastRecords(), "当前没有激活的部族通知。", true);
  renderBroadcastList(historyList, getInactiveBroadcastRecords(), "暂无历史记录。", false);
}

function ensureBroadcastModalStructure() {
  const modal = getBroadcastElement("broadcast-modal");
  if (!modal) return;

  modal.classList.add("broadcast-window");
  modal.style.display = modal.style.display || "none";
  modal.innerHTML = `
    <div class="modal-header">
      <h3>部族通知</h3>
      <button class="close-modal" type="button" onclick="closeBroadcastModal()">×</button>
    </div>
    <div class="modal-body broadcast-modal-body">
      <div id="broadcast-connection-status" class="broadcast-connection-status">部族通知网络：正在连接...</div>
      <div class="broadcast-toolbar">
        <input
          type="text"
          id="broadcast-filter-input"
          class="translation-input"
          maxlength="40"
          placeholder="筛选部族中文名..."
          oninput="updateBroadcastFilter(this.value)" />
      </div>
      <div class="broadcast-modal-note">中心服务持有唯一正式账本。开始/结束事件都会同步到所有在线客户端；手动取消激活/恢复激活仅影响你自己的显示，不会同步给其他人。</div>
      <div class="broadcast-history-section">
        <div class="broadcast-history-title">正在激活</div>
        <div id="broadcast-active-list" class="broadcast-history-list"></div>
      </div>
      <div class="broadcast-history-section">
        <div class="broadcast-history-title">最近记录</div>
        <div id="broadcast-history-list" class="broadcast-history-list"></div>
      </div>
    </div>
  `;
}

async function connectBroadcastNetwork() {
  if (broadcastSocket) return;
  if (broadcastReconnectTimer) {
    clearTimeout(broadcastReconnectTimer);
    broadcastReconnectTimer = null;
  }

  updateBroadcastConnection("loading", "正在连接...");

  try {
    broadcastServiceEndpoint = await selectBroadcastEndpoint();
    broadcastSocket = new WebSocket(broadcastServiceEndpoint.socket);

    broadcastSocket.addEventListener("open", () => {
      updateBroadcastConnection("loading", `已连接 ${broadcastServiceEndpoint.label}，正在同步...`);
      requestBroadcastSync();
    });

    broadcastSocket.addEventListener("message", (event) => {
      const message = parseBroadcastMessage(event.data);
      if (!message) return;

      if (message.type === "welcome" || message.type === "sync") {
        broadcastPeerId = String(message.sessionId || broadcastPeerId || "");
        if (message.serverKey) {
          currentBroadcastServerKey = normalizeBroadcastServerKey(message.serverKey);
          saveBroadcastServerKey();
        }
        if (message.state) {
          replaceBroadcastLedger(message.state, { notify: true });
        }
        updateBroadcastConnection("ready", `已连接 ${broadcastServiceEndpoint.label}`);
        return;
      }

      if (message.type === "presence") {
        broadcastConnection.peerCount = Math.max(1, Number(message.onlineCount || 0));
        renderBroadcastStrip();
        renderBroadcastHistory();
        return;
      }

      if ((message.type === "tribe-start" || message.type === "tribe-upsert") && message.record) {
        const record = normalizeLedgerRecord(message.record);
        if (!record) return;
        applyServerRecord(record, {
          notify: String(record.senderPeerId || "") !== broadcastPeerId,
        });
        return;
      }

      if ((message.type === "tribe-end" || message.type === "tribe-resolve") && message.record) {
        const record = normalizeLedgerRecord(message.record);
        if (!record) return;
        applyServerRecord(record, { notify: false });
        return;
      }

      if (message.type === "test-ping" && message.record) {
        showNetworkBroadcastTestNotice({
          ...message.record,
          senderPeerId: String(message.record.senderPeerId || ""),
        });
      }
    });

    broadcastSocket.addEventListener("close", () => {
      broadcastSocket = null;
      broadcastPeerId = "";
      broadcastServiceEndpoint = null;
      broadcastConnection.peerCount = 0;
      clearCachedBroadcastEndpoint();
      updateBroadcastConnection("error", "连接已断开");
      scheduleBroadcastReconnect();
    });

    broadcastSocket.addEventListener("error", (error) => {
      console.warn("[Broadcast] network error:", error);
      updateBroadcastConnection("error", "连接失败");
    });
  } catch (error) {
    console.warn("[Broadcast] socket init failed:", error);
    broadcastPeerId = "";
    broadcastServiceEndpoint = null;
    broadcastConnection.peerCount = 0;
    clearCachedBroadcastEndpoint();
    updateBroadcastConnection("error", "通知服务不可用");
    scheduleBroadcastReconnect(15000);
  }
}

function requestBroadcastSync() {
  return sendBroadcastMessage("sync-request", {
    serverKey: getCurrentBroadcastServerKey(),
  });
}

function ensureBroadcastServerControls() {
  const statusLine = getBroadcastElement("broadcast-connection-status");
  if (!statusLine) return;

  const hasServerPicker = statusLine.querySelector("[data-broadcast-server-select]");
  if (!hasServerPicker) {
    statusLine.innerHTML = `
      <span id="broadcast-connection-text">部族通知网络：正在连接...</span>
      <label class="broadcast-server-picker">
        <span>服务器</span>
        <select
          id="broadcast-server-select"
          class="translation-select broadcast-server-select"
          data-broadcast-server-select="modal"
          onchange="window.setBroadcastServerKey(this.value, { source: 'manual' })">${getBroadcastServerOptionsMarkup()}</select>
      </label>
    `;
  }

  syncBroadcastServerSelectors();
}

function updateBroadcastFilter(value) {
  broadcastFilterText = String(value || "").trim();
  renderBroadcastHistory();
}

function registerTribeChallengeDetection(input) {
  const record = buildStartRecord(input);
  if (!record) return false;

  const existing = getCurrentBroadcastServerState().tribes?.[record.key];
  if (existing && recordsShareBroadcastWindow(existing, record) && !isRecordEnded(existing)) {
    return false;
  }

  record.senderPeerId = broadcastPeerId;
  applyServerRecord(record, { notify: true });
  sendBroadcastMessage("tribe-start", { record });
  return true;
}

function showLocalFakeTribeNotice(input = {}) {
  const fakeRecord = {
    ...buildStartRecord({
      challengeId: input.challengeId || "-1932",
      challengeName: input.challengeName || "合作：潘达拉幽灵部族",
      detectedAt: Number(input.detectedAt || Date.now()),
      expiresAt: Number(
        input.expiresAt || Number(input.detectedAt || Date.now()) + TRIBE_NOTICE_DURATION_MS
      ),
    }),
    senderPeerId: "local-preview",
    __preview: true,
  };

  if (!fakeRecord) return false;
  broadcastPreviewTribes[fakeRecord.key] = fakeRecord;
  pruneBroadcastPreviewState();
  renderBroadcastStrip();
  renderBroadcastHistory();
  return true;
}

function showNetworkBroadcastTestNotice(input = {}) {
  const fakeRecord = {
    ...buildStartRecord({
      challengeId: input.challengeId || "TEST-NET",
      challengeName: input.challengeName || "合作：网络测试部族",
      detectedAt: Number(input.detectedAt || Date.now()),
      expiresAt: Number(input.expiresAt || Date.now() + 3 * 60 * 1000),
    }),
    senderPeerId: String(input.senderPeerId || "network-test"),
    __preview: true,
  };

  if (!fakeRecord) return false;
  broadcastPreviewTribes[fakeRecord.key] = fakeRecord;
  pruneBroadcastPreviewState();
  renderBroadcastStrip();
  renderBroadcastHistory();
  return true;
}

function sendNetworkBroadcastTest(input = {}) {
  const payload = {
    challengeId: input.challengeId || "TEST-NET",
    challengeName: input.challengeName || "合作：网络测试部族",
    detectedAt: Number(input.detectedAt || Date.now()),
    expiresAt: Number(input.expiresAt || Date.now() + 3 * 60 * 1000),
    senderPeerId: broadcastPeerId || "network-test",
  };

  showNetworkBroadcastTestNotice(payload);
  return sendBroadcastMessage("test-ping", {
    record: payload,
  });
}

function clearBroadcastNotices() {
  getCurrentBroadcastServerState().tribes = {};
  getCurrentBroadcastViewServerState().dismissed = {};
  saveBroadcastState();
  saveBroadcastViewState();
  renderBroadcastStrip();
  renderBroadcastHistory();
}

function openBroadcastModal() {
  const modal = getBroadcastElement("broadcast-modal");
  if (!modal) return;
  renderBroadcastHistory();
  modal.style.display = "flex";
}

function closeBroadcastModal() {
  const modal = getBroadcastElement("broadcast-modal");
  if (modal) modal.style.display = "none";
}

function initBroadcastRefreshTimer() {
  if (broadcastRefreshTimer) clearInterval(broadcastRefreshTimer);
  broadcastRefreshTimer = setInterval(() => {
    pruneBroadcastState();
    pruneBroadcastViewState();
    pruneBroadcastPreviewState();
    saveBroadcastState();
    saveBroadcastViewState();
    renderBroadcastStrip();
    renderBroadcastHistory();
  }, BROADCAST_REFRESH_MS);
}

function renderBroadcastHistory() {
  const statusLine = getBroadcastElement("broadcast-connection-status");
  const statusText = getBroadcastElement("broadcast-connection-text");
  const statusServerSelect = getBroadcastElement("broadcast-server-select");
  const filterInput = getBroadcastElement("broadcast-filter-input");
  const activeList = getBroadcastElement("broadcast-active-list");
  const historyList = getBroadcastElement("broadcast-history-list");

  if (statusLine) {
    statusLine.dataset.status = broadcastConnection.status;
  }

  if (statusText) {
    statusText.textContent = `部族通知网络：${broadcastConnection.message} · ${Math.max(
      1,
      Number(broadcastConnection.peerCount || 0)
    )} 人在线`;
  }

  if (statusServerSelect && statusServerSelect.value !== getCurrentBroadcastServerKey()) {
    statusServerSelect.value = getCurrentBroadcastServerKey();
  }

  if (filterInput && filterInput.value !== broadcastFilterText) {
    filterInput.value = broadcastFilterText;
  }

  renderBroadcastList(activeList, getActiveBroadcastRecords(), "当前没有激活的部族通知。", true);
  renderBroadcastList(historyList, getInactiveBroadcastRecords(), "暂无历史记录。", false);
}

function initBroadcastSystem() {
  ensureBroadcastModalStructure();
  ensureBroadcastServerControls();
  saveBroadcastServerKey();
  notifyBroadcastServerChanged(getCurrentBroadcastServerKey());
  pruneBroadcastState();
  pruneBroadcastViewState();
  saveBroadcastState();
  saveBroadcastViewState();
  renderBroadcastStrip();
  renderBroadcastHistory();
  initBroadcastRefreshTimer();
  connectBroadcastNetwork();
}

window.initBroadcastSystem = initBroadcastSystem;
window.openBroadcastModal = openBroadcastModal;
window.closeBroadcastModal = closeBroadcastModal;
window.clearBroadcastNotices = clearBroadcastNotices;
window.updateBroadcastFilter = updateBroadcastFilter;
window.registerTribeChallengeDetection = registerTribeChallengeDetection;
window.resolveBroadcastTribeLocal = resolveBroadcastTribeLocal;
window.resolveBroadcastTribe = resolveBroadcastTribe;
window.showLocalFakeTribeNotice = showLocalFakeTribeNotice;
window.sendNetworkBroadcastTest = sendNetworkBroadcastTest;
window.dismissBroadcastTribe = dismissBroadcastTribe;
window.restoreBroadcastTribe = restoreBroadcastTribe;
window.getCurrentBroadcastServerKey = getCurrentBroadcastServerKey;
window.setBroadcastServerKey = function setBroadcastServerKey(serverKey, options = {}) {
  const { source = "auto" } = options;
  const nextServerKey = normalizeBroadcastServerKey(serverKey);
  if (nextServerKey === "unknown") return false;
  if (nextServerKey === currentBroadcastServerKey) {
    if (source === "manual") {
      notifyBroadcastServerChanged(nextServerKey);
      requestBroadcastSync();
    }
    return false;
  }
  currentBroadcastServerKey = nextServerKey;
  broadcastConnection.peerCount = 0;
  resetBroadcastServerCache(nextServerKey);
  saveBroadcastServerKey();
  pruneBroadcastState();
  pruneBroadcastViewState();
  saveBroadcastState();
  saveBroadcastViewState();
  renderBroadcastStrip();
  renderBroadcastHistory();
  notifyBroadcastServerChanged(nextServerKey);
  requestBroadcastSync();
  return true;
};
