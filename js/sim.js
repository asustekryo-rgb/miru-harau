// ホスト権威のゲームシミュレーション（霊AI・ダメージ・アイテム・進行）
import * as M from './map.js';

export const TYPE_IDX = ['wander', 'crawl', 'boss'];
export const ST_IDX = ['dormant', 'roar', 'wander', 'chase', 'windup', 'recover', 'stun', 'flee', 'dead'];
export const TIME_LIMIT = 15 * 60;
const MAT = new Set(['windup', 'recover', 'stun']);

const TYPES = {
  wander: { hp: 3, walk: 1.2, run: 2.2, dmg: 20, seer: 34, reach: 2.0, notice: 8, strike: 1.6 },
  crawl: { hp: 3, walk: 1.6, run: 2.7, dmg: 16, seer: 30, reach: 2.0, notice: 9, strike: 1.6 },
  boss: { hp: 12, walk: 1.0, run: 2.0, dmg: 28, seer: 40, reach: 2.8, notice: 14, strike: 2.3 },
};

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
    this.players = {
      seer: { role: 'seer', x: sx - 0.7, z: sz + 0.3, yaw: 0, pitch: 0, guard: false, down: false, gauge: 0, revive: 0, lastHurt: -99, present: !solo || opts.soloRole === 'seer' },
      exo: { role: 'exo', x: sx + 0.7, z: sz + 0.3, yaw: 0, pitch: 0, guard: false, down: false, hp: 100, salt: 2, revive: 0, lastHurt: -99, present: !solo || opts.soloRole === 'exo' },
    };
    this.ghosts = E.ghosts.map((g) => this.makeGhost(g.id, g.type, g.x, g.z));
    this.nextId = this.ghosts.length;
    this.stats = { swings: 0, hits: 0, weakHits: 0, exorcised: 0, dmg: 0 };
    this.markId = 0;
  }

  makeGhost(id, type, x, z) {
    return {
      id, type, x, z, y: type === 'crawl' ? 0.2 : 0, yaw: Math.random() * TAU,
      hp: TYPES[type].hp, st: type === 'boss' ? 'dormant' : 'wander', t: 0, dur: 1, cd: 0,
      path: null, repath: 0, target: null, reveal: 0, matEnd: -99, mat: false,
      ceil: false, ceilT: 3 + Math.random() * 4, phase: 1, kind: 'swipe',
    };
  }

  get targets() {
    return Object.values(this.players).filter((p) => p.present && !p.down);
  }

  setPlayer(role, s) {
    const p = this.players[role];
    p.x = s.x; p.z = s.z; p.yaw = s.yaw; p.pitch = s.pitch; p.guard = !!s.guard;
  }

  input(role, m) {
    if (this.over) return;
    const p = this.players[role];
    if (!p || p.down) return;
    if (m.t === 'atk' && role === 'exo') this.exoAttack(m);
    else if (m.t === 'salt' && role === 'exo') this.exoSalt(m);
    else if (m.t === 'mark' && role === 'seer') {
      this.emit({ e: 'marker', id: ++this.markId, gid: m.gid || null, x: r2(m.x), z: r2(m.z), dur: m.gid ? 6 : 8 });
    } else if (m.t === 'ping') this.emit({ e: 'ping', k: m.k, from: role });
  }

  update(dt) {
    if (this.over) return;
    this.time += dt;
    for (const g of this.ghosts) this.updateGhost(g, dt);
    this.ghosts = this.ghosts.filter((g) => !(g.st === 'dead' && g.t <= 0));
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

  detect(g, T) {
    const sight = M.blocksSightFn(this.sealOpen);
    let best = null, bd = Infinity;
    for (const p of this.targets) {
      const d = Math.hypot(p.x - g.x, p.z - g.z);
      if (d < 3.2 || (d < T.notice && M.los(g.x, g.z, p.x, p.z, sight))) {
        if (d < bd) { bd = d; best = p; }
      }
    }
    return best;
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

  wanderPath(g, blocks) {
    const gc = M.cellOf(g.x), gr = M.cellOf(g.z);
    for (let i = 0; i < 12; i++) {
      let c, r;
      if (g.type === 'boss') {
        const R = M.BOSS_ROOM;
        c = R.c0 + Math.floor(Math.random() * (R.c1 - R.c0 + 1));
        r = R.r0 + Math.floor(Math.random() * (R.r1 - R.r0 + 1));
      } else {
        c = gc + Math.floor(Math.random() * 11) - 5;
        r = gr + Math.floor(Math.random() * 9) - 4;
      }
      const path = M.bfs(gc, gr, c, r, blocks);
      if (path && path.length) return path;
    }
    return null;
  }

  updateGhost(g, dt) {
    const T = TYPES[g.type];
    const blocks = this.ghostBlocks(g);
    g.t -= dt;
    g.cd -= dt;
    if (g.type === 'crawl' && !MAT.has(g.st) && g.st !== 'dead') {
      g.ceilT -= dt;
      if (g.ceilT <= 0) { g.ceil = !g.ceil; g.ceilT = 4 + Math.random() * 4; }
    }
    if (g.type === 'crawl') g.y += ((g.ceil ? 2.55 : 0.2) - g.y) * Math.min(1, dt * 3);

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
          g.target = this.nearest(g)?.role || null;
        }
        break;
      case 'wander': {
        if (!this.followPath(g, dt, T.walk, blocks)) g.path = this.wanderPath(g, blocks);
        const p = this.detect(g, T);
        if (p) { g.st = 'chase'; g.target = p.role; g.path = null; g.repath = 0; }
        break;
      }
      case 'chase': {
        let p = this.players[g.target];
        if (!p || !p.present || p.down) {
          p = this.nearest(g);
          if (!p) { g.st = 'wander'; g.path = null; break; }
          g.target = p.role;
        }
        let dx = p.x - g.x, dz = p.z - g.z, d = Math.hypot(dx, dz);
        const n = this.nearest(g);
        if (n && n !== p && Math.hypot(n.x - g.x, n.z - g.z) < d - 2) {
          p = n; g.target = n.role;
          dx = p.x - g.x; dz = p.z - g.z; d = Math.hypot(dx, dz);
        }
        if (g.type !== 'boss' && d > 16) { g.st = 'wander'; g.path = null; break; }
        if (d < T.strike && g.cd <= 0) {
          g.kind = g.type === 'boss' && Math.random() < 0.4 ? 'slam' : 'swipe';
          this.setSt(g, 'windup', g.kind === 'slam' ? 1.5 : g.type === 'boss' ? 1.0 : 0.9);
          break;
        }
        const direct = d < 5 && M.los(g.x, g.z, p.x, p.z, blocks);
        if (direct) {
          if (d > T.strike * 0.8) this.stepToward(g, p.x, p.z, T.run, dt, blocks);
          g.yaw = turn(g.yaw, yawTo(dx, dz), dt * 6);
          g.path = null;
        } else {
          g.repath -= dt;
          if (!g.path || g.repath <= 0) {
            g.path = M.bfs(M.cellOf(g.x), M.cellOf(g.z), M.cellOf(p.x), M.cellOf(p.z), blocks);
            g.repath = 0.6;
          }
          if (!this.followPath(g, dt, T.run, blocks)) this.stepToward(g, p.x, p.z, T.run, dt, blocks);
        }
        break;
      }
      case 'windup': {
        const p = this.players[g.target];
        if (p && g.t > g.dur * 0.3) g.yaw = turn(g.yaw, yawTo(p.x - g.x, p.z - g.z), dt * 5);
        if (g.t <= 0) {
          this.strike(g);
          this.setSt(g, 'recover', g.type === 'boss' ? 1.3 : 1.2);
        }
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
        if (g.t <= 0) { g.st = 'chase'; g.cd = 0.5; }
        break;
      }
    }
    g.mat = MAT.has(g.st);
    if (g.mat) g.matEnd = this.time;
  }

  strike(g) {
    for (const p of this.targets) {
      const dx = p.x - g.x, dz = p.z - g.z, d = Math.hypot(dx, dz);
      const hit = g.kind === 'slam'
        ? d < 3.6
        : d < TYPES[g.type].reach && angDiff(yawTo(dx, dz), g.yaw) < 1.1;
      if (hit) this.hurt(p, g);
    }
    if (g.kind === 'slam') this.emit({ e: 'slam', x: r2(g.x), z: r2(g.z) });
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
      this.emit({ e: 'hurt', role: 'exo', dmg: Math.round(dmg), guarded });
      if (p.hp <= 0) this.down(p);
    } else {
      const add = T.seer * mult;
      p.gauge = Math.min(100, p.gauge + add);
      this.stats.dmg += add * 0.5;
      this.emit({ e: 'hurt', role: 'seer', dmg: Math.round(add) });
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
        const ng = this.makeGhost('g' + this.nextId++, 'wander', M.center(corner[0]), M.center(corner[1]));
        ng.st = 'chase';
        ng.target = this.nearest(ng)?.role || null;
        this.ghosts.push(ng);
        this.emit({ e: 'bossPhase', phase: ph });
      }
      return;
    }
    g.target = 'exo';
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
        this.setSt(g, 'stun', g.type === 'boss' ? 1.2 : 2.2);
      }
    }
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
    return {
      t: 'snap',
      time: r2(this.time),
      ph: this.phase,
      so: this.sealOpen ? 1 : 0,
      bd: this.bossDead ? 1 : 0,
      P: {
        seer: [r2(seer.x), r2(seer.z), r2(seer.yaw), r2(seer.pitch), seer.down ? 1 : 0, Math.round(seer.gauge), r2(seer.revive), 0, 0],
        exo: [r2(exo.x), r2(exo.z), r2(exo.yaw), r2(exo.pitch), exo.down ? 1 : 0, Math.round(exo.hp), r2(exo.revive), exo.guard ? 1 : 0, exo.salt],
      },
      G: this.ghosts.map((g) => [
        g.id, TYPE_IDX.indexOf(g.type), r2(g.x), r2(g.y), r2(g.z), r2(g.yaw), ST_IDX.indexOf(g.st),
        g.hp, g.mat ? 1 : 0, r2(Math.max(0, g.reveal - this.time)), g.ceil ? 1 : 0, g.phase,
        g.kind === 'slam' ? 1 : 0, r2(g.st === 'windup' ? 1 - g.t / g.dur : 0),
      ]),
      it: this.items.filter((i) => i.taken).map((i) => i.id),
    };
  }
}
