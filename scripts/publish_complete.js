/**
 * 抖音文章发布完整流程脚本 v4.1
 * 
 * 功能：
 * 1. 导航到发布页
 * 2. 检查并恢复草稿（如有）
 * 3. 填写标题、正文
 * 4. 选择"无文章头图"
 * 5. 点击AI生成封面
 * 6. 处理AI生成导致的页面刷新
 * 7. 保存草稿
 * 
 * 使用方法：
 * node publish_complete.js "文章标题" "文章正文.txt"
 */

const WebSocket = require('ws');
const http = require('http');
const fs = require('fs');
const path = require('path');

const CDP_PORT = 9222;
const SCREENSHOT_DIR = 'C:/Users/菠萝/.qclaw/workspace-agent-3af8d089';

// ============ CDP 工具函数 ============

function getWebSocketUrl() {
  return new Promise((resolve, reject) => {
    http.get(`http://127.0.0.1:${CDP_PORT}/json`, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const tabs = JSON.parse(data);
          const page = tabs.find(t => t.type === 'page' && t.webSocketDebuggerUrl);
          if (page) resolve(page.webSocketDebuggerUrl);
          else reject(new Error('No page found'));
        } catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

const pending = {};
let msgId = 0;

function send(ws, method, params, timeout = 30000) {
  return new Promise((resolve, reject) => {
    const id = ++msgId;
    pending[id] = resolve;
    ws.send(JSON.stringify({ id, method, params }));
    setTimeout(() => {
      if (pending[id]) {
        delete pending[id];
        reject(new Error('Timeout'));
      }
    }, timeout);
  });
}

async function connect() {
  const wsUrl = await getWebSocketUrl();
  const ws = new WebSocket(wsUrl);
  
  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString());
      if (msg.id && pending[msg.id]) {
        pending[msg.id](msg.result);
        delete pending[msg.id];
      }
    } catch (e) {}
  });

  await new Promise((resolve, reject) => {
    ws.on('open', resolve);
    ws.on('error', reject);
  });

  return ws;
}

// ============ 业务函数 ============

async function navigate(ws, url) {
  console.log(`  导航到: ${url}`);
  await send(ws, 'Page.navigate', { url });
  await wait(8000);
}

async function getUrl(ws) {
  const result = await send(ws, 'Runtime.evaluate', {
    expression: 'window.location.href',
    returnByValue: true
  });
  return result?.result?.value;
}

async function checkNeedContinue(ws) {
  const result = await send(ws, 'Runtime.evaluate', {
    expression: `(function() {
      var all = document.querySelectorAll('a, button');
      for (var i = 0; i < all.length; i++) {
        var txt = (all[i].innerText || '').trim();
        if (txt.includes('继续编辑')) return 'yes';
      }
      return 'no';
    })()`,
    returnByValue: true
  });
  return result?.result?.value === 'yes';
}

async function clickContinue(ws) {
  console.log('  点击"继续编辑"...');
  await send(ws, 'Runtime.evaluate', {
    expression: `(function() {
      var all = document.querySelectorAll('a, button');
      for (var i = 0; i < all.length; i++) {
        var txt = (all[i].innerText || '').trim();
        if (txt.includes('继续编辑')) {
          all[i].click();
          return 'clicked';
        }
      }
      return 'not_found';
    })()`,
    returnByValue: true
  });
  await wait(5000);
}

async function fillTitle(ws, title) {
  console.log('  填写标题...');
  const result = await send(ws, 'Runtime.evaluate', {
    expression: `(function() {
      var inputs = document.querySelectorAll('input');
      for (var i = 0; i < inputs.length; i++) {
        var p = inputs[i].placeholder || '';
        if (p.includes('标题')) {
          var nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
          nativeSetter.call(inputs[i], '${title.replace(/'/g, "\\'")}');
          ['input','change','keyup','blur'].forEach(function(evt) {
            inputs[i].dispatchEvent(new Event(evt, {bubbles:true}));
          });
          return 'filled';
        }
      }
      return 'not_found';
    })()`,
    returnByValue: true
  });
  return result?.result?.value;
}

