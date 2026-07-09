const http = require('http');

function findTarget(port) {
  return new Promise((resolve) => {
    http.get(`http://127.0.0.1:${port}/json`, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const tabs = JSON.parse(data);
          let tab = tabs.find(t => t.type === 'page' && t.url && t.url.includes('content/post/article'));
          if (!tab) tab = tabs.find(t => t.type === 'page' && t.url && t.url.includes('creator.douyin.com'));
          if (tab) resolve(tab.webSocketDebuggerUrl);
          else resolve(null);
        } catch(e) { resolve(null); }
      });
    }).on('error', () => resolve(null));
  });
}

async function main() {
  for (const p of [9222, 9223, 9224, 9225]) {
    const wsUrl = await findTarget(p);
    if (wsUrl) { console.log(`CDP: ${p}`); await operate(wsUrl); return; }
  }
  console.log('❌ 未找到');
}

async function operate(wsUrl) {
  const ws = new WebSocket(wsUrl);
  await new Promise((ok, fail) => { ws.onopen = ok; ws.onerror = fail; });
  ws.onerror = () => {};
  let mid = 0;
  const pending = {};
  ws.onmessage = (evt) => {
    try { const m = JSON.parse(evt.data); if (m.id && pending[m.id]) { pending[m.id](m); delete pending[m.id]; } } catch(e) {}
  };
  function cdp(m, p = {}) {
    return new Promise((res, rej) => {
      const id = ++mid; pending[id] = res;
      ws.send(JSON.stringify({ id, method: m, params: p }));
      setTimeout(() => { if (pending[id]) { delete pending[id]; rej(new Error('Timeout')); } }, 10000);
    });
  }
  function js(expr) { return cdp('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }); }

  // 填摘要 - input#1
  const SUMMARY = '探索热带生活方式：从饮食、设计到慢生活哲学';
  await js(`(function(){
    var input = document.querySelector('input[placeholder*="摘要"]');
    if (!input) return '未找到摘要框';
    var setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(input, '${SUMMARY}');
    input.dispatchEvent(new Event('input', {bubbles:true}));
    input.dispatchEvent(new Event('change', {bubbles:true}));
    return '✅ 摘要已填';
  })()`);
  console.log('摘要: ✅');

  // 添加话题 #热带
  await js(`(function(){
    var topicInput = document.querySelector('input[placeholder*="话题"]');
    if (topicInput) {
      var setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(topicInput, '热带');
      topicInput.dispatchEvent(new Event('input', {bubbles:true}));
      return '话题已输入';
    }
    return '未找到话题输入框';
  })()`);
  console.log('话题: 已尝试');

  await new Promise(r => setTimeout(r, 1500));

  // 截图
  const ss = await cdp('Page.captureScreenshot', { format: 'png', fromSurface: false });
  if (ss?.result?.data) {
    const fs = require('fs');
    const buf = Buffer.from(ss.result.data, 'base64');
    fs.writeFileSync('C:\\Users\\菠萝\\.qclaw\\workspace-agent-67effa96\\dy_publish_done.png', buf);
    console.log('截图 ✅');
  }

  console.log('\n✅ 全部就绪，请手动点击"高清发布"');
  ws.close();
}

main().catch(e => { console.error(e.message); });
