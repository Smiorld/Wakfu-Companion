// ==========================================
// WAKFU PROFESSIONS DATABASE
// ==========================================

const PROFESSIONS_DATA = {
  Jeweler: {
    defaultExp: 600,
    xpMultiplier: 1,
    ranges: [
      {
        min: 0,
        max: 10,
        xpReq: 7500,
        recipeName: "Coarse Gem",
        ingredients: [
          { name: "Iron Ore", qty: 5 },
          { name: "Finest Sea Salt", qty: 5 },
        ],
      },
      {
        min: 10,
        max: 20,
        xpReq: 22500,
        recipeName: "Basic Gem",
        ingredients: [
          { name: "Classic Carbon", qty: 5 },
          { name: "Copper Ore", qty: 5 },
        ],
      },
      {
        min: 20,
        max: 30,
        xpReq: 37500,
        recipeName: "Imperfect Gem",
        ingredients: [
          { name: "Shadowy Cobalt", qty: 5 },
          { name: "Bronze Nugget", qty: 5 },
        ],
      },
      {
        min: 30,
        max: 40,
        xpReq: 52500,
        recipeName: "Fragile Gem",
        ingredients: [
          { name: "Rugged Quartz", qty: 5 },
          { name: "Shard of Flint", qty: 5 },
        ],
      },
      {
        min: 40,
        max: 50,
        xpReq: 67500,
        recipeName: "Rustic Gem",
        ingredients: [
          { name: "Grievous Kroomium", qty: 5 },
          { name: "Wholesome Zinc", qty: 5 },
        ],
      },
      {
        min: 50,
        max: 60,
        xpReq: 82500,
        recipeName: "Raw Gem",
        ingredients: [
          { name: "Royal Bauxite", qty: 5 },
          { name: "Blood Red Amethyst", qty: 5 },
        ],
      },
      {
        min: 60,
        max: 70,
        xpReq: 97500,
        recipeName: "Solid Gem",
        ingredients: [
          { name: "Koral", qty: 5 },
          { name: "Taroudium Ore", qty: 5 },
        ],
      },
      {
        min: 70,
        max: 80,
        xpReq: 112500,
        recipeName: "Durable Gem",
        ingredients: [
          { name: "Hazy Lead Ore", qty: 5 },
          { name: "Sandy Ore", qty: 5 },
        ],
      },
      {
        min: 80,
        max: 90,
        xpReq: 127500,
        recipeName: "Refined Gem",
        ingredients: [
          { name: "Black Gold", qty: 5 },
          { name: "Mythwil Ore", qty: 5 },
        ],
      },
      {
        min: 90,
        max: 100,
        xpReq: 142500,
        recipeName: "Precious Gem",
        ingredients: [
          { name: "Double Carat Sapphire Stone", qty: 5 },
          { name: "Sovereign Titanium", qty: 5 },
        ],
      },
      {
        min: 100,
        max: 110,
        xpReq: 157500,
        recipeName: "Exquisite Gem",
        ingredients: [
          { name: "Sryanide Ore", qty: 5 },
          { name: "Dark Carbon", qty: 5 },
        ],
      },
      {
        min: 110,
        max: 120,
        xpReq: 172500,
        recipeName: "Mystical Gem",
        ingredients: [
          { name: "Amber", qty: 5 },
          { name: "Mercury", qty: 5 },
        ],
      },
      {
        min: 120,
        max: 130,
        xpReq: 187500,
        recipeName: "Eternal Gem",
        ingredients: [
          { name: "Silver Ore", qty: 5 },
          { name: "Obsidian Ore", qty: 5 },
        ],
      },
      {
        min: 130,
        max: 140,
        xpReq: 202500,
        recipeName: "Divine Gem",
        ingredients: [
          { name: "Zircon", qty: 5 },
          { name: "Frozen Garnet", qty: 5 },
        ],
      },
      {
        min: 140,
        max: 150,
        xpReq: 217500,
        recipeName: "Infernal Gem",
        ingredients: [
          { name: "Void Stone", qty: 5 },
          { name: "Symbiotic Stone", qty: 5 },
        ],
      },
      {
        min: 150,
        max: 160,
        xpReq: 232500,
        recipeName: "Ancestral Gem",
        ingredients: [
          { name: "Zircomet", qty: 5 },
          { name: "Fragmonnite", qty: 5 },
        ],
      },
    ],
  },
  Armorer: {
    defaultExp: 600,
    xpMultiplier: 1,
    ranges: [
      {
        min: 0,
        max: 10,
        xpReq: 7500,
        recipeName: "Coarse Plate",
        ingredients: [
          { name: "Iron Ore", qty: 5 },
          { name: "Finest Sea Salt", qty: 5 },
        ],
      },
      {
        min: 10,
        max: 20,
        xpReq: 22500,
        recipeName: "Basic Plate",
        ingredients: [
          { name: "Classic Carbon", qty: 5 },
          { name: "Copper Ore", qty: 5 },
        ],
      },
      {
        min: 20,
        max: 30,
        xpReq: 37500,
        recipeName: "Imperfect Plate",
        ingredients: [
          { name: "Shadowy Cobalt", qty: 5 },
          { name: "Bronze Nugget", qty: 5 },
        ],
      },
      {
        min: 30,
        max: 40,
        xpReq: 52500,
        recipeName: "Fragile Plate",
        ingredients: [
          { name: "Rugged Quartz", qty: 5 },
          { name: "Shard of Flint", qty: 5 },
        ],
      },
      {
        min: 40,
        max: 50,
        xpReq: 67500,
        recipeName: "Rustic Plate",
        ingredients: [
          { name: "Grievous Kroomium", qty: 5 },
          { name: "Wholesome Zinc", qty: 5 },
        ],
      },
      {
        min: 50,
        max: 60,
        xpReq: 82500,
        recipeName: "Raw Plate",
        ingredients: [
          { name: "Royal Bauxite", qty: 5 },
          { name: "Blood Red Amethyst", qty: 5 },
        ],
      },
      {
        min: 60,
        max: 70,
        xpReq: 97500,
        recipeName: "Solid Plate",
        ingredients: [
          { name: "Koral", qty: 5 },
          { name: "Taroudium Ore", qty: 5 },
        ],
      },
      {
        min: 70,
        max: 80,
        xpReq: 112500,
        recipeName: "Durable Plate",
        ingredients: [
          { name: "Hazy Lead Ore", qty: 5 },
          { name: "Sandy Ore", qty: 5 },
        ],
      },
      {
        min: 80,
        max: 90,
        xpReq: 127500,
        recipeName: "Refined Plate",
        ingredients: [
          { name: "Black Gold", qty: 5 },
          { name: "Mythwil Ore", qty: 5 },
        ],
      },
      {
        min: 90,
        max: 100,
        xpReq: 142500,
        recipeName: "Precious Plate",
        ingredients: [
          { name: "Double Carat Sapphire Stone", qty: 5 },
          { name: "Sovereign Titanium", qty: 5 },
        ],
      },
      {
        min: 100,
        max: 110,
        xpReq: 157500,
        recipeName: "Exquisite Plate",
        ingredients: [
          { name: "Sryanide Ore", qty: 5 },
          { name: "Dark Carbon", qty: 5 },
        ],
      },
      {
        min: 110,
        max: 120,
        xpReq: 172500,
        recipeName: "Mystical Plate",
        ingredients: [
          { name: "Amber", qty: 5 },
          { name: "Mercury", qty: 5 },
        ],
      },
      {
        min: 120,
        max: 130,
        xpReq: 187500,
        recipeName: "Eternal Plate",
        ingredients: [
          { name: "Silver Ore", qty: 5 },
          { name: "Obsidian Ore", qty: 5 },
        ],
      },
      {
        min: 130,
        max: 140,
        xpReq: 202500,
        recipeName: "Divine Plate",
        ingredients: [
          { name: "Zircon", qty: 5 },
          { name: "Frozen Garnet", qty: 5 },
        ],
      },
      {
        min: 140,
        max: 150,
        xpReq: 217500,
        recipeName: "Infernal Plate",
        ingredients: [
          { name: "Void Stone", qty: 5 },
          { name: "Symbiotic Stone", qty: 5 },
        ],
      },
      {
        min: 150,
        max: 160,
        xpReq: 232500,
        recipeName: "Ancestral Plate",
        ingredients: [
          { name: "Zircomet", qty: 5 },
          { name: "Fragmonnite", qty: 5 },
        ],
      },
    ],
  },
  "Weapon Master": {
    defaultExp: 600,
    xpMultiplier: 1,
    ranges: [
      {
        min: 0,
        max: 10,
        xpReq: 7500,
        recipeName: "Coarse Handle",
        ingredients: [
          { name: "Hazel Wood", qty: 5 },
          { name: "Ash Wood", qty: 5 },
        ],
      },
      {
        min: 10,
        max: 20,
        xpReq: 22500,
        recipeName: "Basic Handle",
        ingredients: [
          { name: "Chestnut Wood", qty: 5 },
          { name: "Apiwood", qty: 5 },
        ],
      },
      {
        min: 20,
        max: 30,
        xpReq: 37500,
        recipeName: "Imperfect Handle",
        ingredients: [
          { name: "Birch Wood", qty: 5 },
          { name: "Boabob Wood", qty: 5 },
        ],
      },
      {
        min: 30,
        max: 40,
        xpReq: 52500,
        recipeName: "Fragile Handle",
        ingredients: [
          { name: "Citronana Wood", qty: 5 },
          { name: "Weeping Willow Wood", qty: 5 },
        ],
      },
      {
        min: 40,
        max: 50,
        xpReq: 67500,
        recipeName: "Rustic Handle",
        ingredients: [
          { name: "Baby Redwood Wood", qty: 5 },
          { name: "Pooplar Wood", qty: 5 },
        ],
      },
      {
        min: 50,
        max: 60,
        xpReq: 82500,
        recipeName: "Raw Handle",
        ingredients: [
          { name: "Hornbeam Wood", qty: 5 },
          { name: "Tadbole Wood", qty: 5 },
        ],
      },
      {
        min: 60,
        max: 70,
        xpReq: 97500,
        recipeName: "Solid Handle",
        ingredients: [
          { name: "Frozen Wood", qty: 5 },
          { name: "Climbing Tree", qty: 5 },
        ],
      },
      {
        min: 70,
        max: 80,
        xpReq: 112500,
        recipeName: "Durable Handle",
        ingredients: [
          { name: "Yew Wood", qty: 5 },
          { name: "Prickly Wood", qty: 5 },
        ],
      },
      {
        min: 80,
        max: 90,
        xpReq: 127500,
        recipeName: "Refined Handle",
        ingredients: [
          { name: "Mosscandel Wood", qty: 5 },
          { name: "Marmalot Wood", qty: 5 },
        ],
      },
      {
        min: 90,
        max: 100,
        xpReq: 142500,
        recipeName: "Precious Handle",
        ingredients: [
          { name: "Sylvan Wood", qty: 5 },
          { name: "Elderberry Wood", qty: 5 },
        ],
      },
      {
        min: 100,
        max: 110,
        xpReq: 157500,
        recipeName: "Exquisite Handle",
        ingredients: [
          { name: "Cherry Tree Wood", qty: 5 },
          { name: "Dry Wood", qty: 5 },
        ],
      },
      {
        min: 110,
        max: 120,
        xpReq: 172500,
        recipeName: "Mystical Handle",
        ingredients: [
          { name: "Kokonut Wood", qty: 5 },
          { name: "Divi Divi Wood", qty: 5 },
        ],
      },
      {
        min: 120,
        max: 130,
        xpReq: 187500,
        recipeName: "Eternal Handle",
        ingredients: [
          { name: "Bramble Wood", qty: 5 },
          { name: "Mahogany Wood", qty: 5 },
        ],
      },
      {
        min: 130,
        max: 140,
        xpReq: 202500,
        recipeName: "Divine Handle",
        ingredients: [
          { name: "Carya Wood", qty: 5 },
          { name: "Twisted Seaweed Wood", qty: 5 },
        ],
      },
      {
        min: 140,
        max: 150,
        xpReq: 217500,
        recipeName: "Infernal Handle",
        ingredients: [
          { name: "Despair Tree Wood", qty: 5 },
          { name: "Nonbeeching Wood", qty: 5 },
        ],
      },
      {
        min: 150,
        max: 160,
        xpReq: 232500,
        recipeName: "Ancestral Handle",
        ingredients: [
          { name: "Astracacia", qty: 5 },
          { name: "Luzyl", qty: 5 },
        ],
      },
    ],
  },
  Handyman: {
    defaultExp: 600,
    xpMultiplier: 1,
    ranges: [
      {
        min: 0,
        max: 10,
        xpReq: 7500,
        recipeName: "Coarse Bracket",
        ingredients: [
          { name: "Hazel Wood", qty: 5 },
          { name: "Ash Wood", qty: 5 },
        ],
      },
      {
        min: 10,
        max: 20,
        xpReq: 22500,
        recipeName: "Basic Bracket",
        ingredients: [
          { name: "Chestnut Wood", qty: 5 },
          { name: "Apiwood", qty: 5 },
        ],
      },
      {
        min: 20,
        max: 30,
        xpReq: 37500,
        recipeName: "Imperfect Bracket",
        ingredients: [
          { name: "Birch Wood", qty: 5 },
          { name: "Boabob Wood", qty: 5 },
        ],
      },
      {
        min: 30,
        max: 40,
        xpReq: 52500,
        recipeName: "Fragile Bracket",
        ingredients: [
          { name: "Citronana Wood", qty: 5 },
          { name: "Weeping Willow Wood", qty: 5 },
        ],
      },
      {
        min: 40,
        max: 50,
        xpReq: 67500,
        recipeName: "Rustic Bracket",
        ingredients: [
          { name: "Baby Redwood Wood", qty: 5 },
          { name: "Pooplar Wood", qty: 5 },
        ],
      },
      {
        min: 50,
        max: 60,
        xpReq: 82500,
        recipeName: "Raw Bracket",
        ingredients: [
          { name: "Hornbeam Wood", qty: 5 },
          { name: "Tadbole Wood", qty: 5 },
        ],
      },
      {
        min: 60,
        max: 70,
        xpReq: 97500,
        recipeName: "Solid Bracket",
        ingredients: [
          { name: "Frozen Wood", qty: 5 },
          { name: "Climbing Tree", qty: 5 },
        ],
      },
      {
        min: 70,
        max: 80,
        xpReq: 112500,
        recipeName: "Durable Bracket",
        ingredients: [
          { name: "Yew Wood", qty: 5 },
          { name: "Prickly Wood", qty: 5 },
        ],
      },
      {
        min: 80,
        max: 90,
        xpReq: 127500,
        recipeName: "Refined Bracket",
        ingredients: [
          { name: "Mosscandel Wood", qty: 5 },
          { name: "Marmalot Wood", qty: 5 },
        ],
      },
      {
        min: 90,
        max: 100,
        xpReq: 142500,
        recipeName: "Precious Bracket",
        ingredients: [
          { name: "Sylvan Wood", qty: 5 },
          { name: "Elderberry Wood", qty: 5 },
        ],
      },
      {
        min: 100,
        max: 110,
        xpReq: 157500,
        recipeName: "Exquisite Bracket",
        ingredients: [
          { name: "Cherry Tree Wood", qty: 5 },
          { name: "Dry Wood", qty: 5 },
        ],
      },
      {
        min: 110,
        max: 120,
        xpReq: 172500,
        recipeName: "Mystical Bracket",
        ingredients: [
          { name: "Kokonut Wood", qty: 5 },
          { name: "Divi Divi Wood", qty: 5 },
        ],
      },
      {
        min: 120,
        max: 130,
        xpReq: 187500,
        recipeName: "Eternal Bracket",
        ingredients: [
          { name: "Bramble Wood", qty: 5 },
          { name: "Mahogany Wood", qty: 5 },
        ],
      },
      {
        min: 130,
        max: 140,
        xpReq: 202500,
        recipeName: "Divine Bracket",
        ingredients: [
          { name: "Carya Wood", qty: 5 },
          { name: "Twisted Seaweed Wood", qty: 5 },
        ],
      },
      {
        min: 140,
        max: 150,
        xpReq: 217500,
        recipeName: "Infernal Bracket",
        ingredients: [
          { name: "Despair Tree Wood", qty: 5 },
          { name: "Nonbeeching Wood", qty: 5 },
        ],
      },
      {
        min: 150,
        max: 160,
        xpReq: 232500,
        recipeName: "Ancestral Bracket",
        ingredients: [
          { name: "Astracacia", qty: 5 },
          { name: "Luzyl", qty: 5 },
        ],
      },
    ],
  },
  Tailor: {
    defaultExp: 600,
    xpMultiplier: 1,
    ranges: [
      {
        min: 0,
        max: 10,
        xpReq: 7500,
        recipeName: "Coarse Fiber",
        ingredients: [
          { name: "Wheat Straw", qty: 5 },
          { name: "Artichoke", qty: 5 },
        ],
      },
      {
        min: 10,
        max: 20,
        xpReq: 22500,
        recipeName: "Basic Fiber",
        ingredients: [
          { name: "Tuberbulb", qty: 5 },
          { name: "Barley Straw", qty: 5 },
        ],
      },
      {
        min: 20,
        max: 30,
        xpReq: 37500,
        recipeName: "Imperfect Fiber",
        ingredients: [
          { name: "Cawwot", qty: 5 },
          { name: "Babbage", qty: 5 },
        ],
      },
      {
        min: 30,
        max: 40,
        xpReq: 52500,
        recipeName: "Fragile Fiber",
        ingredients: [
          { name: "Oat Straw", qty: 5 },
          { name: "Melon", qty: 5 },
        ],
      },
      {
        min: 40,
        max: 50,
        xpReq: 67500,
        recipeName: "Rustic Fiber",
        ingredients: [
          { name: "Rye Fiber", qty: 5 },
          { name: "Mottled Mushroom", qty: 5 },
        ],
      },
      {
        min: 50,
        max: 60,
        xpReq: 82500,
        recipeName: "Raw Fiber",
        ingredients: [
          { name: "Vanilla Rice", qty: 5 },
          { name: "Golden Makafe", qty: 5 },
        ],
      },
      {
        min: 60,
        max: 70,
        xpReq: 97500,
        recipeName: "Solid Fiber",
        ingredients: [
          { name: "Watermelon", qty: 5 },
          { name: "Corn", qty: 5 },
        ],
      },
      {
        min: 70,
        max: 80,
        xpReq: 112500,
        recipeName: "Durable Fiber",
        ingredients: [
          { name: "Beans", qty: 5 },
          { name: "Desert Truffle", qty: 5 },
        ],
      },
      {
        min: 80,
        max: 90,
        xpReq: 127500,
        recipeName: "Refined Fiber",
        ingredients: [
          { name: "Mushray", qty: 5 },
          { name: "Black Cawwot", qty: 5 },
        ],
      },
      {
        min: 90,
        max: 100,
        xpReq: 142500,
        recipeName: "Precious Fiber",
        ingredients: [
          { name: "Jollyflower", qty: 5 },
          { name: "Sunflower", qty: 5 },
        ],
      },
      {
        min: 100,
        max: 110,
        xpReq: 157500,
        recipeName: "Exquisite Fiber",
        ingredients: [
          { name: "Strawberry", qty: 5 },
          { name: "Pumpkin", qty: 5 },
        ],
      },
      {
        min: 110,
        max: 120,
        xpReq: 172500,
        recipeName: "Mystical Fiber",
        ingredients: [
          { name: "Bitter Maniok", qty: 5 },
          { name: "Palm", qty: 5 },
        ],
      },
      {
        min: 120,
        max: 130,
        xpReq: 187500,
        recipeName: "Eternal Fiber",
        ingredients: [
          { name: "Sweat Jute Fiber", qty: 5 },
          { name: "Twisted Rump Chilli", qty: 5 },
        ],
      },
      {
        min: 130,
        max: 140,
        xpReq: 202500,
        recipeName: "Divine Fiber",
        ingredients: [
          { name: "Hactus", qty: 5 },
          { name: "Iced Cranberry", qty: 5 },
        ],
      },
      {
        min: 140,
        max: 150,
        xpReq: 217500,
        recipeName: "Infernal Fiber",
        ingredients: [
          { name: "Demon Fruit", qty: 5 },
          { name: "Evil Bean", qty: 5 },
        ],
      },
      {
        min: 150,
        max: 160,
        xpReq: 232500,
        recipeName: "Ancestral Fiber",
        ingredients: [
          { name: "Bloodiflower", qty: 5 },
          { name: "Grambo Root", qty: 5 },
        ],
      },
    ],
  },
  "Leather Dealer": {
    defaultExp: 600,
    xpMultiplier: 1,
    ranges: [
      {
        min: 0,
        max: 10,
        xpReq: 7500,
        recipeName: "Coarse Leather",
        ingredients: [
          { name: "Larva Skin", qty: 4 },
          { name: "Gobball Skin", qty: 4 },
        ],
      },
      {
        min: 10,
        max: 20,
        xpReq: 22500,
        recipeName: "Basic Leather",
        ingredients: [
          { name: "Branchileg", qty: 4 },
          { name: "Piwi Beak", qty: 4 },
        ],
      },
      {
        min: 20,
        max: 30,
        xpReq: 37500,
        recipeName: "Imperfect Leather",
        recipes: [
          [
            { name: "Bell", qty: 4 },
            { name: "Earth-Earth", qty: 4 },
          ],
          [
            { name: "Crackler's Gold Tooth", qty: 4 },
            { name: "Country Scalp", qty: 4 },
          ],
          [
            { name: "Pirate Fabric", qty: 4 },
            { name: "Deathburn Flesh", qty: 4 },
          ],
        ],
      },
      {
        min: 30,
        max: 40,
        xpReq: 52500,
        recipeName: "Fragile Leather",
        recipes: [
          [
            { name: "Kokoko Leaf", qty: 4 },
            { name: "Bwork Fabric", qty: 4 },
          ],
          [
            { name: "Selachii Skin", qty: 4 },
            { name: "Mother-of-Pearl", qty: 4 },
          ],
          [
            { name: "Stubbyob Leather", qty: 4 },
            { name: "Wild Wool", qty: 4 },
          ],
        ],
      },
      {
        min: 40,
        max: 50,
        xpReq: 67500,
        recipeName: "Rustic Leather",
        recipes: [
          [
            { name: "Arachnee Leg", qty: 4 },
            { name: "Boowolf Paw", qty: 4 },
          ],
          [
            { name: "Crobak Beak", qty: 4 },
            { name: "Raskaw Talons", qty: 4 },
          ],
          [
            { name: "Blibli Skin", qty: 4 },
            { name: "Rat Moustache", qty: 4 },
          ],
        ],
      },
      {
        min: 50,
        max: 60,
        xpReq: 82500,
        recipeName: "Raw Leather",
        recipes: [
          [
            { name: "Gone-Off Blood", qty: 4 },
            { name: "Putribits", qty: 4 },
          ],
          [
            { name: "Scara Horn", qty: 4 },
            { name: "Golden Sand", qty: 4 },
          ],
          [
            { name: "Schnek Earth", qty: 4 },
            { name: "Chafer Bone", qty: 4 },
          ],
        ],
      },
      {
        min: 60,
        max: 70,
        xpReq: 97500,
        recipeName: "Solid Leather",
        recipes: [
          [
            { name: "Opal Fabric", qty: 4 },
            { name: "Beach Fabric", qty: 4 },
          ],
          [
            { name: "Stoneguard", qty: 4 },
            { name: "Snow Hair-Feathers", qty: 4 },
          ],
          [
            { name: "Blue Raspberry Jelly", qty: 2 },
            { name: "Strawberry Jelly", qty: 2 },
            { name: "Lemon Jelly", qty: 2 },
            { name: "Mint Jelly", qty: 2 },
          ],
        ],
      },
      {
        min: 70,
        max: 80,
        xpReq: 112500,
        recipeName: "Durable Leather",
        recipes: [
          [
            { name: "Castuc Cloth", qty: 4 },
            { name: "Whirligig Shell", qty: 4 },
          ],
          [
            { name: "Krak-Ertz", qty: 4 },
            { name: "Frozen Bone", qty: 4 },
          ],
          [
            { name: "Fins", qty: 4 },
            { name: "Puddly Straw", qty: 4 },
          ],
        ],
      },
      {
        min: 80,
        max: 90,
        xpReq: 127500,
        recipeName: "Refined Leather",
        recipes: [
          [
            { name: "Drheller Leather", qty: 4 },
            { name: "Lenald Ful", qty: 4 },
          ],
          [
            { name: "Black Wabbit Fuw", qty: 4 },
            { name: "Blackspore Strip", qty: 4 },
          ],
          [
            { name: "Wabbit Fuw", qty: 4 },
            { name: "Dark Root", qty: 4 },
          ],
        ],
      },
      {
        min: 90,
        max: 100,
        xpReq: 142500,
        recipeName: "Precious Leather",
        recipes: [
          [
            { name: "Dimensional Bone", qty: 4 },
            { name: "Copper Gilding", qty: 4 },
          ],
          [
            { name: "Owange Fabwic", qty: 4 },
            { name: "Infected Fuw", qty: 4 },
          ],
          [
            { name: "Red Fabric", qty: 4 },
            { name: "False Note", qty: 4 },
          ],
        ],
      },
      {
        min: 100,
        max: 110,
        xpReq: 157500,
        recipeName: "Exquisite Leather",
        recipes: [
          [{ name: "Coagulated Blood", qty: 8 }],
          [
            { name: "Antique Fragment", qty: 4 },
            { name: "Meshed Feather", qty: 4 },
          ],
          [
            { name: "Bandit Breath", qty: 4 },
            { name: "Dark Cloth", qty: 4 },
          ],
        ],
      },
      {
        min: 110,
        max: 120,
        xpReq: 172500,
        recipeName: "Mystical Leather",
        recipes: [
          [
            { name: "Crocodyl Leather", qty: 4 },
            { name: "Tropikoko Bark", qty: 4 },
          ],
          [
            { name: "Kannivore Root", qty: 4 },
            { name: "Kanniball Staff", qty: 4 },
          ],
          [
            { name: "Crocodyl Leather", qty: 4 },
            { name: "Tropikoko Bark", qty: 4 },
          ],
        ],
      },
      {
        min: 120,
        max: 130,
        xpReq: 187500,
        recipeName: "Eternal Leather",
        recipes: [
          [
            { name: "Rough Vapor", qty: 4 },
            { name: "Dreggon Shell", qty: 4 },
          ],
          [
            { name: "Magmatic Embers", qty: 4 },
            { name: "Badgerox Fang", qty: 4 },
          ],
          [
            { name: "Pandala Ghostoplasm", qty: 4 },
            { name: "Blightopard Fur", qty: 4 },
          ],
        ],
      },
      {
        min: 130,
        max: 140,
        xpReq: 202500,
        recipeName: "Divine Leather",
        recipes: [
          [
            { name: "Sunsloth Epicuticle", qty: 4 },
            { name: "Tundrazor Leather", qty: 4 },
          ],
          [
            { name: "Sirius Pincer", qty: 4 },
            { name: "Vandalophrenic Leather", qty: 4 },
          ],
          [
            { name: "Scramshell Leather", qty: 4 },
            { name: "Plantiguard Tuft", qty: 4 },
          ],
        ],
      },
      {
        min: 140,
        max: 150,
        xpReq: 217500,
        recipeName: "Infernal Leather",
        recipes: [
          [
            { name: "Pseudopod", qty: 4 },
            { name: "Voidivion Skin", qty: 4 },
          ],
          [
            { name: "Reman'haunt Scalp", qty: 4 },
            { name: "Horridemon Wing", qty: 4 },
          ],
          [{ name: "Destroyer Arm", qty: 8 }],
        ],
      },
      {
        min: 150,
        max: 160,
        xpReq: 232500,
        recipeName: "Ancestral Leather",
        recipes: [
          [
            { name: "Primitive Scale", qty: 4 },
            { name: "Primal Skin", qty: 4 },
          ],
          [
            { name: "Celestial Flake", qty: 4 },
            { name: "Rusted Metal", qty: 4 },
          ],
          [{ name: "Carminite Gem", qty: 8 }],
        ],
      },
    ],
  },
  Baker: {
    defaultExp: 400,
    xpMultiplier: 2,
    ranges: [
      {
        min: 0,
        max: 10,
        xpReq: 7500,
        recipeName: "Coarse Oil",
        ingredients: [
          { name: "Crowned Thistle", qty: 5 },
          { name: "Iriss Flower", qty: 5 },
          { name: "Bucket o' Water", qty: 3 },
        ],
      },
      {
        min: 10,
        max: 20,
        xpReq: 22500,
        recipeName: "Basic Oil",
        ingredients: [
          { name: "Flax Flower", qty: 5 },
          { name: "Mint Leaf", qty: 5 },
          { name: "Bucket o' Water", qty: 3 },
        ],
      },
      {
        min: 20,
        max: 30,
        xpReq: 37500,
        recipeName: "Imperfect Oil",
        ingredients: [
          { name: "Scented Clover", qty: 5 },
          { name: "Orchid Flower", qty: 5 },
          { name: "Bucket o' Water", qty: 3 },
        ],
      },
      {
        min: 30,
        max: 40,
        xpReq: 52500,
        recipeName: "Fragile Oil",
        ingredients: [
          { name: "Fuzzy Fern Leaf", qty: 5 },
          { name: "Nostril Algae", qty: 5 },
          { name: "Bucket o' Water", qty: 3 },
        ],
      },
      {
        min: 40,
        max: 50,
        xpReq: 67500,
        recipeName: "Rustic Oil",
        ingredients: [
          { name: "Gorsegoyle Berry", qty: 5 },
          { name: "Reed Stem", qty: 5 },
          { name: "Bucket o' Water", qty: 3 },
        ],
      },
      {
        min: 50,
        max: 60,
        xpReq: 82500,
        recipeName: "Raw Oil",
        ingredients: [
          { name: "Dendron Flower", qty: 5 },
          { name: "Funkus", qty: 5 },
          { name: "Bucket o' Water", qty: 3 },
        ],
      },
      {
        min: 60,
        max: 70,
        xpReq: 97500,
        recipeName: "Solid Oil",
        ingredients: [
          { name: "Cotton Flower", qty: 5 },
          { name: "Edelweiss", qty: 5 },
          { name: "Bucket o' Water", qty: 3 },
        ],
      },
      {
        min: 70,
        max: 80,
        xpReq: 112500,
        recipeName: "Durable Oil",
        ingredients: [
          { name: "Puffball", qty: 5 },
          { name: "Aloa Vera Leaf", qty: 5 },
          { name: "Bucket o' Water", qty: 3 },
        ],
      },
      {
        min: 80,
        max: 90,
        xpReq: 127500,
        recipeName: "Refined Oil",
        ingredients: [
          { name: "Clobbver", qty: 5 },
          { name: "Venutian Trap", qty: 5 },
          { name: "Bucket o' Water", qty: 3 },
        ],
      },
      {
        min: 90,
        max: 100,
        xpReq: 142500,
        recipeName: "Precious Oil",
        ingredients: [
          { name: "Kamamile Flower", qty: 5 },
          { name: "Volcanic Plant", qty: 5 },
          { name: "Bucket o' Water", qty: 3 },
        ],
      },
      {
        min: 100,
        max: 110,
        xpReq: 157500,
        recipeName: "Exquisite Oil",
        ingredients: [
          { name: "Eterny", qty: 5 },
          { name: "Death Cap", qty: 5 },
          { name: "Bucket o' Water", qty: 3 },
        ],
      },
      {
        min: 110,
        max: 120,
        xpReq: 172500,
        recipeName: "Mystical Oil",
        ingredients: [
          { name: "Tahitiare Flower", qty: 5 },
          { name: "Day Lily", qty: 5 },
          { name: "Bucket o' Water", qty: 3 },
        ],
      },
      {
        min: 120,
        max: 130,
        xpReq: 187500,
        recipeName: "Eternal Oil",
        ingredients: [
          { name: "Momoss", qty: 5 },
          { name: "Nettle Leaf", qty: 5 },
          { name: "Bucket o' Water", qty: 3 },
        ],
      },
      {
        min: 130,
        max: 140,
        xpReq: 202500,
        recipeName: "Divine Oil",
        ingredients: [
          { name: "Flowerflake", qty: 5 },
          { name: "Delphes Inium", qty: 5 },
          { name: "Bucket o' Water", qty: 3 },
        ],
      },
      {
        min: 140,
        max: 150,
        xpReq: 217500,
        recipeName: "Infernal Oil",
        ingredients: [
          { name: "Demonic Galinsoga", qty: 5 },
          { name: "Thistlominator", qty: 5 },
          { name: "Bucket o' Water", qty: 3 },
        ],
      },
      {
        min: 150,
        max: 160,
        xpReq: 232500,
        recipeName: "Ancestral Oil",
        ingredients: [
          { name: "Primaniola", qty: 5 },
          { name: "Rozen", qty: 5 },
          { name: "Bucket o' Water", qty: 3 },
        ],
      },
    ],
  },
  Chef: {
    defaultExp: 600,
    xpMultiplier: 1,
    ranges: [
      {
        min: 0,
        max: 10,
        xpReq: 7500,
        recipeName: "Coarse Spice",
        ingredients: [
          { name: "Breaded Fish", qty: 5 },
          { name: "Bow Meow Fish", qty: 5 },
        ],
      },
      {
        min: 10,
        max: 20,
        xpReq: 22500,
        recipeName: "Basic Spice",
        ingredients: [
          { name: "Sturgeon", qty: 5 },
          { name: "Crabby Anchovy", qty: 5 },
        ],
      },
      {
        min: 20,
        max: 30,
        xpReq: 37500,
        recipeName: "Imperfect Spice",
        ingredients: [
          { name: "Grawn", qty: 5 },
          { name: "Loot", qty: 5 },
        ],
      },
      {
        min: 30,
        max: 40,
        xpReq: 52500,
        recipeName: "Fragile Spice",
        ingredients: [
          { name: "Hairy Ray", qty: 5 },
          { name: "Salamon", qty: 5 },
        ],
      },
      {
        min: 40,
        max: 50,
        xpReq: 67500,
        recipeName: "Rustic Spice",
        ingredients: [
          { name: "Moonfish", qty: 5 },
          { name: "Perch", qty: 5 },
        ],
      },
      {
        min: 50,
        max: 60,
        xpReq: 82500,
        recipeName: "Raw Spice",
        ingredients: [
          { name: "Dragocarp", qty: 5 },
          { name: "Maskerel", qty: 5 },
        ],
      },
      {
        min: 60,
        max: 70,
        xpReq: 97500,
        recipeName: "Solid Spice",
        ingredients: [
          { name: "Grawfish", qty: 5 },
          { name: "Chehorse", qty: 5 },
        ],
      },
      {
        min: 70,
        max: 80,
        xpReq: 112500,
        recipeName: "Durable Spice",
        ingredients: [
          { name: "Eel", qty: 5 },
          { name: "Scincus", qty: 5 },
        ],
      },
      {
        min: 80,
        max: 90,
        xpReq: 127500,
        recipeName: "Refined Spice",
        ingredients: [
          { name: "Hydawhey", qty: 5 },
          { name: "Piri Pirhiana", qty: 5 },
        ],
      },
      {
        min: 90,
        max: 100,
        xpReq: 142500,
        recipeName: "Precious Spice",
        ingredients: [
          { name: "Troutuna", qty: 5 },
          { name: "Hammer Shark", qty: 5 },
        ],
      },
      {
        min: 100,
        max: 110,
        xpReq: 157500,
        recipeName: "Exquisite Spice",
        ingredients: [
          { name: "Vandame", qty: 5 },
          { name: "Sea Boowolf", qty: 5 },
        ],
      },
      {
        min: 110,
        max: 120,
        xpReq: 172500,
        recipeName: "Mystical Spice",
        ingredients: [
          { name: "Knemo", qty: 5 },
          { name: "Dwarf Caiman", qty: 5 },
        ],
      },
      {
        min: 120,
        max: 130,
        xpReq: 187500,
        recipeName: "Eternal Spice",
        ingredients: [
          { name: "Salamander", qty: 5 },
          { name: "Fish Bone", qty: 5 },
        ],
      },
      {
        min: 130,
        max: 140,
        xpReq: 202500,
        recipeName: "Divine Spice",
        ingredients: [
          { name: "Oyster", qty: 5 },
          { name: "Schrymp", qty: 5 },
        ],
      },
      {
        min: 140,
        max: 150,
        xpReq: 217500,
        recipeName: "Infernal Spice",
        ingredients: [
          { name: "Spitefish", qty: 5 },
          { name: "Deceptifish", qty: 5 },
        ],
      },
      {
        min: 150,
        max: 160,
        xpReq: 232500,
        recipeName: "Ancestral Spice",
        ingredients: [
          { name: "Sea Boss", qty: 5 },
          { name: "Lunafish", qty: 5 },
        ],
      },
    ],
  },
};
