import { loadThree } from '../three-loader.js';
import { createTargets, createPostMaterial, renderScenePass } from './rendering.js';
import { ORBITS } from './solarsystem.js';
const results = document.getElementById('results'), summary = document.getElementById('summary');
document.getElementById('environment').textContent = navigator.userAgent;
let count = 0, fail = 0;
function check(ok, message) {
  count++; if (!ok) fail++;
  const li = document.createElement('li'); li.className = ok ? '' : 'fail';
  li.textContent = `${ok ? 'PASS' : 'FAIL'} ${message}`; results.appendChild(li);
}
const waitFor = async (condition) => {
  const deadline = performance.now() + 20000;
  while (performance.now() < deadline) {
    if (condition()) return;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error('等待页面启动超过 20 秒');
};
const srgb = (x) => x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055;
const distance = (a, b) => Math.hypot(...a.map((v, i) => v - b[i]));
async function run() {
  const THREE = await loadThree();
  const renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('check-canvas'), alpha: true });
  renderer.setSize(256, 256, false); renderer.toneMapping = THREE.NoToneMapping;
  const { screenRT, cubeRT } = createTargets(THREE, renderer, 256, 256, 256, true);
  const output = new THREE.WebGLRenderTarget(256, 256);
  const sky = new THREE.Scene();
  // 方向编码天球是独立 GPU 基准：每个世界方向编码为 (direction+1)/2。
  const sphere = new THREE.Mesh(new THREE.SphereGeometry(100, 64, 32), new THREE.ShaderMaterial({
    side: THREE.BackSide, vertexShader: `varying vec3 direction; void main() {
      direction=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: `precision highp float; varying vec3 direction;
      void main() { gl_FragColor=vec4((normalize(direction)+1.0)*0.5,1.0); }`
  }));
  sky.add(sphere);
  new THREE.CubeCamera(0.1, 200, cubeRT).update(renderer, sky);
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(30, 1, 0.01, 100);
  renderScenePass(renderer, scene, camera, screenRT);
  const material = createPostMaterial(THREE, screenRT.texture, cubeRT.texture, 30);
  const uniforms = material.uniforms;
  uniforms.uRaw.value = 1;
  const post = new THREE.Scene(), postCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material); post.add(quad);
  const pixels = new Uint8Array(256 * 256 * 4);
  function render() {
    renderer.setRenderTarget(output); renderer.render(post, postCamera);
    renderer.readRenderTargetPixels(output, 0, 0, 256, 256, pixels);
    renderer.setRenderTarget(null); renderer.render(post, postCamera);
  }
  const pixel = (x, y) => Array.from(pixels.slice((y * 256 + x) * 4, (y * 256 + x) * 4 + 3));
  const expected = (x, y) => {
    const d = new THREE.Vector3((2 * (x + 0.5) / 256 - 1) * Math.tan(Math.PI / 12),
      (2 * (y + 0.5) / 256 - 1) * Math.tan(Math.PI / 12), -1).normalize();
    d.applyMatrix3(uniforms.uSkyRotation.value);
    return d.toArray().map((v) => Math.round(srgb((v + 1) / 2) * 255));
  };
  render();
  for (const [x, y] of [[128, 128], [16, 16], [239, 239]]) {
    check(distance(pixel(x, y), expected(x, y)) < 5, `β=0 GPU 世界方向 (${x},${y})`);
  }
  const zeroImage = pixels.slice();
  uniforms.uHasRel.value = 0; uniforms.uBeta.value = 0.98; render();
  check(pixels.every((v, i) => v === zeroImage[i]), '关闭相对论与 β=0 逐像素一致');
  uniforms.uHasRel.value = 1; uniforms.uBeta.value = 0;
  uniforms.uSkyRotation.value.setFromMatrix4(new THREE.Matrix4().makeRotationY(Math.PI / 2)); render();
  check(distance(pixel(128, 128), expected(128, 128)) < 5, '旋转相机后仍采样正确世界方向');
  uniforms.uSkyRotation.value.identity(); uniforms.uBeta.value = 0.6; render();
  check(pixel(128, 128)[0] > 240 && pixel(128, 128)[1] > 240, '前向 β=0.6 蓝移增亮，没有反成后向红移');
  const kelvin = (temperature) => {
    const t = Math.max(1000, Math.min(40000, temperature)) / 100;
    const rgb = t <= 66
      ? [255, 99.4708025861 * Math.log(t) - 161.1195681661,
        t <= 19 ? 0 : 138.5177312231 * Math.log(t - 10) - 305.0447927307]
      : [329.698727446 * (t - 60) ** -0.1332047592,
        288.1221695283 * (t - 60) ** -0.0755148492, 255];
    return rgb.map((v) => (Math.max(0, Math.min(255, v)) / 255) ** 2.2);
  };
  uniforms.uExposure.value = 0.02;
  for (const axis of [[0, 0, -1], [1, 2, -3]]) {
    uniforms.uVelocityDir.value.set(...axis).normalize(); render();
    for (const [x, y] of [[16, 32], [128, 128], [239, 220]]) {
      const d = new THREE.Vector3((2 * (x + 0.5) / 256 - 1) * Math.tan(Math.PI / 12),
        (2 * (y + 0.5) / 256 - 1) * Math.tan(Math.PI / 12), -1).normalize();
      const a = uniforms.uVelocityDir.value, c = d.dot(a), g = 1.25;
      const energy = g * (1 - 0.6 * c), D = 1 / energy;
      const source = d.clone().addScaledVector(a, (g - 1) * c - g * 0.6).divideScalar(energy);
      const base = kelvin(5800), tint = kelvin(5800 * D);
      const want = source.toArray().map((v, i) => Math.round(srgb(Math.min(1,
        (v + 1) * 0.5 * D ** 4 * tint[i] / Math.max(0.0001, base[i]) * 0.02)) * 255));
      check(distance(pixel(x, y), want) < 6, `GPU 完整逆 boost，运动轴 ${axis}，像素 (${x},${y})`);
    }
  }
  uniforms.uExposure.value = 1;
  uniforms.uVelocityDir.value.set(0, 0, 1); render();
  check(pixel(128, 128)[0] < 80 && pixel(128, 128)[1] < 80, '后向 β=0.6 红移变暗');
  uniforms.uVelocityDir.value.set(0, 0, -1);
  const planet = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.2), new THREE.MeshBasicMaterial({ color: 0x6699cc }));
  planet.position.z = -1; scene.add(planet);
  renderScenePass(renderer, scene, camera, screenRT);
  const scenePixels = new Uint8Array(256 * 256 * 4);
  renderer.readRenderTargetPixels(screenRT, 0, 0, 256, 256, scenePixels);
  check(scenePixels[3] === 0 && scenePixels[(128 * 256 + 128) * 4 + 3] === 255,
    '实际 Scene pass 背景透明、实体不透明');
  uniforms.uBeta.value = 0; render(); const bodyColor = pixel(128, 128);
  uniforms.uBeta.value = 0.98; render();
  check(distance(bodyColor, pixel(128, 128)) === 0, '有限距离实体在 β=0.98 仍可辨认');
  check(renderer.getContext().getError() === 0, '真实 shader 与 framebuffer 无 WebGL 错误');

  const iframe = document.getElementById('app');
  iframe.src = './index.html?test=1&rt=byte';
  await waitFor(() => iframe.contentWindow.__solarTest);
  const app = iframe.contentWindow.__solarTest, doc = iframe.contentDocument;
  check(doc.getElementById('hud-note').textContent.includes('37.29'), '实际 HUD 一程参考下限为 37.29 分钟');
  const initial = app.snapshot();
  check(initial.sky.ok && initial.sky.nonZero > 0, '实际页面星空立方体包含非零像素');
  check(initial.screen.ok && initial.screen.maxA > 0, '实际页面主场景包含实体');
  doc.getElementById('r-duration').value = '6';
  doc.getElementById('r-duration').dispatchEvent(new Event('input', { bubbles: true }));
  for (const body of ORBITS) {
    app.reset(); app.advance(0.1); app.select(body.id); app.advance(6);
    const arrived = app.snapshot();
    app.advance(0.1); const docked = app.snapshot();
    const fraction = arrived.radius / (arrived.distance * Math.tan(Math.PI / 12));
    check(!arrived.flying && arrived.alignment > 0.9999 && Math.abs(fraction - 0.25) < 0.002,
      `${body.id} 抵达后居中、画面占比约 25%`);
    check(distance(arrived.camera, docked.camera) < arrived.distance * 0.1,
      `${body.id} 飞行与环绕交接连续`);
    check(docked.glError === 0 && docked.screen.nonZero > 0, `${body.id} 抵达与停留持续渲染`);
    await new Promise((r) => setTimeout(r, 0));
  }
  app.reset(); app.advance(0.1); app.select('earth'); app.advance(3);
  doc.dispatchEvent(new iframe.contentWindow.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  app.advance(0.1);
  check(!app.snapshot().flying && app.snapshot().selected === null && doc.getElementById('hud-beta').textContent === '0.0000',
    '飞行中 Esc 返回俯瞰并清零 HUD');
  doc.getElementById('r-ed').value = '0.75';
  doc.getElementById('r-ed').dispatchEvent(new Event('input', { bubbles: true })); app.advance(0.1);
  check(app.snapshot().selected === null && app.snapshot().glError === 0, '修改距离尺度后轨道重建、状态可用');
  const cards = document.getElementById('cards'); cards.src = '../index.html#/p/earth';
  await waitFor(() => cards.contentDocument?.querySelectorAll('.is-baked').length === 8);
  await waitFor(() => cards.contentDocument?.getElementById('hero').classList.contains('is-live'));
  check(cards.contentDocument.querySelectorAll('.is-baked').length === 8, '八张卡牌完成烘焙');
  check(cards.contentDocument.getElementById('a-zh').textContent === '地球', '深链接正确展示地球阅读页');
  cards.contentDocument.getElementById('btn-back').click();
  await waitFor(() => !cards.contentDocument.getElementById('view-index').hidden);
  check(!cards.contentDocument.getElementById('view-index').hidden, '深链接返回按钮留在图鉴首页');
  summary.textContent = `${fail ? 'FAIL' : 'PASS'}：${count - fail}/${count} 项浏览器检查通过；${fail} 项失败。`;
  window.__renderCheck = { count, fail, userAgent: navigator.userAgent,
    executedAt: new Date().toISOString(), results: Array.from(results.children, (li) => li.textContent) };
  const download = document.getElementById('download-result');
  download.href = 'data:application/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(window.__renderCheck, null, 2));
  download.hidden = false;
  sphere.geometry.dispose(); sphere.material.dispose(); planet.geometry.dispose(); planet.material.dispose();
  quad.geometry.dispose(); material.dispose(); output.dispose(); cubeRT.dispose(); screenRT.dispose(); renderer.dispose();
}
run().catch((error) => {
  check(false, error.message); summary.textContent = `FAIL：${count - fail}/${count} 项通过；${error.message}`;
  console.error(error); window.__renderCheck = { count, fail, error: error.message };
});
