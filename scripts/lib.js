/**
 * 抖音创作平台 Publisher - xb CLI 封装库 v2
 *
 * 核心更新 v2:
 * - 标题: input.semi-input，必须用原生 value setter
 * - 摘要: textarea[maxlength="200"]
 * - 正文: .ProseMirror，优先用 TipTap API (editor.commands.setContent)
 * - 发布按钮: onClick 在父元素，无法通过脚本触发
 */
'use strict';

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const XB = 'F:\\qclaw\\v0.2.23.532\\resources\\openclaw\\config\\skills\\xbrowser\\scripts\\xb.cjs';
const WORKSPACE = 'C:\\Users\\菠萝\\.qclaw\\workspace-agent-3af8d089';
const STATUS_FILE = path.join(WORKSPACE, 'douyin_status.txt');

const POST_URL = 'https://creator.douyin.com/creator-micro/content/post/article?enter_from=publish_page&media_type=article&type=new';

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function writeStatus(msg) {
  try { fs.writeFileSync(STATUS_FILE, msg, 'utf8'); } catch(e) {}
}

function encodeB64(s) { return Buffer.from(s, 'utf8').toString('base64'); }

function getResult(resp) {
  if (!resp || !resp.ok) return null;
  var d = resp.data;
  if (!d || !d.result) return null;
  return d.result.success ? d.result.data : null;
}

function getResultFull(resp) {
  if (!resp || !resp.ok) return null;
  var d = resp.data;
  if (!d || !d.result) return null;
  return d.result;
}

// ==================== xb CLI 封装 ====================

function xb(args, timeout) {
  timeout = timeout || 30000;
  return new Promise(function(resolve, reject) {
    var proc = spawn('node', [XB].concat(args), {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true
    });
    var out = '';
    var timer = setTimeout(function() {
      try { proc.kill(); } catch(e) {}
      reject(new Error('xb timeout: ' + args.join(' ')));
    }, timeout);
    proc.stdout.on('data', function(d) { out += d.toString(); });
    proc.on('close', function(code) {
      clearTimeout(timer);
      try { resolve(JSON.parse(out)); }
      catch(e) { resolve({ ok: false, error: 'JSON parse failed', raw: out.substring(0, 500) }); }
    });
    proc.on('error', function(err) { clearTimeout(timer); reject(err); });
  });
}

// ==================== 页面操作 ====================

async function navigateTo(url, label) {
  label = label || '';
  console.log('[Nav] ' + (label || url.substring(0, 60)));
  var r = await xb(['run', '--browser', 'chrome', 'open', url], 30000);
  if (!r || !r.ok) throw new Error('导航失败: ' + url);
  await xb(['run', '--browser', 'chrome', 'wait', '--load', 'networkidle'], 25000);
  await sleep(2000);
}

async function getUrl() {
  var r = await xb(['run', '--browser', 'chrome', 'eval', '--base64', encodeB64('window.location.href')], 10000);
  var d = getResult(r);
  return d && d.result ? d.result.result : '';
}

async function getSnapshot(depth) {
  depth = depth || 4;
  var r = await xb(['run', '--browser', 'chrome', 'snapshot', '-i', '-c', '-d', String(depth)], 15000);
  var d = getResultFull(r);
  if (!d) return { refs: {}, text: '' };
  return { refs: d.data && d.data.refs ? d.data.refs : {}, text: d.data && d.data.snapshot ? d.data.snapshot : '' };
}

function findRefByName(snapData, keyword) {
  var refs = snapData.refs;
  var lines = snapData.text.split('\n');
  for (var i = 0; i < lines.length; i++) {
    var m = lines[i].match(/\[ref=(e\d+)\]/);
    if (m && lines[i].includes(keyword)) return m[1];
  }
  for (var key in refs) {
    if (refs[key].name && refs[key].name.includes(keyword)) return key;
  }
  return null;
}

