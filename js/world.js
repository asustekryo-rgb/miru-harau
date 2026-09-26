// 屋敷の3Dジオメトリと役割ごとのライティング
import * as THREE from 'three';
import * as M from './map.js';
import * as TX from './textures.js';

function inst(geo, mat, list) {
  const m = new THREE.InstancedMesh(geo, mat, list.length);
  const o = new THREE.Object3D();
  list.forEach((p, i) => {
    o.position.set(p[0], p[1], p[2]);
    o.updateMatrix();
    m.setMatrixAt(i, o.matrix);
  });
  m.instanceMatrix.needsUpdate = true;
  m.computeBoundingSphere();
  return m;
}

function hasOpenNeighbor(c, r) {
  for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) if (M.ch(c + dc, r + dr) !== '#') return true;
  return false;
}

// 家具の形（テーマごと）: [幅, 高さ, 奥行, 色]
const FURNITURE = {
  house: [[1.3, 1.8, 0.7, 0x8a6a50], [1.4, 0.8, 1.0, 0x8a6a50], [1.5, 0.35, 1.0, 0x8a6a50]],
  school: [[1.0, 0.72, 0.65, 0xb08a60], [1.0, 0.72, 0.65, 0xa07a50], [0.9, 0.45, 0.9, 0x707070]],
  hospital: [[1.0, 0.6, 1.95, 0xd8d4c8], [0.6, 1.6, 0.5, 0x8a9290], [1.0, 0.6, 1.95, 0xc8b8a8]],
};

