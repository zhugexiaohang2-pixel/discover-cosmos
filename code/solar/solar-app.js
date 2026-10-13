/* 太阳系教学演示。
 * 静态星空在世界系原点烘焙为立方体；每帧绘制透明主场景并合成。
 * 星空按相机位移方向做完整逆光行差与 D^4 增益，RGB 调色是近似。
 * 太阳与行星保持有限距离的几何显示，不做相对论再投影与光传播时延。
 */

import { PLANETS } from '../planets.js';
import { makePlanetTexture, makePlanetMaterial } from '../planet-visuals.js';
import { loadThree } from '../three-loader.js';
import { createTargets, createPostMaterial, renderScenePass } from './rendering.js';
import { STAR_VERTEX, STAR_FRAGMENT } from './shaders.js';
import { ORBITS, EARTH_RADIUS_KM, FOV_DEG, TIME_SCALE, defaultSpan, fullSpan,
  compressA, worldRadius, closeDistance as nearDistance, positionAt, orbitPoints, sunDiaFrac } from './solarsystem.js';
import {
  clampBeta, gamma as lorentzGamma, doppler, displayBetaAt, minTripSeconds, AU
} from './rel.js';

const STAR_COUNT = 8000;
const BAND_COUNT = 4000;
const CUBE_FACE = 1024;
const SKY_RADIUS = 500; // 世界单位。必须 < 相机的 far
const TEST_MODE = new URLSearchParams(location.search).get('test') === '1';

/**
 * 调试模式：?debug=xxx。用于逐段隔离渲染管线。
 *   nopost  跳过后期，直接显示主场景（行星 + 轨道线 + 太阳，背景为纯色）
 *   nosky   跳过星空立方体贴图（把星空当作纯黑）
 *   skyonly 只显示星空（跳过主场景）
 *   beta0   把 β 强制为 0（关闭光行差与多普勒）
 *   raw     关闭 ACES 曝光压缩，直接看线性值
 *   diag    每两秒按需打印诊断；不影响普通模式
 */
const DEBUG = (() => {
  const q = new URLSearchParams(location.search).get('debug') || '';
  const flags = new Set(q.split(/[,+]/).filter(Boolean));
  return {
    nopost: flags.has('nopost'),
    nosky: flags.has('nosky'),
    skyonly: flags.has('skyonly'),
    beta0: flags.has('beta0'),
    raw: flags.has('raw'),
    diag: flags.has('diag'),
    any: flags.size > 0,
    label: [...flags].join(',')
  };
})();

const el = {
  gl: document.getElementById('gl'),
  labels: document.getElementById('labels'),
  selcard: document.getElementById('selcard'),
  selZh: document.getElementById('sel-zh'),
  selEn: document.getElementById('sel-en'),
  selTag: document.getElementById('sel-tag'),
  selLink: document.getElementById('sel-link'),
  hudBeta: document.getElementById('hud-beta'),
  hudGamma: document.getElementById('hud-gamma'),
  hudTau: document.getElementById('hud-tau'),
  hudDop: document.getElementById('hud-dop'),
  hudNote: document.getElementById('hud-note'),
  panel: document.getElementById('panel'),
  hint: document.getElementById('hint'),
  boot: document.getElementById('boot')
};

/* ============================================================
   运行时参数（面板可调；默认值与 solarsystem.js 中的常量一致）
   ============================================================ */
const P = {
  duration: 20,   // 一程演示时长（秒，与真实距离没有物理对应）
  betaPeak: 0.98, // 显示用峰值 β（叙事参数）
  ED: 0.5,        // 距离幂指数
  ER: 0.45,       // 半径幂指数
  BASE: 0.006,    // 行星显示直径占视野高度的比例
  relativity: true
};

const worldR = (radiusKm, span) => worldRadius(radiusKm, span, P);

/* ============================================================
   星空：球面均匀分布 + 色温着色 + 银河带
   ============================================================ */
