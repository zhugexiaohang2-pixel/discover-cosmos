#!/bin/bash
# macOS 双击入口，也可以在终端运行 bash start.command。
cd "$(dirname "$0")" || exit 1
if ! command -v node >/dev/null 2>&1; then
  printf '找不到 Node.js，请安装 Node.js 22 或更新版本后重试。\n'
  read -r -p '按回车关闭。' _
  exit 1
fi
exec node scripts/serve.mjs "$@"
