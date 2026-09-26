// ステージの3Dジオメトリとライティング
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import * as M from './map.js';
import * as TX from './textures.js';

// list: [x, y, z, 回転Y]
function inst(geo, mat, list) {
  const m = new THREE.InstancedMesh(geo, mat, list.length);
  const o = new THREE.Object3D();
  list.forEach((p, i) => {
    o.position.set(p[0], p[1], p[2]);
    o.rotation.set(0, p[3] || 0, 0);
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

// セルごとに決まる擬似乱数（全端末で同じ配置になる）
function hash(c, r, k = 0) {
  let h = (c * 374761393 + r * 668265263 + k * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// 模様違いのテクスチャ（ステージのテーマごとに一度だけ作って使い回す）
const VARIANTS = 4;
const texCache = new Map();
function surfaceTextures(theme) {
  if (texCache.has(theme)) return texCache.get(theme);
  const floorsUsed = new Set(M.ROOMS.map((R) => R.floor).concat('wood'));
  const make = (fn, n = VARIANTS) => Array.from({ length: n }, (_, i) => fn(i));
  const T = { floor: {} };
  for (const f of floorsUsed) T.floor[f] = make({ wood: TX.woodFloor, tatami: TX.tatami, stone: TX.stone, tile: TX.tile, lino: TX.lino }[f]);
  T.wall = make(theme === 'school' ? TX.schoolWall : theme === 'hospital' ? TX.hospitalWall : TX.plaster);
  T.ceil = make(theme === 'house' ? TX.ceiling : TX.ceilingPanel, 3);
  texCache.set(theme, T);
  return T;
}

// 表面の凹凸：色テクスチャをそのまま凹凸にも使う（懐中電灯の斜めの光で陰影が出る）
function surfaceMat(map, bump = 0.6) {
  return new THREE.MeshLambertMaterial({ map, bumpMap: map, bumpScale: bump });
}

// 家具の形（テーマごと）: [幅, 高さ, 奥行, 色]
const FURNITURE = {
  house: [[1.3, 1.8, 0.7, 0x8a6a50], [1.4, 0.8, 1.0, 0x8a6a50], [1.5, 0.35, 1.0, 0x8a6a50]],
  school: [[1.0, 0.72, 0.65, 0xb08a60], [1.0, 0.72, 0.65, 0xa07a50], [0.9, 0.45, 0.9, 0x707070]],
  hospital: [[1.0, 0.6, 1.95, 0xd8d4c8], [0.6, 1.6, 0.5, 0x8a9290], [1.0, 0.6, 1.95, 0xc8b8a8]],
};

// 床と壁に散らす汚れ・小物（テーマ別の出やすさ）
const FLOOR_DECALS = {
  house: { dirt: 4, debris: 2, papers: 1, bloodPool: 1, footprints: 1, drag: 1, puddle: 1 },
  school: { dirt: 3, debris: 3, papers: 3, bloodPool: 1, footprints: 2, drag: 1, puddle: 1 },
  hospital: { dirt: 3, debris: 2, papers: 2, bloodPool: 2, footprints: 1, drag: 2, puddle: 2 },
};
const WALL_DECALS = {
  house: { mold: 3, streak: 3, scratches: 2, writing: 1, hands: 1 },
  school: { mold: 2, streak: 2, scratches: 2, writing: 2, notice: 3, hands: 2 },
  hospital: { mold: 2, streak: 3, scratches: 2, writing: 1, notice: 3, hands: 2 },
};
const DECAL_SIZE = {
  dirt: [1.2, 1.2], debris: [1.0, 1.0], papers: [0.9, 0.9], puddle: [1.3, 1.3], bloodPool: [1.1, 1.1],
  footprints: [0.8, 1.6], drag: [0.8, 1.9], mold: [1.2, 1.8], streak: [1.2, 1.8], scratches: [0.8, 0.8],
  writing: [1.6, 0.8], notice: [0.45, 0.6], hands: [0.8, 1.0], scroll: [0.6, 1.6], chalkboard: [3.6, 1.2],
};
function pickWeighted(table, t) {
  const total = Object.values(table).reduce((a, b) => a + b, 0);
  let x = t * total;
  for (const [k, w] of Object.entries(table)) if ((x -= w) < 0) return k;
  return Object.keys(table)[0];
}

// 汚れ・小物を種類ごとに1つのメッシュへまとめて描く（描画回数を減らす）
function buildDecals(root, theme) {
  const groups = new Map(); // key: 種類+模様番号 → ジオメトリ一覧
  const push = (kind, v, geo) => {
    const key = kind + ':' + v;
    if (!groups.has(key)) groups.set(key, { kind, v, geos: [] });
    groups.get(key).geos.push(geo);
  };
  const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]]; // 北・東・南・西
  let n = 0;
  for (let r = 0; r < M.H; r++) {
    for (let c = 0; c < M.W; c++) {
      const k = M.ch(c, r);
      if (k === '#' || k === 'X') continue;
      const cx = M.center(c), cz = M.center(r);
      // 床
      if (k !== 'f' && k !== 'E' && hash(c, r, 1) < 0.42) {
        const kind = pickWeighted(FLOOR_DECALS[theme], hash(c, r, 2));
        const [w, h] = DECAL_SIZE[kind];
        const s = 0.8 + hash(c, r, 3) * 0.6;
        const g = new THREE.PlaneGeometry(w * s, h * s).rotateX(-Math.PI / 2).rotateY(hash(c, r, 4) * Math.PI * 2);
        g.translate(cx + (hash(c, r, 5) - 0.5) * 0.9, 0.01 + (n++ % 7) * 0.0015, cz + (hash(c, r, 6) - 0.5) * 0.9);
        push(kind, Math.floor(hash(c, r, 7) * 3), g);
      }
      // 壁（このセルに接する壁の面）
      DIRS.forEach(([dc, dr], i) => {
        if (M.ch(c + dc, r + dr) !== '#' || hash(c, r, 10 + i) > 0.3) return;
        const kind = pickWeighted(WALL_DECALS[theme], hash(c, r, 20 + i));
        const [w, h] = DECAL_SIZE[kind];
        const g = new THREE.PlaneGeometry(w, h);
        g.rotateY(Math.atan2(-dc, -dr));
        const y = kind === 'notice' ? 1.3 + hash(c, r, 30 + i) * 0.4 : kind === 'mold' ? h / 2 : 0.7 + hash(c, r, 30 + i) * 1.2;
        const off = (hash(c, r, 40 + i) - 0.5) * 1.0;
        g.translate(cx + dc * 0.985 + (dr ? off : 0), Math.min(y, M.WALL_H - h / 2 - 0.05), cz + dr * 0.985 + (dc ? off : 0));
        push(kind, Math.floor(hash(c, r, 50 + i) * 3), g);
      });
    }
  }
  // 部屋ごとの目印：教室の黒板、和室の掛け軸
  M.ROOMS.forEach((R, i) => {
    let kind = null;
    if (theme === 'school' && R.name.includes('組')) kind = 'chalkboard';
    if (theme === 'house' && R.floor === 'tatami') kind = 'scroll';
    if (!kind) return;
    const c = Math.round((R.c0 + R.c1) / 2), r = R.r0;
    if (M.ch(c, r - 1) !== '#') return;
    const [w, h] = DECAL_SIZE[kind];
    const g = new THREE.PlaneGeometry(w, h);
    g.translate(M.center(c) + (kind === 'scroll' ? 1 : 0), kind === 'chalkboard' ? 1.55 : 1.45, r * M.CELL + 0.012);
    push(kind, i % 3, g);
  });

  for (const { kind, v, geos } of groups.values()) {
    const tex = TX.DECALS[kind](v);
    const mat = new THREE.MeshLambertMaterial({
      map: tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, side: THREE.FrontSide,
    });
    const mesh = new THREE.Mesh(mergeGeometries(geos), mat);
    mesh.receiveShadow = true;
    root.add(mesh);
  }
}

export function buildWorld(scene, role) {
  const root = new THREE.Group();
  scene.add(root);
  const raycast = [];
  const theme = M.STAGE.theme;
  const ST = surfaceTextures(theme);
  const T = { wood: ST.floor.wood[0] };
  const lam = (map, extra = {}) => new THREE.MeshLambertMaterial({ map, ...extra });

  // 床・壁・天井：セルごとに模様違いを選び、床は向きも変えて同じ柄の並びを崩す
  const floors = {}, walls = [], ceils = [];
  const lintels = [], furniture = [];
  for (let r = 0; r < M.H; r++) {
    for (let c = 0; c < M.W; c++) {
      const k = M.ch(c, r), x = M.center(c), z = M.center(r);
      if (k === '#') {
        if (hasOpenNeighbor(c, r)) (walls[Math.floor(hash(c, r, 60) * VARIANTS)] ||= []).push([x, M.WALL_H / 2, z]);
        continue;
      }
      const room = M.roomAtCell(c, r);
      const f = room ? room.floor : 'wood';
      const v = Math.floor(hash(c, r, 61) * VARIANTS);
      // 板や畳は縦横の向きが揃っていないと不自然なので 0/180 度、石やタイルは 90 度単位
      const turns = f === 'wood' || f === 'tatami' ? 2 : 4;
      const rot = Math.floor(hash(c, r, 62) * turns) * (Math.PI * 2 / turns);
      ((floors[f] ||= [])[v] ||= []).push([x, 0, z, rot]);
      (ceils[Math.floor(hash(c, r, 63) * 3)] ||= []).push([x, M.WALL_H, z, Math.floor(hash(c, r, 64) * 4) * Math.PI / 2]);
      if (k === 'D' || k === 'X') lintels.push([x, M.WALL_H - 0.35, z]);
      if (k === 'f') furniture.push([c, r]);
    }
  }
  const floorG = new THREE.PlaneGeometry(M.CELL, M.CELL).rotateX(-Math.PI / 2);
  for (const [f, byVar] of Object.entries(floors)) {
    byVar.forEach((list, v) => {
      if (!list) return;
      const m = inst(floorG, surfaceMat(ST.floor[f][v], f === 'tatami' ? 0.4 : 0.8), list);
      m.receiveShadow = true;
      root.add(m);
      raycast.push(m);
    });
  }
  const ceilG = new THREE.PlaneGeometry(M.CELL, M.CELL).rotateX(Math.PI / 2);
  ceils.forEach((list, v) => { if (list) root.add(inst(ceilG, surfaceMat(ST.ceil[v], 0.5), list)); });
  const wallG = new THREE.BoxGeometry(M.CELL, M.WALL_H, M.CELL);
  walls.forEach((list, v) => {
    if (!list) return;
    const m = inst(wallG, surfaceMat(ST.wall[v], 0.7), list);
    m.castShadow = m.receiveShadow = true;
    root.add(m);
    raycast.push(m);
  });
  root.add(inst(new THREE.BoxGeometry(M.CELL, 0.7, M.CELL), surfaceMat(ST.ceil[0], 0.4), lintels));
  buildDecals(root, theme);


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
