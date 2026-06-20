const BROADCAST_STORAGE_KEY = "wakfu_tribe_broadcast_state_v3";
const BROADCAST_ROOM_ID = "wakfu-companion-tribe-main-v1";
const BROADCAST_MODULE_URL = "https://esm.sh/@rtco/client@0.3.6?bundle";
const TRIBE_NOTICE_DURATION_MS = 30 * 60 * 1000;
const BROADCAST_REFRESH_MS = 1000;
const BROADCAST_MAX_RECORDS = 200;

let broadcastRuntimePromise = null;
let broadcastPeer = null;
let broadcastRoom = null;
let broadcastPeerId = "";
let broadcastRefreshTimer = null;
let broadcastReconnectTimer = null;
let broadcastFilterText = "";
let broadcastState = loadBroadcastState();
let broadcastPreviewTribes = {};
let broadcastConnection = {
  status: "idle",
  message: "部族通知网络未启动。",
  peerCount: 0,
};
const broadcastConnectedPeers = new Set();

function loadBroadcastState() {
  try {
    const parsed = JSON.parse(localStorage.getItem(BROADCAST_STORAGE_KEY) || "{}");
    return {
      tribes:
        parsed && typeof parsed.tribes === "object" && !Array.isArray(parsed.tribes)
          ? parsed.tribes
          : {},
    };
  } catch (error) {
    return { tribes: {} };
  }
}

