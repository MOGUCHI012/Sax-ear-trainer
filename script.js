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

// ==== ★ ゲームプレイ中の画面スクロールをロックする ====
function lockBodyScroll() {
  document.documentElement.classList.add('no-scroll');
  document.body.classList.add('no-scroll');
}
function unlockBodyScroll() {
  document.documentElement.classList.remove('no-scroll');
  document.body.classList.remove('no-scroll');
}
// プレイ中（カウントダウン含む）はtouchmoveによるスクロール・引っ張りも無効化する
document.addEventListener('touchmove', function (e) {
  if (isPlayingGame || isCountingDown) {
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
  try { bgmAudio.volume = BGM_VOLUME; } catch (e) {}
  bgmAudio.play().catch(() => {}); // 自動再生が拒否された場合も静かに無視する
}

// ★ fade=trueの時（ゲーム開始時）は完全停止させず、ごく小さい音量でループを継続する。
//   iOSでは<audio>要素の再生が完全に途切れると音声セッションが"ambient"扱いに戻り、
//   サイレントスイッチや一部のイヤホン/Bluetooth機器でWeb Audio API（効果音）が
//   聞こえなくなることがあるため、その対策として「無音に近い音量」で再生を継続する。
const BGM_SILENT_FLOOR = 0.001;
function stopBGM(fade = true) {
  clearInterval(bgmFadeInterval);
  if (!fade) { bgmAudio.pause(); try { bgmAudio.volume = BGM_VOLUME; } catch (e) {} return; }

  const FADE_STEPS = 8;
  const STEP_MS = 50;
  let step = 0;
  const startVolume = bgmAudio.volume;
  bgmFadeInterval = setInterval(() => {
    step++;
    try { bgmAudio.volume = Math.max(BGM_SILENT_FLOOR, startVolume * (1 - step / FADE_STEPS)); } catch (e) {}
    if (step >= FADE_STEPS) {
      clearInterval(bgmFadeInterval);
      // ★ pause()はせず、無音に近い音量のまま再生を継続する（iOSの音声セッション維持のため）
    }
  }, STEP_MS);
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
updateBgmToggleUI();

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

// ==== ★ ステージ管理 ====
let currentStage = 1;
const STAGE2_UNLOCK_SCORE = 20000;
const STAGE3_UNLOCK_SCORE = 50000;
const stage3ReferencePool = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

// ★ ステージ別スコア補正倍率：ステージが上がるほど純粋に難しくなり得点が伸びにくくなるため、
//   同程度の実力ならステージ1に近いスコアが出るように底上げする。
//   ただしステージ1の記録が簡単に抜かれないよう、完全に同等にはせず控えめに設定している。
const STAGE_SCORE_MULTIPLIERS = { 1: 1.0, 2: 1.8, 3: 2.8 };
let bestScore = parseInt(localStorage.getItem('saxEarTrainBestScore') || '0', 10);

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

document.getElementById('notation-select').value = notationMode;
document.getElementById('semitone-mode-select').value = semitoneInputMode;
updateNoteLabels();
updateHistoryUI(); updateAnalyticsUI(); updateKeyboardUI(); renderStageLockState(); updateGameStatusLine();
document.getElementById('device-badge').innerText = `判定端末: ${DEVICE_LABELS[deviceType]}`;

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
function renderStageLockState() {
  const stage2Unlocked = bestScore >= STAGE2_UNLOCK_SCORE;
  const stage3Unlocked = bestScore >= STAGE3_UNLOCK_SCORE;

  document.getElementById('stage-2-card').classList.toggle('locked', !stage2Unlocked);
  document.getElementById('stage-2-lock-label').style.display = stage2Unlocked ? 'none' : 'inline-block';

  document.getElementById('stage-3-card').classList.toggle('locked', !stage3Unlocked);
  document.getElementById('stage-3-lock-label').style.display = stage3Unlocked ? 'none' : 'inline-block';

  if ((currentStage === 2 && !stage2Unlocked) || (currentStage === 3 && !stage3Unlocked)) {
    selectStage(1);
  }
}

function selectStage(stageNum) {
  if (stageNum === 2 && bestScore < STAGE2_UNLOCK_SCORE) return;
  if (stageNum === 3 && bestScore < STAGE3_UNLOCK_SCORE) return;
  currentStage = stageNum;
  document.getElementById('stage-1-card').classList.toggle('selected', stageNum === 1);
  document.getElementById('stage-2-card').classList.toggle('selected', stageNum === 2);
  document.getElementById('stage-3-card').classList.toggle('selected', stageNum === 3);
  weakNotesDisplayCount = 3; // ★ ステージ切替時はランキング表示件数をリセット
  updateAnalyticsUI(); // ★ ステージごとに異なるランキングをすぐ反映
}

function showRulesModal() { document.getElementById('rules-modal-overlay').classList.add('visible'); }
function closeRulesModal() { document.getElementById('rules-modal-overlay').classList.remove('visible'); }

function updateGameStatusLine() {
  const instrumentText = document.getElementById('instrument-select').selectedOptions[0].text;
  const modeText = document.getElementById('keyboard-mode-select').selectedOptions[0].text;
  document.getElementById('game-status-line').innerText = `🎷 ${instrumentText} ・ ${modeText} ・ STAGE ${currentStage}`;

  const progressEl = document.getElementById('stage-progress-line');
  if (progressEl) {
    if (bestScore < STAGE2_UNLOCK_SCORE) {
      progressEl.innerText = `🏁 ベストスコア: ${bestScore}点（あと${STAGE2_UNLOCK_SCORE - bestScore}点でSTAGE2解放）`;
    } else if (bestScore < STAGE3_UNLOCK_SCORE) {
      progressEl.innerText = `🏁 ベストスコア: ${bestScore}点（あと${STAGE3_UNLOCK_SCORE - bestScore}点でSTAGE3解放）`;
    } else {
      progressEl.innerText = `🏁 ベストスコア: ${bestScore}点（全ステージ解放済み）`;
    }
  }
}

function beginGame() {
  document.getElementById('start-screen').style.display = 'none';
  document.getElementById('game-screen').style.display = 'block';
  stopBGM(true);
  lockBodyScroll(); // ★ ゲーム画面に入るのでスクロールをロック
  startSequence();
}

function returnToStartScreen() {
  document.getElementById('game-screen').style.display = 'none';
  document.getElementById('start-screen').style.display = 'block';
  document.getElementById('start-btn').style.display = '';
  unlockBodyScroll(); // ★ 念のためここでもロック解除
  renderStageLockState();
  playBGM();
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

  let candidates = currentAvailableNotes.filter(n => !isImmediateRepeat(n) && !formsSimpleScaleRun(n));
  if (candidates.length === 0) candidates = currentAvailableNotes.filter(n => !isImmediateRepeat(n));
  if (candidates.length === 0) candidates = currentAvailableNotes;

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
    ? `🎵 基準音(${noteNames[referenceNoteName]}) ➡ 問題音...(基準音に惑わされず聴き分けよう)`
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
    noteStatsByStage[currentStage][currentQuestionNote].attempts++; 

    // ★ ステージ3のみ：基準音からの半音差（0〜11）を「音程」として集計する
    if (currentStage === 3) {
      const diff = semitoneOffsets[currentQuestionNote] - semitoneOffsets[currentReferenceNote];
      currentIntervalClass = ((diff % 12) + 12) % 12;
      intervalStats[currentIntervalClass].attempts++;
    }

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

  if (getPitchClass(answerNote) === getPitchClass(currentQuestionNote)) {
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

    let msgHTML = `⭕ 正解！ (+${basePoints}点)<br><small>反応: ${responseTime} ms (難易度x${difficultyMultiplier.toFixed(2)} ・ STAGE補正x${stageMultiplier.toFixed(1)})</small>`;
    
    if (responseTime <= COMBO_TIME_THRESHOLD) {
      combo++;
      if (combo > maxCombo) maxCombo = combo;
      let speedMultiplier = Math.min(1.0 + (combo * 0.2), 3.0);
      let finalPoints = Math.floor(basePoints * speedMultiplier);
      msgHTML = `<span style="color:#f1c40f">⚡ FAST!! (+${finalPoints}点 / 速度x${speedMultiplier.toFixed(1)})</span>`;
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
    document.getElementById('game-message-area').innerHTML = `❌ 惜しい！<br><small>正解は <strong>${document.getElementById('note-'+currentQuestionNote).innerText.replace(/\(.\)/g,'')}</strong> でした。開放音が1つ減ります。</small>`;
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
        let accuracy = Math.round((stat.correct / stat.attempts) * 100);
        let avgTime = stat.correct > 0 ? Math.round(stat.totalTime / stat.correct) : 0;
        let weakScore = (100 - accuracy) * 10 + avgTime;
        displayData.push({ label: intervalNames[i], accuracy, avgTime, weakScore });
      }
    }
    if (displayData.length === 0) {
      listEl.innerHTML = `<div style="font-size:0.8em; color:#bdc3c7;">データが貯まると表示されます</div>`;
      if (moreBtn) moreBtn.style.display = 'none';
      return;
    }
    displayData.sort((a, b) => b.weakScore - a.weakScore);
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
      let accuracy = Math.round((stat.correct / stat.attempts) * 100);
      let avgTime = stat.correct > 0 ? Math.round(stat.totalTime / stat.correct) : 0;
      let weakScore = (100 - accuracy) * 10 + avgTime;
      displayData.push({ note: note, accuracy: accuracy, avgTime: avgTime, weakScore: weakScore });
    }
  });
  if (displayData.length === 0) {
    listEl.innerHTML = `<div style="font-size:0.8em; color:#bdc3c7;">データが貯まると表示されます</div>`;
    if (moreBtn) moreBtn.style.display = 'none';
    return;
  }
  displayData.sort((a, b) => b.weakScore - a.weakScore);
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

function updateHistoryUI() {
  const listEl = document.getElementById('history-list');
  if (scoreHistory.length === 0) { listEl.innerHTML = "<div style='color:#bdc3c7; text-align:center;'>まだ履歴がありません</div>"; return; }
  let html = '';
  scoreHistory.slice().reverse().slice(0, 10).forEach((data) => {
    html += `<div class="history-item"><div style="font-size:1.1em; font-weight:bold;">${data.score} 点</div><div style="color:#bdc3c7;">最大コンボ: ${data.streak} <br><small>${data.date}</small></div></div>`;
  });
  listEl.innerHTML = html;
}

function endGame() {
  clearInterval(timerInterval);
  isPlayingGame = false; 
  isWaitingForAnswer = false;
  unlockBodyScroll(); // ★ ゲーム終了時にスクロールロックを解除
  
  document.getElementById('instrument-select').disabled = false; 
  document.getElementById('keyboard-mode-select').disabled = false;
  document.getElementById('time').innerText = "0";
  
  const finalCombo = maxCombo;
  combo = 0; document.getElementById('combo-count-large').innerText = combo;
  updateBackgroundByCombo(0);
  updateDifficulty(); // ★ フリープレイ用に全音アクティブ化（鍵盤はそのまま使える）
  
  const dateStr = new Date().toLocaleString();
  scoreHistory.push({ score: score, streak: finalCombo, date: dateStr });
  localStorage.setItem('saxEarTrainHistory', JSON.stringify(scoreHistory));
  updateHistoryUI(); 
  
  const wasStage2Unlocked = bestScore >= STAGE2_UNLOCK_SCORE;
  const wasStage3Unlocked = bestScore >= STAGE3_UNLOCK_SCORE;
  const isNewBest = score > bestScore;
  if (isNewBest) {
    bestScore = score;
    localStorage.setItem('saxEarTrainBestScore', String(bestScore));
  }
  renderStageLockState();
  updateGameStatusLine();
  
  const stage2JustUnlocked = !wasStage2Unlocked && bestScore >= STAGE2_UNLOCK_SCORE;
  const stage3JustUnlocked = !wasStage3Unlocked && bestScore >= STAGE3_UNLOCK_SCORE;
  
  let rankName = ""; let rankColor = ""; let rankDesc = "";
  if (score < 10000) { rankName = "🥉 ビギナー"; rankColor = "#cd7f32"; rankDesc = "近い音程の距離感が掴めてきたレベル"; }
  else if (score < 25000) { rankName = "🥈 レギュラー"; rankColor = "#bdc3c7"; rankDesc = "1オクターブ内の跳躍に迷いがなくなってきたレベル"; }
  else if (score < 40000) { rankName = "🏅 ベテラン"; rankColor = "#3498db"; rankDesc = "拡張レンジでの跳躍にも素早く反応できる、瞬時の判断力が身についてきた証！"; }
  else if (score < 50000) { rankName = "🥇 エキスパート"; rankColor = "#f1c40f"; rankDesc = "基準のドに対する相対音感が強固になり、ほぼノータイムで音が取れるレベル"; }
  else if (score < 100000) { rankName = "👑 マスター"; rankColor = "#e67e22"; rankDesc = "考えなくても指が動く、完璧な相対音感と反射神経の持ち主"; }
  else if (score < 150000) { rankName = "🏆 グランドマスター"; rankColor = "#8e44ad"; rankDesc = "ステージ3の惑わせにも動じない、名手と呼ぶにふさわしい領域"; }
  else { rankName = "✨ 神の耳"; rankColor = "#ff4500"; rankDesc = "システムと完全に同化。限界スピードでの連続正解を維持できる究極の耳！"; }
  
  let endMsg = `🏁 タイムアップ！<br>最終スコア: ${score}点 (最大コンボ: ${finalCombo})<br>`;
  endMsg += `<div class="rank-display" style="color:${rankColor};">${rankName}<br><span style="font-size:0.55em; font-weight:normal; color:#ecf0f1;">${rankDesc}</span></div>`;
  if (stage2JustUnlocked) { endMsg += `<div style="color:#2ecc71; font-weight:bold; margin-bottom:10px;">🔓 ステージ2がアンロックされました！</div>`; }
  if (stage3JustUnlocked) { endMsg += `<div style="color:#2ecc71; font-weight:bold; margin-bottom:10px;">🔓 ステージ3がアンロックされました！</div>`; }

  // ★★★ ランキング送信UIはフルスクリーンモーダルではなく、メッセージエリア内に直接埋め込む。
  //     こうすることで、下の鍵盤（フリープレイ用ピアノ）が隠れず、常に操作できる。 ★★★
  if (isNewBest) {
    endMsg += `<div style="color:#f1c40f; font-weight:bold; margin-top:6px;">🎉 自己ベスト更新！ランキングに記録しよう</div>`;
    endMsg += `
      <div class="score-submit-box">
        <input type="text" id="player-name-input" class="score-name-input" placeholder="お名前を入力 (10文字以内)" maxlength="10">
        <button id="submit-score-btn" class="action-btn" onclick="submitScore(${score}, ${finalCombo})" style="width:100%; margin-top:8px;">📤 ランキングにスコアを送信</button>
        <div id="submit-status-msg" class="score-submit-status"></div>
      </div>`;
  }

  endMsg += `<div style="font-size:0.85em; color:#1abc9c; margin: 10px 0;">🎹 下の鍵盤はそのまま鳴らせます。間違えた音の確認やピッチチェックにどうぞ。</div>`;
  endMsg += `<button class="action-btn" onclick="startSequence()" style="margin-top:10px;">もう一度プレイ <small>(Enter)</small></button><br>`;
  endMsg += `<button class="link-btn" onclick="returnToStartScreen();" style="margin-top:6px;">🔁 ステージ選択・設定に戻る</button>`;

  document.getElementById('game-message-area').innerHTML = endMsg;

  if (isNewBest) {
    const nameInput = document.getElementById('player-name-input');
    if (nameInput) nameInput.value = localStorage.getItem('saxEarTrainPlayerName') || '';
  }
}

// ==== ★ スコアの外部送信（GASスプレッドシートへ記録＋Discordへの閾値通知）====
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
    body: JSON.stringify({ name: playerName, score: finalScore, combo: finalCombo })
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
rebuildKeyMaps();

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
updateKeyHintLabels();

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

function loadLeaderboard() {
  const listEl = document.getElementById('global-ranking-list');
  if (!listEl) return;

  fetch(GAS_URL)
    .then(response => response.json())
    .then(data => {
      globalRankingData = data;
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
    
    html += `<div style="display:flex; justify-content:space-between; background:rgba(255,255,255,0.05); padding:8px; margin-bottom:5px; border-radius:5px; align-items:center;">
               <div style="font-weight:bold; color:${rankColor}; width:30px; font-size:1.2em;">${rankIcon}</div>
               <div style="flex-grow:1; text-align:left; font-weight:bold;">${entry.name}</div>
               <div style="text-align:right;">
                 <span style="color:#1abc9c; font-weight:bold; font-size:1.1em;">${entry.score}</span><br>
                 <span style="font-size:0.7em; color:#95a5a6;">${entry.combo} Combo</span>
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

window.addEventListener('load', loadLeaderboard);