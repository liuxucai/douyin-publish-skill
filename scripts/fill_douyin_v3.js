const http = require('http');

// 探测 CDP 端口并获取目标页面
function findTarget(port) {
  return new Promise((resolve) => {
    http.get(`http://127.0.0.1:${port}/json`, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const tabs = JSON.parse(data);
          // 优先找文章发布页
          let tab = tabs.find(t => t.type === 'page' && t.url && t.url.includes('content/post/article'));
          if (!tab) tab = tabs.find(t => t.type === 'page' && t.url && t.url.includes('creator.douyin.com'));
          if (tab) resolve({ wsUrl: tab.webSocketDebuggerUrl, port });
          else resolve(null);
        } catch(e) { resolve(null); }
      });
    }).on('error', () => resolve(null));
  });
}

async function main() {
  for (const p of [9222, 9223, 9224, 9225]) {
    const t = await findTarget(p);
    if (t) {
      console.log(`CDP 端口: ${t.port}`);
      await operate(t.wsUrl);
      return;
    }
  }
  console.log('❌ 未找到 Chrome CDP');
}

function escapeJS(s) {
  return s.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/`/g, '\\`').replace(/\$/g, '\\$').replace(/\n/g, '\\n').replace(/\r/g, '');
}

async function operate(wsUrl) {
  const fs = require('fs');

  const ws = new WebSocket(wsUrl);
  await new Promise((ok, fail) => { ws.onopen = ok; ws.onerror = fail; });
  ws.onerror = () => {};
  console.log('✅ WebSocket 已连接');

  let msgId = 0;
  const pending = {};

  ws.onmessage = (evt) => {
    try {
      const msg = JSON.parse(evt.data);
      if (msg.id !== undefined && pending[msg.id]) {
        pending[msg.id](msg);
        delete pending[msg.id];
      }
    } catch(e) {}
  };

  function cdp(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = ++msgId;
      pending[id] = resolve;
      ws.send(JSON.stringify({ id, method, params }));
      setTimeout(() => {
        if (pending[id]) { delete pending[id]; reject(new Error(`Timeout: ${method}`)); }
      }, 15000);
    });
  }

  function evalJS(js) {
    return cdp('Runtime.evaluate', { expression: js, returnByValue: true, awaitPromise: true, timeout: 10000 });
  }

  // 检查当前页面
  const cur = await evalJS('window.location.href');
  console.log('当前URL:', cur.result?.result?.value?.substring(0, 80) || 'unknown');

  // 如果不在发布页则导航
  let url = cur.result?.result?.value || '';
  if (!url.includes('content/post/article')) {
    console.log('导航到发布页...');
    await cdp('Page.navigate', { url: 'https://creator.douyin.com/creator-micro/content/post/article?enter_from=publish_page&media_type=article&type=new' });
    await new Promise(r => setTimeout(r, 4000));
  }

  // 关闭弹窗
  const dialogR = await evalJS(`(function(){
    var all = document.querySelectorAll('button, div[role="button"], span, div');
    for(var e of all) {
      if(e.innerText && (e.innerText.includes('我知道了') || e.innerText.trim() === '继续编辑')) {
        e.click(); return '已点击: ' + e.innerText.trim().substring(0,10);
      }
    }
    return '无需关闭';
  })()`);
  const dialogV = dialogR.result?.result?.value;
  if (dialogV) console.log('弹窗:', dialogV);
  if (dialogV && dialogV.includes('已点击')) await new Promise(r => setTimeout(r, 2000));

  // 等待页面就绪
  await new Promise(r => setTimeout(r, 1000));

  // === 填标题 ===
  const TITLE = '🌴 热带生活方式：慢下来，感受阳光与自然';
  console.log('\n1. 填写标题...');
  let r = await evalJS(`(function(){
    var input = document.querySelector('input[placeholder*="标题"]');
    if (!input) return '❌ 未找到';
    var setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(input, '${escapeJS(TITLE)}');
    input.dispatchEvent(new Event('input', {bubbles:true}));
    input.dispatchEvent(new Event('change', {bubbles:true}));
    return '✅ ' + (input.value || '').substring(0,30);
  })()`);
  console.log('   ', r.result?.result?.value || 'unknown');

  // === 填摘要 ===
  const SUMMARY = '从饮食、设计到生活哲学，带你感受独特的热带文化魅力';
  console.log('2. 填写摘要...');
  r = await evalJS(`(function(){
    var ta = document.querySelector('textarea');
    if (!ta) return '跳过（无textarea）';
    var setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
    setter.call(ta, '${escapeJS(SUMMARY)}');
    ta.dispatchEvent(new Event('input', {bubbles:true}));
    return '✅';
  })()`);
  console.log('   ', r.result?.result?.value || 'unknown');

  // === 填正文 ===
  const bodyFile = 'C:\\Users\\菠萝\\.qclaw\\workspace-agent-67effa96\\article_body.txt';
  const bodyText = fs.readFileSync(bodyFile, 'utf-8');
  const paragraphs = bodyText.split('\n').filter(l => l.trim()).map(l => `<p>${escapeJS(l.trim())}</p>`).join('');

  console.log('3. 填写正文...');
  r = await evalJS(`(function(){
    var editor = document.querySelector('.ProseMirror');
    if (!editor) return '❌ 未找到编辑器';
    editor.innerHTML = '${paragraphs}';
    editor.dispatchEvent(new Event('input', {bubbles:true}));
    var len = (editor.innerText || '').length;
    return '✅ ' + len + '字';
  })()`);
  console.log('   ', r.result?.result?.value || 'unknown');

  // === 无文章头图 ===
  console.log('4. 设置无文章头图...');
  r = await evalJS(`(function(){
    var radios = document.querySelectorAll('input[type="radio"]');
    if (radios.length >= 2) {
      radios[1].click();
      return '✅ 已选';
    }
    return '⏭';
  })()`);
  console.log('   ', r.result?.result?.value || 'unknown');

  // === AI生成封面 ===
  console.log('5. 点击AI生成封面...');
  r = await evalJS(`(function(){
    var btn = document.querySelector('.aiButton-x4dXs_');
    if (!btn) {
      var all = document.querySelectorAll('div, span, button');
      for(var e of all) {
        if(e.innerText && e.innerText.trim() === 'AI生成') { btn = e; break; }
      }
    }
    if (!btn) return '❌ 未找到';
    btn.click();
    return '✅';
  })()`);
  console.log('   ', r.result?.result?.value || 'unknown');

  // 等待AI
  console.log('6. 等待AI处理(5s)...');
  await new Promise(r => setTimeout(r, 5000));

  // === 截图 ===
  console.log('7. 截图...');
  const ss = await cdp('Page.captureScreenshot', { format: 'png', fromSurface: true });
  if (ss?.result?.data) {
    const buf = Buffer.from(ss.result.data, 'base64');
    fs.writeFileSync('C:\\Users\\菠萝\\.qclaw\\workspace-agent-67effa96\\dy_publish_filled.png', buf);
    console.log('   ✅ 截图已保存');
  }

  console.log('\n' + '='.repeat(50));
  console.log('✅ 内容已全部填写到抖音发布页面！');
  console.log('📌 请手动点击"高清发布"按钮发布。');
  console.log('='.repeat(50));

  ws.close();
}

main().catch(e => {
  console.error('❌', e.message);
  process.exit(1);
});
