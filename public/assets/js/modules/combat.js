let fightStartTime = null;
let pendingArmorDamage = null;
let pendingReactiveDamageMatches = [];
let pendingExitReactiveSelfHit = null;
const COMBAT_BOOTSTRAP_INITIAL_WINDOW_BYTES = 4 * 1024 * 1024;
const COMBAT_BOOTSTRAP_MAX_WINDOW_BYTES = 32 * 1024 * 1024;
const COMBAT_BOOTSTRAP_END_ANCHOR_COUNT = MAX_FIGHT_HISTORY + 1;

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
    /^\d+\s*inimig(?:o|os)\s*afetados$/.test(normalized) ||
    normalized.includes("生命偷取") ||
    normalized.includes("life steal") ||
    normalized.includes("vol de vie") ||
    normalized.includes("robo de vida") ||
    normalized.includes("roubo de vida")
  );
}

function isLikelyExplicitEffectSource(value) {
  const normalized = normalizeStateKey(value);
  if (!normalized || isNonAttributionHint(value) || NOISE_WORDS.has(value)) return false;

  return ![
    "最终伤害",
    "final damage",
    "healing",
    "治疗",
    "元素抗性",
    "critical",
    "暴击",
    "lock",
    "dodge",
  ].some((fragment) => normalized.includes(String(fragment).toLowerCase()));
}

function extractReactiveOwnerFromSpell(spellName) {
  const raw = String(spellName || "").trim();
  if (!raw) return null;

  const patterns = [
    /(.*?)(?:反击)$/u,
    /(.*?)(?:counterattack)$/iu,
    /(.*?)(?:riposte)$/iu,
    /(.*?)(?:contraataque)$/iu,
    /(.*?)(?:contra-ataque)$/iu,
  ];

  for (const pattern of patterns) {
    const match = raw.match(pattern);
    if (!match) continue;
    const owner = String(match[1] || "").trim();
    if (owner) return owner;
  }

  return null;
}

function trackReactiveDamageCandidate(entry) {
  if (!entry) return;
  pendingReactiveDamageMatches.push({
    ...entry,
    lookahead: 2,
  });
  if (pendingReactiveDamageMatches.length > 8) {
    pendingReactiveDamageMatches = pendingReactiveDamageMatches.slice(-8);
  }
}

function ageReactiveDamageCandidates() {
  pendingReactiveDamageMatches = pendingReactiveDamageMatches
    .map((entry) => ({ ...entry, lookahead: Number(entry.lookahead || 0) - 1 }))
    .filter((entry) => entry.lookahead >= 0);
}

function clearReactiveDamageCandidates() {
  pendingReactiveDamageMatches = [];
}

function clearExitReactiveSelfHit() {
  pendingExitReactiveSelfHit = null;
}

function extractExitedCombatant(content) {
  const patterns = [
    /^([^:]+)\s*退出战斗/u,
    /^([^:]+)\s*exits fight/iu,
    /^([^:]+)\s*quitte le combat/iu,
    /^([^:]+)\s*sale del combate/iu,
    /^([^:]+)\s*sai da luta/iu,
  ];

  for (const pattern of patterns) {
    const match = String(content || "").match(pattern);
    if (match && match[1]) {
      return match[1].trim();
    }
  }

  return null;
}

function moveCombatAttribution(dataSet, fromCaster, toCaster, fromSpell, toSpell, amount, element) {
  if (!dataSet[fromCaster]) return false;

  const fromSpellKey = `${fromSpell}|${element || "neutral"}`;
  const spellEntry = dataSet[fromCaster].spells?.[fromSpellKey];
  if (!spellEntry || spellEntry.val < amount) return false;

  spellEntry.val -= amount;
  dataSet[fromCaster].total -= amount;

  if (spellEntry.val <= 0) {
    delete dataSet[fromCaster].spells[fromSpellKey];
  }
  if (dataSet[fromCaster].total <= 0) {
    dataSet[fromCaster].total = 0;
    if (!Object.keys(dataSet[fromCaster].spells || {}).length) {
      delete dataSet[fromCaster];
    }
  }

  updateCombatData(dataSet, toCaster, toSpell, amount, element);
  return true;
}

