# 抖音文章发布 问题—解法全记录（2026-09-23 实测，婚车租车发布全程）

> 本文件取代 troubleshooting_2026-07-17.md。旧文档中已被新 UI 推翻的结论（AI生成封面 span、
> 「AI生成会清空内容」等）已删除，仍有效的结论并入本文件。

## 一、登录与浏览器

| # | 问题 | 解法 |
|---|------|------|
| P1 | 隔离 profile（`~/.chrome_qclaw_stable`）此前只登录过头条/知乎/搜狐，打开抖音发布页是扫码登录页 | 首次需人工扫码/验证码登录一次，登录态持久化，之后免登录。脚本检测到登录页时应直接报错退出并提示用户，不要死等 |
| P2 | launch.js 复用已运行的隔离实例时，传入的 URL 未必开出新标签（/json 里没有 douyin 页） | 用 CDP HTTP 接口直接开标签：`curl -X PUT "http://127.0.0.1:9222/json/new?<url>"`，URL 中的 `&` 必须编码成 `%26` |

## 二、新版 UI 变化（2026-09-23 为准）

| # | 问题 | 解法 |
|---|------|------|
| P3 | 2026-07 文档的「AI生成」封面 `<span>` 已不存在。新版「文章头图」区只有「点击上传图片」+「AI 配图」两个入口；另新增必填的「封面设置 *」（「点击上传封面图 / 选择封面」） | 弃用 AI 生成封面流程，改为**本地图片上传**，同一张图同时传「文章头图」和「封面设置」 |
| P4 | 页面初始 DOM 里没有 `input[type=file]`（点击上传入口后才动态创建），无法直接 setFileInputFiles | 开启 `Page.setInterceptFileChooserDialog({enabled:true})` → 真鼠标点击上传入口 → 捕获 `Page.fileChooserOpened` 事件拿 `backendNodeId` → `DOM.setFileInputFiles({files:[本地路径], backendNodeId})`。CDP 类必须在 onmessage 里缓存事件（`this.events.push(j)`），用 waitEvent 轮询取（P13） |

## 三、上传后的三道弹窗（必须逐个关闭，否则发布被拦）

| # | 问题 | 解法 |
|---|------|------|
| P5 | 头图上传后弹「图片编辑」裁剪框，不自动关闭，阻塞发布；按「确认」找按钮 3 次全部落空——按钮文本实际是**「确定」**不是「确认」 | 用选择器 `.cropConfirmButton-F6xPmN` 定位，循环点「确定」直到弹窗消失（最多 5 次） |
| P6 | 第一次点「点击上传封面图」捕获不到 fileChooser 事件——上一步裁剪弹窗还开着，遮罩挡住了入口 | 顺序必须严格：关裁剪框 → 再点封面上传入口 → setFileInputFiles → 再关一次裁剪框 |
| P7 | 封面裁剪确认后还会弹「编辑封面」编辑器（模板/贴纸/预览），此时点「发布」无效，页面停在编辑页 | 循环点「完成」按钮（精确文本匹配）直到编辑器消失，再点发布 |

## 四、发布与验证

| # | 问题 | 解法 |
|---|------|------|
| P8 | Toast「图片上传成功」会残留十几秒，极易误判 | 唯一可靠判据：URL 是否离开 `content/post/article`（成功后跳 `content/manage`，Toast 出现「发布成功」） |
| P9 | 刚发布完打开内容管理列表显示「没有更多作品」 | 刷新页面即可看到「已发布」条目（含发布时间、审核状态） |
| P10 | 添加话题：输入「婚车」「婚庆用车」后候选列表匹配不到 | 无候选直接跳过，不阻塞发布；话题入口「点击添加话题」找不到也直接跳过 |

## 五、脚本工程坑

| # | 问题 | 解法 |
|---|------|------|
| P11 | `node -e "..."` 内联脚本嵌套反引号/引号/中文，转义极易语法错误 | 调试/探查脚本一律写成独立 .js 文件再执行 |
| P12 | `WS is not defined`：Node22 的 WebSocket 不自动成为普通全局变量 | `const WS = global.WebSocket;` |
| P13 | 旧 CDP 类只处理请求响应、丢弃事件，捕获不到 `Page.fileChooserOpened` | onmessage 里 `else if (j.method) this.events.push(j)`，配 waitEvent 轮询 |
| P14 | 同名按钮多个（「作品发布」「阅读文章」等在视口外，y 为负） | 过滤 `offsetWidth/offsetHeight` 可见性 + `innerText` 精确匹配 + 取 getBoundingClientRect 中心；点击必须用 `Input.dispatchMouseEvent`（element.click() 是合成事件，被 React 拦截无效） |

## 六、仍然有效的历史结论（2026-07 验证，本次复验成立）

1. **封面必填**：不设封面直接发布会弹 Toast 拦截。
2. **点击必须用 CDP 真鼠标事件**（mousePressed+mouseReleased，isTrusted:true），JS `element.click()` 会被 React 拦截。
3. **标题**：`input[placeholder*="文章标题"]`，原生 value setter + 派发 input/change/blur。
4. **摘要**：`<input maxlength=30>`（不是 textarea），placeholder 含「摘要」。
5. **正文**：`.ProseMirror[contenteditable="true"]` 写 innerHTML（分段 `<p>`、转义 `& < >`）+ `beforeinput`(insertFromPaste) + `input` 事件。
6. 正文建议 ≤8000 字，实测 450–600 字稳定。
7. 页面底部「发布」按钮 CDP 真鼠标点击不触发风控短信。
