let audioCtx;
const MASTER_A = 442.00;

// ==== ★ iOSのダブルタップ拡大を防止する ====
// touch-action:manipulationだけでは防ぎきれないケースがあるため、
// 短時間に連続したtouchendが発生した場合はズームジェスチャーとみなしてキャンセルする
let lastTouchEndTime = 0;
document.addEventListener('touchend', function (e) {
  const now = Date.now();
  if (now - lastTouchEndTime <= 350) {
    e.preventDefault();
  }
  lastTouchEndTime = now;
}, { passive: false });

// ==== ★ ゲームプレイ中の画面スクロール制御 ====
// 完全にスクロールを禁止すると、スマホのブラウザが「上部/下部のバー」を隠すきっかけを
// 得られず、バーが出たままになって鍵盤が押しづらくなる。
// そのため、引っ張って更新(pull-to-refresh)やバウンドだけを抑え、
// 通常のスクロール自体は許可する。誤操作の防止は「鍵盤上のスワイプだけを無効化」して実現する。
function lockBodyScroll() {
  document.documentElement.classList.add('no-scroll');
  document.body.classList.add('no-scroll');
}
function unlockBodyScroll() {
  document.documentElement.classList.remove('no-scroll');
  document.body.classList.remove('no-scroll');
}
// ★ 鍵盤の上でのスワイプのみ無効化する（鍵盤が動いてしまうのを防ぐ）。
//   鍵盤以外の場所ではスクロールできるので、少し上下にスワイプすればバーを隠せる。
document.addEventListener('touchmove', function (e) {
  if (!(isPlayingGame || isCountingDown)) return;
  if (e.target && e.target.closest && e.target.closest('.keys')) {
    e.preventDefault();
  }
}, { passive: false });

// ==== ★ BGM（バックグラウンドミュージック）制御 ====
const bgmAudio = document.getElementById('bgm-audio');
const BGM_VOLUME = 0.11; // ★ 音量を半分程度に引き下げ
bgmAudio.volume = BGM_VOLUME;
let bgmEnabled = (localStorage.getItem('saxEarTrainBgmEnabled') !== 'false'); // デフォルトON
let bgmFadeInterval = null;

// ★ タップしてスタート画面：ここでAudioContextとBGMの両方を解禁する
function handleTapToStart() {
  document.getElementById('tap-to-start-overlay').style.display = 'none';
  initAudio(); // ★ AudioContextの解禁自体は初回・2回目以降どちらも必ず行う

  const hasSeenTutorial = localStorage.getItem('saxEarTrainHasSeenTutorial') === 'true';
  if (hasSeenTutorial) {
    updateBgmToggleUI();
    playBGM();
  } else {
    showTutorial();
  }
}

// ==== ★ 初回チュートリアル（オンボーディング）====
const tutorialSteps = [
  { icon: '🎷', title: 'ようこそ！', text: 'まずは自分の楽器に合わせて設定を変更しましょう（デフォルトはC管・ピアノ向けです）。ヘッダーの「楽器選択」からいつでも変更できます。' },
  { icon: '⌨️', title: '操作方法', text: 'PCの人はキーボードで、スマホの人は画面タップで遊べます。鍵盤の下の「(A)」などがPC用の割り当てキーです（カスタマイズも可能）。' },
  { icon: '🎧', title: '遊び方', text: '基準音のあとに問題音が鳴ります。素早く正しい鍵盤を押しましょう！ 連続正解でコンボが発生し、スコアも伸びていきます。' }
];
let tutorialStepIndex = 0;

function showTutorial() {
  tutorialStepIndex = 0;
  renderTutorialStep();
  document.getElementById('tutorial-overlay').classList.add('visible');
}

function renderTutorialStep() {
  const step = tutorialSteps[tutorialStepIndex];
  const isLastStep = tutorialStepIndex === tutorialSteps.length - 1;

  document.getElementById('tutorial-step-content').innerHTML = `
    <div class="tutorial-icon">${step.icon}</div>
    <h2 class="tutorial-step-title">${step.title}</h2>
    <p class="tutorial-step-text">${step.text}</p>
  `;

  document.querySelectorAll('#tutorial-overlay .dot').forEach((dot, i) => {
    dot.classList.toggle('active', i === tutorialStepIndex);
  });

  document.getElementById('tutorial-next-btn').innerText = isLastStep ? 'はじめる' : '次へ';
  document.getElementById('tutorial-skip-btn').style.visibility = isLastStep ? 'hidden' : 'visible';
}

function jumpToTutorialStep(i) {
  tutorialStepIndex = i;
  renderTutorialStep();
}

function tutorialNext() {
  const isLastStep = tutorialStepIndex === tutorialSteps.length - 1;
  if (isLastStep) {
    finishTutorial();
  } else {
    tutorialStepIndex++;
    renderTutorialStep();
  }
}

function skipTutorial() { finishTutorial(); }

function finishTutorial() {
  localStorage.setItem('saxEarTrainHasSeenTutorial', 'true');
  document.getElementById('tutorial-overlay').classList.remove('visible');
  updateBgmToggleUI();
  playBGM();
}

function playBGM() {
  if (!bgmEnabled) return;
  clearInterval(bgmFadeInterval);
  bgmAudio.muted = false;
  try { bgmAudio.volume = BGM_VOLUME; } catch (e) {}
  bgmAudio.play().catch(() => {}); // 自動再生が拒否された場合も静かに無視する
}

// ★ fade=true（ゲーム開始時）は、audio要素の再生自体はpause()せず継続したまま
//   muted=trueで即座に無音化する。
//   iOSは<audio>要素のvolumeプロパティの変更を無視する仕様があり、
//   「音量をフェードで下げる」方式では実質無音化できずBGMが鳴り続けてしまう不具合があったため、
//   確実に効くmutedプロパティに切り替えた。
//   再生自体を継続することで、iOSの音声セッション(playback)を維持し、
//   Web Audio API（効果音）がサイレントスイッチ等で無音化されるのを防ぐ効果も保っている。
function stopBGM(fade = true) {
  clearInterval(bgmFadeInterval);
  if (!fade) {
    // ユーザーが明示的にOFFにした場合は完全停止する
    bgmAudio.pause();
    bgmAudio.muted = false;
    try { bgmAudio.volume = BGM_VOLUME; } catch (e) {}
    return;
  }
  // ★ ゲーム開始時：最優先事項として、必ず即座に無音化する
  bgmAudio.muted = true;
}

function toggleBGM() {
  bgmEnabled = !bgmEnabled;
  localStorage.setItem('saxEarTrainBgmEnabled', String(bgmEnabled));
  updateBgmToggleUI();
  const startScreenVisible = document.getElementById('start-screen').style.display !== 'none';
  if (bgmEnabled && startScreenVisible) {
    playBGM();
  } else if (!bgmEnabled) {
    stopBGM(false); // ユーザーが明示的にOFFにした場合のみ完全停止する
  }
}

function updateBgmToggleUI() {
  const btn = document.getElementById('bgm-toggle-btn');
  if (!btn) return;
  btn.innerText = bgmEnabled ? '🔊 BGM: ON' : '🔇 BGM: OFF';
  btn.classList.toggle('bgm-off', !bgmEnabled);
}

// ==== ★ 苦手音 集中特訓モードのトグル ====
// ONにすると、そのステージで苦手な音（ステージ3は音程）に絞って出題される。
// スコア計算・ランキング条件は通常と同じ（苦手な音に絞る＝難しくなるため、有利にはならない）。
function toggleFocusWeakMode() {
  focusWeakMode = !focusWeakMode;
  localStorage.setItem('saxEarTrainFocusWeakMode', String(focusWeakMode));
  updateFocusWeakToggleUI();
}

function updateFocusWeakToggleUI() {
  const btn = document.getElementById('focus-weak-toggle-btn');
  if (!btn) return;
  btn.innerText = focusWeakMode ? '🎯 苦手特訓: ON' : '🎯 苦手特訓: OFF';
  btn.classList.toggle('focus-on', focusWeakMode);
}

const baseFreqs = {
  'C':  MASTER_A * Math.pow(2, -9/12),
  'Bb': MASTER_A * Math.pow(2, -11/12), 
  'Eb': MASTER_A * Math.pow(2, -6/12), 
  'F':  MASTER_A * Math.pow(2, -4/12)   
};

const semitoneOffsets = { 
  'LowA': -3, 'LowBb': -2, 'LowB': -1,
  'C': 0, 'Db': 1, 'D': 2, 'Eb': 3, 'E': 4, 'F': 5, 'Gb': 6, 'G': 7, 'Ab': 8, 'A': 9, 'Bb': 10, 'B': 11, 
  'HighC': 12, 'HighDb': 13, 'HighD': 14, 'HighEb': 15, 'HighE': 16 
};
const allNoteKeys = Object.keys(semitoneOffsets); // 半音を含む全20音

// ★ 正誤判定のオクターブ同一視（Pitch Class Equivalence）用ヘルパー
function getPitchClass(noteName) {
  return noteName.replace(/^(Low|High)/, '');
}

// ★ 物理キー割り当てが可能な「白鍵」のみのリスト
const keybindableNotes = ['LowA', 'LowB', 'C', 'D', 'E', 'F', 'G', 'A', 'B', 'HighC', 'HighD', 'HighE'];

// ★ 白鍵→黒鍵（シャープ）の対応表
const sharpKeyMap = { 'LowA': 'LowBb', 'C': 'Db', 'D': 'Eb', 'F': 'Gb', 'G': 'Ab', 'A': 'Bb', 'HighC': 'HighDb', 'HighD': 'HighEb' };
const flatToWhiteAnchor = {};
Object.keys(sharpKeyMap).forEach(white => { flatToWhiteAnchor[sharpKeyMap[white]] = white; });

// ==== ★ 音名表記の切り替え（ドレミ / CDE）====
const noteNamesSolfege = { 
  'LowA':'ラ↓', 'LowBb':'シ♭↓', 'LowB':'シ↓', 
  'C':'ド', 'Db':'ド♯', 'D':'レ', 'Eb':'レ♯', 'E':'ミ', 'F':'ファ', 'Gb':'ファ♯', 'G':'ソ', 'Ab':'ソ♯', 'A':'ラ', 'Bb':'ラ♯', 'B':'シ', 
  'HighC':'ド↑', 'HighDb':'ド♯↑', 'HighD':'レ↑', 'HighEb':'レ♯↑', 'HighE':'ミ↑' 
};
const noteNamesAlpha   = { 
  'LowA':'A↓', 'LowBb':'Bb↓', 'LowB':'B↓', 
  'C':'C', 'Db':'Db', 'D':'D', 'Eb':'Eb', 'E':'E', 'F':'F', 'Gb':'Gb', 'G':'G', 'Ab':'Ab', 'A':'A', 'Bb':'Bb', 'B':'B', 
  'HighC':'C↑', 'HighDb':'Db↑', 'HighD':'D↑', 'HighEb':'Eb↑', 'HighE':'E↑' 
};
let notationMode = localStorage.getItem('saxEarTrainNotationMode') || 'solfege';
let noteNames = (notationMode === 'alpha') ? noteNamesAlpha : noteNamesSolfege;

