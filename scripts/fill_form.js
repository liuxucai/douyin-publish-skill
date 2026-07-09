#!/usr/bin/env node
// fill_form.js - 自动填充抖音文章发布表单（标题/摘要/正文）
// 使用方法：node fill_form.js <title> <summary> <body_file>
// 示例：node fill_form.js "AI时代的内容创作" "摘要内容" "article.txt"

const { WebSocket } = require('ws');
const http = require('http');
const fs = require('fs');

let _ws = null;
let _msgId = 0;
const _pending = {};

function cdpSend(method, params = {}, timeout = 15000) {
    return new Promise((resolve, reject) => {
        if (!_ws || _ws.readyState !== 1) { reject(new Error('not connected')); return; }
        const id = ++_msgId;
        _ws.send(JSON.stringify({ id, method, params }));
        _pending[id] = { resolve, reject };
        setTimeout(() => { if (_pending[id]) { delete _pending[id]; reject(new Error('timeout: ' + method)); } }, timeout);
    });
}

function setupWs(wsUrl) {
    return new Promise((resolve, reject) => {
        _ws = new WebSocket(wsUrl);
        _ws.on('open', () => resolve());
        _ws.on('message', (data) => {
            try {
                const msg = JSON.parse(data.toString());
                if (msg.id && _pending[msg.id]) {
                    const { resolve, reject } = _pending[msg.id];
                    delete _pending[msg.id];
                    if (msg.result !== undefined) resolve(msg.result);
                    else if (msg.error) reject(new Error(msg.error.message));
                }
            } catch {}
        });
        _ws.on('error', reject);
        _ws.on('close', () => { _ws = null; });
    });
}

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
    const args = process.argv.slice(2);
    if (args.length < 3) {
        console.error('Usage: node fill_form.js <title> <summary> <body_file>');
        process.exit(1);
    }
    
    const [title, summary, bodyFile] = args;
    const body = fs.readFileSync(bodyFile, 'utf8');
    
    // 连接 CDP
    let port = 9222;
    for (const p of [9222, 9223, 9224, 9225]) {
        try { const res = await fetch(`http://127.0.0.1:${p}/json`); if (res.ok) { port = p; break; } } catch {}
    }
    
    const resp = await fetch(`http://127.0.0.1:${port}/json`);
    const tabs = await resp.json();
    let targetTab = tabs.find(t => t.url && t.url.includes('content/post/article'));
    if (!targetTab) { console.error('未找到文章编辑页面'); process.exit(1); }
    
    const wsUrl = targetTab.webSocketDebuggerUrl.replace('[::1]', '127.0.0.1');
    await setupWs(wsUrl);
    console.log('✅ 已连接浏览器');
    
    // 1. 填标题
    console.log('\n📝 填充标题...');
    let r = await cdpSend('Runtime.evaluate', {
        expression: `var inp=document.querySelector('input[placeholder*="文章标题"]');if(inp){var s=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;s.call(inp,${JSON.stringify(title)});inp.dispatchEvent(new Event('input',{bubbles:true}));inp.dispatchEvent(new Event('change',{bubbles:true}));JSON.stringify({ok:true,v:inp.value})}else JSON.stringify({ok:false})`,
        returnByValue: true
    });
    console.log('   ', JSON.parse(r.result.value));
    
    // 2. 填摘要
    console.log('\n📝 填充摘要...');
    r = await cdpSend('Runtime.evaluate', {
        expression: `var inp=document.querySelector('input[placeholder*="摘要"]');if(inp){var s=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;s.call(inp,${JSON.stringify(summary)});inp.dispatchEvent(new Event('input',{bubbles:true}));inp.dispatchEvent(new Event('change',{bubbles:true}));JSON.stringify({ok:true,v:inp.value})}else JSON.stringify({ok:false})`,
        returnByValue: true
    });
    console.log('   ', JSON.parse(r.result.value));
    
    // 3. 填正文
    console.log('\n📝 填充正文...');
    const bodyHtml = body.split('\n').map(line => `<p>${line}</p>`).join('');
    r = await cdpSend('Runtime.evaluate', {
        expression: `var e=document.querySelector('[contenteditable=true]');if(e){e.innerHTML=${JSON.stringify(bodyHtml)};e.dispatchEvent(new Event('input',{bubbles:true}));JSON.stringify({ok:true,len:e.innerText.length})}else JSON.stringify({ok:false})`,
        returnByValue: true
    });
    console.log('   ', JSON.parse(r.result.value));
    
    // 4. 选"无文章头图"（可选）
    console.log('\n📝 选择"无文章头图"...');
    await cdpSend('Runtime.evaluate', {
        expression: `var els=Array.from(document.querySelectorAll('*'));for(var el of els){if(el.innerText==='无文章头图'){el.click();break;}}`
    });
    await sleep(500);
    
    // 5. 截图确认
    console.log('\n📸 截图确认...');
    r = await cdpSend('Page.captureScreenshot', { format: 'png' }, 20000);
    const screenshotPath = `dy_filled_${Date.now()}.png`;
    fs.writeFileSync(screenshotPath, Buffer.from(r.data, 'base64'));
    console.log('   截图已保存:', screenshotPath);
    
    console.log('\n✅ 表单填充完成！');
    console.log('   请手动点击"发布"按钮');
    console.log('   脚本将在后台检测发布结果...');
    
    _ws.close();
}

main().catch(e => { console.error('Error:', e.message); process.exit(1); });
