const DB_NAME = "WakfuNexusDB";
const DB_VERSION = 2;
const STORE_NAME = "fileHandles";

const ZIP_CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let value = i;
    for (let bit = 0; bit < 8; bit += 1) {
      value = (value & 1) ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[i] = value >>> 0;
  }
  return table;
})();

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

async function saveHandleToDB(key, value) {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);

    return new Promise((resolve, reject) => {
      store.put(value || null, key);
      tx.oncomplete = () => resolve();
      tx.onerror = (event) => {
        console.error("Transaction failed:", event);
        reject(event);
      };
    });
  } catch (error) {
    console.error("Failed to save handle:", error);
  }
}

async function getHandleFromDB(key) {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const request = store.get(key);

      tx.oncomplete = () => resolve(request.result || null);
      tx.onerror = () => resolve(null);
    });
  } catch (error) {
    console.error("Failed to get handle:", error);
    return null;
  }
}

async function checkPreviousFile() {
  const handles = await getSavedHandles();
  if (!handles.mainLogHandle || !handles.chatLogHandle) return;

  if (dropZone) dropZone.style.display = "none";
  if (reconnectContainer) {
    reconnectContainer.style.display = "block";
    if (prevFilenameEl) {
      prevFilenameEl.innerHTML = `主日志：${handles.mainLogHandle.name}<br>聊天日志：${handles.chatLogHandle.name}`;
    }
  }
}

