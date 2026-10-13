/* rel.js 常驻测试 —— node solar/rel.test.mjs
 *
 * 这些断言是物理推导的防回归网。本项目的相对论公式曾连续出错多次
 * （η 定义混用、β=tanh(η/2)、嵌套求解器发散、sinh²θ=η 假恒等式），
 * 全部靠对拍纠正。因此这里的每个数字都对应一个可独立推导的标准答案。
 */
import {
  C, AU, G0,
  BETA_MAX_SAFE, clampBeta, clampCos,
  gamma, doppler, aberrateCos, unaberrateCos, brightnessGain,
  minTripSeconds, trueProfile, displayBetaAt
} from './rel.js';

let fail = 0;
let count = 0;
const t = (ok, msg) => {
  count++;
  if (!ok) fail++;
  console.log((ok ? '  PASS  ' : '  FAIL  ') + msg);
};
const sec = (name) => console.log('\n── ' + name + ' ──');
const f = (n, d = 9) => (n === null || !Number.isFinite(n) ? String(n) : n.toFixed(d));
const rel = (a, b, eps = 1e-12) =>
  Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) / Math.max(1e-300, Math.abs(b)) < eps;

/* ============================================================
   1. 洛伦兹因子：教材精确值
   ============================================================ */
sec('γ = 1/√(1−β²)');
t(gamma(0) === 1, 'γ(0) = 1');
t(rel(gamma(0.6), 1.25), `γ(0.6) = 1.25（3-4-5 三角形）实测 ${f(gamma(0.6))}`);
t(rel(gamma(0.8), 5 / 3), `γ(0.8) = 5/3 实测 ${f(gamma(0.8))}`);
t(rel(gamma(0.98), 5.025189076296059), `γ(0.98) = 5.025189076 实测 ${f(gamma(0.98))}`);
// γ 的钳制行为：β=1 会被降到 1−1e-12，此处 γ 极大但有限（正是目的：堵住奇点）
const gammaAtOne = gamma(1);
t(Number.isFinite(gammaAtOne) && gammaAtOne > 1e5,
  `γ(1) 经 clampBeta 后 = ${gammaAtOne.toExponential(4)}（有限）→ 奇点已堵住`);
t(gammaAtOne === gamma(BETA_MAX_SAFE), 'γ(1) 与 γ(BETA_MAX_SAFE) 相等，证明钳制确实生效');
// 数值稳定性：β→1 时 1−β² 必须走 (1−β)(1+β)，不能走 1−β·β
sec('γ 的数值稳定性（灾难性相消防护）');
const bEdge0 = 0.9999999950005;
const exactOneMinusSq = (1 - bEdge0) * (1 + bEdge0);
const naiveOneMinusSq = 1 - bEdge0 * bEdge0;
t(Math.abs(exactOneMinusSq - 9.999e-9) / 9.999e-9 < 1e-3,
  `精确路径 (1−β)(1+β) = ${exactOneMinusSq.toExponential(4)} ≈ 9.999e-9 ✓`);
t(rel(gamma(bEdge0), 1 / Math.sqrt(exactOneMinusSq), 1e-15),
  `γ 走精确路径得 ${f(gamma(bEdge0), 3)}`);
t(Math.abs(1 / Math.sqrt(naiveOneMinusSq) - 1 / Math.sqrt(exactOneMinusSq)) / gamma(bEdge0) < 1e-7,
  `朴素路径 ${f(1 / Math.sqrt(naiveOneMinusSq), 3)} 与精确路径分歧仅 ${(Math.abs(1 / Math.sqrt(naiveOneMinusSq) - 1 / Math.sqrt(exactOneMinusSq)) / gamma(bEdge0)).toExponential(1)}（该 β 下尚未劣化，但仍应走精确路径）`);
// 真正劣化的场景：cosh(2·atanh(β)) 在 β→1 时严重失准，故 profile 一律用 cosh(θ)
const thetaEdge = 2 * Math.atanh(bEdge0);
t(Math.abs(Math.cosh(thetaEdge) - gamma(bEdge0)) / gamma(bEdge0) > 1e-3,
  `反例存档：cosh(2·atanh(β)) = ${Math.cosh(thetaEdge).toExponential(3)} 与 γ = ${gamma(bEdge0).toExponential(3)} 相差巨大 → 剖面必须用 cosh(θ) 而非由 β 反推`);

