/**
 * 抖音创作平台 - 快速发布脚本（假设已登录）
 *
 * 使用方式：
 *   node quick_publish.js
 *
 * 环境变量：
 *   DY_TITLE  文章标题
 *   DY_BODY   文章正文
 */
'use strict';

const lib = require('./lib.js');

const TITLE = process.env.DY_TITLE || '微软：引领科技创新的全球巨头';
const BODY = process.env.DY_BODY || `微软（Microsoft）是全球领先的科技公司，由比尔·盖茨和保罗·艾伦于1975年创立。

公司概况
微软总部位于美国华盛顿州雷德蒙德，是一家主要从事软件开发、硬件制造和云计算服务的跨国科技企业。微软的核心产品包括Windows操作系统、Microsoft Office办公软件套件，以及Azure云计算平台。

技术创新
近年来，微软在人工智能领域持续发力。Azure AI服务为数百万开发者提供强大的机器学习和深度学习能力。同时，微软的GitHub平台是全球最大的开源代码托管社区，拥有超过1亿开发者用户。

企业文化
微软倡导"成长型思维"（Growth Mindset），鼓励员工不断学习、勇于尝试。公司注重多元化和包容性，致力于为全球用户创造可持续的技术价值。

未来展望
随着AI技术的快速发展，微软正以其强大的技术实力和开放的合作态度，持续引领全球科技创新的潮流。`;

async function main() {
  console.log('========================================');
  console.log('抖音创作平台文章发布（快速版）');
  console.log('========================================');

  var st = await lib.checkLogin();
  if (!st.ok) {
    console.log('错误：未登录，请先完成登录！');
    process.exit(1);
  }

  await lib.openPostPage();
  await lib.screenshot('douyin_editor.png');
  await lib.fillTitle(TITLE);
  await lib.screenshot('douyin_title.png');
  await lib.fillBody(BODY);
  await lib.screenshot('douyin_body.png');
  var result = await lib.publish();
  await lib.sleep(5000);
  var finalResult = await lib.checkPublishSuccess();

  console.log('\n[结果]', JSON.stringify(finalResult));
  process.exit(finalResult.ok ? 0 : 1);
}

main().catch(function(e) {
  console.error('[错误]', e.message);
  process.exit(1);
});
