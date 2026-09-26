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
        this.ambient();
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
    return p;
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

  play(kind, pos) {
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
      case 'creak': this.tone('sawtooth', 95, 70, 0.7, 0.05, d); break;
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

  // 霊ごとのループ音（囁き＋うめき）。set() で位置と音量を更新
  voice() {
    if (!this.ctx) return null;
    const ctx = this.ctx;
    const p = this.panner(0, 0, 0);
    const g = ctx.createGain();
    g.gain.value = 0;
    g.connect(p);
    const n = this.noise(true);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 6;
    bp.frequency.value = 900;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.35 + Math.random() * 0.3;
    const lg = ctx.createGain();
    lg.gain.value = 500;
    lfo.connect(lg).connect(bp.frequency);
    n.connect(bp).connect(g);
    const o = ctx.createOscillator();
    o.frequency.value = 140 + Math.random() * 60;
    const vib = ctx.createOscillator();
    vib.frequency.value = 5;
    const vg = ctx.createGain();
    vg.gain.value = 6;
    vib.connect(vg).connect(o.frequency);
    const og = ctx.createGain();
    og.gain.value = 0.25;
    o.connect(og).connect(g);
    const srcs = [n, lfo, o, vib];
    srcs.forEach((s) => s.start());
    return {
      set: (x, y, z, level) => {
        this.setPos(p, x, y, z);
        g.gain.setTargetAtTime(level, ctx.currentTime, 0.15);
      },
      stop: () => {
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