function getCrc32(bytes) {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) {
    crc = ZIP_CRC32_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function getDosDateTime(timestamp) {
  const date = new Date(timestamp || Date.now());
  const year = Math.max(1980, date.getFullYear());
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const seconds = Math.floor(date.getSeconds() / 2);

  return {
    time: ((hours & 0x1f) << 11) | ((minutes & 0x3f) << 5) | (seconds & 0x1f),
    date: (((year - 1980) & 0x7f) << 9) | ((month & 0x0f) << 5) | (day & 0x1f),
  };
}

function createStoredZip(files) {
  const encoder = new TextEncoder();
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  files.forEach((file) => {
    const nameBytes = encoder.encode(file.name);
    const dataBytes = file.bytes;
    const crc32 = getCrc32(dataBytes);
    const { time, date } = getDosDateTime(file.lastModified);

    const localHeader = new Uint8Array(30 + nameBytes.length);
    const localView = new DataView(localHeader.buffer);
    localView.setUint32(0, 0x04034b50, true);
    localView.setUint16(4, 20, true);
    localView.setUint16(6, 0, true);
    localView.setUint16(8, 0, true);
    localView.setUint16(10, time, true);
    localView.setUint16(12, date, true);
    localView.setUint32(14, crc32, true);
    localView.setUint32(18, dataBytes.length, true);
    localView.setUint32(22, dataBytes.length, true);
    localView.setUint16(26, nameBytes.length, true);
    localView.setUint16(28, 0, true);
    localHeader.set(nameBytes, 30);
    localParts.push(localHeader, dataBytes);

    const centralHeader = new Uint8Array(46 + nameBytes.length);
    const centralView = new DataView(centralHeader.buffer);
    centralView.setUint32(0, 0x02014b50, true);
    centralView.setUint16(4, 20, true);
    centralView.setUint16(6, 20, true);
    centralView.setUint16(8, 0, true);
    centralView.setUint16(10, 0, true);
    centralView.setUint16(12, time, true);
    centralView.setUint16(14, date, true);
    centralView.setUint32(16, crc32, true);
    centralView.setUint32(20, dataBytes.length, true);
    centralView.setUint32(24, dataBytes.length, true);
    centralView.setUint16(28, nameBytes.length, true);
    centralView.setUint16(30, 0, true);
    centralView.setUint16(32, 0, true);
    centralView.setUint16(34, 0, true);
    centralView.setUint16(36, 0, true);
    centralView.setUint32(38, 0, true);
    centralView.setUint32(42, offset, true);
    centralHeader.set(nameBytes, 46);
    centralParts.push(centralHeader);

    offset += localHeader.length + dataBytes.length;
  });

  const centralDirectorySize = centralParts.reduce((sum, part) => sum + part.length, 0);
  const endRecord = new Uint8Array(22);
  const endView = new DataView(endRecord.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(4, 0, true);
  endView.setUint16(6, 0, true);
  endView.setUint16(8, files.length, true);
  endView.setUint16(10, files.length, true);
  endView.setUint32(12, centralDirectorySize, true);
  endView.setUint32(16, offset, true);
  endView.setUint16(20, 0, true);

  return new Blob([...localParts, ...centralParts, endRecord], {
    type: "application/zip",
  });
}

function downloadBlob(blob, downloadName) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = downloadName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function ensureDirectoryPermission(directoryHandle) {
  if (!directoryHandle || typeof directoryHandle.queryPermission !== "function") {
    return false;
  }

  try {
    const current = await directoryHandle.queryPermission({ mode: "readwrite" });
    if (current === "granted") return true;
    const requested = await directoryHandle.requestPermission({ mode: "readwrite" });
    return requested === "granted";
  } catch (error) {
    console.error("Failed to verify directory permission:", error);
    return false;
  }
}

async function saveBlobToDirectoryHandle(blob, directoryHandle, fileName) {
  const fileHandle = await directoryHandle.getFileHandle(fileName, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(blob);
  await writable.close();
  return fileHandle;
}

async function saveBlobWithPicker(blob, options = {}) {
  const downloadName = String(options.downloadName || "导出").trim() || "导出";
  const types = Array.isArray(options.types) ? options.types : [];
  const pickerId = String(options.pickerId || "").trim();
  const directoryHandleKey = String(options.directoryHandleKey || "").trim();

  if (directoryHandleKey) {
    const savedDirectoryHandle = await getHandleFromDB(directoryHandleKey);
    if (savedDirectoryHandle) {
      const hasPermission = await ensureDirectoryPermission(savedDirectoryHandle);
      if (hasPermission) {
        try {
          const fileHandle = await saveBlobToDirectoryHandle(
            blob,
            savedDirectoryHandle,
            downloadName
          );
          return {
            method: "directory-handle",
            directoryHandle: savedDirectoryHandle,
            fileHandle,
          };
        } catch (error) {
          console.error("Saved export directory handle is no longer usable:", error);
          await saveHandleToDB(directoryHandleKey, null);
        }
      }
    }

    if (typeof window.showDirectoryPicker === "function") {
      try {
        const directoryHandle = await window.showDirectoryPicker({
          id: pickerId || undefined,
          startIn: "documents",
          mode: "readwrite",
        });
        const hasPermission = await ensureDirectoryPermission(directoryHandle);
        if (hasPermission) {
          await saveHandleToDB(directoryHandleKey, directoryHandle);
          const fileHandle = await saveBlobToDirectoryHandle(
            blob,
            directoryHandle,
            downloadName
          );
          return {
            method: "directory-handle",
            directoryHandle,
            fileHandle,
          };
        }
      } catch (error) {
        if (error?.name === "AbortError") {
          return { method: "cancelled" };
        }
        console.error("Save with directory picker failed:", error);
      }
    }
  }

  if (typeof window.showSaveFilePicker !== "function") {
    downloadBlob(blob, downloadName);
    return { method: "download-fallback" };
  }

  try {
    const fileHandle = await window.showSaveFilePicker({
      id: pickerId || undefined,
      suggestedName: downloadName,
      startIn: "documents",
      types:
        types.length > 0
          ? types
          : [
              {
                description: "All Files",
                accept: {
                  "application/octet-stream": [".bin"],
                },
              },
            ],
    });

    const writable = await fileHandle.createWritable();
    await writable.write(blob);
    await writable.close();
    return { method: "file-system", fileHandle };
  } catch (error) {
    if (error?.name === "AbortError") {
      return { method: "cancelled" };
    }
    console.error("Save with picker failed, falling back to download:", error);
    downloadBlob(blob, downloadName);
    return { method: "download-fallback", error };
  }
}

async function exportBugReportLog() {
  if (!fileHandle || !chatFileHandle) {
    alert("请先连接 `wakfu.log` 与 `wakfu_chat.log`，再导出反馈日志。");
    return;
  }

  try {
    const [mainFile, chatFile] = await Promise.all([
      fileHandle.getFile(),
      chatFileHandle.getFile(),
    ]);
    const [mainBytes, chatBytes] = await Promise.all([
      mainFile.arrayBuffer().then((buffer) => new Uint8Array(buffer)),
      chatFile.arrayBuffer().then((buffer) => new Uint8Array(buffer)),
    ]);

    const zipBlob = createStoredZip([
      {
        name: mainFile.name || "wakfu.log",
        bytes: mainBytes,
        lastModified: mainFile.lastModified,
      },
      {
        name: chatFile.name || "wakfu_chat.log",
        bytes: chatBytes,
        lastModified: chatFile.lastModified,
      },
    ]);
    if (typeof window.saveBlobWithPicker === "function") {
      await window.saveBlobWithPicker(zipBlob, {
        downloadName: "把这个发送给T2薯条.zip",
        pickerId: "wakfu-bug-report-export",
        types: [
          {
            description: "ZIP Files",
            accept: {
              "application/zip": [".zip"],
            },
          },
        ],
      });
    } else {
      downloadBlob(zipBlob, "把这个发送给T2薯条.zip");
    }

    alert(
      "已下载当前两个日志的压缩包。\n请把“把这个发送给T2薯条.zip”发给 T2薯条，并描述你遇到的具体问题。\nQQ：1541599745"
    );
  } catch (error) {
    console.error("Export bug report log failed:", error);
    alert("导出反馈日志失败，请重试。");
  }
}

window.saveFileHandlesToDB = saveFileHandlesToDB;
window.getSavedHandles = getSavedHandles;
window.saveBlobWithPicker = saveBlobWithPicker;