// ★ 半音の入力方式：'dedicated'(専用キー) or 'modifier'(Space修飾キー)
let semitoneInputMode = localStorage.getItem('saxEarTrainSemitoneInputMode') || 'dedicated';

function handleNotationChange() {
  notationMode = document.getElementById('notation-select').value;
  localStorage.setItem('saxEarTrainNotationMode', notationMode);
  noteNames = (notationMode === 'alpha') ? noteNamesAlpha : noteNamesSolfege;
  updateNoteLabels();
  updateAnalyticsUI();
}

function updateNoteLabels() {
  allNoteKeys.forEach(note => {
    const el = document.getElementById('notelabel-' + note);
    if (el) el.innerText = noteNames[note];
  });
}

// ==== ★ 鍵盤モード別の「白鍵のみ（メジャースケール）」の並び（ピッチ順）====
const diatonicSequencePC     = ['C', 'D', 'E', 'F', 'G', 'A', 'B', 'HighC'];
const diatonicSequenceMobile = ['LowA', 'LowB', 'C', 'D', 'E', 'F', 'G', 'A', 'B', 'HighC', 'HighD', 'HighE'];

// ==== ★ 鍵盤モード別の「黒鍵を含む全音域（クロマチック）」の並び（ピッチ順）====
const chromaticSequencePC     = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B', 'HighC'];
const chromaticSequenceMobile = ['LowA', 'LowBb', 'LowB', 'C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B', 'HighC', 'HighDb', 'HighD', 'HighEb', 'HighE'];

let activeNoteSequence = diatonicSequencePC;
let currentNoteCount = 4;
let currentAvailableNotes = [];

// ==== ★ 苦手な音の統計はステージごとに別々に管理する ====
let noteStatsByStage = JSON.parse(localStorage.getItem('saxEarTrainStatsByStage')) || {};
[1, 2, 3].forEach(stageNum => {
  if (!noteStatsByStage[stageNum]) noteStatsByStage[stageNum] = {};
  allNoteKeys.forEach(k => {
    if (!noteStatsByStage[stageNum][k]) noteStatsByStage[stageNum][k] = { attempts: 0, correct: 0, totalTime: 0 };
  });
});

// ==== ★ ステージ3専用：苦手な「音程（跳躍）」の統計 ====
// 半音差(0〜11)ごとに正答率・反応時間を記録する
let intervalStats = JSON.parse(localStorage.getItem('saxEarTrainIntervalStats')) || {};
for (let i = 0; i <= 11; i++) {
  if (!intervalStats[i]) intervalStats[i] = { attempts: 0, correct: 0, totalTime: 0 };
}
const intervalNames = ['完全1度', '短2度', '長2度', '短3度', '長3度', '完全4度', '増4度/減5度', '完全5度', '短6度', '長6度', '短7度', '長7度'];

let scoreHistory = JSON.parse(localStorage.getItem('saxEarTrainHistory')) || [];

let currentQuestionNote = ''; let questionStartTime = 0; 
let currentReferenceNote = 'C'; // ★ ステージ3の音程集計用：直近の基準音
let currentIntervalClass = 0;   // ★ ステージ3の音程集計用：直近の半音差(0-11)
let isPlayingGame = false; let isWaitingForAnswer = false; let isCountingDown = false; 
let score = 0; let timeLeft = 30; let combo = 0; let maxCombo = 0; let streak = 0; let timerInterval;

// ★ 苦手な音/音程ランキングの表示件数（「もっと見る」で+3件ずつ拡張）
let weakNotesDisplayCount = 3;

// ★ 今回のプレイ中に間違えた音／音程を記録する（リザルトの「今回の弱点」表示用）
//   ステージ1・2は音名ごと、ステージ3は音程（跳躍）ごとに集計する
let sessionMistakes = {};

// ★ 今回のプレイ全体の集計（成長グラフ用に平均反応時間・正答率を履歴へ残す）
let sessionAnsweredCount = 0;
let sessionCorrectCount = 0;
let sessionTotalTime = 0;

// ★ 苦手音 集中特訓モード：ONにすると、苦手な音（音程）に絞って出題する
let focusWeakMode = (localStorage.getItem('saxEarTrainFocusWeakMode') === 'true');

// ==== ★ ステージ管理 ====
let currentStage = 1;
// ★ 解放条件は「直前のステージでの自己ベスト」で判定する
//   STAGE2: STAGE1で70,000点 / STAGE3: STAGE2で200,000点
const STAGE_UNLOCK_SCORES = { 2: 70000, 3: 200000 };
const stage3ReferencePool = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

// ★ ステージ別スコア補正倍率：ステージが上がるほど純粋に難しくなり得点が伸びにくくなるため、
//   同程度の実力ならステージ1に近いスコアが出るように底上げする。
//   ただしステージ1の記録が簡単に抜かれないよう、完全に同等にはせず控えめに設定している。
const STAGE_SCORE_MULTIPLIERS = { 1: 1.0, 2: 1.8, 3: 2.8 };

// ★ ベストスコアはステージごとに別々に保持する（解放条件の判定に使うため）
function loadBestScoreByStage() {
  let data = {};
  try {
    const saved = JSON.parse(localStorage.getItem('saxEarTrainBestScoreByStage'));
    if (saved && typeof saved === 'object') data = saved;
  } catch (e) { /* 壊れたデータは無視 */ }

  // 旧バージョン（全ステージ共通の単一ベストスコア）からの移行措置：
  // 旧データはSTAGE1の記録とみなして引き継ぐ
  const legacyBest = parseInt(localStorage.getItem('saxEarTrainBestScore') || '0', 10);
  const result = { 1: data[1] || 0, 2: data[2] || 0, 3: data[3] || 0 };
  if (legacyBest > result[1]) result[1] = legacyBest;
  return result;
}
let bestScoreByStage = loadBestScoreByStage();

// ★ 全ステージ通しての自己ベスト（ゲーム画面の表示用）
function getOverallBestScore() {
  return Math.max(bestScoreByStage[1], bestScoreByStage[2], bestScoreByStage[3]);
}

// ==== ★ 外部送信（GAS/Discord）設定 ====
// TODO: Discord Webhook URLを実際の値に置き換えてください
const GAS_URL = "https://script.google.com/macros/s/AKfycbzgR5pfOXgsSkY9HfQ0bEjd33iDNEYZD-z07rOtSAXBCnm7u_rRqvFnqgib_niUr2_kEg/exec";
const DISCORD_WEBHOOK_URL = "YOUR_DISCORD_WEBHOOK_URL_HERE";
const SCORE_ALERT_THRESHOLD = 200000;

// ==== ★ 端末判定とコンボ判定猶予 ====
function detectDeviceType() {
  const ua = navigator.userAgent || '';
  const isIOS = /iPhone|iPad|iPod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (isIOS) return 'ios';
  if (/Android/i.test(ua)) return 'android';
  return 'pc';
}

const deviceType = detectDeviceType();
const COMBO_TIME_THRESHOLDS = { ios: 1300, android: 1200, pc: 1000 };

// ★ コンボの時間ボーナスが際限なく積み重なって終了しなくなるのを防ぐための上限。
//   （高速で正解し続けると、消費時間よりボーナス時間の方が多くなり得るための対策）
const MAX_TIME_LEFT = 45;
// ★ 万一の異常発生に備えた絶対的なフェイルセーフ。ゲーム開始から一定時間で必ず終了させる。
const MAX_GAME_DURATION_MS = 180000; // 3分
let gameStartTimestamp = 0;
const COMBO_TIME_THRESHOLD = COMBO_TIME_THRESHOLDS[deviceType];
const DEVICE_LABELS = { ios: '📱 iOS (猶予1300ms)', android: '🤖 Android (猶予1200ms)', pc: '💻 PC (猶予1000ms)' };

// ※ 画面の初期化処理は、スクリプト末尾の initApp() にまとめて実行しています。
//   （let/constは宣言前に参照できないため、ここで実行すると
//     まだ宣言されていない後方の変数を参照して ReferenceError になります）

function getFrequency(noteName) {
  const instrument = document.getElementById('instrument-select').value;
  return baseFreqs[instrument] * Math.pow(2, semitoneOffsets[noteName] / 12);
}

function initAudio() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (audioCtx.state === 'suspended') audioCtx.resume();
}

function playTone(frequency, duration, type = 'triangle', time = null) {
  const osc = audioCtx.createOscillator(); const gainNode = audioCtx.createGain();
  osc.type = type; osc.frequency.value = frequency;
  osc.connect(gainNode); gainNode.connect(audioCtx.destination);
  const startTime = time !== null ? time : audioCtx.currentTime;
  osc.start(startTime);
  gainNode.gain.setValueAtTime(0, startTime);
  gainNode.gain.linearRampToValueAtTime(0.3, startTime + 0.05);
  gainNode.gain.exponentialRampToValueAtTime(0.00001, startTime + duration);
  osc.stop(startTime + duration);
}

function playCountdownSequence(startTime) {
  const beepFreq = MASTER_A * 2; const whistleFreq = MASTER_A * Math.pow(2, 22/12);
  playTone(beepFreq, 0.1, 'sine', startTime);         
  playTone(beepFreq, 0.1, 'sine', startTime + 1.0);   
  playTone(beepFreq, 0.1, 'sine', startTime + 2.0);   
  playTone(whistleFreq, 0.3, 'sine', startTime + 3.0); 
  playTone(whistleFreq, 0.1, 'sine', startTime + 3.15); 
}

function playCorrectSE() { playTone(MASTER_A * 2, 0.2, 'sine'); setTimeout(() => playTone(MASTER_A * Math.pow(2, 7/12), 0.3, 'sine'), 100); }
function playIncorrectSE() { playTone(MASTER_A / 4, 0.4, 'sawtooth'); }

// ==== ★ サックス風の音色合成（Web Audio APIによるシンセシス）====
let noiseBufferCache = null;
function getBreathNoiseBuffer() {
  if (noiseBufferCache) return noiseBufferCache;
  const duration = 0.08;
  const bufferSize = Math.floor(audioCtx.sampleRate * duration);
  const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
  noiseBufferCache = buffer;
  return buffer;
}

