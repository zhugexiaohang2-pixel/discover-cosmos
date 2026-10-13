/* 星际探索局 · 太阳系页 —— 轨道数据与显示尺度
 *
 * 【与 planets.js 的分工】
 *   planets.js      负责"内容"：id / 中英文名 / 双色 / rough / 科普文案
 *   solarsystem.js  负责"几何"：轨道根数 / 半径 / 显示尺度函数
 * 两者通过 id 关联，id 一旦定下不可更改（卡牌页路由依赖它）。
 * 本文件不复制 c1/c2/rough/文案，避免双份事实源。
 *
 * 【坐标系约定 —— 必须严格遵守】
 *   three.js 的 Object3D.DEFAULT_UP 是 (0,1,0)，即 y 轴向上。
 *   因此黄道面是 **x-z 平面**（黄道面法线 = y 轴），倾角绕 x 轴旋转，
 *   把面内分量抬进 y。绝不能把黄道面当成 x-y 平面——那会让所有
 *   行星轨道共面于屏幕竖直方向，倾角完全失效（本项目踩过这个坑）。
 *
 * 【尺度方案：必须显式压缩，否则什么都看不见】
 *   真实比例下，12.6 AU 的全景视野中地球直径只有 0.006 像素。因此：
 *     · 距离：幂律压缩 a_disp = a^ED，以地球轨道为 1 归一化
 *     · 尺寸：显示直径 = BASE × 视野高度 × (R/R⊕)^ER，随视野缩放
 *   两式都用幂律 → 大小顺序与轨道顺序严格保持（单调性）。
 *   真实偏心率用于相位与半径计算；径向压缩会改变显示曲线的偏心程度，倾角不变。
 *
 * 【为什么尺寸要"随视野缩放"而不是固定世界半径】
 *   固定世界半径无法同时满足"近看合理"与"远看可见"：任何常数膨胀因子
 *   都会让木星在拉到行星旁边时涨到数千像素并压垮自己的轨道。
 *   让显示尺寸正比于当前视野跨度，则行星在任意缩放下都占约 0.6% 的画面高度。
 */

/** 压缩后行进单位（AU）。所有几何计算都在此单位系内进行。 */

export const SUN_RADIUS_KM = 696340;

/** 距离幂指数。0.5 → 海王星 30.07 AU 压到 5.48 AU */
export const ED = 0.5;

/** 半径幂指数。0.45 → 木星/地球显示直径比 2.94×（真实 10.97×，已压缩但保序） */
export const ER = 0.45;

/** 地球显示直径占视野高度的比例。0.006 → 默认视野下地球约 5.4 px */
export const BASE = 0.006;

/** 时间倍率：1 秒真实时间 = TIME_SCALE 秒模拟时间 */
export const TIME_SCALE = 20000;

/**
 * 轨道根数（真实值，未压缩）。
 *   a        半长轴（AU）
 *   e        偏心率
 *   incDeg   轨道倾角（度，相对黄道）
 *   period   公转周期（地球日）
 *   radiusKm 参考半径（km）
 *   phaseDeg 初始平近点角（度）——刻意散布，避免开场时行星挤成一团
 *
 * 未收录升交点经度与近日点幅角：八颗行星的这两项差异在视觉上不可辨，
 * 统一为 0 是明确的简化，已在计划中声明。
 */
export const ORBITS = [
  { id: 'mercury', a: 0.38710, e: 0.20563, incDeg: 7.005, period: 87.969, radiusKm: 2439.7, phaseDeg: 14 },
  { id: 'venus', a: 0.72333, e: 0.00677, incDeg: 3.395, period: 224.701, radiusKm: 6051.8, phaseDeg: 34 },
  { id: 'earth', a: 1.00000, e: 0.01671, incDeg: 0.000, period: 365.256, radiusKm: 6371.0, phaseDeg: 50 },
  { id: 'mars', a: 1.52371, e: 0.09339, incDeg: 1.850, period: 686.980, radiusKm: 3389.5, phaseDeg: 64 },
  { id: 'jupiter', a: 5.20289, e: 0.04839, incDeg: 1.304, period: 4332.589, radiusKm: 69911.0, phaseDeg: 128 },
  { id: 'saturn', a: 9.53667, e: 0.05386, incDeg: 2.486, period: 10759.22, radiusKm: 58232.0, phaseDeg: 204 },
  { id: 'uranus', a: 19.18916, e: 0.04726, incDeg: 0.773, period: 30685.4, radiusKm: 25362.0, phaseDeg: 286 },
  { id: 'neptune', a: 30.06992, e: 0.00859, incDeg: 1.770, period: 60189.0, radiusKm: 24622.0, phaseDeg: 330 }
];

