// 霊・プレイヤーの姿・刀・印・パーティクル・血痕
import * as THREE from 'three';
import { glyph, ofuda, ghostFace, ghostRobe, ghostSkin, bloodTex, flame } from './textures.js';

const DS = THREE.DoubleSide;
function basic(color, opacity = 1, extra = {}) {
  return new THREE.MeshBasicMaterial({
    color, transparent: opacity < 1, opacity, depthWrite: opacity >= 1, fog: false, side: DS, ...extra,
  });
}

// テクスチャは全霊で共有（初回に生成）
let TEX = null;
function tex() {
  if (!TEX) {
    TEX = {
      face: ghostFace(false), faceBoss: ghostFace(true),
      robe: ghostRobe(false), robeBoss: ghostRobe(true),
      skin: ghostSkin(false), skinBoss: ghostSkin(true),
      glow: flame(),
    };
  }
  return TEX;
}

const UP = new THREE.Vector3(0, 1, 0);
// 点aから点bへ伸びる円柱（骨・指）
function bone(parent, a, b, r0, r1, mat) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b);
  const dir = B.clone().sub(A);
  const len = dir.length();
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r1, r0, len, 6), mat);
  m.position.copy(A).addScaledVector(dir, 0.5);
  m.quaternion.setFromUnitVectors(UP, dir.normalize());
  parent.add(m);
  return m;
}
function claws(parent, at, dir, mat) {
  for (const s of [-1, 0, 1]) {
    bone(parent, at, [at[0] + dir[0] + s * 0.04, at[1] + dir[1], at[2] + dir[2] + Math.abs(s) * 0.02], 0.012, 0.002, mat);
  }
}

// ぼろぼろの裾を持つ着物
function robeGeo(top, bottom, h) {
  const g = new THREE.CylinderGeometry(top, bottom, h, 20, 5, true);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    if (y < -h / 2 + 0.01) {
      pos.setY(i, y + Math.random() * 0.35);
      const k = 0.8 + Math.random() * 0.35;
      pos.setX(i, pos.getX(i) * k);
      pos.setZ(i, pos.getZ(i) * k);
    }
  }
  g.computeVertexNormals();
  return g;
}

function makeHead(m, boss) {
  const head = new THREE.Group();
  const face = new THREE.Mesh(new THREE.SphereGeometry(0.17, 20, 14), m.face);
  face.scale.set(0.9, 1.15, 0.95);
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.185, 16, 12, -0.15 * Math.PI, 1.3 * Math.PI, 0, 0.62 * Math.PI), m.hair);
  cap.scale.copy(face.scale);
  head.add(face, cap);
  // 前に垂れる髪（顔の中央は見える）
  for (const s of [-1, 1]) {
    const strand = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 0.62), m.hair);
    strand.position.set(s * 0.1, -0.16, -0.14);
    strand.rotation.y = s * 0.25;
    head.add(strand);
  }
  const back = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.32, 1.15, 12, 1, true, -Math.PI / 2, Math.PI), m.hair);
  back.position.set(0, -0.5, 0.03);
  // 後ろ髪は首の傾きに付いていかないよう、呼び出し側で胴体に付ける
  // 赤く光る目
  const eyePos = boss
    ? [[-0.055, 0.05], [0.055, 0.05], [-0.028, 0.105], [0.028, 0.105]]
    : [[-0.04, 0.038], [0.04, 0.038]];
  const eyes = [];
  for (const [x, y] of eyePos) {
    const e = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex().glow, color: 0xff2a10, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    e.position.set(x, y, -0.165);
    e.scale.setScalar(0.07);
    head.add(e);
    eyes.push(e);
  }
  // 開いていく口
  const mouth = new THREE.Mesh(new THREE.CircleGeometry(boss ? 0.07 : 0.045, 16), m.mouth);
  mouth.rotation.y = Math.PI;
  mouth.position.set(0, -0.093, -0.158);
  mouth.scale.set(1, 0.5, 1);
  head.add(mouth);
  bone(head, [0.005, -0.12, -0.155], [0.015, -0.42, -0.13], 0.008, 0.004, m.blood);
  return { head, eyes, mouth, back };
}

