// 3Dモデルの霊（assets/models/ghost.glb）
// モデル: "Horror Ghost Character - Blood Stained Spirit" by adhamasalah (CC BY 4.0)
// ボーンが無いため、動きは頂点シェーダーで付ける（首の傾き・腕の振り上げ・裾の揺れ・突進の伸び・ノイズ）
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

let srcMesh = null;
let loading = null;

export function loadGhostModel() {
  if (!loading) {
    loading = new GLTFLoader().loadAsync('assets/models/ghost.glb')
      .then((g) => {
        g.scene.traverse((o) => { if (o.isMesh && !srcMesh) srcMesh = o; });
        return srcMesh;
      })
      .catch((e) => {
        console.warn('ghost model load failed, using procedural ghosts', e);
        return null;
      });
  }
  return loading;
}

export const hasGhostModel = () => !!srcMesh;

// モデル空間（高さ1.0・原点は足元・正面は+X）での目安
export const MODEL = {
  neck: 0.83,
  shoulder: 0.785,
  eyeY: 0.915, eyeX: 0.058, eyeZ: 0.017,
};

const VERT_HEAD = /* glsl */`
uniform float uTime, uSeed, uTilt, uNod, uArms, uWave, uLunge, uShake;
varying vec3 vGhostPos;
float gHash(float n) { return fract(sin(n) * 43758.5453); }
vec3 ghostDeform(vec3 p) {
  vec3 q = p;
  // 腕：体の左右（|z|が大きい所）の肩から下を、肩を支点に前へ振り上げる
  float armW = smoothstep(0.092, 0.118, abs(p.z)) * smoothstep(0.36, 0.44, p.y) * (1.0 - smoothstep(0.775, 0.8, p.y));
  vec2 a = vec2(p.x, p.y - ${MODEL.shoulder.toFixed(3)});
  float ang = uArms * armW;
  vec2 ra = vec2(a.x * cos(ang) - a.y * sin(ang), a.x * sin(ang) + a.y * cos(ang));
  q.x = mix(q.x, ra.x, armW);
  q.y = mix(q.y, ra.y + ${MODEL.shoulder.toFixed(3)}, armW);
  // 首：首より上を傾ける（横＝uTilt、前後＝uNod）
  float headW = smoothstep(${(MODEL.neck - 0.03).toFixed(3)}, ${(MODEL.neck + 0.02).toFixed(3)}, q.y);
  vec3 h = q - vec3(0.0, ${MODEL.neck.toFixed(3)}, 0.0);
  float ct = cos(uTilt * headW), st = sin(uTilt * headW);
  h = vec3(h.x, h.y * ct - h.z * st, h.y * st + h.z * ct);
  float cn = cos(uNod * headW), sn = sin(uNod * headW);
  h = vec3(h.x * cn - h.y * sn, h.x * sn + h.y * cn, h.z);
  q = h + vec3(0.0, ${MODEL.neck.toFixed(3)}, 0.0);
  // 裾の揺らぎ（下ほど大きい）
  float hem = 1.0 - smoothstep(0.0, 0.55, p.y);
  q.z += sin(uTime * 2.3 + p.y * 14.0 + uSeed) * 0.012 * hem * uWave;
  q.x += cos(uTime * 1.9 + p.y * 11.0 + uSeed) * 0.01 * hem * uWave;
  // 突進：上半身ほど前に引き伸ばす
  q.x += uLunge * (0.08 + p.y * 0.22);
  // 映像が裂けたような横ずれ
  float band = floor(p.y * 26.0);
  float g = step(0.72, gHash(band + floor(uTime * 18.0) + uSeed));
  q.z += (gHash(band * 3.1 + floor(uTime * 18.0)) - 0.5) * 0.09 * uShake * g;
  return q;
}
`;

const FRAG_HEAD = /* glsl */`
uniform float uTime, uSeed, uRim, uSelf, uDissolve, uGlow;
uniform vec3 uRimColor;
varying vec3 vGhostPos;
float gN(vec3 p) {
  vec3 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float n = dot(i, vec3(1.0, 57.0, 113.0));
  float a = fract(sin(n) * 43758.5), b = fract(sin(n + 1.0) * 43758.5);
  float c = fract(sin(n + 57.0) * 43758.5), d = fract(sin(n + 58.0) * 43758.5);
  float e = fract(sin(n + 113.0) * 43758.5), f1 = fract(sin(n + 114.0) * 43758.5);
  float g = fract(sin(n + 170.0) * 43758.5), h = fract(sin(n + 171.0) * 43758.5);
  return mix(mix(mix(a, b, f.x), mix(c, d, f.x), f.y), mix(mix(e, f1, f.x), mix(g, h, f.x), f.y), f.z);
}
`;

function patch(shader, u, depthOnly) {
  Object.assign(shader.uniforms, u);
  shader.vertexShader = VERT_HEAD + shader.vertexShader
    .replace('#include <begin_vertex>', '#include <begin_vertex>\n  vGhostPos = position;\n  transformed = ghostDeform(position);');
  if (depthOnly) {
    shader.fragmentShader = 'varying vec3 vGhostPos;\n' + shader.fragmentShader;
    return;
  }
  shader.fragmentShader = FRAG_HEAD + shader.fragmentShader
    .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
  float dn = gN(vGhostPos * 38.0 + uSeed) * 0.7 + gN(vGhostPos * 90.0) * 0.3;
  if (dn < uDissolve) discard;`)
    .replace('#include <opaque_fragment>', `#include <opaque_fragment>
  vec3 vn = normalize(normal);
  float fres = pow(1.0 - abs(dot(vn, normalize(vViewPosition))), 2.2);
  gl_FragColor.rgb += uRimColor * fres * uRim;
  gl_FragColor.rgb += diffuseColor.rgb * uSelf;
  float edge = smoothstep(uDissolve + 0.08, uDissolve, dn) * step(0.001, uDissolve);
  gl_FragColor.rgb += vec3(1.0, 0.35, 0.1) * edge * 2.5;
  gl_FragColor.rgb += uRimColor * uGlow * 0.35;`);
}

// 霊1体分の本体。group は高さ height、正面 -Z に揃えてある
export function makeModelBody(height, tint = 0xffffff) {
  const u = {
    uTime: { value: 0 }, uSeed: { value: Math.random() * 100 }, uTilt: { value: 0 }, uNod: { value: 0 },
    uArms: { value: 0 }, uWave: { value: 1 }, uLunge: { value: 0 }, uShake: { value: 0 },
    uRim: { value: 0.6 }, uRimColor: { value: new THREE.Color(0x9fb8ff) }, uSelf: { value: 0.12 },
    uDissolve: { value: 0 }, uGlow: { value: 0 },
  };
  const mat = new THREE.MeshLambertMaterial({
    map: srcMesh.material.map, color: tint, side: THREE.DoubleSide, transparent: true, opacity: 1,
  });
  mat.onBeforeCompile = (s) => patch(s, u, false);
  mat.customProgramCacheKey = () => 'ghost-model';
  const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  depth.onBeforeCompile = (s) => patch(s, u, true);
  depth.customProgramCacheKey = () => 'ghost-model-depth';

  const mesh = new THREE.Mesh(srcMesh.geometry, mat);
  mesh.customDepthMaterial = depth;
  mesh.castShadow = true;
  mesh.frustumCulled = false; // 頂点を動かすので境界球では判定しない
  const group = new THREE.Group();
  group.rotation.y = Math.PI / 2; // モデルの正面(+X)をゲームの正面(-Z)へ
  group.scale.setScalar(height);
  group.add(mesh);
  return { group, mesh, mat, depth, u };
}
