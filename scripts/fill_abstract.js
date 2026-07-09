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
    if (wsUrl) {
      console.log(`✅ CDP 端口: ${p}`);
      await operate(wsUrl);
      return;
    }
  }
  console.log('❌ 未找到 Chrome');
}

async function operate(wsUrl) {
  const ws = new WebSocket(wsUrl);
  await new Promise((ok, fail) => { ws.onopen = ok; ws.onerror = fail; });
  console.log('✅ WebSocket 连接');
  ws.onerror = () => {};

  let mid = 0;
  const pending = {};

  ws.onmessage = (evt) => {
    try {
      const msg = JSON.parse(evt.data);
      if (msg.id !== undefined && pending[msg.id]) { pending[msg.id](msg); delete pending[msg.id]; }
    } catch(e) {}
  };

  function cdp(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = ++mid;
      pending[id] = resolve;
      ws.send(JSON.stringify({ id, method, params }));
      setTimeout(() => { if (pending[id]) { delete pending[id]; reject(new Error(`Timeout: ${method}`)); } }, 10000);
    });
  }

  function evalJS(js) {
    return cdp('Runtime.evaluate', { expression: js, returnByValue: true, awaitPromise: true, timeout: 10000 });
  }

  // 填摘要 - 找所有可能的输入位置
  console.log('\n1. 填充摘要...');
  let r = await evalJS(`(function(){
    // 查找摘要输入区
    var elems = document.querySelectorAll('input, textarea, div[contenteditable]');
    var found = [];
    for(var e of elems) {
      var ph = e.placeholder || '';
      var txt = e.innerText || e.value || '';
      if(ph.includes('摘要') || ph.includes('精彩部分') || ph.includes('吸引')) {
        found.push(e);
      }
    }
    return '摘要元素: ' + found.length;
  })()`);
  console.log('   ', r.result?.result?.value);

  // 更全面的查找
  r = await evalJS(`(function(){
    var inputs = document.querySelectorAll('input');
    var result = [];
    for(var i=0;i<inputs.length;i++) {
      var inp = inputs[i];
      result.push('input#'+i+' ph=[' + (inp.placeholder||'') + '] val=[' + (inp.value||'') + ']');
    }
    var tas = document.querySelectorAll('textarea');
    for(var i=0;i<tas.length;i++) {
      var ta = tas[i];
      result.push('textarea#'+i+' ph=[' + (ta.placeholder||'') + '] val=[' + (ta.value||'') + ']');
    }
    // 查找span/div占位符
    var spans = document.querySelectorAll('span.placeholder, div.placeholder');
    for(var i=0;i<spans.length;i++) {
      result.push('placeholder-elem: ' + (spans[i].innerText||'').substring(0,30));
    }
    return result.join(' | ');
  })()`);
  const info = r.result?.result?.value || '';
  console.log('   ', info);

  // 尝试通过占位符文本触发
  r = await evalJS(`(function(){
    // 点击摘要区域触发输入框
    var labels = document.querySelectorAll('span, div, label');
    for(var e of labels) {
      if(e.innerText && e.innerText.includes('摘要')) {
        e.click();
        return '点击了摘要区域: ' + e.innerText.substring(0,20);
      }
    }
    return '未找到摘要文字';
  })()`);
  console.log('   ', r.result?.result?.value);

  await new Promise(r => setTimeout(r, 1000));

  // 再检查是否有新出现的输入框
  r = await evalJS(`(function(){
    var inputs = document.querySelectorAll('input, textarea');
    var result = [];
    for(var i=0;i<inputs.length;i++) {
      var e = inputs[i];
      result.push('#'+i+' tag='+e.tagName+' ph=['+(e.placeholder||'')+'] val=['+(e.value||'')+']');
    }
    return result.join(' | ');
  })()`);
  console.log('   重新检查:', r.result?.result?.value);

  // 截图
  const ss = await cdp('Page.captureScreenshot', { format: 'png', fromSurface: false });
  if (ss?.result?.data) {
    const fs = require('fs');
    const buf = Buffer.from(ss.result.data, 'base64');
    fs.writeFileSync('C:\\Users\\菠萝\\.qclaw\\workspace-agent-67effa96\\dy_publish_final.png', buf);
    console.log('\n✅ 截图已保存');
  }

  console.log('\n' + '='.repeat(50));
  console.log('✅ 关键内容（标题+正文）已填入，请浏览器手动操作：');
  console.log('   1. 补充摘要和封面（可选但推荐）');
  console.log('   2. 点击"高清发布"按钮发布');
  console.log('='.repeat(50));

  ws.close();
}

main().catch(e => { console.error('❌', e.message); process.exit(1); });