// 人型の腕（肩を支点に、+X回転で前に振り上げる）
function arm(parent, x, y, z, m, spread) {
  const pivot = new THREE.Group();
  pivot.position.set(x, y, z);
  pivot.rotation.z = spread;
  bone(pivot, [0, 0, 0], [0, -0.45, -0.04], 0.04, 0.032, m.robe);
  bone(pivot, [0, -0.45, -0.04], [0, -0.95, -0.12], 0.03, 0.022, m.skin);
  claws(pivot, [0, -0.95, -0.12], [0, -0.16, -0.05], m.skin);
  parent.add(pivot);
  return { pivot, base: 0.1 };
}

// 這い女の脚（関節が上に突き出た蜘蛛のような脚）
function spiderLeg(parent, pivotAt, knee, foot, m) {
  const pivot = new THREE.Group();
  pivot.position.set(...pivotAt);
  bone(pivot, [0, 0, 0], knee, 0.035, 0.03, m.skin);
  bone(pivot, knee, foot, 0.03, 0.018, m.skin);
  claws(pivot, foot, [0, -0.02, foot[2] < 0 ? -0.14 : 0.14], m.skin);
  parent.add(pivot);
  return { pivot, base: 0 };
}

// 霊の正面は -Z。弱点は体のローカル座標で配置
export function makeGhost(type) {
  const T = tex();
  const boss = type === 'boss';
  const m = {
    robe: basic(0xffffff, 0.5, { map: boss ? T.robeBoss : T.robe }),
    skin: basic(0xffffff, 0.5, { map: boss ? T.skinBoss : T.skin }),
    face: basic(0xffffff, 0.5, { map: boss ? T.faceBoss : T.face }),
    hair: basic(0x020203, 0.9),
    mouth: basic(0x000000, 0.95),
    blood: basic(0x6a0000, 0.9),
  };
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  let arms = [], legs = [], H;

  if (type === 'crawl') {
    const torso = new THREE.Mesh(robeGeo(0.2, 0.3, 1.25), m.robe);
    torso.rotation.x = Math.PI / 2;
    torso.position.set(0, 0.32, 0.25);
    body.add(torso);
    H = makeHead(m, false);
    H.head.position.set(0, 0.38, -0.5);
    H.head.rotation.set(0.5, 0, Math.PI); // 首が逆さにねじれている
    body.add(H.head);
    arms = [
      spiderLeg(body, [0.2, 0.34, -0.3], [0.38, 0.4, -0.2], [0.52, -0.3, -0.5], m),
      spiderLeg(body, [-0.2, 0.34, -0.3], [-0.38, 0.4, -0.2], [-0.52, -0.3, -0.5], m),
    ];
    legs = [
      spiderLeg(body, [0.18, 0.3, 0.75], [0.34, 0.35, 0.15], [0.46, -0.28, 0.45], m),
      spiderLeg(body, [-0.18, 0.3, 0.75], [-0.34, 0.35, 0.15], [-0.46, -0.28, 0.45], m),
    ];
  } else {
    const robe = new THREE.Mesh(robeGeo(0.15, 0.55, 1.6), m.robe);
    robe.position.y = 0.85;
    body.add(robe);
    bone(body, [0, 1.5, 0], [0, 1.74, -0.04], 0.055, 0.045, m.skin);
    H = makeHead(m, boss);
    H.head.position.set(0, 1.86, -0.05);
    H.head.rotation.z = 0.4; // 首が傾いている
    body.add(H.head);
    H.back.position.set(0, 1.4, -0.02);
    body.add(H.back);
    arms.push(arm(body, 0.24, 1.48, -0.02, m, 0.12));
    arms.push(arm(body, -0.24, 1.48, -0.02, m, -0.12));
    if (boss) {
      arms.push(arm(body, 0.28, 1.25, 0.02, m, 0.5));
      arms.push(arm(body, -0.28, 1.25, 0.02, m, -0.5));
      arms.push(arm(body, 0.3, 1.02, 0.04, m, 0.85));
      arms.push(arm(body, -0.3, 1.02, 0.04, m, -0.85));
      body.scale.setScalar(1.5);
    }
  }

  const weak = new THREE.Mesh(
    new THREE.SphereGeometry(0.11, 12, 10),
    basic(0xff2030, 0.95, { blending: THREE.AdditiveBlending }),
  );
  weak.renderOrder = 10;
  body.add(weak);

  const ring = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.68, 40).rotateX(-Math.PI / 2), basic(0xff3040, 0.8));
  ring.position.y = 0.03;
  ring.visible = false;
  const slamRing = new THREE.Mesh(new THREE.RingGeometry(3.3, 3.6, 64).rotateX(-Math.PI / 2), basic(0xff2020, 0.6));
  slamRing.position.y = 0.04;
  slamRing.visible = false;
  // 攻撃範囲（前方の扇形）
  const reach = boss ? 3.2 : 2.5;
  const fan = new THREE.Mesh(
    new THREE.CircleGeometry(reach, 24, Math.PI / 2 - 0.45, 0.9).rotateX(-Math.PI / 2),
    basic(0xff1010, 0.25, { depthWrite: false }),
  );
  fan.position.y = 0.05;
  fan.visible = false;
  root.add(ring, slamRing, fan);

  const meshes = [];
  body.traverse((o) => { if (o.isMesh && o !== weak) meshes.push(o); });
  const mats = [m.robe, m.skin, m.face, m.hair, m.mouth, m.blood];

  return {
    root, body, head: H.head, eyes: H.eyes, mouth: H.mouth, weak, ring, slamRing, fan, arms, legs, type, meshes, mats,
    baseScale: boss ? 1.5 : 1,
    headTilt: type === 'crawl' ? Math.PI : 0.4,
    // 全体の不透明度と着物の色味を変える
    look(opacity, tint = 0xffffff) {
      for (const mm of mats) {
        mm.opacity = mm === m.hair || mm === m.mouth ? Math.min(0.95, opacity * 1.3) : opacity;
        mm.depthWrite = opacity > 0.8;
      }
      m.robe.color.setHex(tint);
      m.skin.color.setHex(tint);
      m.face.color.setHex(tint === 0xffffff ? 0xffffff : 0xffc0c0);
    },
    eyeGlow(k) {
      for (const e of H.eyes) {
        e.material.opacity = k;
        e.scale.setScalar(0.06 + k * 0.05);
      }
    },
  };
}

