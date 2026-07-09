/**
 * 抖音创作平台 - 完整发布脚本 v2
 *
 * 使用方式：
 *   node publish.js
 *
 * 环境变量：
 *   DY_TITLE    文章标题
 *   DY_SUMMARY  文章摘要（可选）
 *   DY_BODY     文章正文（支持多行）
 */
'use strict';

const lib = require('./lib.js');

const TITLE = process.env.DY_TITLE || '创作者时代：每个普通人都有机会';
const SUMMARY = process.env.DY_SUMMARY || '拿起手机，开始创作，你的声音终会被听见';
const BODY = process.env.DY_BODY || `在这个信息爆发的时代，每个人都可以成为创作者。你不需要专业设备，不需要科班出身，只需要一部手机和一颗热爱分享的心。

抖音上的创作者来自各行各业，他们通过短视频和文章分享自己的知识、经验和故事。无论是美食教程、旅行日记、专业技能还是生活感悟，只要内容有价值，就能找到志同道合的观众。

成为创作者不需要等待完美时机，现在就可以开始。坚持输出内容，与粉丝互动，你的影响力会一点一点积累起来。

创作者时代，属于每一个敢于开始的你。`;

async function main() {
  console.log('========================================');
  console.log('抖音创作平台文章发布 v2');
  console.log('========================================');
  console.log('标题: ' + TITLE.substring(0, 50));
  console.log('摘要: ' + SUMMARY.substring(0, 50));
  console.log('正文: ' + BODY.length + '字符');
  console.log('');

  var result = await lib.publishArticle({
    title: TITLE,
    summary: SUMMARY,
    body: BODY
  });

  if (!result.ok && result.reason === 'NEED_LOGIN') {
    console.log('\n[publish] 等待用户登录完成后继续...');
    return result;
  }

  console.log('\n[publish] 完成: ' + JSON.stringify(result));
  process.exit(result.ok ? 0 : 1);
}

main().catch(function(e) {
  console.error('[publish] 错误:', e.message);
  process.exit(1);
});
