const DB_NAME = "WakfuNexusDB";
const DB_VERSION = 2;
const STORE_NAME = "fileHandles";

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };

    request.onsuccess = (e) => resolve(e.target.result);
    request.onerror = (e) => {
      console.error("DB Error:", e);
      reject(e);
    };
  });
}

async function saveFileHandleToDB(handle) {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);

    // Return a promise that resolves when the transaction completes
    return new Promise((resolve, reject) => {
      const req = store.put(handle, "activeLog");

      tx.oncomplete = () => {
        resolve();
      };

      tx.onerror = (e) => {
        console.error("Transaction failed:", e);
        reject(e);
      };

      req.onerror = (e) => {
        console.error("Put request failed:", e);
        reject(e);
      };
    });
  } catch (e) {
    console.error("Failed to save handle:", e);
  }
}

async function getSavedHandle() {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const req = store.get("activeLog");

      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    });
  } catch (e) {
    console.error("Error getting handle:", e);
    return null;
  }
}

async function checkPreviousFile() {
  const handle = await getSavedHandle();
  if (handle) {
    if (dropZone) dropZone.style.display = "none";
    if (reconnectContainer) {
      reconnectContainer.style.display = "block";
      if (prevFilenameEl) prevFilenameEl.textContent = handle.name;
    }
  }
}

async function exportBugReportLog() {
  if (!fileHandle) {
    alert("请先连接日志文件，再导出反馈日志。");
    return;
  }

  try {
    const file = await fileHandle.getFile();
    const suggestedName = "把这个发送给薯条.log";
    const url = URL.createObjectURL(file);
    const link = document.createElement("a");
    link.href = url;
    link.download = suggestedName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 1000);

    alert(
      "已下载当前日志。\n请把“把这个发送给薯条.log”发给 T2薯条，并描述你遇到的具体问题。\nQQ：1541599745"
    );
  } catch (e) {
    console.error("Export bug report log failed:", e);
    alert("导出反馈日志失败，请重试。");
  }
}
