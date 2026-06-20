const DB_NAME = "WakfuNexusDB";
const DB_VERSION = 2;
const STORE_NAME = "fileHandles";

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };

    request.onsuccess = (event) => resolve(event.target.result);
    request.onerror = (event) => {
      console.error("DB Error:", event);
      reject(event);
    };
  });
}

async function saveFileHandlesToDB(handles) {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);

    return new Promise((resolve, reject) => {
      store.put(handles?.mainLogHandle || null, "mainLog");
      store.put(handles?.chatLogHandle || null, "chatLog");

      tx.oncomplete = () => resolve();
      tx.onerror = (event) => {
        console.error("Transaction failed:", event);
        reject(event);
      };
    });
  } catch (error) {
    console.error("Failed to save handles:", error);
  }
}

async function getSavedHandles() {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const mainReq = store.get("mainLog");
      const chatReq = store.get("chatLog");

      tx.oncomplete = () =>
        resolve({
          mainLogHandle: mainReq.result || null,
          chatLogHandle: chatReq.result || null,
        });
      tx.onerror = () =>
        resolve({
          mainLogHandle: null,
          chatLogHandle: null,
        });
    });
  } catch (error) {
    console.error("Error getting handles:", error);
    return {
      mainLogHandle: null,
      chatLogHandle: null,
    };
  }
}

async function checkPreviousFile() {
  const handles = await getSavedHandles();
  if (!handles.mainLogHandle || !handles.chatLogHandle) return;

  if (dropZone) dropZone.style.display = "none";
  if (reconnectContainer) {
    reconnectContainer.style.display = "block";
    if (prevFilenameEl) {
      prevFilenameEl.innerHTML = `${handles.mainLogHandle.name}<br>${handles.chatLogHandle.name}`;
    }
  }
}

async function exportBugReportLog() {
  if (!fileHandle) {
    alert("请先连接 `wakfu.log`，再导出反馈日志。");
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
  } catch (error) {
    console.error("Export bug report log failed:", error);
    alert("导出反馈日志失败，请重试。");
  }
}

window.saveFileHandlesToDB = saveFileHandlesToDB;
window.getSavedHandles = getSavedHandles;
