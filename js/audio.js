// WebAudioで合成する効果音と立体音響（音声ファイルなし）
export class Sfx {
  constructor() {
    this.ctx = null;
  }

  get ok() {
    return !!this.ctx;
  }

  init() {
    try {
      if (!this.ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        this.ctx = new AC();
        this.master = this.ctx.createGain();
        this.master.gain.value = 0.8;
        this.master.connect(this.ctx.destination);
        const b = this.ctx.createBuffer(1, this.ctx.sampleRate * 2, this.ctx.sampleRate);
        const d = b.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
        this.noiseBuf = b;
        // 残響（場所の響き）。立体音はすべてここへも送る
        this.verbIn = this.ctx.createGain();
        this.verbIn.gain.value = 0.35;
        this.verb = this.ctx.createConvolver();
        this.verb.buffer = this.makeIR(1.6, 0.5);
        const verbOut = this.ctx.createGain();
        verbOut.gain.value = 0.9;
        this.verbIn.connect(this.verb).connect(verbOut).connect(this.master);
        this.ambient();
        this.tension();
      }
      if (this.ctx.state === 'suspended') this.ctx.resume();
    } catch (e) {
      console.warn('audio init failed', e);
    }
  }

  noise(loop = false) {
    const s = this.ctx.createBufferSource();
    s.buffer = this.noiseBuf;
    s.loop = loop;
    return s;
  }

  setPos(p, x, y, z) {
    if (p.positionX) {
      p.positionX.value = x; p.positionY.value = y; p.positionZ.value = z;
    } else p.setPosition(x, y, z);
  }

  setListener(x, y, z, fx, fy, fz) {
    if (!this.ctx) return;
    const l = this.ctx.listener;
    if (l.positionX) {
      l.positionX.value = x; l.positionY.value = y; l.positionZ.value = z;
      l.forwardX.value = fx; l.forwardY.value = fy; l.forwardZ.value = fz;
      l.upX.value = 0; l.upY.value = 1; l.upZ.value = 0;
    } else {
      l.setPosition(x, y, z);
      l.setOrientation(fx, fy, fz, 0, 1, 0);
    }
  }

  panner(x, y, z) {
    const p = this.ctx.createPanner();
    p.panningModel = 'HRTF';
    p.distanceModel = 'inverse';
    p.refDistance = 1.5;
    p.maxDistance = 40;
    p.rolloffFactor = 1.2;
    this.setPos(p, x, y, z);
    p.connect(this.master);
    p.connect(this.verbIn);
    return p;
  }

  // 残響の元（減衰するノイズ）。bright が高いほど硬い響き（タイル・コンクリート）
  makeIR(sec, bright) {
    const rate = this.ctx.sampleRate, len = Math.floor(rate * sec);
    const buf = this.ctx.createBuffer(2, len, rate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      let lp = 0;
      for (let i = 0; i < len; i++) {
        const t = i / len;
        const n = Math.random() * 2 - 1;
        lp += (n - lp) * (0.08 + bright * 0.6);
        // 初期反射をいくつか入れてから指数的に減衰
        const early = i < rate * 0.08 && Math.random() < 0.004 ? 3 : 1;
        d[i] = lp * Math.pow(1 - t, 2.4) * early;
      }
    }
    return buf;
  }

  // ステージごとの響きと環境音。spots にはピアノ・心電図などの音源位置
  setEnvironment(theme, spots = {}) {
    if (!this.ctx) return;
    this.envTheme = theme;
    this.spots = spots;
    const ir = { house: [1.3, 0.25], school: [2.4, 0.45], hospital: [2.0, 0.8] }[theme] || [1.6, 0.5];
    this.verb.buffer = this.makeIR(ir[0], ir[1]);
    this.envT = { creak: 3, knock: 25, chime: 12, piano: 6, bell: 40, drip: 2, scrape: 18, sob: 30 };
    this.monitorT = 0;
    this.monitorBeats = 0;
    // 病院の蛍光灯のうなり
    if (this.hum) {
      this.hum.g.gain.setTargetAtTime(0, this.ctx.currentTime, 0.3);
      this.hum = null;
    }
    if (theme === 'hospital') {
      const ctx = this.ctx;
      const g = ctx.createGain();
      g.gain.value = 0;
      g.gain.setTargetAtTime(0.035, ctx.currentTime, 1);
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = 100;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 420;
      o.connect(lp).connect(g).connect(this.master);
      o.start();
      this.hum = { g, o };
    }
  }

