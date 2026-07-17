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
          const tab = tabs.find(t => t.type === 'page' && t.url && t.url.includes('creator.douyin.com'));
          resolve(tab ? tab.webSocketDebuggerUrl : null);
        } catch (e) { resolve(null); }
      });
    }).on('error', () => resolve(null));
  });
}

async function main() {
  for (const p of [9222, 9223]) {
    const wsUrl = await findTarget(p);
    if (wsUrl) { await check(wsUrl); return; }
  }
  console.log('未找到 Chrome');
}

async function check(wsUrl) {
  const ws = new WebSocket(wsUrl);
  await new Promise((ok, fail) => { ws.onopen = ok; ws.onerror = fail; });
  ws.onerror = () => {};
  let mid = 0;
  const pending = {};
  ws.onmessage = (evt) => {
    try { const m = JSON.parse(evt.data); if (m.id && pending[m.id]) { pending[m.id](m); delete pending[m.id]; } } catch (e) {}
  };
  const cdp = (m, p = {}) => new Promise((res, rej) => {
    const id = ++mid; pending[id] = res;
    ws.send(JSON.stringify({ id, method: m, params: p }));
    setTimeout(() => { if (pending[id]) { delete pending[id]; rej(new Error('Timeout')); } }, 15000);
  });
  const js = (expr) => cdp('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });

  const url = (await js('window.location.href')).result?.result?.value || '';
  console.log('当前:', url.substring(0, 90));

  // 是否仍在编辑页
  if (url.includes('content/post/article')) {
    console.log('状态: 仍在文章编辑页（未跳转，发布可能未成功或被拦截）');
  } else {
    console.log('状态: 已离开编辑页（URL 不含 content/post/article）');
  }

  // 检查页面文本里的关键提示
  const tip = await js(`(function(){
    var t = document.body.innerText || '';
    var hit = ['发布成功','提交成功','内容已发布','审核中','没有选择封面','继续编辑'].filter(k => t.includes(k));
    return JSON.stringify(hit);
  })()`);
  console.log('关键提示:', tip.result?.result?.value);

  // 截图存到脚本目录
  const ss = await cdp('Page.captureScreenshot', { format: 'png', fromSurface: true }).catch(() => null);
  if (ss?.result?.data) {
    fs.writeFileSync(__dirname + '\\dy_publish_result.png', Buffer.from(ss.result.data, 'base64'));
    console.log('截图已保存: dy_publish_result.png');
  }
  ws.close();
}

main().catch(e => { console.error(e.message); });
