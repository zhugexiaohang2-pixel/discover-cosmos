/* solarsystem.js 常驻测试 —— node solar/orbit.test.mjs
 *
 * 覆盖三类风险：
 *   1. 与 planets.js 的 id 契约（错了会让"阅读该星球"跳到空白页）
 *   2. 幂律压缩的保序性（错了会让木星比水星小这种可见错误出现）
 *   3. 开普勒轨道与无交叉（错了会让行星穿轨道）
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { PLANETS } from '../planets.js';
import {
  ORBITS, ED, ER, BASE, TIME_SCALE, SUN_RADIUS_KM, EARTH_RADIUS_KM,
  compressA, compressR, displayDiaFrac, worldRadius, sunDiaFrac,
  defaultSpan, fullSpan, closeDistance, FOV_DEG, solveKepler, positionAt, orbitPoints, orbitRange
} from './solarsystem.js';
import { AU } from './rel.js';

let fail = 0;
let count = 0;
const t = (ok, msg) => {
  count++;
  if (!ok) fail++;
  console.log((ok ? '  PASS  ' : '  FAIL  ') + msg);
};
const sec = (n) => console.log('\n── ' + n + ' ──');
const f = (n, d = 4) => (n == null || !Number.isFinite(n) ? String(n) : n.toFixed(d));
const rel = (a, b, eps = 1e-12) =>
  Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) / Math.max(1e-300, Math.abs(b)) < eps;

const HERE = dirname(fileURLToPath(import.meta.url));

/* ============================================================
   1. id 契约：八颗行星、顺序一致、无重复
   ============================================================ */
sec('id 契约（与 planets.js 对齐）');
const ids = ORBITS.map((o) => o.id);
const idsFromPlanets = PLANETS.map((p) => p.id);
t(ids.length === 8, `轨道表恰好 8 条（实测 ${ids.length}）`);
t(JSON.stringify(ids) === JSON.stringify(idsFromPlanets),
  'id 与顺序完全等于 planets.js（水星→海王星）');