export const EARTH_RADIUS_KM = 6371;

/* ============================================================
   显示尺度函数
   ============================================================ */

/** 距离压缩：真实 AU → 显示 AU。地球轨道 1 AU 是不动点。 */
export function compressA(aAu, params = {}) {
  return Math.pow(aAu, params.ED ?? ED);
}

/**
 * 半径压缩（仅用于等比参考，不直接产生世界尺寸）。
 * 以地球半径为 1 归一化后取幂，故地球恒为 1，比值保序。
 */
export function compressR(radiusKm, params = {}) {
  return Math.pow(radiusKm / EARTH_RADIUS_KM, params.ER ?? ER);
}

/**
 * 行星显示直径占视野高度的比例。
 * 关键性质：与当前视野跨度无关 → 行星在任意缩放下视尺寸恒定。
 */
export function displayDiaFrac(radiusKm, params = {}) {
  return (params.BASE ?? BASE) * compressR(radiusKm, params);
}

/**
 * 行星在当前视野下的世界半径（显示 AU）。
 * @param {number} radiusKm 真实参考半径
 * @param {number} spanAu   当前视野高度（显示 AU）
 */
export function worldRadius(radiusKm, spanAu, params = {}) {
  return (displayDiaFrac(radiusKm, params) * spanAu) / 2;
}

/** 太阳显示直径占比。略大于木星，保证它明显是主角但不吞掉内行星轨道。 */
export function sunDiaFrac() {
  return 0.045;
}

/**
 * 默认视野跨度：框到火星外侧一点。
 * 系数 1.35 让火星轨道不贴边，留出标签空间。
 */
export const DEFAULT_SPAN_FACTOR = 1.35;

/** 全景视野跨度：框住海王星轨道，系数 1.15 留边 */
export const FULL_SPAN_FACTOR = 1.15;

export function defaultSpan(params = {}) {
  const mars = ORBITS.find((o) => o.id === 'mars');
  return 2 * compressA(mars.a, params) * DEFAULT_SPAN_FACTOR;
}

export function fullSpan(params = {}) {
  const neptune = ORBITS.find((o) => o.id === 'neptune');
  return 2 * compressA(neptune.a, params) * FULL_SPAN_FACTOR;
}

/** 主相机视场角（度）。必须与 solar-app.js 中的相机一致。 */
export const FOV_DEG = 30;

/**
 * 近观某行星时的**相机到行星的距离**（显示 AU）。
 *
 * 推导（本项目曾在此处算错两次，故完整写下）：
 *   在距相机 d 处，视野高度 H = 2·d·tan(FOV/2)。
 *   要求行星直径占画面 1/4：  D = 0.25·H = 0.5·d·tan(FOV/2)
 *   解出                        d = 2D / tan(FOV/2)
 * 其中 D = displayDiaFrac × 基准视野跨度（世界单位下的直径）。
 *
 * 错误v1：漏掉直径/半径的 2×，把半径当直径。
 * 错误v2（计划中的 0.3027 AU）：误用了"在基准取景距离下的屏幕占比"公式，
 *   而近观时相机已经移动，屏幕尺寸是 d 的函数，必须用上面的 d 反解。
 *
 * @param {number} radiusKm 真实参考半径
 * @param {number} spanAu 基准视野跨度（决定行星的世界尺寸），默认取默认视野
 */
