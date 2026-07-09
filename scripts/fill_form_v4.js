#!/usr/bin/env node
/**
 * 抖音文章发布 v4 - 自动填充表单 + AI生成封面
 * 
 * 流程：
 *   1. 填充标题、摘要、正文
 *   2. 选择"无文章头图"绕过文章头图要求
 *   3. 点击右侧"AI生成"按钮自动生成封面
 *   4. 截图确认
 *   5. 提示用户手动点击"发布"
 * 
 * 使用：
 *   node fill_form_v4.js "标题" "摘要" article_body.txt
 */

const WebSocket = require('ws');
const fs = require('fs');
const http = require('http');

const TITLE = process.argv[2] || '从命令行到AI编程：开发者效率工具的演进';
const SUMMARY = process.argv[3] || '探索开发者工具从传统CLI到AI辅助编程的演变';
const BODY_FILE = process.argv[4];

function getBody() {
  if (BODY_FILE && fs.existsSync(BODY_FILE)) {
    return fs.readFileSync(BODY_FILE, 'utf8');
  }
  return '<p>在软件开发的历史长河中，工具始终是提升效率的关键。从早期的命令行界面到现代的集成开发环境，再到如今的人工智能辅助编程，开发者的工作方式正在经历一场深刻的变革。</p><p>命令行工具以其简洁高效著称，grep、sed、awk 等工具至今仍是许多开发者的得力助手。它们的学习曲线虽然陡峭，但一旦掌握，就能以极快的速度完成复杂的文本处理任务。</p><p>IDE 的出现彻底改变了开发体验。代码补全、语法高亮、调试器集成——这些功能让编程变得更加直观。Visual Studio Code 等现代编辑器更是将这一理念推向了新的高度。</p><p>而今，AI 编程助手如 GitHub Copilot、Cursor 等正在重新定义"代码编写"。它们不仅能补全代码，还能理解上下文、生成完整函数、甚至解释复杂的算法。</p><p>未来，开发者与AI的协作将成为常态。</p>';
}

// 探测 Chrome CDP 端口
function discoverChromePort() {
  return new Promise((resolve) => {
    const ports = [9222, 9223, 9224, 9225, 4637];
    let idx = 0;
    
    function tryPort() {
      if (idx >= ports.length) return resolve(null);
      const port = ports[idx++];
      http.get({ host: '127.0.0.1', port, path: '/json' }, (res) => {
        let data = '';
        res.on('data', (c) => data += c);
        res.on('end', () => {
          try {
            const tabs = JSON.parse(data);
            const pageTab = tabs.find(t => t.type === 'page' && t.webSocketDebuggerUrl);
            if (pageTab) {
              console.log(`[Chrome] 端口 ${port} 已找到: ${tabs.length} 个tab`);
              resolve(pageTab.webSocketDebuggerUrl);
            } else {
              tryPort();
            }
          } catch (e) { tryPort(); }
        });
      }).on('error', () => tryPort());
    }
    
    tryPort();
  });
}

class CDPClient {
  constructor(wsUrl) {
    this.ws = new WebSocket(wsUrl);
    this.pending = {};
    this.msgId = 0;
  }
  
  connect() {
    return new Promise((resolve, reject) => {
      this.ws.on('open', resolve);
      this.ws.on('error', reject);
      this.ws.on('message', (data) => {
        try {
          const msg = JSON.parse(data.toString());
          if (msg.id && this.pending[msg.id]) {
            this.pending[msg.id](msg.result);
            delete this.pending[msg.id];
          }
        } catch (e) {}
      });
    });
  }
  
  send(method, params, timeout = 10000) {
    return new Promise((resolve, reject) => {
      const id = ++this.msgId;
      this.pending[id] = resolve;
      this.ws.send(JSON.stringify({ id, method, params }));
      setTimeout(() => {
        if (this.pending[id]) { 
          delete this.pending[id]; 
          reject(new Error(`方法 ${method} 超时`)); 
        }
      }, timeout);
    });
  }
  
  async eval(expression, returnByValue = true) {
    const r = await this.send('Runtime.evaluate', { expression, returnByValue });
    return r?.result?.value;
  }
  
  async screenshot(filename) {
    const r = await this.send('Page.captureScreenshot', { format: 'png' });
    if (r?.data) {
      fs.writeFileSync(filename, Buffer.from(r.data, 'base64'));
      console.log(`   📸 截图已保存: ${filename}`);
    }
  }
  
  close() {
    this.ws.close();
  }
}

function escapeJS(s) {
  return s.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '').replace(/\r/g, '');
}

