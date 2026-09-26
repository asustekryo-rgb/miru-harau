// 霊・プレイヤーの姿・刀・印・パーティクル
import * as THREE from 'three';
import { glyph, ofuda } from './textures.js';

const DS = THREE.DoubleSide;
function basic(color, opacity = 1, extra = {}) {
  return new THREE.MeshBasicMaterial({
    color, transparent: opacity < 1, opacity, depthWrite: opacity >= 1, fog: false, side: DS, ...extra,
  });
}
function limb(parent, px, py, pz, len, mat, rx, rz) {
  const pivot = new THREE.Group();
  pivot.position.set(px, py, pz);
  const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.028, len, 6), mat);
  arm.position.y = -len / 2;
  const hand = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), mat);
  hand.position.y = -len;
  pivot.add(arm, hand);
  pivot.rotation.set(rx, 0, rz);
  parent.add(pivot);
  return { pivot, base: rx };
}

// 霊の正面は -Z。弱点は体のローカル座標で配置
export function makeGhost(type) {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const robe = basic(type === 'boss' ? 0xffc8c8 : 0xdde6ff, 0.5);
  const hair = basic(0x020204, 0.92);
  const skin = basic(0xe8ecf4, 0.6);
  const arms = [];

  if (type === 'crawl') {
    const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.28, 1.3, 10, 1, true), robe);
    torso.rotation.x = Math.PI / 2;
    torso.position.set(0, 0.28, 0.25);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 10), skin);
    head.position.set(0, 0.32, -0.55);
    const hr = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.42, 0.9, 10, 1, true), hair);
    hr.rotation.x = Math.PI / 2;
    hr.position.set(0, 0.26, -0.85);
    body.add(torso, head, hr);
    arms.push(limb(body, 0.22, 0.3, -0.35, 0.8, skin, 1.2, 0.7));
    arms.push(limb(body, -0.22, 0.3, -0.35, 0.8, skin, 1.2, -0.7));
    limb(body, 0.18, 0.28, 0.85, 0.7, skin, -1.0, 0.5);
    limb(body, -0.18, 0.28, 0.85, 0.7, skin, -1.0, -0.5);
  } else {
    const robeM = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.52, 1.55, 14, 1, true), robe);
    robeM.position.y = 0.8;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 12, 10), skin);
    head.position.y = 1.72;
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.185, 12, 10), hair);
    cap.position.set(0, 1.75, 0.03);
    const back = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.3, 1.05, 12, 1, true, -Math.PI / 2, Math.PI), hair);
    back.position.y = 1.3;
    const front = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.75), hair);
    front.position.set(0, 1.5, -0.19);
    body.add(robeM, head, cap, back, front);
    arms.push(limb(body, 0.24, 1.45, -0.02, 0.72, skin, 0.15, 0.1));
    arms.push(limb(body, -0.24, 1.45, -0.02, 0.72, skin, 0.15, -0.1));
    if (type === 'boss') {
      arms.push(limb(body, 0.3, 1.2, 0, 0.8, skin, 0.3, 0.5));
      arms.push(limb(body, -0.3, 1.2, 0, 0.8, skin, 0.3, -0.5));
      const halo = new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.025, 8, 32), basic(0xff3030, 0.9));
      halo.position.set(0, 1.8, 0.25);
      body.add(halo);
      body.scale.setScalar(1.5);
    }
  }

  const weak = new THREE.Mesh(
    new THREE.SphereGeometry(0.11, 12, 10),
    basic(0xff2030, 0.95, { depthTest: false, blending: THREE.AdditiveBlending }),
  );
  weak.renderOrder = 10;
  body.add(weak);

  const ring = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.68, 40).rotateX(-Math.PI / 2), basic(0xff3040, 0.8));
  ring.position.y = 0.03;
  ring.visible = false;
  const slamRing = new THREE.Mesh(new THREE.RingGeometry(3.3, 3.6, 64).rotateX(-Math.PI / 2), basic(0xff2020, 0.6));
  slamRing.position.y = 0.04;
  slamRing.visible = false;
  root.add(ring, slamRing);

  const meshes = [];
  body.traverse((o) => { if (o.isMesh && o !== weak) meshes.push(o); });
  return { root, body, robe, hair, skin, weak, ring, slamRing, arms, type, meshes, baseScale: type === 'boss' ? 1.5 : 1 };
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

  burst(x, y, z, color, n = 30, speed = 3, life = 0.8, size = 0.1, grav = -2, dir = null) {
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
    const mat = new THREE.PointsMaterial({ color, size, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
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
