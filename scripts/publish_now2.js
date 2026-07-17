'use strict';
/**
 * 抖音文章发布 - 纯 CDP 驱动（零依赖：使用 Node v22 内置全局 WebSocket）
 * 流程: 复用到发布页 -> 填标题/摘要/正文 -> 若封面未生成则真鼠标点右侧「AI生成」并轮询至出现
 *       -> 滚动后真鼠标点「发布」 -> 校验离开编辑页
 *
 * 依赖文件：
 *   - article_job.txt ：待发布内容（标题/摘要/正文），与本脚本同目录
 *   - 浏览器：isolated-browser skill 拉起的隔离 Chrome（profile ~/.chrome_qclaw_stable，端口 9222，已登录抖音）
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const SKILL_DIR = __dirname;
const JOB_FILE = path.join(SKILL_DIR, 'article_job.txt');
const POST_URL = 'https://creator.douyin.com/creator-micro/content/post/article?enter_from=publish_page&media_type=article&type=new';

// Node v22 内置全局 WebSocket（无需安装 ws 模块）
const WS = global.WebSocket;

function parseJob(text) {
  const lines = text.split(/\r?\n/);
  let title = '', summary = '', body = '', inBody = false;
  for (const raw of lines) {
    const line = raw.replace(/^﻿/, '');
    if (/^标题[：:]/.test(line)) { title = line.replace(/^标题[：:]\s*/, '').trim(); continue; }
    if (/^摘要[：:]/.test(line)) { summary = line.replace(/^摘要[：:]\s*/, '').trim(); continue; }
    if (/^正文[：:]/.test(line)) { inBody = true; body += line.replace(/^正文[：:]\s*/, '').trim() + '\n'; continue; }
    if (inBody) body += line + '\n';
  }
  return { title: title.trim(), summary: summary.trim(), body: body.trim() };
}
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function cdpGet(p) {
  return new Promise((res, rej) => {
    http.get({ host: '127.0.0.1', port: 9222, path: p }, r => {
      let d = ''; r.on('data', c => d += c);
      r.on('end', () => { try { res(JSON.parse(d)); } catch (e) { rej(e); } });
    }).on('error', rej);
  });
}

class CDP {
  constructor(url) { this.url = url; this.ws = null; this.p = {}; this.id = 0; }
  connect() {
    return new Promise((a, b) => {
      const ws = new WS(this.url);
      this.ws = ws;
      ws.onopen = () => a();
      ws.onerror = (e) => b(e.error || new Error('ws error'));
      ws.onmessage = (ev) => {
        const j = JSON.parse(ev.data);
        if (j.id && this.p[j.id]) { this.p[j.id](j.result); delete this.p[j.id]; }
      };
    });
  }
  send(m, pr, t = 15000) {
    return new Promise((a, b) => {
      const id = ++this.id; this.p[id] = a;
      try { this.ws.send(JSON.stringify({ id, method: m, params: pr || {} })); }
      catch (e) { delete this.p[id]; return b(e); }
      setTimeout(() => { if (this.p[id]) { delete this.p[id]; b(new Error('timeout:' + m)); } }, t);
    });
  }
  eval(expr) {
    return this.send('Runtime.evaluate', { expression: expr, returnByValue: true })
      .then(r => {
        if (r.exceptionDetails) throw new Error('EVAL:' + (r.exceptionDetails.exception && r.exceptionDetails.exception.description || r.exceptionDetails.text));
        return r.result && r.result.value;
      });
  }
  async box(sel) {
    const { root } = await this.send('DOM.getDocument', { depth: -1 });
    const { nodeId } = await this.send('DOM.querySelector', { nodeId: root.nodeId, selector: sel });
    if (!nodeId) return null;
    const { model } = await this.send('DOM.getBoxModel', { nodeId });
    if (!model) return null;
    const q = model.content;
    return { x: Math.round((q[0] + q[2]) / 2), y: Math.round((q[1] + q[5]) / 2) };
  }
  async clickXY(x, y) {
    await this.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
    await sleep(90);
    await this.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
  }
}
async function getWs() {
  const t = await cdpGet('/json');
  const m = t.find(x => x.type === 'page' && x.url && x.url.includes('douyin.com') && x.webSocketDebuggerUrl);
  return m ? m.webSocketDebuggerUrl : null;
}

const COVER_CHECK = `(function(){var w=[].slice.call(document.querySelectorAll('*')).find(e=>/文章头图/.test(e.innerText||'')&&e.innerText.length<400);if(!w)return {ok:false};var img=w.querySelector('img');var bgEl=w.querySelector('[class*=img],[class*=cover],[class*=preview]')||w;var bg=getComputedStyle(bgEl).backgroundImage||'';return {ok:(img&&!/^data:/.test(img.src))||/url\\("https?:/.test(bg),bg:bg.slice(0,50)};})()`;
const AI_COORD = `JSON.stringify((function(){var els=[].slice.call(document.querySelectorAll('*')).filter(e=>(/AI生成|AI 生成/).test(e.innerText||'')&&!Array.from(e.childNodes).some(n=>n.nodeType===1&&(/AI生成|AI 生成/).test(n.innerText||'')));if(!els[0])return null;els[0].scrollIntoView({block:'center'});var r=els[0].getBoundingClientRect();return {x:Math.round((r.left+r.right)/2),y:Math.round((r.top+r.bottom)/2)};})())`;

