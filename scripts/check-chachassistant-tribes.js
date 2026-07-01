const fs = require("fs");
const path = require("path");

const API_URL = "https://api.chachastuce.fr/quete";
const OUTPUT_DIR = path.join(__dirname, "..", "artifacts", "chachassistant-tribe-watch");
const SNAPSHOT_PATH = path.join(OUTPUT_DIR, "last_snapshot.json");

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function sortNumericStrings(values) {
  return [...values].sort((left, right) => Number(left) - Number(right));
}

function buildLookupById(quests) {
  const map = new Map();
  for (const quest of quests) {
    map.set(String(quest.wakfuId), quest);
  }
  return map;
}

function simplifyQuest(quest) {
  return {
    id: String(quest?.wakfuId ?? ""),
    type: String(quest?.type ?? ""),
    zone: quest?.zone ?? null,
    nameEn: quest?.name?.en || "",
    nameFr: quest?.name?.fr || "",
  };
}

async function fetchSnapshot() {
  const response = await fetch(API_URL, {
    headers: {
      "User-Agent": "WakfuCompanionLocalCheck/1.0",
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  const quests = Array.isArray(data?.quests) ? data.quests : [];
  const tribeQuests = quests.filter((quest) => String(quest?.type || "") === "Troupeaux");
  const tribeIds = sortNumericStrings(tribeQuests.map((quest) => String(quest.wakfuId)));

  return {
    fetchedAt: new Date().toISOString(),
    etag: response.headers.get("etag") || "",
    questCount: quests.length,
    tribeCount: tribeQuests.length,
    tribeIds,
    tribeQuests: tribeQuests.map(simplifyQuest),
  };
}

function loadPreviousSnapshot() {
  if (!fs.existsSync(SNAPSHOT_PATH)) return null;
  return JSON.parse(fs.readFileSync(SNAPSHOT_PATH, "utf8"));
}

function diffSnapshots(previous, current) {
  const previousIds = new Set(previous?.tribeIds || []);
  const currentIds = new Set(current.tribeIds);

  const added = current.tribeIds.filter((id) => !previousIds.has(id));
  const removed = (previous?.tribeIds || []).filter((id) => !currentIds.has(id));

  const previousById = buildLookupById(previous?.tribeQuests || []);
  const currentById = buildLookupById(current.tribeQuests);

  const changed = current.tribeIds
    .filter((id) => previousById.has(id))
    .map((id) => {
      const before = previousById.get(id);
      const after = currentById.get(id);
      if (
        before.zone === after.zone &&
        before.nameEn === after.nameEn &&
        before.type === after.type
      ) {
        return null;
      }
      return { id, before, after };
    })
    .filter(Boolean);

  return {
    etagChanged: String(previous?.etag || "") !== String(current.etag || ""),
    countChanged: Number(previous?.tribeCount || 0) !== Number(current.tribeCount || 0),
    added,
    removed,
    changed,
  };
}

function saveSnapshot(snapshot) {
  ensureDir(OUTPUT_DIR);
  fs.writeFileSync(SNAPSHOT_PATH, JSON.stringify(snapshot, null, 2), "utf8");
}

function printReport(previous, current, diff) {
  const report = {
    apiUrl: API_URL,
    fetchedAt: current.fetchedAt,
    etag: current.etag,
    previousEtag: previous?.etag || "",
    etagChanged: diff.etagChanged,
    questCount: current.questCount,
    tribeCount: current.tribeCount,
    previousTribeCount: previous?.tribeCount ?? null,
    added: diff.added,
    removed: diff.removed,
    changed: diff.changed,
    snapshotPath: SNAPSHOT_PATH,
  };

  console.log(JSON.stringify(report, null, 2));
}

async function main() {
  const save = !process.argv.includes("--no-save");
  const previous = loadPreviousSnapshot();
  const current = await fetchSnapshot();
  const diff = diffSnapshots(previous, current);
  printReport(previous, current, diff);
  if (save) saveSnapshot(current);
}

main().catch((error) => {
  console.error(
    JSON.stringify(
      {
        apiUrl: API_URL,
        error: error instanceof Error ? error.message : String(error),
      },
      null,
      2
    )
  );
  process.exitCode = 1;
});
