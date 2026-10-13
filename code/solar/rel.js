/* 星际探索局 · 太阳系页 —— 狭义相对论核心
 *
 * 【设计约束】本文件必须零依赖：不用 three.js、不碰 DOM、不引任何外部模块。
 * 理由：本项目的物理推导曾出现多次错误，全部靠数值对拍纠正；渲染层另由浏览器 GPU 回归验证。把物理隔离成纯函数，可以独立验证核心数学。
 *
 * 【约定】
 *   beta        速度与光速之比，恒 ∈ [0, 1)
 *   cosTheta    方向余弦（光的来向与运动方向的夹角余弦），恒 ∈ [-1, 1]
 *   D           多普勒因子，> 0；正前方 = γ(1+β)，正后方 = 1/[γ(1+β)]
 *   多普勒与光行差都在「观察者静止系 ↔ 星空静止系」之间变换
 *
 * 【物理约定的一次澄清】
 *   光行差把恒星的视方向朝运动方向前移。θ 为恒星在星空系的方向，
 *   θ' 为观察者所见方向，则 cosθ' = (cosθ + β)/(1 + β·cosθ)。
 *   由此 θ=90° 的恒星前移到 cosθ' = β。这是本模块的核心性质，测试中有断言。
 */

export const C = 299792458; // 光速 m/s
export const AU = 1.495978707e11; // 天文单位 m
export const G0 = 9.80665; // 标准重力加速度 m/s²

/**
 * β 的硬上限，只为堵住 β=1 这一处真正的奇点（γ→∞）。
 *
 * 为什么不设得更严（例如 1−1e-7）：本模块服务的物理剖面在贴光速下限时
 * β 会达到 0.9999999950005 这样的值，过度钳制会破坏 cosh θ 与 1/√(1−β²)
 * 两条独立推导路径的一致性（实测会让 γ 差 78%），也会破坏 D(0)·D(π)=1。
 * 显示用 β 恒为 0.98，离这里极远，不受影响。
 *
 * 真正需要"防 NaN"的是渲染层：shader 入口必须自行钳到 1−1e-6，因为
 * 屏幕像素采样方向可能任意接近运动方向。
 */
export const BETA_MAX_SAFE = 1 - 1e-12;

/** 把任意输入钳制为合法的 β ∈ [0, BETA_MAX_SAFE] */
export function clampBeta(beta) {
  if (!Number.isFinite(beta) || beta <= 0) return 0;
  return beta > BETA_MAX_SAFE ? BETA_MAX_SAFE : beta;
}

/** 把方向余弦钳制到 [-1, 1]（浮点误差会让它溢出一点点，acos 会直接出 NaN） */
export function clampCos(v) {
  if (!Number.isFinite(v)) return 0;
  return v < -1 ? -1 : v > 1 ? 1 : v;
}

/**
 * 洛伦兹因子 γ = 1/√(1−β²)。β 会被钳制，故返回值恒为有限正数。
 *
 * 【数值说明】不要写成 1 − β·β：当 β→1 时 β² 会舍入到 1，产生灾难性相消。
 * 实测 β = 0.9999999950005 时 1 − β² 应为 9.999e-9，而 1 − β·β 的舍入
 * 会让下游算出完全错误的结果。改写成 (1−β)(1+β) 后两个因子都精确可表示。
 */
export function gamma(beta) {
  const b = clampBeta(beta);
  const oneMinusBetaSq = (1 - b) * (1 + b);
  if (oneMinusBetaSq <= 0) return Infinity; // 理论上不可达（b 已被钳制）
  return 1 / Math.sqrt(oneMinusBetaSq);
}

/**
 * 多普勒因子 D = 1/[γ(1 − β·cosθ)]
 *   cosθ = +1（正前方）→ D = γ(1+β)      蓝移
 *   cosθ = −1（正后方）→ D = 1/[γ(1+β)]  红移
 *   cosθ =  0（横向）  → D = 1/γ          横向多普勒（纯时间膨胀）
 * 恒有 D(0)·D(π) = 1。
 */
export function doppler(cosTheta, beta) {
  const b = clampBeta(beta);
  const ct = clampCos(cosTheta);
  const denom = gamma(b) * (1 - b * ct);
  // denom 恒 > 0：γ ≥ 1 且 (1 − β·cosθ) ≥ 1 − β > 0
  return 1 / denom;
}

/**
 * 光行差。**这两个函数处理的是"射线方向"（光从哪来），不是光子行进方向。**
 * 两者刚好相反；混淆会让 β 的符号整体翻转。本项目在这上面反复出错多次，
 * 因此约定写死在此，并由 rel.test.mjs 用显式洛伦兹 boost 逐点对拍。
 *
 * 【约定】c = cosθ，θ 自运动方向量起。
 *   θ_src —— 天球（源）系中光线的来向
 *   θ_obs —— 观察者所见方向
 *
 * 【正确形式】（已用四动量 boost 逐点验证，误差 < 1e-15）
 *   正向（源 → 所见）:  cosθ_obs = (cosθ_src + β)/(1 + β·cosθ_src)
 *   逆向（所见 → 源）:  cosθ_src = (cosθ_obs − β)/(1 − β·cosθ_obs)
 *
 * 逆式就是正式把 β 换成 −β，这是洛伦兹 boost 的必然结果。
 *
 * 【渲染只用逆式】屏幕上每个像素的来向是"所见"，需要反解它该采样天球的哪一点，
 * 故后处理调用 unaberrateCos。正向式 aberrateCos 用于验证与测试。
 *
 * 【自检性质】
 *   · θ=0 与 θ=π 为不动点
 *   · 源系 θ=90° 的光线 → 所见 acos(β)（β=0.9 时 90° → 25.84°）
 *   · 所见 90° 的射线 ← 源系 acos(−β)（β=0.9 时 90° ← 154.16°）
 *   · 两式严格互逆：unaberrateCos(aberrateCos(c)) = c
 */