async function evalJs(js, timeout) {
  timeout = timeout || 15000;
  var r = await xb(['run', '--browser', 'chrome', 'eval', '--base64', encodeB64(js)], timeout);
  var d = getResult(r);
  if (d === null || d === undefined) return '';
  if ('result' in d) return d.result == null ? '' : d.result;
  return '';
}

async function clickRef(ref) {
  var r = await xb(['run', '--browser', 'chrome', 'click', '@' + ref], 15000);
  return r && r.ok && r.data && r.data.result && r.data.result.success;
}

async function screenshot(filename) {
  var r = await xb(['run', '--browser', 'chrome', 'screenshot'], 20000);
  var ssPath = r && r.data && r.data.result && r.data.result.data && r.data.result.data.path;
  if (ssPath) {
    var dst = path.join(WORKSPACE, filename || 'douyin_ss.png');
    try { fs.copyFileSync(ssPath, dst); console.log('[SS] ' + dst); return dst; } catch(e) {}
  }
  return null;
}

// ==================== 登录检测 ====================

async function checkLogin() {
  console.log('[Login] 检查登录状态...');
  await sleep(2000);
  var url = await getUrl();
  console.log('[Login] URL: ' + url);

  var hasPhone = await evalJs(
    '(function(){var t=document.querySelector(\'input[placeholder*="手机号"]\');return t?"YES":"NO";})()'
  );
  console.log('[Login] 手机号输入框: ' + hasPhone);

  if (hasPhone === 'YES') {
    console.log('[Login] 未登录（显示登录页）');
    return { ok: false, reason: 'NEED_LOGIN' };
  }

  if (url.includes('creator.douyin.com')) {
    console.log('[Login] 已登录');
    return { ok: true };
  }

  return { ok: false, reason: 'UNKNOWN' };
}

async function waitForLogin(maxSeconds) {
  maxSeconds = maxSeconds || 300;
  console.log('[Login] 等待用户在浏览器中完成登录...');
  writeStatus('WAITING_LOGIN');
  for (var i = 0; i < maxSeconds / 5; i++) {
    await sleep(5000);
    var st = await checkLogin();
    if (st.ok) {
      console.log('[Login] 登录成功！');
      writeStatus('LOGIN_OK');
      return { ok: true };
    }
    if (i % 12 === 0) console.log('[Login] 等待中 (' + (i + 1) * 5 + 's)...');
  }
  writeStatus('LOGIN_TIMEOUT');
  return { ok: false, reason: 'TIMEOUT' };
}

// ==================== 编辑器操作 v2 ====================

/**
 * 填标题 - input.semi-input
 * 必须用原生 value setter，不能用 innerText
 */
async function fillTitle(title) {
  console.log('[Editor] 填标题: ' + title.substring(0, 40));
  var escaped = title.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  var js = '(function(){' +
    'var ta=document.querySelector(\'input.semi-input\');' +
    'if(!ta)return "TITLE_NF";' +
    'ta.focus();' +
    'var setter=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,"value").set;' +
    'setter.call(ta,"' + escaped + '");' +
    '["input","change","keyup","blur"].forEach(function(e){ta.dispatchEvent(new Event(e,{bubbles:true,cancelable:true}));});' +
    'return "OK:"+ta.value;' +
    '})()';
  var r = await evalJs(js);
  console.log('[Editor] 标题: ' + r);
  return r;
}

/**
 * 填摘要 - textarea[maxlength="200"]
 */
async function fillSummary(summary) {
  console.log('[Editor] 填摘要: ' + summary.substring(0, 40));
  var escaped = summary.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  var js = '(function(){' +
    'var ta=document.querySelector(\'textarea[maxlength="200"]\');' +
    'if(!ta){var all=document.querySelectorAll(\'textarea\');for(var i=0;i<all.length;i++){if(all[i].placeholder&&all[i].placeholder.includes("摘要")){ta=all[i];break;}}}' +
    'if(!ta)return "SUMMARY_NF";' +
    'var setter=Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype,"value").set;' +
    'setter.call(ta,"' + escaped + '");' +
    '["input","change","blur"].forEach(function(e){ta.dispatchEvent(new Event(e,{bubbles:true,cancelable:true}));});' +
    'return "OK:"+ta.value;' +
    '})()';
  var r = await evalJs(js);
  console.log('[Editor] 摘要: ' + r);
  return r;
}

