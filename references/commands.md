# xb CLI 命令参考（抖音场景）

## 基本操作

```bash
# 打开发布页（URL 中 & 需用反引号转义，或用双引号括起来）
node xb.cjs run --browser chrome open "https://creator.douyin.com/creator-micro/content/post/article?enter_from=publish_page"

# 等待网络空闲
node xb.cjs run --browser chrome wait --load networkidle

# 获取快照（含可交互元素，-c=compact，-d=depth）
node xb.cjs run --browser chrome snapshot -i -c -d 4

# 截图
node xb.cjs run --browser chrome screenshot

# 点击元素（@ref 来自 snapshot 输出）
node xb.cjs run --browser chrome click @e44

# 填写表单
node xb.cjs run --browser chrome fill @e46 "标题内容"

# 执行 JS（通过 base64 传入）
node xb.cjs run --browser chrome eval --base64 "<base64>"
```

## 关键 ref 编号（发布页，e44 = 发布按钮）

| ref | 元素 | 用途 |
|-----|------|------|
| e28 | generic "15/30" | 标题字数区 |
| e46 | textbox 标题输入 | 填标题 |
| e47 | textbox 摘要输入 | 填摘要 |
| e48 | textbox 正文输入 | 填正文（ProseMirror） |
| e42 | checkbox 立即发布 | 发布时机 |
| e44 | button "发布" | 发布按钮（点击无效！） |
| e45 | button 暂存离开 | 离开页面 |

## Node.js 封装调用方式

```js
const XB = 'F:\\qclaw\\v0.2.23.532\\resources\\openclaw\\config\\skills\\xbrowser\\scripts\\xb.cjs';

function xb(args, timeout) {
  return new Promise((resolve, reject) => {
    const { spawn } = require('child_process');
    const out = [];
    const proc = spawn('node', [XB, ...args], { windowsHide: true });
    proc.stdout.on('data', d => out.push(d));
    proc.on('close', () => {
      try { resolve(JSON.parse(out.join(''))); }
      catch(e) { reject(e); }
    });
    proc.on('error', reject);
    setTimeout(() => { try { proc.kill(); } catch(e){} reject(new Error('timeout')); }, timeout || 20000);
  });
}

// 示例
const r = await xb(['run', '--browser', 'chrome', 'eval', '--base64', b64]);
const result = r.data.result.data.result; // 三层嵌套！
```

## PowerShell base64 技巧

```powershell
# Node.js 生成 base64（解决 PowerShell `$` 和引号转义问题）
$b = node b64_helper.js my_script.js
node xb.cjs run --browser chrome eval --base64 "$b"

# 或者不用 helper，直接在 Node.js 里 encode
$b = [System.Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($content))
```

## 返回值结构

xb 返回 JSON：
```json
{
  "ok": true,
  "command": "run",
  "data": {
    "browser_command": "eval --base64 ...",
    "result": {
      "success": true,
      "data": { "result": "实际JS返回值", "origin": "页面URL" },
      "error": null
    }
  }
}
```

**eval 结果取法**：`r.data.result.data.result`（三层 data！）

## eval --base64 注意事项

- 所有 JS 代码通过 base64 传入，避免 PowerShell 特殊字符干扰
- `var` 声明**可以**在 eval 中使用
- 不支持 `&&` 作为语句分隔符作为独立命令（PowerShell 解析问题）
- 超过 ~2000 字符的 JS 建议写文件后用 `b64_helper.js` 编码