t(new Set(ids).size === 8, 'id 无重复');
t(JSON.stringify(ids) === JSON.stringify(['mercury', 'venus', 'earth', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune']),
  'id 顺序为标准由近及远');
// 每个 id 都能在 planets.js 里查到（"阅读该星球"链接依赖它）
ids.forEach((id) => t(PLANETS.some((p) => p.id === id), `planets.js 中存在 id=${id}`));

/* ============================================================
   2. 尺度常量与目标值一致
   ============================================================ */
sec('尺度常量');
t(ED === 0.5, `ED = ${ED}`);
t(ER === 0.45, `ER = ${ER}`);
t(BASE === 0.006, `BASE = ${BASE}`);
t(TIME_SCALE === 20000, `TIME_SCALE = ${TIME_SCALE}`);
t(rel(compressA(1), 1), '地球轨道压缩后恰为 1（归一化不动点）');
t(rel(compressR(EARTH_RADIUS_KM), 1), '地球半径压缩后恰为 1（归一化不动点）');
t(rel(compressA(30.06992), 5.4836, 1e-4), `海王星轨道 ${f(compressA(30.06992), 4)} AU`);

// 与计划锁定的像素尺寸对齐（1600×900, FOV 30°）
sec('屏幕尺寸与计划值一致');
const H_PX = 900, FOV = 30;
const DEF = defaultSpan();
const pxPerAU = H_PX / DEF;
const sunR = worldRadius(SUN_RADIUS_KM, DEF);
const earthR = worldRadius(EARTH_RADIUS_KM, DEF);
const marsR = worldRadius(3389.5, DEF);
const jupR = worldRadius(69911, DEF);

// 相机放在原点外侧看向原点时，屏幕上的直径约为 2·r·pxPerAU（正交近似）
const approxPx = (rAu) => 2 * rAu * pxPerAU;
t(Math.abs(approxPx(earthR) - 5.4) < 0.6, `地球直径 ≈ ${f(approxPx(earthR), 1)} px（计划值 5.4）`);
t(Math.abs(approxPx(jupR) - 15.9) < 1.5, `木星直径 ≈ ${f(approxPx(jupR), 1)} px（计划值 15.9）`);
t(Math.abs(approxPx(marsR) - 4.1) < 0.5, `火星直径 ≈ ${f(approxPx(marsR), 1)} px（计划值 4.1）`);
t(approxPx(earthR) >= 4, '地球在默认视野下 ≥ 4px（可辨认）');
t(approxPx(sunR) > approxPx(jupR), `太阳 (${f(approxPx(sunR), 1)}px) 大于木星 (${f(approxPx(jupR), 1)}px)`);

sec('视野函数与近观距离');
t(Math.abs(DEF - 3.333) < 0.01, `默认视野 ${f(DEF, 4)} AU（计划值 3.333）`);
t(Math.abs(fullSpan() - 12.612) < 0.02, `全景视野 ${f(fullSpan(), 4)} AU（计划值 12.612）`);
t(DEF < fullSpan(), '默认视野小于全景视野');

// 近观距离：d = 2·直径 / tan(FOV/2)。用独立的几何式复算，不能只信实现。
const closeDistEarth = closeDistance(EARTH_RADIUS_KM, DEF);
const earthDiaWorld = 2 * worldRadius(EARTH_RADIUS_KM, DEF);
const H_at_d = 2 * closeDistEarth * Math.tan((FOV_DEG * Math.PI) / 180 / 2);
t(Math.abs(earthDiaWorld / H_at_d - 0.25) < 1e-12,
  `地球近观：直径/视野高度 = ${f(earthDiaWorld / H_at_d, 6)} = 0.25 ✓（独立复算）`);
t(Math.abs(closeDistEarth - 0.1493) < 0.001, `地球近观距离 ${f(closeDistEarth, 4)} AU`);
// 交叉验证：朴素的"停在半径 3.5 倍处"会让地球超出画面，故不能用那个方案
const naiveD = 3.5 * worldRadius(EARTH_RADIUS_KM, DEF);
const naiveFrac = earthDiaWorld / (2 * naiveD * Math.tan((FOV_DEG * Math.PI) / 180 / 2));
t(naiveFrac > 1, `反例存档：朴素半径倍数方案占画面 ${f(naiveFrac, 3)} > 1（行星超出画面）→ 必须用 d = 2D/tan(FOV/2)`);
t(closeDistEarth > 0.02, '近观距离为正且大于行星自身半径');
// 每颗行星近观时都应恰好占画面 1/4，与大小无关（因为尺寸随视野缩放）
ORBITS.forEach((o) => {
  const d = closeDistance(o.radiusKm, DEF);
  const dia = 2 * worldRadius(o.radiusKm, DEF);
  const frac = dia / (2 * d * Math.tan((FOV_DEG * Math.PI) / 180 / 2));
  t(Math.abs(frac - 0.25) < 1e-12, `${o.id}: 近观占画面 ${f(frac, 6)} = 0.25 ✓`);
});
// 近观距离必须小于该行星的轨道半径，否则相机会飞到太阳另一侧
ORBITS.forEach((o) => {
  const d = closeDistance(o.radiusKm, DEF);
  t(d < compressA(o.a) * 0.9, `${o.id}: 近观距离 ${f(d, 4)} < 轨道半径 ${f(compressA(o.a), 4)} 的 90%`);
});

/* ============================================================
   3. 幂律保序性 —— 显示尺寸必须与真实尺寸同序
   ============================================================ */
sec('显示尺寸保序');
// 关键：必须按"真实半径排序后"比较，不能按轨道顺序比较
// （轨道顺序下火星比金星小，本来就非单调，按轨道顺序断言是错的）
const byReal = [...ORBITS].sort((x, y) => x.radiusKm - y.radiusKm);
const byDisplay = [...ORBITS].sort((x, y) => displayDiaFrac(x.radiusKm) - displayDiaFrac(y.radiusKm));
t(JSON.stringify(byReal.map((o) => o.id)) === JSON.stringify(byDisplay.map((o) => o.id)),
  '按真实半径排序后，显示尺寸顺序完全一致');
console.log('      真实升序: ' + byReal.map((o) => o.id).join(' < '));
console.log('      显示升序: ' + byDisplay.map((o) => o.id).join(' < '));
t(displayDiaFrac(69911) > displayDiaFrac(EARTH_RADIUS_KM), '木星显示尺寸 > 地球');
t(displayDiaFrac(EARTH_RADIUS_KM) > displayDiaFrac(3389.5), '地球显示尺寸 > 火星');
t(displayDiaFrac(6051.8) > displayDiaFrac(2439.7), '金星显示尺寸 > 水星');
const jupMercRatio = displayDiaFrac(69911) / displayDiaFrac(2439.7);
t(Math.abs(jupMercRatio - 4.53) < 0.05, `木星/水星显示直径比 ${f(jupMercRatio, 2)}×（计划值 4.53）`);
t(jupMercRatio > 1.5, '比例虽被压缩，但差异仍明显可辨');

sec('轨道压缩保序');
for (let i = 1; i < ORBITS.length; i++) {
  t(compressA(ORBITS[i].a) > compressA(ORBITS[i - 1].a),
    `${ORBITS[i - 1].id}(${f(compressA(ORBITS[i - 1].a), 3)}) < ${ORBITS[i].id}(${f(compressA(ORBITS[i].a), 3)})`);
}

sec('不重叠：相邻行星的显示半径和 < 轨道间距');
for (let i = 0; i + 1 < ORBITS.length; i++) {
  const o1 = ORBITS[i], o2 = ORBITS[i + 1];
  const gap = compressA(o2.a) - compressA(o1.a);
  const radSum = worldRadius(o1.radiusKm, DEF) + worldRadius(o2.radiusKm, DEF);
  t(radSum < gap * 0.9,
    `${o1.id}→${o2.id}: 半径和 ${f(radSum, 4)} < 间距 ${f(gap, 4)} 的 90%`);
}

/* ============================================================
   4. 开普勒轨道
   ============================================================ */
sec('开普勒方程');
ORBITS.forEach((o) => {
  let worst = 0;
  for (let i = 0; i < 400; i++) {
    const M = (i / 400) * 2 * Math.PI - Math.PI;
    const E = solveKepler(M, o.e);
    worst = Math.max(worst, Math.abs(E - o.e * Math.sin(E) - M));
  }
  t(worst < 1e-12, `${o.id}: 残差 ${worst.toExponential(1)} < 1e-12（400 个平近点角扫描）`);
});
t(Number.isFinite(solveKepler(1e6, 0.20563)), '极大平近点角（1e6）不产生 NaN');
t(Number.isFinite(solveKepler(-1e6, 0.20563)), '极小（负）平近点角不产生 NaN');

sec('轨道半径极值 = [a(1−e), a(1+e)]');
ORBITS.forEach((o) => {
  const { min, max } = orbitRange(o);
  let rmin = Infinity, rmax = -Infinity;
  for (let i = 0; i < 2000; i++) {
    const nu = (i / 2000) * 2 * Math.PI;
    const r = (o.a * (1 - o.e * o.e)) / (1 + o.e * Math.cos(nu));
    rmin = Math.min(rmin, r);
    rmax = Math.max(rmax, r);
  }
  t(rel(rmin, min, 1e-9) && rel(rmax, max, 1e-9),
    `${o.id}: r ∈ [${f(rmin, 4)}, ${f(rmax, 4)}] = [a(1−e), a(1+e)]`);
});

sec('压缩后无轨道交叉（逐对近日点/远日点）');
for (let i = 0; i + 1 < ORBITS.length; i++) {
  const inner = ORBITS[i], outer = ORBITS[i + 1];
  const peri = compressA(orbitRange(inner).min);
  const aph = compressA(orbitRange(outer).max);
  t(peri < aph, `${inner.id} 近日点 ${f(peri, 4)} < ${outer.id} 远日点 ${f(aph, 4)}`);
}

sec('positionAt 的几何正确性');
ORBITS.forEach((o) => {
  const { min, max } = orbitRange(o);
  let rmin = Infinity, rmax = -Infinity, bad = 0;
  for (let i = 0; i < 720; i++) {
    const tSim = (i / 720) * o.period * 86400;
    const p = positionAt(o, tSim);
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y) || !Number.isFinite(p.z)) bad++;
    rmin = Math.min(rmin, p.rReal);
    rmax = Math.max(rmax, p.rReal);
  }
  t(bad === 0, `${o.id}: 整周期无 NaN`);
  t(rel(rmin, min, 1e-6) && rel(rmax, max, 1e-6),
    `${o.id}: 周期内 r ∈ [${f(rmin, 4)}, ${f(rmax, 4)}] 覆盖 [a(1−e), a(1+e)]`);
});

