document.addEventListener("DOMContentLoaded", () => {
  initProfessionSelector();
});

let calculatedRecipeCards = [];

const PROFESSION_UI_LABELS = {
  Armorer: "制甲",
  Baker: "面点",
  Chef: "厨师",
  Handyman: "工匠",
  Jeweler: "珠宝",
  "Leather Dealer": "皮匠",
  Tailor: "裁缝",
  "Weapons Master": "武器大师",
  Farmer: "种植",
  Fisherman: "钓鱼",
  Herbalist: "草药",
  Lumberjack: "伐木",
  Miner: "采矿",
  Trapper: "畜牧",
  Profession: "专业",
};

function getProfessionUILabel(name) {
  return PROFESSION_UI_LABELS[name] || name;
}

function initProfessionSelector() {
  if (typeof PROFESSIONS_DATA === "undefined") return;

  const select = document.getElementById("profession-select");
  if (!select) return;

  const sortedProfs = Object.keys(PROFESSIONS_DATA).sort();
  sortedProfs.forEach((prof) => {
    const opt = document.createElement("option");
    opt.value = prof;
    opt.textContent = getProfessionUILabel(prof);
    select.appendChild(opt);
  });
}

function onProfessionChange() {
  updateBaseExp();
  updateProfessionIcon();
}

function updateBaseExp() {
  const profName = document.getElementById("profession-select").value;
  const baseExpInput = document.getElementById("prof-base-exp");

  if (profName && PROFESSIONS_DATA[profName]) {
    baseExpInput.value = PROFESSIONS_DATA[profName].defaultExp;
  }
}

function updateProfessionIcon() {
  const profName = document.getElementById("profession-select").value;
  const img = document.getElementById("prof-logo-img");

  if (!profName) {
    img.style.display = "none";
    return;
  }
  const fileName = profName.toLowerCase().replace(/\s+/g, "_") + ".png";
  img.src = `./assets/img/jobs/${fileName}`;
  img.style.display = "block";
  img.onerror = function () {
    this.style.display = "none";
  };
}

function getResourceIconPath(itemName) {
  // 1. Prioritize imgId lookups (Most accurate for complex items)
  if (typeof monsterResources !== "undefined") {
    const dropItem = monsterResources.find((i) => i.name === itemName);
    if (dropItem && dropItem.imgId) {
      return `./assets/img/items/${dropItem.imgId}.png`;
    }
  }

  // 2. Fallback to Name-based lookup
  // Useful for standard harvesting professions if they aren't in monsterResources
  return `./assets/img/resources/${itemName.replace(/\s+/g, "_")}.png`;
}

function calculateProfessionResources() {
  const profSelect = document.getElementById("profession-select");
  const currentInput = document.getElementById("prof-current-lvl");
  const targetInput = document.getElementById("prof-target-lvl");
  const baseExpInput = document.getElementById("prof-base-exp");
  const resultContainer = document.getElementById("profession-results-list");

  const profName = profSelect.value;
  let startLvl = parseInt(currentInput.value);
  let targetLvl = parseInt(targetInput.value);
  let userBaseExp = parseInt(baseExpInput.value);

  // Reset UI and State
  resultContainer.innerHTML = "";
  calculatedRecipeCards = [];

  if (!profName || isNaN(startLvl) || isNaN(targetLvl) || isNaN(userBaseExp)) {
    resultContainer.innerHTML = '<div class="empty-state">输入无效。</div>';
    return;
  }
  if (startLvl >= targetLvl) {
    resultContainer.innerHTML =
      '<div class="empty-state">目标等级必须高于起始等级。</div>';
    return;
  }

  const data = PROFESSIONS_DATA[profName];
  if (!data) {
    resultContainer.innerHTML = '<div class="empty-state">缺少该专业数据。</div>';
    return;
  }

  const multiplier = data.xpMultiplier || 1;
  const effectiveXpPerBatch = userBaseExp * multiplier;

  let totalAllCrafts = 0;
  let lvlCursor = startLvl;

  while (lvlCursor < targetLvl) {
    let range = data.ranges.find(
      (r) => lvlCursor >= r.min && lvlCursor < r.max
    );
    if (!range) break;

    let endForThisStep = Math.min(range.max, targetLvl);
    let totalCraftsForFullRange = Math.ceil(range.xpReq / effectiveXpPerBatch);
    let levelsInChunk = endForThisStep - lvlCursor;
    let rangeSpan = range.max - range.min;
    let craftsToDo = Math.ceil(
      totalCraftsForFullRange * (levelsInChunk / rangeSpan)
    );

    totalAllCrafts += craftsToDo;

    // --- Recipe Handling (Default or Multiple) ---
    let recipeOptions = [];

    if (range.recipes && range.recipes.length > 0) {
      recipeOptions = range.recipes;
    } else if (range.ingredients) {
      recipeOptions = [range.ingredients];
    }

    const stepId = `prof-card-${range.min}`;

    calculatedRecipeCards.push({
      id: stepId,
      recipeName: range.recipeName,
      levelLabel: `Lv. ${range.min} - ${endForThisStep}`,
      craftsCount: craftsToDo,
      recipeOptions: recipeOptions,
      selectedOptionIndex: 0,
    });

    lvlCursor = endForThisStep;
  }

  if (calculatedRecipeCards.length === 0) {
    resultContainer.innerHTML =
      '<div class="empty-state">等级超出可计算范围。</div>';
    return;
  }

  // REMOVED SUMMARY HEADER CODE HERE

  // Render Cards
  calculatedRecipeCards.forEach((cardData) => {
    const cardHTML = generateCardHTML(cardData);
    const wrapper = document.createElement("div");
    wrapper.id = cardData.id;
    wrapper.innerHTML = cardHTML;
    resultContainer.appendChild(wrapper);
  });
}