function playSaxTone(frequency, duration, time = null) {
  const now = time !== null ? time : audioCtx.currentTime;
  const stopTime = now + duration + 0.08;

  const osc1 = audioCtx.createOscillator(); osc1.type = 'sawtooth'; osc1.frequency.setValueAtTime(frequency, now);
  const osc2 = audioCtx.createOscillator(); osc2.type = 'sawtooth'; osc2.frequency.setValueAtTime(frequency * 1.006, now);
  const osc3 = audioCtx.createOscillator(); osc3.type = 'square';   osc3.frequency.setValueAtTime(frequency, now); osc3.detune.setValueAtTime(-1200, now);

  const oscGain1 = audioCtx.createGain(); oscGain1.gain.value = 0.5;
  const oscGain2 = audioCtx.createGain(); oscGain2.gain.value = 0.35;
  const oscGain3 = audioCtx.createGain(); oscGain3.gain.value = 0.18;

  const filter = audioCtx.createBiquadFilter();
  filter.type = 'lowpass'; filter.Q.value = 5;
  filter.frequency.setValueAtTime(frequency * 7, now);
  filter.frequency.exponentialRampToValueAtTime(frequency * 3.2, now + 0.12);
  filter.frequency.exponentialRampToValueAtTime(frequency * 2.4, stopTime);

  const formant = audioCtx.createBiquadFilter();
  formant.type = 'bandpass'; formant.frequency.value = Math.min(frequency * 2.5, 2200); formant.Q.value = 1.3;

  const vibratoLFO = audioCtx.createOscillator(); vibratoLFO.type = 'sine'; vibratoLFO.frequency.value = 5.7;
  const vibratoGain = audioCtx.createGain();
  vibratoGain.gain.setValueAtTime(0, now);
  vibratoGain.gain.linearRampToValueAtTime(4.5, now + 0.18);
  vibratoLFO.connect(vibratoGain);
  vibratoGain.connect(osc1.frequency); vibratoGain.connect(osc2.frequency);

  const noiseSource = audioCtx.createBufferSource(); noiseSource.buffer = getBreathNoiseBuffer();
  const noiseFilter = audioCtx.createBiquadFilter();
  noiseFilter.type = 'bandpass'; noiseFilter.frequency.value = frequency * 2.2; noiseFilter.Q.value = 0.7;
  const noiseGain = audioCtx.createGain();
  noiseGain.gain.setValueAtTime(0.18, now);
  noiseGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.06);

  const masterGain = audioCtx.createGain();
  masterGain.gain.setValueAtTime(0.0001, now);
  masterGain.gain.exponentialRampToValueAtTime(0.32, now + 0.025);
  masterGain.gain.linearRampToValueAtTime(0.26, now + 0.1);
  masterGain.gain.setValueAtTime(0.26, Math.max(now + 0.1, stopTime - 0.09));
  masterGain.gain.exponentialRampToValueAtTime(0.0001, stopTime);

  osc1.connect(oscGain1); osc2.connect(oscGain2); osc3.connect(oscGain3);
  oscGain1.connect(filter); oscGain2.connect(filter); oscGain3.connect(filter);
  filter.connect(formant); formant.connect(masterGain);
  noiseSource.connect(noiseFilter); noiseFilter.connect(noiseGain); noiseGain.connect(masterGain);
  masterGain.connect(audioCtx.destination);

  osc1.start(now); osc2.start(now); osc3.start(now); vibratoLFO.start(now); noiseSource.start(now);
  osc1.stop(stopTime); osc2.stop(stopTime); osc3.stop(stopTime); vibratoLFO.stop(stopTime); noiseSource.stop(now + 0.08);
}

// ==== ★ レベルアップ効果音 ====
function playLevelUpSFX(comboCount) {
  const now = audioCtx.currentTime;
  const tier = Math.floor(comboCount / 3);
  const pitchShift = Math.pow(2, Math.min(tier - 1, 4) / 12);
  const notes = [523.25, 659.25, 783.99, 1046.50];
  notes.forEach((freq, i) => {
    playTone(freq * pitchShift, 0.13, 'triangle', now + i * 0.06);
  });
}

// ==== ★ コンボ数に応じて背景色をリアルタイムに変化させる ====
const COMBO_COLOR_MAX = 15;
function updateBackgroundByCombo(comboCount) {
  const t = Math.min(comboCount / COMBO_COLOR_MAX, 1);
  const hue = 205 - (205 * t);
  const saturation = 35 + 60 * t;
  const lightness = 22 + 10 * t;
  document.body.style.backgroundColor = `hsl(${hue}, ${saturation}%, ${lightness}%)`;
}

function updateDifficulty() {
  const mode = document.getElementById('keyboard-mode-select').value;
  const includeChromatic = (currentStage === 2 || currentStage === 3);

  const whiteKeyGroup = (mode === 'pc') ? diatonicSequencePC : diatonicSequenceMobile;
  activeNoteSequence = includeChromatic
    ? ((mode === 'pc') ? chromaticSequencePC : chromaticSequenceMobile)
    : whiteKeyGroup;

  if (currentNoteCount > activeNoteSequence.length) currentNoteCount = activeNoteSequence.length;
  currentAvailableNotes = activeNoteSequence.slice(0, currentNoteCount);
  
  document.getElementById('difficulty-badge').innerText = `開放音数: ${currentNoteCount} / ${activeNoteSequence.length}`;
  
  const effectiveAvailableNotes = isPlayingGame ? currentAvailableNotes : activeNoteSequence;

  document.querySelectorAll('.key-group').forEach(group => {
    const whiteNote = group.dataset.whiteNote;
    group.classList.toggle('group-visible', whiteKeyGroup.includes(whiteNote));
  });

  document.querySelectorAll('.key').forEach(el => {
    const noteId = el.id.replace('note-', '');
    const isBlack = el.classList.contains('black-key');
    const anchorWhiteNote = isBlack ? flatToWhiteAnchor[noteId] : noteId;
    const groupVisible = whiteKeyGroup.includes(anchorWhiteNote);

    const shouldShow = isBlack ? (groupVisible && includeChromatic) : groupVisible;

    el.classList.toggle('visible-key', shouldShow);
    el.classList.toggle('active-key', shouldShow && effectiveAvailableNotes.includes(noteId));
  });
}

function getEffectiveAvailableNotes() {
  return isPlayingGame ? currentAvailableNotes : activeNoteSequence;
}

function updateKeyboardUI() { updateDifficulty(); }

// ==== ★ スタート画面 / ステージ選択 / モーダル 制御 ====
// ★ STAGE2はSTAGE1で、STAGE3はSTAGE2で、それぞれ規定スコアを出すと解放される
function isStageUnlocked(stageNum) {
  if (stageNum === 1) return true;
  return bestScoreByStage[stageNum - 1] >= STAGE_UNLOCK_SCORES[stageNum];
}

function renderStageLockState() {
  const stage2Unlocked = isStageUnlocked(2);
  const stage3Unlocked = isStageUnlocked(3);

  document.getElementById('stage-2-card').classList.toggle('locked', !stage2Unlocked);
  document.getElementById('stage-2-lock-label').style.display = stage2Unlocked ? 'none' : 'inline-block';

  document.getElementById('stage-3-card').classList.toggle('locked', !stage3Unlocked);
  document.getElementById('stage-3-lock-label').style.display = stage3Unlocked ? 'none' : 'inline-block';

  if ((currentStage === 2 && !stage2Unlocked) || (currentStage === 3 && !stage3Unlocked)) {
    selectStage(1);
  }
}

function selectStage(stageNum) {
  if (!isStageUnlocked(stageNum)) return; // ロック中は無視
  currentStage = stageNum;
  document.getElementById('stage-1-card').classList.toggle('selected', stageNum === 1);
  document.getElementById('stage-2-card').classList.toggle('selected', stageNum === 2);
  document.getElementById('stage-3-card').classList.toggle('selected', stageNum === 3);
  weakNotesDisplayCount = 3; // ★ ステージ切替時はランキング表示件数をリセット
  updateAnalyticsUI(); // ★ ステージごとに異なるランキングをすぐ反映
  updateGameStatusLine(); // ★ 解放進捗の表示も選択中ステージに合わせて更新
  renderGrowthChart(); // ★ 成長グラフも選択中ステージのものに切り替える
}

function showRulesModal() { document.getElementById('rules-modal-overlay').classList.add('visible'); }
function closeRulesModal() { document.getElementById('rules-modal-overlay').classList.remove('visible'); }

function updateGameStatusLine() {
  const instrumentText = document.getElementById('instrument-select').selectedOptions[0].text;
  const modeText = document.getElementById('keyboard-mode-select').selectedOptions[0].text;
  const focusText = focusWeakMode ? ' ・ 🎯苦手特訓' : '';
  document.getElementById('game-status-line').innerText = `🎷 ${instrumentText} ・ ${modeText} ・ STAGE ${currentStage}${focusText}`;

  // ★ 「このステージでの自己ベスト」と、次のステージ解放までの残りを表示する
  const progressEl = document.getElementById('stage-progress-line');
  if (progressEl) {
    const stageBest = bestScoreByStage[currentStage] || 0;
    const nextStage = currentStage + 1;
    if (nextStage <= 3 && !isStageUnlocked(nextStage)) {
      const remain = STAGE_UNLOCK_SCORES[nextStage] - stageBest;
      progressEl.innerText = `🏁 STAGE${currentStage}ベスト: ${stageBest}点（あと${remain}点でSTAGE${nextStage}解放）`;
    } else if (nextStage > 3) {
      progressEl.innerText = `🏁 STAGE${currentStage}ベスト: ${stageBest}点（最終ステージ）`;
    } else {
      progressEl.innerText = `🏁 STAGE${currentStage}ベスト: ${stageBest}点（STAGE${nextStage}解放済み）`;
    }
  }
}

function beginGame() {
  document.getElementById('start-screen').style.display = 'none';
  document.getElementById('game-screen').style.display = 'block';
  // ★ ゲーム画面では鍵盤に全幅を使いたいので、横画面時にサイドバーを隠すためのクラスを付ける
  document.body.classList.add('hide-sidebars');
  stopBGM(true);
  lockBodyScroll();
  startSequence();
}

function returnToStartScreen() {
  document.getElementById('game-screen').style.display = 'none';
  document.getElementById('start-screen').style.display = 'block';
  document.getElementById('start-btn').style.display = '';
  // ★ スタート画面ではランキング・苦手な音を見せたいのでサイドバーを復帰させる
  document.body.classList.remove('hide-sidebars');
  unlockBodyScroll();
  renderStageLockState();
  playBGM();
}

// ==== ★ 練習用ピアノ（ゲームプレイとは無関係にいつでも鍵盤を鳴らせる）====
// 白鍵のオクターブ内オフセットとラベル、およびその白鍵の直後にある黒鍵のオフセット
const PRACTICE_WHITE_PATTERN = [
  { offset: 0, name: 'C' }, { offset: 2, name: 'D' }, { offset: 4, name: 'E' },
  { offset: 5, name: 'F' }, { offset: 7, name: 'G' }, { offset: 9, name: 'A' }, { offset: 11, name: 'B' }
];
const PRACTICE_BLACK_AFTER = { 0: 1, 2: 3, 5: 6, 7: 8, 9: 10 }; // 白鍵オフセット → 黒鍵オフセット（ない場合はキーなし）

// ★ 1キー=オクターブを下げる／0キー=オクターブを上げる、が対象とする「今どのオクターブか」
let practiceCurrentOctave = 0;
// ★ 物理キー → DOM要素（キーボード入力時のハイライト用。オクターブ全体で絶対的な半音位置がキー）
let practiceKeyElementsBySemitone = {};

