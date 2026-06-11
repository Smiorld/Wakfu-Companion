#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { createCombatHarness } = require("./combat-harness");

function parseArgs(argv) {
  const options = {
    actor: null,
    spell: null,
    trace: null,
    json: false,
  };

  const positional = [];
  for (let i = 0; i < argv.length; i += 1) {
    const value = argv[i];
    if (value === "--actor") {
      options.actor = argv[i + 1] || null;
      i += 1;
    } else if (value === "--spell") {
      options.spell = argv[i + 1] || null;
      i += 1;
    } else if (value === "--trace") {
      options.trace = argv[i + 1] || null;
      i += 1;
    } else if (value === "--json") {
      options.json = true;
    } else {
      positional.push(value);
    }
  }

  return {
    logPath: positional[0] || null,
    options,
  };
}

function isCombatLine(line) {
  const lower = line.toLowerCase();
  return (
    lower.includes("[fight log]") ||
    lower.includes("[information (combat)]") ||
    lower.includes("[información (combate)]") ||
    lower.includes("[registro de lutas]") ||
    line.includes("[战斗日志]")
  );
}

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function collectMatches(dataSet, category, actorFilter, spellFilter) {
  const rows = [];
  Object.entries(dataSet || {}).forEach(([actor, payload]) => {
    if (actorFilter && actor !== actorFilter) return;
    Object.values(payload.spells || {}).forEach((entry) => {
      const spellName = entry.realName || "";
      if (spellFilter && !spellName.includes(spellFilter)) return;
      rows.push({
        category,
        actor,
        spell: spellName,
        amount: entry.val,
        element: entry.element || null,
      });
    });
  });
  return rows.sort((a, b) => b.amount - a.amount);
}

function compactSnapshot(snapshot) {
  return {
    currentCaster: snapshot.currentCaster,
    currentSpell: snapshot.currentSpell,
    pendingIndirectAttribution: snapshot.pendingIndirectAttribution,
  };
}

function printUsage() {
  console.log("Usage: node tools/combat/replay-log.js <logPath> [--actor <name>] [--spell <text>] [--trace <text>] [--json]");
}

function main() {
  const { logPath, options } = parseArgs(process.argv.slice(2));
  if (!logPath) {
    printUsage();
    process.exitCode = 1;
    return;
  }

  const absoluteLogPath = path.resolve(logPath);
  if (!fs.existsSync(absoluteLogPath)) {
    console.error(`Log not found: ${absoluteLogPath}`);
    process.exitCode = 1;
    return;
  }

  const harness = createCombatHarness();
  const raw = fs.readFileSync(absoluteLogPath, "utf8");
  const lines = raw.split(/\r?\n/);
  const traces = [];
  let combatLineCount = 0;

  lines.forEach((line, index) => {
    if (!isCombatLine(line)) return;
    combatLineCount += 1;

    const shouldTrace = options.trace && line.includes(options.trace);
    if (shouldTrace) {
      harness.clearTraceBuffer();
      const before = compactSnapshot(harness.snapshot());
      harness.processFightLog(line);
      const after = compactSnapshot(harness.snapshot());
      traces.push({
        lineNumber: index + 1,
        line,
        before,
        events: harness.consumeTraceBuffer(),
        after,
      });
      return;
    }

    harness.processFightLog(line);
  });

  const snapshot = harness.snapshot();
  const matches = [
    ...collectMatches(snapshot.fightData, "damage", options.actor, options.spell),
    ...collectMatches(snapshot.healData, "healing", options.actor, options.spell),
    ...collectMatches(snapshot.armorData, "armor", options.actor, options.spell),
  ];

  if (options.json) {
    console.log(
      JSON.stringify(
        {
          logPath: absoluteLogPath,
          combatLineCount,
          filters: {
            actor: options.actor,
            spell: options.spell,
            trace: options.trace,
          },
          matches,
          traces,
          snapshot,
        },
        null,
        2
      )
    );
    return;
  }

  console.log(`Log: ${absoluteLogPath}`);
  console.log(`Combat lines processed: ${combatLineCount}`);
  if (options.actor || options.spell) {
    console.log(`Filters: actor=${options.actor || "*"} spell=${options.spell || "*"}`);
  }

  if (matches.length > 0) {
    console.log("");
    console.log("Matches:");
    matches.forEach((entry) => {
      const elementSuffix = entry.element ? ` [${entry.element}]` : "";
      console.log(`- ${entry.category} | ${entry.actor} | ${entry.spell}${elementSuffix} | ${entry.amount}`);
    });
  } else if (options.actor || options.spell) {
    console.log("");
    console.log("Matches: none");
  }

  if (traces.length > 0) {
    console.log("");
    console.log("Trace:");
    traces.forEach((trace) => {
      console.log(`- Line ${trace.lineNumber}: ${trace.line}`);
      console.log(`  Before: ${JSON.stringify(trace.before)}`);
      if (trace.events.length === 0) {
        console.log("  Events: []");
      } else {
        trace.events.forEach((event) => {
          console.log(`  Event: ${JSON.stringify(event)}`);
        });
      }
      console.log(`  After: ${JSON.stringify(trace.after)}`);
    });
  }

  if (!options.actor && !options.spell) {
    const summary = {
      damageActors: Object.keys(snapshot.fightData || {}).length,
      healingActors: Object.keys(snapshot.healData || {}).length,
      armorActors: Object.keys(snapshot.armorData || {}).length,
    };
    console.log("");
    console.log(`Actor summary: damage=${summary.damageActors}, healing=${summary.healingActors}, armor=${summary.armorActors}`);
  }
}

main();
