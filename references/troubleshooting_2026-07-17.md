# 抖音发布 · 问题—解法清单（实测验证版 2026-07-17）

> 本文件汇总「敬老」「安全」两篇真实文章的完整发布调试过程。所有结论均经实测验证，
> 直接推翻了旧版 v5 SKILL.md / troubleshooting.md 中的多处错误结论（已删除旧文件）。
> 主流程脚本：`scripts/publish_now2.js`。

---

## 一、环境与浏览器

### 1. XBrowser 路径过时导致超时
- **现象**：脚本硬编码旧版 XB 路径 `v0.2.23.532`，连接/执行常超时。
- **解法**：统一使用本机当前版本（约 `v0.2.33.617`）。主流程已改为纯 CDP，不再依赖 XB 路径。

### 2. 裸 CDP 连 9222 误关标签、干扰用户浏览器
- **现象**：直接用裸 CDP 连 9222，误用 `Target.closeTarget` 关掉最后一个 douyin 标签导致受控 Chrome 退出，且可能触碰用户常驻浏览器。
- **解法**：使用 **isolated-browser skill** 拉起隔离 Chrome（固定 profile `~/.chrome_qclaw_stable` + 调试端口 9222），完全不碰用户浏览器。

### 3. CDP 连接模式差异 / `Runtime.evaluate` 卡死
- **现象**：部分探针脚本因 CDP 连接模式不同、`Runtime.evaluate` 未配 `awaitPromise`，脚本卡死无返回。
- **解法**：统一用 `publish_now2.js` 内的 CDP 类（自建 WebSocket + 消息 id 映射 + `Runtime.enable`/`DOM.enable`），稳定可用。

### 4. 左侧「选择封面」弹系统原生文件框（无法自动化）
- **现象**：左侧「选择封面」点击后触发系统原生文件选择器（File System Access API），DOM 层无法拦截；弹窗会阻塞渲染，reload 后标题/摘要/正文被清空（变 0/30）。
- **解法**：**放弃左侧「选择封面」路径**，改用右侧「文章头图 → AI生成」（应用内生成，不弹系统框、不清空内容）。

---

## 二、表单填写

### 5. 摘要框类型误判（textarea vs input）
- **现象**：旧文档把摘要当 `<textarea>`，填不进。
- **解法**：摘要框实为 `<input maxlength=30>`。匹配 `input[placeholder*="摘要"]`，用原生 `value` setter + 派发 `input`/`change`/`blur` 事件。

### 6. 正文 ProseMirror 填充
- **现象**：正文区是 `.ProseMirror`（contenteditable），只写 `innerHTML` 不被 React 感知。
- **解法**：对 `.ProseMirror[contenteditable="true"]` 写入 `innerHTML`（分段 `<p>`，转义 `& < >`），并派发 `beforeinput`(insertFromPaste) + `input` 事件。

### 7. 标题框原生 setter
- **解法**：`input[placeholder*="文章标题"]`，用 `Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set` 设值 + 派发 `input` 事件。

---

## 三、封面（最复杂，反复推翻旧结论）

### 8. 旧文档两处错误结论
- 错误 A：「默认有封面」→ 实际**封面是必填项**。
- 错误 B：「点 AI生成 会清空内容」→ 实际**不清空**内容。
- **解法**：真实 DOM 探查后更正。

### 9. 封面操作入口在主表单 vs 右侧面板
- **现象**：一度以为封面入口在主表单，实际在**右侧预览面板的「文章头图」区**（上传图片 / AI生成）。
- **解法**：所有封面操作锁定右侧「文章头图」容器（DOM 内找文本含「文章头图」且 innerText<400 的最小容器）。

### 10. 封面必填 → 发布被拦截
- **现象**：不生成封面直接点发布，弹 Toast「**没有选择封面**」，发布终止、不跳转。
- **解法**：发布前必须确认封面已生成（见问题 14/15）。

### 11. 「AI生成」是 `<span>` 不是 `<button>`
- **现象**：在 `button` 里找 `innerText==='AI生成'`，`count:0`；用正则 `/AI生成/.test` 会匹配到含整页文本的大容器，并非那个按钮。
- **解法**：找「文本含 AI生成、且自身没有文本子节点」的**最小叶子元素**，精确锁定那个 `<span>`。

### 12. 「AI生成」坐标在视口外
- **现象**：首次拿到坐标 `y:-753`（页面顶部往上 753px），CDP 鼠标点屏幕外空白、毫无反应。
- **解法**：先 `scrollIntoView({block:'center'})` 滚入可视区，再用 `getBoundingClientRect()` 取中心点 → 真实视口坐标（约 `(1136,312)`）。