function openPracticePiano() {
  document.getElementById('start-screen').style.display = 'none';
  document.getElementById('practice-piano-screen').style.display = 'block';
  document.body.classList.add('hide-sidebars'); // ★ 練習用ピアノも鍵盤に全幅を使う
  practiceCurrentOctave = 0;
  renderPracticeKeys();
}

function closePracticePiano() {
  document.getElementById('practice-piano-screen').style.display = 'none';
  document.getElementById('start-screen').style.display = 'block';
  document.body.classList.remove('hide-sidebars');
  renderStageLockState();
}

// ★ ゲーム本編のnoteStats等とは完全に独立した、練習用の周波数計算
function getPracticeFrequency(semitoneFromC) {
  const instrument = document.getElementById('practice-instrument-select').value;
  return baseFreqs[instrument] * Math.pow(2, semitoneFromC / 12);
}

function renderPracticeKeys() {
  const octaves = parseInt(document.getElementById('practice-octave-select').value, 10) || 2;
  if (practiceCurrentOctave > octaves - 1) practiceCurrentOctave = octaves - 1;
  const container = document.getElementById('practice-keys-container');
  if (!container) return;
  container.innerHTML = '';
  practiceKeyElementsBySemitone = {};

  for (let oct = 0; oct < octaves; oct++) {
    PRACTICE_WHITE_PATTERN.forEach(w => {
      const semitone = oct * 12 + w.offset;

      const group = document.createElement('div');
      group.className = 'key-group group-visible';

      const whiteKey = document.createElement('div');
      whiteKey.className = 'key visible-key active-key';
      whiteKey.innerHTML = `<span>${w.name}${oct + 1}</span>`;
      whiteKey.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        playPracticeNote(semitone, whiteKey);
      });
      group.appendChild(whiteKey);
      practiceKeyElementsBySemitone[semitone] = whiteKey;

      if (PRACTICE_BLACK_AFTER[w.offset] !== undefined) {
        const blackSemitone = oct * 12 + PRACTICE_BLACK_AFTER[w.offset];
        const blackKey = document.createElement('div');
        blackKey.className = 'key black-key visible-key active-key';
        blackKey.addEventListener('pointerdown', (e) => {
          e.preventDefault();
          e.stopPropagation();
          playPracticeNote(blackSemitone, blackKey);
        });
        group.appendChild(blackKey);
        practiceKeyElementsBySemitone[blackSemitone] = blackKey;
      }

      container.appendChild(group);
    });
  }

  updatePracticeOctaveIndicator();
}

function playPracticeNote(semitoneFromC, btnEl) {
  initAudio();
  playSaxTone(getPracticeFrequency(semitoneFromC), 0.6);
  if (btnEl) {
    btnEl.classList.add('correct-highlight');
    setTimeout(() => btnEl.classList.remove('correct-highlight'), 300);
  }
}

function updatePracticeOctaveIndicator() {
  const el = document.getElementById('practice-octave-indicator');
  if (el) el.innerText = `⌨️ PCキー入力オクターブ: ${practiceCurrentOctave + 1}（1キーで下げる／0キーで上げる）`;
}

// ★ 練習用ピアノ画面専用のキーボード入力処理（本編のkeyMap/blackKeyMapとは完全に分離する）
//   ・現在のkeyBindings/blackKeyBindingsを流用するので、本編でカスタマイズした配置がそのまま使える
//   ・1キー/0キーでPC入力が対象とするオクターブを上下できる
const PRACTICE_BASE_WHITE_NOTES = { 'C': 0, 'D': 2, 'E': 4, 'F': 5, 'G': 7, 'A': 9, 'B': 11 };
const PRACTICE_BASE_BLACK_NOTES = { 'Db': 1, 'Eb': 3, 'Gb': 6, 'Ab': 8, 'Bb': 10 };
const PRACTICE_SHARP_FROM_WHITE = { 0: 1, 2: 3, 5: 6, 7: 8, 9: 10 };

function triggerPracticeKeyBySemitone(semitone) {
  const btn = practiceKeyElementsBySemitone[semitone];
  if (!btn) return; // 表示中のオクターブ範囲外なら何もしない
  playPracticeNote(semitone, btn);
  btn.classList.add('pressed');
  setTimeout(() => btn.classList.remove('pressed'), 150);
}

function handlePracticePianoKeydown(e, key) {
  // 1 / 0 キーでPC入力が対象とするオクターブを上下させる
  if (key === '1' || key === '0') {
    e.preventDefault();
    const octaves = parseInt(document.getElementById('practice-octave-select').value, 10) || 2;
    if (key === '1') practiceCurrentOctave = Math.max(0, practiceCurrentOctave - 1);
    if (key === '0') practiceCurrentOctave = Math.min(octaves - 1, practiceCurrentOctave + 1);
    updatePracticeOctaveIndicator();
    return;
  }

  if (e.code === 'Space' || e.key === ' ') {
    e.preventDefault();
    isSpaceHeld = true;
    return;
  }

  for (const note in PRACTICE_BASE_WHITE_NOTES) {
    if ((keyBindings[note] || '').toLowerCase() === key) {
      let semitoneInOctave = PRACTICE_BASE_WHITE_NOTES[note];
      if (semitoneInputMode === 'modifier' && isSpaceHeld && PRACTICE_SHARP_FROM_WHITE[semitoneInOctave] !== undefined) {
        semitoneInOctave = PRACTICE_SHARP_FROM_WHITE[semitoneInOctave];
      }
      triggerPracticeKeyBySemitone(practiceCurrentOctave * 12 + semitoneInOctave);
      return;
    }
  }

  if (semitoneInputMode === 'dedicated') {
    for (const note in PRACTICE_BASE_BLACK_NOTES) {
      if ((blackKeyBindings[note] || '').toLowerCase() === key) {
        triggerPracticeKeyBySemitone(practiceCurrentOctave * 12 + PRACTICE_BASE_BLACK_NOTES[note]);
        return;
      }
    }
  }
}

function startSequence() {
  if (isPlayingGame || isCountingDown) return;
  isCountingDown = true;
  lockBodyScroll(); // ★ 「もう一度プレイ」経由の場合もここでロック

  const isColdStart = !audioCtx || audioCtx.state !== 'running';
  initAudio();

  if (isColdStart) {
    audioCtx.resume().then(() => {
      setTimeout(beginCountdownSequence, 150);
    });
  } else {
    beginCountdownSequence();
  }
}

function beginCountdownSequence() {
  updateBackgroundByCombo(0); 
  
  document.getElementById('instrument-select').disabled = true;
  document.getElementById('keyboard-mode-select').disabled = true;
  document.getElementById('start-btn').style.display = 'none';
  document.getElementById('game-message-area').innerHTML = "準備はいい？";
  document.getElementById('countdown').style.display = 'block';
  
  combo = 0; maxCombo = 0; streak = 0; score = 0; timeLeft = 30; currentNoteCount = 4; recentQuestionNotes = [];
  sessionMistakes = {}; // ★ 今回の弱点サマリー用の記録をリセット
  sessionAnsweredCount = 0; sessionCorrectCount = 0; sessionTotalTime = 0; // ★ 成長グラフ用の集計をリセット
  weakNotesDisplayCount = 3;
  updateStats(); updateDifficulty(); updateGameStatusLine();
  document.getElementById('combo-message').innerHTML = '';

  const now = audioCtx.currentTime;
  playCountdownSequence(now);

  let count = 3; document.getElementById('countdown').innerText = count;
  const countInterval = setInterval(() => {
    count--;
    if (count > 0) { document.getElementById('countdown').innerText = count; } 
    else {
      clearInterval(countInterval); 
      document.getElementById('countdown').style.display = 'none';
      isCountingDown = false; 
      startGameLoop(); 
    }
  }, 1000); 
}

function startGameLoop() {
  isPlayingGame = true;
  gameStartTimestamp = Date.now(); // ★ フェイルセーフ用に開始時刻を記録
  updateDifficulty();
  timerInterval = setInterval(() => {
    timeLeft--; updateStats();
    // ★ 残り時間切れ、または万一の異常で長時間続いた場合は強制終了する
    if (timeLeft <= 0 || (Date.now() - gameStartTimestamp) > MAX_GAME_DURATION_MS) endGame();
  }, 1000);
  setTimeout(nextQuestion, 1200); 
}

let recentQuestionNotes = [];

function getNextNoteByWeight() {
  const statsForStage = noteStatsByStage[currentStage];
  let totalWeight = 0; let weights = {};
  currentAvailableNotes.forEach(note => {
    let stat = statsForStage[note]; let weight = 1.0; 
    if (stat.attempts > 0) {
      weight += (1 - (stat.correct / stat.attempts)) * 2.0;
      weight += Math.min((stat.totalTime / stat.correct || 1000) / 800, 1.5);
    }
    weights[note] = weight; totalWeight += weight;
  });

  // ★ 苦手音 集中特訓モード：出題対象を「苦手な音」の上位半分だけに絞り込む
  //   （正答率が低い順→同率なら反応が遅い順。データ未計測の音は中間の扱いにする）
  let basePool = currentAvailableNotes;
  if (focusWeakMode) {
    const ranked = currentAvailableNotes.map(note => {
      const stat = statsForStage[note];
      const rawAccuracy = stat.attempts > 0 ? (stat.correct / stat.attempts) : 0.5;
      const avgTime = stat.correct > 0 ? (stat.totalTime / stat.correct) : 1200;
      return { note, rawAccuracy, avgTime };
    }).sort(compareWeakness);
    const takeCount = Math.max(3, Math.ceil(ranked.length / 2));
    basePool = ranked.slice(0, takeCount).map(r => r.note);
  }

  const isImmediateRepeat = (note) => 
    recentQuestionNotes.length >= 1 && recentQuestionNotes[recentQuestionNotes.length - 1] === note;

  const formsSimpleScaleRun = (note) => {
    if (recentQuestionNotes.length < 2) return false;
    const idxPrev2 = activeNoteSequence.indexOf(recentQuestionNotes[recentQuestionNotes.length - 2]);
    const idxPrev1 = activeNoteSequence.indexOf(recentQuestionNotes[recentQuestionNotes.length - 1]);
    const idxNow   = activeNoteSequence.indexOf(note);
    if (idxPrev2 === -1 || idxPrev1 === -1 || idxNow === -1) return false;
    const step1 = idxPrev1 - idxPrev2;
    const step2 = idxNow - idxPrev1;
    return Math.abs(step1) === 1 && step1 === step2;
  };

  let candidates = basePool.filter(n => !isImmediateRepeat(n) && !formsSimpleScaleRun(n));
  if (candidates.length === 0) candidates = basePool.filter(n => !isImmediateRepeat(n));
  if (candidates.length === 0) candidates = basePool;

  let candidateTotalWeight = 0;
  candidates.forEach(n => { candidateTotalWeight += weights[n]; });

  let rand = Math.random() * candidateTotalWeight;
  let chosen = candidates[0];
  for (let note of candidates) { rand -= weights[note]; if (rand <= 0) { chosen = note; break; } }

  recentQuestionNotes.push(chosen);
  if (recentQuestionNotes.length > 2) recentQuestionNotes.shift();

  return chosen;
}

