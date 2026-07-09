# 抖音发布故障排查指南

## 2026-07-06 实战问题汇总

### 问题1：AI生成封面后页面刷新，内容丢失

**现象**：
- 点击右侧"AI生成"按钮后，页面重新加载
- 之前填写的标题、正文变为空（显示 0/30 字、0/8000 字）
- 但AI生成的封面保留在右侧预览区

**根因**：
抖音的 AI 生成功能触发后，页面会重新渲染（可能是为了同步封面状态到表单），导致 React 组件状态重置。

**解决方案**：
```
正确的执行顺序：
1. 填写标题
2. 填写正文  
3. 点击"AI生成"封面
4. 等待生成完成
5. 截图确认（此时内容可能已丢失）
6. 如果内容丢失，重新填写
7. 点击"暂存离开"保存
```

**代码实现**：
```js
// 先完成所有内容填充
await fillTitle('标题内容');
await fillBody('正文内容');

// 再点击AI生成
await clickAIGenerate();
await wait(15000);  // 等待生成

// 检查内容是否还在
const hasContent = await checkContent();
if (!hasContent) {
  // 内容被刷新，重新填写
  await fillTitle('标题内容');
  await fillBody('正文内容');
}

// 最后保存
await clickSaveDraft();
```

---

### 问题2：点击"暂存离开"后页面跳转，找不到编辑器

**现象**：
- 执行脚本后提示"未找到标题输入框"、"未找到编辑器"
- URL 显示 `https://creator.douyin.com/creator-micro/content/upload?default-tab=5`
- 不在文章编辑页面

**根因**：
上一次操作点击了"暂存离开"，页面已跳转到上传/管理页面，不在编辑器内。

**解决方案**：
1. 导航回文章发布页
2. 检查是否有"继续编辑"提示
3. 点击"继续编辑"恢复草稿

**代码实现**：
```js
// 1. 导航到发布页
await navigate('https://creator.douyin.com/creator-micro/content/post/article?enter_from=publish_page&media_type=article&type=new');
await wait(8000);

// 2. 检查是否需要继续编辑
const needContinue = await eval(`
  document.querySelector('a[href*="post/article"]')?.innerText?.includes('继续编辑')
`);

if (needContinue) {
  // 3. 点击继续编辑
  await click('a:contains("继续编辑")');
  await wait(5000);
}

// 4. 现在可以正常填写了
```

---

### 问题3：CDP WebSocket 截图超时

**现象**：
```
3. 截图...
Error: Timeout
```

**根因**：
- 页面正在加载或渲染中
- CDP 连接不稳定
- 截图命令超时（默认 30 秒）

**解决方案**：
1. 增加等待时间
2. 简化截图逻辑
3. 使用更短的超时时间，失败后重试

**代码实现**：
```js
// 等待页面稳定
await wait(3000);

// 简化截图（不使用 await 嵌套）
try {
  const result = await send(ws, 'Page.captureScreenshot', { format: 'png' }, 10000);
  if (result?.data) {
    fs.writeFileSync('screenshot.png', Buffer.from(result.data, 'base64'));
  }
} catch (e) {
  console.log('截图失败，跳过');
}
```

---

### 问题4：元素定位失败（ref 失效）

**现象**：
- 使用 `xb snapshot` 获取的 ref（如 e25, e42）在页面刷新后失效
- 提示元素不存在或操作失败

**根因**：
抖音页面使用 React 动态渲染，元素 ref 在每次渲染后都会重新分配。

**解决方案**：
使用基于内容的选择器，而非固定的 ref：

```js
// ❌ 错误：依赖固定 ref
await xb('click', { ref: 'e42' });

// ✅ 正确：基于内容查找
await eval(`
  var btns = document.querySelectorAll('button');
  for (var i = 0; i < btns.length; i++) {
    if (btns[i].innerText === '暂存离开') {
      btns[i].dispatchEvent(new MouseEvent('click', {bubbles:true}));
      break;
    }
  }
`);
```

---

### 问题5：PowerShell 中文路径编码问题

**现象**：
- 脚本路径包含中文（如 `C:\Users\菠萝\...`）
- PowerShell 执行时报错或找不到文件

**解决方案**：
1. 使用 Node.js 直接执行脚本（绕过 PowerShell）
2. 使用短路径或英文路径
3. 使用 `Start-Process` 而非直接调用