### 13. JS `.click()` 合成事件被 React 拦截
- **现象**：`element.click()` 触发不了 React 的 onClick（`dispatchA: none`）。
- **解法**：用 **CDP 真实鼠标事件** `Input.dispatchMouseEvent`（mousePressed + mouseReleased，带 `isTrusted:true`）打到真实坐标，React 才真正响应。
  > 注意：这与旧 SKILL.md「用 JS click 更可靠、CDP 无效」的结论**相反**——实测 CDP 真鼠标事件才可靠。

### 14. 封面判定只看 `<img>` → 误报「未生成」
- **现象**：反复报告「封面没生成」，实际封面**早就生成了**——只是它是 `background-image` 加载的抖音 CDN 图，不是 `<img>` 标签。
- **解法**：封面判定同时认 `<img src>`（非 data:）**和** `background-image`（`/url\("https?:/` 正则）。这是关键误判点。

### 15. 封面异步加载，6 秒判定过早
- **现象**：点完 AI生成只等 6s 就判定 `ok:false`，带着「无封面」去发布 → 被「没有选择封面」拦截。实际 background-image 异步加载更慢（数秒到十几秒）。
- **解法**：点完 AI生成后**轮询等待最多 30s** 直到 background-image 出现真实图；发布前再**补一轮 20s 兜底轮询**。双重确认才点发布。

---

## 四、发布

### 16. 发布按钮坐标在视口外，点击落空
- **现象**：直接 `box()` 取坐标未滚动，发布按钮在页面底部，坐标在视口外 → 点击无效。
- **解法**：点发布前先 `scrollIntoView({block:'center'})` 让按钮入视口，再取坐标点（`button.button-dhlUZE.primary-cECiOJ`）。点击同样用 CDP 真鼠标事件，不触发风控。
  > 旧文档称「发布会触发短信验证码风控、必须人工」——实测 CDP 真鼠标点击页面底部「发布」按钮**不触发验证**，可完全自动化。之前的风控是因为点错了左侧「高清发布」导航按钮。

---

## 五、工程习惯

### 17. 内联 `node -e` 吞输出
- **现象**：内联一行 node 脚本偶发无输出（异常被静默）。
- **解法**：调试一律写成 `.js` 文件运行，异常可见、可重跑。

### 18. 临时脚本堆积
- **现象**：调试期产生大量 `probe_*/diag_*/dump_*` 等临时脚本，污染技能目录。
- **解法**：只保留正式文件，删除失效/重复脚本。本技能最终脚本仅：
  - `publish_now2.js` —— 完整自动发布（导航→填表→AI生成封面→发布→校验）
  - `check_publish.js` —— 发布后检查状态/截图
  - `article_job.txt` —— 文章内容（标题/摘要/正文）

---

## 六、最终稳定链路（publish_now2.js）

1. 隔离 Chrome 已登录抖音 → 导航到文章发布页
2. 等标题框出现（最多 40s）
3. 填标题（input setter）、摘要（input[maxlength=30] setter）、正文（ProseMirror innerHTML + input 事件）
4. 查封面：若未生成 → `scrollIntoView` 后 CDP 真鼠标点「AI生成」`<span>` → **轮询 background-image 最多 30s**
5. 发布前再兜底轮询封面 20s
6. 发布按钮 `scrollIntoView` 入视口 → CDP 真鼠标点
7. 校验离开编辑页 + Toast「发布成功」

---

## 七、关键认知更正（给维护者）

| 旧结论（错，已删） | 新结论（实测对） |
|---|---|
| 封面默认有 / 可选无 | 封面**必填**，无则发布被 Toast 拦截 |
| 点 AI生成 清空内容 | AI生成**不清空**内容 |
| 封面是 `<img>` | 封面是 **`background-image`**（CDN 图） |
| AI生成是 `<button>` | AI生成是 **`<span>`** 叶子元素 |
| CDP 坐标点击无效，用 JS click | 必须用 **CDP 真鼠标事件**（JS click 被 React 拦） |
| 6s 足矣判定封面 | 封面**异步加载**，需轮询等待 |
| 发布触发短信验证需人工 | CDP 真鼠标点页面底部「发布」**不触发验证**，可全自动化 |
| 裸 CDP 连 9222 | 用 **isolated-browser 隔离 profile** |