/* ============================================================
   2. 多普勒因子
   ============================================================ */
sec('D = 1/[γ(1 − β·cosθ)]');
t(rel(doppler(1, 0.6), 2), `β=0.6 正前方 D = 2（教材值）实测 ${f(doppler(1, 0.6))}`);
t(rel(doppler(0, 0.6), 0.8), `β=0.6 横向 D = 1/γ = 0.8（横向多普勒）实测 ${f(doppler(0, 0.6))}`);
t(rel(doppler(-1, 0.6), 0.5), `β=0.6 正后方 D = 0.5 实测 ${f(doppler(-1, 0.6))}`);
t(rel(doppler(1, 0.98), 9.949874371066201), `β=0.98 正前方 D = ${f(doppler(1, 0.98))}`);
t(rel(doppler(-1, 0.98), 0.10050378152592121), `β=0.98 正后方 D = ${f(doppler(-1, 0.98))}`);
t(rel(doppler(0, 0.98), 1 / gamma(0.98)), `β=0.98 横向 D = 1/γ 实测 ${f(doppler(0, 0.98))}`);

// 恒等式 D(0)·D(π) = 1/[γ²(1−β²)] = 1
// 注意：绝对容差不能用 1e-15（低于 float64 分辨率），必须用相对容差
t(rel(doppler(1, 0.98) * doppler(-1, 0.98), 1), 'β=0.98: D(0)·D(π) = 1（相对容差 1e-12）');
t(rel(doppler(1, 0.6) * doppler(-1, 0.6), 1), 'β=0.6: D(0)·D(π) = 1');
t(rel(1 / (gamma(0.98) * gamma(0.98) * (1 - 0.98 * 0.98)), 1), '解析验证：1/[γ²(1−β²)] = 1 恒成立');

// 单调性与有限性
let prevD = -Infinity, mono = true;
for (let b = 0; b < 0.9999; b += 0.01) {
  const d = doppler(1, b);
  if (!(d > prevD)) mono = false;
  prevD = d;
}
t(mono, '正前方多普勒随 β 严格单调递增');
t(doppler(1, 0) === 1 && doppler(-1, 0) === 1, 'β=0 时多普勒为恒等（无频移）');
t(Number.isFinite(doppler(1, 0.9999999)), `β=1−1e-7 时 D = ${f(doppler(1, 0.9999999), 1)} 仍有限`);

/* ============================================================
   3. 光行差（射线口径）
   ------------------------------------------------------------
   本项目在光行差上反复出错，因此这里用**由显式洛伦兹 boost 得到的正向映射**
   作为独立基准，再验证实现里的逆映射确实把它反解回来。
   这样就不会"用同一个公式自证其罪"。

   boost 结论（射线口径，θ 自运动方向量起）：
     正向  源 → 所见 :  cosθ_obs = (cosθ_src + β)/(1 + β·cosθ_src)
     逆向  所见 → 源 :  cosθ_src = (cosθ_obs − β)/(1 − β·cosθ_obs)
   渲染只调用逆向式 unaberrateCos。
   ============================================================ */
const fwdMap = (cs, b) => clampCos((cs + b) / (1 + b * cs)); // 来自 boost 的基准

sec('光行差：不动点');
for (const b of [0.5, 0.9, 0.98]) {
  t(rel(unaberrateCos(1, b), 1), `β=${b}: θ=0 是不动点`);
  t(rel(unaberrateCos(-1, b), -1), `β=${b}: θ=π 是不动点`);
}

sec('光行差：逆映射必须与 boost 基准互逆');
for (const b of [0.3, 0.5, 0.9, 0.98]) {
  let worst = 0;
  for (let i = 0; i <= 2000; i++) {
    const cs = -1 + (2 * i) / 2000;
    const obs = fwdMap(cs, b);
    if (obs <= 0) continue; // 只统计真正可见（前向）的部分
    worst = Math.max(worst, Math.abs(unaberrateCos(obs, b) - cs));
  }
  t(worst < 1e-11, `β=${b}: unaberrateCos(fwdMap(cs)) = cs，最大偏差 ${worst.toExponential(1)}`);
}

