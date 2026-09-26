// ホスト権威のゲームシミュレーション（霊AI・ダメージ・アイテム・進行）
import * as M from './map.js';

export const TYPE_IDX = ['wander', 'crawl', 'boss'];
// 末尾に追加していくこと（スナップショットは添字で送る）
export const ST_IDX = ['dormant', 'roar', 'wander', 'chase', 'windup', 'recover', 'stun', 'flee', 'dead', 'lunge', 'alert'];
export const STANCE_IDX = ['idle', 'walk', 'run', 'crouch'];
export const ROLE_IDX = [null, 'seer', 'exo'];
export const TIME_LIMIT = 15 * 60;
const MAT = new Set(['windup', 'lunge', 'recover', 'stun']);

// strike: 構え始める距離  lunge: 突進の速さ  hitR: 突進中の当たり半径
const TYPES = {
  wander: { hp: 3, walk: 1.1, run: 2.3, dmg: 22, seer: 34, notice: 9, strike: 1.9, windup: 0.9, lunge: 7, hitR: 0.85 },
  crawl: { hp: 3, walk: 1.5, run: 2.8, dmg: 18, seer: 30, notice: 9, strike: 2.0, windup: 0.8, lunge: 8, hitR: 0.85 },
  boss: { hp: 12, walk: 1.0, run: 2.0, dmg: 28, seer: 40, notice: 14, strike: 2.6, windup: 1.0, lunge: 6, hitR: 1.3 },
};
// 姿勢ごとの見つかりやすさ
const SIGHT_MUL = { idle: 0.7, walk: 1, run: 1.25, crouch: 0.4 };
const NOISE = { idle: 0, walk: 4, run: 11, crouch: 0 };
const RESPAWN = { guard: 75, patrol: 90 };
// 結界術：指示役が張る光の輪。霊は入れず、触れた霊は縛られて実体化する。中にいる者は攻撃を受けない
export const BARRIER = { uses: 3, r: 1.7, dur: 10, bind: 2.5, bindBoss: 1.2 };

const TAU = Math.PI * 2;
export const wrap = (a) => ((((a + Math.PI) % TAU) + TAU) % TAU) - Math.PI;
export const angDiff = (a, b) => Math.abs(wrap(a - b));
// yaw=0 で -Z 方向を向く（カメラと同じ規約）
export const yawTo = (dx, dz) => Math.atan2(-dx, -dz);
const turn = (cur, target, step) => cur + Math.max(-step, Math.min(step, wrap(target - cur)));
const r2 = (v) => Math.round(v * 100) / 100;
const inRoom = (p, R) => M.inRect(R, M.cellOf(p.x), M.cellOf(p.z));

export class Sim {
  constructor(emit, opts = {}) {
    this.emit = emit;
    const solo = !!opts.solo;
    const E = M.parseEntities();
    this.exits = E.exits;
    this.time = 0;
    this.phase = 'talisman';
    this.sealOpen = false;
    this.bossDead = false;
    this.over = false;
    this.items = [
      ...E.talismans.map((t) => ({ ...t, kind: 'talisman', taken: false })),
      ...E.salts.map((s) => ({ ...s, kind: 'salt', taken: false })),
    ];
    const sx = M.center(E.spawn.c), sz = M.center(E.spawn.r);
    const base = { yaw: 0, pitch: 0, guard: false, down: false, revive: 0, lastHurt: -99, stance: 'idle', dodging: false };
    this.players = {
      seer: { ...base, role: 'seer', x: sx - 0.7, z: sz + 0.3, gauge: 0, bars: BARRIER.uses, present: !solo || opts.soloRole === 'seer' },
      exo: { ...base, role: 'exo', x: sx + 0.7, z: sz + 0.3, hp: 100, salt: 2, present: !solo || opts.soloRole === 'exo' },
    };
    this.nextId = 0;
    this.ghosts = E.ghosts.map((g) => this.makeGhost(g.type, g.x, g.z, { role: g.role, route: g.route }));
    this.respawns = [];
    this.stats = { swings: 0, hits: 0, weakHits: 0, exorcised: 0, dmg: 0 };
    this.markId = 0;
    this.barriers = [];
    this.barrierId = 0;
  }