function kelvinToRGB(kelvin) {
  // 黑体色温的常用近似（Tanner Helland 拟合），返回线性 0..1
  const t = Math.max(1000, Math.min(40000, kelvin)) / 100;
  let r, g, b;
  if (t <= 66) {
    r = 255;
    g = 99.4708025861 * Math.log(t) - 161.1195681661;
    b = t <= 19 ? 0 : 138.5177312231 * Math.log(t - 10) - 305.0447927307;
  } else {
    r = 329.698727446 * Math.pow(t - 60, -0.1332047592);
    g = 288.1221695283 * Math.pow(t - 60, -0.0755148492);
    b = 255;
  }
  const cl = (v) => Math.max(0, Math.min(255, v)) / 255;
  // 转到近似线性空间，方便后续做物理亮度叠加
  return [Math.pow(cl(r), 2.2), Math.pow(cl(g), 2.2), Math.pow(cl(b), 2.2)];
}

function buildStarGeometry(THREE) {
  const n = STAR_COUNT + BAND_COUNT;
  const pos = new Float32Array(n * 3);
  const col = new Float32Array(n * 3);
  const size = new Float32Array(n);
  const bright = new Float32Array(n);
  const p = new THREE.Vector3();
  const bandNormal = new THREE.Vector3(0.42, 0.74, -0.52).normalize();
  // 预先算好从 (0,1,0) 转到银河带法向的旋转，避免每颗星都新建一个四元数
  const bandQ = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), bandNormal);

  let seed = 20261013;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };

  for (let i = 0; i < n; i++) {
    const inBand = i >= STAR_COUNT;
    if (inBand) {
      // 银河带：沿一个大圆聚集，纬度方向用近似高斯衰减
      const lon = rnd() * Math.PI * 2;
      const lat = (rnd() + rnd() + rnd() - 1.5) * 0.22;
      const cosLat = Math.cos(lat);
      p.set(Math.cos(lon) * cosLat, Math.sin(lat), Math.sin(lon) * cosLat);
      p.applyQuaternion(bandQ);
    } else {
      const u = rnd() * 2 - 1;
      const phi = rnd() * Math.PI * 2;
      const s = Math.sqrt(Math.max(0, 1 - u * u));
      p.set(s * Math.cos(phi), s * Math.sin(phi), u);
    }
    const L = p.length() || 1;
    pos[i * 3] = (p.x / L) * SKY_RADIUS;
    pos[i * 3 + 1] = (p.y / L) * SKY_RADIUS;
    pos[i * 3 + 2] = (p.z / L) * SKY_RADIUS;

    // 色温分布：偏向冷色，少量红巨星
    const roll = rnd();
    const K = roll < 0.02 ? 2800 + rnd() * 900
      : roll < 0.2 ? 3400 + rnd() * 1600
      : roll < 0.78 ? 5200 + rnd() * 2800
      : 9000 + rnd() * 16000;
    const c = kelvinToRGB(K);
    col[i * 3] = c[0]; col[i * 3 + 1] = c[1]; col[i * 3 + 2] = c[2];

    // 亮度：幂律分布，少数亮星
    const mag = Math.pow(rnd(), 3.2);
    bright[i] = (inBand ? 0.34 : 1.0) * (0.18 + mag * 1.9);
    size[i] = (inBand ? 0.7 : 1.0) * (0.85 + mag * 2.3);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
  geo.setAttribute('aBright', new THREE.BufferAttribute(bright, 1));
  return geo;
}

/* ============================================================
   主程序
   ============================================================ */
let THREE;
async function boot() {
  try {
    THREE = await loadThree();
  } catch (err) {
    el.boot.classList.add('is-error');
    el.boot.querySelector('.boot__inner').innerHTML =
      '无法载入本地 three.js。请确认 vendor 目录完整，并通过 HTTP 服务打开。<br><br>' +
      '<span style="opacity:.7">' + String(err && err.message || err) + '</span>';
    return;
  }
  try {
    start();
  } catch (err) {
    el.boot.classList.add('is-error');
    el.boot.querySelector('.boot__inner').innerHTML =
      '初始化失败：<br>' + String(err && err.message || err);
    console.error(err);
  }
}

