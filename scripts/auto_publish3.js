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
  console.log('❌ Chrome 未找到');
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
      const id = ++mid;
      pending[id] = res;
      ws.send(JSON.stringify({ id, method: m, params: p }));
      setTimeout(() => { if (pending[id]) { delete pending[id]; rej(new Error('Timeout')); } }, 20000);
    });
  }
  function js(expr) { return cdp('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true, timeout: 15000 }); }

  const TITLE = '🌴 热带生活方式：慢下来，感受阳光与自然';
  const SUMMARY = '探索热带生活方式：从饮食、设计到慢生活哲学';
  const bodyFile = 'C:\\Users\\菠萝\\.qclaw\\workspace-agent-67effa96\\article_body.txt';
  const bodyText = fs.readFileSync(bodyFile, 'utf-8');

  // 检查当前页
  let url = (await js('window.location.href')).result?.result?.value || '';
  console.log('当前:', url.substring(0,80));

  // 如果在管理页，点击继续编辑找到草稿，或者导航到文章编辑页
  if (url.includes('content/manage')) {
    console.log('在管理页，导航到文章编辑页...');
    await cdp('Page.navigate', { url: 'https://creator.douyin.com/creator-micro/content/post/article?enter_from=publish_page&media_type=article&type=new' });
    await new Promise(r => setTimeout(r, 6000));
  }

  url = (await js('window.location.href')).result?.result?.value || '';
  console.log('当前:', url.substring(0,80));

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
  if (dlg && dlg !== 'none') await new Promise(r => setTimeout(r, 2000));

  // 如果有"继续编辑"，说明有草稿，那内容已经在了，填发布设置然后点发布即可
  if (dlg === 'continue') {
    console.log('检测到草稿，继续编辑...');
    await new Promise(r => setTimeout(r, 3000));
  } else {
    // 没有草稿，全新填写内容
    console.log('新建文章...');

    // 标题
    console.log('1.标题...');
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

    // 有文章头图 + AI生成
    await js(`(function(){var r=document.querySelectorAll('input[type="radio"]');if(r.length>=1){r[0].checked=true;r[0].dispatchEvent(new Event('change',{bubbles:true}));}})()`);
    console.log('标题/摘要/正文/头图 ✅');

    // AI生成
    console.log('AI生成...');
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
      process.stdout.write(`   ${i+1}: ${st}\n`);
      if (st === 'done') break;
    }
  }

  // === 点击"发布"按钮 ===
  // 先找到真实发布按钮位置
  console.log('\n定位发布按钮...');

  // 直接通过DOM找到普通"发布"按钮（不是导航栏的"高清发布"）
  const btnInfo = await js(`(function(){
    var buttons = document.querySelectorAll('button');
    var candidates = [];
    for(var b of buttons) {
      var txt = b.innerText || '';
      if(txt.trim() === '发布') {
        var rect = b.getBoundingClientRect();
        candidates.push({
          id: b.id || '',
          cls: (b.className||'').substring(0,40),
          x: rect.x, y: rect.y,
          w: rect.width, h: rect.height,
          visible: rect.width > 0 && rect.height > 0
        });
      }
    }
    return JSON.stringify(candidates);
  })()`);
  const publishers = JSON.parse(btnInfo.result?.result?.value || '[]');
  console.log(`找到 ${publishers.length} 个"发布"按钮`);
  publishers.forEach((b,i) => console.log(`  ${i}: cls=${b.cls} pos=(${b.x},${b.y}) size=${b.w}x${b.h} visible=${b.visible}`));

  if (publishers.length === 0) {
    console.log('❌ 未找到发布按钮');
    ws.close();
    return;
  }

  // 选择最靠底部且可见的"发布"按钮（排除导航栏）
  // 或者选择class包含primary的
  let targetBtn = publishers.find(b => b.cls.includes('primary'));
  if (!targetBtn) targetBtn = publishers.sort((a,b) => b.y - a.y)[0];

  console.log(`目标按钮: cls=${targetBtn.cls} pos=(${targetBtn.x},${targetBtn.y})`);

  // 多种方式确保点击
  console.log('点击发布...');

  // 方法1: 用CDP Input.dispatchMouseEvent模拟真实点击
  const centerX = Math.round(targetBtn.x + targetBtn.w / 2);
  const centerY = Math.round(targetBtn.y + targetBtn.h / 2);

  await cdp('Input.dispatchMouseEvent', {
    type: 'mousePressed',
    x: centerX,
    y: centerY,
    button: 'left',
    clickCount: 1
  });
  await new Promise(r => setTimeout(r, 100));
  await cdp('Input.dispatchMouseEvent', {
    type: 'mouseReleased',
    x: centerX,
    y: centerY,
    button: 'left',
    clickCount: 1
  });

  console.log(`   鼠标点击: (${centerX}, ${centerY})`);

  await new Promise(r => setTimeout(r, 5000));

  // 截图
  const ss = await cdp('Page.captureScreenshot', { format: 'png', fromSurface: true });
  if (ss?.result?.data) {
    fs.writeFileSync('C:\\Users\\菠萝\\.qclaw\\workspace-agent-67effa96\\dy_publish_result.png', Buffer.from(ss.result.data, 'base64'));
    console.log('截图 ✅');
  }

  const finalUrl = (await js('window.location.href')).result?.result?.value || '';
  const finalT = (await js('document.title')).result?.result?.value || '';
  console.log('\nURL:', finalUrl.substring(0,80));
  console.log('标题:', finalT);

  // 如果是管理页，检查作品数
  if (finalUrl.includes('content/manage')) {
    const count = (await js(`document.body.innerText.includes('共 0 个作品')?'0':'可能有作品'`)).result?.result?.value;
    console.log('作品:', count);
  }

  ws.close();
}

main().catch(e => { console.error('❌', e.message); process.exit(1); });
