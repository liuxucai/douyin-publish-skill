---
name: douyin-publisher
description: 抖音创作平台（creator.douyin.com）文章发布助手。全自动化：填标题/摘要/正文 + 上传本地配图到文章头图与封面（含裁剪确认、封面编辑器关闭）+ 点发布 + 验证结果。2026-09-23 全流程实测。
---

# 抖音创作平台文章发布 Skill

## 核心约束（2026-09-23 实测，务必遵守）

1. **封面必填**：右侧「封面设置 *」为必填项。不设封面直接点发布会弹 Toast 拦截。
2. **本地上传配图**（推荐）：新版「文章头图」区只有「点击上传图片」+「AI 配图」入口，旧版「AI生成」span 已不存在。上传流程见 `publish_car.js`：`Page.setInterceptFileChooserDialog` + 真鼠标点入口 + 捕获 `Page.fileChooserOpened` → `DOM.setFileInputFiles`。
3. **上传后有两道弹窗必须逐个关闭**：①「图片编辑」裁剪框 → 点「确定」（选择器 `.cropConfirmButton-F6xPmN`，⚠️ 是「确定」不是「确认」）；② 封面还会弹「编辑封面」编辑器 → 点「完成」。不关完，发布必被拦。
4. **上传顺序严格**：头图上传→关裁剪框→封面上传→关裁剪框→关封面编辑器。入口被弹窗遮挡时 fileChooser 事件不会触发。
5. **点击必须用 CDP 真鼠标事件**（`Input.dispatchMouseEvent`，isTrusted:true）。JS `element.click()` 是合成事件，会被 React 拦截无效。
6. **发布成功唯一判据**：URL 离开 `content/post/article`（成功跳 `content/manage`，Toast「发布成功」）。Toast「图片上传成功」会残留十几秒，不能作为判据。
7. **首次登录**：隔离 profile 首次打开抖音需人工扫码/验证码登录一次，登录态持久化，之后免登录。
8. 正文建议 ≤8000 字，实测 450–600 字稳定；发布按钮 CDP 点击不触发风控短信。

## 环境与启动

使用 **isolated-browser skill** 拉起隔离 Chrome（固定 profile `~/.chrome_qclaw_stable` + CDP 9222），不碰用户常驻浏览器。

```bash
# 后台常驻（沙箱会回收 detached 子进程，必须 run_in_background + sleep 保活）
node ~/.workbuddy/skills/isolated-browser/scripts/launch.js \
  "https://creator.douyin.com/creator-micro/content/post/article?enter_from=publish_page&media_type=article&type=new" \
  && sleep 7200
```

若已运行的实例没开出 douyin 标签页，直接用 CDP 开新标签（`&` 要编码成 `%26`）：

```bash
curl -X PUT "http://127.0.0.1:9222/json/new?https://creator.douyin.com/creator-micro/content/post/article?enter_from=publish_page%26media_type=article%26type=new"
```

首次使用需在弹出的隔离 Chrome 窗口中人工登录抖音。

## 使用方式

1. 把文章写入 `scripts/article_job.txt`（UTF-8）：
   ```
   标题：<文章标题，≤30字>
   摘要：<摘要，≤30字>
   正文：
   <段落1>

   <段落2>
   ```
2. 完整发布（配图可选但封面必填，强烈建议传图）：
   ```bash
   node scripts/publish_car.js "D:\skills\car\11.jpg"
   ```
   脚本自动：填标题/摘要/正文 → 上传配图到「文章头图」+「封面设置」→ 关裁剪框/封面编辑器 → 点发布 → 校验。
3. 发布后排查页面状态（登录态/弹窗/可见按钮/截图）：
   ```bash
   node scripts/probe_douyin.js
   ```
4. 结果确认：浏览器打开内容管理页刷新，看到「已发布」条目即成功。

## 表单填写要点

| 字段 | 元素 | 方法 |
|------|------|------|
| 标题 | `input[placeholder*="文章标题"]` | 原生 value setter + 派发 input/change/blur |
| 摘要 | placeholder 含「摘要」的 `<input maxlength=30>`（不是 textarea） | 同上 |
| 正文 | `.ProseMirror[contenteditable="true"]` | 写 innerHTML（分段 `<p>`、转义 `& < >`）+ `beforeinput`(insertFromPaste) + `input` 事件 |

## 文件结构

| 文件 | 说明 |
|------|------|
| `scripts/publish_car.js` | ⭐ 一体化自动发布（表单 + 本地配图上传 + 弹窗处理 + 发布验证），替代已删除的 publish_now2.js |
| `scripts/probe_douyin.js` | 页面探针：登录态/弹窗/可见按钮/截图，发布卡壳时先用它排查 |
| `scripts/article_job.txt` | 待发布文章内容（每次发布前覆盖） |
| `scripts/check_publish.js` | 发布后状态检查 |
| `references/troubleshooting_2026-09-23.md` | 完整问题—解法清单（2026-09-23 婚车租车发布全程实录） |

## 已知限制

- Chrome 必须已以 `--remote-debugging-port=9222` 启动且登录抖音。
- 话题「添加话题」输入后若无匹配候选，直接跳过（不影响发布）。
- 抖音 UI class 名可能随版本变化（`.cropConfirmButton-F6xPmN`、`button.button-dhlUZE.primary-cECiOJ` 等），失效时用 `probe_douyin.js` 重新探查。
- 依赖 Node ≥ 22（内置 `global.WebSocket`），脚本零 npm 依赖。