function generateCardHTML(cardData) {
  const ingredients = cardData.recipeOptions[cardData.selectedOptionIndex];
  const iconPath = getResourceIconPath(cardData.recipeName);

  // Check if we need switch button (more than 1 option available)
  const showSwitch = cardData.recipeOptions.length > 1;

  let ingredientsHTML = "";

  ingredients.forEach((ing) => {
    const totalQty = Math.ceil(ing.qty * cardData.craftsCount);
    const ingIcon = getResourceIconPath(ing.name);
    const safeName = ing.name.replace(/'/g, "\\'");

    /* FIX: Added this.onerror=null to img tag */
    ingredientsHTML += `
            <div class="ing-row">
                <div class="ing-left">
                     <img src="${ingIcon}" class="ing-icon" onerror="this.onerror=null; this.src='./assets/img/resources/not_found.png';">
                     <span>${ing.name} <span class="ing-multiplier">x${
      ing.qty
    }</span></span>
                </div>
                <div class="ing-right">
                     <span class="ing-total">${totalQty.toLocaleString()}</span>
                     <button class="prof-add-btn" onclick="addTrackedItemFromProfession('${safeName}', ${totalQty})">+</button>
                </div>
            </div>
         `;
  });

  let switchBtnHTML = "";
  if (showSwitch) {
    switchBtnHTML = `<button class="switch-recipe-btn" title="切换配方" onclick="switchCardRecipe('${cardData.id}')">🔄</button>`;
  }

  /* FIX: Added this.onerror=null to recipe header img */
  return `
        <div class="prof-recipe-card">
            <div class="recipe-card-header">
                <img src="${iconPath}" class="recipe-card-icon" onerror="this.onerror=null; this.src='./assets/img/resources/not_found.png';">
                <div class="recipe-card-meta">
                    <div class="recipe-name">${cardData.recipeName}</div>
                    <div class="recipe-details">${cardData.levelLabel} · ${cardData.craftsCount} 次制作</div>
                </div>
                ${switchBtnHTML}
            </div>
            <div class="recipe-card-ingredients">
                ${ingredientsHTML}
            </div>
        </div>
    `;
}

function switchCardRecipe(cardId) {
  // Find object in state
  const cardData = calculatedRecipeCards.find((c) => c.id === cardId);
  if (!cardData) return;

  // Cycle index
  cardData.selectedOptionIndex++;
  if (cardData.selectedOptionIndex >= cardData.recipeOptions.length) {
    cardData.selectedOptionIndex = 0;
  }

  // Re-render HTML for this wrapper only
  const wrapper = document.getElementById(cardId);
  if (wrapper) {
    wrapper.innerHTML = generateCardHTML(cardData);
  }
}

// Reuse Tracker Logic
function addTrackedItemFromProfession(itemName, qtyNeeded) {
  if (
    typeof trackedItems === "undefined" ||
    typeof renderTracker !== "function"
  ) {
    alert("追踪器当前不可用。");
    return;
  }

  let existingItem = trackedItems.find((t) => t.name === itemName);

  if (existingItem) {
    existingItem.target += qtyNeeded;
    // UPDATED: Use 'custom' type and pass full message
    showTrackerNotification(
      null,
      `已为 ${itemName} 增加 +${qtyNeeded} 追踪目标`,
      "custom"
    );

    if (typeof saveTrackerState === "function") saveTrackerState();
    renderTracker();
  } else {
    // Create Details
    let foundDetails = null;
    let job = "Profession";
    let imgId = null;

    // 1. Search gathering professions
    if (typeof professionItems !== "undefined") {
      for (const p in professionItems) {
        const f = professionItems[p].find((i) => i.name === itemName);
        if (f) {
          foundDetails = f;
          job = p;
          break;
        }
      }
    }

    // 2. Search General Database (Items with ID)
    if (typeof monsterResources !== "undefined") {
      const f = monsterResources.find((i) => i.name === itemName);
      if (f) {
        foundDetails = f;
        job = "ALL";
        imgId = f.imgId;
      }
    }

    trackedItems.push({
      id: Date.now() + Math.floor(Math.random() * 10000),
      name: itemName,
      displayName:
        typeof getTrackerDisplayName === "function"
          ? getTrackerDisplayName(itemName)
          : itemName,
      chineseAliases:
        typeof getTrackerChineseAliases === "function"
          ? getTrackerChineseAliases(itemName)
          : [],
      current: 0,
      target: qtyNeeded,
      level: foundDetails ? foundDetails.level : 0,
      rarity: foundDetails ? foundDetails.rarity : "Common",
      profession: job,
      imgId: imgId || (foundDetails ? foundDetails.imgId : null),
    });

    // UPDATED: Use 'custom' type and pass full message
    showTrackerNotification(
      null,
      `开始追踪 ${qtyNeeded}x ${itemName}`,
      "custom"
    );

    if (typeof saveTrackerState === "function") saveTrackerState();
    renderTracker();
  }
}
