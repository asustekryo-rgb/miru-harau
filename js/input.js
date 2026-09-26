// タッチ（仮想スティック＋視点ドラッグ＋ボタン）とキーボード/マウス入力
const ACTION_KEYS = {
  Space: 'attack', KeyJ: 'attack', KeyK: 'guard', KeyL: 'salt', ShiftLeft: 'dash', ShiftRight: 'dash',
  KeyE: 'mark', KeyQ: 'now', Digit1: 'danger', Digit2: 'wait', KeyZ: 'zoom',
};

export class Input {
  constructor(layer) {
    this.layer = layer;
    this.keys = new Set();
    this.btnHeld = new Set();
    this.edges = new Set();
    this.ldx = 0;
    this.ldy = 0;
    this.joy = null;
    this.look = null;
    this.joyEl = document.getElementById('joy');
    this.knob = document.getElementById('joy-knob');

    layer.addEventListener('pointerdown', (e) => this.onDown(e));
    addEventListener('pointermove', (e) => this.onMove(e));
    addEventListener('pointerup', (e) => this.onUp(e));
    addEventListener('pointercancel', (e) => this.onUp(e));
    layer.addEventListener('contextmenu', (e) => e.preventDefault());
    addEventListener('keydown', (e) => {
      if (e.target instanceof HTMLTextAreaElement) return;
      if (!e.repeat) {
        this.keys.add(e.code);
        const a = ACTION_KEYS[e.code];
        if (a) this.edges.add(a);
      }
      if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.reset());
    document.querySelectorAll('#btns .act').forEach((b) => this.bindButton(b, b.dataset.a));
  }

  bindButton(el, name) {
    const on = (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.btnHeld.add(name);
      this.edges.add(name);
      el.classList.add('on');
      try { el.setPointerCapture(e.pointerId); } catch { /* 無視 */ }
    };
    const off = () => {
      this.btnHeld.delete(name);
      el.classList.remove('on');
    };
    el.addEventListener('pointerdown', on);
    el.addEventListener('pointerup', off);
    el.addEventListener('pointercancel', off);
    el.addEventListener('lostpointercapture', off);
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  onDown(e) {
    e.preventDefault();
    if (e.pointerType !== 'mouse' && !this.joy && e.clientX < innerWidth * 0.42) {
      this.joy = { id: e.pointerId, ox: e.clientX, oy: e.clientY, x: 0, y: 0 };
      this.joyEl.style.left = e.clientX + 'px';
      this.joyEl.style.top = e.clientY + 'px';
      this.joyEl.classList.add('on');
      this.knob.style.transform = 'translate(-50%,-50%)';
    } else if (!this.look) {
      this.look = { id: e.pointerId, x: e.clientX, y: e.clientY };
    }
    try { this.layer.setPointerCapture(e.pointerId); } catch { /* 無視 */ }
  }

  onMove(e) {
    if (this.joy && e.pointerId === this.joy.id) {
      const R = 55;
      let dx = e.clientX - this.joy.ox, dy = e.clientY - this.joy.oy;
      const len = Math.hypot(dx, dy);
      if (len > R) { dx = (dx / len) * R; dy = (dy / len) * R; }
      this.joy.x = dx / R;
      this.joy.y = -dy / R;
      this.knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    } else if (this.look && e.pointerId === this.look.id) {
      this.ldx += e.clientX - this.look.x;
      this.ldy += e.clientY - this.look.y;
      this.look.x = e.clientX;
      this.look.y = e.clientY;
    }
  }

  onUp(e) {
    if (this.joy && e.pointerId === this.joy.id) {
      this.joy = null;
      this.joyEl.classList.remove('on');
    }
    if (this.look && e.pointerId === this.look.id) this.look = null;
  }

  moveVec() {
    if (this.joy) {
      const { x, y } = this.joy;
      return Math.hypot(x, y) < 0.12 ? { x: 0, y: 0 } : { x, y };
    }
    const k = this.keys;
    let x = (k.has('KeyD') ? 1 : 0) - (k.has('KeyA') ? 1 : 0);
    let y = (k.has('KeyW') ? 1 : 0) - (k.has('KeyS') ? 1 : 0);
    const l = Math.hypot(x, y);
    if (l > 1) { x /= l; y /= l; }
    return { x, y };
  }

  keyLook() {
    const k = this.keys;
    return {
      x: (k.has('ArrowRight') ? 1 : 0) - (k.has('ArrowLeft') ? 1 : 0),
      y: (k.has('ArrowUp') ? 1 : 0) - (k.has('ArrowDown') ? 1 : 0),
    };
  }

  consumeLook() {
    const r = { dx: this.ldx, dy: this.ldy };
    this.ldx = 0;
    this.ldy = 0;
    return r;
  }

  held(name) {
    if (this.btnHeld.has(name)) return true;
    for (const k of this.keys) if (ACTION_KEYS[k] === name) return true;
    return false;
  }

  pressed(name) {
    return this.edges.has(name);
  }

  endFrame() {
    this.edges.clear();
  }

  reset() {
    this.keys.clear();
    this.btnHeld.clear();
    this.edges.clear();
    this.joy = null;
    this.look = null;
    this.ldx = this.ldy = 0;
    this.joyEl.classList.remove('on');
    document.querySelectorAll('#btns .act.on').forEach((b) => b.classList.remove('on'));
  }
}
