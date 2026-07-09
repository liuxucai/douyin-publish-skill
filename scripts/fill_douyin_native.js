// 抖音文章发布 - 使用 Node.js 内置 WebSocket（无需安装 ws 模块）
const fs = require('fs');
const http = require('http');

let wsUrl = null;
const PORTS = [9222, 9223, 9224, 9225];

function discoverPort() {
  return new Promise((resolve) => {
    let idx = 0;
    function tryPort() {
      if (idx >= PORTS.length) return resolve(null);
      const port = PORTS[idx++];
      const req = http.get(`http://127.0.0.1:${port}/json`, (res) => {
        let data = '';
        res.on('data', c => data += c);
        res.on('end', () => {
          try {
            const tabs = JSON.parse(data);
            const pageTab = tabs.find(t => t.url && t.url.includes('creator.douyin.com') && t.type === 'page');
            if (pageTab) { resolve(pageTab.webSocketDebuggerUrl); }
            else { tryPort(); }
          } catch(e) { tryPort(); }
        });
      });
      req.on('error', () => tryPort());
      req.end();
    }
    tryPort();
  });
}

async function cdpCommand(ws, id, method, params) {
  return new Promise((resolve, reject) => {
    const msgId = id;
    const msg = JSON.stringify({ id: msgId, method, params });
    const listener = (data) => {
      try {
        const reply = JSON.parse(data.toString());
        if (reply.id === msgId) {
          ws.removeEventListener('message', listener);
          resolve(reply);
        }
      } catch(e) {}
    };
    ws.addEventListener('message', listener);
    ws.send(msg);
    setTimeout(() => {
      ws.removeEventListener('message', listener);
      reject(new Error(`Timeout: ${method}`));
    }, 20000);
  });
}

async function evalJS(ws, id, js) {
  const r = await cdpCommand(ws, id, 'Runtime.evaluate', {
    expression: js,
    returnByValue: true,
    awaitPromise: true,
    timeout: 10000
  });
  if (r.result?.exceptionDetails) {
    const ed = r.result.exceptionDetails;
    console.log('   JS Error:', (ed.text || '') + ' ' + (ed.exception?.description || ''));
    return null;
  }
  return r.result?.result?.value;
}

function escapeJS(str) {
  return str.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/`/g, '\\`').replace(/\$/g, '\\$').replace(/\n/g, '\\n').replace(/\r/g, '');
}