function tryResolveReactiveDamageFromEnemyHeal(target, amount) {
  if (!target || !amount || !pendingReactiveDamageMatches.length) return null;

  const matchIndex = pendingReactiveDamageMatches.findIndex(
    (entry) =>
      entry &&
      entry.amount === amount &&
      entry.target !== target &&
      entry.caster
  );
  if (matchIndex < 0) return null;

  const [matchedEntry] = pendingReactiveDamageMatches.splice(matchIndex, 1);
  const moved = moveCombatAttribution(
    fightData,
    matchedEntry.caster,
    target,
    matchedEntry.spell,
    "Passive / Indirect",
    matchedEntry.amount,
    matchedEntry.element
  );
  return moved ? matchedEntry : null;
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

  const contentStart = String(line || "").lastIndexOf("] ");
  const content =
    contentStart >= 0 ? String(line || "").slice(contentStart + 2).trim() : String(line || "").trim();
  if (!content) return;
  const exitedCombatant = extractExitedCombatant(content);

  if (pendingExitReactiveSelfHit) {
    if (exitedCombatant) {
      moveCombatAttribution(
        fightData,
        pendingExitReactiveSelfHit.caster,
        exitedCombatant,
        pendingExitReactiveSelfHit.spell,
        "Passive / Indirect",
        pendingExitReactiveSelfHit.amount,
        pendingExitReactiveSelfHit.element
      );
    }
    clearExitReactiveSelfHit();
  }
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
    clearReactiveDamageCandidates();
    clearExitReactiveSelfHit();
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
    clearReactiveDamageCandidates();
    clearExitReactiveSelfHit();
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
    ageReactiveDamageCandidates();
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
          const isPrioritySource =
            d.includes("Potion") || d.includes("Flask") || d.includes("Flasque") || d.includes("Consumable");

          if ((isPrioritySource || isLikelyExplicitEffectSource(d)) && !d.toLowerCase().includes("lost")) {
            spellOverride = d;
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

    const reactiveOwner = extractReactiveOwnerFromSpell(spellOverride);
    if (reactiveOwner) {
      finalCaster = reactiveOwner;
    }

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
      const reactiveMatch =
        !spellOverride && !isPlayerAlly({ name: target }) ? tryResolveReactiveDamageFromEnemyHeal(target, amount) : null;
      if (reactiveMatch) {
        finalCaster = target;
        finalSpell = "Passive / Indirect";
      }
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
      if (!spellOverride && finalCaster === target) {
        pendingExitReactiveSelfHit = {
          caster: finalCaster,
          spell: finalSpell,
          amount,
          element: detectedElement || "Neutral",
        };
      } else {
        clearExitReactiveSelfHit();
      }
      if (!spellOverride && !isPlayerAlly({ name: target })) {
        trackReactiveDamageCandidate({
          caster: finalCaster,
          spell: finalSpell,
          target,
          amount,
          element: detectedElement || "Neutral",
        });
      }
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
  liveCombatStateDirty = true;
  scheduleLiveCombatStateSave();
}

function detectClass(playerName, spellName) {
  const lowerName = playerName.toLowerCase().trim();

  // Skip detection if this entity is known to be a monster
  if (monsterLookup[lowerName]) return;
  if (!isLikelyEnglishPlayerName(playerName)) return;

  if (spellToClassMap[spellName]) {
    const detected = spellToClassMap[spellName];
    if (playerClasses[playerName] !== detected) {
      playerClasses[playerName] = detected;
      // Clear icon cache so it re-renders with the new class icon
      delete playerIconCache[playerName];
    }
  }
}

function saveFightToHistory(options = {}) {
  // 1. Check if there is data
  if (Object.keys(fightData).length === 0 && Object.keys(healData).length === 0) return;

  // 2. NEW: Check if we actually have new changes since last save
  if (!hasUnsavedChanges) return;

  // Create a deep copy of the current state
  const snapshot = {
    damage: cloneSerializableState(fightData),
    healing: cloneSerializableState(healData),
    armor: cloneSerializableState(armorData),
    classes: cloneSerializableState(playerClasses),
    overrides: cloneSerializableState(manualOverrides),
    timestamp: new Date(options.timestampMs || Date.now()).toLocaleTimeString(),
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

function clearCombatRuntimeState() {
  clearScheduledLiveCombatStateSave();

  fightData = {};
  healData = {};
  armorData = {};

  currentCaster = "Unknown";
  currentSpell = "Unknown Spell";
  awaitingNewFight = false;
  hasUnsavedChanges = false;
  fightStartTime = null;
  pendingArmorDamage = null;
  pendingIndirectAttribution = null;
  clearReactiveDamageCandidates();
  clearExitReactiveSelfHit();
  stateSources = {};
  stateOwnershipMeta = {};
  stateEventOrder = 0;
  playerClasses = {};
  summonBindings = {};
  playerIconCache = {};
  playerVariantState = {};
  expandedPlayers.clear();
  if (typeof logLineCache !== "undefined") logLineCache.clear();
  if (typeof combatLineCache !== "undefined") combatLineCache.clear();

  localStorage.removeItem("wakfu_live_combat_state");
  liveCombatStateDirty = false;
}

function performReset(isAuto = false) {
  // 1. Save to history before clearing
  saveFightToHistory();
  clearCombatRuntimeState();

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

function registerClassSpellSource(sourceMap) {
  if (!sourceMap || typeof sourceMap !== "object") return;

  for (const [className, langData] of Object.entries(sourceMap)) {
    if (typeof langData === "object" && !Array.isArray(langData)) {
      for (const spells of Object.values(langData)) {
        if (!Array.isArray(spells)) continue;
        spells.forEach((spell) => {
          const normalizedSpell = String(spell || "").trim();
          if (!normalizedSpell) return;
          spellToClassMap[normalizedSpell] = className;
          allKnownSpells.add(normalizedSpell);
        });
      }
      continue;
    }

    if (Array.isArray(langData)) {
      langData.forEach((spell) => {
        const normalizedSpell = String(spell || "").trim();
        if (!normalizedSpell) return;
        spellToClassMap[normalizedSpell] = className;
        allKnownSpells.add(normalizedSpell);
      });
    }
  }
}

function generateSpellMap() {
  if (typeof classSpells === "undefined") return;
  spellToClassMap = {};
  allKnownSpells = new Set(); // Ensure this is initialized

  registerClassSpellSource(classSpells);
  if (typeof classSpellsZh !== "undefined") {
    registerClassSpellSource(classSpellsZh);
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
  spellToClassMap["二十一点"] = "ecaflip";
  allKnownSpells.add("二十一点");
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

function containsCjkCharacters(value) {
  return /[\u3400-\u9fff\uf900-\ufaff]/u.test(String(value || ""));
}

function isLikelyEnglishPlayerName(value) {
  const name = String(value || "").trim();
  if (!name) return false;
  if (containsCjkCharacters(name)) return false;
  return /^[A-Za-z][A-Za-z '\-]*$/.test(name);
}

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
  return Object.keys(playerClasses).find(
    (name) => playerClasses[name] === targetClass && isLikelyEnglishPlayerName(name)
  );
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
  if (!isLikelyEnglishPlayerName(name)) return false;

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
let chatPermissionStrikeCount = 0;

const LOOT_KEYWORDS = ["picked up", "ramassé", "obtenu", "recogido", "obtenido", "apanhou", "obteve", "你得到了", "你失去了", "配方完成", "回收"];
const GAME_SERVER_PROXY_PATTERN = /Connexion au proxy :wakfu-([a-z0-9-]+)\.ankama-games\.com:5556/i;

function parseWakfuLogTimestamp(line) {
  const match = String(line || "").match(/\b(\d{2}):(\d{2}):(\d{2}),(\d{3})\b/);
  if (!match) return Date.now();

  const now = new Date();
  const parsed = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    Number(match[1]),
    Number(match[2]),
    Number(match[3]),
    Number(match[4])
  );

  // Wakfu log lines only carry the time-of-day. If the parsed time lands
  // obviously in the future, treat it as a line from the previous day.
  if (parsed.getTime() - now.getTime() > 5 * 60 * 1000) {
    parsed.setDate(parsed.getDate() - 1);
  }

  return parsed.getTime();
}

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
  window.lastReadTime = now;

  try {
    if (!fileHandle) return;

    const file = await fileHandle.getFile();

    // Success: Reset error counter
    permissionStrikeCount = 0;

    if (file.size < fileOffset) {
      // The log file was truncated, replaced, or recreated while we were
      // tracking it. Reset the offset so the new tail can be consumed again.
      console.warn(
        `[Nexus] Log file size shrank from ${fileOffset} to ${file.size}. Resetting read offset.`
      );
      fileOffset = 0;
      if (typeof logLineCache !== "undefined") logLineCache.clear();
      if (typeof combatLineCache !== "undefined") combatLineCache.clear();
    }

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

    window.lastReadTime = Date.now();
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

async function parseChatFile() {
  const now = Date.now();
  if (isReadingChat) {
    if (window.lastChatReadTime && now - window.lastChatReadTime > 2000) {
      console.warn("[Nexus] Chat reader was stuck. Forcing unlock.");
      isReadingChat = false;
    } else {
      return;
    }
  }

  isReadingChat = true;
  window.lastChatReadTime = now;

  try {
    if (!chatFileHandle) return;

    const file = await chatFileHandle.getFile();
    chatPermissionStrikeCount = 0;

    if (file.size < chatFileOffset) {
      console.warn(
        `[Nexus] Chat log size shrank from ${chatFileOffset} to ${file.size}. Resetting read offset.`
      );
      chatFileOffset = 0;
      if (typeof chatLineCache !== "undefined") chatLineCache.clear();
    }

    if (file.size > chatFileOffset) {
      const blob = file.slice(chatFileOffset, file.size);
      const text = await blob.text();
      const lines = text.split(/\r?\n/);

      for (let index = 0; index < lines.length; index += 1) {
        const cleanLine = (" " + lines[index]).slice(1);
        if (!cleanLine || chatLineCache.has(cleanLine)) continue;
        chatLineCache.add(cleanLine);
        if (chatLineCache.size > MAX_CACHE_SIZE) {
          const firstItem = chatLineCache.values().next().value;
          chatLineCache.delete(firstItem);
        }
        processChatLog(cleanLine);
      }

      lines.length = 0;
      chatFileOffset = file.size;
    }

    window.lastChatReadTime = Date.now();
  } catch (err) {
    if (err.name === "NotReadableError") {
      console.warn("[Nexus] Chat file locked by game (busy). Retrying next tick...");
    } else if (err.name === "NotFoundError" || err.message.includes("permission")) {
      chatPermissionStrikeCount += 1;
      console.error(`[Nexus] Chat read error (${chatPermissionStrikeCount}/10):`, err);

      if (chatPermissionStrikeCount >= 10) {
        console.error("[Nexus] Persistent chat file error. Stopping reader.");
        if (typeof parseIntervalId !== "undefined") clearInterval(parseIntervalId);
        document.getElementById("setup-panel").style.display = "block";
        document.getElementById("drop-zone").style.display = "none";
        document.getElementById("reconnect-container").style.display = "block";
      }
    } else {
      console.error("[Nexus] Unexpected chat error:", err);
    }
  } finally {
    isReadingChat = false;
  }
}

async function parseTrackedFiles() {
  await Promise.allSettled([parseFile(), parseChatFile()]);
}

function processAreaChallengeLine(line) {
  const match = String(line || "").match(/Challenge courant : (-?\d+) \(dans \d+s\)/);
  if (!match) return;

  const challengeId = match[1];
  if (challengeId === "-1") return;

  const challengeName =
    typeof getAreaChallengeChineseName === "function"
      ? getAreaChallengeChineseName(challengeId)
      : "";

  if (!challengeName) return;

  if (typeof registerTribeChallengeDetection === "function") {
    registerTribeChallengeDetection({
      challengeId,
      challengeName,
      detectedAt: parseWakfuLogTimestamp(line),
    });
  }
}

function processAreaChallengeResolutionLine(line) {
  const match = String(line || "").match(/"合作[:：]\s*([^"]+)"任务(?:获胜|完成)[。.]?/);
  if (!match) return;

  if (typeof resolveBroadcastTribe === "function") {
    resolveBroadcastTribe({
      challengeName: match[1],
      resolvedAt: parseWakfuLogTimestamp(line),
    });
  }
}

function processGameServerLine(line) {
  const match = String(line || "").match(GAME_SERVER_PROXY_PATTERN);
  if (!match) return;

  if (typeof window.setBroadcastServerKey === "function") {
    window.setBroadcastServerKey(match[1], { source: "auto" });
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

  processGameServerLine(line);
  processAreaChallengeLine(line);
  processAreaChallengeResolutionLine(line);

  if (battleJustFinished) {
    clearReactiveDamageCandidates();
    clearExitReactiveSelfHit();
    saveFightToHistory({ timestampMs: parseWakfuLogTimestamp(line) });
    awaitingNewFight = true;
    liveCombatStateDirty = true;
    scheduleLiveCombatStateSave(true);
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

  } catch (err) {
    console.error("Parsing Error:", err);
  }
}

function processCombatReplayLine(line, options = {}) {
  if (!line || line.trim() === "") return;

  const lineLower = line.toLowerCase();
  const battleJustFinished =
    isCombatChannelLine(line, lineLower) && isBattleEndContent(line);

  if (battleJustFinished) {
    clearReactiveDamageCandidates();
    clearExitReactiveSelfHit();

    if (options.skipHistorySave) {
      clearCombatRuntimeState();
    } else {
      saveFightToHistory({ timestampMs: options.timestampMs || Date.now() });
      clearCombatRuntimeState();
    }
    updateWatchdogUI();
    return;
  }

  processFightLog(line);
}

async function bootstrapCombatHistoryFromFile(file) {
  if (!file || typeof file.slice !== "function") return;

  let bytesToRead = Math.min(
    Number(file.size || 0),
    COMBAT_BOOTSTRAP_INITIAL_WINDOW_BYTES
  );
  let replayLines = [];
  let anchorIndex = -1;
  let reachedFileStart = false;

  while (bytesToRead > 0) {
    const sliceStart = Math.max(0, file.size - bytesToRead);
    reachedFileStart = sliceStart === 0;

    const text = await file.slice(sliceStart, file.size).text();
    const lines = text.split(/\r?\n/);

    const endIndexes = [];
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      if (!line || !line.trim()) continue;
      const lower = line.toLowerCase();
      if (!isCombatChannelLine(line, lower)) continue;
      if (isBattleEndContent(line)) {
        endIndexes.push(index);
      }
    }

    if (endIndexes.length >= COMBAT_BOOTSTRAP_END_ANCHOR_COUNT) {
      anchorIndex = endIndexes[endIndexes.length - COMBAT_BOOTSTRAP_END_ANCHOR_COUNT] + 1;
      replayLines = lines;
      break;
    }

    if (reachedFileStart || bytesToRead >= COMBAT_BOOTSTRAP_MAX_WINDOW_BYTES) {
      anchorIndex = -1;
      replayLines = lines;
      break;
    }

    bytesToRead = Math.min(
      file.size,
      COMBAT_BOOTSTRAP_MAX_WINDOW_BYTES,
      bytesToRead * 2
    );
  }

  clearCombatRuntimeState();
  fightHistory = [];
  currentViewIndex = "live";
  localStorage.removeItem("wakfu_fight_history");
  updateHistoryButtons();

  if (!replayLines.length) {
    renderMeter();
    updateWatchdogUI();
    return;
  }

  const startIndex = anchorIndex >= 0 ? anchorIndex : 0;
  let skipLeadingPartialFight = !reachedFileStart && anchorIndex < 0;

  for (let index = startIndex; index < replayLines.length; index += 1) {
    const line = replayLines[index];
    if (!line || !line.trim()) continue;
    const lower = line.toLowerCase();
    if (!isCombatChannelLine(line, lower)) continue;
    processCombatReplayLine(line, {
      skipHistorySave: skipLeadingPartialFight,
      timestampMs: parseWakfuLogTimestamp(line),
    });

    if (skipLeadingPartialFight && isBattleEndContent(line)) {
      skipLeadingPartialFight = false;
    }
  }

  if (fightHistory.length > MAX_FIGHT_HISTORY) {
    fightHistory = fightHistory.slice(0, MAX_FIGHT_HISTORY);
  }

  try {
    localStorage.setItem("wakfu_fight_history", JSON.stringify(fightHistory));
  } catch (error) {
    console.error("Failed to persist bootstrapped fight history:", error);
  }

  if (Object.keys(fightData).length > 0 || Object.keys(healData).length > 0) {
    liveCombatStateDirty = true;
    scheduleLiveCombatStateSave(true);
  }

  renderMeter();
  updateHistoryButtons();
  updateWatchdogUI();
}

function saveLiveCombatState() {
  if (Object.keys(fightData).length === 0 && Object.keys(healData).length === 0) {
    localStorage.removeItem("wakfu_live_combat_state");
    liveCombatStateDirty = false;
    return;
  }

  const state = {
    fightData: cloneSerializableState(fightData),
    healData: cloneSerializableState(healData),
    armorData: cloneSerializableState(armorData),
    playerClasses: cloneSerializableState(playerClasses),
    manualOverrides: cloneSerializableState(manualOverrides),
    summonBindings: cloneSerializableState(summonBindings),
    fightStartTime,
    awaitingNewFight,
  };
  localStorage.setItem("wakfu_live_combat_state", JSON.stringify(state));
  liveCombatStateDirty = false;
  lastLiveCombatSaveAt = Date.now();
}

function clearScheduledLiveCombatStateSave() {
  if (liveCombatSaveTimerId) {
    clearTimeout(liveCombatSaveTimerId);
    liveCombatSaveTimerId = null;
  }
}

function flushLiveCombatStateSave() {
  clearScheduledLiveCombatStateSave();
  saveLiveCombatState();
}

function scheduleLiveCombatStateSave(force = false) {
  if (!liveCombatStateDirty && !force) return;

  const now = Date.now();
  const elapsed = now - lastLiveCombatSaveAt;

  if (force || elapsed >= liveCombatSaveDelayMs) {
    flushLiveCombatStateSave();
    return;
  }

  if (liveCombatSaveTimerId) return;

  liveCombatSaveTimerId = setTimeout(() => {
    liveCombatSaveTimerId = null;
    flushLiveCombatStateSave();
  }, liveCombatSaveDelayMs - elapsed);
}

function cloneSerializableState(value) {
  if (typeof structuredClone === "function") {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value));
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
  flushLiveCombatStateSave();
});

window.addEventListener("pagehide", () => {
  flushLiveCombatStateSave();
});

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") {
    flushLiveCombatStateSave();
  }
});

// Export for main.js
window.loadLiveCombatState = loadLiveCombatState;
window.parseTrackedFiles = parseTrackedFiles;
window.bootstrapCombatHistoryFromFile = bootstrapCombatHistoryFromFile;
