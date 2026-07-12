const BROADCAST_STORAGE_KEY = "wakfu_tribe_broadcast_state_v5";
const BROADCAST_VIEW_STORAGE_KEY = "wakfu_tribe_broadcast_view_v3";
const BROADCAST_LEGACY_STORAGE_KEYS = ["wakfu_tribe_broadcast_state_v4"];
const BROADCAST_LEGACY_VIEW_KEYS = ["wakfu_tribe_broadcast_view_v2"];
const BROADCAST_SERVER_KEY_STORAGE = "wakfu_tribe_current_server_v1";
const BROADCAST_CLIENT_ID_STORAGE_KEY = "wakfu_tribe_broadcast_client_id_v1";
const BROADCAST_ENDPOINT_CACHE_KEY = "wakfu_tribe_broadcast_endpoint_v2";
const BROADCAST_ENDPOINT_CACHE_TTL_MS = 5 * 60 * 1000;
const BROADCAST_REFRESH_MS = 1000;
const BROADCAST_POLL_INTERVAL_MS = 10 * 1000;
const BROADCAST_HEARTBEAT_INTERVAL_MS = 30 * 1000;
const BROADCAST_REQUEST_TIMEOUT_MS = 6000;
const BROADCAST_MAX_RECORDS = 200;
const TRIBE_NOTICE_DURATION_MS = 30 * 60 * 1000;
const KNOWN_BROADCAST_SERVERS = new Set(["ogrest", "rubilax", "pandora"]);
const BROADCAST_SERVER_OPTIONS = [
  { value: "ogrest", label: "Ogrest" },
  { value: "rubilax", label: "Rubilax" },
  { value: "pandora", label: "Pandora" },
];
const BROADCAST_SERVICE_CANDIDATES = [
  {
    id: "oracle",
    label: "Oracle HTTPS",
    baseUrl: "https://168.110.57.124.sslip.io/api/broadcast",
  },
  {
    id: "cloudflare",
    label: "Cloudflare HTTPS",
    baseUrl: "https://wakfu-tribe-sync.q1541599745.workers.dev/api/broadcast",
  },
];

let broadcastRefreshTimer = null;
let broadcastPollTimer = null;
let broadcastHeartbeatTimer = null;
let broadcastFilterText = "";
let currentBroadcastServerKey = loadBroadcastServerKey();
let broadcastState = loadBroadcastState();
let broadcastViewState = loadBroadcastViewState();
let broadcastPreviewTribes = {};
let broadcastClientId = loadBroadcastClientId();
let broadcastCursor = 0;
let broadcastTransportStatus = {
  endpoint: null,
  lastSnapshotAt: 0,
  lastPollAt: 0,
  lastHeartbeatAt: 0,
};
let broadcastConnection = {
  status: "idle",
  message: "部族通知网络未启动。",
  peerCount: 0,
};
let broadcastSnapshotInFlight = null;
let broadcastPollInFlight = null;
let broadcastHeartbeatInFlight = null;
let broadcastNetworkEnabled = false;
let broadcastNetworkStarted = false;

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

function loadBroadcastClientId() {
  try {
    const existing = String(localStorage.getItem(BROADCAST_CLIENT_ID_STORAGE_KEY) || "").trim();
    if (existing) return existing;
    const nextId =
      "client-" +
      Math.random().toString(36).slice(2, 10) +
      "-" +
      Date.now().toString(36);
    localStorage.setItem(BROADCAST_CLIENT_ID_STORAGE_KEY, nextId);
    return nextId;
  } catch (error) {
    return "client-" + Date.now().toString(36);
  }
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

function updateBroadcastWaitingStatus() {
  if (broadcastNetworkEnabled) return;
  updateBroadcastConnection("idle", "Waiting for wakfu.log + wakfu_chat.log");
}

function loadStoredJson(keys, fallbackFactory) {
  const allKeys = Array.isArray(keys) ? keys : [keys];
  for (const key of allKeys) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      return JSON.parse(raw);
    } catch (error) {}
  }
  return fallbackFactory();
}