  // 毎フレーム：環境音のきっかけ、心音、追われている時の音楽
  tick(dt, s) {
    if (!this.ctx || !this.envT) return;
    const T = this.envT, th = this.envTheme, L = s.listener;
    const around = (min, max) => {
      const a = Math.random() * Math.PI * 2, d = min + Math.random() * (max - min);
      return { x: L.x + Math.cos(a) * d, y: 0.5 + Math.random() * 2, z: L.z + Math.sin(a) * d };
    };
    for (const k of Object.keys(T)) T[k] -= dt;
    if (T.creak <= 0) { T.creak = 4 + Math.random() * 9; this.play(th === 'hospital' ? 'squeak' : 'creak', around(4, 12)); }
    if (T.scrape <= 0) { T.scrape = 20 + Math.random() * 30; this.play('scrape', around(6, 14)); }
    if (T.sob <= 0) { T.sob = 35 + Math.random() * 40; this.play('sob', around(8, 16)); }
    if (th === 'house') {
      if (T.knock <= 0) { T.knock = 30 + Math.random() * 40; this.play('knock', around(5, 12)); }
      if (T.chime <= 0) { T.chime = 14 + Math.random() * 20; this.play('furin', around(6, 12)); }
    } else if (th === 'school') {
      if (T.piano <= 0 && this.spots.piano) { T.piano = 5 + Math.random() * 14; this.play('piano', this.spots.piano); }
      if (T.bell <= 0) { T.bell = 60 + Math.random() * 60; this.play('schoolbell'); }
    } else if (th === 'hospital') {
      if (T.drip <= 0) { T.drip = 1.5 + Math.random() * 4; this.play('drip', around(3, 10)); }
      // 心電図：規則正しく鳴り、ときどき長い平坦音になる
      this.monitorT -= dt;
      if (this.monitorT <= 0 && this.spots.monitor) {
        this.monitorBeats++;
        if (this.monitorBeats % 23 === 0) { this.play('flatline', this.spots.monitor); this.monitorT = 4; } else { this.play('beep', this.spots.monitor); this.monitorT = 0.8 + Math.random() * 0.25; }
      }
      if (this.hum && Math.random() < dt * 0.4) {
        // 蛍光灯のちらつき音
        const t = this.ctx.currentTime;
        this.hum.g.gain.setValueAtTime(0.09, t);
        this.hum.g.gain.setTargetAtTime(0.035, t + 0.05, 0.05);
      }
    }
    // 心音：霊が近い・追われている・弱っている時ほど速く大きく
    const fear = Math.max(s.presence, s.hunted ? 0.7 : 0, s.weak ? 0.6 : 0);
    this.heartT = (this.heartT ?? 0) - dt;
    if (fear > 0.2 && this.heartT <= 0) {
      this.heartT = 60 / (70 + fear * 80);
      this.play('heart', null, 0.35 + fear * 0.65);
    }
    // 追跡の音楽
    const target = s.hunted ? 1 : 0;
    this.chaseLv = (this.chaseLv ?? 0) + (target - (this.chaseLv ?? 0)) * Math.min(1, dt * (target ? 2 : 0.5));
    if (this.chase) this.chase.gain.setTargetAtTime(this.chaseLv * 0.22, this.ctx.currentTime, 0.1);
  }

  // ゲーム終了時：環境音と追跡の音楽を止める
  calm() {
    if (!this.ctx) return;
    this.envT = null;
    this.chaseLv = 0;
    this.chase?.gain.setTargetAtTime(0, this.ctx.currentTime, 0.3);
    if (this.hum) {
      this.hum.g.gain.setTargetAtTime(0, this.ctx.currentTime, 0.3);
      this.hum = null;
    }
  }

