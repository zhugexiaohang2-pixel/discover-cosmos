/* 本地资源、模块与文档链接契约，避免静态分发包缺文件。 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, extname } from 'node:path';
import { createHash } from 'node:crypto';
import { PLANETS } from './planets.js';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
let count = 0, fail = 0;
const t = (ok, message) => { count++; if (!ok) fail++; console.log(`${ok ? '  PASS  ' : '  FAIL  '}${message}`); };
function scan(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name.startsWith('.') || entry.name === 'vendor') return [];
    const path = resolve(dir, entry.name);
    return entry.isDirectory() ? scan(path) : [path];
  });
}
for (const file of scan(resolve(root, 'code')).filter((p) => ['.js', '.mjs'].includes(extname(p)))) {
  const source = readFileSync(file, 'utf8');
  for (const match of source.matchAll(/\b(?:from|import\s*\()\s*['"](\.[^'"]+)['"]/g)) {
    t(existsSync(resolve(dirname(file), match[1])), `模块依赖存在：${match[1]}`);
  }
}
for (const file of scan(root).filter((p) => p.endsWith('.md'))) {
  const source = readFileSync(file, 'utf8');
  for (const match of source.matchAll(/\]\(([^)]+)\)/g)) {
    const target = match[1].split('#')[0];
    if (!target || /^[a-z]+:/.test(target)) continue;
    t(existsSync(resolve(dirname(file), target)), `文档链接可解析：${target}`);
  }
}
for (const file of ['code/index.html', 'code/solar/index.html', 'code/solar/render-check.html']) {
  const path = resolve(root, file), source = readFileSync(path, 'utf8');
  for (const match of source.matchAll(/(?:src|href)="(\.[^"]+)"/g)) {
    t(existsSync(resolve(dirname(path), match[1].split('#')[0])), `页面资源存在：${match[1]}`);
  }
}
const metadata = JSON.parse(readFileSync(resolve(root, 'code/vendor/metadata.json')));
const hash = createHash('sha256').update(readFileSync(resolve(root, 'code/vendor/three.module.js'))).digest('hex');
t(hash === metadata.sha256, '本地 three.js 与固定版本校验值一致');
t(existsSync(resolve(root, 'code/vendor/THREE-LICENSE.txt')), '本地依赖附带 MIT 许可证');
t(PLANETS.every((p) => p.facts.some((f) => f.label === '自转一周')), '自转周期没有误标为太阳日');
t(PLANETS.every((p) => p.facts.length >= 6 && p.paragraphs.length === 2), '八张阅读页的数据和段落完整');
console.log(`\n${fail ? `❌ 失败 ${fail} / ${count} 项` : `✅ 全部通过（${count} 项断言）`}`);
process.exitCode = fail ? 1 : 0;
