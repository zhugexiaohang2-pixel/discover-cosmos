#!/usr/bin/env bash
# Node.js 离线检查；真实 GPU 与交互检查见 code/solar/render-check.html。
set -uo pipefail
cd "$(dirname "$0")" || exit 1
command -v node >/dev/null 2>&1 || { echo '找不到 node，请安装 Node.js 22 或更新版本。' >&2; exit 1; }
TOTAL=0
FAILED=0
printf '═══ 语法检查 ═══\n'
for f in scripts/*.mjs code/*.js code/*.mjs code/solar/*.js code/solar/*.mjs; do
  if OUT=$(node --check "$f" 2>&1); then
    printf '  OK  %s\n' "$f"
  else
    printf '  FAIL  %s\n%s\n' "$f" "$OUT"
    FAILED=$((FAILED+1))
  fi
done
printf '\n═══ 测试套件 ═══\n'
for f in code/solar/rel.test.mjs code/solar/orbit.test.mjs code/solar/shader.check.mjs code/project.check.mjs; do
  if OUT=$(node "$f" 2>&1); then
    N=$(printf '%s\n' "$OUT" | tail -1 | sed -n 's/.*（\([0-9][0-9]*\) 项断言）.*/\1/p')
    if [ -z "$N" ]; then
      printf '  FAIL  无法读取断言计数：%s\n%s\n' "$f" "$OUT"
      FAILED=$((FAILED+1))
    else
      printf '  PASS  %s (%s 项断言)\n' "$f" "$N"
      TOTAL=$((TOTAL+N))
    fi
  else
    printf '  FAIL  %s\n%s\n' "$f" "$OUT"
    FAILED=$((FAILED+1))
  fi
done
if [ "$FAILED" -gt 0 ]; then
  printf '\n失败：%s 项检查未通过。\n' "$FAILED"
  exit 1
fi
printf '\n全部通过（%s 项断言）。\n' "$TOTAL"
printf '浏览器检查单独执行：启动 HTTP 服务后打开 /solar/render-check.html。\n'