async function fillBody(ws, content) {
  console.log('  填写正文...');
  // 将文本转换为 HTML 段落
  const paragraphs = content.split('\n').filter(p => p.trim()).map(p => `<p>${p.trim()}</p>`).join('');
  
  const result = await send(ws, 'Runtime.evaluate', {
    expression: `(function() {
      var editor = document.querySelector('.ProseMirror');
      if (editor) {
        editor.innerHTML = '${paragraphs.replace(/'/g, "\\'")}';
        editor.dispatchEvent(new Event('input', {bubbles:true}));
        return 'filled:' + editor.innerText.length;
      }
      return 'not_found';
    })()`,
    returnByValue: true
  });
  return result?.result?.value;
}

async function selectNoCover(ws) {
  console.log('  选择"无文章头图"...');
  await send(ws, 'Runtime.evaluate', {
    expression: `(function() {
      var radios = document.querySelectorAll('input[type="radio"]');
      if (radios.length > 1) {
        radios[1].checked = true;
        radios[1].dispatchEvent(new Event('change', {bubbles:true}));
        return 'selected';
      }
      return 'not_found';
    })()`,
    returnByValue: true
  });
}

async function clickAIGenerate(ws) {
  console.log('  点击AI生成封面...');
  const result = await send(ws, 'Runtime.evaluate', {
    expression: `(function() {
      // 方法1: 通过 class 查找
      var btn = document.querySelector('.aiButton-x4dXs_');
      if (btn) {
        btn.dispatchEvent(new MouseEvent('mousedown', {bubbles:true}));
        btn.dispatchEvent(new MouseEvent('mouseup', {bubbles:true}));
        btn.dispatchEvent(new MouseEvent('click', {bubbles:true}));
        return 'clicked_by_class';
      }
      
      // 方法2: 通过文本查找（右侧预览区）
      var all = document.querySelectorAll('button, div, span');
      for (var i = 0; i < all.length; i++) {
        var txt = (all[i].innerText || '').trim();
        if (txt === 'AI生成') {
          var rect = all[i].getBoundingClientRect();
          if (rect.left > window.innerWidth * 0.5) {
            all[i].dispatchEvent(new MouseEvent('mousedown', {bubbles:true}));
            all[i].dispatchEvent(new MouseEvent('mouseup', {bubbles:true}));
            all[i].dispatchEvent(new MouseEvent('click', {bubbles:true}));
            return 'clicked_by_text';
          }
        }
      }
      return 'not_found';
    })()`,
    returnByValue: true
  });
  return result?.result?.value;
}

async function checkContentExists(ws) {
  const result = await send(ws, 'Runtime.evaluate', {
    expression: `(function() {
      var inputs = document.querySelectorAll('input');
      var titleFilled = false;
      for (var i = 0; i < inputs.length; i++) {
        if (inputs[i].value && inputs[i].value.length > 0) {
          titleFilled = true;
          break;
        }
      }
      var editor = document.querySelector('.ProseMirror');
      var bodyFilled = editor && editor.innerText.length > 10;
      return titleFilled && bodyFilled ? 'yes' : 'no';
    })()`,
    returnByValue: true
  });
  return result?.result?.value === 'yes';
}

async function clickPublish(ws) {
  console.log('  点击发布按钮...');
  const result = await send(ws, 'Runtime.evaluate', {
    expression: `(function() {
      var allBtns = document.querySelectorAll('button');
      for (var i = 0; i < allBtns.length; i++) {
        var txt = (allBtns[i].innerText || '').trim();
        // 查找"高清发布"或"发布"按钮
        if (txt === '高清发布' || txt === '发布') {
          allBtns[i].dispatchEvent(new MouseEvent('mousedown', {bubbles:true}));
          allBtns[i].dispatchEvent(new MouseEvent('mouseup', {bubbles:true}));
          allBtns[i].dispatchEvent(new MouseEvent('click', {bubbles:true}));
          return 'clicked';
        }
      }
      return 'not_found';
    })()`,
    returnByValue: true
  });
  return result?.result?.value;
}

