// 直接通过 CDP 操作抖音发布页面
const WebSocket = require('ws');
const fs = require('fs');
const http = require('http');

// 先检查 ws 模块是否可用
try {
  require.resolve('ws');
} catch(e) {
  console.log('WS模块不可用，尝试使用原生WebSocket');
}

let wsUrl = null;
const ports = [9222, 9223, 9224, 9225];

function discoverPort() {
  return new Promise((resolve) => {
    let idx = 0;
    function tryPort() {
      if (idx >= ports.length) return resolve(null);
      const port = ports[idx++];
      http.get(`http://127.0.0.1:${port}/json`, (res) => {
        let data = '';
        res.on('data', (c) => data += c);
        res.on('end', () => {
          try {
            const tabs = JSON.parse(data);
            // 找创作者中心的页面
            const pageTab = tabs.find(t => t.url && t.url.includes('creator.douyin.com') && t.type === 'page');
            if (pageTab) {
              resolve(pageTab.webSocketDebuggerUrl);
            } else {
              tryPort();
            }
          } catch(e) { tryPort(); }
        });
      }).on('error', () => tryPort());
    }
    tryPort();
  });
}

async function sendCDP(ws, msgId, method, params) {
  return new Promise((resolve, reject) => {
    const id = msgId + 1;
    const listener = (data) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.id === id) {
          ws.removeListener('message', listener);
          resolve(msg.result);
        }
      } catch(e) {}
    };
    ws.on('message', listener);
    ws.send(JSON.stringify({ id, method, params }));
    setTimeout(() => { ws.removeListener('message', listener); reject(new Error(`Timeout: ${method}`)); }, 15000);
  });
}

