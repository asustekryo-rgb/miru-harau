// 屋敷のマップ定義とグリッド計算（当たり判定・視線・経路探索）
export const CELL = 2;
export const WALL_H = 3;

// # 壁  . 床  D 出入口  X 封印扉  f 家具  S 開始地点  E 出口
// 1-3 御札  s 清め塩  B 主
// w 彷徨い（近くの御札を守る）  c 這い女（同）  p q 巡回する霊（ROUTES の経路を回る）
export const SRC = [
  '#####################',
  '#.....#.......#.....#',
  '#..1..#...q...#.....#',
  '#...w.#.....s.#..c..#',
  '#.f...#.f...f.#.f.2.#',
  '###D######D######D###',
  '#p..................#',
  '#...................#',
  '###D######D####X#####',
  '#.....#.......#.....#',
  '#..s..#...S...#.....#',
  '#..3w.#.......#..B..#',
  '#.f...#.......#.....#',
  '#.....#.fEEEf.#f...f#',
  '#####################',
];

// 巡回経路（セル座標の輪）。隣り合う点の間はBFSで歩く
export const ROUTES = {
  p: [[1, 6], [19, 6], [19, 7], [1, 7]],
  q: [[10, 2], [3, 3], [3, 6], [17, 6], [17, 2], [10, 3]],
};
export const H = SRC.length;
export const W = SRC[0].length;
const grid = SRC.map((row) => row.split(''));

export const ROOMS = [
  { name: '客間', c0: 1, r0: 1, c1: 5, r1: 4, floor: 'tatami' },
  { name: '広間', c0: 7, r0: 1, c1: 13, r1: 4, floor: 'tatami' },
  { name: '台所', c0: 15, r0: 1, c1: 19, r1: 4, floor: 'wood' },
  { name: '廊下', c0: 1, r0: 5, c1: 19, r1: 8, floor: 'wood' },
  { name: '和室', c0: 1, r0: 9, c1: 5, r1: 13, floor: 'tatami' },
  { name: '玄関', c0: 7, r0: 9, c1: 13, r1: 13, floor: 'stone' },
  { name: '奥の間', c0: 15, r0: 9, c1: 19, r1: 13, floor: 'tatami' },
];
export const BOSS_ROOM = ROOMS[6];

export const ch = (c, r) => (r < 0 || r >= H || c < 0 || c >= W ? '#' : grid[r][c]);
export const cellOf = (v) => Math.floor(v / CELL);
export const center = (c) => c * CELL + CELL / 2;
export const inRect = (R, c, r) => c >= R.c0 && c <= R.c1 && r >= R.r0 && r <= R.r1;
export const roomAtCell = (c, r) => ROOMS.find((R) => inRect(R, c, r)) || null;

export function parseEntities() {
  const out = { spawn: null, exits: [], talismans: [], salts: [], ghosts: [] };
  let gi = 0;
  let si = 0;
  for (let r = 0; r < H; r++) {
    for (let c = 0; c < W; c++) {
      const k = grid[r][c];
      const base = { c, r, x: center(c), z: center(r) };
      if (k === 'S') out.spawn = base;
      else if (k === 'E') out.exits.push(base);
      else if (k >= '1' && k <= '3') out.talismans.push({ ...base, id: 't' + k });
      else if (k === 's') out.salts.push({ ...base, id: 's' + si++ });
      else if (k === 'w') out.ghosts.push({ ...base, id: 'g' + gi++, type: 'wander', role: 'guard' });
      else if (k === 'c') out.ghosts.push({ ...base, id: 'g' + gi++, type: 'crawl', role: 'guard' });
      else if (k === 'p' || k === 'q') out.ghosts.push({ ...base, id: 'g' + gi++, type: 'wander', role: 'patrol', route: k });
      else if (k === 'B') out.ghosts.push({ ...base, id: 'g' + gi++, type: 'boss', role: 'boss' });
    }
  }
  return out;
}

// blocks 関数は「塞がれていれば内側への縮み量(>=0)、通れるなら -1」を返す
export function blocksPlayerFn(sealOpen) {
  return (c, r) => {
    const k = ch(c, r);
    if (k === '#') return 0;
    if (k === 'X') return sealOpen ? -1 : 0;
    if (k === 'f') return 0.25;
    return -1;
  };
}
export function blocksGhostFn(sealOpen, room) {
  return (c, r) => {
    const k = ch(c, r);
    if (k === '#' || (k === 'X' && !sealOpen)) return 0;
    if (room && !inRect(room, c, r)) return 0;
    return -1;
  };
}
export function blocksSightFn(sealOpen) {
  return (c, r) => {
    const k = ch(c, r);
    return k === '#' || (k === 'X' && !sealOpen) ? 0 : -1;
  };
}

export function circleHits(x, z, rad, blocks) {
  const c0 = cellOf(x - rad), c1 = cellOf(x + rad), r0 = cellOf(z - rad), r1 = cellOf(z + rad);
  for (let r = r0; r <= r1; r++) {
    for (let c = c0; c <= c1; c++) {
      const ins = blocks(c, r);
      if (ins < 0) continue;
      const x0 = c * CELL + ins, x1 = (c + 1) * CELL - ins;
      const z0 = r * CELL + ins, z1 = (r + 1) * CELL - ins;
      const px = Math.max(x0, Math.min(x, x1));
      const pz = Math.max(z0, Math.min(z, z1));
      if ((x - px) ** 2 + (z - pz) ** 2 < rad * rad) return true;
    }
  }
  return false;
}

export function moveCircle(o, dx, dz, rad, blocks) {
  if (!circleHits(o.x + dx, o.z, rad, blocks)) o.x += dx;
  if (!circleHits(o.x, o.z + dz, rad, blocks)) o.z += dz;
}

export function los(x1, z1, x2, z2, blocks) {
  const d = Math.hypot(x2 - x1, z2 - z1);
  const n = Math.ceil(d / 0.3);
  for (let i = 1; i < n; i++) {
    const t = i / n;
    if (blocks(cellOf(x1 + (x2 - x1) * t), cellOf(z1 + (z2 - z1) * t)) >= 0) return false;
  }
  return true;
}

// 4近傍BFS。スタートを除いたセル列 [[c,r],...] を返す。届かなければ null
export function bfs(sc, sr, gc, gr, blocks) {
  if (sc === gc && sr === gr) return [];
  if (blocks(gc, gr) >= 0) return null;
  const prev = new Int32Array(W * H).fill(-1);
  const start = sr * W + sc;
  const goal = gr * W + gc;
  const q = [start];
  prev[start] = start;
  for (let qi = 0; qi < q.length; qi++) {
    const cur = q[qi];
    if (cur === goal) break;
    const c = cur % W, r = (cur / W) | 0;
    for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nc = c + dc, nr = r + dr;
      if (nc < 0 || nr < 0 || nc >= W || nr >= H) continue;
      const ni = nr * W + nc;
      if (prev[ni] !== -1 || blocks(nc, nr) >= 0) continue;
      prev[ni] = cur;
      q.push(ni);
    }
  }
  if (prev[goal] === -1) return null;
  const path = [];
  for (let i = goal; i !== start; i = prev[i]) path.push([i % W, (i / W) | 0]);
  return path.reverse();
}
