---
name: douyin-publisher
description: 抖音创作平台（creator.douyin.com）文章发布助手。全自动化：填标题/摘要/正文 + 上传本地配图到文章头图与封面（含裁剪确认、封面编辑器关闭）+ 点发布 + 验证结果。2026-10-12 真实发布验证通过。
---

# 抖音创作平台文章发布 Skill

## 核心约束（2026-10-12 复核为准，务必遵守）

1. **封面必填**：右侧「封面设置 *」为必填项。不设封面直接点发布会弹 Toast 拦截。
2. **文章头图仅支持 1 张（2026-10-12 平台改版）**：头图入口是**单选** `input`（`fileChooser.isMultiple()===false`），上传 1 张后「点击上传图片」入口消失、`input[type=file]` 从 DOM 卸载。**勿再尝试**一次 `setFiles([a,b,c])`（报 `Non-multiple file input can only accept single file`）。脚本按多张循环但「入口消失即停」，向前兼容。
3. **本地上传配图**（推荐）：新版「文章头图」区只有「点击上传图片」+「AI 配图」入口，旧版「AI生成」span 已不存在。上传流程见 `publish_car.js`：`Page.setInterceptFileChooserDialog` + 真鼠标点入口 + 捕获 `Page.fileChooserOpened` → `DOM.setFileInputFiles`。
4. **上传后有两道弹窗必须逐个关闭**：①「图片编辑」裁剪框 → 点「确定」（选择器 `.cropConfirmButton-F6xPmN`，⚠️ 是「确定」不是「确认」）；② 封面还会弹「编辑封面」编辑器 → 点「完成」。不关完，发布必被拦。
5. **上传顺序严格**：头图上传→关裁剪框→封面上传→关裁剪框→关封面编辑器。入口被弹窗遮挡时 fileChooser 事件不会触发。
6. **点击必须用 CDP 真鼠标事件**（`Input.dispatchMouseEvent`，isTrusted:true）。JS `element.click()` 是合成事件，会被 React 拦截无效。
7. **发布成功判据（三查）**：① URL 离开 `content/post/article`；② Toast 含「发布成功」；③ 内容管理页刷新出现「已发布」条目。⚠️ Toast「图片上传成功」会残留十几秒，**不能**作为判据。
8. **⚠️ 三查 ≠ 长期存活（P19）**：平台会二次审核并**无声下架**违规内容——次日复查实测：后台所有审核状态筛选与标题搜索全空（连"未通过"标记都没有），对外主页作品归 0。**发布次日必须复查**：`content/manage` 各审核状态筛选 + 标题搜索 + `douyin.com/user/self?showTab=post` 三处任一可见即存活。
9. **首次登录**：隔离 profile 首次打开抖音需人工扫码/验证码登录一次，登录态持久化，之后免登录。
9. 正文建议 ≤8000 字，实测 450–600 字稳定；发布按钮 CDP 点击不触发风控短信。
10. **连接层**：本 skill 用自研轻量 CDP 类（`http.get` 直连 127.0.0.1 + Node 内置 `WebSocket` 直连单个 page target），天然免疫「沙箱代理劫持」与「僵死标签页挂起」两坑。若改用 `connectOverCDP`，须走 `isolated-browser/scripts/pathkit.js` 的 `connectCDP({port,keep,closeOthers:true})`。

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
2. 完整发布（配图默认挑 3 张，但文章头图**平台仅接受 1 张**，第 1 张同时用作封面）：
   ```bash
   node scripts/publish_car.js --keyword "婚车租车" --tags "婚庆用车,婚庆婚车车队"   # 自动挑 3 张
   # 或手动指定：node scripts/publish_car.js a.jpg b.jpg c.jpg
   ```
   脚本自动：填标题/摘要/正文 → 上传头图（逐个尝试、入口消失即停）→ 关裁剪框/封面编辑器 → 点发布 → 校验。
   ⚠️ `--keyword` / `--tags` 的**值不是图片路径**（脚本已按 flag 成对剔除，P15）。
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
| `references/troubleshooting_2026-09-23.md` | 完整问题—解法清单（含第八节 2026-10-12 真实发布实录与平台改版） |
| `VERSION` | 版本与变更摘要 |

### 外部依赖（跨 skill 相对引用，勿写死路径）
- 配图挑选：`require('../../isolated-browser/scripts/post_images.js')` → `planImages()`
- （可选）连接层：`isolated-browser/scripts/pathkit.js` 的 `connectCDP()`

## 问题排查速查（详见 references/troubleshooting）

| 现象 | 首查 |
|------|------|
| `FATAL 配图不存在: ...\<关键词>` | `--keyword` 值被当路径（P15，已修） |
| 头图只传了 1 张 | 平台限制，正常（P16） |
| 发布后不确定是否成功 | 三查：离开编辑页 + Toast「发布成功」+ 内容管理页条目（P18） |
| 昨天发布成功的文章今天找不到了 | P19 平台无声下架：次日复查（审核状态筛选 + 标题搜索 + 主页作品数），原样重发会被再删，须改写内容 |
| fileChooser 捕获不到 | 上一步弹窗未关干净，遮罩挡住入口（P6） |

## 已知限制

- **文章头图只支持 1 张**（2026-10-12 平台改版，单选 input，传完入口即卸载）。多张需求目前无法满足。
- Chrome 必须已以 `--remote-debugging-port=9222` 启动且登录抖音。
- 话题「添加话题」输入后若无匹配候选，直接跳过（不影响发布）。
- 抖音 UI class 名可能随版本变化（`.cropConfirmButton-F6xPmN`、`button.button-dhlUZE.primary-cECiOJ` 等），失效时用 `probe_douyin.js` 重新探查。
- 依赖 Node ≥ 22（内置 `global.WebSocket`），脚本零 npm 依赖。
- 截图等运行产物写到系统临时目录，不写进本仓库。
