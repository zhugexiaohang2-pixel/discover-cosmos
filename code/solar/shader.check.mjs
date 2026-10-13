/* 数学与实际 shader 接口检查；GPU 执行另见 render-check.html。 */
import { PerspectiveCamera, Vector3 } from '../vendor/three.module.js';
import { FOV_DEG } from './solarsystem.js';
import { doppler, unaberrateDirection } from './rel.js';
import { POST_FRAGMENT, STAR_FRAGMENT } from './shaders.js';
let count = 0, fail = 0;
const t = (ok, message) => { count++; if (!ok) fail++; console.log(`${ok ? '  PASS  ' : '  FAIL  '}${message}`); };
const tan = Math.tan(FOV_DEG * Math.PI / 360);
for (const aspect of [1, 16 / 9, 21 / 9, 0.6]) {
  const camera = new PerspectiveCamera(FOV_DEG, aspect, 0.01, 2000);
  camera.updateMatrixWorld();
  for (const x of [-1, -0.5, 0, 0.37, 1]) for (const y of [-1, -0.3, 0, 0.72, 1]) {
    const expected = new Vector3(x, y, 0).unproject(camera).normalize();
    const ray = new Vector3(x * aspect * tan, y * tan, -1).normalize();
    t(ray.distanceTo(expected) < 1e-12, `真实 three.js 透视相机与光线重建一致 (${aspect},${x},${y})`);
  }
}
// 独立四动量 boost 基准：在 -z 为前方的观察系中把光子变回源系。
for (const beta of [0, 0.5, 0.9, 0.98, 0.995]) {
  const g = 1 / Math.sqrt(1 - beta * beta);
  for (const degrees of [0, 15, 30, 89, 180]) {
    const radians = degrees * Math.PI / 180;
    const d = [Math.sin(radians), 0, -Math.cos(radians)];
    const energy = g * (1 + beta * d[2]);
    const source = [d[0] / energy, 0, g * (d[2] + beta) / energy];
    const got = unaberrateDirection(d, [0, 0, -1], beta);
    t(Math.hypot(...got.map((v, i) => v - source[i])) < 1e-12, `完整逆映射与四动量 boost 一致 β=${beta},θ=${degrees}`);
    t(Math.abs(Math.hypot(...got) - 1) < 1e-12, `源方向单位长度 β=${beta},θ=${degrees}`);
  }
}
for (const axis of [[1, 0, 0], [0, 1, 0], [1, 2, -3]]) {
  const a = new Vector3(...axis).normalize(), d = new Vector3(0.2, 0.5, -0.9).normalize();
  const beta = 0.8, g = 5 / 3, c = d.dot(a);
  // 任意轴四动量变换：p_parallel'=γ(p_parallel-βp0), p_perp'=p_perp。
  const spatial = d.clone().addScaledVector(a, (g - 1) * c - g * beta);
  const expected = spatial.multiplyScalar(1 / (g * (1 - beta * c)));
  const got = new Vector3(...unaberrateDirection(d.toArray(), axis, beta));
  t(got.distanceTo(expected) < 1e-12, `任意运动轴映射 ${axis}`);
}
t(unaberrateDirection([0, 0, 0], [1, 0, 0], 0.5) === null, '零来向被拒绝');
t(unaberrateDirection([0, 0, 1], [0, 0, 0], 0.5) === null, '零运动轴被拒绝');
t(unaberrateDirection([NaN, 0, 1], [1, 0, 0], 0.5) === null, '非有限来向被拒绝');
t(Math.abs(doppler(1, 0.6) - 2) < 1e-12, '前向 β=0.6 的多普勒金标准为 2');
t(Math.abs(doppler(-1, 0.6) - 0.5) < 1e-12, '后向 β=0.6 的多普勒金标准为 0.5');
// 保证检查针对正式 shader 的接口；这些静态检查不宣称代替 GPU 执行。
for (const uniform of ['uVelocityDir', 'uSkyRotation', 'uTanHalfFov', 'uAspect', 'uRaw']) {
  t(POST_FRAGMENT.includes(uniform), `正式 shader 包含接口 ${uniform}`);
}
t(!STAR_FRAGMENT.includes('smoothstep(0.25, 0.0'), '星点使用有定义的 smoothstep 边界顺序');
console.log(`\n${fail ? `❌ 失败 ${fail} / ${count} 项` : `✅ 全部通过（${count} 项断言）`}`);
process.exitCode = fail ? 1 : 0;
