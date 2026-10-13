/* 星际探索局 — 原型主逻辑
 *
 * 三条职责，刻意分开，方便你单独改：
 *   1. 渲染    buildStars / buildGrid / renderArticle      —— 纯 DOM，无 3D 依赖
 *   2. 路由    showIndex / showArticle + hashchange        —— 对应小程序的 navigateTo / navigateBack
 *   3. 3D      load3D 之后的全部内容                        —— 纯增强，失败即降级
 *
 * 3D 是增强层。本地 three.js 或 WebGL 初始化失败时退化为 CSS 渐变球，
 * 页面仍可阅读。
 */

import { PLANETS } from './planets.js';
import { hexToRgba, makePlanetTexture, makePlanetMaterial } from './planet-visuals.js';

window.__protoBooted = true;

import { loadThree } from './three-loader.js';
const TILE_SIZE = 320; // 卡牌烘焙图边长（px）

const el = {
  stars: document.getElementById('stars'),
  grid: document.getElementById('grid'),
  viewIndex: document.getElementById('view-index'),
  viewArticle: document.getElementById('view-article'),
  btnBack: document.getElementById('btn-back'),
  hero: document.getElementById('hero'),
  heroFrame: document.getElementById('hero-frame'),
  heroCanvas: document.getElementById('hero-canvas'),
  heroFallback: document.getElementById('hero-fallback'),
  heroHint: document.getElementById('hero-hint'),
  aZh: document.getElementById('a-zh'),
  aEn: document.getElementById('a-en'),
  aTag: document.getElementById('a-tag'),
  aFacts: document.getElementById('a-facts'),
  aBody: document.getElementById('a-body')
};

let homeScroll = 0;

/* ============================================================
   1. 星空背景
   ============================================================ */

function buildStars() {
  // 固定种子，保证每次刷新星图一致（视觉评审时不会每次都变）
  let seed = 20261013;
  const rnd = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };

  const frag = document.createDocumentFragment();
  for (let i = 0; i < 110; i++) {
    const s = document.createElement('div');
    s.className = 'star';
    const size = (rnd() * 1.9 + 0.7).toFixed(1);
    s.style.cssText =
      'left:' + (rnd() * 100).toFixed(2) + '%;' +
      'top:' + (rnd() * 100).toFixed(2) + '%;' +
      'width:' + size + 'px;height:' + size + 'px;' +
      'animation-delay:' + (rnd() * 4.5).toFixed(2) + 's;' +
      'opacity:' + (rnd() * 0.5 + 0.2).toFixed(2) + ';';
    frag.appendChild(s);
  }
  el.stars.appendChild(frag);
}

/* ============================================================
   2. 首页卡牌
   ============================================================ */

function buildGrid() {
  const frag = document.createDocumentFragment();

  PLANETS.forEach((p, i) => {
    const card = document.createElement('a');
    card.href = '#/p/' + p.id;
    card.className = 'card';
    card.dataset.id = p.id;
    card.style.setProperty('--c1', p.c1);
    card.style.setProperty('--c2', p.c2);

    // 用 innerHTML 拼结构（内容全部来自本地数据，无外部输入）
    card.innerHTML =
      '<div class="card__index">NO.' + String(i + 1).padStart(2, '0') + '</div>' +
      '<div class="card__stage"><div class="ball"></div></div>' +
      '<div class="card__zh"></div>' +
      '<div class="card__en"></div>' +
      '<div class="card__tag"></div>';

    card.querySelector('.card__zh').textContent = p.nameZh;
    card.querySelector('.card__en').textContent = p.nameEn;
    card.querySelector('.card__tag').textContent = p.tagline;

    card.addEventListener('click', () => {
      location.hash = '#/p/' + p.id;
    });

    frag.appendChild(card);
  });

  el.grid.appendChild(frag);
}

/* ============================================================
   3. 阅读页渲染
   ============================================================ */

function renderArticle(p) {
  el.aZh.textContent = p.nameZh;
  el.aEn.textContent = p.nameEn;
  el.aTag.textContent = p.tagline;

  el.heroFallback.style.setProperty('--c1', p.c1);
  el.heroFallback.style.setProperty('--c2', p.c2);
  el.heroFrame.style.background =
    'radial-gradient(circle, ' + hexToRgba(p.c2, 0.5) + ' 0%, transparent 68%)';

  el.aFacts.innerHTML = '';
  p.facts.forEach((f) => {
    const box = document.createElement('div');
    box.className = 'fact';
    const label = document.createElement('div');
    label.className = 'fact__label';
    label.textContent = f.label;
    const value = document.createElement('div');
    value.className = 'fact__value';
    value.textContent = f.value;
    box.appendChild(label);
    box.appendChild(value);
    el.aFacts.appendChild(box);
  });

  el.aBody.innerHTML = '';
  p.paragraphs.forEach((text) => {
    const para = document.createElement('p');
    para.textContent = text;
    el.aBody.appendChild(para);
  });

  document.title = p.nameZh + ' · ' + p.nameEn + ' — 星际探索局';
}

