---
name: douyin-publisher
description: 抖音创作平台（creator.douyin.com）文章发布助手。全自动化填写标题/摘要/正文 + 右侧「文章头图」AI生成封面 + 点击发布 + 验证结果。所有结论均经 2026-07-17 实测验证。
---

# 抖音创作平台文章发布 Skill

## 适用场景

将文章发布到抖音创作者平台。**全流程自动化**：填写标题/摘要/正文 → 右侧「文章头图」AI 生成封面 → 点击发布 → 验证结果。

## 核心约束（实测结论，务必遵守）

1. **封面必填**：抖音要求文章头图必填。不生成封面直接点发布会弹 Toast「没有选择封面」并拦截发布。旧文档「封面可选 / 默认有封面」是**错误**的。
2. **AI 生成不清空内容**：点 AI生成不会清空已填的标题/摘要/正文。旧文档「AI生成会清空内容」是**错误**的。
3. **封面用 background-image 加载**：封面不是 `<img>` 标签，而是右侧「文章头图」容器的 **`background-image`**（抖音 CDN 图）。判定封面是否生成要同时认 `<img src>`（非 data:）和 `background-image`（正则 `/url\("https?:/`）。
4. **「AI生成」是 `<span>` 不是 `<button>`**，且**默认在视口外**（页面顶部往上约 753px），必须先 `scrollIntoView` 才能点中。
5. **点击用 CDP 真实鼠标事件**：JS 的 `element.click()` 是合成事件，会被 React 拦截（实测无效）。必须用 `Input.dispatchMouseEvent`（mousePressed+mouseReleased，`isTrusted:true`）。旧文档「用 JS click 更可靠」是**错误**的。
6. **发布按钮可自动化、不触发风控**：页面底部「发布」按钮用 CDP 真鼠标点击**不触发**短信验证。旧文档「发布触发风控需人工」是**错误**的（之前的风控是因为点错了左侧「高清发布」导航按钮）。
7. **封面异步加载**：点完 AI生成后 `background-image` 是异步出现的，需**轮询等待**（最多约 30s），不能只等几秒。

## 环境与启动

使用 **isolated-browser skill** 拉起隔离 Chrome（固定 profile `~/.chrome_qclaw_stable` + 调试端口 9222），不要碰用户常驻浏览器、也不要用裸 CDP 误关标签。

```powershell
$chromePath = "C:\Program Files\Google\Chrome\Application\chrome.exe"
$profileDir = "$env:USERPROFILE\.chrome_qclaw_stable"
$url = "https://creator.douyin.com/creator-micro/content/post/article?enter_from=publish_page&media_type=article&type=new"
if (-not (Test-Path $profileDir)) { New-Item -ItemType Directory -Path $profileDir -Force | Out-Null }
Start-Process $chromePath -ArgumentList @("--remote-debugging-port=9222","--user-data-dir=$profileDir",$url)
```

启动后首次手动登录抖音，固定目录会持久保存登录态。

## 使用方式

1. 把文章内容写入 `scripts/article_job.txt`，格式：
   ```
   标题：<文章标题，≤30字>
   摘要：<摘要，≤30字>
   正文：
   <段落1>

   <段落2>
   ...
   ```
2. 运行完整发布：
   ```bash
   node scripts/publish_now2.js
   ```
3. 发布后检查结果（可选）：
   ```bash
   node scripts/check_publish.js
   ```

## 表单填写要点

| 字段 | 元素 | 方法 |
|------|------|------|
| 标题 | `input[placeholder*="文章标题"]` | 原生 `value` setter + 派发 `input` 事件 |
| 摘要 | `input[placeholder*="摘要"]`（实为 `<input maxlength=30>`，**不是** textarea） | 原生 `value` setter + 派发 `input` 事件 |
| 正文 | `.ProseMirror[contenteditable="true"]` | 写 `innerHTML`（分段 `<p>`、转义 `& < >`）+ 派发 `beforeinput`(insertFromPaste) + `input` 事件 |

## 封面流程（关键）

1. 锁定右侧「文章头图」容器：`document.querySelectorAll('*')` 中找文本含「文章头图」且 innerText<400 的最小容器。
2. 若封面未生成（无 `<img>` 真图、无 `background-image` 真图）：
   - 找「AI生成」`<span>`：文本含「AI生成」且自身无文本子节点的最小叶子元素。
   - `scrollIntoView({block:'center'})` 滚入视口，取 `getBoundingClientRect()` 中心点。
   - 用 CDP 真鼠标事件点击该坐标。
3. **轮询** `background-image` 是否出现真实图（最多约 30s），出现后才继续。

## 发布流程

1. 发布按钮：`button.button-dhlUZE.primary-cECiOJ`（页面底部「发布」）。
2. 点前先 `scrollIntoView({block:'center'})` 入视口。
3. CDP 真鼠标事件点击。
4. 校验：URL 离开 `content/post/article` 且出现 Toast「发布成功」即为成功（状态可能显示「审核中」）。

## 文件结构

| 文件 | 说明 |
|------|------|
| `scripts/publish_now2.js` | ⭐ 完整自动发布（唯一主流程，含封面轮询等待） |
| `scripts/check_publish.js` | 发布后检查状态 / 截图 |
| `scripts/article_job.txt` | 待发布文章内容 |
| `references/troubleshooting_2026-07-17.md` | 完整问题—解法清单（含已推翻的旧错误结论对照） |

## 已知限制

- Chrome 必须已以 `--remote-debugging-port=9222` 启动且登录抖音。
- 文章正文建议 ≤8000 字（抖音限制），实测约 450–526 字稳定。
- 抖音 UI class 名可能随版本变化（如 `button.button-dhlUZE.primary-cECiOJ`），若定位失败需重新探查最新选择器。
