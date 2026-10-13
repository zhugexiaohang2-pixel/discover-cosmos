// 无安装依赖的本地预览；仅向本机提供 code/ 中的静态文件。
import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { realpath, stat } from 'node:fs/promises';
import { dirname, extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

if (Number(process.versions.node.split('.')[0]) < 22) {
  console.error('本地预览需要 Node.js 22 或更新版本。');
  process.exit(1);
}
const root = await realpath(resolve(dirname(fileURLToPath(import.meta.url)), '../code'));
const portArg = process.argv[2];
if (process.argv.length > 3 || (portArg !== undefined && !/^\d+$/.test(portArg))) {
  console.error('用法：npm start 或 npm start -- 8050');
  process.exit(1);
}
let port = portArg === undefined ? 8040 : Number(portArg);
if (!Number.isInteger(port) || port < 1024 || port > 65535) {
  console.error('端口必须是 1024 到 65535 之间的整数。');
  process.exit(1);
}
const lastPort = portArg === undefined ? 8060 : port;
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon', '.woff2': 'font/woff2',
};
const insideRoot = (path) => path === root || path.startsWith(root + sep);
const server = createServer(async (req, res) => {
  const reply = (status, message) => {
    res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(req.method === 'HEAD' ? undefined : message);
  };
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    return reply(405, '仅支持 GET 和 HEAD。');
  }
  try {
    let pathname;
    try {
      pathname = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname);
    } catch {
      return reply(400, '无效的请求路径。');
    }
    if (pathname.includes('\0')) return reply(400, '无效的请求路径。');
    let path = resolve(root, '.' + pathname);
    if (!insideRoot(path)) return reply(403, '只提供 code/ 中的文件。');
    path = await realpath(path);
    if (!insideRoot(path)) return reply(403, '只提供 code/ 中的文件。');
    if ((await stat(path)).isDirectory()) {
      if (!pathname.endsWith('/')) {
        const url = new URL(req.url, 'http://127.0.0.1');
        res.writeHead(301, { Location: url.pathname + '/' + url.search });
        return res.end();
      }
      path = await realpath(resolve(path, 'index.html'));
      if (!insideRoot(path)) return reply(403, '只提供 code/ 中的文件。');
    }
    const info = await stat(path);
    if (!info.isFile()) return reply(404, '文件不存在。');
    res.writeHead(200, {
      'Content-Type': types[extname(path).toLowerCase()] || 'application/octet-stream',
      'Content-Length': info.size,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    });
    if (req.method === 'HEAD') return res.end();
    const stream = createReadStream(path);
    stream.on('error', () => res.destroy());
    res.on('close', () => stream.destroy());
    stream.pipe(res);
  } catch (error) {
    reply(error.code === 'ENOENT' || error.code === 'ENOTDIR' ? 404 : 500,
      error.code === 'ENOENT' || error.code === 'ENOTDIR' ? '文件不存在。' : '无法读取文件。');
  }
});
server.on('error', (error) => {
  if (error.code === 'EADDRINUSE' && port < lastPort) {
    console.log(`端口 ${port} 已占用，尝试 ${port + 1}。`);
    server.listen(++port, '127.0.0.1');
    return;
  }
  console.error(`无法启动本地预览：${error.message}`);
  process.exitCode = 1;
});
server.on('listening', () => {
  const url = `http://127.0.0.1:${port}`;
  console.log(`\nDiscoverCOSMOS 本地预览已启动（仅本机访问）\n`);
  console.log(`星际图鉴：${url}/index.html`);
  console.log(`太阳系飞行：${url}/solar/index.html`);
  console.log(`GPU 检查：${url}/solar/render-check.html`);
  console.log('\n保持此终端运行；按 Ctrl+C 停止。\n');
});
server.listen(port, '127.0.0.1');