function findPlanet(id) {
  return PLANETS.filter((p) => p.id === id)[0] || null;
}

/* ============================================================
   4. 路由（对应小程序 navigateTo / navigateBack）
   ============================================================ */

function parseHash() {
  const m = /^#\/p\/([a-z]+)$/.exec(location.hash);
  return m ? m[1] : null;
}

function showIndex() {
  el.viewArticle.hidden = true;
  el.viewIndex.hidden = false;
  document.title = '星际探索局 · 星际图鉴';
  // 对应小程序 navigateBack：恢复首页原先的滚动位置
  window.scrollTo(0, homeScroll);
}

function showArticle(id) {
  const p = findPlanet(id);
  if (!p) {
    // 对应小程序里参数非法：退回首页，而不是停在半渲染状态
    location.replace('#/');
    return;
  }
  if (!el.viewIndex.hidden) homeScroll = window.scrollY || document.documentElement.scrollTop || 0;
  renderArticle(p);
  el.viewIndex.hidden = true;
  el.viewArticle.hidden = false;
  window.scrollTo(0, 0);
  applyToHero(p); // 3D 未就绪时是无害的空操作
}

function route() {
  const id = parseHash();
  if (id) showArticle(id);
  else showIndex();
}

/* ============================================================
   5. 工具
   ============================================================ */

/* ============================================================
   6. 启动
   ============================================================ */

buildStars();
buildGrid();

el.btnBack.addEventListener('click', () => {
  // 深链接也始终返回站内图鉴首页。
  location.hash = '#/';
});

window.addEventListener('hashchange', route);

/* ============================================================
   7. 3D 增强层
   ------------------------------------------------------------
   在浏览器里，这段代码负责：
     a) 首次加载时把 8 颗行星渲染成 PNG，替换卡牌上的 CSS 球体（"烘焙"）
     b) 阅读页里做一颗实时球体，支持鼠标/手指拖拽旋转
   在小程序侧，a) 的产物可以直接当图片用，b) 需要用原生 canvas(WebGL) 重写。
   ============================================================ */

const GL = {
  ready: false,
  THREE: null,
  renderer: null,
  scene: null,
  camera: null, // 阅读页：透视相机
  bakeCamera: null, // 烘焙用：正交相机（无畸变，球体占固定比例）
  hero: null,
  current: null
};

const SPHERE_GEO_ARGS = [1, 96, 64];
const HERO_FOV = 28; // 阅读页视场角：放远 + 收窄，减少近处畸变
const HERO_FILL = 0.66; // 球体直径占画布较短边的比例
const BAKE_FRUSTUM = 1.25; // 正交视口半径。必须 > 球半径 1，否则球被裁切
const BAKE_SPHERE_FILL = 1 / BAKE_FRUSTUM; // 球体直径占 tile 的 80%，四周留 20% 给柔光
const BAKE_GLOW = 1.15; // 柔光球放大倍数。需 < 1/BAKE_SPHERE_FILL (1.25)，否则柔光会被画框切出硬边

/**
 * 程序化生成球面贴图（等距圆柱投影）。
 * 只用 c1/c2/rough 三个字段，因此不需要任何图片素材。
 * 这张贴图在小程序侧可以"预先离线生成好存成图片"，不必在运行时生成。
 */
function makePlanetMesh(THREE, p) {
  const tex = makePlanetTexture(THREE, p);
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(...SPHERE_GEO_ARGS), makePlanetMaterial(THREE, p, tex));
  mesh.userData.tex = tex;
  return mesh;
}

