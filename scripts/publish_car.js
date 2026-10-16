'use strict';
/**
 * 抖音文章发布 - 一体化 CDP 驱动（2026-09-23 实测整合版）
 * 用法: node publish_car.js [图1 图2 图3 ...] [--keyword "婚车租车" --tags "婚庆用车,婚庆婚车车队"]
 *   - 配图默认 3 张（按标签从素材库自动挑）；也可用位置参数直接给多张本地路径
 *   - 头图按顺序逐个尝试上传；封面用第 1 张（含裁剪确认、关闭封面编辑器）
 *   - ⚠️ 2026-10-12 平台改版：文章头图**仅支持 1 张**（入口为单选 input，传完即卸载），
 *        脚本仍按多张循环，入口消失即停（向前兼容）。
 *   - --no-image 不配图（注意：封面必填，纯文发布会被拦截）；--image-top N 改张数
 *
 * 流程: 读 article_job.txt -> 填标题/摘要/正文 -> 上传配图(多张头图+封面, fileChooser 拦截)
 *       -> 裁剪弹窗点「确定」-> 封面编辑器点「完成」-> (可选)添加话题 -> 点「发布」-> 校验离开编辑页
 *
 * 依赖: 隔离 Chrome（isolated-browser skill, profile ~/.chrome_qclaw_stable, CDP 9222, 已登录抖音）
 *       Node >= 22（使用内置全局 WebSocket）
 */
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const WS = global.WebSocket;

