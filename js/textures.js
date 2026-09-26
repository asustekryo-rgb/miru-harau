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
// 壁・床用：2倍解像度のキャンバス（描画は論理サイズの座標で行う）
const RES = 2;
function cvHi(w, h) {
  const c = document.createElement('canvas');
  c.width = w * RES;
  c.height = h * RES;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.scale(RES, RES);
  return [c, g];
}

// 同じ模様が並んで見えないよう、1枚ごとに汚れ・ひび・色むらを変える
function finish(g, r, w, h, amt, seed) {
  // 全体の色むら
  const hue = [[40, 25, 10], [20, 25, 30], [30, 30, 10], [45, 10, 10]][seed % 4];
  g.fillStyle = `rgba(${hue[0]},${hue[1]},${hue[2]},${0.04 + r() * 0.08})`;
  g.fillRect(0, 0, w, h);
  // 大きな水染み・煤
  for (let i = 0; i < 2 + (seed % 3); i++) {
    const x = r() * w, y = r() * h, rad = 30 + r() * 70;
    const gr = g.createRadialGradient(x, y, rad * 0.2, x, y, rad);
    gr.addColorStop(0, `rgba(15,10,5,${0.12 + r() * 0.2})`);
    gr.addColorStop(0.8, `rgba(40,30,15,${0.05 + r() * 0.08})`);
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr;
    g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  // ひび割れ
  if (r() < 0.7) {
    g.strokeStyle = `rgba(10,6,4,${0.4 + r() * 0.3})`;
    g.lineWidth = 0.8;
    for (let k = 0; k < 1 + Math.floor(r() * 3); k++) {
      let x = r() * w, y = r() * h, a = r() * Math.PI * 2;
      g.beginPath();
      g.moveTo(x, y);
      for (let s = 0; s < 10; s++) {
        a += (r() - 0.5) * 1.1;
        x += Math.cos(a) * 7;
        y += Math.sin(a) * 7;
        g.lineTo(x, y);
      }
      g.stroke();
    }
  }
  // 細かな埃・点々
  for (let i = 0; i < 60; i++) {
    g.fillStyle = `rgba(${r() < 0.5 ? 0 : 200},${r() < 0.5 ? 0 : 190},${r() < 0.5 ? 0 : 170},${0.05 + r() * 0.1})`;
    g.fillRect(r() * w, r() * h, 0.6 + r() * 1.4, 0.6 + r() * 1.4);
  }
  grain(g, w, h, r, amt);
}

function toTex(c) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
function grain(g, w, h, r, amt) {
  // 高解像度キャンバスでも全体に掛かるよう、実際の画素数で処理する
  w = g.canvas.width;
  h = g.canvas.height;
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

export function woodFloor(seed = 0) {
  const [c, g] = cvHi(256, 256);
  const r = rng(11 + seed * 97);
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
  finish(g, r, 256, 256, 18, seed);
  return toTex(c);
}

export function tatami(seed = 0) {
  const [c, g] = cvHi(256, 256);
  const r = rng(21 + seed * 97);
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
  finish(g, r, 256, 256, 20, seed);
  return toTex(c);
}

export function stone(seed = 0) {
  const [c, g] = cvHi(256, 256);
  const r = rng(41 + seed * 97);
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
  finish(g, r, 256, 256, 26, seed);
  return toTex(c);
}

export function plaster(seed = 0) {
  const [c, g] = cvHi(256, 384);
  const r = rng(31 + seed * 97);
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
  finish(g, r, 256, 384, 22, seed);
  return toTex(c);
}

export function ceiling(seed = 0) {
  const [c, g] = cvHi(256, 256);
  const r = rng(51 + seed * 97);
  for (let i = 0; i < 6; i++) {
    const v = 0.8 + r() * 0.3;
    g.fillStyle = `rgb(${(48 * v) | 0},${(36 * v) | 0},${(28 * v) | 0})`;
    g.fillRect(i * 43, 0, 43, 256);
    g.fillStyle = 'rgba(0,0,0,0.6)';
    g.fillRect(i * 43, 0, 2, 256);
  }
  stains(g, 256, 256, r, 4, 'rgba(0,0,0,0.5)', 60);
  finish(g, r, 256, 256, 16, seed);
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

// 顔のパーツを描く（球のUV用と、ジャンプスケア用で共有）。s は拡大率
function drawFaceParts(g, r, cx, cy, s, boss) {
  // 腐った斑点と血管
  stains(g, g.canvas.width, g.canvas.height, r, 14, 'rgba(70,80,40,0.35)', 40 * s);
  stains(g, g.canvas.width, g.canvas.height, r, 10, 'rgba(60,30,60,0.35)', 30 * s);
  veins(g, r, cx - 40 * s, cy - 20 * s, 8, 70 * s, 'rgba(50,20,60,0.6)');
  veins(g, r, cx + 40 * s, cy - 20 * s, 8, 70 * s, 'rgba(50,20,60,0.6)');
  // 額の裂け目
  g.strokeStyle = 'rgba(40,0,0,0.95)';
  g.lineWidth = 4 * s;
  g.beginPath();
  g.moveTo(cx - 30 * s, cy - 60 * s);
  for (let i = 1; i <= 6; i++) g.lineTo(cx - 30 * s + i * 11 * s, cy - 60 * s + (r() - 0.5) * 10 * s - i * 2 * s);
  g.stroke();
  for (let i = 0; i < 4; i++) drip(g, r, cx - 20 * s + r() * 45 * s, cy - 58 * s, (30 + r() * 50) * s, 3 * s, 'rgba(110,0,0,0.9)');
  // 眼窩（落ちくぼんだ黒い穴から血の涙）
  const eyes = boss ? [[-34, -12], [34, -12], [-16, -40], [16, -40]] : [[-22, 0], [22, 0]];
  for (const [ex, ey] of eyes) {
    const x = cx + ex * s, y = cy + ey * s;
    const gr = g.createRadialGradient(x, y, 1, x, y, 26 * s);
    gr.addColorStop(0, '#000');
    gr.addColorStop(0.5, 'rgba(8,0,0,0.97)');
    gr.addColorStop(0.75, 'rgba(70,10,20,0.6)');
    gr.addColorStop(1, 'rgba(40,10,20,0)');
    g.fillStyle = gr;
    g.fillRect(x - 28 * s, y - 28 * s, 56 * s, 56 * s);
    for (let k = 0; k < 2; k++) drip(g, r, x + (r() - 0.5) * 10 * s, y + 10 * s, (50 + r() * 70) * s, 4 * s, 'rgba(120,0,0,0.92)');
  }
  // 耳まで裂けて縫われた口
  const my = cy + 50 * s, mw = (boss ? 44 : 26) * s;
  g.fillStyle = '#040000';
  g.beginPath();
  g.ellipse(cx, my, mw, (boss ? 26 : 18) * s, 0, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = 'rgba(70,0,0,0.95)';
  g.lineWidth = 4 * s;
  for (const side of [-1, 1]) {
    g.beginPath();
    g.moveTo(cx + side * mw, my);
    g.quadraticCurveTo(cx + side * (mw + 30 * s), my - 4 * s, cx + side * (mw + 52 * s), my - 30 * s);
    g.stroke();
    g.strokeStyle = 'rgba(20,10,10,0.9)';
    g.lineWidth = 1.5 * s;
    for (let k = 0; k < 5; k++) {
      const t = (k + 1) / 6;
      const x = cx + side * (mw + 52 * s * t), y = my - 30 * s * t * t;
      g.beginPath();
      g.moveTo(x - 4 * s, y - 5 * s);
      g.lineTo(x + 4 * s, y + 5 * s);
      g.stroke();
    }
    g.strokeStyle = 'rgba(70,0,0,0.95)';
    g.lineWidth = 4 * s;
  }
  // 不揃いな歯
  const n = boss ? 14 : 9;
  const top = my - (boss ? 22 : 15) * s, bot = my + (boss ? 22 : 15) * s;
  const tooth = (x, y, dir) => {
    const w = (2 + r() * 2.5) * s, h = (6 + r() * 9) * s;
    g.fillStyle = r() < 0.3 ? '#6b5a3a' : '#b9a877';
    g.beginPath();
    g.moveTo(x - w, y);
    g.lineTo(x + w, y);
    g.lineTo(x + (r() - 0.5) * w, y + dir * h);
    g.closePath();
    g.fill();
  };
  for (let i = 0; i < n; i++) {
    const x = cx - mw * 0.8 + (i / (n - 1)) * mw * 1.6 + (r() - 0.5) * 3 * s;
    if (r() < 0.8) tooth(x, top, 1);
    if (r() < 0.6) tooth(x, bot, -1);
  }
  for (let i = 0; i < 6; i++) drip(g, r, cx - mw * 0.7 + r() * mw * 1.4, my + 12 * s, (30 + r() * 70) * s, 4 * s, 'rgba(120,0,0,0.95)');
}

// 球のUVに貼る顔。正面(-Z)は u=0.75 → x=384
export function ghostFace(boss = false) {
  const [c, g] = cv(512, 256);
  const r = rng(boss ? 97 : 91);
  g.fillStyle = boss ? '#857a6c' : '#b0b5a8';
  g.fillRect(0, 0, 512, 256);
  drawFaceParts(g, r, 384, 104, 1, boss);
  grain(g, 512, 256, r, 22);
  return toTex(c);
}

// 襲われた瞬間に画面いっぱいに出る顔
export function drawScare(canvas) {
  const g = canvas.getContext('2d');
  const w = canvas.width, h = canvas.height;
  const r = rng(Math.floor(Math.random() * 1000));
  g.fillStyle = '#000';
  g.fillRect(0, 0, w, h);
  const gr = g.createRadialGradient(w / 2, h * 0.48, 20, w / 2, h * 0.48, w * 0.42);
  gr.addColorStop(0, '#b8bcae');
  gr.addColorStop(0.7, '#6f7468');
  gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr;
  g.beginPath();
  g.ellipse(w / 2, h * 0.5, w * 0.3, h * 0.42, 0, 0, Math.PI * 2);
  g.fill();
  g.save();
  g.beginPath();
  g.ellipse(w / 2, h * 0.5, w * 0.3, h * 0.42, 0, 0, Math.PI * 2);
  g.clip();
  drawFaceParts(g, r, w / 2, h * 0.42, 2.6, false);
  g.restore();
  // 赤く光る瞳
  for (const ex of [-57, 57]) {
    const x = w / 2 + ex, y = h * 0.42;
    const e = g.createRadialGradient(x, y, 0, x, y, 14);
    e.addColorStop(0, '#fff0e0');
    e.addColorStop(0.3, '#ff2010');
    e.addColorStop(1, 'rgba(255,0,0,0)');
    g.fillStyle = e;
    g.fillRect(x - 14, y - 14, 28, 28);
  }
  // 顔に掛かる髪
  g.strokeStyle = 'rgba(5,5,8,0.85)';
  for (let i = 0; i < 160; i++) {
    const side = i % 2 ? 1 : -1;
    let x = w / 2 + side * (w * 0.08 + r() * w * 0.3), y = 0;
    g.lineWidth = 1 + r() * 3;
    g.beginPath();
    g.moveTo(x, y);
    for (let k = 0; k < 8; k++) {
      x += (r() - 0.5) * 18 + side * 3;
      y += h / 8;
      g.lineTo(x, y);
    }
    g.stroke();
  }
  grain(g, w, h, r, 40);
}

// 被弾時に画面の縁に付く血
export function bloodScreenURL() {
  const [c, g] = cv(640, 360);
  const r = rng(157);
  const splat = (x, y, s) => {
    g.fillStyle = `rgba(${90 + r() * 40},0,0,${0.7 + r() * 0.3})`;
    g.beginPath();
    for (let i = 0; i <= 20; i++) {
      const a = (i / 20) * Math.PI * 2, d = s * (0.6 + r() * 0.6);
      g.lineTo(x + Math.cos(a) * d, y + Math.sin(a) * d);
    }
    g.fill();
    for (let i = 0; i < 12; i++) {
      const a = r() * Math.PI * 2, d = s * (1 + r() * 1.5);
      g.beginPath();
      g.arc(x + Math.cos(a) * d, y + Math.sin(a) * d, 1 + r() * s * 0.15, 0, Math.PI * 2);
      g.fill();
    }
  };
  for (let i = 0; i < 26; i++) {
    const edge = i % 4;
    const x = edge === 0 ? r() * 60 : edge === 1 ? 580 + r() * 60 : r() * 640;
    const y = edge === 2 ? r() * 50 : edge === 3 ? 310 + r() * 50 : r() * 360;
    splat(x, y, 10 + r() * 30);
  }
  for (let i = 0; i < 14; i++) drip(g, r, r() * 640, 0, 40 + r() * 140, 4 + r() * 6, 'rgba(110,0,0,0.85)');
  return c.toDataURL();
}

// 髪の房（透明な背景に細い毛筋）
export function hairTex() {
  const [c, g] = cv(128, 512);
  const r = rng(163);
  for (let i = 0; i < 90; i++) {
    let x = r() * 128;
    g.strokeStyle = `rgba(${4 + r() * 10},${4 + r() * 8},${6 + r() * 10},${0.5 + r() * 0.5})`;
    g.lineWidth = 1 + r() * 2.5;
    g.beginPath();
    g.moveTo(x, 0);
    const len = 300 + r() * 212;
    for (let y = 0; y < len; y += 32) {
      x += (r() - 0.5) * 8;
      g.lineTo(x, y);
    }
    g.stroke();
  }
  const t = toTex(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
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

// ---------- 廃校・廃病院 ----------
function peel(g, r, w, h, n, color) {
  for (let i = 0; i < n; i++) {
    g.fillStyle = color;
    g.beginPath();
    const x = r() * w, y = r() * h;
    g.moveTo(x, y);
    for (let k = 0; k < 7; k++) g.lineTo(x + (r() - 0.5) * 40, y + (r() - 0.5) * 30);
    g.fill();
  }
}

// 壁をずり落ちた血の手形
function handprint(g, r, x, y, s, rot) {
  g.save();
  g.translate(x, y);
  g.rotate(rot);
  g.scale(s, s);
  g.fillStyle = 'rgba(95,0,0,0.85)';
  g.strokeStyle = 'rgba(95,0,0,0.85)';
  g.lineCap = 'round';
  // 手のひら
  g.beginPath();
  g.moveTo(-11, -6);
  g.quadraticCurveTo(-13, 12, -4, 16);
  g.lineTo(6, 16);
  g.quadraticCurveTo(13, 10, 12, -6);
  g.closePath();
  g.fill();
  // 指（親指は横へ）
  const fingers = [[-9, -8, -12, -30, 5], [-3, -9, -4, -36, 5], [3, -9, 4, -35, 5], [9, -7, 11, -29, 4.5], [12, 4, 24, -6, 5]];
  for (const [x0, y0, x1, y1, w] of fingers) {
    g.lineWidth = w;
    g.beginPath();
    g.moveTo(x0, y0);
    g.lineTo(x1, y1);
    g.stroke();
  }
  g.restore();
  // 下へ引きずった跡
  for (let k = 0; k < 4; k++) {
    const gx = x - 8 * s + k * 5 * s;
    const len = 40 + r() * 70;
    const gr = g.createLinearGradient(0, y + 10, 0, y + 10 + len);
    gr.addColorStop(0, 'rgba(95,0,0,0.7)');
    gr.addColorStop(1, 'rgba(95,0,0,0)');
    g.fillStyle = gr;
    g.fillRect(gx, y + 10, 3.5 * s, len);
  }
}

export function schoolWall(seed = 0) {
  const [c, g] = cvHi(256, 384);
  const r = rng(131 + seed * 97);
  g.fillStyle = '#9fae9a';
  g.fillRect(0, 0, 256, 384);
  stains(g, 256, 384, r, 16, 'rgba(60,70,50,0.3)', 60);
  peel(g, r, 256, 250, 8, 'rgba(160,150,130,0.9)');
  // 腰板
  g.fillStyle = '#5a3f28';
  g.fillRect(0, 250, 256, 134);
  for (let x = 0; x < 256; x += 32) {
    g.fillStyle = 'rgba(0,0,0,0.4)';
    g.fillRect(x, 250, 2, 134);
  }
  g.fillStyle = '#3a2818';
  g.fillRect(0, 244, 256, 8);
  finish(g, r, 256, 384, 22, seed);
  return toTex(c);
}

export function hospitalWall(seed = 0) {
  const [c, g] = cvHi(256, 384);
  const r = rng(137 + seed * 97);
  g.fillStyle = '#c9cfc9';
  g.fillRect(0, 0, 256, 384);
  // 下半分のタイル
  for (let y = 200; y < 384; y += 24) {
    for (let x = 0; x < 256; x += 24) {
      const v = 190 + r() * 25;
      g.fillStyle = `rgb(${v | 0},${(v + 5) | 0},${(v + 2) | 0})`;
      g.fillRect(x + 1, y + 1, 22, 22);
    }
  }
  g.fillStyle = 'rgba(40,50,40,0.5)';
  g.fillRect(0, 196, 256, 4);
  stains(g, 256, 384, r, 14, 'rgba(90,80,40,0.3)', 60);
  stains(g, 256, 384, r, 4, 'rgba(110,0,0,0.6)', 30);
  for (let i = 0; i < 8; i++) drip(g, r, r() * 256, 120 + r() * 160, 40 + r() * 120, 3, 'rgba(100,0,0,0.65)');
  peel(g, r, 256, 190, 6, 'rgba(120,120,100,0.6)');
  finish(g, r, 256, 384, 20, seed);
  return toTex(c);
}

export function tile(seed = 0) {
  const [c, g] = cvHi(256, 256);
  const r = rng(139 + seed * 97);
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      const v = (x + y) % 2 ? 150 + r() * 20 : 70 + r() * 15;
      g.fillStyle = `rgb(${v | 0},${v | 0},${(v * 0.95) | 0})`;
      g.fillRect(x * 32, y * 32, 32, 32);
    }
  }
  stains(g, 256, 256, r, 6, 'rgba(80,0,0,0.6)', 40);
  stains(g, 256, 256, r, 8, 'rgba(30,25,10,0.4)', 50);
  finish(g, r, 256, 256, 20, seed);
  return toTex(c);
}

export function lino(seed = 0) {
  const [c, g] = cvHi(256, 256);
  const r = rng(149 + seed * 97);
  g.fillStyle = '#6f7a6a';
  g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 400; i++) {
    g.fillStyle = `rgba(${r() < 0.5 ? 30 : 180},${r() < 0.5 ? 40 : 180},30,0.15)`;
    g.fillRect(r() * 256, r() * 256, 2, 2);
  }
  g.fillStyle = 'rgba(0,0,0,0.5)';
  g.fillRect(0, 0, 256, 2);
  g.fillRect(0, 0, 2, 256);
  stains(g, 256, 256, r, 8, 'rgba(20,20,10,0.4)', 50);
  finish(g, r, 256, 256, 18, seed);
  return toTex(c);
}

export function ceilingPanel(seed = 0) {
  const [c, g] = cvHi(256, 256);
  const r = rng(151 + seed * 97);
  g.fillStyle = '#6e6c66';
  g.fillRect(0, 0, 256, 256);
  g.fillStyle = 'rgba(0,0,0,0.5)';
  for (let i = 0; i <= 256; i += 64) { g.fillRect(i, 0, 3, 256); g.fillRect(0, i, 256, 3); }
  stains(g, 256, 256, r, 10, 'rgba(60,40,10,0.45)', 50);
  // 抜け落ちたパネル
  g.fillStyle = '#050505';
  g.fillRect(67, 131, 61, 61);
  finish(g, r, 256, 256, 18, seed);
  return toTex(c);
}

// ---------- 床・壁に散らす汚れや小物（透過テクスチャ） ----------
const JP = '"Yu Mincho","Hiragino Mincho ProN",serif';
function blob(g, r, x, y, rad, color, pts = 18) {
  g.fillStyle = color;
  g.beginPath();
  for (let i = 0; i <= pts; i++) {
    const a = (i / pts) * Math.PI * 2, d = rad * (0.65 + r() * 0.5);
    g.lineTo(x + Math.cos(a) * d, y + Math.sin(a) * d);
  }
  g.fill();
}
// 手書き風の文字（1文字ずつ揺らす）
function scrawl(g, r, text, x, y, size, color, rotJitter = 0.25) {
  g.fillStyle = color;
  g.font = `bold ${size}px ${JP}`;
  g.textBaseline = 'middle';
  let cx = x;
  for (const ch of text) {
    g.save();
    g.translate(cx, y + (r() - 0.5) * size * 0.3);
    g.rotate((r() - 0.5) * rotJitter);
    g.fillText(ch, 0, 0);
    g.restore();
    cx += size * (0.85 + r() * 0.3);
  }
}

export const DECALS = {
  dirt(seed) {
    const [c, g] = cvHi(128, 128);
    const r = rng(201 + seed * 31);
    for (let i = 0; i < 5; i++) blob(g, r, 40 + r() * 48, 40 + r() * 48, 18 + r() * 22, `rgba(${20 + r() * 20},${15 + r() * 10},5,${0.25 + r() * 0.3})`);
    for (let i = 0; i < 80; i++) {
      g.fillStyle = `rgba(30,20,10,${r() * 0.5})`;
      g.fillRect(10 + r() * 108, 10 + r() * 108, 1 + r() * 2, 1 + r() * 2);
    }
    return toTex(c);
  },
  debris(seed) {
    const [c, g] = cvHi(128, 128);
    const r = rng(211 + seed * 31);
    blob(g, r, 64, 64, 40, 'rgba(25,18,10,0.35)');
    for (let i = 0; i < 26; i++) {
      g.save();
      g.translate(20 + r() * 88, 20 + r() * 88);
      g.rotate(r() * Math.PI);
      const v = 60 + r() * 90;
      g.fillStyle = r() < 0.5 ? `rgb(${v},${v * 0.8},${v * 0.6})` : `rgb(${v},${v},${v * 0.95})`;
      g.fillRect(-1 - r() * 5, -1 - r() * 2, 2 + r() * 10, 2 + r() * 4);
      g.restore();
    }
    return toTex(c);
  },
  papers(seed) {
    const [c, g] = cvHi(128, 128);
    const r = rng(221 + seed * 31);
    for (let i = 0; i < 3; i++) {
      g.save();
      g.translate(30 + r() * 68, 30 + r() * 68);
      g.rotate(r() * Math.PI);
      g.fillStyle = `rgba(${200 + r() * 30},${190 + r() * 25},${160 + r() * 20},0.92)`;
      g.fillRect(-20, -27, 40, 54);
      g.fillStyle = 'rgba(40,40,40,0.5)';
      for (let l = 0; l < 7; l++) g.fillRect(-15, -20 + l * 6, 22 + r() * 8, 1.2);
      if (r() < 0.5) blob(g, r, (r() - 0.5) * 20, (r() - 0.5) * 30, 7 + r() * 8, 'rgba(90,0,0,0.75)');
      g.restore();
    }
    return toTex(c);
  },
  puddle(seed) {
    const [c, g] = cvHi(128, 128);
    const r = rng(231 + seed * 31);
    blob(g, r, 64, 64, 48, 'rgba(8,10,12,0.75)', 26);
    const gr = g.createLinearGradient(30, 30, 100, 100);
    gr.addColorStop(0, 'rgba(160,180,200,0.25)');
    gr.addColorStop(0.5, 'rgba(0,0,0,0)');
    blob(g, r, 60, 58, 38, gr, 22);
    return toTex(c);
  },
  bloodPool(seed) {
    const [c, g] = cvHi(128, 128);
    const r = rng(241 + seed * 31);
    blob(g, r, 64, 64, 42, 'rgba(60,0,0,0.9)', 24);
    blob(g, r, 60, 60, 26, 'rgba(35,0,0,0.9)');
    for (let i = 0; i < 16; i++) {
      const a = r() * Math.PI * 2, d = 44 + r() * 16;
      blob(g, r, 64 + Math.cos(a) * d, 64 + Math.sin(a) * d, 2 + r() * 5, 'rgba(70,0,0,0.85)', 8);
    }
    return toTex(c);
  },
  footprints(seed) {
    const [c, g] = cvHi(128, 256);
    const r = rng(251 + seed * 31);
    for (let i = 0; i < 6; i++) {
      const x = 64 + (i % 2 ? 14 : -14) + (r() - 0.5) * 6, y = 230 - i * 38;
      const a = 0.15 * (i % 2 ? 1 : -1) + (r() - 0.5) * 0.2, al = 0.85 - i * 0.12;
      g.save();
      g.translate(x, y);
      g.rotate(a);
      g.fillStyle = `rgba(80,0,0,${al})`;
      g.beginPath(); g.ellipse(0, 0, 6, 11, 0, 0, Math.PI * 2); g.fill();
      g.beginPath(); g.ellipse(0, 12, 5, 5, 0, 0, Math.PI * 2); g.fill();
      for (let t = 0; t < 5; t++) {
        g.beginPath(); g.arc(-5 + t * 2.6, -13 - (t === 0 ? 1 : 0), 1.6, 0, Math.PI * 2); g.fill();
      }
      g.restore();
    }
    return toTex(c);
  },
  drag(seed) {
    const [c, g] = cvHi(128, 256);
    const r = rng(261 + seed * 31);
    for (let k = 0; k < 5; k++) {
      const x = 44 + k * 9 + (r() - 0.5) * 4;
      const gr = g.createLinearGradient(0, 250, 0, 10);
      gr.addColorStop(0, 'rgba(80,0,0,0.85)');
      gr.addColorStop(1, 'rgba(80,0,0,0)');
      g.fillStyle = gr;
      g.beginPath();
      g.moveTo(x, 250);
      for (let y = 250; y > 10; y -= 20) g.lineTo(x + Math.sin(y * 0.03 + k) * 4, y);
      g.lineTo(x + 4 + r() * 3, 10);
      g.lineTo(x + 5, 250);
      g.fill();
    }
    blob(g, r, 64, 236, 22, 'rgba(60,0,0,0.9)');
    return toTex(c);
  },
  // --- 壁用 ---
  mold(seed) {
    const [c, g] = cvHi(128, 192);
    const r = rng(271 + seed * 31);
    for (let i = 0; i < 40; i++) blob(g, r, 20 + r() * 88, 110 + r() * 80 - i * 0.8, 4 + r() * 14, `rgba(${15 + r() * 20},${25 + r() * 20},${10 + r() * 10},${0.25 + r() * 0.35})`, 10);
    return toTex(c);
  },
  streak(seed) {
    const [c, g] = cvHi(128, 192);
    const r = rng(281 + seed * 31);
    for (let i = 0; i < 7; i++) drip(g, r, 20 + r() * 88, 0, 60 + r() * 130, 3 + r() * 6, `rgba(${30 + r() * 30},${20 + r() * 15},10,${0.35 + r() * 0.3})`);
    return toTex(c);
  },
  scratches(seed) {
    const [c, g] = cvHi(128, 128);
    const r = rng(291 + seed * 31);
    for (let s = 0; s < 2; s++) {
      const x0 = 20 + r() * 60, y0 = 15 + r() * 20;
      for (let k = 0; k < 4; k++) {
        g.strokeStyle = `rgba(20,10,8,${0.7 + r() * 0.3})`;
        g.lineWidth = 1.8;
        g.beginPath();
        g.moveTo(x0 + k * 7, y0 + k * 2);
        g.quadraticCurveTo(x0 + k * 7 + 14, y0 + 50, x0 + k * 7 + 6 + r() * 6, y0 + 90 + r() * 15);
        g.stroke();
        g.strokeStyle = 'rgba(200,190,170,0.25)';
        g.lineWidth = 0.7;
        g.stroke();
      }
    }
    return toTex(c);
  },
  hands(seed) {
    const [c, g] = cvHi(128, 160);
    const r = rng(341 + seed * 31);
    for (let i = 0; i < 1 + (seed % 3); i++) handprint(g, r, 30 + r() * 70, 40 + r() * 50, 0.8 + r() * 0.3, (r() - 0.5) * 0.7);
    return toTex(c);
  },
  writing(seed) {
    const [c, g] = cvHi(256, 128);
    const r = rng(301 + seed * 31);
    const words = ['たすけて', 'ここにいる', 'みている', 'かえして', 'ゆるさない', 'でられない'];
    const w = words[seed % words.length];
    for (let i = 0; i < 3; i++) scrawl(g, r, w, 8 + r() * 20, 22 + i * 38, 26 - i * 3, `rgba(${90 + r() * 30},0,0,${0.85 - i * 0.2})`);
    for (let i = 0; i < 5; i++) drip(g, r, 20 + r() * 220, 30 + r() * 60, 20 + r() * 40, 2, 'rgba(90,0,0,0.7)');
    return toTex(c);
  },
  scroll(seed) {
    const [c, g] = cvHi(96, 256);
    const r = rng(311 + seed * 31);
    g.fillStyle = '#3b2a1a'; g.fillRect(0, 0, 96, 256);
    g.fillStyle = '#d8ccae'; g.fillRect(10, 18, 76, 222);
    g.fillStyle = '#2a1a10'; g.fillRect(0, 0, 96, 8); g.fillRect(0, 246, 96, 10);
    // 墨で描かれた幽霊画
    g.strokeStyle = 'rgba(20,15,10,0.8)';
    g.lineWidth = 1.5;
    g.beginPath();
    g.moveTo(48, 70); g.quadraticCurveTo(30, 140, 40, 220);
    g.moveTo(52, 70); g.quadraticCurveTo(70, 150, 58, 222);
    g.stroke();
    g.fillStyle = 'rgba(15,10,8,0.85)';
    g.beginPath(); g.ellipse(50, 60, 9, 12, 0, 0, Math.PI * 2); g.fill();
    for (let i = 0; i < 30; i++) g.fillRect(40 + r() * 20, 58 + r() * 4, 0.8, 30 + r() * 60);
    g.fillStyle = 'rgba(200,190,170,1)';
    g.beginPath(); g.ellipse(52, 64, 4, 6, 0, 0, Math.PI * 2); g.fill();
    stains(g, 96, 256, r, 5, 'rgba(80,50,20,0.35)', 30);
    if (seed % 2) blob(g, r, 50, 150, 14, 'rgba(90,0,0,0.6)');
    return toTex(c);
  },
  chalkboard(seed) {
    const [c, g] = cvHi(512, 170);
    const r = rng(321 + seed * 31);
    g.fillStyle = '#4a3522'; g.fillRect(0, 0, 512, 170);
    g.fillStyle = '#1f3326'; g.fillRect(8, 8, 496, 146);
    stains(g, 512, 170, r, 12, 'rgba(160,170,160,0.12)', 60);
    g.fillStyle = '#6a5038'; g.fillRect(0, 154, 512, 16);
    const lines = [['たすけて たすけて たすけて', 22], ['みんなどこ？', 18], ['せんせいが みてる', 20], ['ここからでられない', 18]];
    let y = 34;
    for (const [t, s] of lines) {
      if (r() < 0.85) scrawl(g, r, t, 30 + r() * 150, y, s, `rgba(230,230,220,${0.55 + r() * 0.3})`, 0.3);
      y += 32;
    }
    g.strokeStyle = 'rgba(220,220,210,0.5)';
    g.lineWidth = 2;
    for (let i = 0; i < 4; i++) {
      g.beginPath(); g.moveTo(r() * 500, r() * 150); g.lineTo(r() * 500, r() * 150); g.stroke();
    }
    return toTex(c);
  },
  notice(seed) {
    const [c, g] = cvHi(96, 128);
    const r = rng(331 + seed * 31);
    g.fillStyle = `rgba(${210 + r() * 20},${205 + r() * 20},${180 + r() * 20},0.95)`;
    g.fillRect(4, 4, 88, 120);
    const titles = ['お知らせ', '面会謝絶', '立入禁止', '安静に', '点呼'];
    g.fillStyle = 'rgba(30,30,30,0.85)';
    g.font = `bold 15px ${JP}`;
    g.textAlign = 'center';
    g.fillText(titles[seed % titles.length], 48, 24);
    g.fillStyle = 'rgba(40,40,40,0.5)';
    for (let l = 0; l < 9; l++) g.fillRect(14, 38 + l * 9, 55 + r() * 15, 1.3);
    stains(g, 96, 128, r, 4, 'rgba(90,70,30,0.4)', 25);
    if (r() < 0.6) drip(g, r, 20 + r() * 50, 30, 40 + r() * 50, 3, 'rgba(90,0,0,0.75)');
    g.fillStyle = '#888';
    g.beginPath(); g.arc(48, 8, 3, 0, Math.PI * 2); g.fill();
    return toTex(c);
  },
};