export function buildWorld(scene, role) {
  const root = new THREE.Group();
  scene.add(root);
  const raycast = [];
  const theme = M.STAGE.theme;
  const T = {
    wood: TX.woodFloor(), tatami: TX.tatami(), stone: TX.stone(), tile: TX.tile(), lino: TX.lino(),
    wall: theme === 'school' ? TX.schoolWall() : theme === 'hospital' ? TX.hospitalWall() : TX.plaster(),
    ceil: theme === 'house' ? TX.ceiling() : TX.ceilingPanel(),
  };
  const lam = (map, extra = {}) => new THREE.MeshLambertMaterial({ map, ...extra });

  const floors = { wood: [], tatami: [], stone: [], tile: [], lino: [] };
  const ceils = [], walls = [], lintels = [], furniture = [];
  for (let r = 0; r < M.H; r++) {
    for (let c = 0; c < M.W; c++) {
      const k = M.ch(c, r), x = M.center(c), z = M.center(r);
      if (k === '#') {
        if (hasOpenNeighbor(c, r)) walls.push([x, M.WALL_H / 2, z]);
        continue;
      }
      const room = M.roomAtCell(c, r);
      floors[room ? room.floor : 'wood'].push([x, 0, z]);
      ceils.push([x, M.WALL_H, z]);
      if (k === 'D' || k === 'X') lintels.push([x, M.WALL_H - 0.35, z]);
      if (k === 'f') furniture.push([c, r]);
    }
  }
  const floorG = new THREE.PlaneGeometry(M.CELL, M.CELL).rotateX(-Math.PI / 2);
  for (const k of Object.keys(floors)) {
    if (!floors[k].length) continue;
    const m = inst(floorG, lam(T[k]), floors[k]);
    m.receiveShadow = true;
    root.add(m);
    raycast.push(m);
  }
  root.add(inst(new THREE.PlaneGeometry(M.CELL, M.CELL).rotateX(Math.PI / 2), lam(T.ceil), ceils));
  const wallMesh = inst(new THREE.BoxGeometry(M.CELL, M.WALL_H, M.CELL), lam(T.wall), walls);
  wallMesh.castShadow = wallMesh.receiveShadow = true;
  root.add(wallMesh);
  raycast.push(wallMesh);
  root.add(inst(new THREE.BoxGeometry(M.CELL, 0.7, M.CELL), lam(T.ceil), lintels));

  // 家具
  const kinds = FURNITURE[theme];
  const furnMats = kinds.map((k) => lam(theme === 'hospital' ? null : T.wood, { color: k[3] }));
  for (const [c, r] of furniture) {
    const v = (c * 7 + r * 13) % 3;
    const size = kinds[v].slice(0, 3);
    const m = new THREE.Mesh(new THREE.BoxGeometry(...size), furnMats[v]);
    m.castShadow = m.receiveShadow = true;
    if (theme === 'hospital' && v !== 1) m.rotation.y = ((c + r) % 2) * 0.25 - 0.12;
    // 病院のベッドには血の染みたシーツ
    if (theme === 'hospital' && v !== 1) {
      const sheet = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 1.8).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ map: TX.bloodTex(), color: 0xffffff, transparent: true }));
      sheet.position.y = size[1] / 2 + 0.01;
      m.add(sheet);
    }
    m.position.set(M.center(c), size[1] / 2, M.center(r));
    root.add(m);
    raycast.push(m);
  }

  // 封印扉
  const sealTex = TX.sealTex();
  const E = M.parseEntities();
  let sealCell = null;
  for (let r = 0; r < M.H; r++) for (let c = 0; c < M.W; c++) if (M.ch(c, r) === 'X') sealCell = [c, r];
  const sealMat = new THREE.MeshLambertMaterial({ map: sealTex, emissive: 0xff2020, emissiveMap: sealTex, emissiveIntensity: 0.3 });
  const seal = new THREE.Mesh(new THREE.BoxGeometry(M.CELL, M.WALL_H - 0.7, 0.25), sealMat);
  seal.position.set(M.center(sealCell[0]), (M.WALL_H - 0.7) / 2, M.center(sealCell[1]));
  root.add(seal);
  raycast.push(seal);

  // 玄関の戸と出口の光
  const ex = E.exits;
  const exCx = (M.center(ex[0].c) + M.center(ex[ex.length - 1].c)) / 2;
  const exZ = (ex[0].r + 1) * M.CELL;
  const doorMat = new THREE.MeshLambertMaterial({ map: TX.doorTex(), emissive: 0x000000 });
  const door = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 2.4), doorMat);
  door.rotation.y = Math.PI;
  door.position.set(exCx, 1.2, exZ - 0.02);
  root.add(door);
  const exitGlow = new THREE.Mesh(
    new THREE.PlaneGeometry(ex.length * M.CELL, M.CELL).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0xbff0ff, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }),
  );
  exitGlow.position.set(exCx, 0.03, M.center(ex[0].r));
  exitGlow.visible = false;
  root.add(exitGlow);

  // アイテム
  const items = new Map();
  const ofudaTex = TX.ofuda('護');
  for (const t of E.talismans) {
    const g = new THREE.Group();
    const p = new THREE.Mesh(
      new THREE.PlaneGeometry(0.22, 0.55),
      new THREE.MeshBasicMaterial({ map: ofudaTex, side: THREE.DoubleSide, fog: false }),
    );
    g.add(p);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: TX.flame(), color: 0xffd9a0, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    glow.scale.setScalar(0.9);
    g.add(glow);
    g.position.set(t.x, 1.1, t.z);
    g.userData.spin = true;
    root.add(g);
    items.set(t.id, g);
  }
  for (const s of E.salts) {
    const g = new THREE.Group();
    const dish = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.16, 0.05, 16), new THREE.MeshBasicMaterial({ color: 0x3a2a20 }));
    const pile = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.16, 16), new THREE.MeshBasicMaterial({ color: 0xf4f4f0, fog: false }));
    pile.position.y = 0.1;
    g.add(dish, pile);
    g.position.set(s.x, 0.03, s.z);
    root.add(g);
    items.set(s.id, g);
  }

  // 蝋燭
  const flameTex = TX.flame();
  const candles = [];
  for (const [c, r, color] of M.STAGE.candles) {
    const x = M.center(c), z = M.center(r) - 0.6;
    const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.08, 1.0, 8), new THREE.MeshLambertMaterial({ color: 0x1a1410 }));
    stand.position.set(x, 0.5, z);
    const fl = new THREE.Sprite(new THREE.SpriteMaterial({ map: flameTex, color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    fl.scale.setScalar(0.22);
    fl.position.set(x, 1.1, z);
    const light = new THREE.PointLight(color, 5, 9, 2);
    light.position.set(x, 1.25, z);
    root.add(stand, fl, light);
    candles.push({ light, fl, base: 5, seed: Math.random() * 10 });
  }

  // 両役とも同じ暗さ（懐中電灯と蝋燭だけが頼り）。指示役は霊だけが闇に浮かんで見える
  scene.background = new THREE.Color(0x000000);
  scene.fog = new THREE.Fog(0x000000, 1.5, 16);
  scene.add(new THREE.AmbientLight(role === 'seer' ? 0x4a5078 : 0x4a5570, 0.6));

  const W = {
    root, raycast, items, sealOpened: false, exitActive: false,
    openSeal() {
      if (this.sealOpened) return;
      this.sealOpened = true;
      root.remove(seal);
      raycast.splice(raycast.indexOf(seal), 1);
    },
    setExitActive() {
      this.exitActive = true;
      exitGlow.visible = true;
    },
    removeItem(id) {
      const g = items.get(id);
      if (!g) return;
      root.remove(g);
      items.delete(id);
    },
    update(dt, time) {
      for (const cd of candles) {
        const f = 0.8 + Math.sin(time * 13 + cd.seed) * 0.08 + Math.sin(time * 7.3 + cd.seed * 2) * 0.1;
        cd.light.intensity = cd.base * f;
        cd.fl.scale.setScalar(0.2 + f * 0.04);
      }
      for (const g of items.values()) {
        if (!g.userData.spin) continue;
        g.rotation.y += dt * 1.2;
        g.position.y = 1.1 + Math.sin(time * 2) * 0.06;
      }
      if (!this.sealOpened) sealMat.emissiveIntensity = 0.25 + Math.sin(time * 2) * 0.12;
      if (this.exitActive) {
        exitGlow.material.opacity = 0.22 + Math.sin(time * 3) * 0.1;
        doorMat.emissive.setRGB(0.15, 0.2, 0.25);
      }
    },
  };
  return W;
}