// 床の血痕（霊の痕跡）。一定時間で消える
export class Decals {
  constructor(scene) {
    this.scene = scene;
    this.tex = bloodTex();
    this.geo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    this.list = [];
  }

  add(x, z, size = 0.6, life = 30) {
    if (this.list.length >= 70) this.remove(0);
    const mat = new THREE.MeshLambertMaterial({ map: this.tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
    const mesh = new THREE.Mesh(this.geo, mat);
    mesh.position.set(x, 0.012 + this.list.length * 0.0001, z);
    mesh.rotation.y = Math.random() * Math.PI * 2;
    mesh.scale.set(size * (0.8 + Math.random() * 0.4), 1, size * (0.8 + Math.random() * 0.4));
    this.scene.add(mesh);
    this.list.push({ mesh, t: 0, life });
  }

  remove(i) {
    const d = this.list[i];
    this.scene.remove(d.mesh);
    d.mesh.material.dispose();
    this.list.splice(i, 1);
  }

  update(dt) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const d = this.list[i];
      d.t += dt;
      if (d.t > d.life) this.remove(i);
      else if (d.t > d.life - 4) d.mesh.material.opacity = (d.life - d.t) / 4;
    }
  }
}

export function makeAvatar(role) {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const L = (c) => new THREE.MeshLambertMaterial({ color: c });
  const skinM = L(0xe8c8a8);
  let sword = null;
  if (role === 'seer') {
    const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.24, 0.6, 12), L(0xf2f2f2));
    upper.position.y = 1.15;
    const lower = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.36, 0.85, 12), L(0xb01818));
    lower.position.y = 0.43;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.15, 12, 10), skinM);
    head.position.y = 1.6;
    const hairM = L(0x111111);
    const hr = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 10), hairM);
    hr.position.set(0, 1.63, 0.03);
    const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.03, 0.6, 6), hairM);
    tail.position.set(0, 1.3, 0.16);
    body.add(upper, lower, head, hr, tail);
  } else {
    const robeM = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.34, 1.35, 12), L(0x23263a));
    robeM.position.y = 0.68;
    const sash = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.9, 0.52), L(0x8a6a2a));
    sash.position.set(0, 1.05, 0);
    sash.rotation.z = 0.6;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.15, 12, 10), skinM);
    head.position.y = 1.55;
    body.add(robeM, sash, head);
    sword = new THREE.Group();
    sword.position.set(0.3, 1.05, -0.1);
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.05, 0.9), L(0x7a5532));
    blade.position.z = -0.45;
    sword.add(blade);
    body.add(sword);
  }
  const silhouette = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.28, 1.1, 4, 10),
    basic(0x55ddff, 0.35, { depthTest: false }),
  );
  silhouette.position.y = 0.85;
  silhouette.renderOrder = 5;
  silhouette.visible = false;
  root.add(silhouette);
  return { root, body, sword, silhouette };
}