  // 追われている時の低い脈動と不協和な弦（音量は tick で上下）
  tension() {
    const ctx = this.ctx;
    const g = ctx.createGain();
    g.gain.value = 0;
    g.connect(this.master);
    const pulse = ctx.createGain();
    pulse.gain.value = 0;
    const lfo = ctx.createOscillator();
    lfo.type = 'square';
    lfo.frequency.value = 2.2;
    const lfoG = ctx.createGain();
    lfoG.gain.value = 0.5;
    lfo.connect(lfoG).connect(pulse.gain);
    const bass = ctx.createOscillator();
    bass.type = 'sawtooth';
    bass.frequency.value = 49;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 180;
    bass.connect(lp).connect(pulse).connect(g);
    const strings = ctx.createGain();
    strings.gain.value = 0.25;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1400;
    bp.Q.value = 2;
    for (const f of [740, 784, 1047]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = f;
      const vib = ctx.createOscillator();
      vib.frequency.value = 5 + Math.random() * 2;
      const vg = ctx.createGain();
      vg.gain.value = f * 0.006;
      vib.connect(vg).connect(o.frequency);
      o.connect(bp);
      o.start();
      vib.start();
    }
    bp.connect(strings).connect(g);
    [lfo, bass].forEach((o) => o.start());
    this.chase = g;
  }

  // 床の材質ごとの足音
  step(surface) {
    if (!this.ctx) return;
    const d = this.master;
    switch (surface) {
      case 'tatami': this.burst('lowpass', 900, 300, 0.7, 0.12, 0.07, d); break;
      case 'stone': this.burst('bandpass', 1800, 900, 2, 0.06, 0.14, d); this.tone('sine', 220, 180, 0.05, 0.05, d); break;
      case 'tile': this.burst('highpass', 2500, 1500, 1, 0.05, 0.14, d); this.tone('triangle', 900, 700, 0.03, 0.04, d); break;
      case 'lino':
        this.burst('lowpass', 600, 250, 1, 0.07, 0.1, d);
        if (Math.random() < 0.15) this.tone('sine', 1800, 2400, 0.08, 0.03, d);
        break;
      default:
        this.burst('lowpass', 420, 180, 1, 0.08, 0.11, d);
        if (Math.random() < 0.2) this.tone('sawtooth', 110, 80, 0.25, 0.025, d); // 床板のきしみ
    }
    // 足音も響かせる
    this.burst('lowpass', 500, 200, 1, 0.08, 0.05, this.verbIn);
  }

  env(g, t0, a, peak, dur) {
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak, t0 + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  }