sec('光行差：boost 验证过的精确锚点（β=0.9）');
// 方向：所见 θ_obs → 源系 θ_src（渲染用的逆映射方向）。
// 锚点由 observer→source 显式 boost 算出（光子四动量 p=(1, n)，n 为射线方向）：
//   所见 15° → 源系 59.700°；30° → 98.860°；89° → 153.719°
const ANCHORS_09 = [[15, 59.700], [30, 98.860], [89, 153.719]];
ANCHORS_09.forEach(([obsDeg, srcDeg]) => {
  const got = Math.acos(unaberrateCos(Math.cos(obsDeg * Math.PI / 180), 0.9)) * 180 / Math.PI;
  t(Math.abs(got - srcDeg) < 0.002,
    `所见 ${obsDeg}° → 源系 ${got.toFixed(3)}°（boost 基准 ${srcDeg}°）`);
});
// 正向映射（源系→所见）才是"压向运动方向"的那个
{
  let mono = true, prev = -1;
  for (let cs = -1; cs <= 1; cs += 0.005) {
    const got = fwdMap(cs, 0.9);
    if (got < prev - 1e-12) mono = false;
    prev = got;
  }
  t(mono, '正向映射（源系→所见）单调递增');
  t(Math.abs(Math.acos(fwdMap(0, 0.9)) * 180 / Math.PI - 25.842) < 0.002,
    '源系 90° → 所见 25.842° = acos(0.9)（星空向运动方向压缩）');
  t(fwdMap(Math.cos(30 * Math.PI / 180), 0.9) > Math.cos(30 * Math.PI / 180),
    '正向映射把角度压向运动方向（余弦变大 → 角度变小）');
  t(unaberrateCos(Math.cos(30 * Math.PI / 180), 0.9) < Math.cos(30 * Math.PI / 180),
    '逆映射（渲染用）朝反方向展开（余弦变小 → 角度变大）');
}

sec('光行差：几何图像');
for (const b of [0.5, 0.9, 0.98]) {
  // 源系 90° 的光线被压缩到所见 acos(β)
  const got = Math.acos(fwdMap(0, b)) * 180 / Math.PI;
  t(Math.abs(got - Math.acos(b) * 180 / Math.PI) < 1e-9,
    `β=${b}: 源系 90° → 所见 ${f(got, 3)}° = acos(β)，即星空向运动方向压缩`);
  // 逆向：所见 90° 的射线来自源系 acos(−β)
  const back = Math.acos(unaberrateCos(0, b)) * 180 / Math.PI;
  t(Math.abs(back - Math.acos(-b) * 180 / Math.PI) < 1e-9,
    `β=${b}: 所见 90° ← 源系 ${f(back, 3)}° = acos(−β)`);
}
// β→1 极限：逆映射把所见方向推向源系的大角度（与正向压缩互为反操作）
{
  const b = 0.999;
  const m89 = Math.acos(unaberrateCos(Math.cos(89 * Math.PI / 180), b)) * 180 / Math.PI;
  const m30 = Math.acos(unaberrateCos(Math.cos(30 * Math.PI / 180), b)) * 180 / Math.PI;
  const m0 = Math.acos(unaberrateCos(1, b)) * 180 / Math.PI;
  t(m0 < 1e-6, `β=0.999: 所见 0° 仍对应源系 ${f(m0, 6)}°（正前方是不动点）`);
  t(m89 > m30, '逆映射单调：所见角度越大，对应源系角度越大');
  t(m89 > 150, `β=0.999: 所见 89° 的射线来自源系 ${f(m89, 1)}°（几乎来自正后方天区）`);
  const m90 = Math.acos(unaberrateCos(0, b)) * 180 / Math.PI;
  t(Math.abs(m90 - Math.acos(-b) * 180 / Math.PI) < 1e-9,
    `所见 90° → 源系 ${f(m90, 4)}° = acos(−β)（精确）`);
}
t(Math.abs(Math.acos(0.98) * 180 / Math.PI - 11.478341) < 1e-5,
  `β=0.98 半锥角 = ${f(Math.acos(0.98) * 180 / Math.PI, 4)}°`);