/**
 * 填正文 - .ProseMirror（TipTap 编辑器）
 * 优先用 TipTap API（editor.commands.setContent）
 */
async function fillBody(htmlContent) {
  console.log('[Editor] 填正文(' + htmlContent.length + '字符)...');

  // 如果是纯文本，转成 <p> 段落
  if (!htmlContent.includes('<')) {
    var paragraphs = htmlContent.split(/\n\n+/).filter(function(p) { return p.trim(); });
    var htmlParts = paragraphs.map(function(p) { return '<p>' + p.replace(/\n/g, '<br>') + '</p>'; });
    htmlContent = htmlParts.join('');
  }

  var escaped = htmlContent.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$/g, '\\$');

  // 方法一：TipTap API
  var js1 = '(function(){' +
    'var pm=document.querySelector(\'.ProseMirror[contenteditable="true"]\');' +
    'if(!pm)return "PM_NF";' +
    'if(pm.editor){' +
    'pm.editor.commands.setContent("' + escaped + '");' +
    'pm.dispatchEvent(new Event("input",{bubbles:true,cancelable:true}));' +
    'return "TIPTAP_OK:"+pm.editor.getText().length;}' +
    'return "NO_TIPTAP";' +
    '})()';
  var r1 = await evalJs(js1);

  if (r1 && r1.startsWith('TIPTAP_OK:')) {
    console.log('[Editor] 正文(TipTap): ' + r1);
    return r1;
  }

  // 方法二：降级 innerHTML
  console.log('[Editor] TipTap 不可用，降级到 innerHTML...');
  var js2 = '(function(){' +
    'var pm=document.querySelector(\'.ProseMirror[contenteditable="true"]\');' +
    'if(!pm)return "PM_NF";' +
    'pm.innerHTML="";' +
    'var tmp=document.createElement("div");tmp.innerHTML="' + escaped + '";' +
    'while(tmp.firstChild)pm.appendChild(tmp.firstChild);' +
    'pm.dispatchEvent(new Event("input",{bubbles:true,cancelable:true}));' +
    'return "HTML_OK:"+pm.innerText.length;' +
    '})()';
  var r2 = await evalJs(js2);
  console.log('[Editor] 正文(HTML): ' + r2);
  return r2;
}

/**
 * 获取当前发布状态（字数、内容完整性）
 */
async function getPublishState() {
  var js = '(function(){' +
    'var titleEl=document.querySelector(\'input.semi-input\');' +
    'var pm=document.querySelector(\'.ProseMirror[contenteditable="true"]\');' +
    'var summaryEl=document.querySelector(\'textarea[maxlength="200"]\');' +
    'var btn=null;' +
    'var btns=document.querySelectorAll(\'button\');' +
    'for(var i=0;i<btns.length;i++){' +
    'if(btns[i].innerText.trim()==="发布"&&!btns[i].innerText.includes("高清")){btn=btns[i];break;}' +
    '}' +
    'return JSON.stringify({' +
    'url:window.location.href,' +
    'titleLen:titleEl?titleEl.value.length:0,' +
    'titleDisplay:titleEl?titleEl.value:"",' +
    'summaryLen:summaryEl?summaryEl.value.length:0,' +
    'bodyLen:pm?(pm.editor?pm.editor.getText().length:pm.innerText.length):0,' +
    'btnFound:!!btn,' +
    'btnDisabled:btn?btn.disabled:null' +
    '});' +
    '})()';
  var r = await evalJs(js);
  try { return JSON.parse(r); } catch(e) { return { raw: r }; }
}

// ==================== 发布 ====================

/**
 * 点击发布按钮
 * ⚠️ 注意：抖音发布按钮的 React onClick 绑定在父元素，
 * 脚本层面所有点击方法均无法触发发布！
 * 此函数主要用于"确认点击动作已发送"，而非"发布成功"
 */
