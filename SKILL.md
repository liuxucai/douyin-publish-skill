---
name: douyin-publisher
description: 抖音创作平台（creator.douyin.com）文章发布助手。全自动化填写标题/摘要/正文+AI生成封面+点击发布。支持草稿续编+验证发布结果。
---

# 抖音创作平台文章发布 Skill v5

## 适用场景

将文章发布到抖音创作者平台。**全流程自动化**：填写标题/摘要/正文 → AI生成封面 → 点击发布 → 验证结果。

## 🚀 v5 核心更新

| 问题 | v4 描述 | v5 修正 |
|------|---------|---------|
| **发布按钮** | ❌ 认为不可自动化（安全验证） | ✅ **完全可自动化**——`element.click()` 即可，不触发验证 |
| **"高清发布"误解** | ❌ 认为是发布按钮 | ✅ 那是左侧导航栏，点它会到上传中心。真正的发布按钮是页面底部的 **"发布" (button.primary)** |
| **点击方式** | ❌ CDP dispatchMouseEvent | ✅ JS `element.click()` 更可靠 |
| **AI生成延迟** | ❌ 未指定等待方式 | ✅ 轮询 `"AI智能生成中"` 文本判断完成 |
| **草稿续编** | ❌ 未对接 | ✅ 检测"继续编辑"弹窗 → 跳过填写直接点发布 |

## ⚠️ 已知陷阱（必读）

### 陷阱1：两个「发布」按钮——别点错！

页面中存在**两个**不同的"发布"相关按钮：

| 按钮 | 位置 | 效果 | 是否目标 |
|------|------|------|---------|
| **"高清发布"** | 左侧导航栏顶部（红色下拉） | 跳转到上传中心 `/content/upload` | ❌ |
| **"发布"** | 页面底部表单（button.primary） | 提交文章 | ✅ |

**选择方法**：查找 `button` 中 `innerText.trim() === '发布'` 且 `className` 包含 `primary` 的那个。

### 陷阱2：点击方式——用 JS click() 而不是 CDP 鼠标事件

| 方式 | 结果 |
|------|------|
| CDP `Input.dispatchMouseEvent` | ❌ 固定定位按钮，坐标点击不生效 |
| CDP `Runtime.evaluate` + `element.click()` | ✅ 可靠 |

### 陷阱3：AI生成可能清空已填写内容

AI生成封面后页面可能重渲染。**正确顺序**：填写内容 → AI生成 → 检查内容，如丢失则重新填写 → 点击发布。

### 陷阱4：Chrome 用户数据目录

必须用**固定目录**保存登录态和草稿：

```powershell
$profileDir = "$env:USERPROFILE\.chrome_qclaw_stable"
```

不要用临时目录，否则每次都是新浏览器（无登录态、无草稿）。

## 环境要求

| 项目 | 要求 |
|------|------|
| 浏览器 | Chrome（正式版，固定用户目录） |
| 控制工具 | Node.js CDP WebSocket（内置，无需 `ws` 模块） |
| Node.js | v18+（v22 内置 WebSocket） |

## 启动 Chrome

```powershell
$chromePath = "C:\Program Files\Google\Chrome\Application\chrome.exe"
$profileDir = "$env:USERPROFILE\.chrome_qclaw_stable"
$url = "https://creator.douyin.com/creator-micro/content/post/article?enter_from=publish_page&media_type=article&type=new"

if (-not (Test-Path $profileDir)) {
  New-Item -ItemType Directory -Path $profileDir -Force | Out-Null
}

Start-Process $chromePath -ArgumentList @(
  "--remote-debugging-port=9222",
  "--user-data-dir=$profileDir",
  $url
)
```

## 核心技术方案

### 无需 `ws` 模块

Node.js v22 内置 `WebSocket` 全局对象，可直接使用。避免因中文用户名路径导致 npm 安装失败的问题。

```js
const ws = new WebSocket(wsUrl);
```

### CDP 通信核心

```js
function cdp(method, params = {}) {
  return new Promise((resolve) => {
    const id = ++msgId;
    pending[id] = resolve;
    ws.send(JSON.stringify({ id, method, params }));
  });
}

function js(expr) {
  return cdp('Runtime.evaluate', {
    expression: expr,
    returnByValue: true,
    awaitPromise: true
  });
}
```

### 关键元素定位

