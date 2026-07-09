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
  for (const p of [9222]) {
    const wsUrl = await findTarget(p);
    if (wsUrl) { await operate(wsUrl); return; }
  }
  console.log('❌ 未找到 Chrome');
}

function escapeJS(s) {
  return s.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/`/g, '\\`').replace(/\$/g, '\\$').replace(/\n/g, '\\n').replace(/\r/g, '');
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
      setTimeout(() => { if (pending[id]) { delete pending[id]; rej(new Error('Timeout')); } }, 20000);
    });
  }
  function js(expr) { return cdp('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true, timeout: 15000 }); }

  const TITLE = '🌴 热带生活方式：慢下来，感受阳光与自然';
  const SUMMARY = '探索热带生活方式：从饮食、设计到慢生活哲学';
  const bodyText = fs.readFileSync('C:\\Users\\菠萝\\.qclaw\\workspace-agent-67effa96\\article_body.txt', 'utf-8');

  let url = (await js('window.location.href')).result?.result?.value || '';
  console.log('当前:', url.substring(0,80));

  if (!url.includes('content/post/article')) {
    await cdp('Page.navigate', { url: 'https://creator.douyin.com/creator-micro/content/post/article?enter_from=publish_page&media_type=article&type=new' });
    await new Promise(r => setTimeout(r, 6000));
  }

  url = (await js('window.location.href')).result?.result?.value || '';
  console.log('在:', url.substring(0,60));

  // 关闭弹窗
  let dlg = (await js(`(function(){
    var all = document.querySelectorAll('button, div[role="button"], span, div');
    for(var e of all) {
      if(e.innerText && e.innerText.includes('我知道了')) { e.click(); return 'closed'; }
      if(e.innerText && e.innerText.trim() === '继续编辑') { e.click(); return 'continue'; }
    }
    return 'none';
  })()`)).result?.result?.value;
  console.log('弹窗:', dlg);
  if (dlg !== 'none') await new Promise(r => setTimeout(r, 2000));

  // 如果有"继续编辑"说明有草稿，只需点发布
  if (dlg !== 'continue') {
    console.log('填内容...');
    // 标题
    await js(`(function(){
      var inp = document.querySelector('input[placeholder*="标题"]');
      if(!inp) return;
      var s = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      s.call(inp, '${escapeJS(TITLE)}');
      inp.dispatchEvent(new Event('input', {bubbles:true}));
      inp.dispatchEvent(new Event('change', {bubbles:true}));
    })()`);

    // 摘要
    await js(`(function(){
      var inp = document.querySelector('input[placeholder*="摘要"]');
      if(!inp) return;
      var s = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      s.call(inp, '${escapeJS(SUMMARY)}');
      inp.dispatchEvent(new Event('input', {bubbles:true}));
    })()`);

    // 正文
    const lines = bodyText.split('\n').filter(l => l.trim());
    const paragraphs = lines.map(l => `<p>${escapeJS(l.trim())}</p>`).join('');
    await js(`(function(){var e=document.querySelector('.ProseMirror');if(e){e.innerHTML='${paragraphs}';e.dispatchEvent(new Event('input',{bubbles:true}));}})()`);

    await new Promise(r => setTimeout(r, 500));

    // 有文章头图
    await js(`(function(){var r=document.querySelectorAll('input[type="radio"]');if(r.length>=1){r[0].checked=true;r[0].dispatchEvent(new Event('change',{bubbles:true}));}})()`);

    // AI生成
    await js(`(function(){
      var all = document.querySelectorAll('div, span, button');
      for(var e of all) {
        if(e.innerText && e.innerText.trim() === 'AI生成') {
          e.scrollIntoView({behavior:'instant',block:'center'});
          setTimeout(function(){e.click();},200);
          return;
        }
      }
    })()`);

    for (let i = 0; i < 10; i++) {
      await new Promise(r => setTimeout(r, 2000));
      const st = (await js(`document.body.innerText.includes('AI智能生成中')?'gen':'done'`)).result?.result?.value;
      process.stdout.write(`   AI: ${i+1}/${st}\n`);
      if (st === 'done') break;
    }
    console.log('内容 ✅');
  }

  // === 核心：用 JS click() 而不是 CDP 鼠标事件 ===
  console.log('\n点击发布...');

  const clickResult = await js(`(function(){
    // 精确匹配: button, innerText=发布, class包含primary
    var btns = document.querySelectorAll('button');
    for(var b of btns) {
      if(b.innerText && b.innerText.trim() === '发布' && (b.className||'').includes('primary')) {
        // 用原生click模拟
        b.scrollIntoView({behavior:'instant', block:'center'});
        return 'found btn primary';
      }
    }
    return 'not found primary';
  })()`);
  console.log('查找结果:', clickResult.result?.result?.value);

  // 用JS click
  const clickJS = await js(`(function(){
    var btns = document.querySelectorAll('button');
    for(var b of btns) {
      if(b.innerText && b.innerText.trim() === '发布' && (b.className||'').includes('primary')) {
        b.click();
        return 'JS clicked';
      }
    }
    // fallback: 按文本精确查找
    var all = document.querySelectorAll('*');
    for(var e of all) {
      if(e.tagName === 'BUTTON' && e.innerText && e.innerText.trim() === '发布') {
        e.click();
        return 'JS clicked fallback';
      }
    }
    return 'nothing clicked';
  })()`);
  console.log('点击:', clickJS.result?.result?.value);

  await new Promise(r => setTimeout(r, 5000));

  const finalUrl = (await js('window.location.href')).result?.result?.value || '';
  const finalT = (await js('document.title')).result?.result?.value || '';
  console.log('URL:', finalUrl.substring(0,70));
  console.log('标题:', finalT);

  const ss = await cdp('Page.captureScreenshot', { format: 'png', fromSurface: true });
  if (ss?.result?.data) {
    fs.writeFileSync('C:\\Users\\菠萝\\.qclaw\\workspace-agent-67effa96\\dy_publish_result.png', Buffer.from(ss.result.data, 'base64'));
    console.log('截图 ✅');
  }

  if (finalUrl.includes('content/manage')) {
    const c = (await js(`document.body.innerText.includes('共 0 个作品')?'0':'可能有作品'`)).result?.result?.value;
    console.log('作品:', c);
  }

  ws.close();
}

main().catch(e => { console.error('❌', e.message); process.exit(1); });
