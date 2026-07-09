const http = require('http');
const fs = require('fs');

function findTarget(port) {
  return new Promise((resolve) => {
    http.get(`http://127.0.0.1:${port}/json`, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const tabs = JSON.parse(data);
          let tab = tabs.find(t => t.type === 'page' && t.url && t.url.includes('creator.douyin.com'));
          if (tab) resolve(tab.webSocketDebuggerUrl);
          else resolve(null);
        } catch(e) { resolve(null); }
      });
    }).on('error', () => resolve(null));
  });
}

async function main() {
  for (const p of [9222, 9223]) {
    const wsUrl = await findTarget(p);
    if (wsUrl) { await check(wsUrl); return; }
  }
  console.log('❌ 未找到 Chrome');
}

async function check(wsUrl) {
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

  const url = (await js('window.location.href')).result?.result?.value || '';
  console.log('当前:', url.substring(0, 80));

  // 检查页面顶部的所有tab
  const tabs = await js(`(function(){
    var tabs = document.querySelectorAll('[role="tab"], .tab-item, .ant-tabs-tab, .arco-tabs-tab, div[class*="tab"], a[class*="tab"]');
    return JSON.stringify(Array.from(tabs).map(t => ({
      text: t.innerText || '',
      cls: (t.className||'').substring(0,25),
      selected: (t.className||'').includes('active') || t.getAttribute('aria-selected')
    })));
  })()`);
  console.log('Tabs:', tabs.result?.result?.value?.substring(0, 300));

  // 检查页面是否有文章列表
  const list = await js(`(function(){
    var body = document.body.innerText || '';
    // 找作品相关文本
    var lines = body.split('\\n').filter(l => l.includes('作品') || l.includes('文章') || l.includes('审核') || l.includes('热带'));
    return lines.join(' | ').substring(0, 500);
  })()`);
  console.log('页面文本:', list.result?.result?.value?.substring(0, 300));

  // 检查"审核中"tab
  const review = await js(`(function(){
    var all = document.querySelectorAll('div, span, a, button');
    for(var e of all) {
      if(e.innerText && e.innerText.trim() === '审核中') {
        return '找到审核中tab: ' + e.className.substring(0, 30);
      }
    }
    return '未找到';
  })()`);
  console.log('审核中:', review.result?.result?.value);

  // 点击"审核中"看看
  const clickReview = await js(`(function(){
    var all = document.querySelectorAll('div, span, a, button');
    for(var e of all) {
      if(e.innerText && e.innerText.trim() === '审核中') {
        e.click();
        return '已点击';
      }
    }
    return '未找到';
  })()`);
  console.log('点击审核中:', clickReview.result?.result?.value);

  await new Promise(r => setTimeout(r, 2000));

  // 重新检查文本
  const list2 = await js(`(function(){
    var body = document.body.innerText || '';
    var lines = body.split('\\n').filter(l => l.includes('作品') || l.includes('文章') || l.includes('审核') || l.includes('热带'));
    return lines.join(' | ').substring(0, 500);
  })()`);
  console.log('审核中列表:', list2.result?.result?.value?.substring(0, 300));

  const ss = await cdp('Page.captureScreenshot', { format: 'png', fromSurface: true });
  if (ss?.result?.data) {
    const buf = Buffer.from(ss.result.data, 'base64');
    fs.writeFileSync('C:\\Users\\菠萝\\.qclaw\\workspace-agent-67effa96\\dy_publish_result.png', buf);
    console.log('截图 ✅');
  }
  ws.close();
}

main().catch(e => { console.error(e.message); });