  makeGhost(type, x, z, opts = {}) {
    const g = {
      id: 'g' + this.nextId++, type, x, z, y: type === 'crawl' ? 0.2 : 0, yaw: Math.random() * TAU,
      hp: TYPES[type].hp, st: type === 'boss' ? 'dormant' : 'wander', t: 0, dur: 1, cd: 0,
      path: null, repath: 0, target: null, reveal: 0, matEnd: -99, mat: false,
      ceil: false, ceilT: 3 + Math.random() * 4, phase: 1, kind: 'swipe',
      role: opts.role || 'guard', homeX: x, homeZ: z, lkx: x, lkz: z, lost: 0, hitSet: null,
      route: opts.route ? M.ROUTES[opts.route] : null, routeKey: opts.route || null, ri: 0,
    };
    if (g.route) {
      // 開始地点に最も近い経由点から回り始める
      let best = Infinity;
      g.route.forEach(([c, r], i) => {
        const d = Math.hypot(M.center(c) - x, M.center(r) - z);
        if (d < best) { best = d; g.ri = i; }
      });
    }
    return g;
  }

  get targets() {
    return Object.values(this.players).filter((p) => p.present && !p.down);
  }

  setPlayer(role, s) {
    const p = this.players[role];
    p.x = s.x; p.z = s.z; p.yaw = s.yaw; p.pitch = s.pitch; p.guard = !!s.guard;
    p.stance = s.st || 'walk';
    p.dodging = !!s.dg;
  }

  input(role, m) {
    if (this.over) return;
    const p = this.players[role];
    if (!p || p.down) return;
    if (m.t === 'atk' && role === 'exo') this.exoAttack(m);
    else if (m.t === 'salt' && role === 'exo') this.exoSalt(m);
    else if (m.t === 'mark' && role === 'seer') {
      this.emit({ e: 'marker', id: ++this.markId, gid: m.gid || null, x: r2(m.x), z: r2(m.z), dur: m.gid ? 7 : 8 });
    } else if (m.t === 'ping') this.emit({ e: 'ping', k: m.k, from: role });
    else if (m.t === 'barrier' && role === 'seer' && p.bars > 0) {
      p.bars--;
      const b = { id: ++this.barrierId, x: r2(m.x), z: r2(m.z), until: this.time + BARRIER.dur, bound: new Set() };
      this.barriers.push(b);
      this.emit({ e: 'barrier', id: b.id, x: b.x, z: b.z, left: p.bars });
    }
  }

  update(dt) {
    if (this.over) return;
    this.time += dt;
    for (const g of this.ghosts) this.updateGhost(g, dt);
    this.ghosts = this.ghosts.filter((g) => !(g.st === 'dead' && g.t <= 0));
    this.barriers = this.barriers.filter((b) => b.until > this.time);
    this.updateRespawns();
    this.updateItems();
    this.updatePlayers(dt);
    this.checkEnd();
  }

  ghostBlocks(g) {
    return M.blocksGhostFn(this.sealOpen, g.type === 'boss' ? M.BOSS_ROOM : null);
  }

  setSt(g, st, t) {
    g.st = st;
    g.t = t;
    g.dur = t;
  }

  nearest(g) {
    let best = null, bd = Infinity;
    for (const p of this.targets) {
      const d = Math.hypot(p.x - g.x, p.z - g.z);
      if (d < bd) { bd = d; best = p; }
    }
    return best;
  }

