// Canvasで描く手続き的テクスチャ（外部アセットなし）
import * as THREE from 'three';

export function rng(seed = 1) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function cv(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d', { willReadFrequently: true })];
}
function toTex(c) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
function grain(g, w, h, r, amt) {
  const im = g.getImageData(0, 0, w, h);
  const d = im.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (r() - 0.5) * amt;
    d[i] += n; d[i + 1] += n; d[i + 2] += n;
  }
  g.putImageData(im, 0, 0);
}
function stains(g, w, h, r, n, color, maxR) {
  for (let i = 0; i < n; i++) {
    const x = r() * w, y = r() * h, rad = maxR * (0.3 + r() * 0.7);
    const gr = g.createRadialGradient(x, y, 0, x, y, rad);
    gr.addColorStop(0, color);
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr;
    g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
}

export function woodFloor() {
  const [c, g] = cv(256, 256);
  const r = rng(11);
  const n = 5, ph = 256 / n;
  for (let i = 0; i < n; i++) {
    const v = 0.8 + r() * 0.35;
    g.fillStyle = `rgb(${(92 * v) | 0},${(66 * v) | 0},${(44 * v) | 0})`;
    g.fillRect(0, i * ph, 256, ph);
    for (let k = 0; k < 14; k++) {
      g.strokeStyle = `rgba(25,14,6,${0.15 + r() * 0.25})`;
      g.lineWidth = 1;
      g.beginPath();
      const y = i * ph + r() * ph;
      g.moveTo(0, y);
      g.bezierCurveTo(80, y + (r() - 0.5) * 6, 170, y + (r() - 0.5) * 6, 256, y + (r() - 0.5) * 4);
      g.stroke();
    }
    g.fillStyle = 'rgba(0,0,0,0.7)';
    g.fillRect(0, i * ph, 256, 2);
    g.fillRect(r() * 256, i * ph, 2, ph);
  }
  stains(g, 256, 256, r, 5, 'rgba(10,5,0,0.35)', 40);
  grain(g, 256, 256, r, 18);
  return toTex(c);
}

export function tatami() {
  const [c, g] = cv(256, 256);
  const r = rng(21);
  g.fillStyle = '#8d8a58';
  g.fillRect(0, 0, 256, 256);
  for (let x = 0; x < 256; x += 3) {
    g.fillStyle = `rgba(${r() < 0.5 ? 50 : 130},${r() < 0.5 ? 50 : 120},25,${0.12 + r() * 0.12})`;
    g.fillRect(x, 0, 1.5, 256);
  }
  g.fillStyle = '#1b1f16';
  g.fillRect(0, 0, 256, 14);
  g.fillRect(0, 242, 256, 14);
  stains(g, 256, 256, r, 5, 'rgba(40,25,0,0.4)', 55);
  grain(g, 256, 256, r, 20);
  return toTex(c);
}

export function stone() {
  const [c, g] = cv(256, 256);
  const r = rng(41);
  g.fillStyle = '#1c1b1a';
  g.fillRect(0, 0, 256, 256);
  for (let y = 0; y < 4; y++) {
    for (let x = 0; x < 4; x++) {
      const v = 70 + r() * 25;
      g.fillStyle = `rgb(${v | 0},${(v * 0.96) | 0},${(v * 0.92) | 0})`;
      g.fillRect(x * 64 + 2 + r() * 2, y * 64 + 2 + r() * 2, 60 - r() * 3, 60 - r() * 3);
    }
  }
  stains(g, 256, 256, r, 6, 'rgba(0,0,0,0.35)', 50);
  grain(g, 256, 256, r, 26);
  return toTex(c);
}

export function plaster() {
  const [c, g] = cv(256, 384);
  const r = rng(31);
  g.fillStyle = '#a0937a';
  g.fillRect(0, 0, 256, 384);
  stains(g, 256, 384, r, 18, 'rgba(60,50,35,0.25)', 70);
  for (let i = 0; i < 10; i++) {
    const x = r() * 256, len = 60 + r() * 220;
    const gr = g.createLinearGradient(0, 0, 0, len);
    gr.addColorStop(0, 'rgba(40,30,20,0.4)');
    gr.addColorStop(1, 'rgba(40,30,20,0)');
    g.fillStyle = gr;
    g.fillRect(x, 0, 2 + r() * 5, len);
  }
  g.fillStyle = '#2d2016';
  g.fillRect(0, 0, 14, 384);
  g.fillRect(242, 0, 14, 384);
  g.fillRect(0, 96, 256, 12);
  g.fillRect(0, 364, 256, 20);
  grain(g, 256, 384, r, 22);
  return toTex(c);
}

export function ceiling() {
  const [c, g] = cv(256, 256);
  const r = rng(51);
  for (let i = 0; i < 6; i++) {
    const v = 0.8 + r() * 0.3;
    g.fillStyle = `rgb(${(48 * v) | 0},${(36 * v) | 0},${(28 * v) | 0})`;
    g.fillRect(i * 43, 0, 43, 256);
    g.fillStyle = 'rgba(0,0,0,0.6)';
    g.fillRect(i * 43, 0, 2, 256);
  }
  stains(g, 256, 256, r, 4, 'rgba(0,0,0,0.5)', 60);
  grain(g, 256, 256, r, 16);
  return toTex(c);
}

function paper(g, x, y, w, h, ch, r) {
  g.fillStyle = '#e9dfc4';
  g.fillRect(x, y, w, h);
  g.strokeStyle = '#a3121a';
  g.lineWidth = Math.max(2, w * 0.05);
  g.strokeRect(x + w * 0.1, y + w * 0.1, w * 0.8, h - w * 0.2);
  g.fillStyle = '#a3121a';
  g.font = `bold ${w * 0.62}px "Yu Mincho","Hiragino Mincho ProN",serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(ch, x + w / 2, y + h * 0.33);
  g.strokeStyle = '#111';
  g.lineWidth = Math.max(1, w * 0.03);
  for (let i = 0; i < 5; i++) {
    const yy = y + h * (0.55 + i * 0.07);
    g.beginPath();
    g.moveTo(x + w * (0.3 + r() * 0.1), yy);
    g.lineTo(x + w * (0.6 + r() * 0.1), yy + (r() - 0.5) * 6);
    g.stroke();
  }
}

export function sealTex() {
  const [c, g] = cv(256, 320);
  const r = rng(61);
  g.fillStyle = '#2a1a10';
  g.fillRect(0, 0, 256, 320);
  for (let i = 0; i < 8; i++) {
    g.fillStyle = 'rgba(0,0,0,0.35)';
    g.fillRect(i * 32, 0, 2, 320);
  }
  g.save();
  g.translate(128, 160);
  for (const a of [0.6, -0.6]) {
    g.save();
    g.rotate(a);
    g.fillStyle = '#d8cda8';
    g.fillRect(-190, -14, 380, 28);
    g.restore();
  }
  g.restore();
  paper(g, 78, 60, 100, 200, '封', r);
  grain(g, 256, 320, r, 14);
  return toTex(c);
}

export function ofuda(ch = '護') {
  const [c, g] = cv(64, 160);
  paper(g, 0, 0, 64, 160, ch, rng(71));
  return toTex(c);
}

export function doorTex() {
  const [c, g] = cv(512, 280);
  const r = rng(81);
  g.fillStyle = '#b8ad90';
  g.fillRect(0, 0, 512, 280);
  stains(g, 512, 280, r, 12, 'rgba(70,50,30,0.35)', 60);
  g.fillStyle = '#2a1c12';
  for (let x = 0; x <= 512; x += 64) g.fillRect(x - 3, 0, 6, 280);
  for (let y = 0; y <= 280; y += 46) g.fillRect(0, y - 3, 512, 6);
  g.fillRect(0, 0, 512, 12);
  g.fillRect(0, 268, 512, 12);
  g.fillRect(250, 0, 12, 280);
  // 破れた障子紙
  for (let i = 0; i < 6; i++) {
    g.fillStyle = 'rgba(10,6,4,0.85)';
    g.beginPath();
    const x = r() * 480 + 16, y = r() * 240 + 20;
    g.moveTo(x, y);
    for (let k = 0; k < 5; k++) g.lineTo(x + (r() - 0.5) * 40, y + (r() - 0.5) * 30);
    g.fill();
  }
  grain(g, 512, 280, r, 16);
  return toTex(c);
}

export function glyph(ch, color) {
  const [c, g] = cv(128, 128);
  g.font = 'bold 84px "Yu Mincho","Hiragino Mincho ProN",serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.shadowColor = color;
  g.shadowBlur = 18;
  g.fillStyle = color;
  g.fillText(ch, 64, 68);
  g.fillText(ch, 64, 68);
  return toTex(c);
}

export function flame() {
  const [c, g] = cv(64, 64);
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,240,200,1)');
  gr.addColorStop(0.3, 'rgba(255,160,60,0.8)');
  gr.addColorStop(1, 'rgba(255,80,0,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 64, 64);
  return toTex(c);
}
