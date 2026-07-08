const fs = require("fs");
const path = require("path");

const sourcePath = path.resolve(
  __dirname,
  "..",
  "artifacts",
  "wakfu-i18n",
  "wakfu_i18n_en_zh.json"
);

function normalize(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function loadEntries() {
  return JSON.parse(fs.readFileSync(sourcePath, "utf8"));
}

function printMatches(title, matches) {
  console.log(title);
  console.log("-".repeat(title.length));
  matches.forEach((entry, index) => {
    console.log(
      `${index + 1}. key=${entry.key}\n   english=${entry.english}\n   chinese=${entry.chinese || "(空)"}`
    );
  });
  console.log("");
}

function main() {
  const rawQuery = process.argv.slice(2).join(" ").trim();
  if (!rawQuery) {
    console.error('Usage: node scripts/find-spell-i18n-candidates.js "Twilight"');
    process.exit(1);
  }

  const query = normalize(rawQuery);
  const entries = loadEntries().filter(
    (entry) => entry && typeof entry.english === "string" && entry.english.trim()
  );

  const exactMatches = entries.filter((entry) => normalize(entry.english) === query);
  const containsMatches = entries.filter(
    (entry) => query.length >= 2 && normalize(entry.english).includes(query)
  );

  console.log(`Query: ${rawQuery}`);
  console.log(`Source: ${sourcePath}`);
  console.log("");

  if (exactMatches.length) {
    printMatches(`Exact matches (${exactMatches.length})`, exactMatches);
  }

  const fallbackMatches = containsMatches.filter(
    (entry) => !exactMatches.some((exact) => exact.key === entry.key)
  );
  if (fallbackMatches.length) {
    printMatches(`Contains matches (${fallbackMatches.length})`, fallbackMatches);
  }

  if (!exactMatches.length && !fallbackMatches.length) {
    console.log("No matches found.");
    process.exit(2);
  }
}

main();
