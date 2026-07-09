#!/usr/bin/env node
// verify_publish.js - 检测发布结果（在用户手动点击"发布"后运行）
// 使用方法：node verify_publish.js
// 或作为长期监控：node verify_publish.js --watch

const { WebSocket } = require('ws');
const http = require('http');

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

async function checkPublishResult() {
    // 连接 CDP
    let port = 9222;
    for (const p of [9222, 9223, 9224, 9225]) {
        try { const res = await fetch(`http://127.0.0.1:${p}/json`); if (res.ok) { port = p; break; } } catch {}
    }
    
    const resp = await fetch(`http://127.0.0.1:${port}/json`);
    const tabs = await resp.json();
    let targetTab = tabs.find(t => t.url && t.url.includes('douyin.com'));
    if (!targetTab) { console.error('未找到抖音页面'); return null; }
    
    const wsUrl = targetTab.webSocketDebuggerUrl.replace('[::1]', '127.0.0.1');
    await setupWs(wsUrl);
    
    // 检查 URL
    let r = await cdpSend('Runtime.evaluate', { expression: 'window.location.href', returnByValue: true });
    const url = r.result.value;
    
    // 检查页面文本
    r = await cdpSend('Runtime.evaluate', { expression: 'document.body.innerText.substring(0, 1000)', returnByValue: true });
    const bodyText = r.result.value;
    
    _ws.close();
    
    // 判断结果
    if (!url.includes('content/post/article') && url.includes('douyin.com')) {
        return { success: true, url, message: '✅ 已离开编辑页面，发布可能成功！' };
    } else if (bodyText.includes('审核中') || bodyText.includes('已发布')) {
        return { success: true, url, message: '✅ 页面显示成功提示！' };
    } else if (url.includes('content/post/article')) {
        return { success: false, url, message: '⏳ 仍在编辑页面，请确认是否已点击"发布"' };
    } else {
        return { success: null, url, message: '❓ 未知状态，请手动检查' };
    }
}

async function main() {
    const watchMode = process.argv.includes('--watch');
    
    if (watchMode) {
        console.log('👁️  监控模式：每 3 秒检查一次发布状态...');
        console.log('   请手动点击"发布"按钮，脚本将自动检测结果\n');
        
        while (true) {
            const result = await checkPublishResult();
            if (result) {
                console.log(`[${new Date().toLocaleTimeString()}] ${result.message}`);
                console.log('   URL:', result.url);
                
                if (result.success) {
                    console.log('\n🎉 发布成功！脚本退出。');
                    break;
                }
            }
            await sleep(3000);
        }
    } else {
        console.log('🔍 检查发布结果...\n');
        const result = await checkPublishResult();
        if (result) {
            console.log(result.message);
            console.log('URL:', result.url);
        }
    }
}

main().catch(e => { console.error('Error:', e.message); process.exit(1); });