t(rel(unaberrateCos(0.5, 0.98), (0.5 - 0.98) / (1 - 0.98 * 0.5)), '一般角度与 (c−β)/(1−βc) 逐字一致');

// 逆变换与往返恒等
sec('逆变换与往返恒等');
// 注意：unaberrateCos 是自逆的（把 β 换成 −β 再换回来等于原式），
// 所以"unaberrateCos(aberrateCos(x))" 在 aberrateCos 也被写成同一式时才等于 x，
// 那样的断言是同义反复。这里改成用 boost 基准 fwdMap 做真正有意义的往返。
for (const b of [0.3, 0.8, 0.98, 0.999]) {
  for (const cs of [-0.9, -0.3, 0, 0.4, 0.95, 1]) {
    const obs = fwdMap(cs, b);
    const round = unaberrateCos(obs, b);
    t(rel(round, cs, 1e-9), `β=${b}, 源系 cos=${cs}: fwdMap→unaberrate 往返 = ${f(round)}`);
  }
}
t(rel(unaberrateCos(0, 0.98), -0.98), `β=0.98: 所见 90° 的射线来自源系 cos = ${f(unaberrateCos(0, 0.98))}（=−β，即更靠后的天区）`);

// 光行差的正确几何图像（射线口径）：
//   源系 θ=90° 的光线 → 所见 acos(β)。即源系"前半 + 一部分后半"共同填满观察者视野。
//   反过来：β→1 时可见视野几乎全部来自源系正前方小锥。
sec('光行差几何图像');
for (const b of [0.5, 0.9, 0.98]) {
  const got = Math.acos(aberrateCos(0, b)) * 180 / Math.PI;
  const want = Math.acos(b) * 180 / Math.PI;
  t(Math.abs(got - want) < 1e-9,
    `β=${b}: 源系 90° → 所见 ${f(got, 3)}° = acos(β)`);
}
t(Math.abs(Math.acos(0.98) * 180 / Math.PI - 11.478341) < 1e-5,
  `β=0.98 半锥角 = ${f(Math.acos(0.98) * 180 / Math.PI, 4)}°`);

// 边界安全
sec('数值安全');
t(clampCos(1.0000000001) === 1 && clampCos(-1.0000000001) === -1, 'clampCos 削掉浮点溢出');
t(aberrateCos(1.0000000001, 0.98) <= 1, '输入略超 1 时输出仍 ≤ 1');
t(clampBeta(-1) === 0 && clampBeta(NaN) === 0 && clampBeta(2) === BETA_MAX_SAFE, 'clampBeta 处理负数/NaN/超限');
let allFinite = true;
for (let b = 0; b <= 1; b += 0.02) for (let ct = -1; ct <= 1; ct += 0.05) {
  if (!Number.isFinite(doppler(ct, b)) || !Number.isFinite(aberrateCos(ct, b)) || !Number.isFinite(unaberrateCos(ct, b))) allFinite = false;
}
t(allFinite, 'β 与 cosθ 全网格扫描：doppler/aberrate/unaberrate 无 NaN/Infinity');

/* ============================================================
   4. 真实飞行剖面（含光速下限守卫）
   ============================================================ */
sec('真实剖面：闭式解与定义域');
const D = (Math.pow(30.06992, 0.5) - Math.pow(1.0, 0.5)) * AU; // 压缩后地球→海王星
const TRIP_MIN = minTripSeconds(D); // 一程下限 = D/c，与 HUD 使用同一接口
t(Math.abs(D / AU - 4.4836) < 0.001, `压缩后航程 D = ${f(D / AU, 4)} AU`);
t(Math.abs(TRIP_MIN / 60 - 37.29) < 0.01, `一程光速下限 = ${f(TRIP_MIN / 60, 2)} 分钟（几何决定，不可逾越）`);
t(minTripSeconds(C) === 1, '一光秒距离的一程下限为一秒');
t(minTripSeconds(0) === 0, '零距离下限为零');
t(minTripSeconds(-1) === null && minTripSeconds(NaN) === null && minTripSeconds(Infinity) === null,
  '光速下限拒绝负数与非有限距离');