  // 巡回・徘徊中の霊が新たにプレイヤーに気づくか（視界は前方120°）
  detect(g, T) {
    const sight = M.blocksSightFn(this.sealOpen);
    let best = null, bd = Infinity;
    for (const p of this.targets) {
      const dx = p.x - g.x, dz = p.z - g.z, d = Math.hypot(dx, dz);
      if (d > 16) continue;
      const los = M.los(g.x, g.z, p.x, p.z, sight);
      const inCone = angDiff(yawTo(dx, dz), g.yaw) < 1.05;
      const seen = los && inCone && d < T.notice * SIGHT_MUL[p.stance];
      const heard = d < NOISE[p.stance] * (los ? 1 : 0.6);
      const touch = d < (p.stance === 'crouch' ? 0.9 : 1.8);
      if ((seen || heard || touch) && d < bd) { bd = d; best = p; }
    }
    return best;
  }

  // 追跡中：見失っていないか
  senses(g, p) {
    if (g.type === 'boss') return inRoom(p, M.BOSS_ROOM);
    const d = Math.hypot(p.x - g.x, p.z - g.z);
    if (d < 1.5) return true;
    const los = M.los(g.x, g.z, p.x, p.z, M.blocksSightFn(this.sealOpen));
    if (los && d < (p.stance === 'crouch' ? 6 : 16)) return true;
    return d < NOISE[p.stance] * (los ? 1 : 0.6);
  }

  stepToward(g, tx, tz, speed, dt, blocks) {
    const dx = tx - g.x, dz = tz - g.z;
    const d = Math.hypot(dx, dz);
    if (d < 1e-3) return;
    const s = Math.min(speed * dt, d);
    M.moveCircle(g, (dx / d) * s, (dz / d) * s, 0.3, blocks);
    g.yaw = turn(g.yaw, yawTo(dx, dz), dt * 5);
  }

  followPath(g, dt, speed, blocks) {
    if (!g.path || !g.path.length) return false;
    const [c, r] = g.path[0];
    const tx = M.center(c), tz = M.center(r);
    if (Math.hypot(tx - g.x, tz - g.z) < 0.35) {
      g.path.shift();
      return true;
    }
    this.stepToward(g, tx, tz, speed, dt, blocks);
    return true;
  }

  pathTo(g, x, z, blocks) {
    return M.bfs(M.cellOf(g.x), M.cellOf(g.z), M.cellOf(x), M.cellOf(z), blocks);
  }

  // 徘徊：縄張り（守っている御札の周り）の中をうろつく
  wanderPath(g, blocks) {
    const gc = M.cellOf(g.x), gr = M.cellOf(g.z);
    const hc = M.cellOf(g.homeX), hr = M.cellOf(g.homeZ);
    for (let i = 0; i < 12; i++) {
      let c, r;
      if (g.type === 'boss') {
        const R = M.BOSS_ROOM;
        c = R.c0 + Math.floor(Math.random() * (R.c1 - R.c0 + 1));
        r = R.r0 + Math.floor(Math.random() * (R.r1 - R.r0 + 1));
      } else {
        c = hc + Math.floor(Math.random() * 7) - 3;
        r = hr + Math.floor(Math.random() * 7) - 3;
      }
      const path = M.bfs(gc, gr, c, r, blocks);
      if (path && path.length) return path;
    }
    return null;
  }

  patrol(g, dt, T, blocks) {
    if (this.followPath(g, dt, T.walk, blocks)) return;
    const [c, r] = g.route[g.ri];
    if (M.cellOf(g.x) === c && M.cellOf(g.z) === r) g.ri = (g.ri + 1) % g.route.length;
    const [nc, nr] = g.route[g.ri];
    g.path = M.bfs(M.cellOf(g.x), M.cellOf(g.z), nc, nr, blocks);
    if (!g.path) g.ri = (g.ri + 1) % g.route.length;
  }

