# Combat Replay Tools

用于离线重放战斗日志、查看最终统计结果，以及追踪某一行日志为什么会被归属给某个角色。

## 用法

```bash
node tools/combat/replay-log.js <日志路径>
```

按角色和技能过滤：

```bash
node tools/combat/replay-log.js D:/tool/download/把这个发送给薯条\ \(3\).log --actor "Little Doggy" --spell "地盘术"
```

查看某个关键字命中的逐行 trace：

```bash
node tools/combat/replay-log.js D:/tool/download/把这个发送给薯条\ \(3\).log --trace "地盘术"
```

输出完整 JSON，方便后续做断言：

```bash
node tools/combat/replay-log.js D:/tool/download/把这个发送给薯条\ \(3\).log --actor "Little Doggy" --spell "地盘术" --json
```

## 输出内容

- `Matches`
  当前过滤条件下命中的最终统计项，按 `damage / healing / armor` 分类输出。
- `Trace`
  逐行显示：
  - 这行日志处理前的 `currentCaster / currentSpell`
  - 这行日志真正写入统计表时的事件
  - 处理后的上下文状态

## 维护注意

这套工具不会单独维护一份战斗解析逻辑，它直接加载当前仓库里的 [combat.js](D:/tool/document/沃土伴侣/public/assets/js/modules/combat.js)。

这意味着：

- `combat.js` 的归属修复、解析修复会自动体现在回放工具里
- 但如果 `combat.js` 新增了运行时依赖，例如新的全局变量、初始化顺序、DOM 调用或别的脚本依赖，就需要同步更新 `tools/combat/combat-harness.js`

所以它的维护重点不是“双维护两套解析器”，而是维护一层很薄的 Node 运行壳。

## 适合排查的问题

- 间接伤害、燃烧、失血、毒素的归属
- 护甲、自疗、反击是否记到了错误角色
- `x 名敌人受影响` 这类噪音行有没有干扰归属
- 某条具体日志为什么会被算到当前统计结果里
