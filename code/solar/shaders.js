/* 实际 GPU 着色器；主页面与浏览器回归检查共用。颜色输出只编码一次。 */
export const STAR_VERTEX = `
  attribute vec3 aColor;
  attribute float aSize;
  attribute float aBright;
  uniform float uPixelScale;
  uniform float uSizeScale;
  varying vec3 vColor;
  varying float vBright;
  void main() {
    vColor = aColor;
    vBright = aBright;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = max(1.0, aSize * uSizeScale * uPixelScale / max(0.0001, -mv.z));
  }
`;
export const STAR_FRAGMENT = `
  precision highp float;
  varying vec3 vColor;
  varying float vBright;
  void main() {
    vec2 d = gl_PointCoord - 0.5;
    float r2 = dot(d, d);
    if (r2 > 0.25) discard;
    float core = 1.0 - smoothstep(0.0, 0.25, r2);
    gl_FragColor = vec4(vColor * vBright, core);
  }
`;
export const POST_VERTEX = `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;
export const POST_FRAGMENT = `
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D tScene;
  uniform samplerCube tSky;
  uniform float uBeta;
  uniform float uHasRel;
  uniform mat3 uSkyRotation;
  uniform vec3 uVelocityDir;
  uniform float uTanHalfFov;
  uniform float uAspect;
  uniform float uExposure;
  uniform float uSceneOnly;
  uniform float uRaw;

  vec3 kelvin(float k) {
    float t = clamp(k, 1000.0, 40000.0) / 100.0;
    float r, g, b;
    if (t <= 66.0) {
      r = 255.0;
      g = 99.4708025861 * log(t) - 161.1195681661;
      b = t <= 19.0 ? 0.0 : 138.5177312231 * log(t - 10.0) - 305.0447927307;
    } else {
      r = 329.698727446 * pow(t - 60.0, -0.1332047592);
      g = 288.1221695283 * pow(t - 60.0, -0.0755148492);
      b = 255.0;
    }
    return pow(clamp(vec3(r, g, b), 0.0, 255.0) / 255.0, vec3(2.2));
  }
  vec3 aces(vec3 x) {
    return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
  }
  vec3 encodeSRGB(vec3 x) {
    return mix(12.92 * x, 1.055 * pow(max(x, 0.0), vec3(1.0 / 2.4)) - 0.055,
      step(vec3(0.0031308), x));
  }
  void main() {
    vec4 scene = texture2D(tScene, vUv);
    vec2 ndc = vUv * 2.0 - 1.0;
    vec3 d = normalize(vec3(ndc.x * uAspect * uTanHalfFov, ndc.y * uTanHalfFov, -1.0));
    vec3 axis = normalize(uVelocityDir);
    float b = uHasRel > 0.5 ? clamp(uBeta, 0.0, 0.999999) : 0.0;
    float cosObs = clamp(dot(d, axis), -1.0, 1.0);
    float g = inversesqrt((1.0 - b) * (1.0 + b));
    float denom = max(0.000001, 1.0 - b * cosObs);
    // 四动量逆 boost：横向分量也必须变换，不能只换 z 再 normalize。
    vec3 perpendicular = d - axis * cosObs;
    vec3 dSource = normalize(perpendicular / (g * denom) + axis * ((cosObs - b) / denom));
    vec3 sky = textureCube(tSky, uSkyRotation * dSource).rgb;
    float D = 1.0 / (g * denom);
    vec3 tint = kelvin(5800.0 * D) / max(vec3(0.0001), kelvin(5800.0));
    sky *= D * D * D * D * tint;
    // 有限距离实体保持几何渲染，演示相对论只作用于无限远星空。
    vec3 color = uSceneOnly > 0.5 ? scene.rgb : sky * (1.0 - scene.a) + scene.rgb;
    color *= uExposure;
    gl_FragColor = vec4(encodeSRGB(uRaw > 0.5 ? clamp(color, 0.0, 1.0) : aces(color)), 1.0);
  }
`;
