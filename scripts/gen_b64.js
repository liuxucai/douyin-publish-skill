/**
 * Node.js base64 编码辅助工具
 * 
 * 用途：避免 PowerShell 中 $ 和引号转义问题
 * 用法：node gen_b64.js <js_file_path>
 * 输出：base64 字符串（可直接作为 xb eval --base64 参数）
 */
'use strict';

const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
if (args.length === 0) {
  // 无参数时，读取 stdin
  let content = '';
  process.stdin.on('data', d => content += d);
  process.stdin.on('end', () => {
    process.stdout.write(Buffer.from(content, 'utf8').toString('base64'));
  });
} else {
  const filePath = path.resolve(args[0]);
  if (!fs.existsSync(filePath)) {
    console.error('File not found: ' + filePath);
    process.exit(1);
  }
  const content = fs.readFileSync(filePath, 'utf8');
  process.stdout.write(Buffer.from(content, 'utf8').toString('base64'));
}