function loadBroadcastState() {
  const parsed = loadStoredJson([BROADCAST_STORAGE_KEY, ...BROADCAST_LEGACY_STORAGE_KEYS], () => ({}));
  return normalizeLedgerState(parsed);
}

function saveBroadcastState() {
  localStorage.setItem(BROADCAST_STORAGE_KEY, JSON.stringify(broadcastState));
}

function loadBroadcastViewState() {
  const parsed = loadStoredJson([BROADCAST_VIEW_STORAGE_KEY, ...BROADCAST_LEGACY_VIEW_KEYS], () => ({}));
  return normalizeBroadcastViewState(parsed);
}

function saveBroadcastViewState() {
  localStorage.setItem(BROADCAST_VIEW_STORAGE_KEY, JSON.stringify(broadcastViewState));
}

function loadCachedBroadcastEndpoint() {
  try {
    const cached = JSON.parse(sessionStorage.getItem(BROADCAST_ENDPOINT_CACHE_KEY) || "null");
    if (!cached || !cached.id || !cached.baseUrl || !cached.cachedAt) return null;
    if (Date.now() - Number(cached.cachedAt || 0) > BROADCAST_ENDPOINT_CACHE_TTL_MS) return null;
    return getAvailableBroadcastCandidates().find((candidate) => candidate.id === cached.id) || null;
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
      baseUrl: candidate.baseUrl,
      cachedAt: Date.now(),
    })
  );
}

function clearCachedBroadcastEndpoint() {
  sessionStorage.removeItem(BROADCAST_ENDPOINT_CACHE_KEY);
}

function getAvailableBroadcastCandidates() {
  return BROADCAST_SERVICE_CANDIDATES.filter((candidate) => {
    if (window.location.protocol !== "https:") return true;
    return candidate.baseUrl.startsWith("https://");
  });
}

function getBroadcastElement(id) {
  if (typeof getUI === "function") return getUI(id);
  return document.getElementById(id);
}

function getBroadcastChallengeLevelInfo(record) {
  const challengeId = String(record?.challengeId || "").trim();
  if (!challengeId) return null;
  if (typeof getTribeChallengeLevelInfo !== "function") return null;
  return getTribeChallengeLevelInfo(challengeId);
}

function getBroadcastChallengeLevelLabel(record) {
  const levelInfo = getBroadcastChallengeLevelInfo(record);
  const displayLevel = Number(levelInfo?.displayLevel || 0);
  if (!Number.isFinite(displayLevel) || displayLevel <= 0) return "";
  return `${displayLevel}级`;
}

function getBroadcastChallengeMetaLabel(record) {
  const challengeId = String(record?.challengeId || "").trim();
  if (!challengeId) return "";

  const location =
    typeof getTribeChallengeLocation === "function"
      ? String(getTribeChallengeLocation(challengeId) || "").trim()
      : "";
  const levelLabel = getBroadcastChallengeLevelLabel(record);

  if (location && levelLabel) return `${location} ${levelLabel}`;
  if (location) return location;
  if (levelLabel) return levelLabel;
  return `ID ${challengeId}`;
}

function getBroadcastHoverLocation(record) {
  const challengeId = String(record?.challengeId || "").trim();
  if (!challengeId) return "";
  if (typeof getTribeChallengeLocation !== "function") return "";
  return String(getTribeChallengeLocation(challengeId) || "").trim();
}