  updateGhost(g, dt) {
    const T = TYPES[g.type];
    const blocks = this.ghostBlocks(g);
    g.px = g.x;
    g.pz = g.z;
    g.t -= dt;
    g.cd -= dt;
    if (g.type === 'crawl' && !MAT.has(g.st) && g.st !== 'dead') {
      g.ceilT -= dt;
      if (g.ceilT <= 0) { g.ceil = !g.ceil; g.ceilT = 4 + Math.random() * 4; }
    }
    if (g.type === 'crawl') g.y += ((g.ceil ? 2.55 : 0.2) - g.y) * Math.min(1, dt * (g.st === 'windup' ? 6 : 3));

    switch (g.st) {
      case 'dormant':
        if (this.targets.some((p) => inRoom(p, M.BOSS_ROOM))) {
          this.setSt(g, 'roar', 2.4);
          this.emit({ e: 'bossAwake', gid: g.id });
        }
        break;
      case 'roar':
        if (g.t <= 0) {
          g.st = 'chase';
          const n = this.nearest(g);
          g.target = n?.role || null;
          if (n) { g.lkx = n.x; g.lkz = n.z; g.lost = 0; }
        }
        break;
      case 'wander': {
        if (g.route) this.patrol(g, dt, T, blocks);
        else if (!this.followPath(g, dt, T.walk, blocks)) g.path = this.wanderPath(g, blocks);
        const p = this.detect(g, T);
        if (p) {
          g.target = p.role;
          g.lkx = p.x; g.lkz = p.z; g.lost = 0; g.path = null;
          this.setSt(g, 'alert', 0.6);
          this.emit({ e: 'notice', role: p.role, gid: g.id });
        }
        break;
      }
      case 'alert': {
        const p = this.players[g.target];
        if (p) g.yaw = turn(g.yaw, yawTo(p.x - g.x, p.z - g.z), dt * 6);
        if (g.t <= 0) { g.st = 'chase'; g.repath = 0; }
        break;
      }
      case 'chase': {
        const p = this.players[g.target];
        if (!p || !p.present || p.down) { this.giveUp(g, null); break; }
        const dx = p.x - g.x, dz = p.z - g.z, d = Math.hypot(dx, dz);
        const sensed = this.senses(g, p);
        if (sensed) {
          g.lkx = p.x; g.lkz = p.z; g.lost = 0;
        } else {
          g.lost += dt * (p.stance === 'crouch' || p.stance === 'idle' ? 1.6 : 1);
          if (g.lost > 4) { this.giveUp(g, p.role); break; }
        }
        if (sensed && d < T.strike && g.cd <= 0) {
          g.kind = g.type === 'boss' && Math.random() < 0.4 ? 'slam' : 'swipe';
          if (g.type === 'crawl') { g.ceil = false; g.ceilT = 5; }
          this.setSt(g, 'windup', g.kind === 'slam' ? 1.5 : T.windup);
          break;
        }
        const tx = g.lkx, tz = g.lkz;
        const direct = Math.hypot(tx - g.x, tz - g.z) < 5 && M.los(g.x, g.z, tx, tz, blocks);
        if (direct) {
          if (!sensed || d > T.strike * 0.8) this.stepToward(g, tx, tz, T.run, dt, blocks);
          if (sensed) g.yaw = turn(g.yaw, yawTo(dx, dz), dt * 6);
          g.path = null;
        } else {
          g.repath -= dt;
          if (!g.path || g.repath <= 0) { g.path = this.pathTo(g, tx, tz, blocks); g.repath = 0.6; }
          if (!this.followPath(g, dt, T.run, blocks)) this.stepToward(g, tx, tz, T.run, dt, blocks);
        }
        break;
      }
      case 'windup': {
        // 前半は相手を追って向きを変え、後半は向きを固定（ここで避ける）
        const p = this.players[g.target];
        if (p && g.t > g.dur * 0.5) g.yaw = turn(g.yaw, yawTo(p.x - g.x, p.z - g.z), dt * 6);
        if (g.t <= 0) {
          if (g.kind === 'slam') {
            this.slam(g);
            this.setSt(g, 'recover', 1.4);
          } else {
            g.hitSet = new Set();
            this.setSt(g, 'lunge', 0.25);
            this.emit({ e: 'lunge', gid: g.id });
          }
        }
        break;
      }
      case 'lunge': {
        const s = T.lunge * dt;
        M.moveCircle(g, -Math.sin(g.yaw) * s, -Math.cos(g.yaw) * s, 0.3, blocks);
        this.lungeHits(g, T);
        if (g.t <= 0) this.setSt(g, 'recover', g.type === 'boss' ? 1.3 : 1.2);
        break;
      }
      case 'recover':
        if (g.t <= 0) { g.st = 'chase'; g.cd = 0.8; }
        break;
      case 'stun':
        if (g.t <= 0) {
          if (g.type === 'boss') { g.st = 'chase'; g.cd = 0.6; } else this.setSt(g, 'flee', 1.1);
        }
        break;
      case 'flee': {
        const p = this.players[g.target];
        if (p) {
          const dx = g.x - p.x, dz = g.z - p.z, d = Math.hypot(dx, dz) || 1;
          this.stepToward(g, g.x + dx / d, g.z + dz / d, T.run * 1.1, dt, blocks);
        }
        if (g.t <= 0) { g.st = 'chase'; g.cd = 0.5; g.lost = 0; }
        break;
      }
    }
    this.enforceBarriers(g);
    g.mat = MAT.has(g.st);
    if (g.mat) g.matEnd = this.time;
  }