function nextQuestion() {
  if (!isPlayingGame) return;
  isWaitingForAnswer = false;

  const referenceNoteName = (currentStage === 3)
    ? stage3ReferencePool[Math.floor(Math.random() * stage3ReferencePool.length)]
    : 'C';
  currentReferenceNote = referenceNoteName;
  const referenceFreq = getFrequency(referenceNoteName);

  document.getElementById('game-message-area').innerHTML = (currentStage === 3)
    ? `🎵 基準音(${noteNames[referenceNoteName]}) ➡ 問題音...`
    : `🎵 基準音(${noteNames['C']}) ➡ 問題音...`;

  if (currentStage === 3) {
    const referenceBtn = document.getElementById('note-' + referenceNoteName);
    if (referenceBtn) {
      referenceBtn.classList.add('reference-highlight');
      setTimeout(() => referenceBtn.classList.remove('reference-highlight'), 400);
    }
  }

  playSaxTone(referenceFreq, 0.4);
  setTimeout(() => {
    if (!isPlayingGame) return;
    currentQuestionNote = getNextNoteByWeight(); 

    // ★ ステージ3のみ：基準音からの半音差（0〜11）を「音程」として記録しておく
    if (currentStage === 3) {
      const diff = semitoneOffsets[currentQuestionNote] - semitoneOffsets[currentReferenceNote];
      currentIntervalClass = ((diff % 12) + 12) % 12;
    }

    // ※ attempts（出題回数）は「回答した時点」でcheckAnswer側から加算する。
    //   ここで加算すると、時間切れで答えられなかった問題まで誤答として集計され、
    //   苦手ランキングの正答率が不当に下がってしまうため。

    const questionFreq = getFrequency(currentQuestionNote);
    playSaxTone(questionFreq, 0.6);
    questionStartTime = performance.now(); isWaitingForAnswer = true;
  }, 600);
}

function checkAnswer(answerNote) {
  if (!isPlayingGame) {
    if (isCountingDown) return;
    if (!activeNoteSequence.includes(answerNote)) return;
    playFreePlayTone(answerNote);
    return;
  }

  if (!currentAvailableNotes.includes(answerNote)) return;
  if (!isWaitingForAnswer) return;

  const responseTime = Math.round(performance.now() - questionStartTime); 
  isWaitingForAnswer = false; 
  const statsForStage = noteStatsByStage[currentStage];

  // ★ 実際に回答されたので、ここで初めて出題回数(attempts)を加算する
  statsForStage[currentQuestionNote].attempts++;
  if (currentStage === 3) intervalStats[currentIntervalClass].attempts++;

  // ★ 成長グラフ用に、今回のプレイ全体の集計も取る
  sessionAnsweredCount++;
  sessionTotalTime += responseTime;

  if (getPitchClass(answerNote) === getPitchClass(currentQuestionNote)) {
    sessionCorrectCount++;
    streak++; 
    statsForStage[currentQuestionNote].correct++;
    statsForStage[currentQuestionNote].totalTime += responseTime;

    if (currentStage === 3) {
      intervalStats[currentIntervalClass].correct++;
      intervalStats[currentIntervalClass].totalTime += responseTime;
    }
    
    if (streak > 0 && streak % 3 === 0) {
      currentNoteCount = Math.min(activeNoteSequence.length, currentNoteCount + 2);
    }
    saveStats(); updateAnalyticsUI(); updateDifficulty();

    playCorrectSE();
    document.body.classList.add('flash-green'); 
    setTimeout(() => document.body.classList.remove('flash-green'), 100);

    let basePoints = Math.max(10, Math.floor(1000 - responseTime / 3)); 
    let difficultyMultiplier = 1.0 + ((currentNoteCount - 4) * 0.25); 
    let stageMultiplier = STAGE_SCORE_MULTIPLIERS[currentStage] || 1.0;
    basePoints = Math.floor(basePoints * difficultyMultiplier * stageMultiplier);

    let msgHTML = `+${basePoints}点`;
    
    if (responseTime <= COMBO_TIME_THRESHOLD) {
      combo++;
      if (combo > maxCombo) maxCombo = combo;
      let speedMultiplier = Math.min(1.0 + (combo * 0.2), 3.0);
      let finalPoints = Math.floor(basePoints * speedMultiplier);
      msgHTML = `<span style="color:#f1c40f">⚡ +${finalPoints}点</span>`;
      score += finalPoints;

      // ★ 時間ボーナスはMAX_TIME_LEFTを超えて積み上がらないようにする（無限ゲーム化の防止）
      if (combo >= 9 && combo % 3 === 0) {
        timeLeft = Math.min(timeLeft + 4, MAX_TIME_LEFT); document.getElementById('combo-message').innerText = "⏰ +4秒!!";
      } else if (combo > 0 && combo % 6 === 0) {
        timeLeft = Math.min(timeLeft + 3, MAX_TIME_LEFT); document.getElementById('combo-message').innerText = "⏰ +3秒!";
      } else if (combo > 0 && combo % 3 === 0) {
        timeLeft = Math.min(timeLeft + 2, MAX_TIME_LEFT); document.getElementById('combo-message').innerText = "⏰ +2秒!";
      }

      if (combo % 3 === 0) {
        playLevelUpSFX(combo);
      }
    } else {
      combo = 0; score += basePoints; document.getElementById('combo-message').innerText = "";
    }
    
    updateStats();
    document.getElementById('game-message-area').innerHTML = msgHTML;
    const correctBtn = document.getElementById('note-'+answerNote);
    if(correctBtn) { correctBtn.classList.add('correct-highlight'); setTimeout(() => correctBtn.classList.remove('correct-highlight'), 300); }
    setTimeout(nextQuestion, 500);

  } else {
    streak = 0; combo = 0;

    // ★ 今回のプレイの弱点として記録する（ステージ3は音程、それ以外は音名で集計）
    const mistakeKey = (currentStage === 3) ? ('interval:' + currentIntervalClass) : currentQuestionNote;
    sessionMistakes[mistakeKey] = (sessionMistakes[mistakeKey] || 0) + 1;

    currentNoteCount = Math.max(4, currentNoteCount - 1);
    saveStats(); updateAnalyticsUI(); updateDifficulty(); 
    
    playIncorrectSE();
    document.body.classList.add('flash-red'); 
    setTimeout(() => document.body.classList.remove('flash-red'), 100);
    updateStats();
    
    const actualCorrectBtn = document.getElementById('note-'+currentQuestionNote);
    if(actualCorrectBtn) {
      actualCorrectBtn.classList.add('correct-highlight');
      setTimeout(() => actualCorrectBtn.classList.remove('correct-highlight'), 800);
    }

    document.getElementById('combo-message').innerText = "";
    // ★ 鍵盤のinnerTextを正規表現で加工すると、キー表記(例:「(Spc+A)」)が残ったり
    //   改行が混入したりするため、音名は noteNames から直接引く。
    //   また #game-message-area は flex-direction:column のため、テキストと<strong>が
    //   別々の行に分かれてしまう。1つの要素にまとめて1行で表示する。
    document.getElementById('game-message-area').innerHTML = `<div>正解: <strong>${noteNames[currentQuestionNote]}</strong></div>`;
    setTimeout(nextQuestion, 1000);
  }
}

function playFreePlayTone(noteName) {
  initAudio();
  playSaxTone(getFrequency(noteName), 0.6);
  const btn = document.getElementById('note-'+noteName);
  if (btn) { btn.classList.add('correct-highlight'); setTimeout(() => btn.classList.remove('correct-highlight'), 300); }
}

function updateStats() {
  document.getElementById('score').innerText = score;
  document.getElementById('time').innerText = timeLeft;
  document.getElementById('combo-count-large').innerText = combo;
  const comboInlineEl = document.getElementById('combo-inline-value');
  if (comboInlineEl) comboInlineEl.innerText = combo;
  document.getElementById('streak').innerText = streak;
  updateBackgroundByCombo(combo);
}

function saveStats() {
  localStorage.setItem('saxEarTrainStatsByStage', JSON.stringify(noteStatsByStage));
  localStorage.setItem('saxEarTrainIntervalStats', JSON.stringify(intervalStats));
}

// ==== ★ 苦手な音／音程ランキング（ステージごとに切り替え、「もっと見る」で追加表示）====
// ★ 苦手ランキングの並び順の比較関数
//   正答率を最優先（低いほど苦手＝上位）とし、正答率が同じ場合のみ反応速度（遅いほど上位）で比較する。
//   ※以前は (100-正答率)*10 + 平均時間 という合算式だったため、
//     正答率100%でも反応が遅いと1位になってしまう不具合があった。
function compareWeakness(a, b) {
  // 表示上の丸め(100%)に左右されないよう、生の正答率で比較する
  if (a.rawAccuracy !== b.rawAccuracy) return a.rawAccuracy - b.rawAccuracy; // 正答率が低い順
  return b.avgTime - a.avgTime; // 同率なら平均反応時間が遅い順
}