function getBroadcastFilterTerms(record) {
  const terms = new Set();
  const name = String(record?.name || "").trim();
  const location = getBroadcastHoverLocation(record);
  const levelInfo = getBroadcastChallengeLevelInfo(record);
  const displayLevel = Number(levelInfo?.displayLevel || 0);
  const minLevel = Number(levelInfo?.minLevel || 0);
  const maxLevel = Number(levelInfo?.maxLevel || 0);

  if (name) {
    terms.add(name);
    terms.add(name.toLowerCase());
  }
  if (location) {
    terms.add(location);
    terms.add(location.toLowerCase());
  }
  if (Number.isFinite(displayLevel) && displayLevel > 0) {
    terms.add(String(displayLevel));
    terms.add(`${displayLevel}级`);
  }
  if (Number.isFinite(minLevel) && minLevel > 0 && Number.isFinite(maxLevel) && maxLevel > 0) {
    terms.add(`${minLevel}-${maxLevel}`);
    terms.add(`${minLevel}~${maxLevel}`);
    terms.add(`${minLevel}至${maxLevel}`);
  }
  if (record?.challengeId) {
    terms.add(String(record.challengeId));
  }

  return Array.from(terms)
    .join(" ")
    .toLowerCase();
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
    .replace(/^(?:\u90e8\u65cf|\u5408\u4f5c)(?:\:|\uFF1A)?\s*/, "")
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
  const elapsedMs = Math.max(0, Date.now() - sanitizeBroadcastTimestamp(timestamp));
  const totalMinutes = Math.floor(elapsedMs / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0) return `${hours}小时${minutes}分钟`;
  return `${minutes}分钟`;
}

function formatElapsedDuration(timestamp) {
  const elapsedMs = Math.max(0, Date.now() - sanitizeBroadcastTimestamp(timestamp));
  const totalSeconds = Math.floor(elapsedMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function sanitizeBroadcastTimestamp(timestamp, fallback = Date.now()) {
  const numeric = Number(timestamp || 0);
  if (!Number.isFinite(numeric) || numeric <= 0) return fallback;
  return Math.min(numeric, Date.now());
}

function normalizeLedgerRecord(record) {
  if (!record) return null;
  const name = normalizeTribeName(record.name || record.challengeName || "");
  const key = String(record.key || getTribeRecordKey(name)).trim().toLowerCase();
  if (!name || !key) return null;

  const activatedAt = sanitizeBroadcastTimestamp(record.activatedAt || record.detectedAt || Date.now());
  const rawEndedAt = Number(record.endedAt || 0);
  const endedAt =
    Number.isFinite(rawEndedAt) && rawEndedAt > 0
      ? Math.max(activatedAt, sanitizeBroadcastTimestamp(rawEndedAt, activatedAt))
      : 0;
  const expiresAt = Math.max(
    activatedAt + TRIBE_NOTICE_DURATION_MS,
    Number(record.expiresAt || activatedAt + TRIBE_NOTICE_DURATION_MS)
  );

  return {
    key,
    serverKey: normalizeBroadcastServerKey(
      record.serverKey || record.server || record.serverName || getCurrentBroadcastServerKey()
    ),
    name,
    challengeId: String(record.challengeId || ""),
    activatedAt,
    expiresAt,
    updatedAt: Math.max(
      activatedAt,
      endedAt || 0,
      sanitizeBroadcastTimestamp(record.updatedAt || Math.max(activatedAt, endedAt || 0) || Date.now())
    ),
    endedAt,
    senderClientId: String(record.senderClientId || ""),
  };
}

function normalizeLedgerState(input) {
  const next = { servers: {} };
  const sourceServers =
    input && typeof input.servers === "object" && !Array.isArray(input.servers) ? input.servers : null;

  if (sourceServers) {
    Object.entries(sourceServers).forEach(([serverKey, serverState]) => {
      const normalizedServerKey = normalizeBroadcastServerKey(serverKey);
      if (normalizedServerKey === "unknown") return;
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
      if (normalizedServerKey === "unknown") return;
      const dismissed =
        serverState && typeof serverState.dismissed === "object" && !Array.isArray(serverState.dismissed)
          ? serverState.dismissed
          : {};
      next.servers[normalizedServerKey] = { dismissed };
    });
    return next;
  }

  const legacyDismissed =
    input && typeof input.dismissed === "object" && !Array.isArray(input.dismissed) ? input.dismissed : {};
  if (Object.keys(legacyDismissed).length) {
    next.servers[getCurrentBroadcastServerKey()] = { dismissed: legacyDismissed };
  }
  return next;
}

function replaceBroadcastLedger(state, options = {}) {
  const { notify = false } = options;
  const serverKey = getCurrentBroadcastServerKey();
  const previousRecords = { ...(getCurrentBroadcastServerState().tribes || {}) };
  const normalizedInput = normalizeLedgerState(state || {});
  const nextServerState = normalizedInput.servers?.[serverKey] || createEmptyBroadcastServerState();
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
      String(record.senderClientId || "") !== broadcastClientId &&
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
      return getBroadcastFilterTerms(record).includes(filterValue);
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

async function fetchJsonWithTimeout(url, options = {}, timeoutMs = BROADCAST_REQUEST_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        ...(options.headers || {}),
      },
    });
    const text = await response.text();
    let payload = null;
    try {
      payload = text ? JSON.parse(text) : null;
    } catch (error) {
      payload = null;
    }
    if (!response.ok) {
      throw new Error(
        payload?.error || payload?.message || `${response.status} ${response.statusText}`.trim()
      );
    }
    return payload;
  } finally {
    clearTimeout(timer);
  }
}

