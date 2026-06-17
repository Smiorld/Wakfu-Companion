let fightStartTime = null;
let pendingArmorDamage = null;

function isExplicitArmorSpellSource(spellName) {
  return !!String(spellName || "").trim();
}

// HELPER CONSTANTS
const NOISE_WORDS = new Set(["Block!", "Critical", "Critical Hit", "Critical Hit Expert", "Slow Influence", "Backstab", "Sidestab", "Berserk", "Influence", "Dodge", "Lock", "Increased Damage", "格挡！", "暴击", "闪避", "锁定", "最终伤害", "元素抗性"]);
let stateEventOrder = 0;

function normalizeStateKey(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[“”"']/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function isNonAttributionHint(value) {
  const normalized = normalizeStateKey(value);
  if (!normalized) return true;

  return (
    /^\d+\s*名敌人受影响$/.test(normalized) ||
    /^\d+\s*enemy(?:ies)?\s*affected$/.test(normalized) ||
    /^\d+\s*ennemi(?:s)?\s*affect[ée]s?$/.test(normalized) ||
    /^\d+\s*enemig(?:o|os)\s*afectados$/.test(normalized) ||
    /^\d+\s*inimig(?:o|os)\s*afetados$/.test(normalized)
  );
}

function resolveStateOwnerCandidate(ownerName) {
  if (!ownerName) return null;
  if (summonBindings[ownerName]) return summonBindings[ownerName];
  if (nonCombatantList.some((nc) => ownerName.includes(nc))) return null;
  return ownerName;
}

function buildStateOwnershipKey(targetName, stateName) {
  const normalizedTarget = String(targetName || "").toLowerCase().trim();
  const normalizedState = normalizeStateKey(stateName);
  return normalizedTarget && normalizedState ? `${normalizedTarget}::${normalizedState}` : "";
}

function rememberStateOwner(targetName, stateName, ownerName) {
  const key = buildStateOwnershipKey(targetName, stateName);
  if (!key || !ownerName) return;
  stateSources[key] = ownerName;
  stateOwnershipMeta[key] = {
    owner: ownerName,
    target: String(targetName || "").trim(),
    state: String(stateName || "").trim(),
    order: ++stateEventOrder,
  };
}

function getStateOwner(targetName, stateName) {
  const key = buildStateOwnershipKey(targetName, stateName);
  return key ? stateSources[key] || null : null;
}

function getLatestStateOwner(targetName) {
  const normalizedTarget = String(targetName || "").toLowerCase().trim();
  if (!normalizedTarget) return null;

  let latest = null;
  Object.values(stateOwnershipMeta).forEach((entry) => {
    if (!entry) return;
    if (String(entry.target || "").toLowerCase().trim() !== normalizedTarget) return;
    if (!latest || entry.order > latest.order) {
      latest = entry;
    }
  });

  return latest ? latest.owner : null;
}

function getLatestStateOwnerByName(stateName) {
  const normalizedState = normalizeStateKey(stateName);
  if (!normalizedState) return null;

  let latest = null;
  Object.values(stateOwnershipMeta).forEach((entry) => {
    if (!entry) return;
    if (normalizeStateKey(entry.state) !== normalizedState) return;
    if (!latest || entry.order > latest.order) {
      latest = entry;
    }
  });

  return latest ? latest.owner : null;
}

function forgetStateOwner(targetName, stateName) {
  const key = buildStateOwnershipKey(targetName, stateName);
  if (!key) return;
  delete stateSources[key];
  delete stateOwnershipMeta[key];
}

function flushPendingIndirectAttribution(ownerOverride = null) {
  if (!pendingIndirectAttribution) return;

  let finalCaster = ownerOverride || pendingIndirectAttribution.defaultCaster;
  let finalSpell = pendingIndirectAttribution.spell;

  if (summonBindings[finalCaster]) {
    const master = summonBindings[finalCaster];
    finalSpell = `${finalSpell} (${finalCaster})`;
    finalCaster = master;
  }

  if (pendingIndirectAttribution.kind === "armor") {
    updateCombatData(armorData, finalCaster, finalSpell, pendingIndirectAttribution.amount, null);
  } else if (pendingIndirectAttribution.kind === "heal") {
    updateCombatData(healData, finalCaster, finalSpell, pendingIndirectAttribution.amount, pendingIndirectAttribution.element);
  } else {
    updateCombatData(fightData, finalCaster, finalSpell, pendingIndirectAttribution.amount, pendingIndirectAttribution.element);
  }

  pendingIndirectAttribution = null;
}

function extractRemovedState(content) {
  const removalPatterns = [
    /^([^:]+):\s*不再受到[“"]([^“”"]+)[”"]的影响/,
    /^([^:]+):\s*no longer affected by[“"]?([^“”"]+)[”"]?/i,
    /^([^:]+):\s*n'est plus affect[ée] par[“"]?([^“”"]+)[”"]?/i,
    /^([^:]+):\s*ya no est[aá] afectado por[“"]?([^“”"]+)[”"]?/i,
    /^([^:]+):\s*deixou de ser afetado por[“"]?([^“”"]+)[”"]?/i,
  ];

  for (const pattern of removalPatterns) {
    const match = content.match(pattern);
    if (match) {
      return {
        target: match[1].trim(),
        state: match[2].trim(),
      };
    }
  }

  return null;
}

function shouldUseLatestStateFallback(targetName, spellOverride, currentCasterName) {
  if (!targetName || !spellOverride) return false;
  if (isStateFallbackUnsafeSpellName(spellOverride)) return false;

  // Only fall back to "latest state owner" when the parser does not have a
  // reliable active caster context. If we already know who is acting, using the
  // target's most recent state owner is too broad and can cross-wire unrelated
  // debuffs on the same target.
  if (!currentCasterName || currentCasterName === "Unknown") return true;

  return false;
}

function isStateFallbackUnsafeSpellName(spellName) {
  const normalized = String(spellName || "").toLowerCase();
  if (!normalized) return false;

  return ["burning armor", "armadura ardiente", "reflect", "thorns", "反弹", "棘刺"].some((keyword) =>
    normalized.includes(String(keyword).toLowerCase())
  );
}

const COMBAT_CHANNEL_TAGS = [
  "[fight log]",
  "[information (combat)]",
  "[información (combate)]",
  "[registro de lutas]",
  "[战斗日志]",
];

const BATTLE_END_MESSAGES = [
  "fight is over",
  "battle is over",
  "combat is over",
  "fight ended",
  "battle ended",
  "combat ended",
  "le combat est terminé",
  "el combate ha terminado",
  "a luta terminou",
  "战斗结束了",
  "战斗结束",
];

const TURN_CARRYOVER_MARKERS = [
  "carried over",
  "tour suivant",
  "保留",
  "下一回合",
];

function isCombatChannelLine(line, lineLower) {
  const lower = lineLower || String(line || "").toLowerCase();
  return COMBAT_CHANNEL_TAGS.some((tag) =>
    /[^\x00-\x7F]/.test(tag) ? String(line || "").includes(tag) : lower.includes(tag)
  );
}

function isBattleEndContent(content) {
  const lower = String(content || "").toLowerCase();
  return BATTLE_END_MESSAGES.some((marker) => lower.includes(marker.toLowerCase()));
}

function isTurnCarryoverContent(content) {
  const value = String(content || "");
  const lower = value.toLowerCase();
  return TURN_CARRYOVER_MARKERS.some((marker) =>
    /[^\x00-\x7F]/.test(marker) ? value.includes(marker) : lower.includes(marker.toLowerCase())
  );
}

function processFightLog(line) {
  const hpUnits = "HP|PdV|PV|生命";
  const armorUnits = "Armor|Armadura|Armure|护甲";
  const numPattern = "[\\d,.\\s]+";

  const parts = line.split(/\] /);
  if (parts.length < 2) return;
  const content = parts[1].trim();
  const removedState = extractRemovedState(content);

  if (pendingIndirectAttribution && removedState && removedState.target === pendingIndirectAttribution.target) {
    const removedStateOwner = getStateOwner(removedState.target, removedState.state);
    if (removedStateOwner) {
      flushPendingIndirectAttribution(removedStateOwner);
    }
  }

  // Auto Reset Logic
  if (isAutoResetOn && awaitingNewFight && !isBattleEndContent(content)) {
    performReset(true);
    awaitingNewFight = false;
  }

  // 1. Turn/Time Carryover - RESET CASTER
  if (isTurnCarryoverContent(content)) {
    flushPendingIndirectAttribution();
    currentCaster = null;
    currentSpell = "Passive / Indirect";
    // Flush pending if any (assume Neutral if turn ended)
    if (pendingArmorDamage) {
      updateCombatData(fightData, pendingArmorDamage.caster, pendingArmorDamage.spell, pendingArmorDamage.amount, "Neutral");
      pendingArmorDamage = null;
    }
    return;
  }

  // 2. Cast Detection
  const castMatch = content.match(/^(.*?) (?:casts|lance(?: le sort)?|lanza(?: el hechizo)?|lança(?: o feitiço)?|施放)\s*[“"]?(.*?)[”"]?(?:\.(?=$|\s[\(（])|(?=\s[\(（])|$)/i);
  if (castMatch) {
    flushPendingIndirectAttribution();
    // If we have pending armor damage when a NEW spell starts, flush it as Neutral
    if (pendingArmorDamage) {
      updateCombatData(fightData, pendingArmorDamage.caster, pendingArmorDamage.spell, pendingArmorDamage.amount, "Neutral");
      pendingArmorDamage = null;
    }

    const casterCandidate = castMatch[1].trim();
    const castSpell = castMatch[2].trim().replace(/^[“"]|[”"]$/g, "");

    if (!nonCombatantList.some((nc) => casterCandidate.includes(nc))) {
      currentCaster = casterCandidate;
      currentSpell = castSpell;
      detectClass(currentCaster, currentSpell);
    }
    return;
  }

  if (removedState) {
    forgetStateOwner(removedState.target, removedState.state);
  }

  // Status ownership is tracked per target so later indirect effects can be
  // attributed back to whoever applied the state, even if the damage/heal/armor
  // line itself has no explicit caster.
  const stateMatch = content.match(/^([^:]+):\s*([^:+\-\d][^:（）()]*)\s*[\(（]([^()（）]+)[\)）]/);
  if (stateMatch) {
    const stateTarget = stateMatch[1].trim();
    const stateName = stateMatch[2].trim();
    const existingOwner = getStateOwner(stateTarget, stateName);

    const hasActiveCaster =
      currentCaster &&
      currentCaster !== "Unknown" &&
      currentSpell &&
      currentSpell !== "Unknown Spell" &&
      currentSpell !== "Passive / Indirect";

    const activeOwner = hasActiveCaster ? resolveStateOwnerCandidate(currentCaster) : null;
    const inferredOwner = activeOwner || existingOwner || getLatestStateOwner(stateTarget) || stateTarget;

    // Only store ownership if it's likely to belong to a combatant/player-side
    // entity rather than a mechanic label.
    if (inferredOwner && !nonCombatantList.some((nc) => inferredOwner.includes(nc))) {
      rememberStateOwner(stateTarget, stateName, inferredOwner);
    }
  }

  // 3. Action Detection (Damage/Heal/Armor)
  const actionMatch = content.match(new RegExp(`^(.*?):\\s*([+-])?(${numPattern})\\s*(${hpUnits}|${armorUnits})(.*)`));
  if (actionMatch) {
    flushPendingIndirectAttribution();
    const target = actionMatch[1].trim();
    const sign = actionMatch[2] || "";
    const amount = parseInt(actionMatch[3].replace(/[,.\s]/g, ""), 10);
    const unit = actionMatch[4];
    const suffix = actionMatch[5].trim();

    // --- PRE-PROCESSING: Extract Element & Spell Override ---
    // We do this BEFORE the "amount <= 0" check because we need the element even from 0 HP lines
    const details = Array.from(suffix.matchAll(/[\(（]([^()（）]+)[\)）]/g), (match) => match[1]);

    let detectedElement = null;
    let spellOverride = null;

    for (const d of details) {
      const norm = normalizeElement(d);
      if (norm) {
        detectedElement = norm;
      } else if (isNonAttributionHint(d)) {
        continue;
      } else if (!NOISE_WORDS.has(d)) {
        const knownMatch = Array.from(allKnownSpells).find((s) => d === s || d.includes(s));

        if (knownMatch) {
          spellOverride = knownMatch;
        } else {
          const isPrioritySource = d.includes("Potion") || d.includes("Flask") || d.includes("Flasque") || d.includes("Consumable");

          const isCurrentSpellValid = currentSpell && spellToClassMap[currentSpell];

          if (isPrioritySource || !isCurrentSpellValid) {
            if (!d.toLowerCase().includes("lost")) {
              spellOverride = d;
            }
          }
        }
      }
    }

    // --- RESOLVE PENDING ARMOR DAMAGE ---
    // If we have a pending armor hit, this line (usually -0 HP) provides the element
    if (pendingArmorDamage) {
      let elementToUse = "Neutral";
      // Only apply element if targets match. Otherwise, it's a disjointed event.
      if (target === pendingArmorDamage.target) {
        elementToUse = detectedElement || "Neutral";
      }

      updateCombatData(fightData, pendingArmorDamage.caster, pendingArmorDamage.spell, pendingArmorDamage.amount, elementToUse);
      pendingArmorDamage = null;
    }
    // ------------------------------------

    // Now valid amount check (Exit if 0, effectively skipping the -0 HP line itself)
    if (isNaN(amount) || amount <= 0) return;

    if (!fightStartTime) fightStartTime = Date.now();

    // ATTRIBUTION LOGIC
    let finalCaster = currentCaster;
    if (!currentCaster || currentCaster === "Unknown") {
      finalCaster = target;
    }

    // 1. Check State Ownership (The Fix)
    const directStateOwner = spellOverride ? getStateOwner(target, spellOverride) : null;
    const namedStateOwner = !directStateOwner && spellOverride ? getLatestStateOwnerByName(spellOverride) : null;
    const fallbackStateOwner =
      !directStateOwner && !namedStateOwner && shouldUseLatestStateFallback(target, spellOverride, currentCaster)
        ? getLatestStateOwner(target)
        : null;

    if (directStateOwner || namedStateOwner || fallbackStateOwner) {
      finalCaster = directStateOwner || namedStateOwner || fallbackStateOwner;
    }
    // 2. Specific self-harm check
    else if (["Burning Armor", "Armadura Ardiente", "Reflect", "Thorns"].some((s) => spellOverride && spellOverride.includes(s))) {
      finalCaster = target;
    }

    // HEAL SAFEGUARD & MECHANIC DETECTION
    if (sign === "+") {
      const casterIsAlly = finalCaster && isPlayerAlly({ name: finalCaster });
      const targetIsAlly = isPlayerAlly({ name: target });

      if (casterIsAlly && !targetIsAlly) {
        finalCaster = target;
        if (!spellOverride) spellOverride = "Mechanic / Passive";
      }

      if (!casterIsAlly && !targetIsAlly && finalCaster !== target) {
        const spellNameToCheck = spellOverride || currentSpell;
        if (spellNameToCheck && !spellToClassMap[spellNameToCheck]) {
          finalCaster = target;
        }
      }
    }

    let finalSpell = spellOverride || currentSpell;

    // SIGNATURE REROUTING
    if (finalSpell && finalSpell !== "Unknown Spell" && finalSpell !== "Passive / Indirect" && finalCaster !== "Dungeon Mechanic") {
      finalCaster = getSignatureCaster(finalSpell, finalCaster);
    }

    // Summon Binding
    if (summonBindings[finalCaster]) {
      const master = summonBindings[finalCaster];
      finalSpell = `${finalSpell} (${finalCaster})`;
      finalCaster = master;
    }

    const isArmor = unit.match(new RegExp(armorUnits, "i"));

    if (isArmor && sign !== "-" && isExplicitArmorSpellSource(spellOverride)) {
      // Positive armor lines in CN logs often omit the "+" sign entirely.
      // When they still carry an explicit source in parentheses
      // (for example 地盘术 / 突击), they are usually self-generated shields
      // and should be attributed to the shield owner rather than the
      // previously active caster context.
      finalCaster = target;
    }

    if (isArmor) {
      if (sign === "-") {
        // Negative Armor = Damage (Shield Break)
        // STORE AND WAIT for next line to get Element
        pendingArmorDamage = {
          caster: finalCaster,
          spell: finalSpell,
          amount: amount,
          target: target,
        };
        return; // Stop here, wait for next loop iteration
      } else {
        if (!directStateOwner && fallbackStateOwner && spellOverride && finalCaster !== target) {
          pendingIndirectAttribution = {
            kind: "armor",
            target: target,
            amount: amount,
            element: null,
            spell: finalSpell,
            defaultCaster: fallbackStateOwner,
          };
          return;
        }
        // Positive Armor = Shielding
        updateCombatData(armorData, finalCaster, finalSpell, amount, null);
      }
    } else if (sign === "+") {
      if (!directStateOwner && fallbackStateOwner && spellOverride) {
        pendingIndirectAttribution = {
          kind: "heal",
          target: target,
          amount: amount,
          element: detectedElement || "Neutral",
          spell: finalSpell,
          defaultCaster: fallbackStateOwner,
        };
        return;
      }
      updateCombatData(healData, finalCaster, finalSpell, amount, detectedElement || "Neutral");
    } else {
      if (!directStateOwner && fallbackStateOwner && spellOverride) {
        pendingIndirectAttribution = {
          kind: "damage",
          target: target,
          amount: amount,
          element: detectedElement || "Neutral",
          spell: finalSpell,
          defaultCaster: fallbackStateOwner,
        };
        return;
      }
      updateCombatData(fightData, finalCaster, finalSpell, amount, detectedElement || "Neutral");
    }

    lastCombatTime = Date.now();
    updateWatchdogUI();
  }
}

function updateCombatData(dataSet, player, spell, amount, element) {
  if (!dataSet[player]) dataSet[player] = { name: player, total: 0, spells: {} };
  dataSet[player].total += amount;

  const spellKey = `${spell}|${element || "neutral"}`;
  if (!dataSet[player].spells[spellKey]) {
    dataSet[player].spells[spellKey] = {
      val: 0,
      element: element,
      realName: spell,
    };
  }
  dataSet[player].spells[spellKey].val += amount;

  // Mark as dirty so we know we have data to save
  hasUnsavedChanges = true;
}

function detectClass(playerName, spellName) {
  const lowerName = playerName.toLowerCase().trim();

  // Skip detection if this entity is known to be a monster
  if (monsterLookup[lowerName]) return;

  if (spellToClassMap[spellName]) {
    const detected = spellToClassMap[spellName];
    if (playerClasses[playerName] !== detected) {
      playerClasses[playerName] = detected;
      // Clear icon cache so it re-renders with the new class icon
      delete playerIconCache[playerName];
    }
  }
}

function saveFightToHistory() {
  // 1. Check if there is data
  if (Object.keys(fightData).length === 0 && Object.keys(healData).length === 0) return;

  // 2. NEW: Check if we actually have new changes since last save
  if (!hasUnsavedChanges) return;

  // Create a deep copy of the current state
  const snapshot = {
    damage: JSON.parse(JSON.stringify(fightData)),
    healing: JSON.parse(JSON.stringify(healData)),
    armor: JSON.parse(JSON.stringify(armorData)),
    classes: JSON.parse(JSON.stringify(playerClasses)),
    overrides: JSON.parse(JSON.stringify(manualOverrides)),
    timestamp: new Date().toLocaleTimeString(),
  };

  // Add to start of array
  fightHistory.unshift(snapshot);

  // MEMORY OPTIMIZATION: Limit history to MAX_FIGHT_HISTORY (5)
  while (fightHistory.length > MAX_FIGHT_HISTORY) {
    fightHistory.pop();
  }

  try {
    localStorage.setItem("wakfu_fight_history", JSON.stringify(fightHistory));
  } catch (e) {
    console.error("Failed to save history - Storage full?", e);
    // If storage is full, clear history to prevent app crash
    fightHistory = [];
  }

  // Mark as saved
  hasUnsavedChanges = false;

  updateHistoryButtons();
}

function performReset(isAuto = false) {
  // 1. Save to history before clearing
  saveFightToHistory();

  // 2. Clear Live Data
  fightData = {};
  healData = {};
  armorData = {};

  // 3. Reset State
  currentCaster = "Unknown";
  currentSpell = "Unknown Spell";
  awaitingNewFight = false;
  hasUnsavedChanges = false;
  fightStartTime = null;
  pendingArmorDamage = null; // Clear any hanging buffer
  pendingIndirectAttribution = null;
  stateSources = {};
  stateOwnershipMeta = {};
  stateEventOrder = 0;

  // 4. CLEAR STORAGE
  localStorage.removeItem("wakfu_live_combat_state");

  // 5. Reset Views
  currentViewIndex = "live";
  updateHistoryButtons();

  renderMeter();
  updateWatchdogUI();
}

function getFightDuration() {
  if (!fightStartTime) return "00:00";
  const end = lastCombatTime > fightStartTime ? lastCombatTime : Date.now();
  const diff = end - fightStartTime;
  const minutes = Math.floor(diff / 60000);
  const seconds = Math.floor((diff % 60000) / 1000);
  return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
}

function mergeSummonData(summon, master) {
  const existingMaster = summonBindings[summon];
  if (existingMaster && existingMaster !== master) {
    unmergeSingleSummon(summon, existingMaster);
  }

  // We iterate through all 3 categories: damage, healing, and armor
  [fightData, healData, armorData].forEach((dataSet) => {
    if (dataSet[summon]) {
      // Create master entry if they don't exist in this specific dataset yet
      if (!dataSet[master]) {
        dataSet[master] = { name: master, total: 0, spells: {} };
      }

      // 1. Move the total value
      dataSet[master].total += dataSet[summon].total;

      // 2. Move and prefix the spells so you know they came from the summon
      Object.entries(dataSet[summon].spells).forEach(([key, s]) => {
        const originalName = s.realName || key.split("|")[0];
        const newSpellName = `${originalName} (${summon})`;
        const element = s.element || "Neutral";
        const newKey = `${newSpellName}|${element}`;

        if (!dataSet[master].spells[newKey]) {
          dataSet[master].spells[newKey] = {
            val: 0,
            element: element,
            realName: newSpellName,
          };
        }
        dataSet[master].spells[newKey].val += s.val;
      });

      // 3. Remove the summon from the top level so they disappear from the list
      delete dataSet[summon];

      // 4. Clear icon cache for the master to ensure clean re-render
      delete playerIconCache[master];
    }
  });
}

function unmergeSingleSummon(summon, master) {
  [fightData, healData, armorData].forEach((dataSet) => {
    const masterEntry = dataSet[master];
    if (!masterEntry || !masterEntry.spells) return;

    const suffix = ` (${summon})`;
    const movedSpellKeys = Object.keys(masterEntry.spells).filter((key) => {
      const spell = masterEntry.spells[key];
      const realName = spell.realName || key.split("|")[0];
      return realName.endsWith(suffix);
    });

    if (movedSpellKeys.length === 0) return;

    if (!dataSet[summon]) {
      dataSet[summon] = { name: summon, total: 0, spells: {} };
    }

    movedSpellKeys.forEach((mergedKey) => {
      const spellData = masterEntry.spells[mergedKey];
      const mergedRealName = spellData.realName || mergedKey.split("|")[0];
      const originalName = mergedRealName.slice(0, -suffix.length);
      const elementKey = mergedKey.split("|").slice(1).join("|") || "neutral";
      const restoredKey = `${originalName}|${elementKey}`;

      if (!dataSet[summon].spells[restoredKey]) {
        dataSet[summon].spells[restoredKey] = {
          val: 0,
          element: spellData.element,
          realName: originalName,
        };
      }

      dataSet[summon].spells[restoredKey].val += spellData.val;
      dataSet[summon].total += spellData.val;
      masterEntry.total -= spellData.val;
      delete masterEntry.spells[mergedKey];
    });

    if (masterEntry.total < 0) {
      masterEntry.total = 0;
    }

    if (Object.keys(masterEntry.spells).length === 0 && masterEntry.total === 0) {
      delete dataSet[master];
    }

    delete playerIconCache[summon];
    delete playerIconCache[master];
  });
}

function clearSummonBindings() {
  Object.entries(summonBindings).forEach(([summon, master]) => {
    unmergeSingleSummon(summon, master);
  });
  summonBindings = {};

  try {
    saveLiveCombatState();
  } catch (e) {
    console.warn("Failed to persist cleared summon bindings", e);
  }

  if (typeof lastRenderSignature !== "undefined") lastRenderSignature = "";
  if (typeof renderMeter === "function") renderMeter();
}

function generateSpellMap() {
  if (typeof classSpells === "undefined") return;
  spellToClassMap = {};
  allKnownSpells = new Set(); // Ensure this is initialized

  // Iterate over each class (e.g., "feca", "iop")
  for (const [className, langData] of Object.entries(classSpells)) {
    // Handle the new structure: Object with languages { en: [], fr: [] }
    if (typeof langData === "object" && !Array.isArray(langData)) {
      // Iterate over each language array
      for (const spells of Object.values(langData)) {
        if (Array.isArray(spells)) {
          spells.forEach((spell) => {
            spellToClassMap[spell] = className;
            allKnownSpells.add(spell);
          });
        }
      }
    }
    // Fallback for flat structure if data is mixed (e.g. array of strings)
    else if (Array.isArray(langData)) {
      langData.forEach((spell) => {
        spellToClassMap[spell] = className;
        allKnownSpells.add(spell);
      });
    }
  }

  // --- MANUAL INJECTIONS ---

  // SADIDA TOXINS & DOLL SPELLS
  const sadidaSpells = [
    "Harmless Toxin",
    "Toxine inoffensive",
    "Toxina inofensiva",
    "Tetatoxin",
    "Tétatoxine",
    "Venomous",
    "Venimeux",
    "Liquid Ghoul",
    // Fix for Task 2: Nettled states
    "Sadida Nettled",
    "Nettled",
  ];

  sadidaSpells.forEach((s) => {
    spellToClassMap[s] = "sadida";
    allKnownSpells.add(s);
  });

  // ECAFLIP
  spellToClassMap["Blackjack"] = "ecaflip";
  allKnownSpells.add("Blackjack");
}

function normalizeElement(el) {
  if (!el) return null;
  const low = el.toLowerCase().trim();
  const elementMap = {
    // English
    fire: "Fire",
    water: "Water",
    earth: "Earth",
    air: "Air",
    stasis: "Stasis",
    light: "Light",
    neutral: "Neutral",
    火系: "Fire",
    水系: "Water",
    地系: "Earth",
    风系: "Air",
    光系: "Light",
    中性: "Neutral",
    创生: "Stasis",
    创生力: "Stasis",
    // French
    feu: "Fire",
    eau: "Water",
    terre: "Earth",
    aire: "Air",
    stase: "Stasis",
    lumière: "Light",
    neutre: "Neutral",
    // Spanish
    fuego: "Fire",
    agua: "Water",
    tierra: "Earth",
    aire: "Air",
    estasis: "Stasis",
    luz: "Light",
    neutral: "Neutral",
    // Portuguese
    fogo: "Fire",
    água: "Water",
    terra: "Earth",
    ar: "Air",
    estase: "Stasis",
    luz: "Light",
    neutro: "Neutral",
  };
  return elementMap[low] || (["Fire", "Water", "Earth", "Air", "Stasis", "Light", "Neutral"].includes(el) ? el : null);
}

// Entities that should NEVER own subsequent damage procs
const nonCombatantList = ["Gobgob", "Beacon", "Balise", "Standard-Bearing Puppet", "Microbot", "Cybot", "Dial", "Cadran", "Coney", "Lapino", "刺客分身"];

// Helper for elements normalization
const elementMap = {
  aire: "Air",
  ar: "Air",
  fuego: "Fire",
  fogo: "Fire",
  feu: "Fire",
  tierra: "Earth",
  terra: "Earth",
  terre: "Earth",
  agua: "Water",
  água: "Water",
  eau: "Water",
  estasis: "Stasis",
  stase: "Stasis",
  luz: "Light",
  lumière: "Light",
};

// Helper to find a player by their detected class
function findFirstPlayerByClass(targetClass) {
  return Object.keys(playerClasses).find((name) => playerClasses[name] === targetClass);
}

// Helper to ensure damage goes to the rightful class owner
function getSignatureCaster(spellName, defaultCaster) {
  const signatureClass = spellToClassMap[spellName];
  if (!signatureClass) return defaultCaster;

  // Check if the current caster is already the correct class
  if (playerClasses[defaultCaster] === signatureClass) return defaultCaster;

  // If not, try to find a player in the fight who IS that class
  const classOwner = findFirstPlayerByClass(signatureClass);
  return classOwner || defaultCaster;
}

function routeCombatData(unit, armorUnits, sign, caster, spell, amount, element) {
  if (unit.match(new RegExp(armorUnits, "i"))) {
    updateCombatData(armorData, caster, spell, amount, null);
  } else if (sign === "+") {
    updateCombatData(healData, caster, spell, amount, element);
  } else {
    updateCombatData(fightData, caster, spell, amount, element);
  }
}

// Helper: Determine if a player object belongs to Allies or Enemies
function isPlayerAlly(p, contextClasses = null, contextOverrides = null) {
  const classesMap = contextClasses || playerClasses;
  const overridesMap = contextOverrides || manualOverrides;
  const name = p.name;
  const lowerName = name.toLowerCase().trim();

  // 1. Manual Overrides (Highest Priority - from Drag & Drop)
  if (overridesMap[name]) return overridesMap[name] === "ally";

  // 2. Known Monsters & Bosses (Strict Enemy)
  if (monsterLookup[lowerName]) return false;

  // 3. Enemy Families (Generic Logic)
  if (typeof wakfuEnemies !== "undefined") {
    const isEnemy = wakfuEnemies.some((fam) => lowerName.includes(fam.toLowerCase()));
    if (isEnemy || name.includes("Punchy") || name.includes("Papas")) return false;
  }

  // 4. Detected Player Classes (Ally)
  // Only checks this AFTER confirming it's not a known monster
  if (classesMap[name]) return true;

  // 5. Known Summons (Ally)
  if (typeof allySummons !== "undefined" && allySummons.includes(name)) return true;

  // 6. Default Fallback -> Enemy
  return false;
}

document.getElementById("resetBtn").addEventListener("click", performReset);
document
  .getElementById("clearSummonBindingsBtn")
  .addEventListener("click", clearSummonBindings);

let monsterLookup = {};
let stateSources = {}; // Maps "target::state" -> Player Name
let stateOwnershipMeta = {}; // Maps "target::state" -> { owner, target, state, order }
let pendingIndirectAttribution = null;

function initMonsterDatabase() {
  if (typeof wakfuMonsters === "undefined") return;

  monsterLookup = {};

  // Create Lookup Table
  const len = wakfuMonsters.length;
  for (let i = 0; i < len; i++) {
    const m = wakfuMonsters[i];
    const img = m.imgId;
    // Optimization: Low-level assign is faster than forEach on keys
    if (m.nameEN) monsterLookup[m.nameEN.toLowerCase()] = img;
    if (m.nameFR) monsterLookup[m.nameFR.toLowerCase()] = img;
    if (m.nameES) monsterLookup[m.nameES.toLowerCase()] = img;
    if (m.namePT) monsterLookup[m.namePT.toLowerCase()] = img;
  }

  // Delete the massive source array from memory
  wakfuMonsters = null;
  delete window.wakfuMonsters;
}

function loadFightHistory() {
  const stored = localStorage.getItem("wakfu_fight_history");
  if (stored) {
    try {
      fightHistory = JSON.parse(stored);
      updateHistoryButtons();
    } catch (e) {
      console.error("Error loading fight history:", e);
      fightHistory = []; // Reset on corruption
    }
  }
}

function updateHistoryButtons() {
  // Update numeric buttons availability
  for (let i = 0; i < 5; i++) {
    const btn = document.getElementById(`btn-hist-${i}`);
    if (btn) {
      if (fightHistory[i]) {
        btn.classList.remove("disabled");
        btn.title = `Fight ended at ${fightHistory[i].timestamp}`;
      } else {
        btn.classList.add("disabled");
        btn.title = "Empty";
      }

      // Highlight active view
      if (currentViewIndex === i) btn.classList.add("active");
      else btn.classList.remove("active");
    }
  }

  // Update Live button
  const liveBtn = document.getElementById("btn-live");
  if (liveBtn) {
    if (currentViewIndex === "live") liveBtn.classList.add("active");
    else liveBtn.classList.remove("active");
  }
}

function viewHistory(index) {
  currentViewIndex = index;
  updateHistoryButtons();
  renderMeter();
}

let permissionStrikeCount = 0; // Counter for transient errors

const LOOT_KEYWORDS = ["picked up", "ramassé", "obtenu", "recogido", "obtenido", "apanhou", "obteve", "你得到了", "你失去了", "配方完成", "回收"];

async function parseFile() {
  const now = Date.now();
  if (isReading) {
    if (window.lastReadTime && now - window.lastReadTime > 2000) {
      console.warn("[Nexus] Reader was stuck. Forcing unlock.");
      isReading = false;
    } else {
      return;
    }
  }

  isReading = true;

  try {
    const file = await fileHandle.getFile();

    // Success: Reset error counter
    permissionStrikeCount = 0;

    if (file.size > fileOffset) {
      const blob = file.slice(fileOffset, file.size);
      const text = await blob.text();

      // Optimization: Manual split to avoid memory retention issues
      const lines = text.split(/\r?\n/);

      for (let i = 0; i < lines.length; i++) {
        // Detach string from memory blob
        const cleanLine = (" " + lines[i]).slice(1);
        processLine(cleanLine);
      }

      lines.length = 0; // Clear array
      fileOffset = file.size;

      // Batch Update UI
      renderMeter();

      if (trackerDirty) {
        saveTrackerState();
        renderTracker();
        trackerDirty = false;
      }
    }
  } catch (err) {
    // --- HANDLE FILE LOCKING ---
    if (err.name === "NotReadableError") {
      // This is normal. The game is currently writing to the file. We just skip this tick and try again in 1 second. DO NOT increment permissionStrikeCount.
      console.warn("[Nexus] File locked by game (busy). Retrying next tick...");
    }
    // Handle actual Permission Loss or File Deletion
    else if (err.name === "NotFoundError" || err.message.includes("permission")) {
      permissionStrikeCount++;
      console.error(`[Nexus] Read Error (${permissionStrikeCount}/10):`, err);

      // Only stop if it fails 10 times consecutively (10 seconds of failure)
      if (permissionStrikeCount >= 10) {
        console.error("[Nexus] Persistent file error. Stopping reader.");
        if (typeof parseIntervalId !== "undefined") clearInterval(parseIntervalId);

        // Show Reconnect UI
        document.getElementById("setup-panel").style.display = "block";
        document.getElementById("drop-zone").style.display = "none";
        document.getElementById("reconnect-container").style.display = "block";
      }
    } else {
      console.error("[Nexus] Unexpected Error:", err);
    }
  } finally {
    // Critical: Always unlock the reader so the next interval tick can run
    isReading = false;
  }
}

function processLine(line) {
  if (!line || line.trim() === "") return;

  const lineLower = line.toLowerCase();

  const battleJustFinished =
    isCombatChannelLine(line, lineLower) && isBattleEndContent(line);

  if (typeof processSessionLog === "function") {
    processSessionLog(line);
  }

  if (battleJustFinished) {
    saveFightToHistory();
    awaitingNewFight = true;
    updateWatchdogUI();
  }

  if (logLineCache.has(line)) return;
  logLineCache.add(line);
  if (logLineCache.size > MAX_CACHE_SIZE) {
    const firstItem = logLineCache.values().next().value;
    logLineCache.delete(firstItem);
  }

  try {
    const isLoot = LOOT_KEYWORDS.some((kw) => lineLower.includes(kw));
    const isCombat = isCombatChannelLine(line, lineLower);

    if (isLoot) {
      processItemLog(line);
    } else if (isCombat) {
      processFightLog(line);
    }

    if (line.match(/^\d{2}:\d{2}:\d{2}/)) {
      processChatLog(line);
    }
  } catch (err) {
    console.error("Parsing Error:", err);
  }
}

function saveLiveCombatState() {
  if (Object.keys(fightData).length === 0 && Object.keys(healData).length === 0) return;

  const state = {
    fightData,
    healData,
    armorData,
    playerClasses,
    manualOverrides,
    summonBindings,
    fightStartTime,
    awaitingNewFight,
  };
  localStorage.setItem("wakfu_live_combat_state", JSON.stringify(state));
}

function loadLiveCombatState() {
  const raw = localStorage.getItem("wakfu_live_combat_state");
  if (!raw) return;

  try {
    const state = JSON.parse(raw);

    fightData = state.fightData || {};
    healData = state.healData || {};
    armorData = state.armorData || {};
    playerClasses = state.playerClasses || {};
    manualOverrides = state.manualOverrides || {};
    summonBindings = state.summonBindings || {};
    fightStartTime = state.fightStartTime || null;
    awaitingNewFight = state.awaitingNewFight || false;

    if (Object.keys(fightData).length > 0 || Object.keys(healData).length > 0) {
      window.isRestoredSession = true;
    }

    if (typeof renderMeter === "function") renderMeter();
    if (typeof updateWatchdogUI === "function") updateWatchdogUI();
  } catch (e) {
    console.error("Failed to restore live combat state", e);
  }
}

// Auto-save when closing the page/tab
window.addEventListener("beforeunload", () => {
  saveLiveCombatState();
});

// Export for main.js
window.loadLiveCombatState = loadLiveCombatState;