export function aberrateCos(cosTheta, beta) {
  const b = clampBeta(beta);
  const ct = clampCos(cosTheta);
  const denom = 1 + b * ct;
  if (Math.abs(denom) < 1e-300) return ct >= 0 ? 1 : -1;
  return clampCos((ct + b) / denom);
}

export function unaberrateCos(cosThetaPrime, beta) {
  const b = clampBeta(beta);
  const ctp = clampCos(cosThetaPrime);
  const denom = 1 - b * ctp;
  if (Math.abs(denom) < 1e-300) return ctp >= 0 ? 1 : -1;
  return clampCos((ctp - b) / denom);
}

/** 完整三维逆光行差。direction 与 axis 是来向/运动方向的三分量向量。 */
export function unaberrateDirection(direction, axis, beta) {
  if (![direction, axis].every((v) => v?.length === 3 && v.every(Number.isFinite))) return null;
  const dl = Math.hypot(...direction), al = Math.hypot(...axis);
  if (dl === 0 || al === 0) return null;
  const d = direction.map((v) => v / dl), a = axis.map((v) => v / al);
  const c = clampCos(d.reduce((sum, v, i) => sum + v * a[i], 0));
  const b = clampBeta(beta), denominator = 1 - b * c;
  const transverse = 1 / (gamma(b) * denominator);
  const longitudinal = unaberrateCos(c, b);
  return d.map((v, i) => (v - a[i] * c) * transverse + a[i] * longitudinal);
}

/**
 * 亮度增益。相对论聚束使观测亮度 ∝ D⁴（bolometric）。
 * 直接乘进颜色会在 D=9.95 时把画面打到纯白，因此调用方必须再过 tone mapping；
 * 本函数只负责给出物理增益，不做任何压缩。
 */
export function brightnessGain(cosTheta, beta) {
  const d = doppler(cosTheta, beta);
  return d * d * d * d;
}

/* ============================================================
   真实飞行剖面（物理诚实版，用于 HUD 对照显示）
   ------------------------------------------------------------
   模型：静止起步，以恒定固有加速度 a 加速，到达半程后镜像减速。
     θ   = a·τ/c                        （rapidity）
     x   = (c²/a)(cosh θ − 1)           （单程位移）
     t   = (c/a)·sinh θ                 （外部参考系耗时）
   往返条件 x(τ_half) = D/2 给出 D/(c·trip) = tanh(θ/2)，
   于是有闭式解，无需任何迭代：

     x  = D/(c·trip) = tanh(θ/2)
     θ  = 2·atanh(x)
     β  = tanh θ = 2x/(1+x²)
     γ  = cosh θ = (1+x²)/(1−x²)
     τ_half = (trip/2)·θ/sinh θ
     a  = θ·c/τ_half

   【定义域】x < 1 ⇔ trip > D/c。这是光速下限：D=4.4836 AU 时一程最短
   37.29 分钟，任何更短的时长在物理上无解（不是算不出来，是不存在）。
   越界时本函数返回 null，绝不用 NaN 糊过去。
   ============================================================ */

/** 给定一程距离，返回一程光速下限（秒），与 trueProfile 的距离约定一致。 */
export function minTripSeconds(distanceMeters) {
  if (!Number.isFinite(distanceMeters) || distanceMeters < 0) return null;
  return distanceMeters / C;
}

/**
 * @param {number} tripSeconds 外部参考系看到的一程时长（秒）
 * @param {number} distanceMeters 一程航程（米）
 * @returns {{theta:number, tauHalf:number, accel:number, betaMax:number,
 *            gamma:number, properTime:number, peakDoppler:number,
 *            halfConeRad:number, accelG:number} | null}
 */
export function trueProfile(tripSeconds, distanceMeters) {
  if (!(tripSeconds > 0) || !(distanceMeters > 0)) return null;
  if (!Number.isFinite(tripSeconds) || !Number.isFinite(distanceMeters)) return null;

  const x = distanceMeters / (C * tripSeconds);
  // 定义域守卫：x ≥ 1 表示要求的时长低于光速下限，无解
  if (!(x < 1)) return null;

  const theta = 2 * Math.atanh(x);
  const tauHalf = (tripSeconds / 2) * (theta / Math.sinh(theta));
  const accel = (theta * C) / tauHalf;
  const betaMax = Math.tanh(theta);
  const g = Math.cosh(theta);

  return {
    theta,
    tauHalf,
    accel,
    accelG: accel / G0,
    betaMax,
    gamma: g,
    properTime: 2 * tauHalf,
    peakDoppler: doppler(1, betaMax),
    halfConeRad: Math.acos(betaMax)
  };
}

/**
 * 解耦用的显示曲线：把 β 从 0 平滑抬到 peak 再回落，端点为 0。
 * 这是叙事参数，不对应任何真实加速度；HUD 必须如实标注。
 *
 * 端点必须显式归零：sin(π) 在 IEEE754 下是 1.2246e-16 而不是 0，
 * 若照乘下去，起降瞬间会残留一丝光行差（虽小，但"起飞时画面应当无畸变"
 * 是可断言的语义，不该留浮点尾巴）。
 * @param {number} u 归一化进度 ∈ [0,1]
 * @param {number} peak 峰值 β
 */
export function displayBetaAt(u, peak) {
  if (!Number.isFinite(u) || u <= 0 || u >= 1) return 0; // 端点与越界一律归零
  return clampBeta(peak) * Math.sin(Math.PI * u);
}