  tone(type, f0, f1, dur, peak, dest, delay = 0) {
    const t = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = this.ctx.createGain();
    this.env(g, t, 0.01, peak, dur);
    o.connect(g).connect(dest);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  burst(ftype, f0, f1, q, dur, peak, dest, delay = 0) {
    const t = this.ctx.currentTime + delay;
    const s = this.noise();
    const f = this.ctx.createBiquadFilter();
    f.type = ftype;
    f.frequency.setValueAtTime(f0, t);
    f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    f.Q.value = q;
    const g = this.ctx.createGain();
    this.env(g, t, 0.005, peak, dur);
    s.connect(f).connect(g).connect(dest);
    s.start(t);
    s.stop(t + dur + 0.05);
  }

  play(kind, pos, vol = 1) {
    if (!this.ctx) return;
    const d = pos ? this.panner(pos.x, pos.y ?? 1.2, pos.z) : this.master;
    switch (kind) {
      case 'step': this.burst('lowpass', 420, 180, 1, 0.08, 0.1, d); break;
      case 'swing': this.burst('bandpass', 2600, 500, 2, 0.22, 0.35, d); break;
      case 'whoosh':
        this.burst('bandpass', 900, 200, 4, 0.5, 0.35, d);
        this.tone('sine', 320, 110, 0.5, 0.1, d);
        break;
      case 'hit':
        this.tone('sine', 130, 40, 0.25, 0.8, d);
        this.burst('highpass', 3000, 1500, 1, 0.08, 0.3, d);
        break;
      case 'exorcise':
        [880, 1320, 1760, 2640].forEach((f, i) => this.tone('sine', f, f, 2.2 - i * 0.3, 0.35 / (i + 1), d, i * 0.05));
        this.burst('highpass', 6000, 9000, 1, 1.2, 0.06, d);
        break;
      case 'hurt':
        this.tone('sawtooth', 160, 60, 0.3, 0.4, d);
        this.burst('lowpass', 900, 200, 1, 0.3, 0.4, d);
        break;
      case 'screech':
        this.tone('sawtooth', 300, 1400, 0.85, 0.22, d);
        this.tone('square', 310, 1250, 0.85, 0.05, d);
        break;
      case 'slam':
        this.tone('sine', 60, 28, 0.9, 1.0, d);
        this.burst('lowpass', 600, 80, 1, 0.8, 0.6, d);
        break;
      case 'roar':
        this.tone('sawtooth', 70, 42, 1.8, 0.35, d);
        this.burst('bandpass', 500, 150, 2, 1.8, 0.45, d);
        break;
      case 'ping':
        this.tone('sine', 1320, 1320, 0.25, 0.25, d);
        this.tone('sine', 1760, 1760, 0.3, 0.2, d, 0.12);
        break;
      case 'now':
        this.tone('triangle', 1568, 1568, 0.5, 0.6, d);
        this.tone('sine', 3136, 3136, 0.35, 0.15, d);
        break;
      case 'danger':
        this.tone('square', 620, 620, 0.12, 0.18, d);
        this.tone('square', 440, 440, 0.18, 0.18, d, 0.14);
        break;
      case 'wait': this.tone('sine', 392, 392, 0.4, 0.35, d); break;
      case 'pickup': [660, 880, 1100].forEach((f, i) => this.tone('triangle', f, f, 0.25, 0.2, d, i * 0.07)); break;
      case 'seal':
        this.tone('sine', 65, 65, 3, 0.6, d);
        this.tone('sine', 131, 131, 2.5, 0.3, d);
        this.burst('lowpass', 300, 60, 1, 2, 0.3, d);
        break;
      case 'salt': this.burst('highpass', 4000, 8000, 0.7, 0.35, 0.25, d); break;
      case 'revive': [523, 659, 784].forEach((f, i) => this.tone('sine', f, f, 0.5, 0.2, d, i * 0.1)); break;
      case 'creak':
        this.tone('sawtooth', 95 + Math.random() * 40, 60, 0.9, 0.07, d);
        this.burst('bandpass', 700, 300, 6, 0.8, 0.05, d);
        break;
      case 'squeak': this.tone('sine', 1400, 2200 + Math.random() * 400, 0.35, 0.05, d); this.tone('sine', 2100, 1800, 0.3, 0.03, d, 0.3); break;
      case 'scrape': this.burst('bandpass', 400, 900, 3, 1.1, 0.12, d); break;
      case 'knock': [0, 0.35, 0.7].forEach((t) => { this.tone('sine', 140, 70, 0.12, 0.5, d, t); this.burst('lowpass', 800, 200, 1, 0.08, 0.3, d, t); }); break;
      case 'furin': [2637, 3520, 4186].forEach((f, i) => this.tone('sine', f * (0.98 + Math.random() * 0.04), f, 2.2, 0.04, d, i * 0.12 + Math.random() * 0.2)); break;
      case 'piano': {
        // 誰もいない音楽室から、調子外れのピアノ
        const notes = [196, 207.7, 233, 277, 311, 370, 415];
        const n = notes[Math.floor(Math.random() * notes.length)];
        for (const k of [1, 2.01, 3.02]) this.tone('triangle', n * k, n * k, 2.5, 0.12 / k, d);
        if (Math.random() < 0.4) this.tone('triangle', n * 1.06, n * 1.06, 2, 0.08, d, 0.02);
        break;
      }
      case 'schoolbell': [659, 523, 587, 392, 392, 587, 659, 523].forEach((f, i) => this.tone('sine', f * 0.97, f * 0.965, 1.4, 0.07, d, i * 0.7)); break;
      case 'drip': this.tone('sine', 1200 + Math.random() * 800, 500, 0.12, 0.08, d); break;
      case 'beep': this.tone('sine', 1000, 1000, 0.12, 0.06, d); break;
      case 'flatline': this.tone('sine', 1000, 1000, 3.2, 0.05, d); break;
      case 'sob': {
        // 遠くですすり泣くような声（途切れ途切れの狭い帯域ノイズ）
        for (let i = 0; i < 4; i++) {
          const t = i * 0.45 + Math.random() * 0.2;
          this.burst('bandpass', 700 + Math.random() * 200, 500, 12, 0.35, 0.18, d, t);
          this.tone('sine', 330 + Math.random() * 40, 260, 0.35, 0.04, d, t);
        }
        break;
      }
      case 'heart':
        this.tone('sine', 62, 40, 0.14, 0.9 * vol, d);
        this.tone('sine', 55, 36, 0.12, 0.6 * vol, d, 0.22);
        break;
      case 'gore':
        this.burst('lowpass', 700, 120, 3, 0.35, 0.5, d);
        this.burst('bandpass', 1400, 300, 5, 0.2, 0.25, d, 0.05);
        break;
      case 'notice':
        this.tone('sawtooth', 880, 932, 0.5, 0.18, d);
        this.tone('sawtooth', 1244, 1175, 0.5, 0.12, d);
        this.burst('highpass', 3000, 5000, 1, 0.4, 0.1, d);
        break;
      case 'lunge':
        this.burst('bandpass', 2400, 700, 3, 0.3, 0.5, d);
        this.tone('sawtooth', 220, 90, 0.3, 0.3, d);
        break;
      case 'wail':
        this.tone('sine', 260, 180, 2.2, 0.25, d);
        this.tone('sine', 390, 270, 2.2, 0.12, d, 0.1);
        this.burst('bandpass', 700, 400, 6, 2.0, 0.15, d);
        break;
      case 'dodge': this.burst('bandpass', 1800, 400, 1.5, 0.18, 0.25, d); break;
      case 'barrier':
        [1046, 1568, 2093].forEach((f, i) => this.tone('sine', f, f, 1.6, 0.25 / (i + 1), d, i * 0.03));
        this.burst('highpass', 5000, 9000, 1, 0.8, 0.08, d);
        this.tone('sine', 130, 130, 1.2, 0.2, d);
        break;
      case 'bind':
        this.tone('square', 220, 180, 0.25, 0.25, d);
        this.burst('bandpass', 3000, 1200, 8, 0.4, 0.4, d);
        this.tone('sine', 880, 880, 0.8, 0.2, d, 0.05);
        break;
      case 'scream':
        this.tone('sawtooth', 780, 330, 0.7, 0.45, d);
        this.tone('sawtooth', 830, 350, 0.7, 0.3, d);
        this.tone('square', 1560, 900, 0.5, 0.12, d);
        this.burst('bandpass', 2600, 1200, 2, 0.7, 0.55, d);
        this.tone('sine', 70, 30, 0.6, 0.9, d);
        break;
      case 'win': [523, 659, 784, 1046].forEach((f, i) => this.tone('triangle', f, f, 1.2, 0.2, d, i * 0.15)); break;
      case 'lose':
        this.tone('sawtooth', 110, 40, 2.5, 0.3, d);
        this.burst('lowpass', 400, 60, 1, 2.5, 0.3, d);
        break;
    }
  }

  // 霊ごとのループ音。set(x, y, z, 音量, 壁越しか) で位置と音量を更新
  //  wander: 途切れ途切れの囁き＋うめき  crawl: 骨の軋む音＋濡れた呼吸  boss: 低い合唱のような唸り
  voice(type = 'wander') {
    if (!this.ctx) return null;
    const ctx = this.ctx;
    const p = this.panner(0, 0, 0);
    const occl = ctx.createBiquadFilter(); // 壁越しはこもった音にする
    occl.type = 'lowpass';
    occl.frequency.value = 12000;
    occl.connect(p);
    const g = ctx.createGain();
    g.gain.value = 0;
    g.connect(occl);
    const srcs = [];
    const osc = (type2, f) => {
      const o = ctx.createOscillator();
      o.type = type2;
      o.frequency.value = f;
      srcs.push(o);
      return o;
    };

    // 囁き：ノイズを声の帯域（フォルマント2つ）に絞り、不規則に途切れさせる
    const n = this.noise(true);
    srcs.push(n);
    const syll = ctx.createGain();
    syll.gain.value = 0;
    const f1 = ctx.createBiquadFilter();
    f1.type = 'bandpass';
    f1.Q.value = 5;
    f1.frequency.value = type === 'boss' ? 500 : 1100;
    const f2 = ctx.createBiquadFilter();
    f2.type = 'bandpass';
    f2.Q.value = 7;
    f2.frequency.value = type === 'boss' ? 1200 : 2600;
    n.connect(f1).connect(syll);
    n.connect(f2).connect(syll);
    syll.connect(g);

    // 低い声
    const moan = ctx.createGain();
    moan.gain.value = type === 'boss' ? 0.5 : type === 'crawl' ? 0.12 : 0.22;
    const base = type === 'boss' ? 55 : type === 'crawl' ? 95 : 150 + Math.random() * 50;
    const voices = type === 'boss' ? [1, 1.5, 2.01, 2.52] : [1];
    const form = ctx.createBiquadFilter();
    form.type = 'bandpass';
    form.frequency.value = type === 'boss' ? 400 : 700;
    form.Q.value = 1.5;
    for (const k of voices) {
      const o = osc(type === 'boss' ? 'sawtooth' : 'sine', base * k);
      const vib = osc('sine', 4 + Math.random() * 2);
      const vg = ctx.createGain();
      vg.gain.value = base * k * 0.02;
      vib.connect(vg).connect(o.frequency);
      o.connect(form);
    }
    form.connect(moan).connect(g);
    srcs.forEach((s) => s.start());

    // 囁きの抑揚と、這い女の骨の音を不規則に鳴らす
    let alive = true;
    const loop = () => {
      if (!alive) return;
      const t = ctx.currentTime;
      const on = Math.random() < 0.65;
      syll.gain.setTargetAtTime(on ? 0.5 + Math.random() * 0.6 : 0, t, 0.04);
      f1.frequency.setTargetAtTime((type === 'boss' ? 400 : 800) + Math.random() * 700, t, 0.05);
      f2.frequency.setTargetAtTime((type === 'boss' ? 1000 : 2000) + Math.random() * 1200, t, 0.05);
      if (type === 'crawl' && Math.random() < 0.5) {
        for (let i = 0; i < 1 + Math.floor(Math.random() * 3); i++) {
          this.burst('highpass', 2500, 1500, 3, 0.03, 0.35, g, i * (0.05 + Math.random() * 0.08));
        }
      }
      setTimeout(loop, 90 + Math.random() * 260);
    };
    loop();

    return {
      set: (x, y, z, level, occluded = false) => {
        this.setPos(p, x, y, z);
        g.gain.setTargetAtTime(level, ctx.currentTime, 0.15);
        occl.frequency.setTargetAtTime(occluded ? 650 : 12000, ctx.currentTime, 0.2);
      },
      stop: () => {
        alive = false;
        g.gain.setTargetAtTime(0, ctx.currentTime, 0.1);
        setTimeout(() => {
          srcs.forEach((s) => { try { s.stop(); } catch { /* 停止済み */ } });
          p.disconnect();
        }, 500);
      },
    };
  }

  ambient() {
    const ctx = this.ctx;
    const g = ctx.createGain();
    g.gain.value = 0.05;
    g.connect(this.master);
    [55, 55.8, 82.4].forEach((f) => {
      const o = ctx.createOscillator();
      o.frequency.value = f;
      o.connect(g);
      o.start();
    });
    const n = this.noise(true);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 350;
    const ng = ctx.createGain();
    ng.gain.value = 0.08;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.07;
    const lg = ctx.createGain();
    lg.gain.value = 0.06;
    lfo.connect(lg).connect(ng.gain);
    n.connect(lp).connect(ng).connect(this.master);
    n.start();
    lfo.start();
  }
}
