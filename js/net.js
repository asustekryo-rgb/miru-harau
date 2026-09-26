// 通信層：WebRTC DataChannel（QR/コードで手動シグナリング）と同一PCテスト用 BroadcastChannel
const ICE = [{ urls: 'stun:stun.l.google.com:19302' }];

class BaseTransport {
  constructor() {
    this.onmessage = null;
    this.onopen = null;
    this.onclose = null;
    this.isOpen = false;
    this.closed = false;
  }
  _msg(d) { this.onmessage?.(d); }
  _open() {
    if (this.isOpen || this.closed) return;
    this.isOpen = true;
    this.onopen?.();
  }
  _close() {
    if (this.closed) return;
    this.closed = true;
    this.isOpen = false;
    this.onclose?.();
  }
}

export class RtcTransport extends BaseTransport {
  constructor(isHost) {
    super();
    this.isHost = isHost;
    this.pc = new RTCPeerConnection({ iceServers: ICE });
    this.pc.onconnectionstatechange = () => {
      const s = this.pc.connectionState;
      if (s === 'failed' || s === 'closed') this._close();
      else if (s === 'disconnected') {
        clearTimeout(this.dcTimer);
        this.dcTimer = setTimeout(() => {
          if (this.pc.connectionState !== 'connected') this._close();
        }, 6000);
      }
    };
    if (isHost) {
      this.setup(this.pc.createDataChannel('rel', { ordered: true }));
      this.setup(this.pc.createDataChannel('fast', { ordered: false, maxRetransmits: 0 }));
    } else {
      this.pc.ondatachannel = (e) => this.setup(e.channel);
    }
  }

  setup(ch) {
    this[ch.label] = ch;
    ch.onopen = () => {
      if (this.rel?.readyState === 'open' && this.fast?.readyState === 'open') this._open();
    };
    ch.onmessage = (e) => this._msg(JSON.parse(e.data));
    ch.onclose = () => { if (this.isOpen) this._close(); };
  }

  gather() {
    return new Promise((res) => {
      const done = () => res(this.pc.localDescription.sdp);
      if (this.pc.iceGatheringState === 'complete') return done();
      const to = setTimeout(done, 3000);
      this.pc.addEventListener('icegatheringstatechange', () => {
        if (this.pc.iceGatheringState === 'complete') {
          clearTimeout(to);
          done();
        }
      });
    });
  }

  async createOffer() {
    await this.pc.setLocalDescription(await this.pc.createOffer());
    return encodeSignal('o', await this.gather());
  }

  async acceptOffer(code) {
    const { k, sdp } = await decodeSignal(code);
    if (k !== 'o') throw new Error('部屋を作った側のQRを読み取ってください');
    await this.pc.setRemoteDescription({ type: 'offer', sdp });
    await this.pc.setLocalDescription(await this.pc.createAnswer());
    return encodeSignal('a', await this.gather());
  }

  async acceptAnswer(code) {
    const { k, sdp } = await decodeSignal(code);
    if (k !== 'a') throw new Error('参加した側のQRを読み取ってください');
    await this.pc.setRemoteDescription({ type: 'answer', sdp });
  }

  send(o) {
    if (this.rel?.readyState === 'open') this.rel.send(JSON.stringify(o));
  }

  sendFast(o) {
    if (this.fast?.readyState === 'open') this.fast.send(JSON.stringify(o));
    else this.send(o);
  }

  close() {
    this.closed = true;
    try { this.pc.close(); } catch { /* 無視 */ }
  }
}