sec('倾角施加正确（y-z 平面）');
ORBITS.forEach((o) => {
  let maxFlatR = 0, maxTotR = 0;
  for (let i = 0; i < 360; i++) {
    const p = positionAt(o, (i / 360) * o.period * 86400);
    maxFlatR = Math.max(maxFlatR, Math.hypot(p.x, p.y, p.z));
    maxTotR = Math.max(maxTotR, Math.hypot(p.x, p.y));
  }
  // 有倾角时，平面内投影半径必然小于等于真实 3D 半径
  t(maxTotR <= maxFlatR + 1e-12, `${o.id}: 投影半径 ${f(maxTotR, 4)} ≤ 3D 半径 ${f(maxFlatR, 4)}`);
  // 黄道面 = x-z 平面（y-up）→ 地球（倾角 0°）应有 y ≡ 0
  if (o.incDeg === 0) {
    let maxAbsY = 0;
    for (let i = 0; i < 360; i++) {
      const p = positionAt(o, (i / 360) * o.period * 86400);
      maxAbsY = Math.max(maxAbsY, Math.abs(p.y));
    }
    t(maxAbsY < 1e-15, `${o.id}: 倾角 0° → y 恒为 0（整周期最大 |y| = ${maxAbsY.toExponential(1)}）`);
  } else {
    // 有倾角时 y 与 z 必须同相，且 |y/z| = tan(i) 恒定
    const p = positionAt(o, 12345);
    const ratio = Math.abs(p.z) > 1e-12 ? Math.abs(p.y / p.z) : null;
    const expected = Math.tan(o.incDeg * Math.PI / 180);
    t(ratio !== null && Math.abs(ratio - expected) < 1e-9,
      `${o.id}: |y/z| = ${ratio === null ? 'n/a' : f(ratio, 6)} = tan(倾角) = ${f(expected, 6)}`);
  }
});

