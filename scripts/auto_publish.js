const http = require('http');
const fs = require('fs');

// === 文章内容 ===
const TITLE = '🌴 热带生活方式：慢下来，感受阳光与自然';
const SUMMARY = '探索热带生活方式：从饮食、设计到慢生活哲学';

function findTarget(port) {
  return new Promise((resolve) => {
    http.get(`http://127.0.0.1:${port}/json`, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const tabs = JSON.parse(data);
          let tab = tabs.find(t => t.type === 'page' && t.url && (t.url.includes('content/post/article') || t.url.includes('creator.douyin.com')));
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

  // 没找到则启动新Chrome
  console.log('启动新Chrome...');
  const { spawn } = require('child_process');
  const chrome = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
    '--remote-debugging-port=9222',
    `--user-data-dir=${process.env.USERPROFILE}\\.chrome_qclaw_stable`,
    'https://creator.douyin.com/creator-micro/content/post/article?enter_from=publish_page&media_type=article&type=new'
  ], { detached: true, stdio: 'ignore' });
  chrome.unref();

  await new Promise(r => setTimeout(r, 8000));
  for (const p of [9222]) {
    const wsUrl = await findTarget(p);
    if (wsUrl) { console.log(`CDP: ${p}`); await operate(wsUrl); return; }
  }
  console.log('❌ 启动失败');
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
      setTimeout(() => { if (pending[id]) { delete pending[id]; rej(new Error('Timeout: '+m)); } }, 20000);
    });
  }
  function js(expr) { return cdp('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true, timeout: 10000 }); }
  function log(v) { console.log('   ', v); }

  // 确保在发布页
  let url = (await js('window.location.href')).result?.result?.value || '';
  if (!url.includes('content/post/article')) {
    console.log('导航到发布页...');
    await cdp('Page.navigate', { url: 'https://creator.douyin.com/creator-micro/content/post/article?enter_from=publish_page&media_type=article&type=new' });
    await new Promise(r => setTimeout(r, 5000));
  } else {
    console.log('已在发布页');
  }

  console.log('\n1. 填写标题...');
  let r = await js(`(function(){
    var input = document.querySelector('input[placeholder*="标题"]');
    if (!input) return '❌ 未找到标题';
    var set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    set.call(input, '${escapeJS(TITLE)}');
    input.dispatchEvent(new Event('input', {bubbles:true}));
    input.dispatchEvent(new Event('change', {bubbles:true}));
    return '✅ ' + input.value.substring(0,20);
  })()`);
  log(r.result?.result?.value);

  console.log('2. 填写摘要...');
  r = await js(`(function(){
    var input = document.querySelector('input[placeholder*="摘要"]');
    if (!input) return '❌ 未找到摘要';
    var set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    set.call(input, '${escapeJS(SUMMARY)}');
    input.dispatchEvent(new Event('input', {bubbles:true}));
    input.dispatchEvent(new Event('change', {bubbles:true}));
    return '✅';
  })()`);
  log(r.result?.result?.value);

  // 读取正文
  const bodyFile = 'C:\\Users\\菠萝\\.qclaw\\workspace-agent-67effa96\\article_body.txt';
  const bodyText = fs.readFileSync(bodyFile, 'utf-8');
  const paragraphs = bodyText.split('\n').filter(l => l.trim()).map(l => `<p>${escapeJS(l.trim())}</p>`).join('');

  console.log('3. 填写正文...');
  r = await js(`(function(){
    var editor = document.querySelector('.ProseMirror');
    if (!editor) return '❌ 未找到编辑器';
    // 清空后填入
    editor.innerHTML = '${paragraphs}';
    editor.dispatchEvent(new Event('input', {bubbles:true}));
    return '✅ ' + (editor.innerText||'').length + '字';
  })()`);
  log(r.result?.result?.value);

  console.log('4. 选择"有文章头图"...');
  r = await js(`(function(){
    var radios = document.querySelectorAll('input[type="radio"]');
    if (radios.length >= 1) {
      radios[0].checked = true;
      radios[0].dispatchEvent(new Event('change', {bubbles:true}));
      return '✅ 有文章头图';
    }
    return '⏭';
  })()`);
  log(r.result?.result?.value);

  await new Promise(r => setTimeout(r, 500));

  console.log('5. 点击"AI生成"...');
  r = await js(`(function(){
    var all = document.querySelectorAll('div, span, button');
    for(var e of all) {
      if(e.innerText && e.innerText.trim() === 'AI生成') {
        e.scrollIntoView({behavior:'instant', block:'center'});
        setTimeout(function(){
          e.dispatchEvent(new MouseEvent('mousedown', {bubbles:true,cancelable:true,view:window}));
          e.dispatchEvent(new MouseEvent('mouseup', {bubbles:true,cancelable:true,view:window}));
          e.dispatchEvent(new MouseEvent('click', {bubbles:true,cancelable:true,view:window}));
        }, 200);
        return '✅ 已点击';
      }
    }
    return '❌ 未找到';
  })()`);
  const aiClickResult = r.result?.result?.value || '';
  log(aiClickResult);

  if (aiClickResult.includes('✅')) {
    console.log('6. 等待 AI 生成封面（确认不再生成中为止）...');
    for (let i = 0; i < 20; i++) {
      await new Promise(r => setTimeout(r, 2000));
      const check = await js(`
        document.body.innerText.includes('AI智能生成中') ? '生成中...' : '生成完成'
      `);
      const status = check.result?.result?.value || 'unknown';
      process.stdout.write(`   第${i+1}次检查: ${status}\n`);
      if (status.includes('完成')) break;
    }
  }

  // 检测发布按钮并点击
  console.log('\n7. 查找发布按钮...');
  r = await js(`(function(){
    var all = document.querySelectorAll('button, div[role="button"], div, span');
    var btns = [];
    for(var e of all) {
      var t = e.innerText || '';
      if(t.includes('发布') || t.includes('发 布') || t.includes('高清发布')) {
        btns.push({tag:e.tagName, text:t.trim().substring(0,15), clazz:(e.className||'').substring(0,30)});
      }
    }
    return JSON.stringify(btns);
  })()`);
  const btnInfo = JSON.parse(r.result?.result?.value || '[]');
  console.log('   找到发布按钮:', btnInfo.length, '个');
  btnInfo.forEach(b => console.log('     ', b.tag, b.text, b.clazz));

  // 点击第一个"发布"或"高清发布"
  console.log('8. 点击发布按钮...');
  r = await js(`(function(){
    var all = document.querySelectorAll('button, div[role="button"]');
    // 优先点"高清发布" -> "发布"
    for(var label of ['高清发布', '发布', '发 布']) {
      for(var e of all) {
        if(e.innerText && e.innerText.trim() === label) {
          e.scrollIntoView({behavior:'instant', block:'center'});
          setTimeout(function(){
            e.dispatchEvent(new MouseEvent('mousedown', {bubbles:true,cancelable:true,view:window}));
            e.dispatchEvent(new MouseEvent('mouseup', {bubbles:true,cancelable:true,view:window}));
            e.dispatchEvent(new MouseEvent('click', {bubbles:true,cancelable:true,view:window}));
          }, 200);
          return '✅ 点击: ' + label;
        }
      }
    }
    return '❌ 未找到发布按钮';
  })()`);
  log(r.result?.result?.value);

  // 等待发布完成
  await new Promise(r => setTimeout(r, 3000));

  // 截图最终状态
  console.log('9. 最终截图...');
  const ss = await cdp('Page.captureScreenshot', { format: 'png', fromSurface: true });
  if (ss?.result?.data) {
    const buf = Buffer.from(ss.result.data, 'base64');
    fs.writeFileSync('C:\\Users\\菠萝\\.qclaw\\workspace-agent-67effa96\\dy_publish_result.png', buf);
    console.log('   ✅ 截图已保存');
  }

  // 检查是否发布成功
  const resultUrl = await js('window.location.href');
  const resultTitle = await js('document.title');
  console.log('\n   当前URL:', resultUrl.result?.result?.value?.substring(0, 80) || '');
  console.log('   页面标题:', resultTitle.result?.result?.value || '');

  console.log('\n=== ✅ 流程结束 ===');
  ws.close();
}

main().catch(e => { console.error('❌', e.message); process.exit(1); });
