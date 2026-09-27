// 画面遷移・接続フロー・メインループ
import * as THREE from 'three';
import { Game, ROLE_NAME } from './game.js';
import { RtcTransport, LocalTransport, drawQR, Scanner } from './net.js';
import { Sfx } from './audio.js';
import { Input } from './input.js';
import { STAGES } from './map.js';
import { loadGhostModel } from './ghostmodel.js';

const $ = (id) => document.getElementById(id);
const renderer = new THREE.WebGLRenderer({ canvas: $('gl'), antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
// 明るすぎる所を白飛びさせずに丸める
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.3;
const sfx = new Sfx();
const input = new Input($('touch'));
const scanner = new Scanner();

let net = null;
let isHost = false;
let solo = false;
let myRole = 'seer';
let stage = 0;
let quality = 'high';
try { quality = localStorage.getItem('mh-quality') || 'high'; } catch { /* 保存不可 */ }
let game = null;
let camStream = null;
let wakeLock = null;

function show(id) {
  document.querySelectorAll('.screen').forEach((s) => s.classList.toggle('active', s.id === id));
  $('screens').hidden = !id;
}

function leave() {
  scanner.stop();
  camStream?.getTracks().forEach((t) => t.stop());
  camStream = null;
  if (net) {
    net.onclose = null;
    net.close();
    net = null;
  }
  stopGame();
  $('netlost').hidden = true;
  show('s-title');
}

function stopGame() {
  if (!game) return;
  game.dispose();
  game = null;
  $('hud').hidden = true;
  document.body.classList.remove('playing');
  wakeLock?.release?.().catch(() => {});
  wakeLock = null;
}

// ---------- タイトル ----------
$('btn-host').onclick = () => { sfx.init(); startHost(); };
$('btn-join').onclick = () => { sfx.init(); startJoin(); };
$('btn-help').onclick = () => show('s-help');
$('btn-solo').onclick = () => { $('solo-pick').hidden = !$('solo-pick').hidden; $('local-pick').hidden = true; };
$('btn-local').onclick = () => { $('local-pick').hidden = !$('local-pick').hidden; $('solo-pick').hidden = true; };
document.querySelectorAll('[data-solo]').forEach((b) => {
  b.onclick = () => {
    sfx.init();
    solo = true;
    isHost = true;
    myRole = b.dataset.solo;
    startGame();
  };
});
document.querySelectorAll('[data-local]').forEach((b) => {
  b.onclick = () => {
    sfx.init();
    solo = false;
    isHost = b.dataset.local === 'host';
    myRole = 'seer';
    net = new LocalTransport(isHost);
    wireNet();
    $('local-status').textContent = isHost ? 'もう一つのタブで「参加」を押してください…' : 'ホストのタブを探しています…';
  };
});
document.querySelectorAll('.back').forEach((b) => { b.onclick = leave; });

// ---------- ホスト接続 ----------
async function startHost() {
  solo = false;
  isHost = true;
  show('s-host');
  const st = $('host-status');
  $('host-scan').disabled = true;
  $('host-qr').getContext('2d').clearRect(0, 0, 9999, 9999);
  st.textContent = 'カメラの許可を確認中…（相手のQRを読むのに使います）';
  // カメラ許可があると端末のローカルIPが候補に含まれ、同じWi-Fiでつながりやすくなる
  try {
    camStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
  } catch {
    camStream = null;
  }
  st.textContent = '接続コードを作成中…';
  net = new RtcTransport(true);
  wireNet();
  try {
    const code = await net.createOffer();
    drawQR($('host-qr'), code);
    $('host-code').value = code;
    st.textContent = '① 相手にこのQRを読み取ってもらう → ② 下のボタンで相手のQRを読む';
    $('host-scan').disabled = false;
  } catch (e) {
    st.textContent = '作成に失敗しました：' + e.message;
  }
}

$('host-scan').onclick = async () => {
  $('host-scanbox').hidden = false;
  try {
    await scanner.start($('host-video'), (code) => acceptAnswer(code), camStream);
    camStream = null;
  } catch (e) {
    $('host-status').textContent = 'カメラを使えません：' + e.message;
    $('host-scanbox').hidden = true;
  }
};
$('host-answer-go').onclick = () => acceptAnswer($('host-answer').value);
$('host-copy').onclick = () => copy($('host-code'));

async function acceptAnswer(code) {
  scanner.stop();
  $('host-scanbox').hidden = true;
  const st = $('host-status');
  try {
    await net.acceptAnswer(code);
    st.textContent = '接続中…';
  } catch (e) {
    st.textContent = '読み取りに失敗：' + e.message;
  }
}

// ---------- 参加側接続 ----------
function startJoin() {
  solo = false;
  isHost = false;
  show('s-join');
  $('join-step2').hidden = true;
  $('join-step1').hidden = false;
  $('join-status').textContent = 'ホストの画面のQRを読み取ってください';
}

$('join-scan').onclick = async () => {
  $('join-scanbox').hidden = false;
  try {
    await scanner.start($('join-video'), (code) => acceptOffer(code));
  } catch (e) {
    $('join-status').textContent = 'カメラを使えません：' + e.message;
    $('join-scanbox').hidden = true;
  }
};
$('join-offer-go').onclick = () => acceptOffer($('join-offer').value);
$('join-copy').onclick = () => copy($('join-code'));

async function acceptOffer(code) {
  scanner.stop();
  $('join-scanbox').hidden = true;
  const st = $('join-status');
  st.textContent = '応答コードを作成中…';
  try {
    net?.close();
    net = new RtcTransport(false);
    wireNet();
    const ans = await net.acceptOffer(code);
    drawQR($('join-qr'), ans);
    $('join-code').value = ans;
    $('join-step1').hidden = true;
    $('join-step2').hidden = false;
    st.textContent = 'このQRをホストに読み取ってもらってください…';
  } catch (e) {
    st.textContent = '読み取りに失敗：' + e.message;
  }
}

function copy(ta) {
  ta.select();
  navigator.clipboard?.writeText(ta.value).catch(() => document.execCommand('copy'));
}

// ---------- 接続後 ----------
function wireNet() {
  net.onopen = () => {
    scanner.stop();
    camStream?.getTracks().forEach((t) => t.stop());
    camStream = null;
    if (isHost) sendLobby();
    show('s-lobby');
    renderLobby();
  };
  net.onmessage = onNetMsg;
  net.onclose = () => {
    if (game || $('s-lobby').classList.contains('active') || $('s-result').classList.contains('active')) {
      input.reset();
      $('netlost').hidden = false;
    }
  };
}

function send(msg, fast = false) {
  if (!net) return;
  if (fast) net.sendFast(msg);
  else net.send(msg);
}

function onNetMsg(msg) {
  if (msg.t === 'lobby' && !isHost) {
    myRole = msg.hostRole === 'seer' ? 'exo' : 'seer';
    stage = msg.stage || 0;
    renderLobby();
    if (!game) show('s-lobby');
  } else if (msg.t === 'start' && !isHost) {
    stage = msg.stage || 0;
    startGame();
  } else game?.onNet(msg);
}

// ステージ選択（ホストとひとり練習のみ変更できる）
function renderStagePick() {
  document.querySelectorAll('.stage-pick').forEach((box) => {
    const editable = isHost || solo || box.closest('#solo-pick');
    box.innerHTML = STAGES.map((S, i) => `<button data-stage="${i}" class="${i === stage ? 'on' : ''}" ${editable ? '' : 'disabled'}><small>${S.night}</small>${S.name}</button>`).join('');
    box.querySelectorAll('button').forEach((b) => {
      b.onclick = () => {
        stage = +b.dataset.stage;
        renderStagePick();
        if (isHost && net?.isOpen) sendLobby();
      };
    });
  });
}
renderStagePick();

function sendLobby() {
  send({ t: 'lobby', hostRole: myRole, stage });
  renderLobby();
}

function renderLobby() {
  for (const r of ['seer', 'exo']) {
    $('card-' + r).classList.toggle('mine', r === myRole);
    $('card-' + r).querySelector('.who').textContent = r === myRole ? 'あなた' : '相手';
  }
  $('lobby-swap').hidden = !isHost;
  $('lobby-start').hidden = !isHost;
  $('lobby-wait').hidden = isHost;
  renderStagePick();
}
$('lobby-swap').onclick = () => {
  myRole = myRole === 'seer' ? 'exo' : 'seer';
  sendLobby();
};
$('lobby-start').onclick = () => {
  sfx.init();
  send({ t: 'start', stage });
  startGame();
};

// ---------- 画質・クレジット ----------
function setQuality(q) {
  quality = q;
  try { localStorage.setItem('mh-quality', q); } catch { /* 保存不可 */ }
  $('btn-quality').textContent = `画質：${q === 'high' ? '高' : '軽量'}`;
}
setQuality(quality);
$('btn-quality').onclick = () => setQuality(quality === 'high' ? 'low' : 'high');
$('btn-credits').onclick = () => show('s-credits');

// ---------- ゲーム ----------
// 霊の3Dモデルは起動時から先に読み込んでおく（届かなければ手作りの霊で遊べる）
const modelReady = loadGhostModel();

async function startGame() {
  stopGame();
  sfx.init();
  await Promise.race([modelReady, new Promise((r) => setTimeout(r, 8000))]);
  stopGame();
  show(null);
  $('hud').hidden = false;
  document.body.classList.add('playing');
  input.reset();
  // 屋敷の生成に数秒かかるので、先に「読み込み中」を描かせてから作る
  $('loading').hidden = false;
  await new Promise((r) => { requestAnimationFrame(() => setTimeout(r, 0)); setTimeout(r, 100); });
  game = new Game({ renderer, role: myRole, isHost, solo, sfx, input, send, onOver, stage, quality, onQuality: setQuality });
  $('loading').hidden = true;
  window.__game = game;
  try {
    navigator.wakeLock?.request('screen').then((l) => { wakeLock = l; }).catch(() => {});
  } catch { /* 非対応 */ }
}

function onOver(ev) {
  const s = ev.stats;
  const acc = s.swings ? Math.round((s.hits / s.swings) * 100) : 0;
  const weak = s.hits ? Math.round((s.weakHits / s.hits) * 100) : 0;
  let rank = 'C';
  if (ev.win) {
    rank = 'B';
    if (s.time < 780) rank = 'A';
    if (s.time < 600 && weak >= 50 && s.dmg < 100) rank = 'S';
  }
  $('res-title').textContent = ev.win ? '除霊成功' : '除霊失敗';
  $('res-title').className = ev.win ? 'win' : 'lose';
  $('res-reason').textContent = ev.reason;
  $('res-rank').textContent = rank;
  $('res-stats').innerHTML = [
    ['時間', `${Math.floor(s.time / 60)}分${s.time % 60}秒`],
    ['除霊数', s.exorcised],
    ['命中率', `${acc}%（${s.hits}/${s.swings}）`],
    ['急所率', `${weak}%`],
    ['受けた被害', Math.round(s.dmg)],
  ].map(([k, v]) => `<tr><th>${k}</th><td>${v}</td></tr>`).join('');
  $('res-again').hidden = !isHost;
  $('res-next').hidden = !isHost || !ev.win || stage >= STAGES.length - 1;
  if (!$('res-next').hidden) $('res-next').textContent = `次へ：${STAGES[stage + 1].night}「${STAGES[stage + 1].name}」`;
  $('res-wait').hidden = isHost || solo;
  stopGame();
  show('s-result');
}
function restart() {
  if (!solo) send({ t: 'start', stage });
  startGame();
}
$('res-again').onclick = restart;
$('res-next').onclick = () => {
  stage = Math.min(stage + 1, STAGES.length - 1);
  restart();
};
$('res-title-btn').onclick = leave;
$('netlost-btn').onclick = leave;

$('btn-fs').onclick = () => {
  const el = document.documentElement;
  if (document.fullscreenElement) document.exitFullscreen?.();
  else el.requestFullscreen?.().then(() => screen.orientation?.lock?.('landscape').catch(() => {})).catch(() => {});
};

addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  game?.resize();
});

let last = performance.now();
function loop(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (game) game.update(dt);
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

// Claude のアーティファクトではカメラと WebRTC が使えないので、ひとり練習だけを出す
if (window.MH_ARTIFACT) {
  for (const id of ['btn-host', 'btn-join', 'btn-local', 'lan-note']) $(id).hidden = true;
  $('artifact-note').hidden = false;
}

if (!window.MH_ARTIFACT && 'serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

// ロビーの役割名
document.querySelectorAll('[data-role-name]').forEach((el) => { el.textContent = ROLE_NAME[el.dataset.roleName]; });