async function evalJS(ws, msgId, js) {
  const r = await sendCDP(ws, msgId, 'Runtime.evaluate', { expression: js, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) {
    console.log('   JS Error:', r.exceptionDetails.text, r.exceptionDetails.exception?.description || '');
    return null;
  }
  return r.result?.value;
}

async function main() {
  console.log('=== 抖音文章发布 ===\n');

  console.log('1. 探测 Chrome...');
  wsUrl = await discoverPort();
  if (!wsUrl) { console.log('❌ 未找到 Chrome'); process.exit(1); }
  console.log('   ✅ 已连接\n');

  const ws = new WebSocket(wsUrl);
  await new Promise((resolve, reject) => {
    ws.on('open', resolve);
    ws.on('error', reject);
  });

  let msgId = 0;

  // 先导航到发布页
  console.log('2. 导航到文章发布页...');
  await sendCDP(ws, ++msgId, 'Page.navigate', { url: 'https://creator.douyin.com/creator-micro/content/post/article?enter_from=publish_page&media_type=article&type=new' });
  await new Promise(r => setTimeout(r, 3000));

  // 获取页面标题确认
  const title = await evalJS(ws, ++msgId, 'document.title');
  console.log('   页面标题:', title);

  // 检查是否有"我知道了"弹窗或"继续编辑"按钮
  const hasDialog = await evalJS(ws, ++msgId, `(function(){
    var btns = document.querySelectorAll('button, div[role="button"]');
    for(var b of btns) {
      if(b.innerText && b.innerText.includes('我知道了')) return true;
    }
    return false;
  })()`);
  
  if (hasDialog) {
    console.log('   关闭弹窗...');
    await evalJS(ws, ++msgId, `(function(){
      var btns = document.querySelectorAll('button, div[role="button"]');
      for(var b of btns) {
        if(b.innerText && b.innerText.includes('我知道了')) {
          b.click();
          return '已点击';
        }
      }
      return '未找到';
    })()`);
    await new Promise(r => setTimeout(r, 1000));
  }

  // 检查"继续编辑"
  const hasContinue = await evalJS(ws, ++msgId, `(function(){
    var els = document.querySelectorAll('*');
    for(var e of els) {
      if(e.innerText && e.innerText.includes('继续编辑')) return true;
    }
    return false;
  })()`);
  
  if (hasContinue) {
    console.log('   点击"继续编辑"...');
    await evalJS(ws, ++msgId, `(function(){
      var els = document.querySelectorAll('*');
      for(var e of els) {
        if(e.innerText && e.innerText === '继续编辑') {
          e.click();
          return '已点击';
        }
      }
      return '未找到';
    })()`);
    await new Promise(r => setTimeout(r, 2000));
  }

  // === 填充标题 ===
  const bodyFile = process.argv[4] || 'C:\\Users\\菠萝\\.qclaw\\workspace-agent-67effa96\\article_body.txt';
  const bodyText = fs.existsSync(bodyFile) ? fs.readFileSync(bodyFile, 'utf-8') : '';

  const TITLE = process.argv[2] || '🌴 热带生活方式：慢下来，感受阳光与自然';
  const SUMMARY = process.argv[3] || '从饮食、设计到生活哲学，带你感受独特的热带文化魅力';

  console.log('\n3. 填充标题...');
  let r = await evalJS(ws, ++msgId, `(function(){
    var input = document.querySelector('input[placeholder*="标题"]');
    if (!input) return '未找到标题输入框';
    
    // 使用原生value setter
    var nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    nativeSetter.call(input, '${TITLE.replace(/'/g, "\\'").replace(/\\/g, '\\\\')}');
    input.dispatchEvent(new Event('input', {bubbles:true}));
    input.dispatchEvent(new Event('change', {bubbles:true}));
    return '标题已填入: ' + input.value;
  })()`);
  console.log('   ' + r);

  // === 填充摘要 ===
  console.log('\n4. 填充摘要...');
  r = await evalJS(ws, ++msgId, `(function(){
    var ta = document.querySelector('textarea[placeholder*="摘要"]');
    if (!ta) return '未找到摘要输入框';
    var nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
    nativeSetter.call(ta, '${SUMMARY.replace(/'/g, "\\'").replace(/\\/g, '\\\\')}');
    ta.dispatchEvent(new Event('input', {bubbles:true}));
    ta.dispatchEvent(new Event('change', {bubbles:true}));
    return '摘要已填入: ' + ta.value;
  })()`);
  console.log('   ' + r);

  // === 填充正文 ===
  console.log('\n5. 填充正文...');
  // 正文内容 HTML
  const bodyHtml = bodyText.split('\n').filter(l => l.trim()).map(l => `<p>${l.trim()}</p>`).join('');
  r = await evalJS(ws, ++msgId, `(function(){
    var editor = document.querySelector('.ProseMirror');
    if (!editor) return '未找到正文编辑器';
    editor.innerHTML = \`${bodyHtml.replace(/`/g, '\\`').replace(/\$/g, '\\$')}\`;
    editor.dispatchEvent(new Event('input', {bubbles:true}));
    return '正文已填入, 长度: ' + (editor.innerText || '').length + '字';
  })()`);
  console.log('   ' + r);

  // === 选择"无文章头图" ===
  console.log('\n6. 选择"无文章头图"...');
  r = await evalJS(ws, ++msgId, `(function(){
    var radios = document.querySelectorAll('input[type="radio"]');
    if (radios.length >= 2) {
      radios[1].checked = true;
      radios[1].dispatchEvent(new Event('change', {bubbles:true}));
      return '已选择无文章头图';
    }
    return '未找到radio选项';
  })()`);
  console.log('   ' + r);

  // === 点击"AI生成" ===
  console.log('\n7. 点击"AI生成"按钮...');
  r = await evalJS(ws, ++msgId, `(function(){
    // 多种选择器尝试
    var btn = document.querySelector('.aiButton-x4dXs_');
    if (!btn) {
      // 通过文本查找
      var divs = document.querySelectorAll('div, span, button');
      for(var d of divs) {
        if(d.innerText && d.innerText.trim() === 'AI生成') {
          btn = d;
          break;
        }
      }
    }
    if (!btn) return '未找到AI生成按钮';
    
    // 触发点击事件
    btn.dispatchEvent(new MouseEvent('mousedown', {bubbles:true, cancelable:true, view:window}));
    btn.dispatchEvent(new MouseEvent('mouseup', {bubbles:true, cancelable:true, view:window}));
    btn.dispatchEvent(new MouseEvent('click', {bubbles:true, cancelable:true, view:window}));
    return '已点击AI生成按钮' + (btn.className ? ' (class=' + btn.className + ')' : '');
  })()`);
  console.log('   ' + r);

  // 等待AI生成
  console.log('\n8. 等待 AI 生成（5秒）...');
  await new Promise(r => setTimeout(r, 5000));

  // 截图
  console.log('\n9. 截图...');
  const ss = await sendCDP(ws, ++msgId, 'Page.captureScreenshot', { format: 'png' });
  if (ss?.data) {
    fs.writeFileSync('dy_publish_filled.png', Buffer.from(ss.data, 'base64'));
    console.log('   ✅ 截图保存: dy_publish_filled.png');
  }

  // 保存草稿
  console.log('\n10. 点击"暂存离开"...');
  r = await evalJS(ws, ++msgId, `(function(){
    var btns = document.querySelectorAll('button, div[role="button"]');
    for(var b of btns) {
      if(b.innerText && (b.innerText.includes('暂存') || b.innerText.includes('草稿') || b.innerText.includes('离开'))) {
        b.click();
        return '已点击: ' + b.innerText;
      }
    }
    return '未找到暂存离开按钮';
  })()`);
  console.log('   ' + r);

  console.log('\n=== ✅ 内容已全部填写 ===');
  console.log('📢 当前步骤：内容已在浏览器中打开');
  console.log('👉 请你在浏览器中手动点击"发布"按钮完成最终发布');
  console.log('   （因为抖音有安全验证，自动化无法直接触发发布）');

  ws.close();
}

main().catch(e => { console.error('❌ 错误:', e.message); process.exit(1); });
