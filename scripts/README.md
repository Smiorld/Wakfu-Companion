# Scripts

本目录放的是本项目的离线生成、校验、补洞脚本。默认都在仓库根目录执行。

## 已接入 `package.json` 的脚本

### `npm run extract:i18n`

用途：
- 从本地 WAKFU `jar` 里抽取多语言文本。
- 产出中英对照的中间产物，供后续部族、术语表等脚本使用。

默认输入：
- `D:\game\wakfu_client\contents\i18n\i18n_en.jar`
- `D:\game\backup\jp\i18n_ja.jar`

输出：
- `artifacts/wakfu-i18n/`

备注：
- 路径写死在 [extract-wakfu-i18n.js](D:/tool/document/沃土伴侣/scripts/extract-wakfu-i18n.js) 里。

### `npm run build:glossary`

用途：
- 从 `artifacts/wakfu-i18n/wakfu_i18n_en_zh.json` 提取适合聊天翻译和术语替换的词汇表。

默认输出：
- `public/assets/data/wakfu_term_glossary.json`

可手动调用：
```powershell
node scripts/build-wakfu-term-glossary.js [source.json] [output.json]
```

### `npm run build:class-spells-zh`

用途：
- 从 `database.js` 里的英文职业技能表抽技能名。
- 去 `artifacts/wakfu-i18n/wakfu_i18n_en_zh.json` 里反查中文技能名。
- 生成战斗模块可直接使用的中文职业技能表。

输入：
- `public/assets/js/data/database.js`
- `artifacts/wakfu-i18n/wakfu_i18n_en_zh.json`

输出：
- `public/assets/js/data/class_spells_zh.js`
- `artifacts/class-spells-zh-report.json`

说明：
- 当前主要按英文完全匹配反查中文。
- 候选项会优先选 `content.3.*` 这类更像技能名的文本键。
- 未命中的技能会写进 `artifacts/class-spells-zh-report.json`，便于后续人工补洞。

### `npm run build:area-challenges`

用途：
- 从 `wakfu_i18n_en_zh.csv` 和手填模板中生成部族/区域挑战中英文本表。

输入：
- `artifacts/wakfu-i18n/wakfu_i18n_en_zh.csv`
- `artifacts/tribe_manual_fill_template.csv`

输出：
- `public/assets/js/data/area_challenge_i18n.js`

### `npm run build:tribe-zones`

用途：
- 从部族地点修订表生成详情页地点映射。

输入：
- `artifacts/tribe_zone_zh_patch_table.csv`
- `artifacts/tribe_manual_fill_template.csv`
- `public/assets/js/data/area_challenge_i18n.js`

输出：
- `public/assets/js/data/tribe_challenge_zones.js`

### `npm run check:chachassistant-tribes`

用途：
- 拉取 `https://api.chachastuce.fr/quete`
- 观察当前部族任务快照
- 与上次快照比较新增、移除、变化

输出：
- `artifacts/chachassistant-tribe-watch/last_snapshot.json`

适用场景：
- 检查 Chachassistant 是否补了新的部族 `wakfuId`
- 调查桥接来源是否变化

### `npm run lookup:spell-zh -- "英文技能名"`

用途：
- 输入英文技能名。
- 去 `artifacts/wakfu-i18n/wakfu_i18n_en_zh.json` 里查所有候选中文和文本键。
- 方便核对职业技能表汉化时的候选项。

示例：
```powershell
npm run lookup:spell-zh -- "Twilight"
node scripts/find-spell-i18n-candidates.js "Twilight"
```

输出：
- 命中项的 `key / english / chinese`
- 若没有完全匹配，也会给出包含匹配候选

### `npm run lookup:resource-assets`

用途：
- 解析“名称 -> 图标链”。
- 主链是本地 `items.js / database.js / item_i18n_map.js`。
- 补洞链支持输入百科链接、页面片段、本地保存的百科 HTML。

常用示例：
```powershell
node scripts/resolve-resource-asset-chain.js --name Powder --verify
node scripts/resolve-resource-asset-chain.js --contains 彩虹 --verify
node scripts/resolve-resource-asset-chain.js --image-id 81127093
node scripts/resolve-resource-asset-chain.js --url "https://www.wakfu.com/en/mmorpg/encyclopedia/resources/27108-powder"
node scripts/resolve-resource-asset-chain.js --input-file "D:\tool\download\Resources - WAKFU Encyclopedia - WAKFU, The strategic MMORPG with a real environmental and political system..html"
```

说明：
- 在线百科筛选页目前容易被 CloudFront 反爬拦住。
- 保存到本地的百科 HTML 列表页可以稳定批量解析。

### `npm run sync:resource-list -- --input-file "...html"`

用途：
- 读取本地保存的 encyclopedia 列表页 HTML。
- 批量解析资源条目。
- 对照 `public/assets/js/data/items.js` 和 `public/assets/js/data/item_i18n_map.js`。
- 找出追踪器还没收录的条目。
- 默认会尝试从 `artifacts/wakfu-i18n/wakfu_i18n_en_zh.json` 自动补中文映射。

默认行为：
- 只报告缺项，不写文件。

真正写回：
```powershell
node scripts/sync-resource-list-to-tracker-data.js --input-file "...html" --apply
```

补中文映射时：
```powershell
node scripts/sync-resource-list-to-tracker-data.js --input-file "...html" --zh-map-file ".\tmp\resource_zh_map.json" --apply
```

说明：
- `--zh-map-file` 是覆盖层，优先级高于自动读取到的 `wakfu_i18n` 中文。
- 适合手工修正自动翻译不理想、或 `wakfu_i18n` 没命中的条目。

规则：
- `items.js` 缺项时，按 `monsterResources` 现有格式追加。
- `item_i18n_map.js` 会优先使用本地 `wakfu_i18n` 自动补；若还缺，再看 `--zh-map-file`。
- encyclopedia 的 `Unusual` 会映射为项目里的 `Common`。

## 手动运行脚本

### `node scripts/export-ime-terms.js`

用途：
- 从术语表里导出中文输入法词条。

默认输入：
- `public/assets/data/wakfu_term_glossary.json`

输出：
- `artifacts/ime/wakfu_terms_zh.txt`
- `artifacts/ime/wakfu_terms_zh_en.tsv`

### `node tools/combat/replay-log.js`

用途：
- 战斗日志回放/重放辅助。

说明：
- 这个入口在 `package.json` 里对应 `npm run combat:replay`。

## 推荐顺序

### 术语与文本链

1. `npm run extract:i18n`
2. `npm run build:glossary`
3. 需要时 `node scripts/export-ime-terms.js`

### 部族地点链

1. 修 `artifacts/tribe_manual_fill_template.csv`
2. 修 `artifacts/tribe_zone_zh_patch_table.csv`
3. `npm run build:area-challenges`
4. `npm run build:tribe-zones`

### 新物品/怪物掉落补洞链

1. 在官方百科筛选好列表
2. 把页面保存成本地 HTML
3. `npm run lookup:resource-assets -- --input-file "...html"`
4. `npm run sync:resource-list -- --input-file "...html"`
5. 确认缺项后再加 `--apply`

## 注意

- 这些脚本默认假设工作目录是仓库根目录 `D:\tool\document\沃土伴侣`。
- PowerShell 5.x 不支持 `&&`，多步命令请分开执行。
- 中文文件读取优先显式 UTF-8。
- 改了 `public/assets/js/data/*.js` 后，别忘了同步更新 [public/index.html](D:/tool/document/沃土伴侣/public/index.html) 里的静态资源版本号。
