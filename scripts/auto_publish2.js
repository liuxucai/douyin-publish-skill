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
    if (wsUrl) { await operate(wsUrl); return; }
  }
  // 尝试重启
  const { spawn } = require('child_process');
  const url = 'https://creator.douyin.com/creator-micro/content/post/article?enter_from=publish_page&media_type=article&type=new';
  spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
    '--remote-debugging-port=9222',
    `--user-data-dir=${process.env.USERPROFILE}\\.chrome_qclaw_stable`, url
  ], { detached: true, stdio: 'ignore' }).unref();
  await new Promise(r => setTimeout(r, 10000));

  const wsUrl2 = await findTarget(9222);
  if (wsUrl2) { await operate(wsUrl2); return; }
  console.log('❌ 失败');
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

  const TITLE = '🌴 热带生活方式：慢下来，感受阳光与自然';
  const SUMMARY = '探索热带生活方式：从饮食、设计到慢生活哲学';
  const bodyText = fs.readFileSync('C:\\Users\\菠萝\\.qclaw\\workspace-agent-67effa96\\article_body.txt', 'utf-8');
  const paragraphs = bodyText.split('\n').filter(l => l.trim()).map(l => `<p>${l.trim().replace(/\\/g,'\\\\').replace(/'/g,"\\'").replace(/`/g,'\\`').replace(/\$/g,'\\$').replace(/\n/g,'\\n').replace(/\r/g,'')}</p>`).join('');

  // 先导航到文章发布页
  let url = (await js('window.location.href')).result?.result?.value || '';
  console.log('当前:', url.substring(0, 80));

  if (!url.includes('content/post/article')) {
    console.log('导航到文章发布页...');
    await cdp('Page.navigate', { url: 'https://creator.douyin.com/creator-micro/content/post/article?enter_from=publish_page&media_type=article&type=new' });
    await new Promise(r => setTimeout(r, 6000));
  }

  // 关闭弹窗
  await js(`(function(){
    var all = document.querySelectorAll('button, div[role="button"], span, div');
    for(var e of all) {
      if(e.innerText && e.innerText.includes('我知道了')) { e.click(); return 1; }
      if(e.innerText && e.innerText.trim() === '继续编辑') { e.click(); return 2; }
    }
    return 0;
  })()`);
  await new Promise(r => setTimeout(r, 1500));

  // 填标题
  console.log('1. 标题...');
  await js(`(function(){
    var inp = document.querySelector('input[placeholder*="标题"]');
    if(!inp) return;
    var s = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    s.call(inp, '${TITLE.replace(/'/g,"\\'")}');
    inp.dispatchEvent(new Event('input', {bubbles:true}));
    inp.dispatchEvent(new Event('change', {bubbles:true}));
  })()`);
  console.log('   ✅');

  // 填摘要
  console.log('2. 摘要...');
  await js(`(function(){
    var inp = document.querySelector('input[placeholder*="摘要"]');
    if(!inp) return;
    var s = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    s.call(inp, '${SUMMARY.replace(/'/g,"\\'")}');
    inp.dispatchEvent(new Event('input', {bubbles:true}));
  })()`);
  console.log('   ✅');

  // 填正文
  console.log('3. 正文...');
  await js(`(function(){ var e=document.querySelector('.ProseMirror'); if(e){ e.innerHTML='${paragraphs}'; e.dispatchEvent(new Event('input',{bubbles:true})); } })()`);
  console.log('   ✅');

  await new Promise(r => setTimeout(r, 500));

  // 有文章头图
  console.log('4. 有文章头图...');
  await js(`(function(){ var r=document.querySelectorAll('input[type="radio"]'); if(r.length>=1){ r[0].checked=true; r[0].dispatchEvent(new Event('change',{bubbles:true})); } })()`);
  console.log('   ✅');

  // AI生成
  console.log('5. AI生成...');
  let r = await js(`(function(){
    var all = document.querySelectorAll('div, span, button');
    for(var e of all) {
      if(e.innerText && e.innerText.trim() === 'AI生成') {
        e.scrollIntoView({behavior:'instant', block:'center'});
        setTimeout(function(){
          e.dispatchEvent(new MouseEvent('mousedown', {bubbles:true,cancelable:true,view:window}));
          e.dispatchEvent(new MouseEvent('mouseup', {bubbles:true,cancelable:true,view:window}));
          e.dispatchEvent(new MouseEvent('click', {bubbles:true,cancelable:true,view:window}));
        }, 200);
        return 'ok';
      }
    }
    return 'not found';
  })()`);
  console.log('   ', r.result?.result?.value);

  // 等AI生成
  for (let i = 0; i < 15; i++) {
    await new Promise(r => setTimeout(r, 2000));
    const s = await js(`document.body.innerText.includes('AI智能生成中') ? 'gen' : 'done'`);
    const st = s.result?.result?.value;
    process.stdout.write(`    ${i+1}: ${st}\n`);
    if (st === 'done') break;
  }

  // === 关键：滚动到底部点"发布"按钮而不是导航栏的"高清发布" ===
  console.log('\n6. 滚动到底部...');
  await js(`window.scrollTo(0, document.body.scrollHeight)`);
  await new Promise(r => setTimeout(r, 1000));

  // 查看底部按钮
  r = await js(`(function(){
    var all = document.querySelectorAll('button, div[role="button"], div, span');
    var btns = [];
    for(var e of all) {
      var t = e.innerText || '';
      if(t.trim() === '发布') btns.push({tag:e.tagName, cls:(e.className||'').substring(0,30), rect:JSON.stringify(e.getBoundingClientRect())});
    }
    // 过滤出可见且在屏幕下方的
    return JSON.stringify(btns);
  })()`);
  const btns = JSON.parse(r.result?.result?.value || '[]');
  console.log('   发布按钮:', btns.length);
  btns.forEach((b,i) => console.log(`   ${i}: ${b.tag} ${b.cls} rect=${b.rect}`));

  // 找到不在导航栏的"发布"按钮（导航栏的一般在屏幕顶部）
  console.log('7. 点击真实发布按钮...');
  // 方法：精确点击包含"发布"且不在导航栏区域内，或使用更精确的选择器
  let clickResult = await js(`(function(){
    // 方法1: 找 button 且 class 包含 primary 且 innerText = 发布
    var btns = document.querySelectorAll('button');
    for(var b of btns) {
      if(b.innerText && b.innerText.trim() === '发布' && (b.className || '').includes('primary')) {
        b.scrollIntoView({behavior:'instant', block:'center'});
        setTimeout(function(){b.click();}, 200);
        return 'primary发布:' + b.className.substring(0,30);
      }
    }
    return '';
  })()`);
  let result = clickResult.result?.result?.value;
  if (result) {
    console.log('   已点:', result);
  } else {
    // 方法2：找底部的大号"发布"按钮（非导航栏）
    result = (await js(`(function(){
      var btns = document.querySelectorAll('button');
      // 找位于页面底部的"发布"按钮（y坐标大）
      var candidates = [];
      for(var b of btns) {
        var t = b.innerText || '';
        if(t.trim() === '发布') {
          var r = b.getBoundingClientRect();
          candidates.push({el:b, y:r.y, h:r.height});
        }
      }
      if(candidates.length === 0) return 'no buttons';
      // 选y最大的（最靠底部）
      candidates.sort(function(a,b){return b.y - a.y});
      var target = candidates[0].el;
      target.scrollIntoView({behavior:'instant', block:'center'});
      setTimeout(function(){target.click();}, 200);
      return 'clicked y=' + candidates[0].y + ' h=' + candidates[0].h;
    })()`)).result?.result?.value;
    console.log('   已点:', result);
  }

  await new Promise(r => setTimeout(r, 4000));

  // 截图
  const ss = await cdp('Page.captureScreenshot', { format: 'png', fromSurface: true });
  if (ss?.result?.data) {
    const buf = Buffer.from(ss.result.data, 'base64');
    fs.writeFileSync('C:\\Users\\菠萝\\.qclaw\\workspace-agent-67effa96\\dy_publish_result.png', buf);
  }
  console.log('截图 ✅');

  const finalUrl = await js('window.location.href');
  const finalT = await js('document.title');
  console.log('URL:', finalUrl.result?.result?.value?.substring(0,80));
  console.log('Title:', finalT.result?.result?.value);

  ws.close();
}

main().catch(e => { console.error('❌', e.message); process.exit(1); });