const SKILL_DIR = __dirname;
const JOB_FILE = path.join(SKILL_DIR, 'article_job.txt');
// 位置参数 = 显式图片路径。
// ⚠️ 必须排除「--keyword/--tags 等 flag 的值」：这些值不以 -- 开头，
//    简单的 startsWith('--') 过滤会把 `--keyword 婚车租车` 的「婚车租车」
//    误当成图片路径（2026-10-12 实测 FATAL 配图不存在）。
const POS = (() => {
  const A = process.argv.slice(2);
  const FLAGS_WITH_VALUE = ['--keyword', '--tags', '--image-top', '--image-dir'];
  const flagVals = new Set();
  for (let i = 0; i < A.length; i++) {
    if (FLAGS_WITH_VALUE.includes(A[i]) && A[i + 1] && !A[i + 1].startsWith('--')) flagVals.add(A[i + 1]);
  }
  return A.filter(a => !a.startsWith('--') && !flagVals.has(a));
})();
const FL = {};
{
  const A = process.argv.slice(2);
  for (let i = 0; i < A.length; i++) {
    if (A[i] === '--keyword') FL.keyword = A[++i];
    else if (A[i] === '--tags') FL.tags = A[++i];
    else if (A[i] === '--image-top') FL.top = A[++i];
    else if (A[i] === '--image-dir') FL.dir = A[++i];
    else if (A[i] === '--no-image') FL.noImage = true;
  }
}
const TOPICS = []; // 可选话题，如 ['婚车']；无匹配候选时自动跳过
const POST_URL = 'https://creator.douyin.com/creator-micro/content/post/article?enter_from=publish_page&media_type=article&type=new';

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
const CDP_PORT = parseInt(process.env.ISOB_CDP_PORT, 10) || 9222;
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function cdpGet(p) {
  return new Promise((res, rej) => {
    http.get({ host: '127.0.0.1', port: CDP_PORT, path: p }, r => {
      let d = ''; r.on('data', c => d += c);
      r.on('end', () => { try { res(JSON.parse(d)); } catch (e) { rej(e); } });
    }).on('error', rej);
  });
}
class CDP {
  constructor(url) { this.url = url; this.ws = null; this.p = {}; this.id = 0; this.events = []; }
  connect() {
    return new Promise((a, b) => {
      const ws = new WS(this.url); this.ws = ws;
      ws.onopen = () => a();
      ws.onerror = () => b(new Error('ws error'));
      ws.onmessage = (ev) => {
        const j = JSON.parse(ev.data);
        if (j.id && this.p[j.id]) { this.p[j.id](j.result); delete this.p[j.id]; }
        else if (j.method) { this.events.push(j); }
      };
    });
  }
  send(m, pr, t = 20000) {
    return new Promise((a, b) => {
      const id = ++this.id; this.p[id] = a;
      try { this.ws.send(JSON.stringify({ id, method: m, params: pr || {} })); }
      catch (e) { delete this.p[id]; return b(e); }
      setTimeout(() => { if (this.p[id]) { delete this.p[id]; b(new Error('timeout:' + m)); } }, t);
    });
  }
  async eval(expr) {
    const r = await this.send('Runtime.evaluate', { expression: expr, returnByValue: true });
    if (r.exceptionDetails) throw new Error('EVAL:' + (r.exceptionDetails.exception && r.exceptionDetails.exception.description || r.exceptionDetails.text));
    return r.result && r.result.value;
  }
  async clickXY(x, y) {
    await this.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
    await sleep(90);
    await this.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
  }
  waitEvent(name, timeoutMs) {
    return new Promise((res) => {
      const t0 = Date.now();
      const iv = setInterval(() => {
        const i = this.events.findIndex(e => e.method === name);
        if (i >= 0) { const ev = this.events.splice(i, 1)[0]; clearInterval(iv); res(ev.params); }
        else if (Date.now() - t0 > timeoutMs) { clearInterval(iv); res(null); }
      }, 120);
    });
  }
}
async function getWs() {
  const t = await cdpGet('/json');
  const m = t.find(x => x.type === 'page' && x.url && x.url.includes('douyin.com') && x.webSocketDebuggerUrl);
  return m ? m.webSocketDebuggerUrl : null;
}
// 找包含指定文本的可见叶子元素，滚入视口，返回中心坐标
const LEAF_COORD = txt => `(function(){var els=[].slice.call(document.querySelectorAll('*')).filter(function(e){var t=e.innerText||'';return t.indexOf(${JSON.stringify(txt)})>=0&&t.length<60&&!Array.from(e.childNodes).some(function(n){return n.nodeType===1&&(n.innerText||'').indexOf(${JSON.stringify(txt)})>=0;})&&!!(e.offsetWidth||e.offsetHeight);});if(!els.length)return null;var e=els[els.length-1];e.scrollIntoView({block:'center'});var r=e.getBoundingClientRect();return JSON.stringify({x:Math.round((r.left+r.right)/2),y:Math.round((r.top+r.bottom)/2)});})()`;
// 按精确文本点按钮（button/[class*=button] 内 exact 匹配）
async function clickLeafBtn(c, txt) {
  const co = await c.eval(`(function(){var els=[].slice.call(document.querySelectorAll('button,[role=button],[class*=button],[class*=btn]')).filter(function(e){var t=(e.innerText||'').trim();return t===${JSON.stringify(txt)}&&!!(e.offsetWidth||e.offsetHeight);});if(!els.length)return null;var e=els[els.length-1];var r=e.getBoundingClientRect();return JSON.stringify({x:Math.round((r.left+r.right)/2),y:Math.round((r.top+r.bottom)/2)});})()`);
  if (!co) return false;
  const o = JSON.parse(co);
  await c.clickXY(o.x, o.y);
  return true;
}
// 关闭「图片编辑」裁剪弹窗（按钮文本是「确定」，选择器 .cropConfirmButton-F6xPmN）
async function confirmCrop(c) {
  for (let i = 0; i < 5; i++) {
    const has = await c.eval(`!!document.querySelector('.cropConfirmButton-F6xPmN')`).catch(() => false);
    if (!has) return true;
    await clickLeafBtn(c, '确定') || await c.eval(`document.querySelector('.cropConfirmButton-F6xPmN').click()`);
    await sleep(1800);
  }
  return !(await c.eval(`!!document.querySelector('.cropConfirmButton-F6xPmN')`).catch(() => true));
}
// 关闭「编辑封面」编辑器（点「完成」）
async function closeCoverEditor(c) {
  for (let i = 0; i < 4; i++) {
    const has = await c.eval(`(function(){var els=[].slice.call(document.querySelectorAll('*')).filter(function(e){return (e.innerText||'').indexOf('编辑封面')>=0&&(e.innerText||'').length<20;});return els.length&&els[els.length-1].offsetHeight?true:false;})()`).catch(() => false);
    if (!has) return true;
    await clickLeafBtn(c, '完成');
    await sleep(2000);
  }
  return true;
}
// 通过 fileChooser 拦截上传本地图
async function uploadViaChooser(c, clickTxt, imgFile) {
  const coord = await c.eval(LEAF_COORD(clickTxt));
  if (!coord) { console.log('未找到入口:', clickTxt); return false; }
  const co = JSON.parse(coord);
  console.log('点击上传入口:', clickTxt, coord);
  const fcP = c.waitEvent('Page.fileChooserOpened', 8000);
  await c.clickXY(co.x, co.y);
  const fc = await fcP;
  if (!fc || !fc.backendNodeId) { console.log('未捕获 fileChooser 事件（可能有弹窗遮挡入口）'); return false; }
  await c.send('DOM.setFileInputFiles', { files: [imgFile], backendNodeId: fc.backendNodeId });
  await sleep(2000);
  await confirmCrop(c);
  await closeCoverEditor(c);
  await sleep(800);
  return true;
}