```js
// 标题
document.querySelector('input[placeholder*="标题"]')
// 摘要
document.querySelector('input[placeholder*="摘要"]')
// 正文编辑器
document.querySelector('.ProseMirror')
// "有文章头图" radio（第一个）
document.querySelectorAll('input[type="radio"]')[0]
// AI生成按钮（文本匹配）
Array.from(document.querySelectorAll('div, span, button')).find(
  e => e.innerText && e.innerText.trim() === 'AI生成'
)
// 发布按钮（class包含primary的button）
Array.from(document.querySelectorAll('button')).find(
  b => b.innerText && b.innerText.trim() === '发布' && (b.className || '').includes('primary')
)
```

### 设置 input value（React 受控组件）

```js
var setter = Object.getOwnPropertyDescriptor(
  window.HTMLInputElement.prototype, 'value'
).set;
setter.call(input, '值');
input.dispatchEvent(new Event('input', {bubbles: true}));
```

## 完整自动化流程

### 脚本一：auto_publish.js（完整流程）

```bash
node scripts/auto_publish.js
```

执行步骤：
1. 连接 Chrome CDP（端口 9222-9225）
2. 导航到文章编辑页
3. 关闭弹窗（"我知道了"/"继续编辑"）
4. 填写标题、摘要、正文
5. 选择"有文章头图"
6. 点击"AI生成"等待完成（轮询 `AI智能生成中` 文本消失）
7. 滚动到底部，用 `element.click()` 点击「发布」按钮
8. 等待跳转，截图验证
9. 检查 URL 是否跳转到 `/content/manage`

### 脚本二：验证发布结果

```bash
node scripts/check_publish.js
```

检查内容管理页的作品数量和标签页状态。

## 文件结构

| 文件 | 说明 |
|------|------|
| `scripts/auto_publish.js` | ⭐ **完整自动发布**（填写+AI+发布） |
| `scripts/auto_publish2.js` | 改进版（CDP 坐标点击，不推荐） |
| `scripts/auto_publish3.js` | 改进版（CDP 坐标+JS click 混合，不推荐） |
| `scripts/auto_publish4.js` | ✅ **最终推荐**（纯 JS click 发布） |
| `scripts/check_publish.js` | 验证发布结果 |
| `scripts/set_cover_ai.js` | 仅 AI 生成封面 |
| `scripts/fill_douyin_native.js` | 仅填写表单（原型） |
| `scripts/fill_final.js` | 仅填写摘要（原型） |
| `scripts/fill_abstract.js` | 仅填写摘要（原型） |
| `references/troubleshooting.md` | 故障排查 |

## 核心工作流程

```
1. 导航到发布页
   └─ 检测"继续编辑"弹窗 → 跳过内容填写
2. 内容填写
   ├─ 标题（input + 原生 value setter）
   ├─ 摘要（input + 原生 value setter）
   └─ 正文（.ProseMirror + innerHTML）
3. 选中"有文章头图"
   └─ radio[0].checked = true
4. 点击 AI生成
   └─ 轮询等待"AI智能生成中"消失
5. 滚动到底部
6. JS element.click() 点击「发布」
7. 等待 URL 跳转到 /content/manage
8. 截图验证
```

## 已知限制

- Chrome 必须已以 `--remote-debugging-port=9222` 启动
- 首次需要手动登录抖音账号（固定目录保存登录态）
- 文章正文约 500 字（抖音限制，实际测试 526 字可行）
- 标题 ≤30 字，摘要 ≤30 字

## 实战经验（2026-07-09 更新）

### 发布按钮完全可自动化

**发现**：之前 v4 认为发布按钮会触发安全验证（短信验证码），导致需手动点击。经实际测试：
- **JS `element.click()` 点击 button.primary 发布，不触发安全验证**
- **之前的"安全验证"是因为点错了按钮**——点的是左侧导航栏的"高清发布"，而非页面底部的"发布"
- **CDP 坐标点击无效**，必须用 JS 注入的 `element.click()`

### AI生成等待策略

轮询 `document.body.innerText.includes('AI智能生成中')`：
- 约 7-14 秒生成完成
- 判断文本返回 `'gen'` 或 `'done'`

### 草稿续编

重新进入发布页时，如果弹出"继续编辑"弹窗，说明有已保存的草稿。点击"继续编辑"后，直接滚动到底部点击发布即可（内容已在）。