async function probeBroadcastEndpoint(candidate, timeoutMs = 2500) {
  const startedAt = performance.now();
  await fetchJsonWithTimeout(`${candidate.baseUrl}/health`, { method: "GET", cache: "no-store" }, timeoutMs);
  return {
    candidate,
    latency: Math.round(performance.now() - startedAt),
  };
}

async function selectBroadcastEndpoint(forceRefresh = false) {
  if (!forceRefresh) {
    const cached = loadCachedBroadcastEndpoint();
    if (cached) return cached;
  }

  const candidates = getAvailableBroadcastCandidates();
  if (!candidates.length) throw new Error("没有可用的部族通知服务地址。");

  const results = await Promise.allSettled(candidates.map((candidate) => probeBroadcastEndpoint(candidate)));
  const success = results
    .filter((result) => result.status === "fulfilled")
    .map((result) => result.value)
    .sort((left, right) => left.latency - right.latency);

  if (!success.length) throw new Error("没有可达的部族通知服务。");

  saveCachedBroadcastEndpoint(success[0].candidate);
  return success[0].candidate;
}

async function getSelectedBroadcastEndpoint(forceRefresh = false) {
  if (broadcastTransportStatus.endpoint && !forceRefresh) {
    return broadcastTransportStatus.endpoint;
  }
  const endpoint = await selectBroadcastEndpoint(forceRefresh);
  broadcastTransportStatus.endpoint = endpoint;
  return endpoint;
}

function buildBroadcastApiUrl(baseUrl, path, params) {
  const url = new URL(baseUrl + path);
  if (params && typeof params === "object") {
    Object.entries(params).forEach(([key, value]) => {
      if (value == null || value === "") return;
      url.searchParams.set(key, String(value));
    });
  }
  return url.toString();
}

function clearBroadcastEndpointSelection() {
  broadcastTransportStatus.endpoint = null;
  clearCachedBroadcastEndpoint();
}

async function callBroadcastApi(path, options = {}) {
  const { method = "GET", params = null, body = null, forceEndpointRefresh = false } = options;
  let endpoint = await getSelectedBroadcastEndpoint(forceEndpointRefresh);
  let lastError = null;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const url = buildBroadcastApiUrl(endpoint.baseUrl, path, params);
      return await fetchJsonWithTimeout(
        url,
        {
          method,
          cache: "no-store",
          headers: body ? { "Content-Type": "application/json" } : {},
          body: body ? JSON.stringify(body) : undefined,
        },
        BROADCAST_REQUEST_TIMEOUT_MS
      );
    } catch (error) {
      lastError = error;
      clearBroadcastEndpointSelection();
      endpoint = await getSelectedBroadcastEndpoint(true);
    }
  }

  throw lastError || new Error("部族通知请求失败。");
}