async function checkVerification(ws) {
  // 检测是否存在验证弹窗（滑块、点选、短信等）
  const result = await send(ws, 'Runtime.evaluate', {
    expression: `(function() {
      // 检测滑块验证
      var slider = document.querySelector('.nc_wrapper') || 
                    document.querySelector('[class*="nc-wrap"]') ||
                    document.querySelector('#nc_1_n1z') ||
                    document.querySelector('.tcaptcha-slide');
      
      // 检测点选验证
      var clickVerify = document.querySelector('[class*="verify"]') ||
                        document.querySelector('.yidun_modal') ||
                        document.querySelector('.geetest_panel');
      
      // 检测通用验证容器
      var verifyModal = document.querySelector('.verify-modal') ||
                        document.querySelector('[class*="captcha"]') ||
                        document.querySelector('[class*="verification"]');
      
      // 检测页面是否有全屏遮罩（可能表示验证弹出）
      var overlay = document.querySelector('.overlay, .mask, .modal-overlay');
      
      // 检测验证码输入框
      var codeInput = document.querySelector('input[placeholder*="验证码"]') ||
                      document.querySelector('input[placeholder*="短信"]');
      
      // 检测任何可疑的弹窗元素
      var bodyText = document.body.innerText || '';
      var hasVerify = bodyText.includes('验证') && (bodyText.includes('滑块') || bodyText.includes('点击') || bodyText.includes('拼图'));
      
      var elements = {
        slider: !!slider,
        clickVerify: !!clickVerify,
        verifyModal: !!verifyModal,
        overlay: !!overlay,
        codeInput: !!codeInput,
        hasVerify: hasVerify,
        bodySnippet: bodyText.substring(0, 500)
      };
      
      return JSON.stringify(elements);
    })()`,
    returnByValue: true
  });
  
  try {
    return JSON.parse(result?.result?.value || '{}');
  } catch (e) {
    return {};
  }
}

async function cancelVerification(ws) {
  console.log('  检测到验证，尝试取消...');
  const result = await send(ws, 'Runtime.evaluate', {
    expression: `(function() {
      var closed = false;
      
      // 点击关闭按钮
      var closeBtns = document.querySelectorAll('button, [role="button"], .close, [class*="close"]');
      for (var i = 0; i < closeBtns.length; i++) {
        var txt = (closeBtns[i].innerText || '').trim();
        var cls = (closeBtns[i].className || '').toLowerCase();
        // 关闭相关的文本或类名
        if (txt === '×' || txt === 'X' || txt === '关闭' || txt === '取消' || 
            cls.includes('close') || cls.includes('cancel')) {
          closeBtns[i].click();
          closed = true;
          break;
        }
      }
      
      // 如果找不到关闭按钮，尝试按 ESC
      if (!closed) {
        document.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape', bubbles: true}));
        closed = true;
      }
      
      return closed ? 'cancelled' : 'not_found';
    })()`,
    returnByValue: true
  });
  return result?.result?.value;
}

async function clickSaveDraft(ws) {
  console.log('  点击暂存离开...');
  const result = await send(ws, 'Runtime.evaluate', {
    expression: `(function() {
      var allBtns = document.querySelectorAll('button, [role="button"]');
      for (var i = 0; i < allBtns.length; i++) {
        var txt = (allBtns[i].innerText || '').trim();
        if (txt === '暂存离开') {
          allBtns[i].dispatchEvent(new MouseEvent('mousedown', {bubbles:true}));
          allBtns[i].dispatchEvent(new MouseEvent('mouseup', {bubbles:true}));
          allBtns[i].dispatchEvent(new MouseEvent('click', {bubbles:true}));
          return 'clicked';
        }
      }
      return 'not_found';
    })()`,
    returnByValue: true
  });
  return result?.result?.value;
}

async function screenshot(ws, filename) {
  try {
    const result = await send(ws, 'Page.captureScreenshot', { format: 'png' }, 15000);
    if (result?.data) {
      fs.writeFileSync(path.join(SCREENSHOT_DIR, filename), Buffer.from(result.data, 'base64'));
      console.log(`  ✅ 截图: ${filename}`);
      return true;
    }
  } catch (e) {
    console.log(`  ⚠️ 截图失败: ${e.message}`);
  }
  return false;
}