**代码实现**：
```powershell
# ❌ 可能出错
node "C:\Users\菠萝\.qclaw\workspace-agent-3af8d089\script.js"

# ✅ 使用 Start-Process
Start-Process -FilePath "node" -ArgumentList "`"C:\Users\菠萝\.qclaw\workspace-agent-3af8d089\script.js`"" -NoNewWindow -Wait
```

---

### 问题6：点击"发布"按钮触发短信验证弹窗

**现象**：
- 脚本成功点击"发布"按钮（MouseEvent 三件套）
- 页面未跳转，弹出「接收短信验证码」安全验证弹窗
- 弹窗内容："为确保是本人操作抖音账号，请输入当前手机号150****56收到的短信验证码"
- 按钮选项：「取消」「验证」「使用原设备扫码」

**根因**：
抖音平台检测到异常操作特征（自动化脚本点击），触发账号安全保护机制。这不是 React `isTrusted` 的问题，而是平台级的风控策略。

**尝试关闭弹窗的方法**：

| 方法 | 结果 | 说明 |
|------|------|------|
| 查找「取消」按钮点击 | ❌ 未找到 | 弹窗在 iframe 或 shadow DOM 中，常规选择器无法定位 |
| 查找 innerText 包含"取消"的元素 | ❌ 未找到 | 弹窗渲染机制特殊 |
| 发送 ESC 按键 | 未测试 | 可能有效 |
| 直接点击「暂存离开」 | ✅ 成功 | 绕过弹窗，直接保存草稿 |

**解决方案**：

**方案A：混合工作流（推荐）**
```
脚本填内容 + AI生成封面 → 截图确认 → 用户手动点击"发布" → 用户完成验证
```

**方案B：验证后自动化**
```js
// 1. 脚本点击发布（会触发验证弹窗）
await clickPublish();

// 2. 提示用户手动完成验证
console.log('请手动输入短信验证码或扫码完成验证');
await wait(60000);  // 等待用户操作

// 3. 验证完成后，脚本继续
await verifyPublishSuccess();
```

**方案C：草稿模式（当前实现）**
```js
// 检测到验证弹窗后
const hasVerifyModal = await checkVerifyModal();
if (hasVerifyModal) {
  // 不尝试关闭弹窗（难以定位），直接保存草稿
  await clickSaveDraft();  // 「暂存离开」按钮不受弹窗影响
  console.log('草稿已保存，请手动发布');
}
```

**关键发现**：
- 「暂存离开」按钮可以绕过验证弹窗直接点击
- 验证弹窗的 DOM 结构特殊，常规选择器（包括 `querySelectorAll('button')`）无法定位到「取消」按钮
- 弹窗可能是 React Portal 或独立渲染层

**代码实现（检测验证弹窗）**：
```js
async function checkVerifyModal() {
  return await eval(`
    (function() {
      // 方法1：检查特定文本
      const bodyText = document.body.innerText;
      if (bodyText.includes('接收短信验证码') || 
          bodyText.includes('为确保是本人操作')) {
        return true;
      }
      
      // 方法2：检查遮罩层
      const overlays = document.querySelectorAll('[class*="modal"], [class*="overlay"], [class*="mask"]');
      for (let el of overlays) {
        if (el.offsetParent !== null && getComputedStyle(el).display !== 'none') {
          return true;
        }
      }
      
      return false;
    })()
  `);
}
```

---

## 最佳实践总结

### 执行顺序
```
1. 启动 Chrome（带调试端口）
2. 导航到发布页
3. 检查登录状态
4. 检查是否需要"继续编辑"
5. 填写标题
6. 填写正文
7. 选择"无文章头图"
8. 点击"AI生成"封面
9. 等待生成完成
10. 验证内容是否还在（如丢失则重新填写）
11. 截图确认
12. 点击"暂存离开"
13. 验证保存成功
```

### 关键检查点
| 步骤 | 检查内容 | 失败处理 |
|------|----------|----------|
| 导航后 | URL 是否正确 | 重新导航 |
| 填标题后 | 字数显示 | 重试填写 |
| 填正文后 | 字数显示 | 重试填写 |
| AI生成后 | 封面是否出现 | 重试或跳过 |
| AI生成后 | 内容是否丢失 | 重新填写 |
| 保存后 | URL 是否变化 | 重试保存 |

### 调试技巧
1. **多用截图**：每个关键步骤后截图，便于排查问题
2. **检查 URL**：URL 是最可靠的状态指示器
3. **验证字数**：字数显示是内容是否成功填入的标志
4. **使用 wait**：页面渲染需要时间，适当增加等待