function saveBroadcastState() {
  localStorage.setItem(BROADCAST_STORAGE_KEY, JSON.stringify(broadcastState));
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

function isTribeRecordInDuration(record) {
  return Number(record?.expiresAt || 0) > Date.now();
}

function isTribeRecordDismissed(record) {
  return (
    Number(record?.dismissedAt || 0) > 0 &&
    Number(record.dismissedAt || 0) >= Number(record.activatedAt || 0)
  );
}

function isTribeRecordVisibleActive(record) {
  return isTribeRecordInDuration(record) && !isTribeRecordDismissed(record);
}

function pruneBroadcastState() {
  const nextTribes = {};
  const records = Object.values(broadcastState.tribes || {})
    .filter((record) => record && record.key && record.name && record.activatedAt)
    .sort((left, right) => Number(right.activatedAt || 0) - Number(left.activatedAt || 0))
    .slice(0, BROADCAST_MAX_RECORDS);

  records.forEach((record) => {
    nextTribes[record.key] = {
      key: String(record.key),
      name: String(record.name),
      challengeId: String(record.challengeId || ""),
      activatedAt: Number(record.activatedAt || Date.now()),
      expiresAt: Number(record.expiresAt || Date.now() + TRIBE_NOTICE_DURATION_MS),
      senderPeerId: String(record.senderPeerId || ""),
      updatedAt: Number(record.updatedAt || record.activatedAt || Date.now()),
      dismissedAt: Number(record.dismissedAt || 0),
    };
  });

  broadcastState.tribes = nextTribes;
}

function pruneBroadcastPreviewState() {
  const nextTribes = {};
  const records = Object.values(broadcastPreviewTribes || {})
    .filter((record) => record && record.key && record.name && record.activatedAt)
    .sort((left, right) => Number(right.activatedAt || 0) - Number(left.activatedAt || 0))
    .slice(0, BROADCAST_MAX_RECORDS);

  records.forEach((record) => {
    if (!isTribeRecordInDuration(record)) return;
    nextTribes[record.key] = {
      key: String(record.key),
      name: String(record.name),
      challengeId: String(record.challengeId || ""),
      activatedAt: Number(record.activatedAt || Date.now()),
      expiresAt: Number(record.expiresAt || Date.now() + TRIBE_NOTICE_DURATION_MS),
      senderPeerId: String(record.senderPeerId || ""),
      updatedAt: Number(record.updatedAt || record.activatedAt || Date.now()),
      dismissedAt: Number(record.dismissedAt || 0),
    };
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
    .sort((left, right) => Number(right.activatedAt || 0) - Number(left.activatedAt || 0));
}

function getActiveBroadcastRecords() {
  return getBroadcastRecords().filter((record) => isTribeRecordVisibleActive(record));
}

function getInactiveBroadcastRecords() {
  return getBroadcastRecords().filter((record) => !isTribeRecordVisibleActive(record));
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

function syncBroadcastPeerCount() {
  const selfCount = broadcastPeerId ? 1 : 0;
  broadcastConnection.peerCount = selfCount + broadcastConnectedPeers.size;
}

function rememberBroadcastPeer(peerId) {
  if (!peerId || peerId === broadcastPeerId) return;
  broadcastConnectedPeers.add(String(peerId));
  syncBroadcastPeerCount();
}

function forgetBroadcastPeer(peerId) {
  if (!peerId) return;
  broadcastConnectedPeers.delete(String(peerId));
  syncBroadcastPeerCount();
}

function scheduleBroadcastReconnect(delayMs = 10000) {
  if (broadcastReconnectTimer) return;
  broadcastReconnectTimer = setTimeout(() => {
    broadcastReconnectTimer = null;
    connectBroadcastNetwork();
  }, delayMs);
}

async function loadBroadcastRuntime() {
  if (!broadcastRuntimePromise) {
    broadcastRuntimePromise = import(BROADCAST_MODULE_URL);
  }
  return broadcastRuntimePromise;
}

function makeBroadcastPayload(type, payload) {
  return JSON.stringify({
    app: "wakfu-companion-tribe",
    version: 1,
    type,
    payload,
  });
}

function parseBroadcastPayload(raw) {
  try {
    const parsed = JSON.parse(raw);
    if (parsed?.app !== "wakfu-companion-tribe" || parsed?.version !== 1) {
      return null;
    }
    return parsed;
  } catch (error) {
    return null;
  }
}

function sendBroadcastMessage(type, payload, targetPeerId) {
  if (!broadcastRoom) return false;
  try {
    broadcastRoom.send(makeBroadcastPayload(type, payload), targetPeerId);
    return true;
  } catch (error) {
    console.warn("[Broadcast] send failed:", error);
    return false;
  }
}

function sendBroadcastSync(targetPeerId) {
  sendBroadcastMessage(
    "sync",
    {
      tribes: Object.values(broadcastState.tribes || {}),
    },
    targetPeerId
  );
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

function buildTribeRecord(input) {
  const normalizedName = normalizeTribeName(input?.challengeName || input?.name || "");
  if (!normalizedName) return null;

  const activatedAt = Number(input?.activatedAt || input?.detectedAt || Date.now());
  const expiresAt = Number(input?.expiresAt || activatedAt + TRIBE_NOTICE_DURATION_MS);
  return {
    key: getTribeRecordKey(normalizedName),
    name: normalizedName,
    challengeId: String(input?.challengeId || ""),
    activatedAt,
    expiresAt,
    senderPeerId: String(input?.senderPeerId || ""),
    updatedAt: Number(input?.updatedAt || activatedAt),
    dismissedAt: Number(input?.dismissedAt || 0),
  };
}

function recordsShareBroadcastWindow(left, right) {
  const leftActivatedAt = Number(left?.activatedAt || 0);
  const rightActivatedAt = Number(right?.activatedAt || 0);
  const leftExpiresAt = Number(left?.expiresAt || leftActivatedAt + TRIBE_NOTICE_DURATION_MS);
  const rightExpiresAt = Number(right?.expiresAt || rightActivatedAt + TRIBE_NOTICE_DURATION_MS);
  return leftActivatedAt <= rightExpiresAt && rightActivatedAt <= leftExpiresAt;
}

function mergeTribeRecord(record, options = {}) {
  const { persist = true, notify = false } = options;
  if (!record || !record.key) return false;

  const existing = broadcastState.tribes[record.key];
  let changed = false;
  let shouldNotify = false;

  if (!existing) {
    broadcastState.tribes[record.key] = record;
    changed = true;
    shouldNotify = isTribeRecordVisibleActive(record);
  } else {
    const existingActivatedAt = Number(existing.activatedAt || 0);
    const incomingActivatedAt = Number(record.activatedAt || 0);
    const sameWindow = recordsShareBroadcastWindow(existing, record);
    let nextRecord = existing;

    if (sameWindow) {
      const mergedActivatedAt = Math.min(existingActivatedAt, incomingActivatedAt);
      const mergedUpdatedAt = Math.max(
        Number(existing.updatedAt || existingActivatedAt || 0),
        Number(record.updatedAt || incomingActivatedAt || 0)
      );
      const mergedDismissedAt = Math.max(
        Number(existing.dismissedAt || 0),
        Number(record.dismissedAt || 0)
      );

      nextRecord = {
        ...existing,
        ...record,
        activatedAt: mergedActivatedAt,
        expiresAt: mergedActivatedAt + TRIBE_NOTICE_DURATION_MS,
        updatedAt: mergedUpdatedAt,
        dismissedAt: mergedDismissedAt >= mergedActivatedAt ? mergedDismissedAt : 0,
        challengeId: record.challengeId || existing.challengeId,
        senderPeerId: record.senderPeerId || existing.senderPeerId,
      };
    } else if (incomingActivatedAt >= existingActivatedAt) {
      nextRecord = {
        ...record,
        dismissedAt: Number(record.dismissedAt || 0) >= incomingActivatedAt ? Number(record.dismissedAt || 0) : 0,
      };
    }

    if (JSON.stringify(nextRecord) !== JSON.stringify(existing)) {
      broadcastState.tribes[record.key] = nextRecord;
      changed = true;
      shouldNotify =
        isTribeRecordVisibleActive(nextRecord) &&
        (!isTribeRecordVisibleActive(existing) || incomingActivatedAt > existingActivatedAt);
    }
  }

  if (!changed) return false;

  pruneBroadcastState();
  if (persist) saveBroadcastState();
  renderBroadcastStrip();
  renderBroadcastHistory();

  if (notify && shouldNotify) {
    playBroadcastTribeSound();
    showBroadcastToast(broadcastState.tribes[record.key]);
  }

  return shouldNotify;
}

function getBroadcastStripName(name) {
  return String(name || "")
    .replace(/^合作[:：]?\s*/, "")
    .replace(/部族$/, "")
    .trim();
}

function dismissBroadcastTribe(recordKey) {
  const record = broadcastState.tribes?.[recordKey];
  if (!record || !isTribeRecordInDuration(record)) return false;

  broadcastState.tribes[recordKey] = {
    ...record,
    dismissedAt: Date.now(),
    updatedAt: Date.now(),
  };
  saveBroadcastState();
  renderBroadcastStrip();
  renderBroadcastHistory();
  return true;
}

function resolveBroadcastTribeLocal(input) {
  const recordKey = getTribeRecordKey(input?.challengeName || input?.name || "");
  if (!recordKey) return false;

  const record = broadcastState.tribes?.[recordKey];
  if (!record || !isTribeRecordInDuration(record)) return false;
  const resolvedAt = Number(input?.resolvedAt || Date.now());
  if (resolvedAt < Number(record.activatedAt || 0)) return false;

  broadcastState.tribes[recordKey] = {
    ...record,
    dismissedAt: resolvedAt,
    updatedAt: Math.max(Number(record.updatedAt || 0), resolvedAt),
  };
  saveBroadcastState();
  renderBroadcastStrip();
  renderBroadcastHistory();
  return true;
}

function resolveBroadcastTribe(input) {
  const resolved = resolveBroadcastTribeLocal(input);
  if (!resolved) return false;

  sendBroadcastMessage("tribe-resolved", {
    name: input?.challengeName || input?.name || "",
    challengeId: String(input?.challengeId || ""),
    resolvedAt: Number(input?.resolvedAt || Date.now()),
  });
  return true;
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
        : `距今 ${formatDurationFromNow(record.activatedAt)}`;
      const footer = activeMode
        ? `首次记录：${formatBroadcastTime(record.activatedAt)}`
        : `最近记录：${formatBroadcastTime(record.activatedAt)}`;
      const dismissedText =
        !activeMode && isTribeRecordDismissed(record)
          ? `<span class="broadcast-muted-note">已手动取消激活</span>`
          : "";

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
              ${dismissedText}
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

  renderBroadcastList(
    activeList,
    getActiveBroadcastRecords(),
    "当前没有激活的部族通知。",
    true
  );
  renderBroadcastList(
    historyList,
    getInactiveBroadcastRecords(),
    "暂无历史记录。",
    false
  );
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
      <div class="broadcast-modal-note">通知完全由 wakfu.log 中识别到的部族挑战自动触发。30 分钟内同名部族只保留第一次记录。手动取消激活只会释放当前占位，不会删除最近出现时间。</div>
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
  if (broadcastRoom || broadcastPeer) return;
  if (broadcastReconnectTimer) {
    clearTimeout(broadcastReconnectTimer);
    broadcastReconnectTimer = null;
  }

  updateBroadcastConnection("loading", "正在连接...");
  syncBroadcastPeerCount();

  try {
    const { Artico, SocketSignaling } = await loadBroadcastRuntime();
    broadcastPeer = new Artico({
      signaling: new SocketSignaling({
        url: "https://0.artico.dev:443",
      }),
    });

    broadcastPeer.on("open", (peerId) => {
      broadcastPeerId = peerId;
      syncBroadcastPeerCount();
      updateBroadcastConnection("loading", "已接入信令，正在加入房间...");

      broadcastRoom = broadcastPeer.join(BROADCAST_ROOM_ID);

      broadcastRoom.on("join", (joinedPeerId) => {
        rememberBroadcastPeer(joinedPeerId);
        updateBroadcastConnection("ready", "已连接");
        setTimeout(() => sendBroadcastSync(joinedPeerId), 150);
      });

      broadcastRoom.on("leave", (leftPeerId) => {
        forgetBroadcastPeer(leftPeerId);
        updateBroadcastConnection("ready", "已连接");
      });

      broadcastRoom.on("message", (raw, remotePeerId) => {
        rememberBroadcastPeer(remotePeerId);
        const message = parseBroadcastPayload(raw);
        if (!message) return;

        if (message.type === "tribe-detected" && message.payload?.record) {
          const record = buildTribeRecord(message.payload.record);
          if (!record) return;
          record.senderPeerId = remotePeerId || record.senderPeerId;
          mergeTribeRecord(record, {
            persist: true,
            notify: record.senderPeerId !== broadcastPeerId,
          });
        } else if (message.type === "tribe-resolved") {
          resolveBroadcastTribeLocal({
            name: message.payload?.name || "",
            challengeId: message.payload?.challengeId || "",
            resolvedAt: Number(message.payload?.resolvedAt || Date.now()),
          });
        } else if (message.type === "sync" && Array.isArray(message.payload?.tribes)) {
          let changed = false;
          message.payload.tribes.forEach((item) => {
            const record = buildTribeRecord(item);
            if (!record) return;
            if (
              mergeTribeRecord(record, {
                persist: false,
                notify: false,
              })
            ) {
              changed = true;
            }
          });
          if (changed) saveBroadcastState();
        } else if (message.type === "sync-request") {
          sendBroadcastSync(remotePeerId);
        }
      });

      updateBroadcastConnection("ready", "已连接");
      sendBroadcastMessage("sync-request", { peerId });
    });

    broadcastPeer.on("close", () => {
      broadcastRoom = null;
      broadcastPeer = null;
      broadcastPeerId = "";
      broadcastConnectedPeers.clear();
      syncBroadcastPeerCount();
      updateBroadcastConnection("error", "连接已断开");
      scheduleBroadcastReconnect();
    });

    broadcastPeer.on("error", (error) => {
      console.warn("[Broadcast] network error:", error);
      broadcastRoom = null;
      broadcastPeer = null;
      broadcastPeerId = "";
      broadcastConnectedPeers.clear();
      syncBroadcastPeerCount();
      updateBroadcastConnection("error", "连接失败");
      scheduleBroadcastReconnect();
    });
  } catch (error) {
    console.warn("[Broadcast] runtime load failed:", error);
    broadcastPeerId = "";
    broadcastConnectedPeers.clear();
    syncBroadcastPeerCount();
    updateBroadcastConnection("error", "网络加载失败，请检查连接");
    scheduleBroadcastReconnect(15000);
  }
}

function updateBroadcastFilter(value) {
  broadcastFilterText = String(value || "").trim();
  renderBroadcastHistory();
}

function registerTribeChallengeDetection(input) {
  const record = buildTribeRecord(input);
  if (!record) return false;

  record.senderPeerId = broadcastPeerId;
  const shouldAnnounce = mergeTribeRecord(record, {
    persist: true,
    notify: true,
  });

  if (shouldAnnounce) {
    sendBroadcastMessage("tribe-detected", { record });
  }

  return shouldAnnounce;
}

function showLocalFakeTribeNotice(input = {}) {
  const fakeRecord = buildTribeRecord({
    challengeId: input.challengeId || "-1932",
    challengeName: input.challengeName || "合作：潘达拉幽灵部族",
    detectedAt: Number(input.detectedAt || Date.now()),
    expiresAt: Number(
      input.expiresAt ||
        Number(input.detectedAt || Date.now()) + TRIBE_NOTICE_DURATION_MS
    ),
    dismissedAt: Number(input.dismissedAt || 0),
    updatedAt: Number(input.updatedAt || input.detectedAt || Date.now()),
    senderPeerId: "local-preview",
  });
  if (!fakeRecord) return false;

  broadcastPreviewTribes[fakeRecord.key] = fakeRecord;
  pruneBroadcastPreviewState();
  renderBroadcastStrip();
  renderBroadcastHistory();
  return true;
}

function clearBroadcastNotices() {
  broadcastState.tribes = {};
  saveBroadcastState();
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
    saveBroadcastState();
    renderBroadcastStrip();
    renderBroadcastHistory();
  }, BROADCAST_REFRESH_MS);
}

function initBroadcastSystem() {
  ensureBroadcastModalStructure();
  pruneBroadcastState();
  saveBroadcastState();
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
window.dismissBroadcastTribe = dismissBroadcastTribe;
