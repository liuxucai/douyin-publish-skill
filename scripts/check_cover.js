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
      setTimeout(() => { if (pending[id]) { delete pending[id]; rej(new Error('Timeout')); } }, 15000);
    });
  }
  function js(expr) { return cdp('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }); }

  // 检查AI生成状态
  const status = await js(`(function(){
    // 检查页面文本状态
    var body = document.body.innerText || '';
    var lines = body.split('\\n').filter(l => l.includes('AI') || l.includes('生成') || l.includes('封面') || l.includes('头图'));
    return lines.slice(0, 5).join(' | ');
  })()`);
  console.log('状态文本:', status.result?.result?.value || '');

  // 检查是否有AI生成的图片结果
  const aiDone = await js(`(function(){
    var imgs = document.querySelectorAll('img');
    var found = [];
    for(var i=0;i<imgs.length;i++) {
      var src = imgs[i].src || '';
      if(src.startsWith('blob:') || src.startsWith('data:')) {
        found.push('img#'+i+' blob');
      }
    }
    return 'blob图片: ' + found.length;
  })()`);
  console.log(aiDone.result?.result?.value || '');

  // 看看是否有"生成中"文本消失
  const topText = await js(`document.querySelector('.article-title-input-SZtIs_') ? '有标题输入框' : '无标题输入框'`);
  console.log('顶部:', topText.result?.result?.value);

  // 截图
  const ss = await cdp('Page.captureScreenshot', { format: 'png', fromSurface: true });
  if (ss?.result?.data) {
    const fs = require('fs');
    const buf = Buffer.from(ss.result.data, 'base64');
    fs.writeFileSync('C:\\Users\\菠萝\\.qclaw\\workspace-agent-67effa96\\dy_publish_done.png', buf);
    console.log('截图 ✅');
  }
  ws.close();
}

main().catch(e => { console.error(e.message); });
