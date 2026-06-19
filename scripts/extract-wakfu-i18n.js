const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");

const DEFAULT_EN_JAR = "D:\\game\\wakfu_client\\contents\\i18n\\i18n_en.jar";
const DEFAULT_ZH_JAR = "D:\\game\\backup\\jp\\i18n_ja.jar";
const DEFAULT_EN_ENTRY = "texts_en.properties";
const DEFAULT_ZH_ENTRY = "texts_ja.properties";
const DEFAULT_OUTPUT_DIR = path.join(__dirname, "..", "artifacts", "wakfu-i18n");

function escapePowerShell(value) {
  return String(value).replace(/'/g, "''");
}

function extractJarEntryToFile(jarPath, entryName, outputPath) {
  const command = [
    "Add-Type -AssemblyName System.IO.Compression.FileSystem",
    `$zip=[IO.Compression.ZipFile]::OpenRead('${escapePowerShell(jarPath)}')`,
    `$entry=$zip.GetEntry('${escapePowerShell(entryName)}')`,
    "if ($null -eq $entry) { throw 'Entry not found in jar.' }",
    "[IO.Compression.ZipFileExtensions]::ExtractToFile($entry, '" +
      escapePowerShell(outputPath) +
      "', $true)",
    "$zip.Dispose()",
  ].join("; ");

  execFileSync(
    "powershell",
    ["-NoProfile", "-NonInteractive", "-Command", command],
    { stdio: "pipe" }
  );
}

function loadText(filePath) {
  return fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "");
}

function hasContinuation(line) {
  let slashCount = 0;
  for (let i = line.length - 1; i >= 0 && line[i] === "\\"; i -= 1) {
    slashCount += 1;
  }
  return slashCount % 2 === 1;
}

function joinPropertyLines(text) {
  const rawLines = String(text).replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  const lines = [];

  for (let index = 0; index < rawLines.length; index += 1) {
    let line = rawLines[index];

    while (hasContinuation(line) && index + 1 < rawLines.length) {
      line = line.slice(0, -1) + rawLines[index + 1].replace(/^[ \t\f]+/, "");
      index += 1;
    }

    lines.push(line);
  }

  return lines;
}

function decodeUnicodeEscape(hex) {
  if (!/^[0-9a-fA-F]{4}$/.test(hex)) {
    return `\\u${hex}`;
  }
  return String.fromCharCode(parseInt(hex, 16));
}

function unescapeProperties(value) {
  let result = "";

  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (char !== "\\") {
      result += char;
      continue;
    }

    if (index === value.length - 1) {
      result += "\\";
      continue;
    }

    const next = value[index + 1];
    index += 1;

    switch (next) {
      case "t":
        result += "\t";
        break;
      case "r":
        result += "\r";
        break;
      case "n":
        result += "\n";
        break;
      case "f":
        result += "\f";
        break;
      case "u": {
        const hex = value.slice(index + 1, index + 5);
        if (hex.length === 4) {
          result += decodeUnicodeEscape(hex);
          index += 4;
        } else {
          result += "\\u";
        }
        break;
      }
      default:
        result += next;
        break;
    }
  }

  return result;
}

function splitPropertyLine(line) {
  let keyEnd = -1;
  let separatorIndex = -1;
  let escaped = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];

    if (!escaped && (char === "=" || char === ":" || /\s/.test(char))) {
      keyEnd = index;
      separatorIndex = index;
      break;
    }

    escaped = !escaped && char === "\\";
    if (char !== "\\") escaped = false;
  }

  if (keyEnd === -1) {
    return { key: line, value: "" };
  }

  let valueStart = separatorIndex;
  while (valueStart < line.length && /\s/.test(line[valueStart])) valueStart += 1;
  if (line[valueStart] === "=" || line[valueStart] === ":") valueStart += 1;
  while (valueStart < line.length && /\s/.test(line[valueStart])) valueStart += 1;

  return {
    key: line.slice(0, keyEnd),
    value: line.slice(valueStart),
  };
}