async function publish() {
  console.log('[Publish] 查找发布按钮...');

  // 1. 用 xb click
  var snap = await getSnapshot(3);
  var btnRef = findRefByName(snap, '"发布"');
  if (btnRef) {
    console.log('[Publish] 找到按钮 ref=' + btnRef + '，尝试 xb click...');
    await clickRef(btnRef);
    await sleep(3000);
  }

  // 2. 确认状态
  var state = await getPublishState();
  console.log('[Publish] 状态: ' + JSON.stringify(state));

  if (state.url && !state.url.includes('post/article')) {
    console.log('[Publish] URL 变化：发布成功！');
    return { ok: true, url: state.url, method: 'url_change' };
  }

  console.log('[Publish] ⚠️ URL 未变化，点击可能未触发发布。');
  console.log('[Publish] 建议：截图中确认内容后，由用户手动点击"发布"按钮。');
  return { ok: false, reason: 'CLICK_NO_EFFECT', state: state };
}

/**
 * 检测发布结果
 */
async function checkPublishSuccess() {
  var url = await getUrl();
  var state = await getPublishState();
  console.log('[Result] URL: ' + url);
  console.log('[Result] 状态: ' + JSON.stringify(state));

  // 成功：离开了发布页
  if (!url.includes('post/article') || url.includes('success') || url.includes('management')) {
    return { ok: true, url: url };
  }

  // 检查草稿提示
  var hasDraft = await evalJs(
    '(function(){var t=document.body.innerText||"";return t.includes("未发布")||t.includes("继续编辑")?"DRAFT":"CLEAN";})()'
  );
  if (hasDraft === 'DRAFT') {
    return { ok: false, reason: 'DRAFT_PRESENT', url: url };
  }

  return { ok: false, reason: 'STILL_ON_PAGE', url: url, state: state };
}

// ==================== 主流程 ====================

async function publishArticle(opts) {
  opts = opts || {};
  await navigateTo(POST_URL, '发布页');
  var st = await checkLogin();

  if (!st.ok) {
    console.log('\n==========================================');
    console.log('检测到未登录！');
    console.log('请在浏览器中完成登录：');
    console.log('  1. 输入手机号');
    console.log('  2. 获取验证码并填写');
    console.log('  3. 点击"登录/注册"');
    console.log('登录完成后，向我发送任意消息继续发布');
    console.log('==========================================\n');
    writeStatus('NEED_USER_LOGIN');
    return { ok: false, reason: 'NEED_LOGIN' };
  }

  await screenshot('douyin_editor.png');
  await fillTitle(opts.title || '无标题');
  await screenshot('douyin_title.png');
  if (opts.summary) await fillSummary(opts.summary);
  await fillBody(opts.body || '');
  await screenshot('douyin_body.png');

  var pubResult = await publish();
  await sleep(5000);
  var finalResult = await checkPublishSuccess();

  if (finalResult.ok) {
    writeStatus('PUBLISHED');
    console.log('\n发布成功！URL: ' + finalResult.url);
    return { ok: true, url: finalResult.url };
  } else {
    writeStatus('PUBLISH_INCOMPLETE:' + JSON.stringify(finalResult));
    console.log('\n⚠️ 发布可能未完成，请检查截图或手动点击发布按钮');
    return { ok: false, ...finalResult, ...pubResult };
  }
}

module.exports = {
  checkLogin: checkLogin,
  waitForLogin: waitForLogin,
  openPostPage: function() { return navigateTo(POST_URL, '发布页'); },
  evalJs: evalJs,
  getSnapshot: getSnapshot,
  findRefByName: findRefByName,
  fillTitle: fillTitle,
  fillSummary: fillSummary,
  fillBody: fillBody,
  getPublishState: getPublishState,
  publish: publish,
  screenshot: screenshot,
  navigateTo: navigateTo,
  publishArticle: publishArticle,
  checkPublishSuccess: checkPublishSuccess,
  xb: xb,
  sleep: sleep,
  clickRef: clickRef,
  getUrl: getUrl
};