  shielded(p) {
    return this.barriers.some((b) => Math.hypot(p.x - b.x, p.z - b.z) < BARRIER.r);
  }

  // 霊を結界の外へ押し戻し、初めて触れた霊は縛る
  enforceBarriers(g) {
    if (g.st === 'dead' || g.st === 'dormant') return;
    const lim = BARRIER.r + 0.35;
    for (const b of this.barriers) {
      const dx = g.x - b.x, dz = g.z - b.z, d = Math.hypot(dx, dz);
      if (d >= lim) continue;
      const k = d > 1e-3 ? lim / d : 1;
      const nx = b.x + (d > 1e-3 ? dx : 1) * k, nz = b.z + (d > 1e-3 ? dz : 0) * k;
      if (M.circleHits(nx, nz, 0.3, this.ghostBlocks(g))) {
        // 押し出し先が壁なら、この更新の前の位置へ戻す
        g.x = g.px ?? g.x;
        g.z = g.pz ?? g.z;
      } else {
        g.x = nx;
        g.z = nz;
      }
      if (b.bound.has(g.id) || g.st === 'roar') continue;
      b.bound.add(g.id);
      this.setSt(g, 'stun', g.type === 'boss' ? BARRIER.bindBoss : BARRIER.bind);
      g.reveal = this.time + (g.type === 'boss' ? BARRIER.bindBoss : BARRIER.bind);
      g.hitSet = null;
      this.emit({ e: 'bind', gid: g.id, x: r2(g.x), y: r2(g.y + 1), z: r2(g.z) });
    }
  }

  giveUp(g, role) {
    g.st = 'wander';
    g.path = null;
    g.target = null;
    if (role) this.emit({ e: 'lost', role, gid: g.id });
  }

  lungeHits(g, T) {
    const fx = -Math.sin(g.yaw), fz = -Math.cos(g.yaw);
    const hx = g.x + fx * 0.4, hz = g.z + fz * 0.4;
    for (const p of this.targets) {
      if (g.hitSet.has(p.role) || this.shielded(p)) continue;
      if (Math.hypot(p.x - hx, p.z - hz) > T.hitR) continue;
      g.hitSet.add(p.role);
      if (p.dodging) this.emit({ e: 'dodged', role: p.role });
      else this.hurt(p, g);
    }
  }

  slam(g) {
    for (const p of this.targets) {
      if (Math.hypot(p.x - g.x, p.z - g.z) > 3.6 || this.shielded(p)) continue;
      if (p.dodging) this.emit({ e: 'dodged', role: p.role });
      else this.hurt(p, g);
    }
    this.emit({ e: 'slam', x: r2(g.x), z: r2(g.z) });
  }

