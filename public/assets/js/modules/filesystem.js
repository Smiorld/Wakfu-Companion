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