t(trueProfile(TRIP_MIN, D) === null, '恰在下限 → 返回 null（不是 NaN）');
t(trueProfile(TRIP_MIN * 0.99, D) === null, '低于下限 → null');
t(trueProfile(TRIP_MIN * 1.0001, D) !== null, '略高于下限 → 返回有效解');
t(trueProfile(-1, D) === null && trueProfile(20, -1) === null, '非法输入（负值）→ null');
t(trueProfile(NaN, D) === null && trueProfile(20, Infinity) === null, 'NaN/Infinity 输入 → null');

// 金标准锚点：k=2 时 β 精确 0.8、γ 精确 5/3、蓝移精确 3.0
sec('金标准锚点（k=2）');
const p2 = trueProfile(TRIP_MIN * 2, D);
t(p2 !== null, 'k=2 剖面存在');
t(rel(p2.betaMax, 0.8, 1e-12), `k=2 → β 精确 0.8 实测 ${f(p2.betaMax, 15)}`);
t(rel(p2.gamma, 5 / 3, 1e-12), `k=2 → γ 精确 5/3 实测 ${f(p2.gamma, 15)}`);
t(rel(p2.peakDoppler, 3, 1e-12), `k=2 → 蓝移精确 3.0 实测 ${f(p2.peakDoppler, 15)}`);
t(Math.abs(p2.halfConeRad * 180 / Math.PI - 36.86989764584402) < 1e-12,
  `k=2 → 半锥角 36.8699° 实测 ${f(p2.halfConeRad * 180 / Math.PI, 6)}`);
// 这正是 tanh(2·atanh(0.5)) = 0.8 恒等式
t(rel(Math.tanh(2 * Math.atanh(0.5)), 0.8, 1e-15), '恒等式验证：tanh(2·atanh(0.5)) = 0.8');

// 运动学自洽：位移与时间公式必须回代吻合
sec('运动学自洽性（位移/时间回代）');
for (const k of [1.1, 1.5, 2, 3, 5, 20, 100]) {
  const trip = TRIP_MIN * k;
  const p = trueProfile(trip, D);
  const xBack = (C * C / p.accel) * (Math.cosh((p.accel * p.tauHalf) / C) - 1);
  const tBack = (C / p.accel) * Math.sinh((p.accel * p.tauHalf) / C);
  t(rel(xBack, D / 2, 1e-12), `k=${k}: 半程位移回代 ${(Math.abs(xBack - D / 2) / (D / 2)).toExponential(1)}`);
  t(rel(tBack, trip / 2, 1e-12), `k=${k}: 外部半程时间回代 ${f(tBack, 6)}s`);
  t(rel(p.gamma, gamma(p.betaMax), 1e-12), `k=${k}: γ 两路一致（cosh θ = 1/√(1−β²)）`);
  t(rel(2 * p.tauHalf, p.properTime, 1e-12), `k=${k}: 固有时 = 2×半程固有时`);
  t(p.betaMax > 0 && p.betaMax < 1, `k=${k}: β ∈ (0,1) 实测 ${f(p.betaMax)}`);
  t(rel(doppler(1, p.betaMax) * doppler(-1, p.betaMax), 1), `k=${k}: D(0)·D(π) = 1`);
  t(p.accelG > 0 && Number.isFinite(p.accelG), `k=${k}: 加速度 ${p.accelG.toExponential(2)} g 有限`);
  t(p.betaMax <= BETA_MAX_SAFE, `k=${k}: β=${f(p.betaMax)} 未被 clampBeta 改动（钳制值不参与物理）`);
}

