// 画面効果：光のにじみ（目・蝋燭）と、霊が近いほど強まる歪み・色ずれ・ざらつき
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const HorrorShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uPresence: { value: 0 },
    uHurt: { value: 0 },
    uAspect: { value: 1 },
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse;
    uniform float uTime, uPresence, uHurt, uAspect;
    varying vec2 vUv;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main() {
      vec2 uv = vUv;
      float p = uPresence;
      // 霊が近いと画面が波打ち、横に裂ける
      uv.x += sin(uv.y * 40.0 + uTime * 6.0) * 0.0025 * p;
      float band = step(0.985 - p * 0.05, hash(vec2(floor(uv.y * 60.0), floor(uTime * 20.0))));
      uv.x += (hash(vec2(uTime, uv.y)) - 0.5) * 0.06 * band * p;
      // 色ずれ（周辺ほど強い）
      vec2 d = uv - 0.5;
      float ca = (0.0015 + p * 0.009 + uHurt * 0.015) * length(d) * 2.0;
      vec3 col;
      col.r = texture2D(tDiffuse, uv + d * ca).r;
      col.g = texture2D(tDiffuse, uv).g;
      col.b = texture2D(tDiffuse, uv - d * ca).b;
      // 少し色を抜いて冷たく
      float l = dot(col, vec3(0.299, 0.587, 0.114));
      col = mix(col, vec3(l) * vec3(0.92, 0.97, 1.05), 0.25 + p * 0.25);
      // 周辺減光
      float vig = smoothstep(0.95, 0.25, length(d * vec2(uAspect, 1.0)) * 0.9);
      col *= mix(0.55, 1.0, vig);
      // フィルムのざらつき
      float g = hash(uv * vec2(1234.5, 987.6) + fract(uTime * 7.3)) - 0.5;
      col += g * (0.035 + p * 0.06);
      // 被弾時の赤
      col = mix(col, col * vec3(1.4, 0.3, 0.3), uHurt * 0.5);
      gl_FragColor = vec4(col, 1.0);
    }
  `,
};

export function createPost(renderer, scene, camera) {
  const size = renderer.getSize(new THREE.Vector2());
  const composer = new EffectComposer(renderer);
  composer.setPixelRatio(renderer.getPixelRatio());
  composer.setSize(size.x, size.y);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), 0.85, 0.5, 0.82);
  composer.addPass(bloom);
  const horror = new ShaderPass(HorrorShader);
  composer.addPass(horror);
  composer.addPass(new OutputPass());
  const U = horror.uniforms;
  U.uAspect.value = size.x / size.y;
  return {
    render(dt, presence, hurt) {
      U.uTime.value += dt;
      U.uPresence.value = presence;
      U.uHurt.value = hurt;
      composer.render(dt);
    },
    setSize(w, h) {
      composer.setSize(w, h);
      bloom.resolution.set(w / 2, h / 2);
      U.uAspect.value = w / h;
    },
    dispose() {
      bloom.dispose();
      composer.dispose();
    },
  };
}
