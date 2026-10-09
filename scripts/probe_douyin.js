'use strict';
/**
 * 抖音发布页探针 - 登录态 / 页面结构 / 弹窗 / 可见按钮 / 截图
 * 用法: node probe_douyin.js
 * 输出: 控制台 JSON + probe_screenshot.png（本目录）
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const WS = global.WebSocket;
const CDP_PORT = parseInt(process.env.ISOB_CDP_PORT, 10) || 9222;
function sleep(ms){return new Promise(r=>setTimeout(r,ms));}
function cdpGet(p){return new Promise((res,rej)=>{http.get({host:'127.0.0.1',port:CDP_PORT,path:p},r=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>{try{res(JSON.parse(d));}catch(e){rej(e);}});}).on('error',rej);});}
class CDP{constructor(url){this.url=url;this.ws=null;this.p={};this.id=0;}
connect(){return new Promise((a,b)=>{const ws=new WS(this.url);this.ws=ws;ws.onopen=()=>a();ws.onerror=()=>b(new Error('ws'));ws.onmessage=ev=>{const j=JSON.parse(ev.data);if(j.id&&this.p[j.id]){this.p[j.id](j.result);delete this.p[j.id];}};});}
send(m,pr,t=20000){return new Promise((a,b)=>{const id=++this.id;this.p[id]=a;this.ws.send(JSON.stringify({id,method:m,params:pr||{}}));setTimeout(()=>{if(this.p[id]){delete this.p[id];b(new Error('timeout:'+m));}},t);});}
async eval(expr){const r=await this.send('Runtime.evaluate',{expression:expr,returnByValue:true});if(r.exceptionDetails)throw new Error('EVAL:'+(r.exceptionDetails.exception&&r.exceptionDetails.exception.description||''));return r.result&&r.result.value;}
}
(async()=>{
  const tabs=await cdpGet('/json');
  const t=tabs.filter(x=>x.type==='page'&&x.url&&x.url.includes('douyin.com'));
  if(!t.length){console.log('ERR: 无 douyin 标签页');process.exit(3);}
  const t2=t.find(x=>x.url.includes('content/post/article'))||t[t.length-1];
  const c=new CDP(t2.webSocketDebuggerUrl);await c.connect();
  await c.send('Runtime.enable');await c.send('Page.enable');
  console.log('URL:', t2.url);
  console.log('登录态:', await c.eval(`JSON.stringify({needLogin:/扫码登录|验证码登录|密码登录|请登录/.test(document.body.innerText.slice(0,3000)),hasTitleInput:!!document.querySelector('input[placeholder*="文章标题"]'),hasEditor:!!document.querySelector('.ProseMirror[contenteditable=true]')})`));
  console.log('fileInputs:', await c.eval(`JSON.stringify([].slice.call(document.querySelectorAll('input[type=file]')).map(function(e){return {cls:e.className.slice(0,40),accept:e.accept,visible:!!(e.offsetWidth||e.offsetHeight)};}))`));
  console.log('裁剪弹窗:', await c.eval(`!!document.querySelector('.cropConfirmButton-F6xPmN')`));
  console.log('编辑封面弹窗:', await c.eval(`(function(){var els=[].slice.call(document.querySelectorAll('*')).filter(function(e){return (e.innerText||'').indexOf('编辑封面')>=0&&(e.innerText||'').length<20;});return els.length&&els[els.length-1].offsetHeight?true:false;})()`));
  console.log('头图区:', await c.eval(`(function(){var els=[].slice.call(document.querySelectorAll('*')).filter(function(e){return /文章头图/.test(e.innerText||'')&&e.innerText.length<400;});return els.length?(els[els.length-1].innerText||'').replace(/\\n/g,'|').slice(0,150):'(未找到)';})()`));
  const btns=JSON.parse(await c.eval(`(function(){var btns=[].slice.call(document.querySelectorAll('button,[role=button],[class*=btn],[class*=button]')).filter(function(e){return !!(e.offsetWidth||e.offsetHeight);});return JSON.stringify(btns.map(function(e){var r=e.getBoundingClientRect();return {t:(e.innerText||'').replace(/\\n/g,'|').slice(0,16),cls:(e.className||'').slice(0,50),x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2)};}));})()`));
  console.log('可见按钮:');btns.filter(b=>b.t).forEach(b=>console.log(' ',JSON.stringify(b)));
  try{const shot=await c.send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(__dirname,'probe_screenshot.png'),Buffer.from(shot.data,'base64'));console.log('截图: probe_screenshot.png');}catch(e){}
  process.exit(0);
})().catch(e=>{console.error('FATAL',e.message);process.exit(1);});