// 最贴光速下限的档位：必须仍然自洽，否则说明钳制过严
sec('贴光速下限档位（k=1.0001）——钳制不得干扰物理');
const pEdge = trueProfile(TRIP_MIN * 1.0001, D);
t(pEdge !== null, 'k=1.0001 剖面存在');
t(pEdge.betaMax <= BETA_MAX_SAFE, `β=${f(pEdge.betaMax)} 恰在钳制阈值之下，未被截断`);
// 注意：此处不能用 1e-12 相对容差。
// cosh(θ) 走 rapidity 路径，是精确的；而 1/√(1−β²) 需从 β 反推，而 β 本身
// 已被舍入到约 16 位有效数字。γ ∝ (1−β)^(-1/2)，故 β 的 5e-11 相对舍入
// 会被放大 1/(2(1−β)) ≈ 1e8 倍 → 产生约 1e-9 的分歧，与实测 1.1e-9 吻合。
// 这是双精度表示极限，不是物理或代码错误。
const gammaRelGap = Math.abs(pEdge.gamma - gamma(pEdge.betaMax)) / pEdge.gamma;
t(gammaRelGap < 1e-7,
  `γ 两路分歧 ${gammaRelGap.toExponential(1)} < 1e-7（属表示精度极限；cosh θ = ${f(pEdge.gamma, 6)} vs 1/√(1−β²) = ${f(gamma(pEdge.betaMax), 6)}）`);
t(rel(doppler(1, pEdge.betaMax) * doppler(-1, pEdge.betaMax), 1, 1e-9),
  `D(0)·D(π) = 1 仍成立（相对误差 ${Math.abs(doppler(1, pEdge.betaMax) * doppler(-1, pEdge.betaMax) - 1).toExponential(1)}）`);

// 时间膨胀：外部时间/固有时 ∈ (1, γ]
sec('时间膨胀');
for (const k of [1.01, 1.5, 2, 5, 20]) {
  const trip = TRIP_MIN * k;
  const p = trueProfile(trip, D);
  const ratio = trip / p.properTime;
  t(ratio > 1, `k=${k}: 膨胀比 ${f(ratio, 4)} > 1`);
  t(ratio <= p.gamma * 1.000001, `k=${k}: 膨胀比 ${f(ratio, 4)} ≤ γ_max ${f(p.gamma, 4)}`);
}

// 单调性：时长越长，β 越小
sec('单调性');
const betas = [1.01, 1.5, 2, 5, 20, 100].map((k) => trueProfile(TRIP_MIN * k, D).betaMax);
let desc = true;
for (let i = 1; i < betas.length; i++) if (betas[i] >= betas[i - 1]) desc = false;
t(desc, `β 随时长单调递减：${betas.map((b) => f(b, 6)).join(' > ')}`);
t(betas[0] > 0.99, `最长相对论性档位 k=1.01 → β = ${f(betas[0], 6)} > 0.99`);

/* ============================================================
   5. 显示曲线与亮度
   ============================================================ */
sec('解耦显示曲线 displayBetaAt');
t(displayBetaAt(0, 0.98) === 0, 'u=0 → β=0（起飞时无畸变）');
t(rel(displayBetaAt(0.5, 0.98), 0.98, 1e-15), 'u=0.5 → β=峰值');
t(displayBetaAt(1, 0.98) === 0, 'u=1 → β=0（抵达时无畸变）');
t(displayBetaAt(-5, 0.98) === 0 && displayBetaAt(9, 0.98) === 0, 'u 越界被钳制到端点');
let peakOk = true;
for (let u = 0; u <= 1; u += 0.01) if (displayBetaAt(u, 0.98) > 0.98 + 1e-15) peakOk = false;
t(peakOk, '全程 β 不超过给定峰值');

sec('亮度增益 ∝D⁴');
t(rel(brightnessGain(1, 0.98), Math.pow(doppler(1, 0.98), 4), 1e-12), 'D⁴ 关系正确');
const lumRatio = brightnessGain(1, 0.98) / brightnessGain(-1, 0.98);
t(lumRatio > 9e7, `前后亮度动态范围 = ${lumRatio.toExponential(3)} → 必须 tone mapping`);
t(brightnessGain(0, 0) === 1, 'β=0 时增益为 1（无频移，亮度不变）');

/* ============================================================ */
console.log('\n' + (fail === 0 ? `✅ 全部通过（${count} 项断言）` : `❌ 失败 ${fail} / ${count} 项`));
process.exit(fail === 0 ? 0 : 1);
