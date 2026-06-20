const BROADCAST_STORAGE_KEY = "wakfu_tribe_broadcast_state_v3";
const BROADCAST_VIEW_STORAGE_KEY = "wakfu_tribe_broadcast_view_v1";
const BROADCAST_SERVICE_URL = "wss://wakfu-tribe-sync.q1541599745.workers.dev/connect";
const TRIBE_NOTICE_DURATION_MS = 30 * 60 * 1000;
const BROADCAST_REFRESH_MS = 1000;
const BROADCAST_MAX_RECORDS = 200;

let broadcastSocket = null;
let broadcastPeerId = "";
let broadcastRefreshTimer = null;
let broadcastReconnectTimer = null;
let broadcastFilterText = "";
let broadcastState = loadBroadcastState();
let broadcastViewState = loadBroadcastViewState();
let broadcastPreviewTribes = {};
let broadcastConnection = {
  status: "idle",
  message: "部族通知网络未启动。",
  peerCount: 0,
};

function loadBroadcastState() {
  try {
    const parsed = JSON.parse(localStorage.getItem(BROADCAST_STORAGE_KEY) || "{}");
    return normalizeLedgerState(parsed);
  } catch (error) {
    return { tribes: {} };
  }
}

function saveBroadcastState() {
  localStorage.setItem(BROADCAST_STORAGE_KEY, JSON.stringify(broadcastState));
}

function loadBroadcastViewState() {
  try {
    const parsed = JSON.parse(localStorage.getItem(BROADCAST_VIEW_STORAGE_KEY) || "{}");
    return {
      dismissed:
        parsed && typeof parsed.dismissed === "object" && !Array.isArray(parsed.dismissed)
          ? parsed.dismissed
          : {},
    };
  } catch (error) {
    return { dismissed: {} };
  }
}

function saveBroadcastViewState() {
  localStorage.setItem(BROADCAST_VIEW_STORAGE_KEY, JSON.stringify(broadcastViewState));
}

function getBroadcastElement(id) {
  if (typeof getUI === "function") return getUI(id);
  return document.getElementById(id);
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
  const next = { tribes: {} };
  const source = input && typeof input.tribes === "object" && !Array.isArray(input.tribes) ? input.tribes : {};

  Object.values(source).forEach((record) => {
    const normalized = normalizeLedgerRecord(record);
    if (!normalized) return;
    next.tribes[normalized.key] = normalized;
  });

  return next;
}

function replaceBroadcastLedger(state, options = {}) {
  const { notify = false } = options;
  const previousRecords = { ...(broadcastState.tribes || {}) };
  const nextState = normalizeLedgerState(state);
  const nextRecords = Object.values(nextState.tribes || {});

  broadcastState = nextState;
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
  const nextTribes = {};
  const records = Object.values(broadcastState.tribes || {})
    .map(normalizeLedgerRecord)
    .filter(Boolean)
    .sort((left, right) => Number(right.updatedAt || 0) - Number(left.updatedAt || 0))
    .slice(0, BROADCAST_MAX_RECORDS);

  records.forEach((record) => {
    nextTribes[record.key] = record;
  });

  broadcastState.tribes = nextTribes;
}

function pruneBroadcastViewState() {
  const nextDismissed = {};

  Object.entries(broadcastViewState.dismissed || {}).forEach(([key, dismissedAt]) => {
    const record = broadcastState.tribes?.[key];
    if (!record) return;
    if (!canRestoreRecord(record) && !isLocallyDismissed(key)) return;
    if (canRestoreRecord(record)) {
      nextDismissed[key] = Number(dismissedAt || 0);
    }
  });

  broadcastViewState.dismissed = nextDismissed;
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
  const filterValue = broadcastFilterText.trim().toLowerCase();
  return [...Object.values(broadcastState.tribes || {}), ...Object.values(broadcastPreviewTribes || {})]
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
  return Number(broadcastViewState.dismissed?.[recordKey] || 0) > 0;
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
  return {
    key: getTribeRecordKey(normalizedName),
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

  const existing = broadcastState.tribes[normalized.key];
  const changed = JSON.stringify(existing || null) !== JSON.stringify(normalized);
  const shouldNotify = notify && shouldNotifyForActivatedRecord(existing, normalized);

  broadcastState.tribes[normalized.key] = normalized;
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
  const record = broadcastState.tribes?.[recordKey];
  if (!canRestoreRecord(record)) return false;

  broadcastViewState.dismissed[recordKey] = Date.now();
  saveBroadcastViewState();
  renderBroadcastStrip();
  renderBroadcastHistory();
  return true;
}

function restoreBroadcastTribe(recordKey) {
  const record = broadcastState.tribes?.[recordKey];
  if (!canRestoreRecord(record)) return false;
  delete broadcastViewState.dismissed[recordKey];
  saveBroadcastViewState();
  renderBroadcastStrip();
  renderBroadcastHistory();
  return true;
}

function resolveBroadcastTribeLocal(input) {
  const recordKey = getTribeRecordKey(input?.challengeName || input?.name || "");
  if (!recordKey) return false;

  const record = broadcastState.tribes?.[recordKey];
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

  const record = broadcastState.tribes?.[recordKey];
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
        formatRemainingDuration(latestRecord.expiresAt)
      )}</span>
    </button>
  `;
  strip.title = `${latestRecord.name}\n首次记录：${formatBroadcastTime(latestRecord.activatedAt)}`;
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
        ? `剩余 ${formatRemainingDuration(record.expiresAt)}`
        : isRecordEnded(record)
          ? `距今 ${formatDurationFromNow(record.endedAt || record.updatedAt)}`
          : `距今 ${formatDurationFromNow(record.activatedAt)}`;
      const footer = activeMode
        ? `首次记录：${formatBroadcastTime(record.activatedAt)}`
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
    broadcastSocket = new WebSocket(BROADCAST_SERVICE_URL);

    broadcastSocket.addEventListener("open", () => {
      updateBroadcastConnection("loading", "已连接服务，正在同步...");
      sendBroadcastMessage("sync-request", {});
    });

    broadcastSocket.addEventListener("message", (event) => {
      const message = parseBroadcastMessage(event.data);
      if (!message) return;

      if (message.type === "welcome" || message.type === "sync") {
        broadcastPeerId = String(message.sessionId || broadcastPeerId || "");
        if (message.state) {
          replaceBroadcastLedger(message.state, { notify: true });
        }
        updateBroadcastConnection("ready", "已连接");
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
      broadcastConnection.peerCount = 0;
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
    broadcastConnection.peerCount = 0;
    updateBroadcastConnection("error", "通知服务不可用");
    scheduleBroadcastReconnect(15000);
  }
}

function updateBroadcastFilter(value) {
  broadcastFilterText = String(value || "").trim();
  renderBroadcastHistory();
}

function registerTribeChallengeDetection(input) {
  const record = buildStartRecord(input);
  if (!record) return false;

  const existing = broadcastState.tribes?.[record.key];
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
  broadcastState.tribes = {};
  broadcastViewState.dismissed = {};
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

function initBroadcastSystem() {
  ensureBroadcastModalStructure();
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
