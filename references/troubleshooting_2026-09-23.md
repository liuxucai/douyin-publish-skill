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

## 七、多图（3 张）改造（2026-10-12）

**新增能力**：配图既可用**位置参数**直接给多个本地路径，也可用 `--keyword` / `--tags` 从素材库自动挑
（`--image-top` 改张数、`--no-image` 不配图、`--image-dir` 指定素材目录）。

### 实现规则
- **头图逐张上传**：`uploadViaChooser()` 增加 `imgFile` 参数，对 `IMAGES` 循环调用
  `uploadViaChooser(c, '点击上传图片', IMAGES[i])`，即每张都完整走「真实点击入口 → 捕获 fileChooser →
  `DOM.setFileInputFiles` → 关裁剪弹窗 → 关封面编辑器」。
- **封面只用第 1 张**：`uploadViaChooser(c, '点击上传封面图', IMAGES[0])`。
- `Page.setInterceptFileChooserDialog({enabled:true})` 在整个多图循环期间保持开启，循环结束再关闭。

### 关键注意（复用 P5/P6 的教训）
- **每张之间必须把裁剪弹窗关干净**：P6 已证明「上一步裁剪弹窗还开着 → 遮罩挡住下一个入口 → 捕获不到 fileChooser」。
  逐张上传时这个坑会被放大，顺序必须严格：**关裁剪 → 点上传入口 → setFileInputFiles → 再关裁剪**。
- **别用 Toast 判成功**（P8）：以「离开编辑页 / 内容管理列表出现该文」为准。

### 已知状态
- 本机 2026-10-12 复核时**抖音未登录**，多图（头图 3 张）链路当时尚未验证；
  **同日 17:40 已登录并真实发布成功**（见第八节：改版后文章头图仅支持 1 张，故多图链路按「入口消失即停」收口）。

### 已证伪（勿再试）
| 做法 | 为什么不行 |
|---|---|
| 一次给 `DOM.setFileInputFiles` 传多个文件 | 头图入口按单张处理；必须逐张上传并逐张关裁剪弹窗 |
| 多张都不关裁剪弹窗连续上传 | 弹窗遮罩挡住后续入口，fileChooser 捕获不到（P6 的放大版） |
| 把 3 张都当封面 | 抖音封面是单张，只有第 1 张有意义 |

---

## 八、2026-10-12（晚）真实发布实录与平台改版（已闭环）

**结果**：文章《婚车租车怎么选不踩坑？车型、价格、预订时机一篇讲透》于 **17:40 发布成功**
（内容管理页可见「已发布」）。头图 **1 张**（平台限制），封面 1 张。

| # | 问题 | 解法 |
|---|------|------|
| P15 | `node publish_car.js --keyword "婚车租车" --tags "..."` 直接 `FATAL 配图不存在: D:\skills\douyin-publish-skill\婚车租车` | **`POS` 位置参数解析 bug**：原来只按 `!a.startsWith('--')` 过滤，把 `--keyword` 的**值**「婚车租车」当成图片路径。修复：先收集 `FLAGS_WITH_VALUE = ['--keyword','--tags','--image-top','--image-dir']` 各 flag 的下一个值进 `flagVals` 集合，再从位置参数里剔除 |
| P16 | 头图只能传 1 张，第 2、3 张始终「未找到入口」 | **平台改版（2026-10-12）**：文章头图入口是**单选** `input`（`fileChooser.isMultiple()===false`），上传 1 张后「点击上传图片」入口消失，`input[type=file]` 从 DOM 卸载（`querySelectorAll('input[type=file]').length===0`），页面无「继续添加」入口 → **文章体裁只支持 1 张头图**。脚本改为「逐个尝试、入口消失即停」并打印平台限制说明 |
| P17 | 试图一次给单选 input 塞多张 → 报 `Non-multiple file input can only accept single file` | 同上，单选 input 只能 1 张。**勿再尝试**用 `setFiles([a,b,c])` 批量塞头图 |
| P18 | 发布成功判定不可靠（`PUBLISH_UNCONFIRMED` 类误报） | 实测确认成功判据：① URL 离开 `content/post/article`；② Toast 含「发布成功」；③ 内容管理页 `content/manage` 出现「已发布」条目。脚本已把最终 Toast 打印出来辅助判断 |