function start() {
  /* ---------- 渲染器 ---------- */
  const renderer = new THREE.WebGLRenderer({
    canvas: el.gl, antialias: true, alpha: false, powerPreference: 'high-performance'
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  // 关键：关闭渲染器自带的 tone mapping。场景先渲染到线性 HDR 目标，
  // 由后处理统一做 ACES，否则星空与主场景会经历两次不同的映射。
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.setClearColor(0x000000, 0);

  /* ---------- 主场景 ---------- */
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(FOV_DEG, window.innerWidth / window.innerHeight, 0.01, 5000);
  camera.up.set(0, 1, 0);
  camera.position.set(0, 7.0, 20);
  camera.lookAt(0, 0, 0);

  scene.add(new THREE.AmbientLight(0xffffff, 0.16));
  const sunLight = new THREE.PointLight(0xfff2d8, 3.0, 0, 0);
  sunLight.position.set(0, 0, 0);
  scene.add(sunLight);

  /* ---------- 太阳 ---------- */
  // 太阳不参与幂律（它是光源），用固定的视野占比，保证明显是主角
  const sunTex = makePlanetTexture(THREE, {
    id: 'sun', c1: '#fff6d0', c2: '#ff9a2e', rough: 0.35
  });
  const sunMat = new THREE.MeshBasicMaterial({ map: sunTex });
  const sunMesh = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 48), sunMat);
  scene.add(sunMesh);
  const sunGlow = new THREE.Mesh(
    new THREE.SphereGeometry(1, 32, 24),
    new THREE.MeshBasicMaterial({
      color: 0xffb457, transparent: true, opacity: 0.14,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.BackSide
    })
  );
  scene.add(sunGlow);

  /* ---------- 行星 ---------- */
  const byId = {};
  PLANETS.forEach((p) => { byId[p.id] = p; });

  const bodies = ORBITS.map((o) => {
    const meta = byId[o.id];
    const tex = makePlanetTexture(THREE, meta);
    const mat = makePlanetMaterial(THREE, meta, tex);
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 48), mat);
    mesh.userData.tex = tex;
    scene.add(mesh);

    // 轨道线
    const lineGeo = new THREE.BufferGeometry().setFromPoints(
      orbitPoints(o, 320, P).map((p) => new THREE.Vector3(...p))
    );
    const lineMat = new THREE.LineBasicMaterial({
      color: new THREE.Color(meta.c1).multiplyScalar(0.5),
      transparent: true, opacity: 0.3
    });
    const line = new THREE.LineLoop(lineGeo, lineMat);
    scene.add(line);

    // DOM 标签
    const label = document.createElement('button');
    label.type = 'button';
    label.title = '飞抵' + meta.nameZh;
    label.setAttribute('aria-label', '飞抵' + meta.nameZh);
    label.className = 'label';
    label.innerHTML = '<span class="label__zh"></span><span class="label__en"></span>';
    label.querySelector('.label__zh').textContent = meta.nameZh;
    label.querySelector('.label__en').textContent = meta.nameEn;
    label.addEventListener('click', (e) => { e.stopPropagation(); selectPlanet(o.id); });
    el.labels.appendChild(label);

    return { o, meta, mesh, line, label, pos: new THREE.Vector3() };
  });

  /* ---------- 星空场景（独立 scene，便于相机置于原点）---------- */
  const skyScene = new THREE.Scene();
  const starGeo = buildStarGeometry(THREE);
  const starUniforms = {
    uPixelScale: { value: CUBE_FACE / 2 },
    uSizeScale: { value: 1 }
  };
  const starMat = new THREE.ShaderMaterial({
    uniforms: starUniforms,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: STAR_VERTEX,
    fragmentShader: STAR_FRAGMENT
  });
  const starPoints = new THREE.Points(starGeo, starMat);
  starPoints.frustumCulled = false;
  skyScene.add(starPoints);

  const dpr = renderer.getPixelRatio();
  const targets = createTargets(THREE, renderer,
    Math.max(1, Math.floor(window.innerWidth * dpr)),
    Math.max(1, Math.floor(window.innerHeight * dpr)), CUBE_FACE,
    new URLSearchParams(location.search).get('rt') === 'byte');
  const { cubeRT, screenRT } = targets;
  console.info('[solar] 渲染目标类型 =', targets.hdr ? 'HalfFloat (HDR)' : 'UnsignedByte (降级)');
  const cubeCam = new THREE.CubeCamera(0.1, 2000, cubeRT);
  // 静态星空只烘焙一次，坐标固定在世界系；后处理用相机旋转采样。
  renderer.setClearColor(0x000000, 0);
  if (!DEBUG.nosky) cubeCam.update(renderer, skyScene);
  else for (let face = 0; face < 6; face++) {
    renderer.setRenderTarget(cubeRT, face);
    renderer.clear();
  }
  renderer.setRenderTarget(null);

  const postScene = new THREE.Scene();
  const postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const postMat = createPostMaterial(THREE, screenRT.texture, cubeRT.texture, FOV_DEG);
  const postUniforms = postMat.uniforms;
  const postQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), postMat);
  postQuad.frustumCulled = false;
  postScene.add(postQuad);

  /* ============================================================
     像素回读遥测：把"黑屏"定位到具体哪一级
     ------------------------------------------------------------
     在控制台打印三件事，用于区分四种故障：
       skyMax > 0  且  planetAlpha > 0  → 管线正常，问题在后期合成
       skyMax == 0                      → 星空没渲染进立方体贴图
       planetAlpha == 0                 → 主场景没渲染出行星（几何/材质/相机问题）
       抛异常                           → 该渲染目标不可回读（格式问题）
     ============================================================ */
  function readTargetStats(target, face) {
    try {
      const w = target.width, h = target.height;
      if (target.texture.type !== THREE.UnsignedByteType) {
        return { ok: false, err: 'HDR 目标不做字节回读；使用 ?debug=diag&rt=byte 检查像素' };
      }
      const px = new Uint8Array(w * h * 4);
      const gl = renderer.getContext();
      const priorError = gl.getError();
      if (priorError !== gl.NO_ERROR) return { ok: false, err: '读取前已有 WebGL 错误 ' + priorError };
      if (face === undefined) renderer.readRenderTargetPixels(target, 0, 0, w, h, px);
      else renderer.readRenderTargetPixels(target, 0, 0, w, h, px, face);
      const error = gl.getError();
      if (error !== gl.NO_ERROR) return { ok: false, err: '像素读取 WebGL 错误 ' + error };
      let maxR = 0, maxA = 0, nonZero = 0;
      for (let i = 0; i < px.length; i += 4) {
        maxR = Math.max(maxR, px[i], px[i + 1], px[i + 2]);
        maxA = Math.max(maxA, px[i + 3]);
        if (px[i] || px[i + 1] || px[i + 2]) nonZero++;
      }
      return { ok: true, maxR, maxA, nonZero, total: w * h };
    } catch (e) {
      return { ok: false, err: String(e && e.message || e) };
    }
  }

  let lastDiag = -Infinity;
  function diagnostics(now) {
    if (!DEBUG.diag || now - lastDiag < 2000) return;
    lastDiag = now;
    const skyPx = readTargetStats(cubeRT, 0);
    const scrPx = readTargetStats(screenRT);
    const line = (n, o) => o.ok
      ? `${n}: ok  maxRGB=${o.maxR}  maxAlpha=${o.maxA}  非零像素=${o.nonZero}/${o.total}`
      : `${n}: 回读失败 → ${o.err}`;
    console.log(
      '[solar diag]\n  ' + line('立方体贴图(face0,星空)', skyPx) +
      '\n  ' + line('屏幕目标(主场景)', scrPx) +
      `\n  β=${state.beta.toFixed(4)}  span=${state.span.toFixed(3)}  selected=${state.selected}` +
      `\n  camera=(${camera.position.x.toFixed(3)}, ${camera.position.y.toFixed(3)}, ${camera.position.z.toFixed(3)})` +
      `  near=${camera.near.toExponential(2)}  far=${camera.far.toFixed(0)}` +
      `\n  行星世界半径=${worldR(EARTH_RADIUS_KM, state.span).toExponential(3)}  星空半径=${SKY_RADIUS}`
    );
  }

  /* ============================================================
     状态与相机编排
     ============================================================ */
  const state = {
    span: defaultSpan(P),
    spanTarget: defaultSpan(P),
    az: 0.35,          // 方位角
    el: 20 * Math.PI / 180, // 俯角让黄道面可辨，水星倾角约 7°
    selected: null,
    flying: false,
    flyT: 0,
    flightDuration: P.duration,
    flightSpan: defaultSpan(P),
    approach: new THREE.Vector3(),
    orbitDistance: 1,
    orbitDistanceTarget: 1,
    flyFrom: { pos: new THREE.Vector3(), quat: new THREE.Quaternion() },
    beta: 0,
    simTime: 0,
    lastReal: 0,
    tau: 0,
    stopped: false
  };

  const flyTo = { pos: new THREE.Vector3(), quat: new THREE.Quaternion() };
  const tmpV = new THREE.Vector3();
  const tmpV2 = new THREE.Vector3();
  const tmpQ = new THREE.Quaternion();
  const tmpM = new THREE.Matrix4();
  // 复用的临时对象（热路径里绝不 new，否则每帧产生大量垃圾）
  const tmpLook = new THREE.Matrix4();
  const tmpUp = new THREE.Vector3(0, 1, 0);
  const tmpOrigin = new THREE.Vector3(0, 0, 0);
  const tmpProj = new THREE.Vector3();

  /** 由方位角/俯角/跨度求相机位置与朝向（看向原点） */
  function overviewCam(span, az, el2, out) {
    const dist = (span / 2) / Math.tan((FOV_DEG * Math.PI) / 180 / 2);
    const ce = Math.cos(el2);
    out.pos.set(
      dist * ce * Math.cos(az),
      dist * Math.sin(el2),
      dist * ce * Math.sin(az)
    );
    tmpLook.lookAt(out.pos, tmpOrigin, tmpUp);
    out.quat.setFromRotationMatrix(tmpLook);
    return dist;
  }

  function selectPlanet(id) {
    if (state.flying) return;
    const b = bodies.find((x) => x.o.id === id);
    if (!b) return;
    state.selected = id;
    el.selcard.hidden = false;
    el.selZh.textContent = b.meta.nameZh;
    el.selEn.textContent = b.meta.nameEn;
    el.selTag.textContent = b.meta.tagline;
    el.selLink.href = '../index.html#/p/' + id;
    bodies.forEach((x) => {
      x.label.classList.toggle('is-active', x.o.id === id);
      x.label.setAttribute('aria-pressed', String(x.o.id === id));
    });

    // 记录起点
    state.flyFrom.pos.copy(camera.position);
    state.flyFrom.quat.copy(camera.quaternion);
    state.flying = true;
    state.flyT = 0;
    state.flightDuration = P.duration;
    state.flightSpan = state.span;
    state.approach.copy(camera.position).sub(b.pos).normalize();
    if (state.approach.lengthSq() < 1e-12) state.approach.set(1, 0.3, 0.6).normalize();
    state.tau = 0;
    el.gl.classList.add('is-flying');
    el.hint.classList.add('is-hidden');
  }

  function clearSelection() {
    state.selected = null;
    el.selcard.hidden = true;
    bodies.forEach((x) => {
      x.label.classList.remove('is-active');
      x.label.setAttribute('aria-pressed', 'false');
    });
  }

  function arrivalFor(b) {
    const d = nearDistance(b.o.radiusKm, state.flightSpan, P);
    flyTo.pos.copy(b.pos).addScaledVector(state.approach, d);
    tmpLook.lookAt(flyTo.pos, b.pos, tmpUp);
    flyTo.quat.setFromRotationMatrix(tmpLook);
  }

  function resetOverview() {
    state.flying = false;
    state.beta = 0;
    state.tau = 0;
    state.span = defaultSpan(P);
    state.spanTarget = state.span;
    state.az = 0.35;
    state.el = 20 * Math.PI / 180;
    el.gl.classList.remove('is-flying');
    el.hint.classList.remove('is-hidden');
    clearSelection();
  }

  /* ============================================================
     交互
     ============================================================ */
  let drag = null;
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  el.gl.addEventListener('pointerdown', (e) => {
    if (state.flying) return;
    drag = { x: e.clientX, y: e.clientY, az: state.az, el: state.el };
    el.gl.setPointerCapture && el.gl.setPointerCapture(e.pointerId);
  });
  el.gl.addEventListener('pointermove', (e) => {
    if (!drag || state.flying) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    state.az = drag.az - dx * 0.004;
    state.el = Math.max(-1.45, Math.min(1.45, drag.el + dy * 0.004));
  });
  const endDrag = () => { drag = null; };
  el.gl.addEventListener('pointerup', (e) => {
    if (drag && !state.flying && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 5) {
      const rect = el.gl.getBoundingClientRect();
      pointer.set((e.clientX - rect.left) / rect.width * 2 - 1,
        1 - (e.clientY - rect.top) / rect.height * 2);
      raycaster.setFromCamera(pointer, camera);
      const hit = raycaster.intersectObjects(bodies.map((b) => b.mesh), false)[0];
      if (hit) selectPlanet(bodies.find((b) => b.mesh === hit.object).o.id);
    }
    endDrag();
  });
  el.gl.addEventListener('pointercancel', endDrag);
  el.gl.addEventListener('pointerleave', endDrag);

  el.gl.addEventListener('wheel', (e) => {
    if (state.flying) return;
    e.preventDefault();
    const k = Math.exp(e.deltaY * 0.0012);
    if (state.selected) {
      const body = bodies.find((b) => b.o.id === state.selected);
      const radius = worldR(body.o.radiusKm, state.flightSpan);
      state.orbitDistanceTarget = Math.max(radius * 1.8,
        Math.min(nearDistance(body.o.radiusKm, state.flightSpan, P) * 10, state.orbitDistanceTarget * k));
    } else {
      state.spanTarget = Math.max(defaultSpan(P) * 0.06, Math.min(fullSpan(P) * 1.6, state.spanTarget * k));
    }
  }, { passive: false });

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      resetOverview();
    } else if (e.key === 'h' || e.key === 'H') {
      el.panel.hidden = !el.panel.hidden;
    }
  });

  /* ============================================================
     面板绑定
     ============================================================ */
  const bind = (id, key, fmt, after) => {
    const r = document.getElementById('r-' + id);
    const v = document.getElementById('v-' + id);
    if (!r) return;
    r.addEventListener('input', () => {
      P[key] = parseFloat(r.value);
      if (v) v.textContent = fmt(P[key]);
      if (after) after();
    });
  };
  bind('duration', 'duration', (v) => v.toFixed(0));
  bind('beta', 'betaPeak', (v) => v.toFixed(3));
  const rebuildScale = () => {
    bodies.forEach((b) => {
      const geo = new THREE.BufferGeometry().setFromPoints(
        orbitPoints(b.o, 320, P).map((p) => new THREE.Vector3(...p)));
      b.line.geometry.dispose();
      b.line.geometry = geo;
    });
    resetOverview();
  };
  bind('ed', 'ED', (v) => v.toFixed(2), rebuildScale);
  bind('er', 'ER', (v) => v.toFixed(2), resetOverview);
  bind('base', 'BASE', (v) => v.toFixed(3), resetOverview);
  document.getElementById('c-aberr').addEventListener('change', (e) => {
    P.relativity = e.target.checked;
  });
  document.getElementById('btn-more').addEventListener('click', () => { el.panel.hidden = !el.panel.hidden; });
  document.getElementById('btn-close-panel').addEventListener('click', () => { el.panel.hidden = true; });

  // 固定参考距离是显示坐标示例，不是任何实际飞行路径的物理航程。
  const referenceD = (compressA(30.06992) - compressA(1)) * AU;
  const tripMin = minTripSeconds(referenceD);
  document.getElementById('v-tripmin').textContent = (tripMin / 60).toFixed(2);
  el.hudNote.textContent = 'β 为演示参数；Δτ 为演示积分。参考显示距离 4.4836 AU，光速下限 ' +
    (tripMin / 60).toFixed(2) + ' 分钟。';

  /* ============================================================
     尺寸与渲染循环
     ============================================================ */
  function resize() {
    const w = window.innerWidth, h = window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    const dpr = renderer.getPixelRatio();
    screenRT.setSize(Math.floor(w * dpr), Math.floor(h * dpr));
    // 后处理重建光线需要同样的宽高比，否则光行差角度会算错
    postUniforms.uAspect.value = w / h;
  }
  window.addEventListener('resize', resize);
  resize();

  const previousPosition = new THREE.Vector3();
  const velocityWorld = new THREE.Vector3(0, 0, -1);

  function frame(now) {
    if (state.stopped) return;
    if (!TEST_MODE) animationId = requestAnimationFrame(frame);
    const dtReal = state.lastReal ? Math.min(0.1, (now - state.lastReal) / 1000) : 0;
    state.lastReal = now;
    previousPosition.copy(camera.position);

    // 模拟时间推进（真实开普勒周期 + 单一全局倍率）
    state.simTime += dtReal * TIME_SCALE;

    // 行星尺寸随视野跨度变化 → 每帧更新
    const spanNow = state.span;
    bodies.forEach((b) => {
      const pos = positionAt(b.o, state.simTime, P);
      b.pos.set(pos.x, pos.y, pos.z);
      b.mesh.position.copy(b.pos);
      b.mesh.scale.setScalar(worldR(b.o.radiusKm, spanNow));
      b.mesh.rotation.y += dtReal * 0.12;
    });
    const sunR = sunDiaFrac() * spanNow / 2;
    sunMesh.scale.setScalar(sunR);
    sunGlow.scale.setScalar(sunR * 1.35);

    // 相机
    if (state.flying && state.selected) {
      const b = bodies.find((x) => x.o.id === state.selected);
      if (b) {
        state.flyT += dtReal;
        const u = state.flyT >= state.flightDuration - 1e-9 ? 1 : state.flyT / state.flightDuration;
        // 位置：缓入缓出
        const e = u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
        arrivalFor(b); // 每帧重算（行星在动）
        tmpV.copy(state.flyFrom.pos).lerp(flyTo.pos, e);
        camera.position.copy(tmpV);
        // 朝向：四元数 slerp，避免万向节问题
        camera.quaternion.copy(state.flyFrom.quat).slerp(flyTo.quat, e);
        state.beta = displayBetaAt(u, P.betaPeak);
        state.tau += dtReal / lorentzGamma(P.relativity && !DEBUG.beta0 ? state.beta : 0);
        if (u >= 1) {
          state.flying = false;
          tmpV.copy(camera.position).sub(b.pos);
          state.orbitDistance = tmpV.length();
          state.orbitDistanceTarget = state.orbitDistance;
          state.az = Math.atan2(tmpV.z, tmpV.x);
          state.el = Math.asin(tmpV.y / state.orbitDistance);
          el.gl.classList.remove('is-flying');
        }
      }
    } else {
      state.beta += (0 - state.beta) * Math.min(1, dtReal * 4);
      // 环绕太阳
      state.span += (state.spanTarget - state.span) * Math.min(1, dtReal * 6);
      const cam = { pos: tmpV2, quat: tmpQ };
      overviewCam(state.span, state.az, state.el, cam);
      if (state.selected) {
        // 停留：绕选中行星缓慢漂移
        const b = bodies.find((x) => x.o.id === state.selected);
        if (b) {
          state.orbitDistance += (state.orbitDistanceTarget - state.orbitDistance) * Math.min(1, dtReal * 6);
          const d = state.orbitDistance;
          state.az += dtReal * 0.06;
          const ce = Math.cos(state.el);
          cam.pos.set(
            b.pos.x + d * ce * Math.cos(state.az),
            b.pos.y + d * Math.sin(state.el),
            b.pos.z + d * ce * Math.sin(state.az)
          );
          tmpLook.lookAt(cam.pos, b.pos, tmpUp);
          cam.quat.setFromRotationMatrix(tmpLook);
        }
      }
      camera.position.copy(cam.pos);
      camera.quaternion.copy(cam.quat);
    }

    // 动态近远平面：跨度巨大，固定 near/far 必然 z-fighting
    let target = null;
    if (state.selected) target = bodies.find((x) => x.o.id === state.selected).pos;
    const dist = target ? camera.position.distanceTo(target) : camera.position.length();
    camera.near = Math.max(1e-5, dist * 1e-4);
    camera.far = Math.max(SKY_RADIUS * 4, dist * 60);
    camera.updateProjectionMatrix();

    renderScenePass(renderer, scene, camera, screenRT,
      { skip: DEBUG.skyonly, opaque: DEBUG.nopost });
    postUniforms.uSceneOnly.value = DEBUG.nopost ? 1 : 0;
    tmpM.makeRotationFromQuaternion(camera.quaternion);
    postUniforms.uSkyRotation.value.setFromMatrix4(tmpM);
    tmpV.copy(camera.position).sub(previousPosition);
    if (state.flying && tmpV.lengthSq() > 1e-16) velocityWorld.copy(tmpV).normalize();
    postUniforms.uVelocityDir.value.copy(velocityWorld).applyQuaternion(tmpQ.copy(camera.quaternion).invert());
    postUniforms.uBeta.value = clampBeta(state.beta);
    postUniforms.uHasRel.value = P.relativity && !DEBUG.beta0 ? 1 : 0;
    postUniforms.uRaw.value = DEBUG.raw ? 1 : 0;

    renderer.render(postScene, postCam);

    updateLabels(spanNow);
    updateHud();
    diagnostics(now);
  }

  /* ============================================================
     标签投影（每帧）
     ============================================================ */
  function updateLabels(spanNow) {
    const w = window.innerWidth, h = window.innerHeight;
    const v = tmpProj;
    const tanHalf = Math.tan(FOV_DEG * Math.PI / 180 / 2);
    bodies.forEach((b) => {
      v.copy(b.pos).project(camera);
      // z 越界或 w<0 表示在相机背后，必须隐藏，否则标签会飞到画面另一侧
      if (v.z > 1 || v.z < -1 || Math.abs(v.x) > 1.06 || Math.abs(v.y) > 1.06) { b.label.style.display = 'none'; return; }
      b.label.style.display = '';
      b.label.style.left = ((v.x * 0.5 + 0.5) * w) + 'px';
      b.label.style.top = ((-v.y * 0.5 + 0.5) * h) + 'px';
      // 远处缩成光点，避免标签糊成一片
      const px = (2 * worldR(b.o.radiusKm, spanNow) /
        (2 * Math.max(1e-6, camera.position.distanceTo(b.pos)) * tanHalf)) * h;
      b.label.classList.toggle('is-far', px < 26);
      b.label.style.marginTop = state.selected === b.o.id ? (px / 2 + 20) + 'px' : '0px';
      b.line.material.opacity = state.selected === b.o.id ? 0.7 : 0.28;
    });
  }

  function updateHud() {
    const b = P.relativity && !DEBUG.beta0 ? state.beta : 0;
    el.hudBeta.textContent = b.toFixed(4);
    el.hudGamma.textContent = lorentzGamma(b).toFixed(3);
    el.hudTau.textContent = state.tau.toFixed(1) + ' s';
    el.hudDop.textContent = doppler(1, b).toFixed(3) + '×';
  }

  /* ---------- 启动 ---------- */
  if (DEBUG.any) {
    el.hint.textContent = '调试模式：' + DEBUG.label + ' · 去掉 ?debug= 恢复正常';
    el.hint.classList.remove('is-hidden');
    console.log('[solar] debug flags =', DEBUG);
  }
  el.boot.classList.add('is-hidden');
  el.boot.setAttribute('aria-hidden', 'true');
  if (!DEBUG.any) setTimeout(() => el.hint.classList.add('is-hidden'), 9000);
  let animationId = 0;
  const stop = () => {
    state.stopped = true;
    cancelAnimationFrame(animationId);
  };
  el.gl.addEventListener('webglcontextlost', (event) => {
    event.preventDefault();
    stop();
    showError('图形上下文已丢失，请重新加载页面。');
  });
  renderer.debug.onShaderError = () => { stop(); showError('着色器编译失败，请查看控制台或尝试其他浏览器。'); };
  window.addEventListener('pagehide', (event) => {
    if (event.persisted) return;
    stop();
    scene.traverse((object) => {
      object.geometry?.dispose();
      object.material?.map?.dispose();
      object.material?.dispose();
    });
    starGeo.dispose(); starMat.dispose();
    postQuad.geometry.dispose(); postMat.dispose();
    cubeRT.dispose(); screenRT.dispose(); renderer.dispose();
  }, { once: true });
  document.addEventListener('visibilitychange', () => { state.lastReal = 0; });
  if (TEST_MODE) {
    window.__solarTest = {
      select: selectPlanet, reset: resetOverview,
      advance: (seconds) => {
        for (let elapsed = 0; elapsed < seconds - 1e-9; elapsed += 0.1) {
          frame(state.lastReal + 100);
        }
      },
      snapshot: () => {
        const body = bodies.find((b) => b.o.id === state.selected);
        const direction = body ? body.pos.clone().sub(camera.position).normalize() : null;
        const forward = camera.getWorldDirection(new THREE.Vector3());
        return { ready: true, selected: state.selected, flying: state.flying,
          beta: state.beta, hdr: targets.hdr, camera: camera.position.toArray(),
          distance: body ? camera.position.distanceTo(body.pos) : null,
          radius: body ? body.mesh.scale.x : null,
          alignment: direction ? direction.dot(forward) : null,
          glError: renderer.getContext().getError(),
          sky: readTargetStats(cubeRT, 0), screen: readTargetStats(screenRT),
          cameraQuaternion: camera.quaternion.toArray() };
      }
    };
  }
  if (TEST_MODE) frame(100);
  else animationId = requestAnimationFrame(frame);
}

function showError(message) {
  el.boot.removeAttribute('aria-hidden');
  el.boot.classList.remove('is-hidden');
  el.boot.classList.add('is-error');
  el.boot.querySelector('.boot__inner').textContent = message;
}
window.addEventListener('error', (event) => showError('运行失败：' + event.message));
boot();