async function main() {
  console.log('=== 抖音文章发布 v4 ===\n');
  
  // 1. 连接 Chrome
  console.log('1. 探测 Chrome CDP...');
  const wsUrl = await discoverChromePort();
  if (!wsUrl) {
    console.error('❌ 未找到 Chrome CDP 端口');
    process.exit(1);
  }
  
  const client = new CDPClient(wsUrl);
  await client.connect();
  console.log('   ✅ 已连接\n');
  
  // 2. 填充标题
  console.log('2. 填充标题...');
  const titleResult = await client.eval(`
    (function(){
      var input = document.querySelector('input[placeholder*="标题"]');
      if (!input) return '未找到标题输入框';
      var nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      nativeSetter.call(input, '${escapeJS(TITLE)}');
      ['input','change','keyup','blur'].forEach(function(evt){
        input.dispatchEvent(new Event(evt, {bubbles:true, cancelable:true}));
      });
      return '标题已填入: ' + input.value + ' (' + input.value.length + '字)';
    })()
  `);
  console.log('   ' + titleResult);
  
  // 3. 填充摘要
  console.log('\n3. 填充摘要...');
  const summaryResult = await client.eval(`
    (function(){
      var textarea = document.querySelector('textarea[placeholder*="摘要"]');
      if (!textarea) return '未找到摘要输入框（可能已被AI自动填入）';
      var nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
      nativeSetter.call(textarea, '${escapeJS(SUMMARY)}');
      ['input','change','keyup','blur'].forEach(function(evt){
        textarea.dispatchEvent(new Event(evt, {bubbles:true, cancelable:true}));
      });
      return '摘要已填入: ' + textarea.value + ' (' + textarea.value.length + '字)';
    })()
  `);
  console.log('   ' + summaryResult);
  
  // 4. 填充正文
  console.log('\n4. 填充正文...');
  const body = getBody();
  const bodyResult = await client.eval(`
    (function(){
      var editor = document.querySelector('.ProseMirror');
      if (!editor) return '未找到编辑器';
      editor.innerHTML = '${escapeJS(body)}';
      editor.dispatchEvent(new Event('input', {bubbles:true, cancelable:true}));
      return '正文已填入，字数: ' + (editor.innerText || '').length;
    })()
  `);
  console.log('   ' + bodyResult);
  
  // 5. 选择"无文章头图"
  console.log('\n5. 选择"无文章头图"...');
  const headImageResult = await client.eval(`
    (function(){
      var radios = document.querySelectorAll('input[type="radio"]');
      if (radios.length < 2) return '未找到足够的radio按钮';
      radios[1].checked = true;
      radios[1].dispatchEvent(new Event('change', {bubbles:true}));
      return '已选择"无文章头图"';
    })()
  `);
  console.log('   ' + headImageResult);
  
  // 6. 点击 AI生成 ⭐ 关键步骤
  console.log('\n6. 点击"AI生成"生成封面...');
  const aiResult = await client.eval(`
    (function(){
      var btn = document.querySelector('.aiButton-x4dXs_');
      if (!btn) {
        // 备用查找
        var divs = document.querySelectorAll('div');
        for (var i = 0; i < divs.length; i++) {
          if (divs[i].innerText === 'AI生成') {
            btn = divs[i];
            break;
          }
        }
      }
      if (!btn) return '未找到AI生成按钮';
      
      // MouseEvent 序列触发
      btn.dispatchEvent(new MouseEvent('mousedown', {bubbles:true}));
      btn.dispatchEvent(new MouseEvent('mouseup', {bubbles:true}));
      btn.dispatchEvent(new MouseEvent('click', {bubbles:true}));
      return '已点击AI生成按钮';
    })()
  `);
  console.log('   ' + aiResult);
  
  // 7. 等待AI生成
  console.log('\n7. 等待 AI 生成（3秒）...');
  await new Promise(r => setTimeout(r, 3000));
  
  // 8. 验证封面状态
  console.log('\n8. 验证封面状态...');
  const coverResult = await client.eval(`
    (function(){
      var hasImage = document.querySelector('img[class*="cover"]') !== null;
      var allImages = document.querySelectorAll('img');
      return JSON.stringify({
        hasCoverImage: hasImage,
        totalImages: allImages.length
      });
    })()
  `);
  console.log('   ' + coverResult);
  
  // 9. 截图
  console.log('\n9. 截图确认...');
  await client.screenshot('dy_v4_filled.png');
  
  console.log('\n=== ✅ 内容已就绪 ===');
  console.log('📌 请手动点击"发布"按钮完成发布');
  console.log('   - 按钮位置：页面左上角红色"高清发布"');
  console.log('   - 发布后文章进入审核队列');
  console.log('\n💡 提示：发布后可用以下命令验证：');
  console.log('   node scripts/verify_publish.js --watch');
  
  client.close();
}

main().catch(e => {
  console.error('错误:', e.message);
  process.exit(1);
});