// 一人称の木刀（ライトに頼らず見えるように Basic マテリアル）
export function makeSword() {
  const root = new THREE.Group();
  const pivot = new THREE.Group();
  root.add(pivot);
  const blade = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.05, 0.85), new THREE.MeshBasicMaterial({ color: 0x5a3e24 }));
  blade.position.z = -0.47;
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.055, 0.24), new THREE.MeshBasicMaterial({ color: 0x141414 }));
  grip.position.z = 0.08;
  const tsuba = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.015, 16).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x2a2a2a }));
  tsuba.position.z = -0.05;
  const tex = ofuda('祓');
  const paper = new THREE.MeshBasicMaterial({ map: tex, side: DS, color: 0xbbb4a0 });
  const o1 = new THREE.Mesh(new THREE.PlaneGeometry(0.06, 0.16), paper);
  o1.position.set(0.03, -0.08, -0.18);
  o1.rotation.y = Math.PI / 2;
  const o2 = o1.clone();
  o2.position.z = -0.36;
  pivot.add(blade, grip, tsuba, o1, o2);
  return { root, pivot };
}

export function makeMarker() {
  const root = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({ color: 0x8fe8ff, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, side: DS });
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 3, 10, 1, true), mat);
  beam.position.y = 1.5;
  const ringMat = mat.clone();
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.35, 0.5, 32).rotateX(-Math.PI / 2), ringMat);
  ring.position.y = 0.04;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: glyph('印', '#9fe8ff'), transparent: true, depthTest: false, fog: false }));
  sprite.scale.setScalar(0.6);
  sprite.position.y = 2.3;
  sprite.renderOrder = 20;
  root.add(beam, ring, sprite);
  return { root, beam, ring, sprite, mats: [mat, ringMat, sprite.material] };
}

export class Fx {
  constructor(scene) {
    this.scene = scene;
    this.list = [];
  }

  burst(x, y, z, color, n = 30, speed = 3, life = 0.8, size = 0.1, grav = -2, dir = null, additive = true) {
    const pos = new Float32Array(n * 3);
    const vel = [];
    for (let i = 0; i < n; i++) {
      pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z;
      let v;
      if (dir) {
        const a = dir.yaw + (Math.random() - 0.5) * 1.6;
        const s = speed * (0.4 + Math.random() * 0.6);
        v = [-Math.sin(a) * s, (Math.random() - 0.3) * 1.5, -Math.cos(a) * s];
      } else {
        const u = Math.random() * Math.PI * 2, w = Math.random() * 2 - 1, s = speed * (0.3 + Math.random() * 0.7);
        const k = Math.sqrt(1 - w * w);
        v = [Math.cos(u) * k * s, w * s, Math.sin(u) * k * s];
      }
      vel.push(v);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({ color, size, transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, fog: false });
    const p = new THREE.Points(geo, mat);
    this.scene.add(p);
    this.list.push({ obj: p, vel, life, t: 0, grav });
  }

  ring(x, z, color, maxR = 3.6, life = 0.6) {
    const mesh = new THREE.Mesh(
      new THREE.RingGeometry(0.9, 1, 48).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, side: DS }),
    );
    mesh.position.set(x, 0.05, z);
    this.scene.add(mesh);
    this.list.push({ obj: mesh, ring: maxR, life, t: 0 });
  }

  update(dt) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const e = this.list[i];
      e.t += dt;
      const f = e.t / e.life;
      if (f >= 1) {
        this.scene.remove(e.obj);
        e.obj.geometry.dispose();
        e.obj.material.dispose();
        this.list.splice(i, 1);
        continue;
      }
      if (e.ring) {
        e.obj.scale.setScalar(0.3 + f * e.ring);
      } else {
        const a = e.obj.geometry.attributes.position;
        for (let k = 0; k < e.vel.length; k++) {
          const v = e.vel[k];
          v[1] += e.grav * dt;
          a.array[k * 3] += v[0] * dt;
          a.array[k * 3 + 1] += v[1] * dt;
          a.array[k * 3 + 2] += v[2] * dt;
        }
        a.needsUpdate = true;
      }
      e.obj.material.opacity = 1 - f;
    }
  }
}
