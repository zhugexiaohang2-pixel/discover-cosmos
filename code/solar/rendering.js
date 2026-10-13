import { POST_VERTEX, POST_FRAGMENT } from './shaders.js';

export function createTargets(THREE, renderer, width, height, cubeSize, forceByte = false) {
  const gl = renderer.getContext();
  const hasHalf = !!(gl.getExtension('EXT_color_buffer_float') || gl.getExtension('EXT_color_buffer_half_float'));
  const hasLinear = renderer.capabilities.isWebGL2 || !!gl.getExtension('OES_texture_half_float_linear');
  const types = !forceByte && hasHalf && hasLinear
    ? [THREE.HalfFloatType, THREE.UnsignedByteType] : [THREE.UnsignedByteType];
  for (const type of types) {
    const options = { format: THREE.RGBAFormat, type, minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter, generateMipmaps: false };
    const cubeRT = new THREE.WebGLCubeRenderTarget(cubeSize, { ...options, depthBuffer: false });
    const screenRT = new THREE.WebGLRenderTarget(width, height, options);
    let complete = true;
    const previous = renderer.getRenderTarget();
    try {
      for (let face = 0; face < 6; face++) {
        renderer.setRenderTarget(cubeRT, face);
        complete = complete && gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
      }
      renderer.setRenderTarget(screenRT);
      complete = complete && gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
    } finally {
      renderer.setRenderTarget(previous);
    }
    if (complete) return { cubeRT, screenRT, type, hdr: type === THREE.HalfFloatType };
    cubeRT.dispose();
    screenRT.dispose();
  }
  throw new Error('设备无法创建可用的 WebGL 渲染目标。');
}

export function renderScenePass(renderer, scene, camera, target, { skip = false, opaque = false } = {}) {
  renderer.setRenderTarget(target);
  renderer.setClearColor(opaque ? 0x101a3a : 0x000000, opaque ? 1 : 0);
  renderer.clear(true, true, true);
  if (!skip) renderer.render(scene, camera);
  renderer.setRenderTarget(null);
}

export function createPostMaterial(THREE, screenTexture, skyTexture, fov) {
  return new THREE.ShaderMaterial({
    depthTest: false,
    depthWrite: false,
    uniforms: {
      tScene: { value: screenTexture }, tSky: { value: skyTexture },
      uBeta: { value: 0 }, uHasRel: { value: 1 },
      uSkyRotation: { value: new THREE.Matrix3() },
      uVelocityDir: { value: new THREE.Vector3(0, 0, -1) },
      uTanHalfFov: { value: Math.tan(fov * Math.PI / 360) },
      uAspect: { value: 1 }, uExposure: { value: 1 },
      uSceneOnly: { value: 0 }, uRaw: { value: 0 }
    },
    vertexShader: POST_VERTEX, fragmentShader: POST_FRAGMENT
  });
}