function updateAnalyticsUI() {
  const titleEl = document.getElementById('weak-notes-title');
  const listEl = document.getElementById('weak-notes-list');
  const moreBtn = document.getElementById('weak-notes-more-btn');
  if (!listEl) return;

  if (currentStage === 3) {
    // ★ ステージ3は「苦手な音程（跳躍）」のランキングを表示する
    if (titleEl) titleEl.innerText = '🚨 苦手な音程（跳躍）';

    let displayData = [];
    for (let i = 0; i <= 11; i++) {
      const stat = intervalStats[i];
      if (stat && stat.attempts > 2) {
        let rawAccuracy = stat.correct / stat.attempts;
        let accuracy = Math.round(rawAccuracy * 100);
        let avgTime = stat.correct > 0 ? Math.round(stat.totalTime / stat.correct) : 0;
        displayData.push({ label: intervalNames[i], accuracy, rawAccuracy, avgTime });
      }
    }
    if (displayData.length === 0) {
      listEl.innerHTML = `<div style="font-size:0.8em; color:#bdc3c7;">データが貯まると表示されます</div>`;
      if (moreBtn) moreBtn.style.display = 'none';
      return;
    }
    displayData.sort(compareWeakness);
    const shown = displayData.slice(0, weakNotesDisplayCount);
    let html = '';
    shown.forEach((d, i) => {
      html += `<div class="weak-note-item"><span>${i+1}. <strong>${d.label}</strong></span><span>正答率: ${d.accuracy}% / 平均: ${d.avgTime}ms</span></div>`;
    });
    listEl.innerHTML = html;
    if (moreBtn) moreBtn.style.display = (displayData.length > weakNotesDisplayCount) ? 'block' : 'none';
    return;
  }

  // ★ ステージ1・2は通常の「苦手な音」ランキング（ステージごとに別集計）
  if (titleEl) titleEl.innerText = `🚨 STAGE${currentStage} 苦手な音`;
  const statsForStage = noteStatsByStage[currentStage];
  let displayData = [];
  allNoteKeys.forEach(note => {
    let stat = statsForStage[note];
    if (stat && stat.attempts > 2) { 
      let rawAccuracy = stat.correct / stat.attempts;
      let accuracy = Math.round(rawAccuracy * 100);
      let avgTime = stat.correct > 0 ? Math.round(stat.totalTime / stat.correct) : 0;
      displayData.push({ note: note, accuracy: accuracy, rawAccuracy: rawAccuracy, avgTime: avgTime });
    }
  });
  if (displayData.length === 0) {
    listEl.innerHTML = `<div style="font-size:0.8em; color:#bdc3c7;">データが貯まると表示されます</div>`;
    if (moreBtn) moreBtn.style.display = 'none';
    return;
  }
  displayData.sort(compareWeakness);
  const shown = displayData.slice(0, weakNotesDisplayCount);
  let html = ''; 
  shown.forEach((d, i) => {
    html += `<div class="weak-note-item"><span>${i+1}. <strong>${noteNames[d.note]}</strong></span><span>正答率: ${d.accuracy}% / 平均: ${d.avgTime}ms</span></div>`;
  });
  listEl.innerHTML = html;
  if (moreBtn) moreBtn.style.display = (displayData.length > weakNotesDisplayCount) ? 'block' : 'none';
}

function showMoreWeakNotes() {
  weakNotesDisplayCount += 3;
  updateAnalyticsUI();
}

// ==== ★ 成長グラフ（外部ライブラリ不要のインラインSVGで描画）====
let chartMetric = 'score'; // 'score' | 'avgTime' | 'accuracy'

const CHART_METRICS = {
  score:    { label: 'スコア',   unit: '点',  color: '#1abc9c', betterIsHigh: true },
  avgTime:  { label: '平均反応', unit: 'ms',  color: '#f1c40f', betterIsHigh: false },
  accuracy: { label: '正答率',   unit: '%',   color: '#3498db', betterIsHigh: true }
};

function setChartMetric(metric) {
  chartMetric = metric;
  document.querySelectorAll('.chart-tab').forEach(b => {
    b.classList.toggle('active', b.dataset.metric === metric);
  });
  renderGrowthChart();
}

function renderGrowthChart() {
  const el = document.getElementById('growth-chart');
  const summaryEl = document.getElementById('growth-chart-summary');
  const titleEl = document.getElementById('growth-chart-title');
  if (!el) return;

  const conf = CHART_METRICS[chartMetric];
  if (titleEl) titleEl.innerText = `📈 STAGE${currentStage} の成長`;

  // ★ 旧バージョンの履歴にはstageが無いため、STAGE1の記録として扱う
  const data = scoreHistory
    .filter(h => (h.stage || 1) === currentStage)
    .filter(h => h[chartMetric] !== undefined && h[chartMetric] !== null)
    .slice(-20); // 直近20回分

  if (data.length < 2) {
    el.innerHTML = `<div class="chart-empty">STAGE${currentStage}を2回以上プレイすると<br>グラフが表示されます</div>`;
    if (summaryEl) summaryEl.innerHTML = '';
    return;
  }

  const values = data.map(d => Number(d[chartMetric]) || 0);
  let min = Math.min(...values);
  let max = Math.max(...values);
  if (min === max) { min -= 1; max += 1; } // 全て同じ値でも描画できるようにする

  const W = 300, H = 120;
  const padL = 38, padR = 8, padT = 10, padB = 14;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  const xAt = (i) => padL + plotW * (i / (data.length - 1));
  const yAt = (v) => padT + plotH - ((v - min) / (max - min)) * plotH;

  const linePoints = values.map((v, i) => `${xAt(i).toFixed(1)},${yAt(v).toFixed(1)}`).join(' ');
  // 折れ線の下を薄く塗る（面グラフ風）
  const areaPoints = `${padL},${padT + plotH} ${linePoints} ${(padL + plotW).toFixed(1)},${padT + plotH}`;

  // 目盛り（上・中・下の3本）
  let gridSvg = '';
  for (let g = 0; g <= 2; g++) {
    const v = min + (max - min) * (1 - g / 2);
    const gy = padT + (plotH * g / 2);
    gridSvg += `<line x1="${padL}" y1="${gy.toFixed(1)}" x2="${W - padR}" y2="${gy.toFixed(1)}" stroke="rgba(255,255,255,0.12)" stroke-width="1"/>`;
    gridSvg += `<text x="${padL - 4}" y="${(gy + 3).toFixed(1)}" fill="#95a5a6" font-size="8" text-anchor="end">${Math.round(v)}</text>`;
  }

  // データ点（最新の点だけ強調）
  let dotsSvg = '';
  values.forEach((v, i) => {
    const isLast = i === values.length - 1;
    dotsSvg += `<circle cx="${xAt(i).toFixed(1)}" cy="${yAt(v).toFixed(1)}" r="${isLast ? 3.5 : 2}" fill="${isLast ? '#fff' : conf.color}" stroke="${conf.color}" stroke-width="${isLast ? 2 : 0}"/>`;
  });

  el.innerHTML = `
    <svg viewBox="0 0 ${W} ${H}" class="growth-chart-svg" preserveAspectRatio="none" role="img" aria-label="${conf.label}の推移">
      ${gridSvg}
      <polygon points="${areaPoints}" fill="${conf.color}" opacity="0.14"/>
      <polyline points="${linePoints}" fill="none" stroke="${conf.color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
      ${dotsSvg}
    </svg>
    <div class="chart-axis-note">← 古い　　直近${data.length}回　　新しい →</div>
  `;

  // ★ 「最初と比べてどれだけ伸びたか」のサマリー
  if (summaryEl) {
    const first = values[0];
    const last = values[values.length - 1];
    const diff = last - first;
    const improved = conf.betterIsHigh ? (diff > 0) : (diff < 0);
    const sign = diff > 0 ? '+' : '';
    const color = diff === 0 ? '#95a5a6' : (improved ? '#2ecc71' : '#e74c3c');
    const icon = diff === 0 ? '→' : (improved ? '📈' : '📉');
    const best = conf.betterIsHigh ? Math.max(...values) : Math.min(...values);
    summaryEl.innerHTML = `
      <div class="chart-summary-row">
        <span>最新: <strong style="color:${conf.color};">${last}${conf.unit}</strong></span>
        <span style="color:${color};">${icon} ${sign}${diff}${conf.unit}</span>
      </div>
      <div class="chart-summary-sub">${conf.betterIsHigh ? '自己最高' : '自己最速'}: ${best}${conf.unit}（直近20回中）</div>
    `;
  }
}

function updateHistoryUI() {
  const listEl = document.getElementById('history-list');
  if (scoreHistory.length === 0) { listEl.innerHTML = "<div style='color:#bdc3c7; text-align:center;'>まだ履歴がありません</div>"; return; }
  let html = '';
  scoreHistory.slice().reverse().slice(0, 10).forEach((data) => {
    const stageLabel = `STAGE${data.stage || 1}`;
    const focusLabel = data.focus ? ' 🎯' : '';
    const detail = (data.accuracy !== undefined)
      ? `正答率 ${data.accuracy}% ・ 平均 ${data.avgTime}ms<br>`
      : '';
    html += `<div class="history-item"><div style="font-size:1.1em; font-weight:bold;">${data.score} 点 <span style="font-size:0.6em; color:#f1c40f;">${stageLabel}${focusLabel}</span></div><div style="color:#bdc3c7; font-size:0.85em;">最大コンボ: ${data.streak}<br>${detail}<small>${data.date}</small></div></div>`;
  });
  listEl.innerHTML = html;
}