  hurt(p, g) {
    const T = TYPES[g.type];
    const mult = g.kind === 'slam' ? 1.3 : 1;
    p.lastHurt = this.time;
    if (p.role === 'exo') {
      let dmg = T.dmg * mult;
      const facing = angDiff(p.yaw, yawTo(g.x - p.x, g.z - p.z)) < 1.2;
      const guarded = p.guard && facing;
      if (guarded) dmg *= g.kind === 'slam' ? 0.6 : 0.3;
      p.hp = Math.max(0, p.hp - dmg);
      this.stats.dmg += dmg;
      this.emit({ e: 'hurt', role: 'exo', dmg: Math.round(dmg), guarded, gid: g.id });
      if (p.hp <= 0) this.down(p);
    } else {
      const add = T.seer * mult;
      p.gauge = Math.min(100, p.gauge + add);
      this.stats.dmg += add * 0.5;
      this.emit({ e: 'hurt', role: 'seer', dmg: Math.round(add), gid: g.id });
      if (p.gauge >= 100) this.down(p);
    }
  }

  down(p) {
    p.down = true;
    p.revive = 0;
    this.emit({ e: 'down', role: p.role });
  }

  exoAttack(m) {
    this.stats.swings++;
    this.emit({ e: 'swing' });
    let best = null, bd = Infinity;
    for (const g of this.ghosts) {
      if (g.st === 'dead' || g.st === 'dormant') continue;
      const dx = g.x - m.x, dz = g.z - m.z, d = Math.hypot(dx, dz);
      const boss = g.type === 'boss';
      if (d > (boss ? 3.0 : 2.3)) continue;
      if (angDiff(yawTo(dx, dz), m.yaw) > (boss ? 1.2 : 1.0)) continue;
      if (g.type === 'crawl' && (g.ceil ? m.pitch < 0.3 : m.pitch > -0.2)) continue;
      if (d < bd) { bd = d; best = g; }
    }
    if (!best) return;
    const g = best;
    const matOk = g.st !== 'roar' && (g.mat || this.time - g.matEnd < 0.15);
    if (!matOk) {
      this.emit({ e: 'phase', gid: g.id, x: r2(g.x), y: r2(g.y + 1), z: r2(g.z) });
      return;
    }
    // 攻撃者が霊のどちら側にいるか（0=正面、π=背後）
    const rel = angDiff(yawTo(m.x - g.x, m.z - g.z), g.yaw);
    let weak = false;
    if (g.type === 'wander') weak = rel > 2.0;
    else if (g.type === 'boss') {
      if (g.phase === 1) weak = rel < 1.1;
      else if (g.phase === 2) weak = rel > 2.0;
      else weak = m.pitch > 0.35;
    }
    const dmg = weak ? 2 : 1;
    g.hp -= dmg;
    this.stats.hits++;
    if (weak) this.stats.weakHits++;
    this.emit({ e: 'hit', gid: g.id, weak, x: r2(g.x), y: r2(g.y + (g.type === 'crawl' ? 0.3 : 1.1)), z: r2(g.z) });

    if (g.hp <= 0) {
      this.setSt(g, 'dead', 0.6);
      g.mat = false;
      this.stats.exorcised++;
      this.emit({ e: 'exorcise', gid: g.id, type: g.type, x: r2(g.x), y: r2(g.y + 1), z: r2(g.z) });
      if (g.type === 'boss') {
        this.bossDead = true;
        this.phase = 'escape';
        this.emit({ e: 'bossDead' });
      } else if (RESPAWN[g.role]) {
        this.respawns.push({ at: this.time + RESPAWN[g.role], type: g.type, role: g.role, routeKey: g.routeKey });
      }
      return;
    }
    if (g.type === 'boss') {
      const ph = g.hp <= 4 ? 3 : g.hp <= 8 ? 2 : 1;
      if (ph > g.phase) {
        g.phase = ph;
        this.setSt(g, 'roar', 2.0);
        const R = M.BOSS_ROOM;
        const corner = ph === 2 ? [R.c0, R.r1] : [R.c1, R.r0];
        const ng = this.makeGhost('wander', M.center(corner[0]), M.center(corner[1]), { role: 'add' });
        const n = this.nearest(ng);
        if (n) { ng.st = 'chase'; ng.target = n.role; ng.lkx = n.x; ng.lkz = n.z; }
        this.ghosts.push(ng);
        this.emit({ e: 'bossPhase', phase: ph });
      }
      return;
    }
    g.target = 'exo';
    const exo = this.players.exo;
    g.lkx = exo.x; g.lkz = exo.z; g.lost = 0;
    this.setSt(g, 'stun', 0.5);
  }