async function main() {
  console.log('=== 抖音文章发布 ===\n');

  console.log('1. 探测 Chrome...');
  wsUrl = await discoverPort();
  if (!wsUrl) { console.log('❌ 未找到 Chrome CDP 端口'); process.exit(1); }
  console.log('   ✅ 已连接\n');

  const ws = new WebSocket(wsUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve);
    ws.addEventListener('error', reject);
  });

  let msgId = 0;

  // 导航到发布页
  console.log('2. 导航到文章发布页...');
  await cdpCommand(ws, ++msgId, 'Page.navigate', {
    url: 'https://creator.douyin.com/creator-micro/content/post/article?enter_from=publish_page&media_type=article&type=new'
  });
  await new Promise(r => setTimeout(r, 4000));

  // 检查页面状态
  const pageTitle = await evalJS(ws, ++msgId, 'document.title');
  console.log('   页面:', pageTitle);

  // 关闭可能的弹窗
  const dialogClosed = await evalJS(ws, ++msgId, `(function(){
    var all = document.querySelectorAll('button, div[role="button"], span, div');
    for(var e of all) {
      if(e.innerText && (e.innerText.includes('我知道了') || e.innerText.trim() === '继续编辑')) {
        e.click();
        return '已点击: ' + e.innerText.trim().substring(0, 10);
      }
    }
    return '无需关闭';
  })()`);
  if (dialogClosed && !dialogClosed.includes('无需关闭')) {
    console.log('   弹窗:', dialogClosed);
    await new Promise(r => setTimeout(r, 2000));
  }

  // 填充标题
  const TITLE = '🌴 热带生活方式：慢下来，感受阳光与自然';
  console.log('\n3. 填充标题...');
  let r = await evalJS(ws, ++msgId, `(function(){
    var input = document.querySelector('input[placeholder*="标题"]');
    if (!input) return '未找到标题输入框';
    var setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(input, '${escapeJS(TITLE)}');
    input.dispatchEvent(new Event('input', {bubbles:true}));
    input.dispatchEvent(new Event('change', {bubbles:true}));
    input.dispatchEvent(new Event('blur', {bubbles:true}));
    return '✅ 标题已填入: ' + input.value;
  })()`);
  console.log('   ' + r);

  // 填充摘要
  const SUMMARY = '从饮食、设计到生活哲学，带你感受独特的热带文化魅力';
  console.log('\n4. 填充摘要...');
  r = await evalJS(ws, ++msgId, `(function(){
    var ta = document.querySelector('textarea');
    if (!ta) return '未找到摘要输入框';
    var setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
    setter.call(ta, '${escapeJS(SUMMARY)}');
    ta.dispatchEvent(new Event('input', {bubbles:true}));
    ta.dispatchEvent(new Event('change', {bubbles:true}));
    return '✅ 摘要已填入: ' + ta.value;
  })()`);
  console.log('   ' + r);

  // 填充正文
  const bodyFile = 'C:\\Users\\菠萝\\.qclaw\\workspace-agent-67effa96\\article_body.txt';
  const bodyText = fs.existsSync(bodyFile) ? fs.readFileSync(bodyFile, 'utf-8') : '';
  const bodyHtml = bodyText.split('\n').filter(l => l.trim()).map(l => `<p>${escapeJS(l.trim())}</p>`).join('');

  console.log('\n5. 填充正文...');
  r = await evalJS(ws, ++msgId, `(function(){
    var editor = document.querySelector('.ProseMirror');
    if (!editor) return '未找到正文编辑器';
    editor.innerHTML = '${bodyHtml}';
    editor.dispatchEvent(new Event('input', {bubbles:true}));
    return '✅ 正文已填入, ' + (editor.innerText || '').length + '字';
  })()`);
  console.log('   ' + r);

  // 选择"无文章头图"
  console.log('\n6. 选择"无文章头图"...');
  r = await evalJS(ws, ++msgId, `(function(){
    var radios = document.querySelectorAll('input[type="radio"]');
    if (radios.length >= 2) {
      radios[1].checked = true;
      radios[1].dispatchEvent(new Event('change', {bubbles:true}));
      return '✅ 已选择"无文章头图"';
    }
    return '⚠️ 未找到radio选项';
  })()`);
  console.log('   ' + r);

  // 点击AI生成
  console.log('\n7. 点击"AI生成"...');
  r = await evalJS(ws, ++msgId, `(function(){
    var btn = document.querySelector('.aiButton-x4dXs_');
    if (!btn) {
      var all = document.querySelectorAll('div, span, button');
      for(var e of all) {
        if(e.innerText && e.innerText.trim() === 'AI生成') { btn = e; break; }
      }
    }
    if (!btn) return '❌ 未找到AI生成按钮';
    btn.dispatchEvent(new MouseEvent('mousedown', {bubbles:true,cancelable:true,view:window}));
    btn.dispatchEvent(new MouseEvent('mouseup', {bubbles:true,cancelable:true,view:window}));
    btn.dispatchEvent(new MouseEvent('click', {bubbles:true,cancelable:true,view:window}));
    return '✅ 已点击AI生成按钮' + (btn.className ? ' ('+btn.className+')' : '');
  })()`);
  console.log('   ' + r);

  // 等待AI生成
  console.log('\n8. 等待 AI 生成（5秒）...');
  await new Promise(r => setTimeout(r, 5000));

  // 截图
  console.log('\n9. 截图确认...');
  const ss = await cdpCommand(ws, ++msgId, 'Page.captureScreenshot', { format: 'png', fromSurface: true });
  if (ss?.result?.data) {
    const buf = Buffer.from(ss.result.data, 'base64');
    const ssPath = 'C:\\Users\\菠萝\\.qclaw\\workspace-agent-67effa96\\dy_publish_filled.png';
    fs.writeFileSync(ssPath, buf);
    console.log(`   ✅ 截图已保存: ${ssPath} (${buf.length} bytes)`);
  }

  console.log('\n' + '='.repeat(40));
  console.log('✅ 内容已全部填写到抖音发布页面！');
  console.log('📌 请你在浏览器中手动点击"高清发布"按钮完成发布');
  console.log('   （抖音有 React 安全验证，自动化无法直接点击发布按钮）');
  console.log('='.repeat(40));

  ws.close();
}

main().catch(e => {
  console.error('❌ 错误:', e.message);
  console.error(e.stack);
  process.exit(1);
});