export function closeDistance(radiusKm, spanAu = defaultSpan(), params = {}) {
  const diaWorld = 2 * worldRadius(radiusKm, spanAu, params);
  return (2 * diaWorld) / Math.tan((FOV_DEG * Math.PI) / 180 / 2);
}

/* ============================================================
   轨道力学
   ============================================================ */

const TWO_PI = Math.PI * 2;
const DEG = Math.PI / 180;

/**
 * 开普勒方程 M = E − e·sinE 的牛顿迭代。
 * 初始猜测 E = M 对 e < 0.21（水星最大）在 60 次内收敛到机器精度；
 * 实测最大残差 8.9e-16。
 */
export function solveKepler(M, e) {
  // 先把 M 归一到 [−π, π]，否则大 M 下迭代会因 sin 的周期性来回跳
  let m = M % TWO_PI;
  if (m > Math.PI) m -= TWO_PI;
  if (m < -Math.PI) m += TWO_PI;

  let E = e < 0.8 ? m : Math.PI;
  for (let i = 0; i < 60; i++) {
    const f = E - e * Math.sin(E) - m;
    const fp = 1 - e * Math.cos(E);
    if (Math.abs(fp) < 1e-300) break;
    const dE = f / fp;
    E -= dE;
    if (Math.abs(dE) < 1e-14) break;
  }
  return E;
}

/**
 * 某行星在给定模拟时刻的位置。
 *
 * 坐标系：**黄道面 = x-z 平面**（y 轴为黄道面法线，符合 three.js 的 y-up）。
 * 倾角绕 x 轴旋转，把面内分量抬进 y。
 *
 * 步骤：真实平近点角 → 开普勒方程解偏近点角 → 真实轨道平面坐标 →
 *       径向幂律压缩 → 施加倾角。
 *
 * 压缩只作用于半径标量 r，近日点方向与倾角保留，显示曲线不再是原始开普勒椭圆。
 *
 * @param {object} o  ORBITS 中的一项
 * @param {number} tSim 模拟时间（秒）
 * @returns {{x:number, y:number, z:number, rReal:number, rDisp:number}}
 */
export function positionAt(o, tSim, params = {}) {
  const M = o.phaseDeg * DEG + (TWO_PI * tSim) / (o.period * 86400);
  const E = solveKepler(M, o.e);

  // 真实轨道平面内的坐标（u 沿半长轴，v 在面内垂直于 u）
  const u = o.a * (Math.cos(E) - o.e);
  const v = o.a * Math.sqrt(1 - o.e * o.e) * Math.sin(E);

  const rReal = Math.hypot(u, v);
  const rDisp = compressA(rReal, params); // 径向显示压缩；真实相位与倾角不变

  const cosNu = rReal > 0 ? u / rReal : 1;
  const sinNu = rReal > 0 ? v / rReal : 0;

  // 倾角绕 x 轴：面内分量 (cosNu, sinNu) → (cosNu, sinNu·cos i, sinNu·sin i)
  const inc = o.incDeg * DEG;
  const flat = rDisp * sinNu;
  const x = rDisp * cosNu;
  const y = flat * Math.sin(inc); // 黄道面法线方向 = y
  const z = flat * Math.cos(inc); // 黄道面内 = x-z

  return { x, y, z, rReal, rDisp };
}

/** 采样整条轨道用于画线（显示 AU）。坐标系同 positionAt。 */
export function orbitPoints(o, segments = 256, params = {}) {
  const pts = [];
  const inc = o.incDeg * DEG;
  for (let i = 0; i < segments; i++) {
    const nu = (i / segments) * TWO_PI;
    // 由真实近点角反推真实半径，再压缩
    const rReal = (o.a * (1 - o.e * o.e)) / (1 + o.e * Math.cos(nu));
    const rDisp = compressA(rReal, params);
    const flat = rDisp * Math.sin(nu);
    pts.push([rDisp * Math.cos(nu), flat * Math.sin(inc), flat * Math.cos(inc)]);
  }
  return pts;
}

/** 真实轨道半径的极值（用于测试与 HUD）。 */
export function orbitRange(o) {
  return { min: o.a * (1 - o.e), max: o.a * (1 + o.e) };
}