export class LocalTransport extends BaseTransport {
  constructor(isHost) {
    super();
    this.id = Math.random().toString(36).slice(2);
    this.peer = null;
    this.bc = new BroadcastChannel('miruharau-local');
    this.bc.onmessage = (e) => {
      const m = e.data;
      if (m.from === this.id || (m.to && m.to !== this.id)) return;
      if (m.k === 'announce' && !isHost && !this.peer) {
        this.peer = m.from;
        this.bc.postMessage({ k: 'join', from: this.id, to: m.from });
        this._open();
      } else if (m.k === 'join' && isHost && !this.peer) {
        this.peer = m.from;
        clearInterval(this.ann);
        this._open();
      } else if (m.k === 'msg' && m.from === this.peer) this._msg(m.d);
      else if (m.k === 'bye' && m.from === this.peer) this._close();
    };
    if (isHost) this.ann = setInterval(() => this.bc.postMessage({ k: 'announce', from: this.id }), 400);
    this.onHide = () => this.close();
    addEventListener('pagehide', this.onHide);
  }

  send(o) {
    if (this.peer && !this.closed) this.bc.postMessage({ k: 'msg', from: this.id, to: this.peer, d: o });
  }

  sendFast(o) {
    this.send(o);
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    clearInterval(this.ann);
    removeEventListener('pagehide', this.onHide);
    try {
      if (this.peer) this.bc.postMessage({ k: 'bye', from: this.id, to: this.peer });
      this.bc.close();
    } catch { /* 無視 */ }
  }
}

// ---- シグナル（SDP）を短いコードにする ----
function slim(sdp) {
  return sdp
    .split('\r\n')
    .filter((l) => l && !(l.startsWith('a=candidate') && / tcp /i.test(l)) && !l.startsWith('a=msid-semantic'))
    .map((l) => (l.startsWith('a=candidate') ? l.replace(/ generation \d+.*$/, '') : l))
    .join('\r\n') + '\r\n';
}

function b64url(bytes) {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function unb64url(str) {
  const s = atob(str.replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}
async function pipe(bytes, stream) {
  const out = new Blob([bytes]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(out).arrayBuffer());
}

export async function encodeSignal(k, sdp) {
  const raw = new TextEncoder().encode(k + slim(sdp));
  if (typeof CompressionStream === 'undefined') return '0' + b64url(raw);
  return '1' + b64url(await pipe(raw, new CompressionStream('deflate-raw')));
}

export async function decodeSignal(code) {
  code = code.trim();
  let bytes = unb64url(code.slice(1));
  if (code[0] === '1') bytes = await pipe(bytes, new DecompressionStream('deflate-raw'));
  const text = new TextDecoder().decode(bytes);
  return { k: text[0], sdp: text.slice(1) };
}

// ---- QR ----
export function drawQR(canvas, text) {
  const qr = window.qrcode(0, 'L');
  qr.addData(text);
  qr.make();
  const n = qr.getModuleCount();
  const scale = Math.max(3, Math.floor(600 / (n + 8)));
  const size = (n + 8) * scale;
  canvas.width = canvas.height = size;
  const g = canvas.getContext('2d');
  g.fillStyle = '#fff';
  g.fillRect(0, 0, size, size);
  g.fillStyle = '#000';
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
    if (qr.isDark(r, c)) g.fillRect((c + 4) * scale, (r + 4) * scale, scale, scale);
  }
}

export class Scanner {
  async start(video, onCode, stream = null) {
    this.stop();
    this.stream = stream || (await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment', width: { ideal: 1280 } }, audio: false,
    }));
    video.srcObject = this.stream;
    video.setAttribute('playsinline', '');
    video.muted = true;
    await video.play();
    const cv = document.createElement('canvas');
    const g = cv.getContext('2d', { willReadFrequently: true });
    this.running = true;
    let last = 0;
    const tick = (t) => {
      if (!this.running) return;
      if (t - last > 150 && video.videoWidth) {
        last = t;
        const w = Math.min(720, video.videoWidth);
        const h = Math.round((video.videoHeight * w) / video.videoWidth);
        cv.width = w;
        cv.height = h;
        g.drawImage(video, 0, 0, w, h);
        const res = window.jsQR(g.getImageData(0, 0, w, h).data, w, h, { inversionAttempts: 'dontInvert' });
        if (res && res.data) {
          this.running = false;
          onCode(res.data);
          return;
        }
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  stop() {
    this.running = false;
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
  }
}