function parseProperties(text) {
  const map = new Map();

  for (const rawLine of joinPropertyLines(text)) {
    const trimmedLeading = rawLine.replace(/^[ \t\f]+/, "");
    if (!trimmedLeading || trimmedLeading.startsWith("#") || trimmedLeading.startsWith("!")) {
      continue;
    }

    const { key, value } = splitPropertyLine(rawLine);
    map.set(unescapeProperties(key).trim(), unescapeProperties(value));
  }

  return map;
}

function toCsvCell(value) {
  return `"${String(value).replace(/"/g, '""')}"`;
}

function buildRows(englishMap, chineseMap) {
  const allKeys = new Set([...englishMap.keys(), ...chineseMap.keys()]);

  return [...allKeys]
    .sort((left, right) => left.localeCompare(right))
    .map((key) => ({
      key,
      english: englishMap.get(key) || "",
      chinese: chineseMap.get(key) || "",
      in_english: englishMap.has(key),
      in_chinese: chineseMap.has(key),
    }));
}

function writeCsv(rows, outputPath) {
  const header = ["key", "english", "chinese", "in_english", "in_chinese"];
  const body = rows.map((row) =>
    [
      row.key,
      row.english,
      row.chinese,
      row.in_english ? "True" : "False",
      row.in_chinese ? "True" : "False",
    ]
      .map(toCsvCell)
      .join(",")
  );

  fs.writeFileSync(outputPath, [header.join(","), ...body].join("\n"));
}

function writeSummary({
  enJarPath,
  zhJarPath,
  enEntry,
  zhEntry,
  englishMap,
  chineseMap,
  outputPath,
}) {
  const onlyInChinese = [...chineseMap.keys()].filter((key) => !englishMap.has(key));
  const onlyInEnglish = [...englishMap.keys()].filter((key) => !chineseMap.has(key));

  const lines = [
    `ja_jar=${zhJarPath}`,
    `en_jar=${enJarPath}`,
    `ja_entry=${zhEntry}`,
    `en_entry=${enEntry}`,
    `all_keys=${new Set([...englishMap.keys(), ...chineseMap.keys()]).size}`,
    `ja_keys=${chineseMap.size}`,
    `en_keys=${englishMap.size}`,
    `keys_only_in_chinese=${onlyInChinese.length}`,
    `keys_only_in_english=${onlyInEnglish.length}`,
  ];

  fs.writeFileSync(outputPath, `${lines.join("\n")}\n`);
}

function main() {
  const enJarPath = process.argv[2] || DEFAULT_EN_JAR;
  const zhJarPath = process.argv[3] || DEFAULT_ZH_JAR;
  const outputDir = process.argv[4] || DEFAULT_OUTPUT_DIR;
  const enEntry = process.argv[5] || DEFAULT_EN_ENTRY;
  const zhEntry = process.argv[6] || DEFAULT_ZH_ENTRY;

  fs.mkdirSync(outputDir, { recursive: true });

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "wakfu-i18n-"));
  const enPropertiesPath = path.join(tempDir, path.basename(enEntry));
  const zhPropertiesPath = path.join(tempDir, path.basename(zhEntry));

  try {
    extractJarEntryToFile(enJarPath, enEntry, enPropertiesPath);
    extractJarEntryToFile(zhJarPath, zhEntry, zhPropertiesPath);

    const englishMap = parseProperties(loadText(enPropertiesPath));
    const chineseMap = parseProperties(loadText(zhPropertiesPath));
    const rows = buildRows(englishMap, chineseMap);

    const jsonPath = path.join(outputDir, "wakfu_i18n_en_zh.json");
    const csvPath = path.join(outputDir, "wakfu_i18n_en_zh.csv");
    const summaryPath = path.join(outputDir, "summary.txt");

    fs.writeFileSync(jsonPath, JSON.stringify(rows, null, 4));
    writeCsv(rows, csvPath);
    writeSummary({
      enJarPath,
      zhJarPath,
      enEntry,
      zhEntry,
      englishMap,
      chineseMap,
      outputPath: summaryPath,
    });

    console.log(
      JSON.stringify(
        {
          outputDir,
          jsonPath,
          csvPath,
          summaryPath,
          allKeys: rows.length,
          englishKeys: englishMap.size,
          chineseKeys: chineseMap.size,
        },
        null,
        2
      )
    );
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

main();
