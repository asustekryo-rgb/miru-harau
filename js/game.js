// 1プレイ分のゲーム：描画・入力・同期・HUD
import * as THREE from 'three';
import * as M from './map.js';
import { buildWorld } from './world.js';
import { makeGhost, makeAvatar, makeSword, makeMarker, Fx, Decals } from './entities.js';
import { drawScare, bloodScreenURL } from './textures.js';
import { createPost } from './post.js';
import { Sim, TYPE_IDX, ST_IDX, STANCE_IDX, ROLE_IDX, TIME_LIMIT, wrap } from './sim.js';

const $ = (id) => document.getElementById(id);
const EYE = 1.55;
const EYE_CROUCH = 0.95;
const NOISE_LV = { idle: 0, crouch: 0, walk: 1, run: 3 };
const HUNTING = new Set(['alert', 'chase', 'windup', 'lunge']);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const r2 = (v) => Math.round(v * 100) / 100;
const vib = (p) => { try { navigator.vibrate?.(p); } catch { /* 非対応 */ } };
const lerpAngle = (a, b, t) => a + wrap(b - a) * t;

export const ROLE_NAME = { seer: '指示役', exo: '除霊役' };
const PING_TXT = { now: '今！', danger: '危険！', wait: '待て' };
const WEAK_POS = {
  wander: [0, 1.0, 0.3],
  boss1: [0, 1.0, -0.4],
  boss2: [0, 1.0, 0.4],
  boss3: [0, 1.72, 0],
};

export class Game {
  // opts: renderer, role, isHost, solo, sfx, input, send(msg, fast), onOver(ev)
  constructor(opts) {
    Object.assign(this, opts);
    M.setStage(this.stage || 0);
    this.partnerRole = this.role === 'seer' ? 'exo' : 'seer';
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.05, 60);
    this.camera.rotation.order = 'YXZ';
    this.scene.add(this.camera);
    this.world = buildWorld(this.scene, this.role);

    const E = M.parseEntities();
    const sx = M.center(E.spawn.c), sz = M.center(E.spawn.r);
    const start = { seer: [sx - 0.7, sz + 0.3], exo: [sx + 0.7, sz + 0.3] };
    const [mx, mz] = start[this.role];
    this.me = {
      x: mx, z: mz, yaw: 0, pitch: 0, down: false, hp: 100, gauge: 0, revive: 0, salt: 2, guard: false, stamina: 1,
      crouch: false, stance: 'idle', dodgeT: -1, dodgeCd: 0, dodgeX: 0, dodgeZ: 0,
    };
    this.eye = EYE;
    const [px, pz] = start[this.partnerRole];
    this.partner = { x: px, z: pz, tx: px, tz: pz, yaw: 0, tyaw: 0, down: false, stat: 0, revive: 0, guard: false, swingT: 9, stance: 'idle' };
    this.pAvatar = makeAvatar(this.partnerRole);
    this.pAvatar.root.visible = !this.solo;
    this.scene.add(this.pAvatar.root);
    this.pAvatar.root.traverse((o) => { if (o.isMesh && o !== this.pAvatar.silhouette) o.castShadow = true; });

    // 両役とも懐中電灯（指示役は少し青白い）
    this.flash = new THREE.SpotLight(this.role === 'seer' ? 0xdfe6ff : 0xfff1d6, 40, 22, 0.5, 0.55, 1.6);
    this.flash.position.set(0.15, -0.1, 0);
    this.flash.target.position.set(0, 0, -1);
    this.flash.shadow.mapSize.set(1024, 1024);
    this.flash.shadow.bias = -0.0006;
    this.flash.shadow.normalBias = 0.02;
    this.flash.shadow.camera.near = 0.2;
    this.flash.shadow.camera.far = 20;
    this.setQuality(this.quality || 'high', false);
    this.camera.add(this.flash, this.flash.target);
    if (this.role === 'exo') {
      this.sword = makeSword();
      this.sword.root.position.set(0.3, -0.3, -0.42);
      this.sword.root.scale.setScalar(0.7);
      this.camera.add(this.sword.root);
      this.noiseCv = $('noise');
      this.noiseG = this.noiseCv.getContext('2d');
    }

    this.ghosts = new Map();
    this.markers = [];
    this.fx = new Fx(this.scene);
    this.decals = new Decals(this.scene);
    this.time = 0;
    this.sendAcc = 0;
    this.hudT = 0;
    this.snap = null;
    this.charges = 3;
    this.chargeT = 0;
    this.pingCd = 0;
    this.swingT = 9;
    this.swingCd = 0;
    this.stepAcc = 0;
    this.bob = 0;
    this.presence = 0;
    this.vibT = 0;
    this.shake = 0;
    this.lastRoom = null;
    this.over = false;
    this.sealOpen = false;
    this.raycaster = new THREE.Raycaster();
    this.tmpV = new THREE.Vector3();

    if (this.isHost) this.sim = new Sim((ev) => this.emit(ev), { solo: this.solo, soloRole: this.role });