function setBroadcastPeerCount(count) {
  broadcastConnection.peerCount = Math.max(1, Number(count || 0));
  renderBroadcastStrip();
  renderBroadcastHistory();
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

function applyBroadcastEvents(events = []) {
  let changed = false;

  events.forEach((event) => {
    if (!event || typeof event !== "object") return;

    const eventCursor = Number(event.cursor || 0);
    if (eventCursor > broadcastCursor) {
      broadcastCursor = eventCursor;
    }

    if (event.type === "presence-summary") {
      setBroadcastPeerCount(event.onlineCount);
      return;
    }

    if ((event.type === "tribe-upsert" || event.type === "tribe-start") && event.record) {
      changed =
        applyServerRecord(event.record, {
          notify: String(event.record.senderClientId || "") !== broadcastClientId,
        }) || changed;
      return;
    }

    if ((event.type === "tribe-end" || event.type === "tribe-resolve") && event.record) {
      changed = applyServerRecord(event.record, { notify: false }) || changed;
    }
  });

  return changed;
}

async function refreshBroadcastSnapshot(options = {}) {
  if (!broadcastNetworkEnabled) {
    updateBroadcastWaitingStatus();
    return null;
  }
  if (broadcastSnapshotInFlight) return broadcastSnapshotInFlight;

  const { notify = false, reason = "snapshot" } = options;
  broadcastSnapshotInFlight = (async () => {
    updateBroadcastConnection("loading", `\u6b63\u5728\u540c\u6b65\u8d26\u672c\uff1a${reason}...`);

    const response = await callBroadcastApi("/tribes/snapshot", {
      params: { server: getCurrentBroadcastServerKey() },
    });

    if (response?.serverKey) {
      const normalized = normalizeBroadcastServerKey(response.serverKey);
      if (normalized !== "unknown" && normalized !== getCurrentBroadcastServerKey()) {
        currentBroadcastServerKey = normalized;
        saveBroadcastServerKey();
        notifyBroadcastServerChanged(normalized);
      }
    }

    if (response?.state) {
      replaceBroadcastLedger(response.state, { notify });
    }
    if (Number(response?.cursor || 0) > 0) {
      broadcastCursor = Number(response.cursor || 0);
    }
    if (response?.onlineCount != null) {
      setBroadcastPeerCount(response.onlineCount);
    }

    broadcastTransportStatus.lastSnapshotAt = Date.now();
    updateBroadcastConnection("ready", "\u5df2\u8fde\u63a5");
    return response;
  })()
    .catch((error) => {
      updateBroadcastConnection("error", `同步失败：${error.message || error}`);
      throw error;
    })
    .finally(() => {
      broadcastSnapshotInFlight = null;
    });

  return broadcastSnapshotInFlight;
}

async function pollBroadcastUpdates(reason = "poll") {
  if (!broadcastNetworkEnabled) {
    updateBroadcastWaitingStatus();
    return null;
  }
  if (broadcastPollInFlight) return broadcastPollInFlight;

  broadcastPollInFlight = (async () => {
    try {
      const response = await callBroadcastApi("/tribes/updates", {
        params: {
          server: getCurrentBroadcastServerKey(),
          since: broadcastCursor,
        },
      });

      if (response?.serverKey) {
        const normalized = normalizeBroadcastServerKey(response.serverKey);
        if (normalized !== "unknown" && normalized !== getCurrentBroadcastServerKey()) {
          currentBroadcastServerKey = normalized;
          saveBroadcastServerKey();
          notifyBroadcastServerChanged(normalized);
        }
      }

      if (Array.isArray(response?.events)) {
        applyBroadcastEvents(response.events);
      }
      if (Number(response?.cursor || 0) > broadcastCursor) {
        broadcastCursor = Number(response.cursor || 0);
      }
      if (response?.onlineCount != null) {
        setBroadcastPeerCount(response.onlineCount);
      }

      broadcastTransportStatus.lastPollAt = Date.now();
      if (broadcastConnection.status !== "ready") {
        updateBroadcastConnection("ready", "\u5df2\u8fde\u63a5");
      }
      return response;
    } catch (error) {
      updateBroadcastConnection("error", `增量同步失败：${error.message || error}`);
      if (reason !== "switch-server") {
        await refreshBroadcastSnapshot({ notify: true, reason: "recover" }).catch(() => {});
      }
      throw error;
    } finally {
      broadcastPollInFlight = null;
    }
  })();

  return broadcastPollInFlight;
}

async function sendBroadcastHeartbeat() {
  if (!broadcastNetworkEnabled) {
    updateBroadcastWaitingStatus();
    return null;
  }
  if (broadcastHeartbeatInFlight) return broadcastHeartbeatInFlight;

  broadcastHeartbeatInFlight = callBroadcastApi("/presence/heartbeat", {
    method: "POST",
    body: {
      clientId: broadcastClientId,
      serverKey: getCurrentBroadcastServerKey(),
      clientTime: Date.now(),
    },
  })
    .then((response) => {
      if (response?.onlineCount != null) {
        setBroadcastPeerCount(response.onlineCount);
      }
      if (Number(response?.cursor || 0) > broadcastCursor) {
        broadcastCursor = Number(response.cursor || 0);
      }
      broadcastTransportStatus.lastHeartbeatAt = Date.now();
      return response;
    })
    .finally(() => {
      broadcastHeartbeatInFlight = null;
    });

  return broadcastHeartbeatInFlight;
}

function buildStartRecord(input) {
  const normalizedName = normalizeTribeName(input?.challengeName || input?.name || "");
  if (!normalizedName) return null;

  const activatedAt = sanitizeBroadcastTimestamp(input?.activatedAt || input?.detectedAt || Date.now());
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
    senderClientId: String(input?.senderClientId || broadcastClientId),
  };
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

async function resolveBroadcastTribe(input) {
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

  try {
    const response = await callBroadcastApi("/tribes/end", {
      method: "POST",
      body: {
        key: recordKey,
        challengeName: record.name,
        challengeId: record.challengeId,
        serverKey: record.serverKey || getCurrentBroadcastServerKey(),
        resolvedAt,
        senderClientId: broadcastClientId,
      },
    });

    if (response?.record) {
      applyServerRecord(response.record, { notify: false });
    }
    if (Number(response?.cursor || 0) > broadcastCursor) {
      broadcastCursor = Number(response.cursor || 0);
    }
    if (response?.onlineCount != null) {
      setBroadcastPeerCount(response.onlineCount);
    }
  } catch (error) {
    console.warn("[Broadcast] resolve failed:", error);
  }

  return true;
}

function getBroadcastStripName(name) {
  return String(name || "")
    .replace(/^\u5408\u4f5c(?:\:|\uFF1A)?\s*/, "")
    .replace(/\u90e8\u65cf$/, "")
    .trim();
}
function renderBroadcastStrip() {
  const strip = getBroadcastElement("chat-broadcast-strip");
  if (!strip) return;

  const latestRecord = getLatestActiveBroadcastRecord();
  if (!latestRecord) {
    strip.innerHTML = `
      <button id="broadcast-strip-pill" class="broadcast-pill empty" type="button" onclick="openBroadcastModal()">
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
    <button id="broadcast-strip-pill" class="broadcast-pill tribe" type="button" onclick="openBroadcastModal()">
      <span class="broadcast-pill-type">部族</span>
      <span class="broadcast-pill-text">${escapeBroadcastHtml(stripName)}</span>
      <span class="broadcast-pill-countdown">${escapeBroadcastHtml(
        formatElapsedDuration(latestRecord.activatedAt)
      )}</span>
    </button>
  `;
  const hoverLocation = getBroadcastHoverLocation(latestRecord);
  const hoverLevel = getBroadcastChallengeLevelLabel(latestRecord);
  strip.title = [
    latestRecord.name,
    hoverLocation ? `地点：${hoverLocation}` : "",
    hoverLevel ? `等级：${hoverLevel}` : "",
    `本轮开始于：${formatBroadcastTime(latestRecord.activatedAt)}`,
  ]
    .filter(Boolean)
    .join("\n");
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
      const canRestore =
        !activeMode && !record.__preview && canRestoreRecord(record) && isLocallyDismissed(record.key);
      const challengeMetaLabel = getBroadcastChallengeMetaLabel(record);

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
                  ? `<span class="broadcast-muted-note" title="ID ${escapeBroadcastHtml(
                      record.challengeId
                    )}">${escapeBroadcastHtml(challengeMetaLabel)}</span>`
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
  const statusText = getBroadcastElement("broadcast-connection-text");
  const statusServerSelect = getBroadcastElement("broadcast-server-select");
  const filterInput = getBroadcastElement("broadcast-filter-input");
  const activeList = getBroadcastElement("broadcast-active-list");
  const historyList = getBroadcastElement("broadcast-history-list");

  if (statusLine) {
    statusLine.dataset.status = broadcastConnection.status;
  }

  if (statusText) {
    const endpointLabel = broadcastTransportStatus.endpoint?.label
      ? ` | ${broadcastTransportStatus.endpoint.label}`
      : "";
    statusText.textContent = `\u90e8\u65cf\u901a\u77e5\u7f51\u7edc\uff1a${broadcastConnection.message}${endpointLabel} | ${Math.max(
      1,
      Number(broadcastConnection.peerCount || 0)
    )}\u4eba\u5728\u7ebf`;
  } else if (statusLine) {
    const endpointLabel = broadcastTransportStatus.endpoint?.label
      ? ` | ${broadcastTransportStatus.endpoint.label}`
      : "";
    statusLine.textContent = `\u90e8\u65cf\u901a\u77e5\u7f51\u7edc\uff1a${broadcastConnection.message}${endpointLabel} | ${Math.max(
      1,
      Number(broadcastConnection.peerCount || 0)
    )}\u4eba\u5728\u7ebf`;
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
          placeholder="筛选部族名、地点或等级..."
          oninput="updateBroadcastFilter(this.value)" />
      </div>
      <div class="broadcast-modal-note">中心服务持有唯一正式账本。开始/结束事件会同步到所有在线客户端；手动取消激活/恢复激活仅影响你自己的显示，不会同步给其他人。</div>
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

function isBroadcastServerMismatch(serverKey) {
  return normalizeBroadcastServerKey(serverKey) !== getCurrentBroadcastServerKey();
}

async function registerTribeChallengeDetection(input) {
  const record = buildStartRecord(input);
  if (!record) return false;
  if (isBroadcastServerMismatch(record.serverKey)) return false;
  if (Number(record.expiresAt || 0) <= Date.now()) return false;

  const existing = getCurrentBroadcastServerState().tribes?.[record.key];
  if (
    existing &&
    recordsShareBroadcastWindow(existing, record) &&
    Number(record.activatedAt || 0) <= Number(existing.updatedAt || existing.activatedAt || 0)
  ) {
    return false;
  }
  if (existing && recordsShareBroadcastWindow(existing, record) && !isRecordEnded(existing)) {
    return false;
  }
  applyServerRecord(record, { notify: true });

  try {
    const response = await callBroadcastApi("/tribes/publish", {
      method: "POST",
      body: {
        record,
        clientId: broadcastClientId,
      },
    });
    if (response?.record) {
      applyServerRecord(response.record, { notify: false });
    }
    if (Number(response?.cursor || 0) > broadcastCursor) {
      broadcastCursor = Number(response.cursor || 0);
    }
    if (response?.onlineCount != null) {
      setBroadcastPeerCount(response.onlineCount);
    }
  } catch (error) {
    console.warn("[Broadcast] publish failed:", error);
  }

  return true;
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

function initBroadcastPollTimer() {
  if (broadcastPollTimer) clearInterval(broadcastPollTimer);
  if (!broadcastNetworkEnabled) return;
  broadcastPollTimer = setInterval(() => {
    pollBroadcastUpdates("interval").catch(() => {});
  }, BROADCAST_POLL_INTERVAL_MS);
}

function initBroadcastHeartbeatTimer() {
  if (broadcastHeartbeatTimer) clearInterval(broadcastHeartbeatTimer);
  if (!broadcastNetworkEnabled) return;
  broadcastHeartbeatTimer = setInterval(() => {
    sendBroadcastHeartbeat().catch(() => {});
  }, BROADCAST_HEARTBEAT_INTERVAL_MS);
}

async function connectBroadcastNetworkLegacy() {
  updateBroadcastConnection("loading", "正在连接...");
  try {
    await refreshBroadcastSnapshot({ notify: true, reason: "init" });
    await sendBroadcastHeartbeat().catch(() => {});
  } catch (error) {
    console.warn("[Broadcast] init failed:", error);
  }
}

function connectBroadcastNetwork(reason = "init") {
  if (!broadcastNetworkEnabled) {
    updateBroadcastWaitingStatus();
    return Promise.resolve();
  }

  updateBroadcastConnection("loading", "Connecting...");
  return refreshBroadcastSnapshot({ notify: true, reason })
    .then(() => sendBroadcastHeartbeat().catch(() => {}))
    .catch((error) => {
      console.warn("[Broadcast] init failed:", error);
    });
}

function startBroadcastNetwork(reason = "logs-ready") {
  if (!broadcastNetworkEnabled || broadcastNetworkStarted) return false;
  broadcastNetworkStarted = true;
  initBroadcastPollTimer();
  initBroadcastHeartbeatTimer();
  connectBroadcastNetwork(reason);
  return true;
}

function enableBroadcastNetwork(reason = "logs-ready") {
  if (broadcastNetworkEnabled) return startBroadcastNetwork(reason);
  broadcastNetworkEnabled = true;
  return startBroadcastNetwork(reason);
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
  updateBroadcastWaitingStatus();
}

window.initBroadcastSystem = initBroadcastSystem;
window.openBroadcastModal = openBroadcastModal;
window.closeBroadcastModal = closeBroadcastModal;
window.clearBroadcastNotices = clearBroadcastNotices;
window.updateBroadcastFilter = updateBroadcastFilter;
window.registerTribeChallengeDetection = registerTribeChallengeDetection;
window.resolveBroadcastTribeLocal = resolveBroadcastTribeLocal;
window.resolveBroadcastTribe = resolveBroadcastTribe;

window.dismissBroadcastTribe = dismissBroadcastTribe;
window.restoreBroadcastTribe = restoreBroadcastTribe;
window.getCurrentBroadcastServerKey = getCurrentBroadcastServerKey;
window.enableBroadcastNetwork = enableBroadcastNetwork;
window.setBroadcastServerKey = function setBroadcastServerKey(serverKey, options = {}) {
  const { source = "auto" } = options;
  const nextServerKey = normalizeBroadcastServerKey(serverKey);
  if (nextServerKey === "unknown") return false;

  if (nextServerKey === currentBroadcastServerKey) {
    if (source === "manual") {
      notifyBroadcastServerChanged(nextServerKey);
      resetBroadcastServerCache(nextServerKey);
      saveBroadcastState();
      saveBroadcastViewState();
      broadcastCursor = 0;
      if (broadcastNetworkEnabled) {
        refreshBroadcastSnapshot({ notify: true, reason: "manual-refresh" }).catch(() => {});
      } else {
        updateBroadcastWaitingStatus();
      }
    }
    return false;
  }

  currentBroadcastServerKey = nextServerKey;
  resetBroadcastServerCache(nextServerKey);
  broadcastCursor = 0;
  broadcastConnection.peerCount = 0;
  saveBroadcastServerKey();
  pruneBroadcastState();
  pruneBroadcastViewState();
  saveBroadcastState();
  saveBroadcastViewState();
  renderBroadcastStrip();
  renderBroadcastHistory();
  notifyBroadcastServerChanged(nextServerKey);
  if (broadcastNetworkEnabled) {
    refreshBroadcastSnapshot({ notify: true, reason: "switch-server" }).catch(() => {});
    sendBroadcastHeartbeat().catch(() => {});
  } else {
    updateBroadcastWaitingStatus();
  }
  return true;
};
