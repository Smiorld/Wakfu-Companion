# 沃土伴侣 v1.0

汉化、修复版作者：`T2薯条`  
QQ：`1541599745`

原项目仓库：[`Nexus-Hub/Wakfu-Companion`](https://github.com/Nexus-Hub/Wakfu-Companion)

这是一个基于原版 **Wakfu Companion** 修改而来的中文分发版本，面向使用中文客户端、中文汉化器、以及中英共存日志环境的 `WAKFU` 玩家。

当前版本重点：

- 全站界面中文化
- 聊天、战斗、追踪器、会话总结的中文日志兼容
- 追踪器支持中英双语物品显示与搜索
- 快速翻译器与自动翻译支持术语保护，尽量避免专有名词被机翻破坏
- 适合作为本地浏览器版分发，后续可继续封装为 Electron 桌面版

## 项目性质

这是一个纯前端静态项目。

- 页面入口：`public/index.html`
- 主要逻辑：原生 `HTML + CSS + JavaScript`
- 不依赖后端数据库
- 通过浏览器的 `File System Access API` 读取本机 `wakfu_chat.log`

因此它可以：

- 直接本地打开使用
- 部署到 GitHub Pages / Cloudflare Pages
- 后续继续封装成 Electron 桌面版

## 主要功能

### 1. 战斗统计

- 实时统计伤害、治疗、护甲
- 区分友方与敌方
- 支持战斗历史分页
- 支持护甲、召唤物、部分间接来源的归属修正
- 支持窗口分离显示

### 2. 追踪器

- 追踪采集材料与怪物掉落
- 支持中英双语物品名显示
- 支持中文、英文、中英混合搜索
- 支持按专业筛选
- 支持卡玛估值与目标进度
- 支持窗口分离显示

### 3. 聊天与翻译

- 区分聊天与日志
- 支持中文日志解析
- 自动翻译以中文为核心使用场景
- 保留手动快速翻译器
- 已加入术语保护，尽量保留游戏物品、地名、职业名等专有词

### 4. 会话总结

- 统计本次会话时长
- 统计获得/失去卡玛
- 统计任务、挑战
- 统计战斗与生活职业经验

### 5. 快捷信息

- 每日路线
- 遗物与碎片
- 地下城预报
- 生产经验计算

## 使用方法

### 方式一：本地直接使用

1. 打开 `public/index.html`
2. 将 `wakfu_chat.log` 拖入页面
3. 浏览器请求权限时允许读取
4. 保持游戏日志持续写入，页面会自动轮询刷新

默认日志目录通常为：

```text
%AppData%\zaap\gamesLogs\wakfu\logs\
```

### 方式二：分发给朋友使用

如果你是直接打包给朋友，至少需要保留：

- `public/`

建议分发时保持目录结构完整，再让对方打开：

```text
public/index.html
```

如果缺少 `public/assets/...` 下的资源文件，界面、脚本、图标和数据都会异常。

## 浏览器要求

建议使用：

- `Microsoft Edge`
- `Google Chrome`

原因：

- 项目依赖 `File System Access API`
- 分离窗口功能依赖 `Document Picture-in-Picture`

部分浏览器即使能打开页面，也可能无法稳定读取日志或无法使用分离窗口。

## 版本说明

当前分发版版本号：

```text
v1.0
```

页面标题：

```text
沃土伴侣 v1.0 | 汉化、修复：T2薯条
```

如果你后续继续修改，建议按：

- `v1.0`
- `v1.1`
- `v1.2`

这种方式递增。

## 如果你要 Fork 成自己的仓库

如果你准备把当前版本推到你自己的 GitHub 仓库，推荐流程：

1. Fork 原仓库 `Nexus-Hub/Wakfu-Companion`
2. 把当前修改整理并提交到你自己的分支
3. 在 README 中明确标注：
   - 原项目来源
   - 你自己的修改内容
   - 当前分发版本号
4. 打 Tag，例如：

```bash
git tag v1.0
git push origin v1.0
```

## 如果你要做在线部署

因为这是静态项目，所以很适合白嫖部署：

### GitHub Pages

适合：

- 快速公开预览
- 和 GitHub 仓库直接绑定

### Cloudflare Pages

适合：

- 免费静态托管
- 自动部署
- 后续继续扩展

注意：

在线部署版本质上仍然是网页，不是桌面程序。  
它能读取日志的前提，仍然是用户浏览器支持对应 API，并且用户手动授权读取本地日志文件。

## 仓库内已附带的自动部署

当前仓库已经预放好了两套 GitHub Actions：

- `.github/workflows/deploy-github-pages.yml`
- `.github/workflows/deploy-cloudflare-pages.yml`

### 1. GitHub Pages

这是最省事的方案。

触发条件：

- push 到 `main`
- push 到 `master`
- 手动执行 workflow

使用前你需要在 GitHub 仓库设置中开启：

`Settings -> Pages -> Build and deployment -> Source = GitHub Actions`

### 2. Cloudflare Pages

这是更适合长期白嫖分发的方案。

当前 workflow 已经写好，但要先在 GitHub 仓库里配置以下内容：

#### GitHub Secrets

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

#### GitHub Repository Variable

- `CLOUDFLARE_PAGES_PROJECT_NAME`

例如：

```text
CLOUDFLARE_PAGES_PROJECT_NAME=wakfu-companion-zh
```

如果这 3 个值没有配齐，Cloudflare 的 workflow 会自动跳过，不会报错硬炸。

## 推荐发布方式

如果你准备把当前版本作为你自己的分发版发布，建议顺序：

1. Fork 原仓库
2. 推送你当前所有修改
3. 开启 GitHub Pages，先得到一个能公开访问的预览链接
4. 再补 Cloudflare Pages，让它成为正式在线分发地址
5. 本地版本继续保留 `public/` 整包分发

这样你同时拥有：

- 一个在线版本
- 一个本地离线版本
- 一个后续可继续封装 Electron 的源码版本

## 后续规划

目前这套版本适合作为：

1. 浏览器本地分发版
2. 在线测试版

后续长期目标可以继续推进：

1. 统一术语表与翻译保护
2. 继续补全中文客户端日志兼容
3. 增量更新包分发
4. Electron 桌面版封装

## 免责声明

本项目是玩家自制工具，与 `Ankama` 无官方关联。

它的工作方式是：

- 读取本地日志文本
- 在浏览器中解析与展示

不注入游戏，不修改游戏内存，不拦截游戏网络流量。

## 致谢

- 原项目作者：[`Nexus-Hub`](https://github.com/Nexus-Hub/Wakfu-Companion)
- 图标资源与社区测试数据来源见原项目说明