(async function () {
  console.log('=== 抖音发布 ===');
  if (!fs.existsSync(JOB_FILE)) { console.log('ERR: 缺少 article_job.txt'); process.exit(3); }
  const job = parseJob(fs.readFileSync(JOB_FILE, 'utf8'));
  console.log('主题:', job.title.slice(0, 18), '正文', job.body.length, '字');

  const ws = await getWs();
  if (!ws) { console.log('ERR: 无 douyin 标签页（请先启动隔离 Chrome 并打开发布页）'); process.exit(3); }

  const c = new CDP(ws);
  await c.connect();
  await c.send('Runtime.enable');
  await c.send('DOM.enable');

  const cur = await c.eval('location.href');
  if (!cur || !cur.includes('content/post/article')) {
    console.log('导航...');
    await c.send('Page.navigate', { url: POST_URL });
    await sleep(3000);
  }
  let ok = false;
  for (let i = 0; i < 40; i++) {
    if (await c.eval('!!document.querySelector(\'input[placeholder*="文章标题"]\')').catch(() => false)) { ok = true; break; }
    await sleep(1000);
  }
  if (!ok) { console.log('ERR: 标题框未出现'); process.exit(2); }

  // 填标题
  await c.eval(`(function(){var e=document.querySelector('input[placeholder*="文章标题"]');if(!e)return;var s=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;s.call(e,${JSON.stringify(job.title)});['input','change','blur'].forEach(ev=>e.dispatchEvent(new Event(ev,{bubbles:true})));})()`);
  await sleep(400);
  // 填摘要（input[maxlength=30]，非 textarea）
  await c.eval(`(function(){var all=document.querySelectorAll('input');var e=null;for(var i=0;i<all.length;i++){if(all[i].placeholder&&all[i].placeholder.indexOf('摘要')>=0){e=all[i];break;}}if(!e)return;var s=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;s.call(e,${JSON.stringify(job.summary)});['input','change','blur'].forEach(ev=>e.dispatchEvent(new Event(ev,{bubbles:true})));})()`);
  await sleep(400);
  // 填正文 ProseMirror
  const paras = job.body.split(/\n{2,}/).map(p => p.trim()).filter(p => p);
  await c.eval(`(function(){var pm=document.querySelector('.ProseMirror[contenteditable="true"]');if(!pm)return;pm.focus();var paras=${JSON.stringify(paras)};var esc=function(s){return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\\n/g,'<br>');};pm.innerHTML=paras.map(function(p){return '<p>'+esc(p)+'</p>';}).join('');pm.dispatchEvent(new InputEvent('beforeinput',{inputType:'insertFromPaste',bubbles:true,cancelable:true}));pm.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  await sleep(800);

  // 封面：未生成则点 AI生成并轮询
  let cover = await c.eval(COVER_CHECK);
  console.log('封面已生成?', cover.ok);
  if (!cover.ok) {
    const coord = await c.eval(AI_COORD);
    if (coord && coord !== 'null') {
      const co = JSON.parse(coord);
      console.log('点 AI生成 @', JSON.stringify(co));
      await c.clickXY(co.x, co.y);
      for (let k = 0; k < 15; k++) { await sleep(2000); const ready = await c.eval(COVER_CHECK).catch(() => ({ ok: false })); if (ready.ok) { console.log('封面就绪 @' + (k * 2 + 2) + 's'); break; } }
    }
  }
  // 二次兜底轮询
  cover = await c.eval(COVER_CHECK);
  if (!cover.ok) { for (let k = 0; k < 10; k++) { await sleep(2000); cover = await c.eval(COVER_CHECK); if (cover.ok) break; } }
  console.log('封面复核:', JSON.stringify(cover));

  const form = await c.eval(`JSON.stringify({title:(document.querySelector('input[placeholder*=文章标题]')||{}).value||'',body:(document.querySelector('.ProseMirror')||{}).innerText?document.querySelector('.ProseMirror').innerText.length:0})`);
  console.log('FORM:', form);

  // 发布（先滚入视口）
  await c.eval(`(function(){var b=[].slice.call(document.querySelectorAll('button')).find(x=>x.innerText&&x.innerText.trim()==='发布');if(b)b.scrollIntoView({block:'center'});})()`);
  await sleep(700);
  const pb = await c.box('button.button-dhlUZE.primary-cECiOJ');
  if (!pb) { console.log('ERR: 发布按钮坐标未找到'); process.exit(1); }
  console.log('点发布 @', JSON.stringify(pb));
  await c.clickXY(pb.x, pb.y);

  let done = false;
  for (let i = 0; i < 10; i++) {
    await sleep(1000);
    const s = await c.eval(`JSON.stringify({onEditor:location.href.includes('content/post/article'),toast:(document.querySelector('[class*=toast],[class*=Toast]')||{}).innerText||'',tip:(document.body.innerText.match(/发布成功|提交成功|内容已发布|审核中|没有选择封面/)||[])[0]||''})`);
    console.log('OBS@' + (i + 1) + 's', s);
    if (!JSON.parse(s).onEditor) { done = true; break; }
  }
  console.log(done ? '>>> 已离开编辑页（发布成功）' : '>>> 仍在编辑页');
  try { const { data } = await c.send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(SKILL_DIR, 'final_result.png'), Buffer.from(data, 'base64')); } catch (e) {}
  process.exit(0);
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