async function load3D() {
  let THREE;
  try {
    THREE = await loadThree();
  } catch (err) {
    // 本地依赖不可用：保留 CSS 球体与完整阅读功能
    console.warn('[原型] 本地 three.js 载入失败，已降级为 CSS 球体：', err && err.message);
    el.heroHint.textContent = '3D 未载入· 当前为 CSS 降级球体';
    return;
  }

  try {
    const renderer = new THREE.WebGLRenderer({
      canvas: el.heroCanvas,
      antialias: true,
      alpha: true,
      preserveDrawingBuffer: true // 需要导出烘焙图
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearAlpha(0);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(HERO_FOV, 1, 0.1, 100);
    camera.position.set(0, 0, 6); // 真实距离由 resizeHero() 按画布形状计算

    // 正交相机：烘焙专用。球体在 tile 里永远是同一个大小和位置，便于小程序侧对齐
    const bakeCamera = new THREE.OrthographicCamera(
      -BAKE_FRUSTUM,
      BAKE_FRUSTUM,
      BAKE_FRUSTUM,
      -BAKE_FRUSTUM,
      0.1,
      100
    );
    bakeCamera.position.set(0, 0, 4);

    scene.add(new THREE.AmbientLight(0xffffff, 0.42));
    const key = new THREE.DirectionalLight(0xfff3e0, 2.5);
    key.position.set(-3.4, 1.9, 2.8);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0x8fb6ff, 0.55);
    rim.position.set(2.8, -1.4, -2.2);
    scene.add(rim);

    GL.THREE = THREE;
    GL.renderer = renderer;
    GL.scene = scene;
    GL.camera = camera;
    GL.bakeCamera = bakeCamera;
    GL.ready = false;

    attachDrag();
    resizeHero();
    window.addEventListener('resize', resizeHero);

    await bakeTiles();
    GL.ready = true;
    applyToHero(currentPlanet());
    tick();
  } catch (err) {
    GL.ready = false;
    el.hero.classList.remove('is-live');
    GL.renderer?.dispose();
    console.warn('[原型] 3D 初始化失败，已降级为 CSS 球体：', err && err.message);
    el.heroHint.textContent = '3D 初始化失败 · 当前为 CSS 降级球体';
  }
}

/** 把 8 颗行星渲染成 PNG，贴到卡牌上（这一步的产物就是小程序可用的静态图片） */
async function bakeTiles() {
  const THREE = GL.THREE;
  const renderer = GL.renderer;
  const scene = GL.scene;
  const bakeCamera = GL.bakeCamera;

  const prevTarget = renderer.getRenderTarget();
  const target = new THREE.WebGLRenderTarget(TILE_SIZE, TILE_SIZE, { format: THREE.RGBAFormat });

  const group = new THREE.Group();
  scene.add(group);

  const cards = Array.prototype.slice.call(el.grid.querySelectorAll('.card'));

  try {
  for (let i = 0; i < PLANETS.length; i++) {
    const p = PLANETS[i];
    const mesh = makePlanetMesh(THREE, p);
    mesh.rotation.y = 0.6;
    mesh.rotation.x = 0.18;
    group.add(mesh);

    // 柔光层：同一张贴图放大到 1.5 倍、加色混合，让烘焙图自带光晕
    const glowMat = new THREE.MeshBasicMaterial({
      map: mesh.userData.tex,
      transparent: true,
      opacity: 0.3,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    const glow = new THREE.Mesh(new THREE.SphereGeometry(...SPHERE_GEO_ARGS), glowMat);
    glow.scale.setScalar(BAKE_GLOW);
    glow.renderOrder = -1;
    group.add(glow);

    renderer.setRenderTarget(target);
    renderer.setClearAlpha(0);
    renderer.clear();
    renderer.render(scene, bakeCamera);

    const pixels = new Uint8Array(TILE_SIZE * TILE_SIZE * 4);
    renderer.readRenderTargetPixels(target, 0, 0, TILE_SIZE, TILE_SIZE, pixels);

    // WebGL 是上下翻转的，导出前要镜像一次
    const out = document.createElement('canvas');
    out.width = TILE_SIZE;
    out.height = TILE_SIZE;
    const ctx = out.getContext('2d');
    const img = ctx.createImageData(TILE_SIZE, TILE_SIZE);
    for (let y = 0; y < TILE_SIZE; y++) {
      const src = (TILE_SIZE - 1 - y) * TILE_SIZE * 4;
      const dst = y * TILE_SIZE * 4;
      img.data.set(pixels.subarray(src, src + TILE_SIZE * 4), dst);
    }
    ctx.putImageData(img, 0, 0);

    let url = '';
    try {
      url = out.toDataURL('image/webp', 0.92);
      if (url.indexOf('data:image/webp') !== 0) url = out.toDataURL('image/png');
    } catch (e) {
      url = out.toDataURL('image/png');
    }

    if (cards[i] && url) {
      cards[i].style.setProperty('--baked', 'url("' + url + '")');
      cards[i].classList.add('is-baked');
    }

    // 释放当前行星占用的显存
    group.remove(mesh);
    group.remove(glow);
    mesh.geometry.dispose();
    mesh.material.dispose();
    mesh.userData.tex.dispose();
    glow.geometry.dispose();
    glowMat.dispose();

    // 让出主线程，避免一次性烘焙 8 张时界面卡住
    await new Promise((r) => setTimeout(r, 0));
  }

  } finally {
    group.traverse((object) => {
      object.geometry?.dispose();
      object.material?.dispose();
      object.userData?.tex?.dispose();
    });
    scene.remove(group);
    renderer.setRenderTarget(prevTarget);
    target.dispose();
  }
}

/** 阅读页的实时球体 */
function applyToHero(p) {
  if (!GL.ready || !p) return;
  const THREE = GL.THREE;

  if (GL.hero) {
    GL.scene.remove(GL.hero);
    GL.hero.geometry.dispose();
    GL.hero.material.dispose();
    GL.hero.userData.tex.dispose();
    GL.hero = null;
  }

  const mesh = makePlanetMesh(THREE, p);
  GL.scene.add(mesh);
  GL.hero = mesh;
  GL.current = p;
  GL.drag.vx = 0;
  GL.drag.vy = 0;

  el.hero.classList.add('is-live');
  el.heroHint.textContent = '拖动球体可以旋转';
  resizeHero();
}

function resizeHero() {
  if (!GL.ready) return;
  const rect = el.heroFrame.getBoundingClientRect();
  if (!rect.width || !rect.height) return;

  const aspect = rect.width / rect.height;
  GL.renderer.setSize(rect.width, rect.height, false);

  // 按画布形状反推相机距离：让球体始终占"较短边"的固定比例，
  // 这样竖屏/方形画布都不会把球体切掉，也不会忽大忽小。
  const visibleH = (2 * 1) / HERO_FILL; // 保证球体在短边方向占 HERO_FILL
  const limiting = Math.min(1, aspect);
  const dist = visibleH / 2 / Math.tan((HERO_FOV * Math.PI) / 180 / 2) / limiting;

  GL.camera.aspect = aspect;
  GL.camera.position.z = dist;
  GL.camera.updateProjectionMatrix();
}

/** 拖拽旋转（带回弹惯性），对应小程序侧的 bindtouchmove */
function attachDrag() {
  GL.drag = { on: false, x: 0, y: 0, vx: 0, vy: 0 };

  const stop = (e) => {
    if (!GL.drag.on) return;
    GL.drag.on = false;
    if (e && e.pointerId !== undefined && el.heroCanvas.releasePointerCapture) {
      try {
        el.heroCanvas.releasePointerCapture(e.pointerId);
      } catch (err) {
        /* 忽略：指针已释放 */
      }
    }
  };

  el.heroCanvas.addEventListener('pointerdown', (e) => {
    GL.drag.on = true;
    GL.drag.x = e.clientX;
    GL.drag.y = e.clientY;
    GL.drag.vx = 0;
    GL.drag.vy = 0;
    if (el.heroCanvas.setPointerCapture) {
      try {
        el.heroCanvas.setPointerCapture(e.pointerId);
      } catch (err) {
        /* 忽略 */
      }
    }
  });

  el.heroCanvas.addEventListener('pointermove', (e) => {
    if (!GL.drag.on || !GL.hero) return;
    const dx = e.clientX - GL.drag.x;
    const dy = e.clientY - GL.drag.y;
    GL.drag.x = e.clientX;
    GL.drag.y = e.clientY;
    GL.hero.rotation.y += dx * 0.009;
    GL.hero.rotation.x += dy * 0.009;
    GL.drag.vx = dx * 0.009;
    GL.drag.vy = dy * 0.009;
  });

  el.heroCanvas.addEventListener('pointerup', stop);
  el.heroCanvas.addEventListener('pointercancel', stop);
  el.heroCanvas.addEventListener('pointerleave', stop);
}

function tick() {
  if (!GL.ready) return;
  window.requestAnimationFrame(tick);

  const mesh = GL.hero;
  if (mesh) {
    if (GL.drag && !GL.drag.on) {
      // 松开后的惯性衰减
      mesh.rotation.y += GL.drag.vx;
      mesh.rotation.x += GL.drag.vy;
      GL.drag.vx *= 0.95;
      GL.drag.vy *= 0.95;
      mesh.rotation.y += 0.0016; // 极缓慢的自转，让球体"活着"
    }
    // 阅读页不可见时不浪费性能
    if (!el.viewArticle.hidden) GL.renderer.render(GL.scene, GL.camera);
  }
}

function currentPlanet() {
  const id = parseHash();
  return id ? findPlanet(id) : null;
}

route();
load3D();
