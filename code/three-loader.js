/* 固定版本的本地依赖，两个页面共用，离线也可启动。 */
export const THREE_VERSION = '0.160.1';
export function loadThree() {
  return import('./vendor/three.module.js');
}