  exoSalt(m) {
    const p = this.players.exo;
    if (p.salt <= 0) return;
    p.salt--;
    this.emit({ e: 'salt', x: r2(m.x), z: r2(m.z), yaw: r2(m.yaw) });
    for (const g of this.ghosts) {
      if (g.st === 'dead' || g.st === 'dormant') continue;
      const dx = g.x - m.x, dz = g.z - m.z;
      if (Math.hypot(dx, dz) > 5.5 || angDiff(yawTo(dx, dz), m.yaw) > 1.25) continue;
      g.reveal = this.time + 5;
      if (g.st !== 'roar') {
        g.target = 'exo';
        g.lkx = p.x; g.lkz = p.z; g.lost = 0;
        this.setSt(g, 'stun', g.type === 'boss' ? 1.2 : 2.2);
      }
    }
  }

  // 祓った霊は、まだ取られていない御札の近くか巡回路の起点に戻ってくる
  updateRespawns() {
    for (let i = this.respawns.length - 1; i >= 0; i--) {
      const r = this.respawns[i];
      if (this.time < r.at) continue;
      const spot = this.findRespawnSpot(r);
      if (!spot) { r.at = this.time + 5; continue; }
      const g = this.makeGhost(r.type, spot.x, spot.z, { role: r.role, route: r.routeKey });
      this.ghosts.push(g);
      this.respawns.splice(i, 1);
      this.emit({ e: 'respawn', gid: g.id, x: r2(spot.x), z: r2(spot.z) });
    }
  }

  findRespawnSpot(r) {
    const far = (x, z) => this.targets.every((p) => Math.hypot(p.x - x, p.z - z) > 7);
    const blocks = M.blocksPlayerFn(this.sealOpen);
    if (r.role === 'patrol') {
      const route = M.ROUTES[r.routeKey];
      const pts = route.map(([c, rr]) => ({ x: M.center(c), z: M.center(rr) })).filter((p) => far(p.x, p.z));
      return pts[Math.floor(Math.random() * pts.length)] || null;
    }
    const tals = this.items.filter((i) => i.kind === 'talisman');
    const left = tals.filter((i) => !i.taken);
    const anchors = (left.length ? left : tals).slice().sort(() => Math.random() - 0.5);
    for (const a of anchors) {
      const cands = [];
      for (let dr = -2; dr <= 2; dr++) {
        for (let dc = -2; dc <= 2; dc++) {
          if (!dr && !dc) continue;
          const c = a.c + dc, rr = a.r + dr;
          if (blocks(c, rr) >= 0 || M.roomAtCell(c, rr) !== M.roomAtCell(a.c, a.r)) continue;
          const x = M.center(c), z = M.center(rr);
          if (far(x, z)) cands.push({ x, z });
        }
      }
      if (cands.length) return cands[Math.floor(Math.random() * cands.length)];
    }
    return null;
  }

