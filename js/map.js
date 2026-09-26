// ステージ（マップ）定義とグリッド計算（当たり判定・視線・経路探索）
export const CELL = 2;
export const WALL_H = 3;

// # 壁  . 床  D 出入口  X 封印扉  f 家具  S 開始地点  E 出口
// 1-3 御札  s 清め塩  B 主
// w 彷徨い（近くの御札を守る）  c 這い女（同）  p q 巡回する霊（routes の経路を回る）
// theme: 壁・天井・家具の見た目   candles: [列, 行, 色] の明かり
export const STAGES = [
  {
    name: '廃屋敷', night: '第一夜', theme: 'house',
    src: [
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
      '#..s..#.......#.....#',
      '#..3w.#.......#..B..#',
      '#.f...#...S...#.....#',
      '#.....#.fEEEf.#f...f#',
      '#####################',
    ],
    routes: {
      p: [[1, 6], [19, 6], [19, 7], [1, 7]],
      q: [[10, 2], [3, 3], [3, 6], [17, 6], [17, 2], [10, 3]],
    },
    rooms: [
      { name: '客間', c0: 1, r0: 1, c1: 5, r1: 4, floor: 'tatami' },
      { name: '広間', c0: 7, r0: 1, c1: 13, r1: 4, floor: 'tatami' },
      { name: '台所', c0: 15, r0: 1, c1: 19, r1: 4, floor: 'wood' },
      { name: '廊下', c0: 1, r0: 5, c1: 19, r1: 8, floor: 'wood' },
      { name: '和室', c0: 1, r0: 9, c1: 5, r1: 13, floor: 'tatami' },
      { name: '玄関', c0: 7, r0: 9, c1: 13, r1: 13, floor: 'stone' },
      { name: '奥の間', c0: 15, r0: 9, c1: 19, r1: 13, floor: 'tatami', boss: true },
    ],
    candles: [[3, 1, 0xffa050], [8, 1, 0xffa050], [12, 9, 0xffa050], [19, 6, 0xffa050], [17, 13, 0xff3a2a]],
  },
  {
    name: '廃校', night: '第二夜', theme: 'school',
    src: [
      '#########################',
      '#.......#...s...#.......#',
      '#.ff.ff.#.ff.ff.#.ff.ff.#',
      '#...1...#...q...#.....2.#',
      '#.ff.fw.#.ff.ff.#.ff.fc.#',
      '####D#######D#######D####',
      '#p......................#',
      '#.......................#',
      '####D#######D#####X######',
      '#.......#.......#.......#',
      '#.3.....#.......#.......#',
      '#.....w.#.......#...B...#',
      '#.f...s.#.S.....#.......#',
      '#.......#..EEE..#.f...f.#',
      '#########################',
    ],
    routes: {
      p: [[1, 6], [23, 6], [23, 7], [1, 7]],
      q: [[12, 3], [20, 3], [20, 7], [4, 7], [4, 3]],
    },
    rooms: [
      { name: '一年A組', c0: 1, r0: 1, c1: 7, r1: 4, floor: 'wood' },
      { name: '一年B組', c0: 9, r0: 1, c1: 15, r1: 4, floor: 'wood' },
      { name: '一年C組', c0: 17, r0: 1, c1: 23, r1: 4, floor: 'wood' },
      { name: '廊下', c0: 1, r0: 5, c1: 23, r1: 8, floor: 'lino' },
      { name: '保健室', c0: 1, r0: 9, c1: 7, r1: 13, floor: 'tile' },
      { name: '昇降口', c0: 9, r0: 9, c1: 15, r1: 13, floor: 'stone' },
      { name: '音楽室', c0: 17, r0: 9, c1: 23, r1: 13, floor: 'wood', boss: true },
    ],
    candles: [[4, 1, 0xffa050], [12, 9, 0x8fffb0], [23, 6, 0x8fffb0], [1, 7, 0x8fffb0], [20, 13, 0xff3a2a]],
  },
  {
    name: '廃病院', night: '第三夜', theme: 'hospital',
    src: [
      '#######################',
      '#.....#.....#.........#',
      '#.f.f.#.f1f.#..f...f..#',
      '#..s..#..w..#.....3...#',
      '#.f.f.#.f.f.#.f...c.f.#',
      '###D#####D#####D#######',
      '#p....................#',
      '#.........q...........#',
      '###D#####X#####D#######',
      '#.....#.....#.........#',
      '#..2..#.....#....S....#',
      '#...w.#..B..#.........#',
      '#.f.f.#.....#..f...f..#',
      '#.s...#.f.f.#...EEE..s#',
      '#######################',
    ],
    routes: {
      p: [[1, 6], [21, 6], [21, 7], [1, 7]],
      q: [[10, 7], [9, 3], [17, 2], [17, 11], [3, 11], [3, 6]],
    },
    rooms: [
      { name: '病室101', c0: 1, r0: 1, c1: 5, r1: 4, floor: 'tile' },
      { name: '病室102', c0: 7, r0: 1, c1: 11, r1: 4, floor: 'tile' },
      { name: 'ナースステーション', c0: 13, r0: 1, c1: 21, r1: 4, floor: 'lino' },
      { name: '廊下', c0: 1, r0: 5, c1: 21, r1: 8, floor: 'lino' },
      { name: '霊安室', c0: 1, r0: 9, c1: 5, r1: 13, floor: 'stone' },
      { name: '手術室', c0: 7, r0: 9, c1: 11, r1: 13, floor: 'tile', boss: true },
      { name: '待合室', c0: 13, r0: 9, c1: 21, r1: 13, floor: 'lino' },
    ],
    candles: [[3, 9, 0x9fc8ff], [9, 1, 0x9fc8ff], [21, 6, 0x8fffb0], [9, 13, 0xff3a2a], [17, 9, 0x9fc8ff]],
  },
];

// 現在のステージ。setStage() で切り替える（ES Modules のライブバインディング）
export let STAGE, SRC, H, W, ROOMS, BOSS_ROOM, ROUTES;
let grid;
export function setStage(i) {
  STAGE = STAGES[i] || STAGES[0];
  SRC = STAGE.src;
  H = SRC.length;
  W = SRC[0].length;
  grid = SRC.map((row) => row.split(''));
  ROOMS = STAGE.rooms;
  BOSS_ROOM = ROOMS.find((R) => R.boss);
  ROUTES = STAGE.routes;
}
setStage(0);

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