// ★ 今回のプレイで間違えた音／音程のワースト3を、リザルト用のHTMLとして生成する
function buildSessionWeaknessHTML() {
  const entries = Object.keys(sessionMistakes)
    .map(key => ({ key, count: sessionMistakes[key] }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 3);

  if (entries.length === 0) {
    return `<div class="session-weak-box session-weak-perfect">🎉 ノーミス！今回は間違いゼロでした</div>`;
  }

  const label = (key) => {
    if (key.startsWith('interval:')) {
      const idx = parseInt(key.split(':')[1], 10);
      return intervalNames[idx] || '?';
    }
    return noteNames[key] || key;
  };

  const title = (currentStage === 3) ? '今回ミスした音程' : '今回ミスした音';
  let html = `<div class="session-weak-box"><div class="session-weak-title">📝 ${title}</div><div class="session-weak-items">`;
  entries.forEach(e => {
    html += `<span class="session-weak-item"><strong>${label(e.key)}</strong> ×${e.count}</span>`;
  });
  html += `</div></div>`;
  return html;
}

function endGame() {
  clearInterval(timerInterval);
  isPlayingGame = false; 
  isWaitingForAnswer = false;
  // ★ ここではスクロール用の余白(no-scroll)を解除しない。
  //   解除すると下部の余白が急に消えて画面が跳ねるうえ、リザルトを読むための
  //   スクロールもしづらくなるため。スタート画面に戻る時にまとめて解除する。
  
  document.getElementById('instrument-select').disabled = false; 
  document.getElementById('keyboard-mode-select').disabled = false;
  document.getElementById('time').innerText = "0";
  
  const finalCombo = maxCombo;
  combo = 0; document.getElementById('combo-count-large').innerText = combo;
  updateBackgroundByCombo(0);
  updateDifficulty(); // ★ フリープレイ用に全音アクティブ化（鍵盤はそのまま使える）
  
  // ★ 成長グラフ用に、ステージ・平均反応時間・正答率・タイムスタンプも履歴に残す
  const now = new Date();
  scoreHistory.push({
    score: score,
    streak: finalCombo,
    date: now.toLocaleString(),
    ts: now.getTime(),
    stage: currentStage,
    avgTime: sessionAnsweredCount > 0 ? Math.round(sessionTotalTime / sessionAnsweredCount) : 0,
    accuracy: sessionAnsweredCount > 0 ? Math.round((sessionCorrectCount / sessionAnsweredCount) * 100) : 0,
    focus: focusWeakMode
  });
  // 履歴が無限に増えないよう直近200件までに制限する
  if (scoreHistory.length > 200) scoreHistory = scoreHistory.slice(-200);
  localStorage.setItem('saxEarTrainHistory', JSON.stringify(scoreHistory));
  updateHistoryUI(); 
  renderGrowthChart(); // ★ グラフも最新の記録で更新
  
  // ★ ベストスコアは「プレイしたステージ」の記録として更新する
  const wasStage2Unlocked = isStageUnlocked(2);
  const wasStage3Unlocked = isStageUnlocked(3);
  const isNewBest = score > (bestScoreByStage[currentStage] || 0);
  if (isNewBest) {
    bestScoreByStage[currentStage] = score;
    localStorage.setItem('saxEarTrainBestScoreByStage', JSON.stringify(bestScoreByStage));
  }
  renderStageLockState();
  updateGameStatusLine();
  
  const stage2JustUnlocked = !wasStage2Unlocked && isStageUnlocked(2);
  const stage3JustUnlocked = !wasStage3Unlocked && isStageUnlocked(3);
  
  let rankName = ""; let rankColor = ""; let rankDesc = "";
  if (score < 10000) { rankName = "🥉 ビギナー"; rankColor = "#cd7f32"; rankDesc = "近い音程の距離感が掴めてきたレベル"; }
  else if (score < 25000) { rankName = "🥈 レギュラー"; rankColor = "#bdc3c7"; rankDesc = "1オクターブ内の跳躍に迷いがなくなってきたレベル"; }
  else if (score < 40000) { rankName = "🏅 ベテラン"; rankColor = "#3498db"; rankDesc = "拡張レンジでの跳躍にも素早く反応できる、瞬時の判断力が身についてきた証！"; }
  else if (score < 50000) { rankName = "🥇 エキスパート"; rankColor = "#f1c40f"; rankDesc = "基準のドに対する相対音感が強固になり、ほぼノータイムで音が取れるレベル"; }
  else if (score < 100000) { rankName = "👑 マスター"; rankColor = "#e67e22"; rankDesc = "考えなくても指が動く、完璧な相対音感と反射神経の持ち主"; }
  else if (score < 150000) { rankName = "🏆 グランドマスター"; rankColor = "#8e44ad"; rankDesc = "ステージ3の惑わせにも動じない、名手と呼ぶにふさわしい領域"; }
  else { rankName = "✨ 神の耳"; rankColor = "#ff4500"; rankDesc = "システムと完全に同化。限界スピードでの連続正解を維持できる究極の耳！"; }
  
  let endMsg = `<div class="result-score-line">🏁 ${score}点 <span style="font-size:0.75em; color:#bdc3c7;">(最大コンボ: ${finalCombo})</span></div>`;
  endMsg += `<div class="rank-display" style="color:${rankColor};">${rankName}<br><span style="font-size:0.55em; font-weight:normal; color:#ecf0f1;">${rankDesc}</span></div>`;

  // ★★★ 操作ボタンはリザルトの「上部」に置く。
  //     スマホ横画面では画面が狭く、弱点サマリー等を先に置くと「もう一度プレイ」が
  //     画面外に押し出されて連続プレイの妨げになるため。 ★★★
  endMsg += `<div class="result-actions">`;
  endMsg += `<button class="action-btn" onclick="startSequence()">もう一度プレイ <small>(Enter)</small></button>`;
  endMsg += `<button class="link-btn" onclick="returnToStartScreen();">🔁 ステージ選択</button>`;
  endMsg += `</div>`;

  if (stage2JustUnlocked) { endMsg += `<div style="color:#2ecc71; font-weight:bold; margin-bottom:6px;">🔓 ステージ2がアンロックされました！</div>`; }
  if (stage3JustUnlocked) { endMsg += `<div style="color:#2ecc71; font-weight:bold; margin-bottom:6px;">🔓 ステージ3がアンロックされました！</div>`; }

  // ★★★ ランキング送信UIはフルスクリーンモーダルではなく、メッセージエリア内に直接埋め込む。
  //     こうすることで、下の鍵盤（フリープレイ用ピアノ）が隠れず、常に操作できる。 ★★★
  if (isNewBest) {
    endMsg += `<div style="color:#f1c40f; font-weight:bold; margin-top:6px;">🎉 STAGE${currentStage} 自己ベスト更新！ランキングに記録しよう</div>`;
    endMsg += `
      <div class="score-submit-box">
        <input type="text" id="player-name-input" class="score-name-input" placeholder="お名前を入力 (10文字以内)" maxlength="10">
        <button id="submit-score-btn" class="action-btn" onclick="submitScore(${score}, ${finalCombo})" style="width:100%; margin-top:8px;">📤 ランキングにスコアを送信</button>
        <div id="submit-status-msg" class="score-submit-status"></div>
      </div>`;
  }

  // ★ 今回のプレイの弱点サマリー
  endMsg += buildSessionWeaknessHTML();

  endMsg += `<div style="font-size:0.8em; color:#1abc9c; margin: 8px 0;">🎹 下の鍵盤はそのまま鳴らせます。ピッチ確認にどうぞ。</div>`;

  document.getElementById('game-message-area').innerHTML = endMsg;

  if (isNewBest) {
    const nameInput = document.getElementById('player-name-input');
    if (nameInput) nameInput.value = localStorage.getItem('saxEarTrainPlayerName') || '';
  }
}

// ==== ★ スコアの外部送信（GASスプレッドシートへ記録＋Discordへの閾値通知）====
// ★ 端末ごとの匿名ID（ランキングの名寄せ用）
//   名前を変えて何度も送信されるとランキングに同一人物が複数並んでしまうため、
//   端末ごとに固定のIDを一緒に送り、GAS側で「1端末＝1エントリ」に集約できるようにする。
//   ※個人を特定する情報は一切含まない、ランダムな文字列です。
function getOrCreateDeviceId() {
  let id = localStorage.getItem('saxEarTrainDeviceId');
  if (!id) {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') {
      id = window.crypto.randomUUID();
    } else {
      id = 'dev-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
    }
    localStorage.setItem('saxEarTrainDeviceId', id);
  }
  return id;
}

function submitScore(finalScore, finalCombo) {
  const statusEl = document.getElementById('submit-status-msg');
  const nameInput = document.getElementById('player-name-input');
  const submitBtn = document.getElementById('submit-score-btn');
  const playerName = nameInput ? nameInput.value.trim() : '';

  if (!playerName) {
    if (statusEl) statusEl.innerText = '⚠️ 名前を入力してください';
    return;
  }

  // ★ 次回以降のためにプレイヤー名を保存（キー名の誤字を修正: saxEarTrainerName → saxEarTrainPlayerName）
  localStorage.setItem('saxEarTrainPlayerName', playerName);

  if (submitBtn) submitBtn.disabled = true;
  if (statusEl) statusEl.innerText = '送信中... (Sending...)';

  // ==== 1. GAS（スプレッドシート）へ送信 ====
  fetch(GAS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' }, // ★ GAS側のCORSプリフライト回避のためtext/plainを維持
    body: JSON.stringify({ name: playerName, score: finalScore, combo: finalCombo, deviceId: getOrCreateDeviceId() })
  })
  .then(() => {
    if (statusEl) statusEl.innerText = '✅ 送信完了！ランキングを更新しました';
    if (typeof loadLeaderboard === 'function') loadLeaderboard();
  })
  .catch(err => {
    console.error(err);
    if (statusEl) statusEl.innerText = '⚠️ 送信に失敗しました。時間をおいて再試行してください。';
  })
  .finally(() => {
    if (submitBtn) submitBtn.disabled = false;
  });

  // ==== 2. スコアが閾値を超えていればDiscordへ通知 ====
  if (finalScore >= SCORE_ALERT_THRESHOLD) {
    fetch(DISCORD_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: "🔥 伝説誕生！ **" + playerName + "** が驚異の **" + finalScore + "点** を叩き出しました！ (最大コンボ: " + finalCombo + ")"
      })
    }).catch(err => {
      console.error('Discordへの通知に失敗しました:', err);
    });
  }
}

// ==== ★ PC用キー割り当て（カスタマイズ可能）====
const defaultKeyBindings = {
  'LowA': 'z', 'LowB': 'x',
  'C': 'a', 'D': 's', 'E': 'd', 'F': 'f', 'G': 'j', 'A': 'k', 'B': 'l', 'HighC': ';',
  'HighD': 'q', 'HighE': 'i'
};

const defaultBlackKeyBindings = {
  'LowBb': 'r',
  'Db': 'w', 'Eb': 'e', 'Gb': 't', 'Ab': 'y', 'Bb': 'u',
  'HighDb': 'o', 'HighEb': 'p'
};

function loadKeyBindings() {
  try {
    const saved = JSON.parse(localStorage.getItem('saxEarTrainKeyBindings'));
    if (saved && typeof saved === 'object') {
      return Object.assign({}, defaultKeyBindings, saved);
    }
  } catch (e) {}
  return Object.assign({}, defaultKeyBindings);
}

function loadBlackKeyBindings() {
  try {
    const saved = JSON.parse(localStorage.getItem('saxEarTrainBlackKeyBindings'));
    if (saved && typeof saved === 'object') {
      return Object.assign({}, defaultBlackKeyBindings, saved);
    }
  } catch (e) {}
  return Object.assign({}, defaultBlackKeyBindings);
}

let keyBindings = loadKeyBindings();
let blackKeyBindings = loadBlackKeyBindings();
let keyMap = {};
let domKeyMap = {};
let blackKeyMap = {};

function handleSemitoneModeChange() {
  semitoneInputMode = document.getElementById('semitone-mode-select').value;
  localStorage.setItem('saxEarTrainSemitoneInputMode', semitoneInputMode);
  updateKeyHintLabels();
}

function rebuildKeyMaps() {
  keyMap = {}; domKeyMap = {};
  Object.keys(keyBindings).forEach(note => {
    const key = (keyBindings[note] || '').toLowerCase();
    if (!key) return;
    keyMap[key] = note;
    domKeyMap[key] = 'note-' + note;
  });

  blackKeyMap = {};
  Object.keys(blackKeyBindings).forEach(note => {
    const key = (blackKeyBindings[note] || '').toLowerCase();
    if (!key) return;
    blackKeyMap[key] = note;
  });
}

function updateKeyHintLabels() {
  keybindableNotes.forEach(note => {
    const el = document.getElementById('keyhint-' + note);
    if (el && keyBindings[note]) el.innerText = `(${keyBindings[note].toUpperCase()})`;
  });
  Object.keys(sharpKeyMap).forEach(whiteNote => {
    const blackNote = sharpKeyMap[whiteNote];
    const el = document.getElementById('keyhint-' + blackNote);
    if (!el) return;
    if (semitoneInputMode === 'dedicated' && blackKeyBindings[blackNote]) {
      el.innerText = `(${blackKeyBindings[blackNote].toUpperCase()})`;
    } else if (keyBindings[whiteNote]) {
      el.innerText = `(Spc+${keyBindings[whiteNote].toUpperCase()})`;
    }
  });
}

function showKeybindModal() {
  renderKeybindModalContent();
  document.getElementById('keybind-modal-overlay').classList.add('visible');
}
function closeKeybindModal() { document.getElementById('keybind-modal-overlay').classList.remove('visible'); }