(async function () {
  console.log('=== 抖音文章发布 ===');
  if (!fs.existsSync(JOB_FILE)) { console.log('ERR: 缺少 article_job.txt'); process.exit(3); }
  const job = parseJob(fs.readFileSync(JOB_FILE, 'utf8'));

  // 配图：位置参数（可多个）优先；否则按 --keyword/--tags 从素材库自动挑 Top-N（默认 3 张）
  const { planImages } = require(path.resolve(__dirname, '..', '..', 'isolated-browser', 'scripts', 'post_images.js'));
  const plan = planImages({
    explicit: POS, noImage: FL.noImage, keyword: FL.keyword || job.title, tags: FL.tags,
    top: FL.top, dir: FL.dir, paraCount: job.body.split(/\n{2,}/).filter(p => p.trim()).length,
  });
  const IMAGES = plan.images;
  console.log('主题:', job.title, '| 正文', job.body.length, '字 | 配图:', IMAGES.length + '张');
  if (plan.detail) plan.detail.chosen.forEach((c2, i) => console.log(`  ${i + 1}) 图${c2.number} ${c2.name || ''} → ${c2.image}`));

  const ws = await getWs();
  if (!ws) { console.log('ERR: 无 douyin 标签页（先用 isolated-browser 启动隔离 Chrome 并登录抖音）'); process.exit(3); }
  const c = new CDP(ws);
  await c.connect();
  await c.send('Runtime.enable');
  await c.send('DOM.enable');
  await c.send('Page.enable');

  const cur = await c.eval('location.href');
  if (!cur || !cur.includes('content/post/article')) {
    await c.send('Page.navigate', { url: POST_URL });
    await sleep(4000);
  }
  let ok = false;
  for (let i = 0; i < 40; i++) {
    if (await c.eval('!!document.querySelector(\'input[placeholder*="文章标题"]\')').catch(() => false)) { ok = true; break; }
    await sleep(1000);
  }
  if (!ok) {
    const login = await c.eval('/扫码登录|验证码登录|密码登录/.test(document.body.innerText.slice(0,3000))').catch(() => false);
    console.log(login ? 'ERR: 未登录抖音，请先人工扫码登录一次（登录态会持久化）' : 'ERR: 标题框未出现');
    process.exit(2);
  }

  // 填标题
  await c.eval(`(function(){var e=document.querySelector('input[placeholder*="文章标题"]');if(!e)return;var s=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;s.call(e,${JSON.stringify(job.title)});['input','change','blur'].forEach(ev=>e.dispatchEvent(new Event(ev,{bubbles:true})));})()`);
  await sleep(400);
  // 填摘要（input[maxlength=30]，非 textarea）
  await c.eval(`(function(){var all=document.querySelectorAll('input');var e=null;for(var i=0;i<all.length;i++){if(all[i].placeholder&&all[i].placeholder.indexOf('摘要')>=0){e=all[i];break;}}if(!e)return;var s=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;s.call(e,${JSON.stringify(job.summary)});['input','change','blur'].forEach(ev=>e.dispatchEvent(new Event(ev,{bubbles:true})));})()`);
  await sleep(400);
  // 填正文（ProseMirror innerHTML + beforeinput/input 事件）
  const paras = job.body.split(/\n{2,}/).map(p => p.trim()).filter(p => p);
  await c.eval(`(function(){var pm=document.querySelector('.ProseMirror[contenteditable="true"]');if(!pm)return;pm.focus();var paras=${JSON.stringify(paras)};var esc=function(s){return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\\n/g,'<br>');};pm.innerHTML=paras.map(function(p){return '<p>'+esc(p)+'</p>';}).join('');pm.dispatchEvent(new InputEvent('beforeinput',{inputType:'insertFromPaste',bubbles:true,cancelable:true}));pm.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  await sleep(800);
  console.log('FORM:', await c.eval(`JSON.stringify({title:(document.querySelector('input[placeholder*=文章标题]')||{}).value||'',bodyLen:(document.querySelector('.ProseMirror')||{innerText:''}).innerText.length})`));

  // 上传配图（文章头图可多张；封面用第 1 张）
  if (IMAGES.length) {
    for (const p of IMAGES) if (!fs.existsSync(p)) { console.log('ERR: 配图不存在:', p); process.exit(3); }
    await c.send('Page.setInterceptFileChooserDialog', { enabled: true });
    // ⚠️ 2026-10-12 改版实测：文章头图入口是**单选** input（fileChooser.isMultiple=false），
    // 上传 1 张后「点击上传图片」入口直接消失、file input 从 DOM 卸载（querySelectorAll('input[type=file]').length===0），
    // 也没有"继续添加"入口 → 当前版本文章体裁**只支持 1 张头图**。
    // 这里仍按多张逐个尝试（向前兼容：平台恢复多图时无需改代码），入口消失即停。
    let uploaded = 0;
    for (let i = 0; i < IMAGES.length; i++) {
      const ok = await uploadViaChooser(c, '点击上传图片', IMAGES[i]);
      if (!ok) break; // 入口消失 = 平台限制（单头图）或弹窗遮挡
      uploaded++;
    }
    if (uploaded < IMAGES.length) {
      console.log(`头图只传了 ${uploaded}/${IMAGES.length}（抖音 2026-10-12 改版：文章头图仅支持 1 张，入口为单选 input 且传完即卸载）`);
    }
    console.log('封面上传（用第 1 张）:', await uploadViaChooser(c, '点击上传封面图', IMAGES[0]));
    await c.send('Page.setInterceptFileChooserDialog', { enabled: false });
    for (let k = 0; k < 8; k++) {
      const s = JSON.parse(await c.eval(`JSON.stringify({imgs:[].slice.call(document.querySelectorAll('img')).filter(function(i){return i.src&&i.src.indexOf('data:')!==0&&(i.naturalWidth||0)>50;}).length})`));
      if (s.imgs >= 2) break;
      await sleep(1500);
    }
    console.log('图片检查:', await c.eval(`JSON.stringify({imgs:[].slice.call(document.querySelectorAll('img')).filter(function(i){return i.src&&i.src.indexOf('data:')!==0&&(i.naturalWidth||0)>50;}).length})`));
  }

  // 可选：添加话题（无候选自动跳过）
  for (const tp of TOPICS) {
    try {
      const coord = await c.eval(LEAF_COORD('点击添加话题'));
      if (!coord) break;
      const co = JSON.parse(coord);
      await c.clickXY(co.x, co.y);
      await sleep(1200);
      await c.eval(`(function(){var e=document.querySelector('input[placeholder*="话题"],input[placeholder*="搜索"]');if(!e)return;var s=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;s.call(e,${JSON.stringify(tp)});e.dispatchEvent(new Event('input',{bubbles:true}));})()`);
      await sleep(1800);
      const sug = await c.eval(`(function(){var els=[].slice.call(document.querySelectorAll('[class*=option],[class*=item],[class*=suggest] li,li')).filter(function(e){return (e.innerText||'').indexOf(${JSON.stringify(tp)})>=0&&(e.innerText||'').length<20&&!!(e.offsetWidth||e.offsetHeight);});if(!els.length)return null;var r=els[0].getBoundingClientRect();return JSON.stringify({x:Math.round((r.left+r.right)/2),y:Math.round((r.top+r.bottom)/2)});})()`);
      if (sug) { const so = JSON.parse(sug); await c.clickXY(so.x, so.y); console.log('话题已选:', tp); }
      else console.log('话题无候选，跳过:', tp);
      await sleep(800);
    } catch (e) { console.log('话题失败(忽略):', e.message); }
  }

  // 发布
  await c.eval(`(function(){var b=[].slice.call(document.querySelectorAll('button')).find(x=>x.innerText&&x.innerText.trim()==='发布');if(b)b.scrollIntoView({block:'center'});})()`);
  await sleep(700);
  const pb = await c.eval(`(function(){var b=[].slice.call(document.querySelectorAll('button')).filter(function(x){return x.innerText&&x.innerText.trim()==='发布'&&!!(x.offsetWidth||x.offsetHeight);});if(!b.length)return null;var r=b[b.length-1].getBoundingClientRect();return JSON.stringify({x:Math.round((r.left+r.right)/2),y:Math.round((r.top+r.bottom)/2)});})()`);
  if (!pb) { console.log('ERR: 发布按钮未找到'); process.exit(1); }
  const o = JSON.parse(pb);
  console.log('点发布 @', pb);
  await c.clickXY(o.x, o.y);

  // 发布成功判据（2026-10-12 实测复核）：URL 离开编辑页 content/post/article，
  // 且 Toast 出现「发布成功」。⚠️ 不要用「图片上传成功」Toast 判成功（P8，会残留十几秒）。
  let done = false, lastToast = '';
  for (let i = 0; i < 15; i++) {
    await sleep(1000);
    const s = await c.eval(`JSON.stringify({onEditor:location.href.includes('content/post/article'),toast:(document.querySelector('[class*=toast],[class*=Toast]')||{}).innerText||''})`);
    const st = JSON.parse(s);
    lastToast = st.toast || lastToast;
    console.log('OBS@' + (i + 1) + 's', s);
    if (!st.onEditor) { done = true; break; }
  }
  console.log('最终 Toast:', JSON.stringify(lastToast));
  console.log(done ? '>>> 发布成功（URL 已离开编辑页）' : '>>> 仍在编辑页，请用 probe_douyin.js 排查');
  // 截图写到系统临时目录，不污染 skill 仓库（2026-10-12 修正）
  try { const shot = await c.send('Page.captureScreenshot', { format: 'png' }); const sp = path.join(os.tmpdir(), 'douyin_publish_result.png'); fs.writeFileSync(sp, Buffer.from(shot.data, 'base64')); console.log('截图:', sp); } catch (e) {}
  process.exit(done ? 0 : 1);
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