### 已证伪（本轮新增，勿再试）
| 做法 | 为什么不行 |
|---|---|
| 用 `--keyword` 时代仍把 flag 值当图片路径 | P15：flag 的值不以 `--` 开头，必须按「flag→下一个值」成对剔除 |
| 用 `DOM.setFileInputFiles({files:[a,b,c]})` 一次传 3 张头图 | P16/P17：入口是单选 input，多文件直接报错；且传 1 张后入口即卸载 |
| 靠最终 URL 或 Toast 单指标判成功 | P18：URL 跳转时序不稳；需「离开编辑页 + Toast + 管理页条目」三查 |

### 复用性结论（跨平台）
- 抖音脚本次轮**未踩**「沙箱代理劫持 / 僵死标签页」两坑，原因：它用的是**自研轻量 CDP 类**（`http.get` 直连 127.0.0.1 + Node 内置 `WebSocket` 直连**单个** page target 的 ws），
  既不读 `http_proxy`（`http.get` 不走代理），也不像 `connectOverCDP` 那样一次性初始化浏览器**所有** page target。
  → 只要保持「精准挑 douyin 页 + 单页 ws」，就天然免疫这两类问题；若未来改用 `connectOverCDP`，必须走 `isolated-browser/scripts/pathkit.js` 的 `connectCDP({port,keep,closeOthers:true})`。

---

## 九、2026-10-13（次日）复查：文章已被平台删除（P19）

**结果**：昨天 17:40「发布成功」的《婚车租车怎么选不踩坑？…》**在抖音后台已彻底消失**：

| 核查途径 | 结果 |
|---|---|
| 内容管理 `content/manage`（作品/作品合集两 Tab） | 「没有更多作品」 |
| 「体裁 → 长图文」筛选 | 空 |
| 「审核状态」逐个筛：已发布 / 审核中 / 未通过 | **三个全部为空**（连"未通过"记录都没有） |
| 搜索作品「婚车租车」 | 「没有"婚车租车"相关作品」 |
| 对外主页 `douyin.com/user/self?showTab=post` | **作品 0**，「该账号还未发布过作品哦～」 |

**结论（P19）**：抖音的「发布成功」只代表**提交成功且当时进了"已发布"列表**，平台会在后续（数小时内）做二次审核，违规内容会被**无声下架**——后台连"未通过"标记都不留，对外主页作品数归 0。发布脚本全部判据（离开编辑页 + Toast + 管理页条目）都只能证明**当时**成功，**不能证明存活**。

### 解法 / 流程约定
1. **发布后次日必须复查**（本节脚本化路径）：`content/manage` 逐个审核状态筛 + 标题搜索 + 主页 `user/self?showTab=post` 三查，任一可见即存活，全空即被删。
2. **被删 ≠ 通知你**：抖音没有任何站内提示（后台无标记、无消息），只有复查能发现。
3. **原样重发大概率再被删**（参照 CSDN Q22 同款教训）：重发前必须改写（换标题 / 降 AI 味 / 减营销词），否则浪费账号信用。
4. 内容被删原因无从查证（平台不留理由），按低质/重复/AI 特征嫌疑最大，投稿内容应走各 skill 的「去模板化」写法。

### 已证伪（本轮新增，勿再试）
| 做法 | 为什么不行 |
|---|---|
| 把昨天的「发布成功」三查当最终结论 | P19：三查只证明提交成功，次日可被无声下架 |
| 在「未通过」筛选里找下架原因 | 平台删除不留状态记录，三个审核状态全空 |
| 用抖音号 `1013417708` 拼主页 URL | 主页需要 sec_uid（`MS4wLjABAAAA…`）；登录态下直接访问 `douyin.com/user/self?showTab=post` 即可 |

### 10-13 同日原样重发结果（用户拍板）
- 命令与昨日完全一致（`publish_car.js --keyword "婚车租车" --tags "婚庆用车,婚庆婚车车队"`），35s 完成：
  Toast「发布成功」+ 离开编辑页 + **封面同流程上传成功**。
- 复查（10:25）：内容管理「长图文」筛选项出现该篇「已发布」，**列表项封面缩略图可见**（多图拼贴）✅。
- ⚠️ **存活待次日复查**（P19）：同一内容昨天也是发布成功后被无声下架，今天是否存活需明天跑一遍第九节复查链。