function renderKeybindModalContent() {
  let html = '<div class="keybind-section-label">🎼 白鍵</div>';
  keybindableNotes.forEach(note => {
    const currentKey = (keyBindings[note] || '').toUpperCase();
    html += `
      <div class="keybind-row">
        <span class="keybind-note-label">${noteNames[note]}</span>
        <input type="text" class="keybind-input" data-note="${note}" data-black="0" value="${currentKey}" maxlength="1"
               onkeydown="handleKeybindCapture(event, this)" onfocus="this.select();">
      </div>`;
  });

  if (semitoneInputMode === 'dedicated') {
    html += '<div class="keybind-section-label">🎹 黒鍵（半音・専用キー）</div>';
    Object.keys(sharpKeyMap).forEach(whiteNote => {
      const blackNote = sharpKeyMap[whiteNote];
      const currentKey = (blackKeyBindings[blackNote] || '').toUpperCase();
      html += `
        <div class="keybind-row">
          <span class="keybind-note-label">${noteNames[blackNote]}</span>
          <input type="text" class="keybind-input" data-note="${blackNote}" data-black="1" value="${currentKey}" maxlength="1"
                 onkeydown="handleKeybindCapture(event, this)" onfocus="this.select();">
        </div>`;
    });
  } else {
    html += '<p style="font-size:0.8em; color:#95a5a6; margin: 10px 0 0 0;">現在「修飾キー(Space)」モードのため、黒鍵は <strong>Space + 白鍵</strong> で入力します（個別設定なし）。</p>';
  }

  document.getElementById('keybind-list').innerHTML = html;
  document.getElementById('keybind-status-msg').innerText = '';
}

function handleKeybindCapture(e, inputEl) {
  e.preventDefault();
  let key = e.key;
  if (key.length !== 1) return;
  if (key === ' ') { 
    document.getElementById('keybind-status-msg').innerText = '⚠️ スペースキーは予約されているため使用できません';
    return; 
  }
  inputEl.value = key.toUpperCase();
}

function saveKeybindSettings() {
  const inputs = document.querySelectorAll('.keybind-input');
  const newWhiteBindings = {}; const newBlackBindings = {}; const usedKeys = new Set(); let hasDuplicate = false;

  inputs.forEach(input => {
    const note = input.dataset.note;
    const isBlack = input.dataset.black === '1';
    const key = input.value.trim().toLowerCase();
    if (!key) return;
    if (usedKeys.has(key)) hasDuplicate = true;
    usedKeys.add(key);
    if (isBlack) { newBlackBindings[note] = key; } else { newWhiteBindings[note] = key; }
  });

  if (hasDuplicate) {
    document.getElementById('keybind-status-msg').innerText = '⚠️ 同じキーが複数の音に割り当てられています。重複を解消してください。';
    return;
  }

  keyBindings = newWhiteBindings;
  blackKeyBindings = Object.assign({}, blackKeyBindings, newBlackBindings);

  localStorage.setItem('saxEarTrainKeyBindings', JSON.stringify(keyBindings));
  localStorage.setItem('saxEarTrainBlackKeyBindings', JSON.stringify(blackKeyBindings));
  rebuildKeyMaps();
  updateKeyHintLabels();
  document.getElementById('keybind-status-msg').innerText = '✅ 保存しました！';
}

function resetKeybindSettings() {
  keyBindings = Object.assign({}, defaultKeyBindings);
  blackKeyBindings = Object.assign({}, defaultBlackKeyBindings);
  localStorage.setItem('saxEarTrainKeyBindings', JSON.stringify(keyBindings));
  localStorage.setItem('saxEarTrainBlackKeyBindings', JSON.stringify(blackKeyBindings));
  rebuildKeyMaps();
  updateKeyHintLabels();
  renderKeybindModalContent();
  document.getElementById('keybind-status-msg').innerText = '↺ デフォルトのキー割り当てに戻しました。';
}

let isSpaceHeld = false;

window.addEventListener('keydown', (e) => {
  const key = e.key.toLowerCase();

  // ★ 練習用ピアノ画面が表示中は、専用のキー入力ロジックに完全に委譲する（本編の判定は行わない）
  const practiceScreenVisible = document.getElementById('practice-piano-screen').style.display !== 'none';
  if (practiceScreenVisible) {
    const activeTag = document.activeElement ? document.activeElement.tagName : '';
    if (activeTag === 'SELECT' || activeTag === 'INPUT' || activeTag === 'TEXTAREA') return;
    handlePracticePianoKeydown(e, key);
    return;
  }

  if (e.code === 'Space' || e.key === ' ') {
    const activeTag = document.activeElement ? document.activeElement.tagName : '';
    if (activeTag === 'SELECT' || activeTag === 'INPUT' || activeTag === 'TEXTAREA') return;
    if (document.getElementById('rules-modal-overlay').classList.contains('visible')) return;
    if (document.getElementById('keybind-modal-overlay').classList.contains('visible')) return;
    if (document.getElementById('tutorial-overlay').classList.contains('visible')) return;

    e.preventDefault();
    isSpaceHeld = true;
    return;
  }

  if (e.code === 'Enter') {
    const activeTag = document.activeElement ? document.activeElement.tagName : '';
    if (activeTag === 'SELECT' || activeTag === 'INPUT' || activeTag === 'TEXTAREA') return;
    if (document.getElementById('rules-modal-overlay').classList.contains('visible')) return;
    if (document.getElementById('keybind-modal-overlay').classList.contains('visible')) return;
    if (document.getElementById('tutorial-overlay').classList.contains('visible')) return;

    e.preventDefault();

    const startScreenVisible = document.getElementById('start-screen').style.display !== 'none';
    if (startScreenVisible) {
      if (!isPlayingGame && !isCountingDown) beginGame();
    } else if (!isPlayingGame && !isCountingDown) {
      startSequence();
    }
    return;
  }

  if (keyMap[key]) {
    let targetNote = keyMap[key];
    if (semitoneInputMode === 'modifier' && isSpaceHeld && sharpKeyMap[targetNote]) {
      targetNote = sharpKeyMap[targetNote];
    }
    const btn = document.getElementById('note-' + targetNote);
    if (btn && getEffectiveAvailableNotes().includes(targetNote)) {
      btn.classList.add('pressed'); checkAnswer(targetNote);
    }
    return;
  }

  if (semitoneInputMode === 'dedicated' && blackKeyMap[key]) {
    const targetNote = blackKeyMap[key];
    const btn = document.getElementById('note-' + targetNote);
    if (btn && getEffectiveAvailableNotes().includes(targetNote)) {
      btn.classList.add('pressed'); checkAnswer(targetNote);
    }
    return;
  }
});
window.addEventListener('keyup', (e) => {
  if (e.code === 'Space' || e.key === ' ') { isSpaceHeld = false; }

  const key = e.key.toLowerCase();
  if (keyMap[key]) {
    const baseNote = keyMap[key];
    const baseBtn = document.getElementById('note-' + baseNote);
    if (baseBtn) baseBtn.classList.remove('pressed');
    if (sharpKeyMap[baseNote]) {
      const sharpBtn = document.getElementById('note-' + sharpKeyMap[baseNote]);
      if (sharpBtn) sharpBtn.classList.remove('pressed');
    }
  }
  if (blackKeyMap[key]) {
    const blackBtn = document.getElementById('note-' + blackKeyMap[key]);
    if (blackBtn) blackBtn.classList.remove('pressed');
  }
});

// ==== ★ ランキング取得とページネーション ====
let globalRankingData = [];
let currentRankingDisplayCount = 10;

// ★ 他人が入力した名前をそのままinnerHTMLに挿入するとスクリプトを埋め込まれる恐れがある(XSS)ため、
//   表示前に必ずHTMLとして無害化する
function escapeHtml(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function loadLeaderboard() {
  const listEl = document.getElementById('global-ranking-list');
  if (!listEl) return;

  fetch(GAS_URL)
    .then(response => response.json())
    .then(data => {
      // ★ GASが配列以外（エラーオブジェクト等）を返した場合に落ちないようガードする
      globalRankingData = Array.isArray(data) ? data : [];
      currentRankingDisplayCount = 10;
      renderLeaderboard();
    })
    .catch(err => {
      console.error(err);
      listEl.innerHTML = '<div style="text-align:center; color:#e74c3c;">ランキング取得エラー</div>';
    });
}

function renderLeaderboard() {
  const listEl = document.getElementById('global-ranking-list');
  const btn = document.getElementById('show-more-ranking-btn');
  if (!listEl) return;

  if (globalRankingData.length === 0) {
    listEl.innerHTML = '<div style="text-align:center; color:#bdc3c7;">まだ記録がありません</div>';
    if (btn) btn.style.display = 'none';
    return;
  }

  let html = '';
  const displayData = globalRankingData.slice(0, currentRankingDisplayCount);

  displayData.forEach((entry, index) => {
    let rankColor = index === 0 ? '#f1c40f' : index === 1 ? '#bdc3c7' : index === 2 ? '#cd7f32' : '#ecf0f1';
    let rankIcon = index === 0 ? '👑' : index + 1;
    const safeName = escapeHtml(entry.name);
    const safeScore = escapeHtml(entry.score);
    const safeCombo = escapeHtml(entry.combo);

    html += `<div style="display:flex; justify-content:space-between; background:rgba(255,255,255,0.05); padding:8px; margin-bottom:5px; border-radius:5px; align-items:center;">
               <div style="font-weight:bold; color:${rankColor}; width:30px; font-size:1.2em;">${rankIcon}</div>
               <div style="flex-grow:1; text-align:left; font-weight:bold; word-break:break-all;">${safeName}</div>
               <div style="text-align:right;">
                 <span style="color:#1abc9c; font-weight:bold; font-size:1.1em;">${safeScore}</span><br>
                 <span style="font-size:0.7em; color:#95a5a6;">${safeCombo} Combo</span>
               </div>
             </div>`;
  });
  listEl.innerHTML = html;

  if (btn) {
    if (globalRankingData.length > currentRankingDisplayCount) {
      btn.style.display = 'block';
    } else {
      btn.style.display = 'none';
    }
  }
}

function showMoreRankings() {
  currentRankingDisplayCount += 10;
  renderLeaderboard();
}

// ==== ★ 画面の初期化 ====
// ここはスクリプトの最後で実行する。
// 途中で実行すると、まだ宣言されていない後方のlet/constを参照して
// ReferenceError(Temporal Dead Zone)となり、以降の変数が全て初期化されなくなるため。
function initApp() {
  document.getElementById('notation-select').value = notationMode;
  document.getElementById('semitone-mode-select').value = semitoneInputMode;
  document.getElementById('device-badge').innerText = `判定端末: ${DEVICE_LABELS[deviceType]}`;
  updateNoteLabels();
  updateBgmToggleUI();
  updateFocusWeakToggleUI();
  rebuildKeyMaps();
  updateKeyHintLabels();
  updateHistoryUI();
  updateAnalyticsUI();
  updateKeyboardUI();
  renderStageLockState();
  updateGameStatusLine();
  renderGrowthChart();
}
initApp();

window.addEventListener('load', loadLeaderboard);