sec('轨道线采样');
ORBITS.forEach((o) => {
  const pts = orbitPoints(o, 128);
  t(pts.length === 128, `${o.id}: 采样 128 点`);
  t(pts.every((p) => p.length === 3 && p.every(Number.isFinite)), `${o.id}: 全部点为有限三维坐标`);
  const { min, max } = orbitRange(o);
  const rs = pts.map((p) => Math.hypot(p[0], p[1], p[2]));
  t(rel(Math.min(...rs), compressA(min), 1e-6) && rel(Math.max(...rs), compressA(max), 1e-6),
    `${o.id}: 压缩后半径范围 [${f(Math.min(...rs), 4)}, ${f(Math.max(...rs), 4)}] 与解析一致`);
});

/* ============================================================
   5. 开场几何：行星必须在相机前方
   ============================================================ */
sec('开场可见性（相机在 +x 侧看向原点）');
// 注：无法让八颗行星同时位于 x>0 —— 各轨道半径不同，且行星不能任意摆放。
// 实测最佳相位配置下有 7 颗在前方半球，1 颗（海王星）在后方。
// 因此开场相机给一个约 20° 的方位偏角，让后方那颗也进入视野。
const frontCount = ORBITS.filter((o) => positionAt(o, 0).x > 0).length;
ORBITS.forEach((o) => {
  const p = positionAt(o, 0);
  console.log(`      ${o.id.padEnd(9)} x=${f(p.x, 4).padStart(8)}  y=${f(p.y, 5).padStart(8)}  z=${f(p.z, 5).padStart(8)}`);
});
t(frontCount >= 6, `${frontCount}/8 颗行星开场位于 x>0 前方半球（≥6 即可，其余由相机方位角补偿）`);
t(ORBITS.every((o) => {
  const p = positionAt(o, 0);
  return Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z);
}), '开场位置全部为有限值');
// 开场不能全部挤在同一方位：x-z 平面上的方位角必须有足够散布
const azis = ORBITS.map((o) => {
  const p = positionAt(o, 0);
  return Math.atan2(p.z, p.x);
});
const spanAz = Math.max(...azis) - Math.min(...azis);
t(spanAz > Math.PI * 0.5, `开场方位角散布 ${f(spanAz * 180 / Math.PI, 1)}° > 90°（不会挤成一团）`);