  updateItems() {
    for (const it of this.items) {
      if (it.taken) continue;
      for (const p of this.targets) {
        if (it.kind === 'salt' && p.role !== 'exo') continue;
        if (Math.hypot(p.x - it.x, p.z - it.z) > 1.2) continue;
        it.taken = true;
        if (it.kind === 'salt') this.players.exo.salt++;
        const count = this.items.filter((i) => i.kind === 'talisman' && i.taken).length;
        this.emit({ e: 'item', id: it.id, kind: it.kind, by: p.role, count });
        if (it.kind === 'talisman' && count === 3) {
          this.sealOpen = true;
          this.phase = 'boss';
          this.emit({ e: 'seal' });
        }
        break;
      }
    }
  }

  updatePlayers(dt) {
    const { seer, exo } = this.players;
    for (const [p, o] of [[seer, exo], [exo, seer]]) {
      if (!p.present) continue;
      if (p.down) {
        if (o.present && !o.down && Math.hypot(p.x - o.x, p.z - o.z) < 1.8) {
          p.revive += dt / 3;
          if (p.revive >= 1) {
            p.down = false;
            p.revive = 0;
            if (p.role === 'exo') p.hp = 50; else p.gauge = 40;
            p.lastHurt = this.time;
            this.emit({ e: 'revive', role: p.role });
          }
        } else p.revive = Math.max(0, p.revive - dt * 0.5);
      } else if (this.time - p.lastHurt > 6) {
        if (p.role === 'exo') p.hp = Math.min(100, p.hp + 1.5 * dt);
        else p.gauge = Math.max(0, p.gauge - 3 * dt);
      }
    }
  }

  checkEnd() {
    const present = Object.values(this.players).filter((p) => p.present);
    if (present.every((p) => p.down)) return this.end(false, present.length > 1 ? '二人とも倒れてしまった…' : '倒れてしまった…');
    if (this.time >= TIME_LIMIT) return this.end(false, '夜が明けてしまった――屋敷に囚われた');
    if (this.bossDead && present.every((p) => !p.down && this.inExit(p))) this.end(true, '夜明け前に屋敷を脱出した');
  }

  inExit(p) {
    const c = M.cellOf(p.x), r = M.cellOf(p.z);
    return this.exits.some((e) => e.c === c && e.r === r);
  }

  end(win, reason) {
    this.over = true;
    this.emit({ e: 'over', win, reason, stats: { ...this.stats, time: Math.round(this.time) } });
  }

  snapshot() {
    const { seer, exo } = this.players;
    const st = (p) => STANCE_IDX.indexOf(p.stance);
    return {
      t: 'snap',
      time: r2(this.time),
      ph: this.phase,
      so: this.sealOpen ? 1 : 0,
      bd: this.bossDead ? 1 : 0,
      P: {
        seer: [r2(seer.x), r2(seer.z), r2(seer.yaw), r2(seer.pitch), seer.down ? 1 : 0, Math.round(seer.gauge), r2(seer.revive), seer.bars, 0, st(seer)],
        exo: [r2(exo.x), r2(exo.z), r2(exo.yaw), r2(exo.pitch), exo.down ? 1 : 0, Math.round(exo.hp), r2(exo.revive), exo.guard ? 1 : 0, exo.salt, st(exo)],
      },
      G: this.ghosts.map((g) => [
        g.id, TYPE_IDX.indexOf(g.type), r2(g.x), r2(g.y), r2(g.z), r2(g.yaw), ST_IDX.indexOf(g.st),
        g.hp, g.mat ? 1 : 0, r2(Math.max(0, g.reveal - this.time)), g.ceil ? 1 : 0, g.phase,
        g.kind === 'slam' ? 1 : 0, r2(g.st === 'windup' ? 1 - g.t / g.dur : 0),
        Math.max(0, ROLE_IDX.indexOf(g.target)),
      ]),
      it: this.items.filter((i) => i.taken).map((i) => i.id),
      B: this.barriers.map((b) => [b.id, b.x, b.z, r2(b.until - this.time)]),
    };
  }
}
