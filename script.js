let audioCtx;
const MASTER_A = 442.00;
 
// ==== ★ BGM（バックグラウンドミュージック）制御 ====
const bgmAudio = document.getElementById('bgm-audio');
const BGM_VOLUME = 0.22; // ★ 初期音量を引き下げ
bgmAudio.volume = BGM_VOLUME;
let bgmEnabled = (localStorage.getItem('saxEarTrainBgmEnabled') !== 'false'); // デフォルトON
let bgmFadeInterval = null;
 
// ★ タップしてスタート画面：ここでAudioContextとBGMの両方を解禁する
function handleTapToStart() {
  document.getElementById('tap-to-start-overlay').style.display = 'none';
  initAudio(); // ★ AudioContextの解禁自体は初回・2回目以降どちらも必ず行う
 
  const hasSeenTutorial = localStorage.getItem('saxEarTrainHasSeenTutorial') === 'true';
  if (hasSeenTutorial) {
    // 2回目以降はこれまで通りすぐにステージ選択画面（BGM再生）へ
    updateBgmToggleUI();
    playBGM();
  } else {
    // 初回のみチュートリアルを挟む（BGMはチュートリアル完了後に再生）
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
  // ★ チュートリアル完了後にBGMを再生してステージ選択画面へ
  updateBgmToggleUI();
  playBGM();
}
 
function playBGM() {
  if (!bgmEnabled) return;
  clearInterval(bgmFadeInterval);
  try { bgmAudio.volume = BGM_VOLUME; } catch (e) {}
  bgmAudio.play().catch(() => {}); // 自動再生が拒否された場合も静かに無視する
}
 
function stopBGM(fade = true) {
  clearInterval(bgmFadeInterval);
  if (!fade) { bgmAudio.pause(); try { bgmAudio.volume = BGM_VOLUME; } catch (e) {} return; }
 
  // ★ iOS Safariはaudio要素のvolumeプロパティを変更できない（システム音量に固定される）仕様のため、
  //    「音量が下がったら止める」という判定だと永遠に止まらなくなる。
  //    そのため音量変化には依存せず、一定のステップ数が経過したら必ずpause()するようにする。
  const FADE_STEPS = 8;
  const STEP_MS = 50;
  let step = 0;
  const startVolume = bgmAudio.volume;
  bgmFadeInterval = setInterval(() => {
    step++;
    try { bgmAudio.volume = Math.max(0, startVolume * (1 - step / FADE_STEPS)); } catch (e) {}
    if (step >= FADE_STEPS) {
      clearInterval(bgmFadeInterval);
      bgmAudio.pause();
      try { bgmAudio.volume = BGM_VOLUME; } catch (e) {}
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
    stopBGM(false);
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
//   例: 'HighC' → 'C', 'LowBb' → 'Bb', 'Eb' → 'Eb'（Low/Highプレフィックスを除去するだけ）
function getPitchClass(noteName) {
  return noteName.replace(/^(Low|High)/, '');
}
 
// ★ 物理キー割り当てが可能な「白鍵」のみのリスト（黒鍵はSpace修飾で入力するため個別バインド不要）
const keybindableNotes = ['LowA', 'LowB', 'C', 'D', 'E', 'F', 'G', 'A', 'B', 'HighC', 'HighD', 'HighE'];
 
// ★ 白鍵→黒鍵（シャープ）の対応表。Spaceキーを押しながら白鍵キーを押すと該当の黒鍵になる。
//   （実際のピアノと同様、E・Bの直後やオクターブ内の最後の白鍵には黒鍵が存在しない）
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
let notationMode = localStorage.getItem('saxEarTrainNotationMode') || 'solfege'; // 'solfege' or 'alpha'
let noteNames = (notationMode === 'alpha') ? noteNamesAlpha : noteNamesSolfege;
 
// ★ 半音の入力方式：'dedicated'(専用キー) or 'modifier'(Space修飾キー)。デフォルトは専用キー。
let semitoneInputMode = localStorage.getItem('saxEarTrainSemitoneInputMode') || 'dedicated';
 
function handleNotationChange() {
  notationMode = document.getElementById('notation-select').value;
  localStorage.setItem('saxEarTrainNotationMode', notationMode);
  noteNames = (notationMode === 'alpha') ? noteNamesAlpha : noteNamesSolfege;
  updateNoteLabels();
  updateAnalyticsUI(); // 苦手な音ランキングの表記も更新
}
 
// ★ 鍵盤ボタン上の音名表示（<span id="notelabel-XXX">）を現在の表記設定に合わせて更新する
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
let currentNoteCount = 4; // 初期状態は4音（ド〜ファ）
let currentAvailableNotes = [];
 
let noteStats = JSON.parse(localStorage.getItem('saxEarTrainStats')) || {};
allNoteKeys.forEach(k => { if(!noteStats[k]) noteStats[k] = { attempts: 0, correct: 0, totalTime: 0 }; });
let scoreHistory = JSON.parse(localStorage.getItem('saxEarTrainHistory')) || [];
 
let currentQuestionNote = ''; let questionStartTime = 0; 
let isPlayingGame = false; let isWaitingForAnswer = false; let isCountingDown = false; 
let score = 0; let timeLeft = 30; let combo = 0; let streak = 0; let timerInterval;
 
// ==== ★ ステージ管理 ====
// STAGE 1: 固定基準音(ド)・メジャースケールのみ
// STAGE 2: 固定基準音(ド)・半音(クロマチック)あり
// STAGE 3: ランダム基準音・半音を含む全音域
let currentStage = 1;
const STAGE2_UNLOCK_SCORE = 20000;
const STAGE3_UNLOCK_SCORE = 50000;
// ステージ3で基準音として使う音（クロマチック12音：C〜B）
const stage3ReferencePool = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
let bestScore = parseInt(localStorage.getItem('saxEarTrainBestScore') || '0', 10);
 
// ==== ★ 外部送信（GAS/Discord）設定 ====
// TODO: 実際のGASウェブアプリURL / Discord Webhook URLに置き換えてください
const GAS_URL = "https://script.google.com/macros/s/AKfycbwYIYRD5_SzR7Ez5pzlSoNWXM6CMKKAfiLnkUhVSEZ-VDfv2mlIVbhCPdPPEDtvLbWFgA/exec";
const DISCORD_WEBHOOK_URL = "YOUR_DISCORD_WEBHOOK_URL_HERE";
const SCORE_ALERT_THRESHOLD = 200000; // このスコアを超えたらDiscordに通知
 
// ==== ★ 端末判定とコンボ判定猶予（レスポンスタイム閾値）====
// iOS: Safari/WebKitのタップ遅延を考慮し最も緩く(1200ms)
// Android: PCよりわずかに緩く(1000ms)
// PC: 最も厳しく(800ms)
function detectDeviceType() {
  const ua = navigator.userAgent || '';
  // iPadOS 13+ は Macintosh を名乗るため maxTouchPoints で判定
  const isIOS = /iPhone|iPad|iPod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (isIOS) return 'ios';
  if (/Android/i.test(ua)) return 'android';
  return 'pc';
}
 
const deviceType = detectDeviceType();
const COMBO_TIME_THRESHOLDS = { ios: 1400, android: 1200, pc: 1000 };
const COMBO_TIME_THRESHOLD = COMBO_TIME_THRESHOLDS[deviceType];
const DEVICE_LABELS = { ios: '📱 iOS (猶予1400ms)', android: '🤖 Android (猶予1200ms)', pc: '💻 PC (猶予1000ms)' };
 
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
// ノコギリ波を複数重ねて倍音を厚くし、フィルターで「リード感」、
// ノイズで「息づかい（ブレスノイズ）」を表現してテナーサックスに寄せる
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
 
  // --- 音の芯：ノコギリ波を2基（微妙にデチューン）+ 1オクターブ下の矩形波で厚みを出す ---
  const osc1 = audioCtx.createOscillator(); osc1.type = 'sawtooth'; osc1.frequency.setValueAtTime(frequency, now);
  const osc2 = audioCtx.createOscillator(); osc2.type = 'sawtooth'; osc2.frequency.setValueAtTime(frequency * 1.006, now);
  const osc3 = audioCtx.createOscillator(); osc3.type = 'square';   osc3.frequency.setValueAtTime(frequency, now); osc3.detune.setValueAtTime(-1200, now);
 
  const oscGain1 = audioCtx.createGain(); oscGain1.gain.value = 0.5;
  const oscGain2 = audioCtx.createGain(); oscGain2.gain.value = 0.35;
  const oscGain3 = audioCtx.createGain(); oscGain3.gain.value = 0.18;
 
  // --- リード感を出すフィルター：アタック時に明るく開き、すぐ落ち着く（ジャズの「エッジ」）---
  const filter = audioCtx.createBiquadFilter();
  filter.type = 'lowpass'; filter.Q.value = 5;
  filter.frequency.setValueAtTime(frequency * 7, now);
  filter.frequency.exponentialRampToValueAtTime(frequency * 3.2, now + 0.12);
  filter.frequency.exponentialRampToValueAtTime(frequency * 2.4, stopTime);
 
  // --- フォルマント風のバンドパスで「リードの鳴り」を強調 ---
  const formant = audioCtx.createBiquadFilter();
  formant.type = 'bandpass'; formant.frequency.value = Math.min(frequency * 2.5, 2200); formant.Q.value = 1.3;
 
  // --- ビブラート（サックス特有の、発音から少し遅れてかかる揺れ）---
  const vibratoLFO = audioCtx.createOscillator(); vibratoLFO.type = 'sine'; vibratoLFO.frequency.value = 5.7;
  const vibratoGain = audioCtx.createGain();
  vibratoGain.gain.setValueAtTime(0, now);
  vibratoGain.gain.linearRampToValueAtTime(4.5, now + 0.18);
  vibratoLFO.connect(vibratoGain);
  vibratoGain.connect(osc1.frequency); vibratoGain.connect(osc2.frequency);
 
  // --- ブレスノイズ（息の音）：発音直後だけ薄く混ぜる ---
  const noiseSource = audioCtx.createBufferSource(); noiseSource.buffer = getBreathNoiseBuffer();
  const noiseFilter = audioCtx.createBiquadFilter();
  noiseFilter.type = 'bandpass'; noiseFilter.frequency.value = frequency * 2.2; noiseFilter.Q.value = 0.7;
  const noiseGain = audioCtx.createGain();
  noiseGain.gain.setValueAtTime(0.18, now);
  noiseGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.06);
 
  // --- 全体のADSR的な音量エンベロープ ---
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
 
// ==== ★ レベルアップ効果音（コンボが3の倍数に到達した時に鳴る、通常正解音とは別の音）====
function playLevelUpSFX(comboCount) {
  const now = audioCtx.currentTime;
  const tier = Math.floor(comboCount / 3); // コンボが重なるほど音程を少し上げて盛り上げる
  const pitchShift = Math.pow(2, Math.min(tier - 1, 4) / 12);
  const notes = [523.25, 659.25, 783.99, 1046.50]; // C5-E5-G5-C6 の軽快なアルペジオ
  notes.forEach((freq, i) => {
    playTone(freq * pitchShift, 0.13, 'triangle', now + i * 0.06);
  });
}
 
// ==== ★ コンボ数に応じて背景色をリアルタイムに変化させる ====
// コンボ0：落ち着いた青系 → コンボが重なるほど暖色・高彩度・高輝度へ
const COMBO_COLOR_MAX = 15; // このコンボ数で最大の「熱狂状態」の色になる
function updateBackgroundByCombo(comboCount) {
  const t = Math.min(comboCount / COMBO_COLOR_MAX, 1); // 0(冷静) → 1(熱狂)
  const hue = 205 - (205 * t);           // 205(落ち着いた青) → 0(情熱的な赤)
  const saturation = 35 + 60 * t;        // 35% → 95%
  const lightness = 22 + 10 * t;         // 22% → 32%（明るくなりすぎず可読性を維持）
  document.body.style.backgroundColor = `hsl(${hue}, ${saturation}%, ${lightness}%)`;
}
 
function updateDifficulty() {
  const mode = document.getElementById('keyboard-mode-select').value;
  const includeChromatic = (currentStage === 2 || currentStage === 3); // ★ STAGE2・3は黒鍵を含む
 
  // 白鍵グループの可視範囲（鍵盤モードのみに依存）
  const whiteKeyGroup = (mode === 'pc') ? diatonicSequencePC : diatonicSequenceMobile;
  // 出題・進行に使う実際の音の並び（ステージにより白鍵のみ/黒鍵ありを切り替え）
  activeNoteSequence = includeChromatic
    ? ((mode === 'pc') ? chromaticSequencePC : chromaticSequenceMobile)
    : whiteKeyGroup;
 
  if (currentNoteCount > activeNoteSequence.length) currentNoteCount = activeNoteSequence.length;
  currentAvailableNotes = activeNoteSequence.slice(0, currentNoteCount);
  
  document.getElementById('difficulty-badge').innerText = `開放音数: ${currentNoteCount} / ${activeNoteSequence.length}`;
  
  // ★ ゲーム進行中でない場合（開始前・終了後のフリープレイ）は選択中モードの全音を使えるようにする
  const effectiveAvailableNotes = isPlayingGame ? currentAvailableNotes : activeNoteSequence;
 
  // ★ 鍵盤グループ（白鍵+黒鍵のペア）の表示は鍵盤モード（PC/スマホ）だけに依存する
  document.querySelectorAll('.key-group').forEach(group => {
    const whiteNote = group.dataset.whiteNote;
    group.classList.toggle('group-visible', whiteKeyGroup.includes(whiteNote));
  });
 
  document.querySelectorAll('.key').forEach(el => {
    const noteId = el.id.replace('note-', '');
    const isBlack = el.classList.contains('black-key');
    const anchorWhiteNote = isBlack ? flatToWhiteAnchor[noteId] : noteId;
    const groupVisible = whiteKeyGroup.includes(anchorWhiteNote);
 
    // 黒鍵は「グループが可視」かつ「現在のステージが半音を含む」場合のみ表示
    const shouldShow = isBlack ? (groupVisible && includeChromatic) : groupVisible;
 
    el.classList.toggle('visible-key', shouldShow);
    el.classList.toggle('active-key', shouldShow && effectiveAvailableNotes.includes(noteId));
  });
}
 
// ★ 現在の状態（プレイ中 / フリープレイ）に応じて、実際に鳴らせる音の一覧を返す
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
 
  // ロック中のステージが選択済みだった場合はステージ1に戻す
  if ((currentStage === 2 && !stage2Unlocked) || (currentStage === 3 && !stage3Unlocked)) {
    selectStage(1);
  }
}
 
function selectStage(stageNum) {
  if (stageNum === 2 && bestScore < STAGE2_UNLOCK_SCORE) return; // ロック中は無視
  if (stageNum === 3 && bestScore < STAGE3_UNLOCK_SCORE) return; // ロック中は無視
  currentStage = stageNum;
  document.getElementById('stage-1-card').classList.toggle('selected', stageNum === 1);
  document.getElementById('stage-2-card').classList.toggle('selected', stageNum === 2);
  document.getElementById('stage-3-card').classList.toggle('selected', stageNum === 3);
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
 
// ★ スタート画面からの初回ゲーム開始（画面遷移してからstartSequenceを呼ぶ）
function beginGame() {
  document.getElementById('start-screen').style.display = 'none';
  document.getElementById('game-screen').style.display = 'block';
  stopBGM(true); // ★ ゲーム画面に入るのでBGMをフェードアウト
  startSequence();
}
 
// ★ ゲーム画面からステージ選択画面に戻る（設定を変更してから再スタートしたい場合用）
function returnToStartScreen() {
  document.getElementById('game-screen').style.display = 'none';
  document.getElementById('start-screen').style.display = 'block';
  document.getElementById('start-btn').style.display = ''; // ★ startSequence()でnoneにした表示を復元
  renderStageLockState();
  playBGM(); // ★ ステージ選択画面に戻ったのでBGMを再開（ON設定時のみ）
}
 
function startSequence() {
  if (isPlayingGame || isCountingDown) return;
  isCountingDown = true;
 
  // ★ 初回起動（AudioContextを新規作成・再開した直後）は音声パイプラインが安定するまで
  //    わずかに遅延が生じ、カウントダウン音と1問目の音がズレて重なることがある。
  //    そのため「まだ稼働していない状態からの起動」の時だけ、実際に再生可能になるのを待ってから開始する。
  const isColdStart = !audioCtx || audioCtx.state !== 'running';
  initAudio();
 
  if (isColdStart) {
    audioCtx.resume().then(() => {
      setTimeout(beginCountdownSequence, 150); // 立ち上がりを待つバッファ
    });
  } else {
    beginCountdownSequence(); // 2回目以降はAudioContextが既に稼働中なので即座に開始
  }
}
 
function beginCountdownSequence() {
  updateBackgroundByCombo(0); 
  
  document.getElementById('instrument-select').disabled = true;
  document.getElementById('keyboard-mode-select').disabled = true;
  document.getElementById('start-btn').style.display = 'none';
  document.getElementById('game-message-area').innerHTML = "準備はいい？";
  document.getElementById('countdown').style.display = 'block';
  
  combo = 0; streak = 0; score = 0; timeLeft = 30; currentNoteCount = 4; recentQuestionNotes = [];
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
  updateDifficulty(); // ★ フリープレイ表示(全音)から、開放音数に応じた制限表示へ切り替える
  timerInterval = setInterval(() => {
    timeLeft--; updateStats();
    if (timeLeft <= 0) endGame();
  }, 1000);
  // 笛の音が完全に終わってから十分に間隔を空ける（1.2秒）
  setTimeout(nextQuestion, 1200); 
}
 
// ★ 出題の偏り防止用：直近に出題した音を保持（最大2件）
let recentQuestionNotes = [];
 
function getNextNoteByWeight() {
  let totalWeight = 0; let weights = {};
  currentAvailableNotes.forEach(note => {
    let stat = noteStats[note]; let weight = 1.0; 
    if (stat.attempts > 0) {
      weight += (1 - (stat.correct / stat.attempts)) * 2.0;
      weight += Math.min((stat.totalTime / stat.correct || 1000) / 800, 1.5);
    }
    weights[note] = weight; totalWeight += weight;
  });
 
  // ★ 同じ音が2回連続で出題されないようにする
  const isImmediateRepeat = (note) => 
    recentQuestionNotes.length >= 1 && recentQuestionNotes[recentQuestionNotes.length - 1] === note;
 
  // ★「ド→レ→ミ」のように隣接する音が3連続で同じ向きに並ぶ（単純な音階）のを防ぐ
  const formsSimpleScaleRun = (note) => {
    if (recentQuestionNotes.length < 2) return false;
    const idxPrev2 = activeNoteSequence.indexOf(recentQuestionNotes[recentQuestionNotes.length - 2]);
    const idxPrev1 = activeNoteSequence.indexOf(recentQuestionNotes[recentQuestionNotes.length - 1]);
    const idxNow   = activeNoteSequence.indexOf(note);
    if (idxPrev2 === -1 || idxPrev1 === -1 || idxNow === -1) return false;
    const step1 = idxPrev1 - idxPrev2;
    const step2 = idxNow - idxPrev1;
    return Math.abs(step1) === 1 && step1 === step2; // 隣接キー同士が同じ向きに2ステップ続く
  };
 
  // 両方の条件を満たす候補で絞り込む。開放音数が少なく候補が全滅する場合は段階的に制約を緩める。
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
 
  // ★ ステージ3のみ基準音をランダムに選ぶ（問題音自体は絶対音程のまま鳴らす。基準音はあくまで「惑わせ」の演出）
  //    ステージ1・2は常に「ド」が基準音。
  const referenceNoteName = (currentStage === 3)
    ? stage3ReferencePool[Math.floor(Math.random() * stage3ReferencePool.length)]
    : 'C';
  const referenceFreq = getFrequency(referenceNoteName);
 
  document.getElementById('game-message-area').innerHTML = (currentStage === 3)
    ? `🎵 基準音(${noteNames[referenceNoteName]}) ➡ 問題音...(基準音に惑わされず聴き分けよう)`
    : `🎵 基準音(${noteNames['C']}) ➡ 問題音...`;
 
  // ★ ステージ3：基準音が鳴るタイミング(0.4秒)に合わせて、対象の鍵盤を黄色くハイライトする
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
    noteStats[currentQuestionNote].attempts++; 
    // ★ ステージ3でも問題音は常にcurrentQuestionNoteの「絶対的な周波数」で鳴らす。
    //    基準音はランダムだが、正解の鍵盤＝実際に鳴った音（名前ベース）と完全に一致する仕様。
    const questionFreq = getFrequency(currentQuestionNote);
    playSaxTone(questionFreq, 0.6);
    questionStartTime = performance.now(); isWaitingForAnswer = true;
  }, 600);
}
 
function checkAnswer(answerNote) {
  // ★ ゲーム未進行時（開始前 or 終了後）はフリープレイ：選択中モードの全音を使え、スコア・タイマーに影響しない
  if (!isPlayingGame) {
    if (isCountingDown) return; // カウントダウン中は無視
    if (!activeNoteSequence.includes(answerNote)) return;
    playFreePlayTone(answerNote);
    return;
  }
 
  if (!currentAvailableNotes.includes(answerNote)) return;
  if (!isWaitingForAnswer) return;
 
  const responseTime = Math.round(performance.now() - questionStartTime); 
  isWaitingForAnswer = false; 
 
  if (getPitchClass(answerNote) === getPitchClass(currentQuestionNote)) {
    streak++; 
    noteStats[currentQuestionNote].correct++;
    noteStats[currentQuestionNote].totalTime += responseTime;
    
    // ★ 正解時のレベルアップ処理（3問連続で+2音）
    if (streak > 0 && streak % 3 === 0) {
      currentNoteCount = Math.min(activeNoteSequence.length, currentNoteCount + 2);
    }
    saveStats(); updateAnalyticsUI(); updateDifficulty();
 
    playCorrectSE();
    document.body.classList.add('flash-green'); 
    setTimeout(() => document.body.classList.remove('flash-green'), 100);
 
    let basePoints = Math.max(10, Math.floor(1000 - responseTime / 3)); 
    let difficultyMultiplier = 1.0 + ((currentNoteCount - 4) * 0.25); 
    basePoints = Math.floor(basePoints * difficultyMultiplier);
 
    let msgHTML = `⭕ 正解！ (+${basePoints}点)<br><small>反応: ${responseTime} ms (難易度ボーナス x${difficultyMultiplier.toFixed(2)})</small>`;
    
    // ★ 端末別のコンボ判定猶予（iOS: 1400ms / Android: 1200ms / PC: 1000ms）
    if (responseTime <= COMBO_TIME_THRESHOLD) {
      combo++;
      let speedMultiplier = Math.min(1.0 + (combo * 0.2), 3.0);
      let finalPoints = Math.floor(basePoints * speedMultiplier);
      msgHTML = `<span style="color:#f1c40f">⚡ FAST!! (+${finalPoints}点 / 速度x${speedMultiplier.toFixed(1)})</span>`;
      score += finalPoints;
 
      // ★ 9コンボ以降は3コンボごとに+4秒（それ未満は既存の6コンボごと+3秒・3コンボごと+2秒を維持）
      if (combo >= 9 && combo % 3 === 0) {
        timeLeft += 4; document.getElementById('combo-message').innerText = "⏰ +4秒!!";
      } else if (combo > 0 && combo % 6 === 0) {
        timeLeft += 3; document.getElementById('combo-message').innerText = "⏰ +3秒!";
      } else if (combo > 0 && combo % 3 === 0) {
        timeLeft += 2; document.getElementById('combo-message').innerText = "⏰ +2秒!";
      }
 
      // ★ レベルアップ効果音：コンボが3の倍数に到達した瞬間、通常の正解音とは別に鳴らす
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
    // ★ ミス時のレベルダウン処理（-1音）
    currentNoteCount = Math.max(4, currentNoteCount - 1);
    saveStats(); updateAnalyticsUI(); updateDifficulty(); 
    
    playIncorrectSE();
    document.body.classList.add('flash-red'); 
    setTimeout(() => document.body.classList.remove('flash-red'), 100);
    updateStats();
    
    // ★ 正解だった鍵盤を光らせる（直感的な学習サポート）
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
 
// ★ フリープレイ用：スコア・タイマーに一切影響せず単音を鳴らすだけの関数
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
  document.getElementById('streak').innerText = streak;
  
  // ★ 背景色はスコアではなく「現在のコンボ数」に応じてリアルタイムに変化させる
  updateBackgroundByCombo(combo);
}
 
function saveStats() { localStorage.setItem('saxEarTrainStats', JSON.stringify(noteStats)); }
 
function updateAnalyticsUI() {
  let displayData = [];
  allNoteKeys.forEach(note => {
    let stat = noteStats[note];
    if (stat.attempts > 2) { 
      let accuracy = Math.round((stat.correct / stat.attempts) * 100);
      let avgTime = stat.correct > 0 ? Math.round(stat.totalTime / stat.correct) : 0;
      let weakScore = (100 - accuracy) * 10 + avgTime;
      displayData.push({ note: note, accuracy: accuracy, avgTime: avgTime, weakScore: weakScore });
    }
  });
  if (displayData.length === 0) return;
  displayData.sort((a, b) => b.weakScore - a.weakScore);
  const top3 = displayData.slice(0, 3);
  let html = ''; 
  top3.forEach((d, i) => {
    html += `<div class="weak-note-item"><span>${i+1}. <strong>${noteNames[d.note]}</strong></span><span>正答率: ${d.accuracy}% / 平均: ${d.avgTime}ms</span></div>`;
  });
  document.getElementById('weak-notes-list').innerHTML = html;
}
 
function updateHistoryUI() {
  const listEl = document.getElementById('history-list');
  if (scoreHistory.length === 0) { listEl.innerHTML = "<div style='color:#bdc3c7; text-align:center;'>まだ履歴がありません</div>"; return; }
  let html = '';
  scoreHistory.slice().reverse().slice(0, 10).forEach((data) => {
    html += `<div class="history-item"><div style="font-size:1.1em; font-weight:bold;">${data.score} 点</div><div style="color:#bdc3c7;">最高連続: ${data.streak}回 <br><small>${data.date}</small></div></div>`;
  });
  listEl.innerHTML = html;
}
 
function endGame() {
  clearInterval(timerInterval);
  isPlayingGame = false; isWaitingForAnswer = false;
  document.getElementById('instrument-select').disabled = false; 
  document.getElementById('keyboard-mode-select').disabled = false;
  document.getElementById('time').innerText = "0";
  const finalCombo = combo; // ★ スコア送信用に、リセット前の最終コンボ数を保持しておく
  combo = 0; document.getElementById('combo-count-large').innerText = combo;
  updateBackgroundByCombo(0);
  updateDifficulty(); // ★ フリープレイ用に、選択中モードの全音をアクティブ表示にする
  
  const dateStr = new Date().toLocaleString();
  scoreHistory.push({ score: score, streak: streak, date: dateStr });
  localStorage.setItem('saxEarTrainHistory', JSON.stringify(scoreHistory));
  updateHistoryUI(); 
 
  // ★ ベストスコアを更新し、ステージ2・3の解放判定に反映する
  const wasStage2Unlocked = bestScore >= STAGE2_UNLOCK_SCORE;
  const wasStage3Unlocked = bestScore >= STAGE3_UNLOCK_SCORE;
  if (score > bestScore) {
    bestScore = score;
    localStorage.setItem('saxEarTrainBestScore', String(bestScore));
  }
  renderStageLockState();
  updateGameStatusLine(); // ★ ベストスコア更新を「🏁 ベストスコア」表示にも反映
  const stage2JustUnlocked = !wasStage2Unlocked && bestScore >= STAGE2_UNLOCK_SCORE;
  const stage3JustUnlocked = !wasStage3Unlocked && bestScore >= STAGE3_UNLOCK_SCORE;
  
  let rankName = ""; let rankColor = ""; let rankDesc = "";
  if (score < 10000) { 
    rankName = "🥉 ビギナー"; rankColor = "#cd7f32"; 
    rankDesc = "近い音程の距離感が掴めてきたレベル"; 
  }
  else if (score < 25000) { 
    rankName = "🥈 レギュラー"; rankColor = "#bdc3c7"; 
    rankDesc = "1オクターブ内の跳躍に迷いがなくなってきたレベル"; 
  }
  else if (score < 40000) { 
    rankName = "🏅 ベテラン"; rankColor = "#3498db"; 
    rankDesc = "拡張レンジでの跳躍にも素早く反応できる、瞬時の判断力が身についてきた証！"; 
  }
  else if (score < 50000) { 
    rankName = "🥇 エキスパート"; rankColor = "#f1c40f"; 
    rankDesc = "基準のドに対する相対音感が強固になり、ほぼノータイムで音が取れるレベル"; 
  }
  else if (score < 100000) { 
    rankName = "👑 マスター"; rankColor = "#e67e22"; 
    rankDesc = "考えなくても指が動く、完璧な相対音感と反射神経の持ち主"; 
  }
  else if (score < 150000) {
    rankName = "🏆 グランドマスター"; rankColor = "#8e44ad";
    rankDesc = "ステージ3の惑わせにも動じない、名手と呼ぶにふさわしい領域";
  }
  else { 
    rankName = "✨ 神の耳"; rankColor = "#ff4500"; 
    rankDesc = "システムと完全に同化。限界スピードでの連続正解を維持できる究極の耳！"; 
  }
  let endMsg = `🏁 タイムアップ！<br>最終スコア: ${score}点 (最高連続: ${streak}回)<br>`;
  endMsg += `<div class="rank-display" style="color:${rankColor};">${rankName}<br><span style="font-size:0.55em; font-weight:normal; color:#ecf0f1;">${rankDesc}</span></div>`;
  
  if (stage2JustUnlocked) { endMsg += `<div style="color:#2ecc71; font-weight:bold; margin-bottom:10px;">🔓 ステージ2がアンロックされました！ステージ選択から挑戦できます。</div>`; }
  if (stage3JustUnlocked) { endMsg += `<div style="color:#2ecc71; font-weight:bold; margin-bottom:10px;">🔓 ステージ3がアンロックされました！ステージ選択から挑戦できます。</div>`; }
  endMsg += `<div style="font-size:0.85em; color:#1abc9c; margin-bottom:10px;">🎹 下の鍵盤はそのまま鳴らせます。間違えた音の確認やピッチチェックにどうぞ。</div>`;
  endMsg += `<button class="action-btn" onclick="startSequence()" style="margin-top:10px;">もう一度プレイ <small>(Enter)</small></button><br>`;
  endMsg += `<button class="link-btn" onclick="returnToStartScreen();" style="margin-top:6px;">🔁 ステージ選択・設定に戻る</button>`;
 
  // ★ スコア記録UI（名前入力＋GAS/Discordへの送信）
  endMsg += `
    <div class="score-submit-box">
      <input type="text" id="player-name-input" class="score-name-input" placeholder="お名前を入力" maxlength="20">
      <button id="score-submit-btn" class="action-btn" onclick="submitScore(${score}, ${finalCombo})" style="width:100%; margin-top:8px;">📤 スコアを記録する</button>
      <div id="score-submit-status" class="score-submit-status"></div>
    </div>`;
  
  document.getElementById('game-message-area').innerHTML = endMsg;
 
  // ★ 保存済みのプレイヤー名をプリフィル（HTML属性ではなくDOMプロパティで安全に設定）
  const nameInput = document.getElementById('player-name-input');
  if (nameInput) nameInput.value = localStorage.getItem('saxEarTrainPlayerName') || '';
}
 
// ★ スコアの外部送信（GASスプレッドシートへ全件記録＋Discordへの閾値通知）
function submitScore(finalScore, finalCombo) {
  const nameInput = document.getElementById('player-name-input');
  const statusEl = document.getElementById('score-submit-status');
  const submitBtn = document.getElementById('score-submit-btn');
 
  let playerName = nameInput ? nameInput.value.trim() : '';
  if (!playerName) playerName = '名無しさん';
 
  // ★ 次回以降のためにプレイヤー名を保存（プリフィル用）
  localStorage.setItem('saxEarTrainPlayerName', playerName);
 
  if (submitBtn) submitBtn.disabled = true;
  if (statusEl) statusEl.innerText = '📤 送信中...';
 
  // ==== 1. GAS（スプレッドシート）へ全件送信 ====
  fetch(GAS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify({ name: playerName, score: finalScore, combo: finalCombo })
  })
    .then(() => {
      if (statusEl) statusEl.innerText = '✅ スコアを記録しました！';
      loadLeaderboard(); // 🌟 ここを追加！ 送信後にランキングを最新に更新
    })

    .then(() => {
      if (statusEl) statusEl.innerText = '✅ スコアを記録しました！';
    })
    .catch((err) => {
      console.error('GASへの送信に失敗しました:', err);
      if (statusEl) statusEl.innerText = '⚠️ 送信に失敗しました（GAS_URLの設定をご確認ください）';
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
    }).catch((err) => {
      console.error('Discordへの通知に失敗しました:', err);
    });
  }
}
 
// ==== ★ PC用キー割り当て（カスタマイズ可能）====
// デフォルトの白鍵キー割り当て。ユーザーはこれを自由に変更でき、localStorageに保存される。
// ※HighEは黒鍵専用キー「W」との衝突を避けるため、デフォルトを「I」に変更しています。
const defaultKeyBindings = {
  'LowA': 'z', 'LowB': 'x',
  'C': 'a', 'D': 's', 'E': 'd', 'F': 'f', 'G': 'j', 'A': 'k', 'B': 'l', 'HighC': ';',
  'HighD': 'q', 'HighE': 'i'
};
 
// ★ 黒鍵（半音）専用キーのデフォルト割り当て（DAWのピアノロール風にW,E,T,Y,Uを基本とする）
const defaultBlackKeyBindings = {
  'LowBb': 'r',
  'Db': 'w', 'Eb': 'e', 'Gb': 't', 'Ab': 'y', 'Bb': 'u',
  'HighDb': 'o', 'HighEb': 'p'
};
 
function loadKeyBindings() {
  try {
    const saved = JSON.parse(localStorage.getItem('saxEarTrainKeyBindings'));
    if (saved && typeof saved === 'object') {
      return Object.assign({}, defaultKeyBindings, saved); // 未保存の音はデフォルトで補完
    }
  } catch (e) { /* 壊れたデータは無視してデフォルトにフォールバック */ }
  return Object.assign({}, defaultKeyBindings);
}
 
function loadBlackKeyBindings() {
  try {
    const saved = JSON.parse(localStorage.getItem('saxEarTrainBlackKeyBindings'));
    if (saved && typeof saved === 'object') {
      return Object.assign({}, defaultBlackKeyBindings, saved);
    }
  } catch (e) { /* 壊れたデータは無視してデフォルトにフォールバック */ }
  return Object.assign({}, defaultBlackKeyBindings);
}
 
let keyBindings = loadKeyBindings();
let blackKeyBindings = loadBlackKeyBindings();
let keyMap = {};      // 物理キー → 白鍵の音名
let domKeyMap = {};   // 物理キー → 鍵盤のDOM ID
let blackKeyMap = {}; // 物理キー → 黒鍵の音名（専用キーモード用）
 
function handleSemitoneModeChange() {
  semitoneInputMode = document.getElementById('semitone-mode-select').value;
  localStorage.setItem('saxEarTrainSemitoneInputMode', semitoneInputMode);
  updateKeyHintLabels();
}
 
// ★ keyBindings/blackKeyBindingsからkeyMap/domKeyMap/blackKeyMapを再構築する（カスタマイズ保存時・初期化時に呼ぶ）
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
 
// ★ 鍵盤ボタン上のキー表示ラベル（例:「(A)」）を、現在のキー割り当てに合わせて更新する
//   黒鍵側は入力モードに応じて「(W)」（専用キー）または「(Spc+A)」（修飾キー）を表示する
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
 
// ==== ★ キー割り当てカスタマイズ用モーダル ====
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
 
// ★ 入力欄にフォーカスした状態で押したキーをそのまま割り当てとして捕捉する
function handleKeybindCapture(e, inputEl) {
  e.preventDefault();
  let key = e.key;
  if (key.length !== 1) return; // Tab/Shift/矢印キーなどの制御キーは無視
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
  // 黒鍵側はモーダルに表示されていた分だけ更新し、非表示だった分（別モードの設定）は保持する
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
 
// ★ スペースキーを押しっぱなしにしているかどうか（半音の修飾キーとして使う。プレイ中/フリープレイ問わず常に有効）
let isSpaceHeld = false;
 
window.addEventListener('keydown', (e) => {
  const key = e.key.toLowerCase();
 
  // ==== スペースキー：常に「半音化の修飾キー」専用（スタート/リプレイの発火はしない）====
  if (e.code === 'Space' || e.key === ' ') {
    const activeTag = document.activeElement ? document.activeElement.tagName : '';
    if (activeTag === 'SELECT' || activeTag === 'INPUT' || activeTag === 'TEXTAREA') return; // ネイティブ操作を優先
    if (document.getElementById('rules-modal-overlay').classList.contains('visible')) return; // モーダル表示中は無視
    if (document.getElementById('keybind-modal-overlay').classList.contains('visible')) return; // キー設定モーダル表示中も無視
    if (document.getElementById('tutorial-overlay').classList.contains('visible')) return; // チュートリアル表示中も無視
 
    e.preventDefault();
    isSpaceHeld = true;
    return;
  }
 
  // ==== Enterキー：「ゲームスタート」「もう一度プレイ」専用（プレイ中/フリープレイどちらでもSpaceと競合しない）====
  if (e.code === 'Enter') {
    const activeTag = document.activeElement ? document.activeElement.tagName : '';
    if (activeTag === 'SELECT' || activeTag === 'INPUT' || activeTag === 'TEXTAREA') return; // ネイティブ操作を優先
    if (document.getElementById('rules-modal-overlay').classList.contains('visible')) return; // モーダル表示中は無視
    if (document.getElementById('keybind-modal-overlay').classList.contains('visible')) return; // キー設定モーダル表示中も無視
    if (document.getElementById('tutorial-overlay').classList.contains('visible')) return; // チュートリアル表示中も無視
 
    e.preventDefault();
 
    const startScreenVisible = document.getElementById('start-screen').style.display !== 'none';
    if (startScreenVisible) {
      if (!isPlayingGame && !isCountingDown) beginGame();
    } else if (!isPlayingGame && !isCountingDown) {
      startSequence(); // ゲーム画面で終了後の「もう一度プレイ」に相当
    }
    return;
  }
 
  // ==== 音符キー（白鍵）：修飾キーモードならSpace同時押しで黒鍵に切り替え ====
  if (keyMap[key]) {
    let targetNote = keyMap[key];
    // ★「修飾キー(Space)」モード選択時のみ、Spaceを押しながらで黒鍵（シャープ）に変換する
    if (semitoneInputMode === 'modifier' && isSpaceHeld && sharpKeyMap[targetNote]) {
      targetNote = sharpKeyMap[targetNote];
    }
    const btn = document.getElementById('note-' + targetNote);
    if (btn && getEffectiveAvailableNotes().includes(targetNote)) {
      btn.classList.add('pressed'); checkAnswer(targetNote);
    }
    return;
  }
 
  // ==== 黒鍵の専用キー（「専用キー」モード選択時のみ有効）====
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
    // Space解放のタイミング次第で黒鍵側にpressedが残る場合があるため、念のため両方解除する
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

// ==== ★ ランキング取得（Leaderboard Fetch）====
function loadLeaderboard() {
  const listEl = document.getElementById('global-ranking-list');
  if (!listEl) return;

  fetch(GAS_URL) // デフォルトでGETリクエストになります
    .then(response => response.json())
    .then(data => {
      if (data.length === 0) {
        listEl.innerHTML = '<div style="text-align:center; color:#bdc3c7;">まだ記録がありません</div>';
        return;
      }
      let html = '';
      data.forEach((entry, index) => {
        // 1〜3位は色とアイコンを豪華にする
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
    })
    .catch(err => {
      console.error(err);
      listEl.innerHTML = '<div style="text-align:center; color:#e74c3c;">ランキング取得エラー</div>';
    });
}

// アプリ起動時に1回だけランキングを読み込む
window.addEventListener('load', loadLeaderboard);