/* ============================================================
   6. 时间倍率：可观察性
   ============================================================ */
sec('时间倍率可见性');
const mercOrbitMin = (ORBITS[0].period * 86400) / TIME_SCALE / 60;
const nepOrbitDays = (ORBITS[7].period * 86400) / TIME_SCALE / 86400;
t(mercOrbitMin > 1 && mercOrbitMin < 20, `水星一圈 ${f(mercOrbitMin, 1)} 分钟（可见但不闪烁）`);
t(nepOrbitDays > 1, `海王星一圈 ${f(nepOrbitDays, 1)} 天（几乎不动 = 科普对比点）`);
t(nepOrbitDays / (mercOrbitMin / 60 / 24) > 600, '内外行星周期比 > 600×（真实比例保留）');

/* ============================================================ */
sec('面板参数与正式几何函数共用');
t(sunDiaFrac() === 0.045, '太阳固定显示占比 4.5%，没有重复乘半径压缩');
for (const ED of [0.3, 0.5, 0.75]) {
  const params = { ED, ER: 0.6, BASE: 0.012 };
  t(rel(defaultSpan(params), 2 * 1.52371 ** ED * 1.35), `ED=${ED}: 默认视野同步`);
  t(rel(fullSpan(params), 2 * 30.06992 ** ED * 1.15), `ED=${ED}: 全景视野同步`);
  for (const o of ORBITS) {
    const pos = positionAt(o, 0, params);
    t(rel(Math.hypot(pos.x, pos.y, pos.z), pos.rReal ** ED), `${o.id}: ED=${ED} 正式运行位置使用面板参数`);
    const points = orbitPoints(o, 320, params);
    const first = Math.hypot(...points[0]);
    t(rel(first, (o.a * (1 - o.e)) ** ED), `${o.id}: ED=${ED} 轨道线与运行位置共用压缩`);
    const span = defaultSpan(params);
    const dia = 2 * worldRadius(o.radiusKm, span, params);
    const d = closeDistance(o.radiusKm, span, params);
    t(rel(dia / (2 * d * Math.tan(FOV_DEG * Math.PI / 360)), 0.25), `${o.id}: 非默认参数抵达仍占画面四分之一`);
  }
}

console.log('\n' + (fail === 0 ? `✅ 全部通过（${count} 项断言）` : `❌ 失败 ${fail} / ${count} 项`));
process.exit(fail === 0 ? 0 : 1);
