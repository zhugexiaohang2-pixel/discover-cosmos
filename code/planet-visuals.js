/* 两个页面共用的程序化球面贴图；不依赖外部图片。 */
export function hexToRgba(hex, alpha) {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h[0] + h[0] + h[1] + h[1] + h[2] + h[2] : h;
  const n = parseInt(full, 16);
  return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + alpha + ')';
}

/* ============================================================
   程序化行星贴图（等距圆柱投影）。只用 c1/c2/rough，无需任何图片素材。
   ============================================================ */
export function makePlanetTexture(THREE, p) {
  const W = 1024, H = 512;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const g = cv.getContext('2d');

  let seed = p.id.split('').reduce((a, c) => a + c.charCodeAt(0), 7);
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };

  const base = g.createLinearGradient(0, 0, 0, H);
  base.addColorStop(0, p.c2);
  base.addColorStop(0.5, p.c1);
  base.addColorStop(1, p.c2);
  g.fillStyle = base;
  g.fillRect(0, 0, W, H);

  if (p.rough < 0.5) {
    // 气态巨行星：湍流条纹。用两组正弦叠加做出域扭曲感
    const bands = 30 + Math.floor(rnd() * 18);
    for (let i = 0; i < bands; i++) {
      const y = rnd() * H;
      const h = 3 + rnd() * (H / bands) * 2.1;
      const amp = 6 + rnd() * 22;
      g.beginPath();
      for (let x = 0; x <= W; x += 8) {
        const yy = y + Math.sin((x / W) * Math.PI * 2 * (1 + rnd() * 0.02) + i) * amp * 0.35;
        if (x === 0) g.moveTo(x, yy); else g.lineTo(x, yy);
      }
      g.lineWidth = h;
      g.strokeStyle = rnd() > 0.5
        ? hexToRgba(p.c1, 0.18 + rnd() * 0.3)
        : hexToRgba(p.c2, 0.16 + rnd() * 0.3);
      g.stroke();
    }
    if (p.id === 'jupiter') {
      // 大红斑
      g.save();
      g.translate(W * 0.66, H * 0.62);
      g.rotate(-0.12);
      g.beginPath();
      g.ellipse(0, 0, 82, 44, 0, 0, Math.PI * 2);
      const spot = g.createRadialGradient(0, 0, 4, 0, 0, 82);
      spot.addColorStop(0, '#d9613a');
      spot.addColorStop(0.62, '#b8452a');
      spot.addColorStop(1, 'rgba(150,60,40,0)');
      g.fillStyle = spot;
      g.fill();
      g.restore();
    }
  }

  if (p.rough > 0.5) {
    // 岩石行星：大尺度斑块 + 分形起伏
    for (let i = 0; i < 140; i++) {
      const x = rnd() * W, y = rnd() * H, r = 8 + rnd() * 70;
      g.fillStyle = rnd() > 0.5
        ? hexToRgba(p.c2, 0.1 + rnd() * 0.2)
        : hexToRgba('#ffffff', 0.04 + rnd() * 0.1);
      g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
    }
    if (p.rough > 0.8) {
      // 环形山（水星、火星）
      for (let i = 0; i < 110; i++) {
        const x = rnd() * W, y = rnd() * H, r = 2 + rnd() * 13;
        g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2);
        g.fillStyle = hexToRgba('#000000', 0.17); g.fill();
        g.beginPath(); g.arc(x - r * 0.25, y - r * 0.25, r * 0.72, 0, Math.PI * 2);
        g.fillStyle = hexToRgba('#ffffff', 0.17); g.fill();
      }
    }
  }

  if (p.id === 'earth') {
    // 陆地与云
    g.fillStyle = 'rgba(66,124,78,0.88)';
    [[0.14, 0.34, 78, 52], [0.19, 0.62, 54, 70], [0.48, 0.28, 96, 46],
     [0.53, 0.60, 62, 74], [0.80, 0.34, 82, 54], [0.87, 0.66, 48, 42]]
      .forEach((b) => {
        g.beginPath(); g.ellipse(b[0] * W, b[1] * H, b[2], b[3], 0, 0, Math.PI * 2); g.fill();
      });
    g.fillStyle = 'rgba(255,255,255,0.16)';
    for (let i = 0; i < 60; i++) {
      g.beginPath();
      g.ellipse(rnd() * W, rnd() * H, 20 + rnd() * 60, 8 + rnd() * 18, rnd() * 0.6, 0, Math.PI * 2);
      g.fill();
    }
  }

  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  tex.wrapS = THREE.RepeatWrapping;
  return tex;
}


export function makePlanetMaterial(THREE, p, texture) {
  return new THREE.MeshStandardMaterial({ map: texture,
    roughness: Math.max(0.45, p.rough * 0.85), metalness: 0.06,
    bumpMap: texture, bumpScale: p.rough > 0.5 ? 0.45 : 0.08 });
}