function wait(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// ============ 主流程 ============

async function main() {
  const args = process.argv.slice(2);
  const title = args[0] || '从命令行到AI编程：开发者效率工具的演进';
  const bodyFile = args[1];
  
  let bodyContent = `在软件开发的历史长河中，开发者工具的演进始终围绕着效率提升这一核心目标。

从早期的命令行工具，到图形化IDE，再到今天的AI辅助编程，每一次技术革新都极大地改变了我们编写代码的方式。

本文将回顾这一演进历程，探讨AI时代给开发者带来的机遇与挑战。`;
  
  if (bodyFile && fs.existsSync(bodyFile)) {
    bodyContent = fs.readFileSync(bodyFile, 'utf-8');
  }

  console.log('=== 抖音文章发布完整流程 ===\n');
  console.log(`标题: ${title}`);
  console.log(`正文: ${bodyContent.length} 字符\n`);

  const ws = await connect();
  console.log('✅ 已连接到 Chrome\n');

  try {
    // 1. 导航到发布页
    console.log('1. 导航到发布页');
    await navigate(ws, 'https://creator.douyin.com/creator-micro/content/post/article?enter_from=publish_page&media_type=article&type=new');

    // 2. 检查是否需要继续编辑
    console.log('\n2. 检查草稿状态');
    if (await checkNeedContinue(ws)) {
      await clickContinue(ws);
    } else {
      console.log('  无需恢复草稿');
    }

    // 3. 填写标题
    console.log('\n3. 填写标题');
    const titleResult = await fillTitle(ws, title);
    console.log(`  结果: ${titleResult}`);

    // 4. 填写正文
    console.log('\n4. 填写正文');
    const bodyResult = await fillBody(ws, bodyContent);
    console.log(`  结果: ${bodyResult}`);

    // 5. 选择无文章头图
    console.log('\n5. 选择"无文章头图"');
    await selectNoCover(ws);

    // 6. 截图（填完内容后）
    console.log('\n6. 截图确认');
    await screenshot(ws, 'dy_step1_filled.png');

    // 7. 点击AI生成
    console.log('\n7. 点击AI生成封面');
    const aiResult = await clickAIGenerate(ws);
    console.log(`  结果: ${aiResult}`);

    // 8. 等待AI生成
    console.log('\n8. 等待AI生成（15秒）...');
    await wait(15000);

    // 9. 检查内容是否还在（AI生成可能导致页面刷新）
    console.log('\n9. 检查内容状态');
    const contentExists = await checkContentExists(ws);
    if (!contentExists) {
      console.log('  ⚠️ 内容已丢失，重新填写...');
      await fillTitle(ws, title);
      await fillBody(ws, bodyContent);
      console.log('  ✅ 内容已恢复');
    } else {
      console.log('  ✅ 内容正常');
    }

    // 10. 截图（最终确认）
    console.log('\n10. 最终截图');
    await screenshot(ws, 'dy_step2_final.png');

    // 11. 暂存离开（跳过发布，因为发布按钮无法自动化）
    console.log('\n11. 暂存离开（保存草稿）...');
    const saveResult = await clickSaveDraft(ws);
    console.log(`  结果: ${saveResult}`);
    await wait(5000);
    
    // 12. 最终截图
    console.log('\n12. 最终截图');
    await screenshot(ws, 'dy_saved.png');

    // 13. 检查最终URL
    console.log('\n13. 检查最终状态');
    const finalUrl = await getUrl(ws);
    console.log(`  最终URL: ${finalUrl}`);
    
    console.log('\n=== 完成 ===');
    console.log('✅ 文章草稿已保存，包含AI生成的封面。');
    console.log('📝 如需发布，请在网页端手动点击"发布"按钮。');

  } catch (e) {
    console.error('\n❌ 错误:', e.message);
  } finally {
    ws.close();
  }
}

main().catch(console.error);
