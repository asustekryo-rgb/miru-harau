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

// ---------- 霊のテクスチャ ----------
function drip(g, r, x, y, len, w, color) {
  g.fillStyle = color;
  g.beginPath();
  g.moveTo(x - w / 2, y);
  let yy = y;
  const steps = 6;
  for (let i = 0; i < steps; i++) {
    yy += len / steps;
    g.lineTo(x - w / 2 + (r() - 0.5) * 2, yy);
  }
  g.arc(x, yy, w * 0.8, Math.PI, 0, true);
  for (let i = steps; i > 0; i--) g.lineTo(x + w / 2 + (r() - 0.5) * 2, y + (len / steps) * i);
  g.closePath();
  g.fill();
}
function veins(g, r, x, y, n, len, color) {
  g.strokeStyle = color;
  for (let i = 0; i < n; i++) {
    let px = x, py = y, a = r() * Math.PI * 2;
    g.lineWidth = 1 + r() * 1.5;
    g.beginPath();
    g.moveTo(px, py);
    for (let k = 0; k < 6; k++) {
      a += (r() - 0.5) * 1.2;
      px += Math.cos(a) * len / 6;
      py += Math.sin(a) * len / 6;
      g.lineTo(px, py);
    }
    g.stroke();
  }
}

// 球のUVに貼る顔。正面(-Z)は u=0.75 → x=192
export function ghostFace(boss = false) {
  const [c, g] = cv(256, 128);
  const r = rng(boss ? 97 : 91);
  g.fillStyle = boss ? '#8f8478' : '#b8bcb2';
  g.fillRect(0, 0, 256, 128);
  stains(g, 256, 128, r, 10, 'rgba(70,60,80,0.35)', 30);
  veins(g, r, 170, 40, 6, 40, 'rgba(60,40,70,0.55)');
  veins(g, r, 214, 45, 6, 40, 'rgba(60,40,70,0.55)');
  const eyes = boss ? [[176, 52], [208, 52], [184, 38], [200, 38]] : [[181, 56], [203, 56]];
  for (const [x, y] of eyes) {
    const gr = g.createRadialGradient(x, y, 1, x, y, 13);
    gr.addColorStop(0, '#000');
    gr.addColorStop(0.55, 'rgba(10,0,0,0.95)');
    gr.addColorStop(1, 'rgba(40,10,20,0)');
    g.fillStyle = gr;
    g.fillRect(x - 14, y - 14, 28, 28);
    drip(g, r, x + (r() - 0.5) * 3, y + 5, 25 + r() * 25, 3, 'rgba(110,0,0,0.9)');
  }
  // 裂けた口
  g.fillStyle = '#050000';
  g.beginPath();
  g.ellipse(192, 84, boss ? 22 : 13, boss ? 14 : 10, 0, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#c9c1a6';
  for (let i = 0; i < 8; i++) {
    const x = 192 - (boss ? 18 : 10) + i * (boss ? 5 : 3);
    g.fillRect(x, 76 + (r() < 0.5 ? 0 : 1), 2, 4 + r() * 3);
  }
  g.strokeStyle = 'rgba(90,0,0,0.9)';
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(178, 84); g.lineTo(158, 78);
  g.moveTo(206, 84); g.lineTo(226, 78);
  g.stroke();
  for (let i = 0; i < 4; i++) drip(g, r, 182 + r() * 20, 90, 15 + r() * 25, 3, 'rgba(120,0,0,0.9)');
  grain(g, 256, 128, r, 20);
  return toTex(c);
}

export function ghostRobe(boss = false) {
  const [c, g] = cv(256, 256);
  const r = rng(boss ? 101 : 103);
  g.fillStyle = boss ? '#3a1414' : '#cfc8b6';
  g.fillRect(0, 0, 256, 256);
  // 布のひだ
  for (let x = 0; x < 256; x += 10 + r() * 14) {
    g.fillStyle = `rgba(0,0,0,${0.06 + r() * 0.12})`;
    g.fillRect(x, 0, 3 + r() * 5, 256);
  }
  // 襟（左前＝死装束）
  g.strokeStyle = 'rgba(40,30,20,0.6)';
  g.lineWidth = 5;
  g.beginPath();
  g.moveTo(80, 0); g.lineTo(150, 110);
  g.moveTo(176, 0); g.lineTo(130, 70);
  g.stroke();
  stains(g, 256, 256, r, 6, 'rgba(90,0,0,0.85)', 45);
  stains(g, 256, 256, r, 10, 'rgba(60,0,0,0.6)', 25);
  for (let i = 0; i < 16; i++) drip(g, r, r() * 256, 40 + r() * 120, 40 + r() * 90, 3 + r() * 4, 'rgba(100,0,0,0.85)');
  // 裾の汚れ
  const gr = g.createLinearGradient(0, 180, 0, 256);
  gr.addColorStop(0, 'rgba(30,20,10,0)');
  gr.addColorStop(1, 'rgba(30,15,10,0.9)');
  g.fillStyle = gr;
  g.fillRect(0, 180, 256, 76);
  grain(g, 256, 256, r, 24);
  return toTex(c);
}

export function ghostSkin(boss = false) {
  const [c, g] = cv(128, 128);
  const r = rng(boss ? 107 : 109);
  g.fillStyle = boss ? '#8f8478' : '#aeb3a9';
  g.fillRect(0, 0, 128, 128);
  stains(g, 128, 128, r, 8, 'rgba(60,40,80,0.45)', 20);
  veins(g, r, 64, 64, 10, 60, 'rgba(50,30,60,0.5)');
  stains(g, 128, 128, r, 4, 'rgba(100,0,0,0.7)', 14);
  grain(g, 128, 128, r, 18);
  return toTex(c);
}

export function bloodTex() {
  const [c, g] = cv(128, 128);
  const r = rng(113);
  g.fillStyle = 'rgba(70,0,0,0.92)';
  g.beginPath();
  for (let i = 0; i <= 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    const rad = 26 + r() * 16;
    g.lineTo(64 + Math.cos(a) * rad, 64 + Math.sin(a) * rad);
  }
  g.fill();
  for (let i = 0; i < 18; i++) {
    const a = r() * Math.PI * 2, d = 40 + r() * 20;
    g.beginPath();
    g.arc(64 + Math.cos(a) * d, 64 + Math.sin(a) * d, 2 + r() * 5, 0, Math.PI * 2);
    g.fill();
  }
  g.fillStyle = 'rgba(30,0,0,0.5)';
  g.beginPath();
  g.arc(60, 60, 18, 0, Math.PI * 2);
  g.fill();
  return toTex(c);
}