    document.body.dataset.role = this.role;
    $('bar-partner').hidden = this.solo;
    $('msg').className = '';
    $('ping').className = '';
    $('hurt').style.opacity = 0;
    $('noise').style.opacity = 0;
    const title = $('stage-title');
    title.innerHTML = `<small>${M.STAGE.night}</small>${M.STAGE.name}`;
    title.className = '';
    void title.offsetWidth;
    title.className = 'show';
    setTimeout(() => {
      if (!this.over) {
        this.toast(this.role === 'seer'
          ? 'あなたは指示役。霊が見える。相棒に声で伝えよう'
          : 'あなたは除霊役。霊は見えない。相棒の声を頼りに祓え', 4);
      }
    }, 2500);
  }

  // ---------- 通信 ----------
  emit(ev) {
    this.onEvent(ev);
    if (!this.solo) this.send({ t: 'ev', ev });
  }

  act(m) {
    if (this.isHost) this.sim.input(this.role, m);
    else this.send(m);
  }

  onNet(msg) {
    if (this.isHost) {
      if (msg.t === 'ps') this.sim.setPlayer(this.partnerRole, msg);
      else if (msg.t === 'atk' || msg.t === 'salt' || msg.t === 'mark' || msg.t === 'ping') this.sim.input(this.partnerRole, msg);
    } else if (msg.t === 'snap') this.applySnap(msg);
    else if (msg.t === 'ev') this.onEvent(msg.ev);
  }

  applySnap(s) {
    this.snap = s;
    const mine = s.P[this.role], other = s.P[this.partnerRole];
    this.me.down = !!mine[4];
    this.me.revive = mine[6];
    if (this.role === 'exo') {
      this.me.hp = mine[5];
      this.me.salt = mine[8];
    } else this.me.gauge = mine[5];
    const p = this.partner;
    p.tx = other[0]; p.tz = other[1]; p.tyaw = other[2];
    p.down = !!other[4]; p.stat = other[5]; p.revive = other[6]; p.guard = !!other[7];
    p.stance = STANCE_IDX[other[9]] || 'idle';
    this.sealOpen = !!s.so;
    if (this.sealOpen) this.world.openSeal();
    if (s.bd && !this.world.exitActive) this.world.setExitActive();
    for (const id of s.it) this.world.removeItem(id);
    this.syncGhosts(s.G);
  }

  syncGhosts(G) {
    const seen = new Set();
    for (const a of G) {
      const [id, ti, x, y, z, yaw, si, hp, mat, rev, ceil, phase, slam, wp, tg] = a;
      seen.add(id);
      let v = this.ghosts.get(id);
      if (!v) {
        const type = TYPE_IDX[ti];
        v = {
          id, type, x, y, z, yaw, st: null, seed: Math.random() * 10, dying: 0, flashT: 0, twitch: 0,
          dx: x, dz: z, view: makeGhost(type), voice: this.sfx.voice(),
        };
        this.scene.add(v.view.root);
        this.ghosts.set(id, v);
      }
      const prev = v.st;
      Object.assign(v, { tx: x, ty: y, tz: z, tyaw: yaw, st: ST_IDX[si], hp, mat: !!mat, rev, ceil: !!ceil, phase, slam: !!slam, wp, target: ROLE_IDX[tg] });
      if (prev !== v.st) this.onGhostState(v);
    }
    for (const [id, v] of this.ghosts) if (!seen.has(id) && !(v.dying > 0)) this.removeGhost(id);
  }

  onGhostState(v) {
    const pos = { x: v.tx, y: v.ty + 1.3, z: v.tz };
    if (v.st === 'windup') {
      this.sfx.play('screech', pos);
      if (v.target === this.role && Math.hypot(v.tx - this.me.x, v.tz - this.me.z) < 9) vib([60, 40, 60]);
    } else if (v.st === 'roar') this.sfx.play('roar', pos);
    else if (v.st === 'dead' && !(v.dying > 0)) v.dying = 1.4;
  }

  removeGhost(id) {
    const v = this.ghosts.get(id);
    if (!v) return;
    this.scene.remove(v.view.root);
    v.view.root.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } });
    v.voice?.stop();
    this.ghosts.delete(id);
  }

  onEvent(ev) {
    const mine = ev.role === this.role;
    switch (ev.e) {
      case 'hit':
        this.fx.burst(ev.x, ev.y, ev.z, ev.weak ? 0xff4040 : 0xffffff, ev.weak ? 30 : 16, 3.5, 0.6);
        this.fx.burst(ev.x, ev.y, ev.z, 0x5a0000, ev.weak ? 60 : 35, 3, 0.9, 0.07, -9, null, false);
        this.decals.add(ev.x + (Math.random() - 0.5), ev.z + (Math.random() - 0.5), ev.weak ? 1.0 : 0.7);
        this.sfx.play('hit', ev);
        this.sfx.play('gore', ev);
        if (this.role === 'exo') vib(40);
        this.toast(ev.weak ? '急所に入った！' : '手応えあり', 1);
        break;
      case 'phase':
        this.sfx.play('whoosh', ev);
        this.toast(this.role === 'exo' ? 'すり抜けた…' : 'まだ実体化していない', 1);
        break;
      case 'exorcise': {
        const v = this.ghosts.get(ev.gid);
        if (v && !(v.dying > 0)) v.dying = 1.4;
        this.fx.burst(ev.x, ev.y, ev.z, 0xffe8a0, 80, 4, 1.4, 0.12, 0.5);
        this.fx.burst(ev.x, ev.y, ev.z, 0x4a0000, 90, 4.5, 1.1, 0.09, -9, null, false);
        this.decals.add(ev.x, ev.z, ev.type === 'boss' ? 3 : 1.6, 60);
        this.sfx.play('exorcise', ev);
        this.sfx.play('gore', ev);
        this.toast(ev.type === 'boss' ? '主を祓った！' : '除霊した', 2);
        break;
      }
      case 'hurt': {
        // 襲われた瞬間だけ、除霊役にも霊の姿が一瞬見える
        const v = this.ghosts.get(ev.gid);
        if (v) v.flashT = 0.45;
        const who = mine ? this.me : this.partner;
        this.decals.add(who.x + (Math.random() - 0.5) * 0.6, who.z + (Math.random() - 0.5) * 0.6, 0.5);
        if (mine) {
          this.sfx.play('hurt');
          const el = $('hurt');
          el.style.opacity = ev.guarded ? 0.3 : 0.8;
          setTimeout(() => { el.style.opacity = 0; }, 120);
          vib(ev.guarded ? 40 : [120, 40, 80]);
          this.shake = ev.guarded ? 0.1 : 0.3;
          if (ev.guarded) this.toast('受け止めた', 1);
          this.bloodScreen(ev.guarded ? 0.35 : 1);
          this.hurtFx = ev.guarded ? 0.4 : 1;
          if (!ev.guarded) this.showScare();
        } else this.toast('相棒が襲われている！', 1.2);
        break;
      }
      case 'notice':
        if (mine) {
          this.toast('見つかった！', 1.4);
          this.sfx.play('notice');
          vib([40, 30, 40]);
        }
        break;
      case 'lost':
        if (mine) this.toast('振り切った…', 1.4);
        break;
      case 'dodged':
        if (mine) this.toast('回避！', 0.8);
        break;
      case 'lunge': {
        const v = this.ghosts.get(ev.gid);
        if (v) this.sfx.play('lunge', { x: v.x, y: v.y + 1.2, z: v.z });
        break;
      }
      case 'respawn':
        this.sfx.play('wail', { x: ev.x, y: 1.5, z: ev.z });
        this.decals.add(ev.x, ev.z, 1.2, 40);
        this.toast(this.role === 'seer' ? '霊が湧いた…' : '…どこかで何かが蘇った', 2);
        break;
      case 'down':
        this.toast(mine ? '倒れた…' : '相棒が倒れた！近くに行って起こせ', 2.5);
        this.sfx.play('lose');
        break;
      case 'revive':
        this.sfx.play('revive');
        this.toast(mine ? '立ち上がった' : '相棒が立ち上がった', 1.5);
        break;
      case 'item':
        this.world.removeItem(ev.id);
        this.sfx.play('pickup');
        this.toast(ev.kind === 'talisman' ? `御札を手に入れた（${ev.count}/3）` : '清め塩を拾った', 2);
        break;
      case 'seal':
        this.world.openSeal();
        this.sealOpen = true;
        this.sfx.play('seal');
        this.toast('奥の間の封印が解けた…', 3);
        break;
      case 'bossAwake':
        this.toast('何かが目を覚ました', 2.5);
        break;
      case 'bossPhase':
        this.toast(this.role === 'seer' ? '主の弱点が移った！' : '空気が変わった…', 2.5);
        break;
      case 'bossDead':
        this.world.setExitActive();
        setTimeout(() => this.toast('玄関から二人で脱出せよ', 3), 2000);
        break;
      case 'marker': {
        const view = makeMarker();
        this.scene.add(view.root);
        this.markers.push({ ...ev, until: this.time + ev.dur, view });
        this.sfx.play('ping', { x: ev.x, y: 1, z: ev.z });
        if (this.role === 'exo') vib(30);
        break;
      }
      case 'ping':
        this.showPing(ev);
        break;
      case 'salt':
        this.fx.burst(ev.x, 1.3, ev.z, 0xffffff, 60, 6, 0.7, 0.06, -6, { yaw: ev.yaw });
        this.sfx.play('salt');
        break;
      case 'swing':
        if (this.role === 'seer') this.partner.swingT = 0;
        break;
      case 'slam':
        this.fx.ring(ev.x, ev.z, 0xff4030, 3.6);
        this.sfx.play('slam', { x: ev.x, y: 0.5, z: ev.z });
        break;
      case 'over':
        if (this.over) break;
        this.over = true;
        this.sfx.play(ev.win ? 'win' : 'lose');
        this.toast(ev.win ? '脱出成功' : '失敗…', 2);
        setTimeout(() => this.onOver(ev), 1800);
        break;
    }
  }

  showPing(ev) {
    if (ev.from === this.role && !this.solo) {
      this.toast(`合図：${PING_TXT[ev.k]}`, 0.8);
      return;
    }
    const el = $('ping');
    el.textContent = PING_TXT[ev.k];
    el.className = '';
    void el.offsetWidth;
    el.className = 'show ' + ev.k;
    vib(ev.k === 'now' ? [90, 30, 90] : ev.k === 'danger' ? [200, 80, 200] : 60);
    this.sfx.play(ev.k);
  }

  // 襲われた瞬間、画面いっぱいに霊の顔
  showScare() {
    const cv = $('scare');
    drawScare(cv);
    cv.className = '';
    void cv.offsetWidth;
    cv.className = 'show';
    this.sfx.play('scream');
  }

  bloodScreen(k) {
    const bs = $('bloodscreen');
    if (!bs.style.backgroundImage) bs.style.backgroundImage = `url(${bloodScreenURL()})`;
    bs.style.transition = 'none';
    bs.style.opacity = k;
    void bs.offsetWidth;
    bs.style.transition = 'opacity 3s ease-in 0.8s';
    bs.style.opacity = 0;
  }

  toast(text, sec = 1.8) {
    const el = $('msg');
    el.textContent = text;
    el.className = 'show';
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => { el.className = ''; }, sec * 1000);
  }

  // ---------- 毎フレーム ----------
  update(dt) {
    this.time += dt;
    const inp = this.input, me = this.me;
    const lk = inp.consumeLook();
    const sens = this.camera.fov < 50 ? 0.0022 : 0.005;
    me.yaw -= lk.dx * sens;
    me.pitch = clamp(me.pitch - lk.dy * sens, -1.25, 1.25);
    const kl = inp.keyLook();
    me.yaw -= kl.x * dt * 2.2;
    me.pitch = clamp(me.pitch + kl.y * dt * 1.6, -1.25, 1.25);

    me.dodgeT -= dt;
    me.dodgeCd -= dt;
    if (!me.down && !this.over) {
      const mv = inp.moveVec();
      const moving = mv.x !== 0 || mv.y !== 0;
      const fx = -Math.sin(me.yaw), fz = -Math.cos(me.yaw), rx = Math.cos(me.yaw), rz = -Math.sin(me.yaw);
      const blocks = M.blocksPlayerFn(this.sealOpen);
      if (inp.pressed('crouch')) me.crouch = !me.crouch;
      const dash = inp.held('dash') && me.stamina > 0.05 && moving;
      if (dash) me.crouch = false;
      me.guard = this.role === 'exo' && inp.held('guard');

      // 回避：入力方向（なければ後ろ）へ素早く跳ぶ。跳んでいる間は無敵
      if (inp.pressed('dodge') && me.dodgeCd <= 0 && me.stamina >= 0.25) {
        let dx = fx * mv.y + rx * mv.x, dz = fz * mv.y + rz * mv.x;
        if (!moving) { dx = -fx; dz = -fz; }
        const l = Math.hypot(dx, dz) || 1;
        me.dodgeX = dx / l; me.dodgeZ = dz / l;
        me.dodgeT = 0.3;
        me.dodgeCd = 0.9;
        me.stamina -= 0.25;
        me.crouch = false;
        this.sfx.play('dodge');
      }

      const bx = me.x, bz = me.z;
      if (me.dodgeT > 0) {
        M.moveCircle(me, me.dodgeX * 7.5 * dt, me.dodgeZ * 7.5 * dt, 0.3, blocks);
      } else {
        let speed = this.role === 'exo' ? 3.0 : 2.8;
        if (me.crouch) speed = 1.4;
        if (dash) speed = this.role === 'exo' ? 5.0 : 4.8;
        if (me.guard) speed *= 0.45;
        M.moveCircle(me, (fx * mv.y + rx * mv.x) * speed * dt, (fz * mv.y + rz * mv.x) * speed * dt, 0.3, blocks);
      }
      me.stamina = clamp(me.stamina + (dash ? -0.28 : 0.15) * dt, 0, 1);
      const moved = Math.hypot(me.x - bx, me.z - bz);
      me.stance = me.crouch ? 'crouch' : dash ? 'run' : moving || me.dodgeT > 0 ? 'walk' : 'idle';
      this.stepAcc += moved;
      this.bob += moved * (me.crouch ? 3 : 4.5);
      if (this.stepAcc > (dash ? 0.95 : 0.75)) {
        this.stepAcc = 0;
        if (!me.crouch) this.sfx.play('step');
      }
      this.actions(dt);
    } else {
      me.guard = false;
      me.stance = 'idle';
    }
    const ps = {
      x: r2(me.x), z: r2(me.z), yaw: r2(me.yaw), pitch: r2(me.pitch), guard: me.guard ? 1 : 0,
      st: me.stance, dg: me.dodgeT > -0.05 ? 1 : 0,
    };

    this.sendAcc += dt;
    if (this.isHost) {
      this.sim.setPlayer(this.role, ps);
      this.sim.update(dt);
      const snap = this.sim.snapshot();
      this.applySnap(snap);
      if (!this.solo && this.sendAcc >= 0.05) {
        this.sendAcc = 0;
        this.send(snap, true);
      }
    } else if (this.sendAcc >= 0.05) {
      this.sendAcc = 0;
      this.send({ t: 'ps', ...ps }, true);
    }

    this.updateVisuals(dt);
    this.updateHud(dt);
    this.hurtFx = Math.max(0, (this.hurtFx || 0) - dt * 2.5);
    if (this.post) this.post.render(dt, this.role === 'exo' ? this.presence : this.presence * 0.5, this.hurtFx);
    else this.renderer.render(this.scene, this.camera);
    this.checkPerf(dt);
    inp.endFrame();
  }

  actions(dt) {
    const inp = this.input, me = this.me;
    this.swingCd -= dt;
    this.pingCd -= dt;
    if (this.role === 'exo') {
      if (inp.pressed('attack') && this.swingCd <= 0 && !me.guard) {
        this.swingCd = 0.55;
        this.swingT = 0;
        this.sfx.play('swing');
        this.act({ t: 'atk', x: r2(me.x), z: r2(me.z), yaw: r2(me.yaw), pitch: r2(me.pitch) });
      }
      if (inp.pressed('salt')) {
        if (me.salt > 0) this.act({ t: 'salt', x: r2(me.x), z: r2(me.z), yaw: r2(me.yaw) });
        else this.toast('清め塩がない', 1);
      }
    } else {
      if (this.charges < 3) {
        this.chargeT += dt;
        if (this.chargeT >= 8) { this.charges++; this.chargeT = 0; }
      }
      if (inp.pressed('mark')) {
        if (this.charges > 0) {
          this.charges--;
          this.act({ t: 'mark', ...this.pickTarget() });
        } else this.toast('印の力が戻るまで待て', 1);
      }
      for (const k of ['now', 'danger', 'wait']) {
        if (inp.pressed(k) && this.pingCd <= 0) {
          this.pingCd = 0.5;
          this.act({ t: 'ping', k });
        }
      }
    }
  }

  // 指示役：画面中央の先にある霊か地点
  pickTarget() {
    this.raycaster.setFromCamera({ x: 0, y: 0 }, this.camera);
    this.raycaster.far = 30;
    const meshes = [];
    for (const v of this.ghosts.values()) {
      if (v.dying > 0) continue;
      for (const m of v.view.meshes) { m.userData.gid = v.id; meshes.push(m); }
    }
    const worldHit = this.raycaster.intersectObjects(this.world.raycast, false)[0];
    const gh = this.raycaster.intersectObjects(meshes, false)[0];
    if (gh && (!worldHit || gh.distance < worldHit.distance + 0.5)) {
      const v = this.ghosts.get(gh.object.userData.gid);
      return { gid: v.id, x: v.x, z: v.z };
    }
    if (worldHit) {
      const p = worldHit.point;
      const d = this.raycaster.ray.direction;
      return { x: p.x - d.x * 0.3, z: p.z - d.z * 0.3 };
    }
    return { x: this.me.x - Math.sin(this.me.yaw) * 5, z: this.me.z - Math.cos(this.me.yaw) * 5 };
  }

  updateVisuals(dt) {
    const me = this.me, cam = this.camera;
    this.shake = Math.max(0, this.shake - dt);
    const sh = this.shake * 0.15;
    const bobY = me.down ? 0 : Math.sin(this.bob) * 0.035;
    this.eye += ((me.crouch ? EYE_CROUCH : EYE) - this.eye) * Math.min(1, dt * 10);
    // 回避中は跳んだ方向へ少し傾く
    const side = me.dodgeT > 0 ? (me.dodgeX * Math.cos(me.yaw) - me.dodgeZ * Math.sin(me.yaw)) * -0.18 : 0;
    this.roll = (this.roll || 0) + (side - (this.roll || 0)) * Math.min(1, dt * 14);
    cam.position.set(me.x + (Math.random() - 0.5) * sh, (me.down ? 0.45 : this.eye + bobY) + (Math.random() - 0.5) * sh, me.z);
    cam.rotation.set(me.down ? -0.2 : me.pitch, me.yaw, me.down ? 0.5 : this.roll);
    const fov = this.role === 'seer' && this.input.held('zoom') && !me.down ? 30 : 70;
    if (Math.abs(cam.fov - fov) > 0.1) {
      cam.fov += (fov - cam.fov) * Math.min(1, dt * 10);
      cam.updateProjectionMatrix();
    }
    if (this.sword) this.animSword(dt);
    this.updatePartner(dt);
    this.updateGhostViews(dt);
    this.updateMarkers();
    this.fx.update(dt);
    this.decals.update(dt);
    this.world.update(dt, this.time);
    if (this.sfx.ok) {
      const f = this.tmpV.set(0, 0, -1).applyQuaternion(cam.quaternion);
      this.sfx.setListener(cam.position.x, cam.position.y, cam.position.z, f.x, f.y, f.z);
    }
    this.updatePresence(dt);
    this.updateThreat();
  }

  // 自分を狙う攻撃の予兆：画面の縁に、霊のいる方向から赤い光が迫る
  updateThreat() {
    const el = $('threat');
    let best = null, urg = 0;
    for (const v of this.ghosts.values()) {
      if (v.dying > 0 || v.target !== this.role || (v.st !== 'windup' && v.st !== 'lunge')) continue;
      if (Math.hypot(v.x - this.me.x, v.z - this.me.z) > 9) continue;
      const u = v.st === 'lunge' ? 1 : v.wp || 0;
      if (u >= urg) { urg = u; best = v; }
    }
    if (!best || this.me.down) { el.style.opacity = 0; return; }
    const rel = -wrap(Math.atan2(-(best.x - this.me.x), -(best.z - this.me.z)) - this.me.yaw);
    const R = Math.min(innerWidth, innerHeight) * 0.42;
    el.style.left = innerWidth / 2 + Math.sin(rel) * R + 'px';
    el.style.top = innerHeight / 2 - Math.cos(rel) * R + 'px';
    el.style.transform = `translate(-50%,-50%) rotate(${rel}rad) scale(${0.7 + urg * 0.8})`;
    el.style.opacity = (0.35 + urg * 0.65).toFixed(2);
    el.classList.toggle('strike', urg > 0.5);
  }

  animSword(dt) {
    this.swingT += dt;
    const P = this.sword.pivot, R = this.sword.root;
    const u = this.swingT / 0.3;
    let rx, ry, rz, px = 0.3, py = -0.3;
    if (u < 1) {
      if (u < 0.2) { rx = 1.3; ry = -0.7; rz = -0.7; } else {
        const w = (u - 0.2) / 0.8, e = 1 - (1 - w) * (1 - w);
        rx = 1.3 - 2.0 * e; ry = -0.7 + 1.8 * e; rz = -0.7 + 1.3 * e;
      }
      P.rotation.set(rx, ry, rz);
      R.position.set(px, py, -0.42);
      return;
    }
    if (this.me.guard) { rx = 0.15; ry = 0.1; rz = 1.45; px = 0.05; py = -0.18; } else {
      const s = Math.sin(this.bob) * 0.03;
      rx = 0.45 + s; ry = 0.25; rz = -0.25; py = -0.3 + s * 0.5;
    }
    const k = Math.min(1, dt * 16);
    P.rotation.x += (rx - P.rotation.x) * k;
    P.rotation.y += (ry - P.rotation.y) * k;
    P.rotation.z += (rz - P.rotation.z) * k;
    R.position.x += (px - R.position.x) * k;
    R.position.y += (py - R.position.y) * k;
  }

  updatePartner(dt) {
    if (this.solo) return;
    const p = this.partner, A = this.pAvatar;
    const k = this.isHost ? Math.min(1, dt * 15) : Math.min(1, dt * 12);
    p.x += (p.tx - p.x) * k;
    p.z += (p.tz - p.z) * k;
    p.yaw = lerpAngle(p.yaw, p.tyaw, k);
    A.root.position.set(p.x, 0, p.z);
    A.root.rotation.y = p.yaw;
    A.body.rotation.z += ((p.down ? Math.PI / 2 : 0) - A.body.rotation.z) * Math.min(1, dt * 6);
    A.body.position.y = p.down ? 0.3 : 0;
    A.body.scale.y += ((p.stance === 'crouch' && !p.down ? 0.62 : 1) - A.body.scale.y) * Math.min(1, dt * 10);
    if (A.sword) {
      p.swingT += dt;
      const u = p.swingT / 0.3;
      A.sword.rotation.x = u < 1 ? 1.2 - 2.2 * u : p.guard ? 0.2 : 0.4;
      A.sword.rotation.z = p.guard ? 1.4 : 0;
    }
    if (this.role === 'seer') {
      A.silhouette.visible = !M.los(this.me.x, this.me.z, p.x, p.z, M.blocksSightFn(this.sealOpen));
    }
  }

  updateGhostViews(dt) {
    const t = this.time, seer = this.role === 'seer';
    const k = this.isHost ? 1 : Math.min(1, dt * 12);
    const ease = (cur, target, rate) => cur + (target - cur) * Math.min(1, dt * rate);
    for (const [id, v] of this.ghosts) {
      v.x += (v.tx - v.x) * k;
      v.y += (v.ty - v.y) * k;
      v.z += (v.tz - v.z) * k;
      v.yaw = lerpAngle(v.yaw, v.tyaw, k);
      v.flashT -= dt;
      const V = v.view;
      V.root.position.set(v.x, v.y, v.z);
      V.root.rotation.y = v.yaw;
      const wp = v.wp || 0;
      const crawl = v.type === 'crawl';

      // ---- 動き ----
      if (crawl) {
        V.body.rotation.z = ease(V.body.rotation.z, v.ceil ? Math.PI : 0, 6);
        V.body.rotation.x = ease(V.body.rotation.x, v.st === 'windup' ? -0.35 * wp : v.st === 'lunge' ? 0.2 : 0, 10);
        V.ring.position.y = V.fan.position.y = -v.y + 0.03;
        const moving = Math.hypot(v.x - (v.px ?? v.x), v.z - (v.pz ?? v.z)) > dt * 0.3;
        V.legs.forEach((l, i) => { l.pivot.rotation.x = moving ? Math.sin(t * 14 + i * Math.PI) * 0.35 : 0; });
      } else {
        V.body.position.y = 0.12 + Math.sin(t * 1.7 + v.seed) * 0.07;
        // 前かがみ → 構えで反り返り → 突進で前に倒れ込む
        const lean = v.st === 'windup' ? 0.1 + wp * 0.15 : v.st === 'lunge' ? -0.55 : v.st === 'recover' ? -0.25 : -0.15;
        V.body.rotation.x = ease(V.body.rotation.x, lean, v.st === 'lunge' ? 25 : 8);
      }
      v.px = v.x; v.pz = v.z;
      for (const gu of V.guts) gu.pivot.rotation.z = Math.sin(t * 2.2 + gu.seed + v.seed) * 0.22;

      // ときどき映像が乱れたように姿がぶれる
      if (Math.random() < dt * 0.5) v.glitch = 0.07 + Math.random() * 0.08;
      v.glitch = (v.glitch || 0) - dt;
      if (v.glitch > 0) {
        V.root.position.x += (Math.random() - 0.5) * 0.35;
        V.root.position.z += (Math.random() - 0.5) * 0.35;
        V.root.scale.set(1 + Math.random() * 0.4, 1 - Math.random() * 0.15, 1);
      } else V.root.scale.set(1, 1, 1);

      // 滴り落ちる血（除霊役には何もない空間から血が落ちて見える）
      v.dripT = (v.dripT ?? Math.random()) - dt;
      if (v.dripT <= 0 && v.st !== 'dormant' && Math.hypot(v.x - this.me.x, v.z - this.me.z) < 12) {
        v.dripT = 0.15 + Math.random() * 0.35;
        const hx = (Math.random() - 0.5) * 0.5, hz = (Math.random() - 0.5) * 0.5;
        this.fx.burst(v.x + hx, v.y + (crawl ? (v.ceil ? -0.1 : 0.35) : 1.1), v.z + hz, 0x5a0000, 2, 0.3, 0.9, 0.05, -9, null, false);
      }

      let raise = 0.1 + Math.sin(t * 2 + v.seed) * 0.08;
      if (v.st === 'windup') raise = wp * 2.4;
      else if (v.st === 'lunge') raise = 1.5;
      else if (v.st === 'recover') raise = 0.9;
      else if (v.st === 'stun') raise = -0.3;
      else if (v.st === 'alert') raise = 0.6;
      for (const a of V.arms) a.pivot.rotation.x = ease(a.pivot.rotation.x, a.base + raise * (crawl ? 0.5 : 1), v.st === 'lunge' ? 25 : 10);

      // 首：普段は傾いてときどき痙攣、構えるとこちらを真っ直ぐ見る
      if (Math.random() < dt * 0.6) v.twitch = 0.18;
      v.twitch -= dt;
      const tilt = crawl ? V.headTilt : HUNTING.has(v.st) && v.st !== 'chase' ? 0 : V.headTilt;
      V.head.rotation.z = ease(V.head.rotation.z, tilt, 8) + (v.twitch > 0 ? (Math.random() - 0.5) * 0.5 : 0);
      const gape = v.st === 'windup' ? 0.6 + wp * 1.8 : v.st === 'lunge' ? 2.6 : v.st === 'alert' ? 1.4 : 0.5 + Math.sin(t * 3 + v.seed) * 0.1;
      V.mouth.scale.y = ease(V.mouth.scale.y, gape, 12);

      // 這い女は血の跡を残す（除霊役の手がかりにもなる）
      const dd = Math.hypot(v.x - v.dx, v.z - v.dz);
      if (dd > (crawl ? 1.5 : 3.5) && v.st !== 'dormant') {
        this.decals.add(v.x, v.z, crawl ? (v.ceil ? 0.3 : 0.55) : 0.3, crawl ? 30 : 20);
        v.dx = v.x; v.dz = v.z;
      }

      if (v.dying > 0) {
        v.dying -= dt;
        const f = Math.max(0, v.dying / 1.4);
        V.root.visible = true;
        V.setHidden(false);
        if (V.model) {
          // 3Dモデルは燃え崩れるように消える
          const u = V.model.u;
          u.uTime.value = t;
          u.uDissolve.value = (1 - f) * 1.05;
          u.uRimColor.value.setHex(0xffc060);
          u.uRim.value = 1.5;
          u.uSelf.value = 0.35;
        }
        V.look(V.model ? 1 : 0.9 * f, 0xfff0c0);
        V.eyeGlow(f);
        V.body.scale.setScalar(V.baseScale * (1 + (1 - f) * 0.6));
        V.weak.visible = V.ring.visible = V.slamRing.visible = V.fan.visible = false;
        v.voice?.set(v.x, v.y + 1.3, v.z, 0);
        if (v.dying <= 0) this.removeGhost(id);
        continue;
      }

      // ---- 見え方 ----
      const attacking = v.st === 'windup' && !v.slam;
      V.root.visible = true;
      if (seer) {
        V.setHidden(false);
        const flick = 0.8 + Math.random() * 0.2;
        V.look(v.mat ? (V.model ? 1 : 0.92) : V.model ? 0.72 + flick * 0.15 : 0.55 * flick, v.mat ? (V.model ? 0xffc0b8 : 0xff9a9a) : 0xffffff);
        V.eyeGlow(v.mat || HUNTING.has(v.st) ? 1 : 0.6);
        V.ring.visible = v.mat;
        V.weak.visible = !crawl && v.st !== 'dormant';
        if (V.weak.visible) {
          const w = (V.weakPos || WEAK_POS)[v.type === 'boss' ? 'boss' + v.phase : 'wander'];
          V.weak.position.set(w[0], w[1], w[2]);
          V.weak.scale.setScalar(1 + Math.sin(t * 8) * 0.3);
        }
        V.fan.visible = attacking;
        V.slamRing.visible = v.st === 'windup' && v.slam;
      } else {
        // 除霊役：塩で暴いた時／襲われた瞬間／指示役の印が付いている間だけ見える
        const marked = this.markers.some((m) => m.gid === id && t < m.until);
        const shown = v.flashT > 0 || v.rev > 0 || marked;
        // 見えない間も懐中電灯の光では影だけが落ちる
        V.setHidden(!shown);
        V.weak.visible = V.ring.visible = V.fan.visible = V.slamRing.visible = false;
        if (shown) {
          const op = v.flashT > 0 ? 0.9 : v.rev > 0 ? 0.45 : 0.14 + Math.random() * 0.1;
          V.look(op, 0xd8e0ff);
          V.eyeGlow(marked && !(v.flashT > 0 || v.rev > 0) ? 0.7 : 1);
          V.weak.visible = V.ring.visible = false;
          V.fan.visible = attacking;
          V.slamRing.visible = v.st === 'windup' && v.slam;
        }
      }
      if (V.fan.visible) V.fan.material.opacity = 0.12 + wp * 0.35;
      if (V.slamRing.visible) V.slamRing.scale.setScalar(0.3 + 0.7 * wp);
      if (V.model) {
        // ボーンの無いモデルをシェーダーで動かす
        const u = V.model.u;
        u.uTime.value = t;
        u.uDissolve.value = 0;
        u.uTilt.value = V.head.rotation.z;
        u.uArms.value = ease(u.uArms.value, clamp(raise * 0.85, -0.2, 2.1), v.st === 'lunge' ? 25 : 10);
        u.uNod.value = ease(u.uNod.value, v.st === 'windup' ? 0.35 * wp : v.st === 'lunge' ? -0.3 : v.st === 'alert' ? -0.15 : 0.08, 10);
        u.uLunge.value = ease(u.uLunge.value, v.st === 'lunge' ? 1 : v.st === 'windup' ? -0.2 * wp : 0, 20);
        u.uShake.value = (v.glitch > 0 ? 1.2 : 0) + (v.st === 'windup' ? wp * 0.5 : 0) + (v.st === 'stun' ? 0.8 : 0);
        u.uGlow.value = v.mat ? 0.3 : 0;
        u.uRim.value = v.mat ? 1.2 : 0.6;
        u.uRimColor.value.setHex(v.mat ? 0xff2a18 : 0x9fb8ff);
        u.uSelf.value = seer ? (v.mat ? 0.32 : 0.22) : v.flashT > 0 ? 0.3 : 0.06;
      }
      if (v.voice) {
        const lvl = v.st === 'dormant' ? 0.06 : (v.st === 'windup' ? 0.7 : 0.35) * (seer ? 0.6 : 1);
        v.voice.set(v.x, v.y + 1.3, v.z, lvl);
      }
    }
  }

  updateMarkers() {
    const t = this.time;
    for (let i = this.markers.length - 1; i >= 0; i--) {
      const m = this.markers[i];
      if (t > m.until) {
        this.scene.remove(m.view.root);
        m.view.mats.forEach((x) => x.dispose());
        this.markers.splice(i, 1);
        continue;
      }
      if (m.gid) {
        const v = this.ghosts.get(m.gid);
        if (v && !(v.dying > 0)) { m.x = v.x; m.z = v.z; }
      }
      m.view.root.position.set(m.x, 0, m.z);
      const fade = Math.min(1, m.until - t);
      m.view.mats[0].opacity = 0.5 * fade;
      m.view.mats[1].opacity = 0.7 * fade;
      m.view.mats[2].opacity = fade;
      m.view.ring.scale.setScalar(1 + 0.25 * Math.sin(t * 6));
    }
    // 除霊役：画面外の印の方向を矢印で示す
    const arrow = $('arrow');
    const m = this.role === 'exo' ? this.markers[this.markers.length - 1] : null;
    if (!m) { arrow.hidden = true; return; }
    const p = this.tmpV.set(m.x, 1.2, m.z).project(this.camera);
    const onScreen = p.z < 1 && Math.abs(p.x) < 0.9 && Math.abs(p.y) < 0.9;
    if (onScreen) { arrow.hidden = true; return; }
    const rel = -wrap(Math.atan2(-(m.x - this.me.x), -(m.z - this.me.z)) - this.me.yaw);
    arrow.hidden = false;
    const R = Math.min(innerWidth, innerHeight) * 0.38;
    arrow.style.left = innerWidth / 2 + Math.sin(rel) * R + 'px';
    arrow.style.top = innerHeight / 2 - Math.cos(rel) * R + 'px';
    arrow.style.transform = `translate(-50%,-50%) rotate(${rel}rad)`;
  }

  // 除霊役：霊が近いと画面ノイズ・振動・ライトのちらつき
  updatePresence(dt) {
    let p = 0;
    for (const v of this.ghosts.values()) {
      if (v.dying > 0 || v.st === 'dormant' || v.st === 'dead') continue;
      const d = Math.hypot(v.x - this.me.x, v.z - this.me.z);
      let q = clamp(1 - d / 7, 0, 1);
      if (v.st === 'windup') q = Math.min(1, q * 1.5);
      p = Math.max(p, q);
    }
    this.presence += (p - this.presence) * Math.min(1, dt * 4);
    const pr = this.presence;
    this.flash.intensity = pr > 0.35 && Math.random() < pr * 0.25 ? 6 : 40;
    if (this.role !== 'exo') return;
    const nEl = this.noiseCv;
    nEl.style.opacity = (pr * 0.4).toFixed(3);
    if (pr > 0.02) {
      const w = nEl.width, h = nEl.height;
      const im = this.noiseG.createImageData(w, h);
      for (let i = 0; i < im.data.length; i += 4) {
        const c = Math.random() * 255;
        im.data[i] = im.data[i + 1] = im.data[i + 2] = c;
        im.data[i + 3] = 255;
      }
      this.noiseG.putImageData(im, 0, 0);
    }
    this.vibT -= dt;
    if (pr > 0.15 && this.vibT <= 0) {
      vib(Math.round(20 + pr * 40));
      this.vibT = 1.4 - pr * 1.15;
    }
    $('breath').classList.toggle('on', pr > 0.45);
  }

  updateHud(dt) {
    this.hudT -= dt;
    if (this.hudT > 0 || !this.snap) return;
    this.hudT = 0.1;
    const s = this.snap, me = this.me, p = this.partner;
    const remain = Math.max(0, TIME_LIMIT - s.time);
    $('timer').textContent = `夜明けまで ${Math.floor(remain / 60)}:${String(Math.floor(remain % 60)).padStart(2, '0')}`;
    const n = s.it.filter((i) => i[0] === 't').length;
    $('obj').textContent = s.ph === 'talisman' ? `御札を集めよ（${n}/3）` : s.ph === 'boss' ? '奥の間の主を祓え' : '玄関から脱出せよ（二人そろって）';

    const setBar = (el, label, v, danger) => {
      el.querySelector('.lbl').textContent = label;
      const i = el.querySelector('i');
      i.style.width = clamp(v, 0, 100) + '%';
      i.className = danger ? 'danger' : '';
    };
    if (this.role === 'exo') setBar($('bar-me'), '体力', me.hp, me.hp < 35);
    else setBar($('bar-me'), '霊障', me.gauge, me.gauge > 65);
    if (!this.solo) {
      if (this.partnerRole === 'exo') setBar($('bar-partner'), '相棒の体力', p.stat, p.stat < 35);
      else setBar($('bar-partner'), '相棒の霊障', p.stat, p.stat > 65);
    }
    $('salt-n').textContent = me.salt;
    $('mark-n').textContent = this.charges;

    // 気配（足音の大きさ）と、霊に追われているか
    const lv = NOISE_LV[me.stance] ?? 0;
    const hunted = [...this.ghosts.values()].some((v) => !(v.dying > 0) && v.target === this.role && HUNTING.has(v.st));
    const sl = $('stealth');
    sl.querySelector('.pips').textContent = '●'.repeat(lv) + '○'.repeat(3 - lv);
    sl.querySelector('.st').textContent = hunted ? '追われている' : me.crouch ? 'しゃがみ' : me.stance === 'run' ? '走り' : '';
    sl.classList.toggle('hunted', hunted);
    sl.classList.toggle('quiet', me.crouch && !hunted);
    document.querySelectorAll('.act[data-a="crouch"]').forEach((b) => b.classList.toggle('lit', me.crouch));
    const st = $('stamina');
    st.style.width = (me.stamina * 100).toFixed(0) + '%';
    st.parentElement.classList.toggle('full', me.stamina > 0.99);

    const rv = $('revive');
    if (me.down || (p.down && !this.solo)) {
      rv.hidden = false;
      rv.querySelector('span').textContent = me.down ? '相棒が来るのを待て…' : '相棒のそばにいて起こせ';
      rv.querySelector('i').style.width = ((me.down ? me.revive : p.revive) * 100).toFixed(0) + '%';
    } else rv.hidden = true;
    $('down').hidden = !me.down;

    const room = M.roomAtCell(M.cellOf(me.x), M.cellOf(me.z));
    if (room && room.name !== this.lastRoom) {
      this.lastRoom = room.name;
      const el = $('room');
      el.textContent = room.name;
      el.className = '';
      void el.offsetWidth;
      el.className = 'show';
    }
  }

  resize() {
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
    this.post?.setSize(innerWidth, innerHeight);
  }

  // 高画質＝懐中電灯の影＋画面効果。軽量＝どちらも無し
  setQuality(q, notify = true) {
    this.quality = q;
    const high = q === 'high';
    this.flash.castShadow = high;
    if (high && !this.post) this.post = createPost(this.renderer, this.scene, this.camera);
    if (!high && this.post) {
      this.post.dispose();
      this.post = null;
    }
    if (notify) this.onQuality?.(q);
  }

  // 開始2〜8秒の平均フレームレートが低ければ、自動で軽量画質に切り替える
  checkPerf(dt) {
    if (this.quality !== 'high' || this.perfDone) return;
    this.perfT = (this.perfT || 0) + dt;
    if (this.perfT < 2) return;
    this.perfFrames = (this.perfFrames || 0) + 1;
    if (this.perfT < 8) return;
    this.perfDone = true;
    const fps = this.perfFrames / (this.perfT - 2);
    if (fps < 32) {
      this.setQuality('low');
      this.toast('処理が重いため、軽量画質に切り替えました', 3);
    }
  }

  dispose() {
    for (const id of [...this.ghosts.keys()]) this.removeGhost(id);
    this.scene.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => { m.map?.dispose(); m.dispose(); });
    });
    this.post?.dispose();
    this.renderer.renderLists.dispose();
  }
}
