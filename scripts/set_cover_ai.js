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

  // 1. 选择"有文章头图" radio
  console.log('1. 切换到"有文章头图"...');
  let r = await js(`(function(){
    var radios = document.querySelectorAll('input[type="radio"]');
    var result = [];
    for(var i=0;i<radios.length;i++) {
      var label = '';
      var parent = radios[i].closest('label');
      if (parent) label = parent.innerText || '';
      if (!label) {
        var sibling = radios[i].nextElementSibling;
        if (sibling) label = sibling.innerText || '';
      }
      result.push('radio#'+i+' checked='+radios[i].checked+' label='+label.substring(0,10));
    }
    return result.join(' | ');
  })()`);
  console.log('   radio列表:', r.result?.result?.value);

  // 选择"有文章头图"（第一个radio）
  r = await js(`(function(){
    var radios = document.querySelectorAll('input[type="radio"]');
    if (radios.length >= 1) {
      // 第一个radio = 有文章头图
      radios[0].checked = true;
      radios[0].dispatchEvent(new Event('change', {bubbles:true}));
      var label = '';
      var parent = radios[0].closest('label');
      if (parent) label = parent.innerText || '';
      var sibling = radios[0].nextElementSibling;
      if (!label && sibling) label = sibling.innerText || '';
      return '已选radio[0], label=' + label.substring(0,15);
    }
    return '无radio';
  })()`);
  console.log('   ', r.result?.result?.value);

  await new Promise(r => setTimeout(r, 1000));

  // 2. 点击"AI生成"按钮
  console.log('2. 点击AI生成...');
  r = await js(`(function(){
    // 直接通过文本查找AI生成按钮
    var all = document.querySelectorAll('div, span, button');
    for(var e of all) {
      if(e.innerText && e.innerText.trim() === 'AI生成') {
        e.scrollIntoView({behavior:'instant', block:'center'});
        setTimeout(function(){
          ['mousedown','mouseup','click'].forEach(function(evt){
            e.dispatchEvent(new MouseEvent(evt, {bubbles:true, cancelable:true, view:window}));
          });
        }, 300);
        return '✅ 已点击AI生成 (tag=' + e.tagName + ' class=' + (e.className||'').substring(0,40) + ')';
      }
    }
    return '❌ 未找到AI生成按钮';
  })()`);
  const clickResult = r.result?.result?.value || '';
  console.log('   ', clickResult);

  // 等待 AI 生成
  console.log('3. 等待AI生成中...');
  await new Promise(r => setTimeout(r, 6000));

  // 截图
  const ss = await cdp('Page.captureScreenshot', { format: 'png', fromSurface: true });
  if (ss?.result?.data) {
    const fs = require('fs');
    const buf = Buffer.from(ss.result.data, 'base64');
    fs.writeFileSync('C:\\Users\\菠萝\\.qclaw\\workspace-agent-67effa96\\dy_publish_done.png', buf);
    console.log('4. 截图 ✅');
  }

  console.log('\n✅ 完成！请查看浏览器中AI生成的封面效果');
  console.log('   如果已经生成完成，点击"高清发布"发布');
  ws.close();
}

main().catch(e => { console.error(e.message); process.exit(1); });
