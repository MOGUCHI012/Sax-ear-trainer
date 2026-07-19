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

// ==== ★ バックグラウンド移行時のBGM停止（バグ修正・強化版）====
// スマホで別アプリへ切り替えたり、タブを閉じたり、画面をロックしたりしても
// <audio>の再生が続き、BGMが鳴り止まない問題への対策。
// iOS（特にホーム画面から起動したPWA）では visibilitychange がアプリ切替時に
// 発火しないケースが報告されているため、以下の4系統すべてで停止を試みる多重防御にする：
//   1. visibilitychange（標準的なタブ/アプリ切替）
//   2. pagehide / pageshow（iOS Safariのタブクローズ・ページ遷移）
//   3. freeze（Page Lifecycle API：Android Chrome等のバックグラウンド凍結）
//   4. window blur / focus（モバイル限定。iOS PWAでのアプリ切替の最後の砦）
// 復帰時は「隠れる直前に再生中だった場合」だけ再開する（OFF設定を勝手に覆さないため）。
// ※複数のイベントが連続発火すると「pause済み＝再生していなかった」と誤記録してしまうため、
//   bgmPausedByBackground フラグで最初の1回の状態だけを記録する。
// ※ゲーム中はmuted再生で音声セッションを維持しているが、mutedの状態は
//   pause/playをまたいで保持されるので、そのまま止めて・そのまま再開してよい。
let bgmWasPlayingBeforeHidden = false;
let bgmPausedByBackground = false;

function pauseBgmForBackground() {
  // ★ ゲーム中・カウントダウン中はBGMを触らない。
  //   iOSでは<audio>のpauseがWeb Audioと共有のオーディオセッションを止め、
  //   AudioContextをsuspendさせて効果音（基準音・問題音）を無音化させ得るため。
  //   （そもそもゲーム中BGMはmutedで実質無音なので、pauseする実益もない）
  if (isPlayingGame || isCountingDown) return;
  if (!bgmPausedByBackground) {
    bgmWasPlayingBeforeHidden = !bgmAudio.paused;
    bgmPausedByBackground = true;
  }
  bgmAudio.pause();
}
function resumeBgmFromBackground() {
  // ★ 復帰時、ゲーム中ならAudioContextを確実に起こす（効果音の復帰保険）
  if (isPlayingGame || isCountingDown) {
    resumeAudioIfNeeded();
    return;
  }
  if (!bgmPausedByBackground) return;
  bgmPausedByBackground = false;
  if (bgmWasPlayingBeforeHidden) bgmAudio.play().catch(() => {});
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden) pauseBgmForBackground();
  else resumeBgmFromBackground();
});
window.addEventListener('pagehide', pauseBgmForBackground);
window.addEventListener('pageshow', resumeBgmFromBackground);
document.addEventListener('freeze', pauseBgmForBackground);
// ★ blur/focusはモバイルのみ対象にする。PCではウィンドウを切り替えるたびに
//   BGMが止まると煩わしいため。deviceTypeは後方で宣言されるconstだが、
//   コールバックの実行はスクリプト評価完了後なのでTDZの問題は起きない。
window.addEventListener('blur', () => {
  if (deviceType === 'pc') return;
  pauseBgmForBackground();
});
window.addEventListener('focus', () => {
  if (deviceType === 'pc') return;
  resumeBgmFromBackground();
});

// ==== ★ 苦手特訓モード（時間無制限・全音開放の反復練習モード）====
// 旧「focusWeakMode」トグル（通常プレイの出題だけ変える方式）は廃止し、独立モードに昇格した。
//   ・時間制限なし（タイマー・3分フェイルセーフとも動かさない）
//   ・最初から全音開放（連続正解での拡張・ミスでの縮小なし）
//   ・スコア・コンボなし。代わりに出題数／正答率／平均反応時間を表示する
//   ・苦手な音ほど出題確率が上がる（候補の絞り込みはしない。同音連続・音階なぞりの
//     回避は通常モードと同様に適用する＝統計の歪み防止のため）
//   ・右上の「🏁 特訓終了」でいつでも終了。終了後は今回ミスした音を表示する
//   ・履歴・成長グラフ・自己ベスト・ランキングには一切記録しない（苦手統計のみ更新）
function beginTraining() {
  isTrainingMode = true;
  document.getElementById('start-screen').style.display = 'none';
  document.getElementById('game-screen').style.display = 'block';
  document.body.classList.add('hide-sidebars');
  stopBGM(true);
  lockBodyScroll();
  startSequence();
}

// ★ 特訓中の上部バー（出題数・正答率・平均反応時間）を更新する
function updateTrainingStats() {
  const countEl = document.getElementById('training-count');
  const accEl = document.getElementById('training-accuracy');
  const avgEl = document.getElementById('training-avgtime');
  if (countEl) countEl.innerText = sessionAnsweredCount;
  if (accEl) accEl.innerText = sessionAnsweredCount > 0 ? Math.round((sessionCorrectCount / sessionAnsweredCount) * 100) + '%' : '-';
  if (avgEl) avgEl.innerText = sessionAnsweredCount > 0 ? Math.round(sessionTotalTime / sessionAnsweredCount) + 'ms' : '-';
}

// ★ 特訓中の問題の再再生（🔊 もう一度聞くボタン）。
//   基準音→問題音を初回出題と同じ間隔で鳴らし直す。再生中も回答は受け付ける。
//   反応時間の計測は「初回の出題時点」から継続する（聞き直しに使った時間も含めて記録
//   することで、その音が「まだ時間のかかる苦手な音」として統計に正直に残るため）。
let lastTrainingReplayTime = 0;
function replayTrainingQuestion() {
  if (!isTrainingMode || !isPlayingGame) return;
  if (!isWaitingForAnswer) return; // 正誤演出中・出題の合間は無効
  if (!currentQuestionNote) return;
  // ★ 連打で音が重なって濁らないよう、再生シーケンス(約1.2秒)の間は再入を防ぐ
  const now = Date.now();
  if (now - lastTrainingReplayTime < 1200) return;
  lastTrainingReplayTime = now;

  // ★ 基準音→問題音をAudioContextスケジューラで予約（iOS対策。nextQuestionと同方式）
  resumeAudioIfNeeded();
  const startAt = audioCtx.currentTime;
  playSaxTone(getFrequency(currentReferenceNote), 0.4, startAt);
  playSaxTone(getFrequency(currentQuestionNote), 0.6, startAt + 0.6);
  // ★ STAGE3・4は基準音の鍵盤ハイライトも初回と同様に行う
  if (currentStage >= 3) {
    const referenceBtn = document.getElementById('note-' + currentReferenceNote);
    if (referenceBtn) {
      referenceBtn.classList.add('reference-highlight');
      setTimeout(() => referenceBtn.classList.remove('reference-highlight'), 400);
    }
  }
}

// ★ 特訓終了（右上の🏁ボタンから任意のタイミングで呼ばれる）
function endTraining() {
  if (!isTrainingMode) return;
  if (isCountingDown) return; // カウントダウン中の終了は不可（カウント完了後にゲームが始まってしまうため）
  isPlayingGame = false;
  isWaitingForAnswer = false;
  // ★ isTrainingModeはリザルト中もtrueのまま維持する。
  //   「もう一度特訓」(startSequence)がそのまま特訓として再開できるようにするため。
  //   falseに戻すのはステージ選択へ戻る時（returnToStartScreen）。

  document.getElementById('instrument-select').disabled = false;
  document.getElementById('keyboard-mode-select').disabled = false;
  document.getElementById('training-quit-btn').style.display = 'none';
  document.getElementById('training-replay-btn').style.display = 'none';
  updateDifficulty(); // ★ フリープレイ用に全鍵盤アクティブ化（鍵盤はそのまま使える）
  updateAnalyticsUI();

  const answered = sessionAnsweredCount;
  const accuracy = answered > 0 ? Math.round((sessionCorrectCount / answered) * 100) : 0;
  const avgTime = answered > 0 ? Math.round(sessionTotalTime / answered) : 0;

  // ★ 履歴・成長グラフには記録しない（時間無制限・全音開放は通常プレイと条件が違いすぎ、
  //   スコアも存在しないため、通常記録に混ぜると比較を汚してしまう）
  let endMsg = `<div class="result-score-line">🎯 特訓おつかれさま！</div>`;
  endMsg += `<div class="rank-display" style="color:#1abc9c; font-size:1em;">出題 ${answered}問 ・ 正答率 ${accuracy}% ・ 平均反応 ${avgTime}ms</div>`;

  endMsg += `<div class="result-actions">`;
  endMsg += `<button class="action-btn result-guard-btn" disabled onclick="startSequence()">もう一度特訓 <small>(Enter)</small></button>`;
  endMsg += `<button class="link-btn result-guard-btn" disabled onclick="returnToStartScreen();">🔁 ステージ選択</button>`;
  endMsg += `</div>`;

  endMsg += buildSessionWeaknessHTML();
  endMsg += `<div style="font-size:0.8em; color:#1abc9c; margin: 8px 0;">🎹 下の鍵盤はそのまま鳴らせます。ピッチ確認にどうぞ。</div>`;

  document.getElementById('game-message-area').innerHTML = endMsg;

  // ★ 誤タップ防止ガード（通常リザルトと同様）
  resultGuardUntil = Date.now() + RESULT_TAP_GUARD_MS;
  setTimeout(() => {
    document.querySelectorAll('.result-guard-btn').forEach(b => { b.disabled = false; });
  }, RESULT_TAP_GUARD_MS);
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

// ==== ★ 西塚式表記 ====
// 半音を「デ・リ・フィ・サ・チ」の単音カタカナで表す方式（白鍵は通常のドレミと同じ）。
// 鍵盤上のラベルはカタカナのみ。ミス時の正解表示と苦手な音ランキングでは
// 「カタカナ (英語)」のフルフォーマットを使う（getFullNoteName参照。矢印はカタカナ側のみ）。
const nishizukaKatakana = { 'C':'ド', 'Db':'デ', 'D':'レ', 'Eb':'リ', 'E':'ミ', 'F':'ファ', 'Gb':'フィ', 'G':'ソ', 'Ab':'サ', 'A':'ラ', 'Bb':'チ', 'B':'シ' };
const englishPitchNames = { 'C':'C', 'Db':'C# / Db', 'D':'D', 'Eb':'D# / Eb', 'E':'E', 'F':'F', 'Gb':'F# / Gb', 'G':'G', 'Ab':'G# / Ab', 'A':'A', 'Bb':'A# / Bb', 'B':'B' };
const noteNamesNishizuka = {};
allNoteKeys.forEach(k => {
  const arrow = k.indexOf('High') === 0 ? '↑' : (k.indexOf('Low') === 0 ? '↓' : '');
  noteNamesNishizuka[k] = nishizukaKatakana[getPitchClass(k)] + arrow;
});

// ★ 表記モード → 鍵盤ラベル用マップの解決
function resolveNoteNames(mode) {
  if (mode === 'alpha') return noteNamesAlpha;
  if (mode === 'nishizuka') return noteNamesNishizuka;
  return noteNamesSolfege;
}

let notationMode = localStorage.getItem('saxEarTrainNotationMode') || 'solfege';
let noteNames = resolveNoteNames(notationMode);

// ★ ミス時の正解表示・苦手な音ランキング用のフルフォーマット音名。
//   西塚式選択時のみ「カタカナ (英語)」形式になる（例: デ↑ (C# / Db)）。
//   ドレミ／CDE表記のときは鍵盤ラベルと同じ表記をそのまま返す。
function getFullNoteName(note) {
  if (notationMode !== 'nishizuka') return noteNames[note];
  const arrow = note.indexOf('High') === 0 ? '↑' : (note.indexOf('Low') === 0 ? '↓' : '');
  const pc = getPitchClass(note);
  return `${nishizukaKatakana[pc]}${arrow} (${englishPitchNames[pc]})`;
}

// ★ 半音の入力方式：'dedicated'(専用キー) or 'modifier'(Space修飾キー)
let semitoneInputMode = localStorage.getItem('saxEarTrainSemitoneInputMode') || 'dedicated';

function handleNotationChange() {
  notationMode = document.getElementById('notation-select').value;
  localStorage.setItem('saxEarTrainNotationMode', notationMode);
  noteNames = resolveNoteNames(notationMode);
  updateNoteLabels();
  updateAnalyticsUI();
}

// ==== ★ 楽器（管）設定の永続化 ====
// 変更のたびに保存し、次回起動時に復元する（initApp側）。
// 初めて開いた人はHTMLのデフォルト（C管）のまま、2回目以降は前回プレイした管が選ばれる。
function handleInstrumentChange() {
  const v = document.getElementById('instrument-select').value;
  localStorage.setItem('saxEarTrainInstrument', v);
  // ★ 練習用ピアノの管も同期させる（本編と別の管で音確認して混乱するのを防ぐ）
  const practiceSel = document.getElementById('practice-instrument-select');
  if (practiceSel) practiceSel.value = v;
  updateGameStatusLine();
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

// ==== ★ 全音域（黒鍵を含むクロマチック）の並び（ピッチ順）====
// ※出題条件を両モード共通にしたため、出題には下のquestionOrder系とgetStage3Windowsを使う。
//   この配列は全音域のピッチ順として、STAGE3の窓計算・和集合の並び・音階なぞり判定に使われる。
const chromaticSequenceMobile = ['LowA', 'LowBb', 'LowB', 'C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B', 'HighC', 'HighDb', 'HighD', 'HighEb', 'HighE'];

// ==== ★ 「出題順」シーケンス（鍵盤モードに関わらず両モード共通）====
// 【設計】オクターブ同一視の正誤判定（getPitchClass）があるため、鍵盤の音域は出題範囲を
// 制約しない。PCの1オクターブ鍵盤でも「レ↑」の出題に「レ」の鍵盤で正解できる。
// そこで出題条件はPC／スマホ拡張レンジで完全に同一とし、鍵盤モードは
// 「どの鍵盤を表示するか（入力レイアウト）」だけの違いにする。ランキングの公平性も担保される。
// 【バグ修正の経緯】従来はスマホで表示順（ラ↓始まり）を出題順に流用しており、
// スタート時に基準ドより下の音から出題されていた。出題順は「ド」起点の昇順とする。
const questionOrderDiatonic  = ['C', 'D', 'E', 'F', 'G', 'A', 'B', 'HighC', 'HighD', 'HighE'];
const questionOrderChromatic = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B', 'HighC', 'HighDb', 'HighD', 'HighEb', 'HighE'];
// STAGE4（全音域）はドから上へ広がり、低音域（シ↓→シ♭↓→ラ↓）は最後の拡張枠として出題対象になる
const questionOrderStage4 = questionOrderChromatic.concat(['LowB', 'LowBb', 'LowA']);

let activeNoteSequence = diatonicSequencePC;
let currentNoteCount = 4;
let currentAvailableNotes = [];
// ★ フリープレイ（ゲーム外）で鳴らせる音＝現在表示中の鍵盤すべて（updateDifficultyで更新）
let freePlayNotes = [];

// ==== ★ STAGE3専用：両端2窓方式の開放状態 ====
// 下窓=基準「ド」から上方向 / 上窓=基準「上のド」から下方向 に、それぞれ独立して広がる。
// 3連続正解で両窓とも+1音、ミスは「その問題の基準音側」の窓だけ-1音（下限は開始サイズ）。
// 鍵盤上は2窓の和集合がアクティブになる。中盤以降で両窓が重なって見た目の区別が
// つかなくなっても、内部の2カウントは常に独立して維持される。
const STAGE3_WINDOW_START = 4; // 下窓: ド,ド♯,レ,レ♯ / 上窓: 上のド,シ,シ♭,ラ
let stage3LowWindow = STAGE3_WINDOW_START;
let stage3HighWindow = STAGE3_WINDOW_START;

// ★ STAGE3の2窓それぞれの「伸びていく順」の音列を返す。
//   鍵盤モードに関わらず共通（出題条件の統一のため）。互いの基準音を越えて全音域の端まで伸びる：
//   下窓17音（ド→…→ミ↑）・上窓16音（上のド→…→ラ↓）
//   ※1オクターブ鍵盤（PC表示）ではオクターブ違いの鍵盤で回答する（ピッチクラス同一視）
function getStage3Windows() {
  const seq = chromaticSequenceMobile; // 全音域のピッチ順
  const up = seq.filter(n => semitoneOffsets[n] >= semitoneOffsets['C']); // ドから上へ（昇順）
  const down = seq.filter(n => semitoneOffsets[n] <= semitoneOffsets['HighC']).slice().reverse(); // 上のドから下へ（降順）
  return { up: up, down: down };
}

// ==== ★ 苦手な音の統計はステージごとに別々に管理する ====
let noteStatsByStage = JSON.parse(localStorage.getItem('saxEarTrainStatsByStage')) || {};
[1, 2, 3, 4].forEach(stageNum => {
  if (!noteStatsByStage[stageNum]) noteStatsByStage[stageNum] = {};
  allNoteKeys.forEach(k => {
    if (!noteStatsByStage[stageNum][k]) noteStatsByStage[stageNum][k] = { attempts: 0, correct: 0, totalTime: 0 };
  });
});

// ==== ★ ステージ4（ランダム基準音）専用：苦手な「音程（跳躍）」の統計 ====
// 半音差(0〜11)ごとに正答率・反応時間を記録する
let intervalStats = JSON.parse(localStorage.getItem('saxEarTrainIntervalStats')) || {};
for (let i = 0; i <= 11; i++) {
  if (!intervalStats[i]) intervalStats[i] = { attempts: 0, correct: 0, totalTime: 0 };
}
const intervalNames = ['完全1度', '短2度', '長2度', '短3度', '長3度', '完全4度', '増4度/減5度', '完全5度', '短6度', '長6度', '短7度', '長7度'];

let scoreHistory = JSON.parse(localStorage.getItem('saxEarTrainHistory')) || [];

let currentQuestionNote = ''; let questionStartTime = 0; 
let currentReferenceNote = 'C'; // ★ ステージ4の音程集計用：直近の基準音
let currentIntervalClass = 0;   // ★ ステージ4の音程集計用：直近の半音差(0-11)
let isPlayingGame = false; let isWaitingForAnswer = false; let isCountingDown = false; 
let score = 0; let timeLeft = 30; let combo = 0; let maxCombo = 0; let streak = 0; let timerInterval;

// ★ 苦手な音/音程ランキングの表示件数（「もっと見る」で+3件ずつ拡張）
let weakNotesDisplayCount = 3;

// ★ 今回のプレイ中に間違えた音／音程を記録する（リザルトの「今回の弱点」表示用）
//   ステージ1〜3は音名ごと、ステージ4は音程（跳躍）ごとに集計する
let sessionMistakes = {};

// ★ 今回のプレイ全体の集計（成長グラフ用に平均反応時間・正答率を履歴へ残す）
let sessionAnsweredCount = 0;
let sessionCorrectCount = 0;
let sessionTotalTime = 0;

// ★ 苦手特訓モード中かどうか（時間無制限・全音開放の独立モード。beginTraining/endTrainingで制御）
let isTrainingMode = false;

// ==== ★ ステージ管理 ====
let currentStage = 1;
// ★ 解放条件は「直前のステージでの自己ベスト」で判定する
//   STAGE2: STAGE1で70,000点 / STAGE3: STAGE2で150,000点 / STAGE4: STAGE3で220,000点
const STAGE_UNLOCK_SCORES = { 2: 70000, 3: 150000, 4: 220000 };
// ★ STAGE4（ランダム基準音）で基準音として使う音のプール
const stage4ReferencePool = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
// ★ STAGE3（固定基準音・下行あり）で使う2種類の基準音。
//   「ド」の時はドから上の音、「オクターブ上のド」の時はそこから下の音を出題する。
const stage3ReferencePair = ['C', 'HighC'];

// ★ ステージ別スコア補正倍率：ステージが上がるほど純粋に難しくなり得点が伸びにくくなるため、
//   同程度の実力ならステージ1に近いスコアが出るように底上げする。
//   ただしステージ1の記録が簡単に抜かれないよう、完全に同等にはせず控えめに設定している。
const STAGE_SCORE_MULTIPLIERS = { 1: 1.0, 2: 1.8, 3: 2.0, 4: 2.8 };

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
  const result = { 1: data[1] || 0, 2: data[2] || 0, 3: data[3] || 0, 4: data[4] || 0 };
  if (legacyBest > result[1]) result[1] = legacyBest;
  return result;
}
let bestScoreByStage = loadBestScoreByStage();

// ==== ★ 4ステージ制へのデータ移行（一度だけ実行）====
// 旧バージョンのSTAGE3（ランダム基準音）は、新構成では「STAGE4」に相当する。
// 既存プレイヤーの旧STAGE3データ（苦手統計・ベストスコア・プレイ履歴）を3→4へ付け替え、
// 新STAGE3（固定基準音・下行あり）はまっさらな状態から始める。
// ※intervalStats（音程統計）は旧STAGE3＝新STAGE4のものなので、そのまま引き継ぐ。
(function migrateToStage4Layout() {
  if (localStorage.getItem('saxEarTrainStage4Migrated') === 'true') return;
  localStorage.setItem('saxEarTrainStage4Migrated', 'true');

  // 1. 苦手な音の統計：旧STAGE3 → STAGE4へ移し、STAGE3は空で作り直す
  noteStatsByStage[4] = noteStatsByStage[3];
  noteStatsByStage[3] = {};
  allNoteKeys.forEach(k => { noteStatsByStage[3][k] = { attempts: 0, correct: 0, totalTime: 0 }; });
  localStorage.setItem('saxEarTrainStatsByStage', JSON.stringify(noteStatsByStage));

  // 2. ベストスコア：旧STAGE3 → STAGE4（新STAGE3は0から）
  //   ※この結果、旧STAGE3を解放済みだったプレイヤーも、新STAGE3で220,000点を
  //     出すまでSTAGE4は再ロックされる（挿入されたステージを順番に踏む仕様）
  bestScoreByStage[4] = bestScoreByStage[3] || 0;
  bestScoreByStage[3] = 0;
  localStorage.setItem('saxEarTrainBestScoreByStage', JSON.stringify(bestScoreByStage));

  // 3. プレイ履歴：stage:3 の記録を stage:4 に付け替える（成長グラフの連続性を保つ）
  scoreHistory.forEach(h => { if ((h.stage || 1) === 3) h.stage = 4; });
  localStorage.setItem('saxEarTrainHistory', JSON.stringify(scoreHistory));
})();

// ★ 全ステージ通しての自己ベスト（ゲーム画面の表示用）
function getOverallBestScore() {
  return Math.max(bestScoreByStage[1], bestScoreByStage[2], bestScoreByStage[3], bestScoreByStage[4] || 0);
}

// ==== ★ ランキング送信の取りこぼし防止（ステージ別）====
// 「自己ベスト更新の瞬間に送信し損ねると二度と送信できない」問題への対策。
//   ・submittedBestByStage: ランキングへ送信済みのベストスコア
//   ・bestComboByStage: 自己ベスト達成時の最大コンボ（未送信ベストを後から送る際に必要）
// 自己ベスト > 送信済みベスト である間は、毎回のリザルトで送信UIを出し続けることで、
// 誤タップ・ブラウザ終了・通信失敗などで送信し損ねても、次のプレイ後に再送信できる。
function loadStageNumberMap(key) {
  try {
    const saved = JSON.parse(localStorage.getItem(key));
    if (saved && typeof saved === 'object') {
      return { 1: saved[1] || 0, 2: saved[2] || 0, 3: saved[3] || 0, 4: saved[4] || 0 };
    }
  } catch (e) { /* 壊れたデータは無視 */ }
  return { 1: 0, 2: 0, 3: 0, 4: 0 };
}
let submittedBestByStage = loadStageNumberMap('saxEarTrainSubmittedBestByStage');
let bestComboByStage = loadStageNumberMap('saxEarTrainBestComboByStage');
// ★ Discordへ通知済みのスコア（ステージ別）。同じベストの再送信で通知が重複しないようにする
let discordNotifiedByStage = loadStageNumberMap('saxEarTrainDiscordNotifiedByStage');

// ==== ★ 外部送信（GAS/Discord）設定 ====
// TODO: Discord Webhook URLを実際の値に置き換えてください
const GAS_URL = "https://script.google.com/macros/s/AKfycbzgR5pfOXgsSkY9HfQ0bEjd33iDNEYZD-z07rOtSAXBCnm7u_rRqvFnqgib_niUr2_kEg/exec";
const DISCORD_WEBHOOK_URL = "YOUR_DISCORD_WEBHOOK_URL_HERE";
const SCORE_ALERT_THRESHOLD = 200000;

// ★ 送信トークン用の秘密文字列。gas-ranking.gs 側の SUBMIT_SECRET と必ず同じ値にすること。
//   変更する場合は「両ファイル同時に変更 → GAS再デプロイ（新バージョン）」が必須。
//   ※クライアントのソースから読める値なので完全な防御ではない。curl等による
//     安易なスコア偽装を「コードを読んで署名を再実装する」レベルまで引き上げる抑止策。
const SUBMIT_SECRET = 'saxEarTrainer-2026-brass-band-v1';

// ★ 送信内容の改ざん検知用トークン（FNV-1aベースの軽量ハッシュ2本）。
//   gas-ranking.gs に完全に同一の実装があり、GAS側で再計算して照合される。
//   32bit乗算は通常の * だと53bit精度を超えて誤差が出るため、必ずMath.imulを使うこと。
function computeSubmitToken(name, score, combo, deviceId, stage) {
  var str = [name, score, combo, deviceId, stage, SUBMIT_SECRET].join('|');
  var h1 = 0x811c9dc5;
  var h2 = (0x811c9dc5 ^ 0x5bd1e995) >>> 0;
  for (var i = 0; i < str.length; i++) {
    var c = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ c, 0x01000193) >>> 0;
    h2 = ((h2 << 13) | (h2 >>> 19)) >>> 0;
  }
  return h1.toString(16) + '-' + h2.toString(16);
}

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

// ★ リザルト表示直後の誤タップ防止時間。
//   ゲーム終了の瞬間まで鍵盤を連打していると、直前まで鍵盤があった位置に出現した
//   「もう一度プレイ」を誤って押してしまい、ランキング送信の機会を失う事故があったため、
//   リザルト表示から一定時間は操作ボタン（もう一度プレイ／ステージ選択）を無効化する。
//   Enterキーによる再スタートも同じ時間だけブロックする（startSequence側で判定）。
const RESULT_TAP_GUARD_MS = 1000;
let resultGuardUntil = 0;
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
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    // ★ iOS対策：AudioContextが中断(interrupted/suspended)に落ちたら自動で起こし直す。
    //   iOSは他アプリの音・通話・サイレント操作などで勝手にsuspendすることがある。
    //   （interruptedはiOS独自の状態。標準のsuspended同様、resumeで復帰できる）
    audioCtx.addEventListener('statechange', () => {
      if ((audioCtx.state === 'suspended' || audioCtx.state === 'interrupted') && (isPlayingGame || isCountingDown)) {
        audioCtx.resume().catch(() => {});
      }
    });
  }
  if (audioCtx.state === 'suspended') audioCtx.resume();
}

// ★ iOS対策の要：音を鳴らす直前に必ず呼ぶ。
//   iOS SafariはユーザータップのスタックやsetTimeout境界をまたぐとAudioContextを
//   suspendedに戻すことがあり、その状態でoscillator.start()を呼んでも無音になる。
//   全ての再生関数（playTone/playSaxTone）の冒頭でこれを呼び、r? suspendedならresumeする。
//   resumeは非同期だが、iOSでは呼んだ直後に十分な精度でrunningへ移るため、
//   直後のstart()でも実用上問題なく鳴る（完全な保証が要る開始時はensureAudioRunning側で待つ）。
function resumeAudioIfNeeded() {
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
}

// ★ ゲーム開始など「確実にrunningであること」が必要な場面で使う、resume完了を待つ版。
//   AudioContextが未生成なら生成し、suspendedならresumeのPromiseを待ってからコールバックを呼ぶ。
function ensureAudioRunning(callback) {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (audioCtx.state === 'running') {
    callback();
    return;
  }
  // suspended / interrupted（iOS特有の中断状態）→ resumeを試み、完了後にコールバック
  audioCtx.resume().then(() => {
    callback();
  }).catch(() => {
    // resumeが失敗しても、ひとまず進める（次の再生時にresumeAudioIfNeededが再試行する）
    callback();
  });
}

function playTone(frequency, duration, type = 'triangle', time = null) {
  resumeAudioIfNeeded(); // ★ iOS: suspendedなら鳴らす前にresume
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
  resumeAudioIfNeeded(); // ★ iOS: suspendedなら鳴らす前にresume（問題音が無音になる不具合対策）
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
  // ★ STAGE2以降（2・3・4）はすべて黒鍵（半音・クロマチック）を含む
  const includeChromatic = (currentStage >= 2);
  const whiteKeyGroup = (mode === 'pc') ? diatonicSequencePC : diatonicSequenceMobile;

  if (currentStage === 3) {
    // ==== ★ STAGE3: 両端2窓方式 ====
    // activeNoteSequenceは全音域のピッチ順（音階なぞり判定・和集合の並び用）。
    // 出題条件の統一のため、鍵盤モードに関わらず共通の音列を使う
    activeNoteSequence = chromaticSequenceMobile;
    const w = getStage3Windows();
    // ★ 苦手特訓モードは最初から両窓とも全開（基準に応じた方向の全音から出題される）
    if (isTrainingMode) { stage3LowWindow = w.up.length; stage3HighWindow = w.down.length; }
    // 窓サイズを実在の音列長の範囲にクランプ
    stage3LowWindow = Math.max(STAGE3_WINDOW_START, Math.min(stage3LowWindow, w.up.length));
    stage3HighWindow = Math.max(STAGE3_WINDOW_START, Math.min(stage3HighWindow, w.down.length));
    // ★ 鍵盤のアクティブ状態と回答受付は「2窓の和集合」。
    //   見た目上は重なって区別できなくなっても、内部の2カウントは独立して維持される。
    const unionSet = {};
    w.up.slice(0, stage3LowWindow).forEach(n => { unionSet[n] = true; });
    w.down.slice(0, stage3HighWindow).forEach(n => { unionSet[n] = true; });
    currentAvailableNotes = activeNoteSequence.filter(n => unionSet[n]); // ピッチ順を保った和集合
    document.getElementById('difficulty-badge').innerText = `開放音数: 下${stage3LowWindow} / 上${stage3HighWindow}`;
  } else {
    // ==== ★ STAGE1・2・4: 単一窓（出題順シーケンスの先頭からcurrentNoteCount音）====
    // 出題順は鍵盤モードに関わらず共通（ピッチクラス同一視により、1オクターブ鍵盤でも
    // 「レ↑」等の出題に「レ」の鍵盤で回答できるため、出題条件を統一してランキングを公平にする）
    if (currentStage === 1) {
      activeNoteSequence = questionOrderDiatonic;
    } else if (currentStage === 2) {
      activeNoteSequence = questionOrderChromatic;
    } else { // STAGE4
      activeNoteSequence = questionOrderStage4;
    }

    // ★ 苦手特訓モードは最初から全音開放（連続正解での拡張・ミスでの縮小は行わない）
    if (isTrainingMode) currentNoteCount = activeNoteSequence.length;
    if (currentNoteCount > activeNoteSequence.length) currentNoteCount = activeNoteSequence.length;
    currentAvailableNotes = activeNoteSequence.slice(0, currentNoteCount);
    document.getElementById('difficulty-badge').innerText = `開放音数: ${currentNoteCount} / ${activeNoteSequence.length}`;
  }

  // ★ ゲーム中は開放中の音のみアクティブ。ゲーム外(null)は表示中の鍵盤すべてをアクティブにする
  const effectiveAvailableNotes = isPlayingGame ? currentAvailableNotes : null;

  document.querySelectorAll('.key-group').forEach(group => {
    const whiteNote = group.dataset.whiteNote;
    group.classList.toggle('group-visible', whiteKeyGroup.includes(whiteNote));
  });

  // ★ 表示中の鍵盤を集めつつ、アクティブ状態を反映する。
  //   freePlayNotesは「ゲーム外でも鳴らせる音」＝表示中の鍵盤すべて。
  //   （出題順から低音域を外したSTAGE1・2スマホでも、表示中の鍵盤はフリープレイで鳴らせる）
  freePlayNotes = [];
  document.querySelectorAll('.key').forEach(el => {
    const noteId = el.id.replace('note-', '');
    const isBlack = el.classList.contains('black-key');
    const anchorWhiteNote = isBlack ? flatToWhiteAnchor[noteId] : noteId;
    const groupVisible = whiteKeyGroup.includes(anchorWhiteNote);

    const shouldShow = isBlack ? (groupVisible && includeChromatic) : groupVisible;
    if (shouldShow) freePlayNotes.push(noteId);

    el.classList.toggle('visible-key', shouldShow);
    el.classList.toggle('active-key', shouldShow && (effectiveAvailableNotes ? effectiveAvailableNotes.includes(noteId) : true));
  });
}

function getEffectiveAvailableNotes() {
  return isPlayingGame ? currentAvailableNotes : freePlayNotes;
}

// ★ 正解鍵盤のハイライト用：その音の鍵盤が現在表示されていなければ、
//   同じピッチクラスの表示中の鍵盤を代わりに返す（例: PCの1オクターブ鍵盤で「レ↑」→「レ」を光らせる）。
//   出題条件を鍵盤モード共通にしたため、表示範囲外の音の出題がPC鍵盤でも起こり得る。
function getHighlightKeyForNote(note) {
  if (freePlayNotes.includes(note)) return document.getElementById('note-' + note);
  const pc = getPitchClass(note);
  const alt = freePlayNotes.find(n => getPitchClass(n) === pc);
  return alt ? document.getElementById('note-' + alt) : null;
}

function updateKeyboardUI() { updateDifficulty(); }

// ==== ★ スタート画面 / ステージ選択 / モーダル 制御 ====
// ★ 各ステージは「直前のステージで規定スコア」を出すと解放される
//   （STAGE2: STAGE1で70,000点 / STAGE3: STAGE2で150,000点 / STAGE4: STAGE3で220,000点）
function isStageUnlocked(stageNum) {
  if (stageNum === 1) return true;
  return bestScoreByStage[stageNum - 1] >= STAGE_UNLOCK_SCORES[stageNum];
}

function renderStageLockState() {
  [2, 3, 4].forEach(stageNum => {
    const unlocked = isStageUnlocked(stageNum);
    document.getElementById(`stage-${stageNum}-card`).classList.toggle('locked', !unlocked);
    document.getElementById(`stage-${stageNum}-lock-label`).style.display = unlocked ? 'none' : 'inline-block';
  });

  // ★ 選択中のステージがロックされている場合（データ移行直後など）はSTAGE1へ戻す
  if (currentStage > 1 && !isStageUnlocked(currentStage)) {
    selectStage(1);
  }
}

function selectStage(stageNum) {
  if (!isStageUnlocked(stageNum)) return; // ロック中は無視
  currentStage = stageNum;
  [1, 2, 3, 4].forEach(n => {
    document.getElementById(`stage-${n}-card`).classList.toggle('selected', stageNum === n);
  });
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
  const modeSuffix = isTrainingMode ? ' ・ 🎯苦手特訓（時間無制限）' : '';
  document.getElementById('game-status-line').innerText = `🎷 ${instrumentText} ・ ${modeText} ・ STAGE ${currentStage}${modeSuffix}`;

  // ★ 「このステージでの自己ベスト」と、次のステージ解放までの残りを表示する
  const progressEl = document.getElementById('stage-progress-line');
  if (progressEl) {
    const stageBest = bestScoreByStage[currentStage] || 0;
    const nextStage = currentStage + 1;
    if (nextStage <= 4 && !isStageUnlocked(nextStage)) {
      const remain = STAGE_UNLOCK_SCORES[nextStage] - stageBest;
      progressEl.innerText = `🏁 STAGE${currentStage}ベスト: ${stageBest}点（あと${remain}点でSTAGE${nextStage}解放）`;
    } else if (nextStage > 4) {
      progressEl.innerText = `🏁 STAGE${currentStage}ベスト: ${stageBest}点（最終ステージ）`;
    } else {
      progressEl.innerText = `🏁 STAGE${currentStage}ベスト: ${stageBest}点（STAGE${nextStage}解放済み）`;
    }
  }
}

function beginGame() {
  isTrainingMode = false; // ★ 通常プレイ。特訓はbeginTraining()から開始する
  document.getElementById('start-screen').style.display = 'none';
  document.getElementById('game-screen').style.display = 'block';
  // ★ ゲーム画面では鍵盤に全幅を使いたいので、横画面時にサイドバーを隠すためのクラスを付ける
  document.body.classList.add('hide-sidebars');
  stopBGM(true);
  lockBodyScroll();
  startSequence();
}

function returnToStartScreen() {
  isTrainingMode = false; // ★ 特訓リザルトから戻った場合もここでモードを解除する
  document.getElementById('game-screen').style.display = 'none';
  document.getElementById('start-screen').style.display = 'block';
  document.getElementById('start-btn').style.display = '';
  // ★ スタート画面ではランキング・苦手な音を見せたいのでサイドバーを復帰させる
  document.body.classList.remove('hide-sidebars');
  unlockBodyScroll();
  renderStageLockState();
  renderBestSubmitSection(); // ★ 直前のプレイでベストが更新されていれば送信欄に反映する
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
  // ★ リザルト表示直後の誤操作（連打の残りタップ・誤Enter）で即再スタートしないようにする
  if (Date.now() < resultGuardUntil) return;
  isCountingDown = true;
  lockBodyScroll(); // ★ 「もう一度プレイ」経由の場合もここでロック

  // ★ iOS対策：AudioContextが確実にrunningになってからカウントダウンを始める。
  //   ゲーム開始直前のBGM muted化などでsuspend/interruptedに落ちていても、
  //   ここでresume完了を待つことで、以降の基準音・問題音が確実に鳴る。
  //   coldStart（初回・中断復帰）は音の頭が欠けないよう少し待ってから開始する。
  const isColdStart = !audioCtx || audioCtx.state !== 'running';
  ensureAudioRunning(() => {
    if (isColdStart) {
      setTimeout(beginCountdownSequence, 150);
    } else {
      beginCountdownSequence();
    }
  });
}

function beginCountdownSequence() {
  updateBackgroundByCombo(0); 
  
  document.getElementById('instrument-select').disabled = true;
  document.getElementById('keyboard-mode-select').disabled = true;
  document.getElementById('start-btn').style.display = 'none';
  document.getElementById('game-message-area').innerHTML = "準備はいい？";
  document.getElementById('countdown').style.display = 'block';

  // ★ 通常プレイ／苦手特訓で上部バーと終了ボタンの表示を切り替える
  document.getElementById('game-stats-bar').style.display = isTrainingMode ? 'none' : 'flex';
  document.getElementById('game-sub-stats-bar').style.display = isTrainingMode ? 'none' : 'flex';
  document.getElementById('training-stats-bar').style.display = isTrainingMode ? 'flex' : 'none';
  document.getElementById('training-quit-btn').style.display = isTrainingMode ? 'block' : 'none';
  document.getElementById('training-replay-btn').style.display = isTrainingMode ? 'block' : 'none';
  
  combo = 0; maxCombo = 0; streak = 0; score = 0; timeLeft = 30; currentNoteCount = 4; recentQuestionNotes = [];
  stage3LowWindow = STAGE3_WINDOW_START; stage3HighWindow = STAGE3_WINDOW_START; // ★ STAGE3の2窓もリセット
  sessionMistakes = {}; // ★ 今回の弱点サマリー用の記録をリセット
  sessionAnsweredCount = 0; sessionCorrectCount = 0; sessionTotalTime = 0; // ★ 成長グラフ用の集計をリセット
  weakNotesDisplayCount = 3;
  updateStats(); updateDifficulty(); updateGameStatusLine();
  if (isTrainingMode) updateTrainingStats();
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
  // ★ 苦手特訓モードは時間無制限のためタイマーを起動しない（右上の🏁特訓終了ボタンで終わる）
  if (!isTrainingMode) {
    timerInterval = setInterval(() => {
      timeLeft--; updateStats();
      // ★ 残り時間切れ、または万一の異常で長時間続いた場合は強制終了する
      if (timeLeft <= 0 || (Date.now() - gameStartTimestamp) > MAX_GAME_DURATION_MS) endGame();
    }, 1000);
  }
  setTimeout(nextQuestion, 1200); 
}

let recentQuestionNotes = [];

function getNextNoteByWeight(poolOverride) {
  // ★ STAGE3の出題方向の絞り込みなど、呼び出し側で出題候補プールを差し替えられるようにする。
  //   省略時は従来通り currentAvailableNotes（開放中の音すべて）から選ぶ。
  const notesPool = (poolOverride && poolOverride.length > 0) ? poolOverride : currentAvailableNotes;
  const statsForStage = noteStatsByStage[currentStage];
  let weights = {};
  notesPool.forEach(note => {
    let stat = statsForStage[note]; let weight = 1.0; 
    // ★ 弱点優先の重み付けは「苦手特訓モード専用」。
    //   通常モードは均等ランダム（全音とも重み1.0固定）とし、ランキングの公平性を保つ。
    //   ※かつては通常モードにも軽い弱点優先（ミス率×2.0＋反応時間係数）が入っていたが、
    //     苦手な音が多い人ほど難しい出題を多く引いてスコアが伸びにくい構造になるため、
    //     苦手特訓モードの実装を機に廃止した（練習は特訓モードの役割に一本化）。
    if (isTrainingMode && stat.attempts > 0) {
      const missRate = 1 - (stat.correct / stat.attempts);
      const timeFactor = Math.min((stat.totalTime / stat.correct || 1000) / 800, 1.5);
      // ★ 苦手なほど「出題確率」を強めに引き上げる。最も苦手な音は完璧な音の最大約9倍出やすい。
      //   統計は1問ごとに更新されるため、特訓中に改善すれば出題も自動的に均されていく。
      weight += missRate * 5.0 + timeFactor * 2.0;
    }
    weights[note] = weight;
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

  // ★ 「同じ音の連続」「単純な音階なぞり」は特訓モードでも避ける。
  //   直前と同じ音は聴いた記憶だけで正解できてしまい、その音の統計（正答率・反応時間）が
  //   実力以上に良く記録される。これが積もると苦手ランキングが実態とずれるため、
  //   出やすさの調整は「重み」だけで行い、連続出題そのものは許可しない。
  let candidates = notesPool.filter(n => !isImmediateRepeat(n) && !formsSimpleScaleRun(n));
  if (candidates.length === 0) candidates = notesPool.filter(n => !isImmediateRepeat(n));
  if (candidates.length === 0) candidates = notesPool;

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

  // ★ ステージごとの基準音：
  //   STAGE1・2 → 常に「ド」
  //   STAGE3    → 「ド」か「オクターブ上のド」の2択（下行音程の練習用）
  //   STAGE4    → 12音から完全ランダム
  let referenceNoteName = 'C';
  if (currentStage === 4) {
    referenceNoteName = stage4ReferencePool[Math.floor(Math.random() * stage4ReferencePool.length)];
  } else if (currentStage === 3) {
    referenceNoteName = stage3ReferencePair[Math.floor(Math.random() * stage3ReferencePair.length)];
  }
  currentReferenceNote = referenceNoteName;
  const referenceFreq = getFrequency(referenceNoteName);

  document.getElementById('game-message-area').innerHTML = `🎵 基準音(${noteNames[referenceNoteName]}) ➡ 問題音...`;

  // ★ STAGE3・4は基準音が一定でないため、どの音が鳴ったか鍵盤の黄色ハイライトでも伝える
  if (currentStage >= 3) {
    const referenceBtn = document.getElementById('note-' + referenceNoteName);
    if (referenceBtn) {
      referenceBtn.classList.add('reference-highlight');
      setTimeout(() => referenceBtn.classList.remove('reference-highlight'), 400);
    }
  }

  // ★★ iOS対策の本命：基準音と問題音を「1つの同期呼び出し」の中で、
  //   AudioContextのネイティブスケジューラを使って予約する。
  //   従来は問題音を setTimeout(600ms) 内で鳴らしていたが、iOSではsetTimeout境界で
  //   AudioContextがsuspendedに戻り、コールバック内のstart()が無音になっていた。
  //   currentTime基準で予約すれば、その後にsuspendしても予約済みの音は鳴る。
  //   ※出題音の選定は「音を予約する前」に確定させる必要があるため、ここで先に決める。
  ensureAudioRunning(() => {
    if (!isPlayingGame) return;

    // ★ STAGE3（両端2窓方式）：その問題の基準音の側の窓からのみ出題する。
    let questionPool = null;
    if (currentStage === 3) {
      const w = getStage3Windows();
      questionPool = (currentReferenceNote === 'HighC')
        ? w.down.slice(0, stage3HighWindow)
        : w.up.slice(0, stage3LowWindow);
    }
    currentQuestionNote = getNextNoteByWeight(questionPool);

    // ★ STAGE4のみ：基準音からの半音差（0〜11）を「音程」として記録しておく
    if (currentStage === 4) {
      const diff = semitoneOffsets[currentQuestionNote] - semitoneOffsets[currentReferenceNote];
      currentIntervalClass = ((diff % 12) + 12) % 12;
    }

    const questionFreq = getFrequency(currentQuestionNote);

    // 基準音は即座に、問題音は0.6秒後を「AudioContextの時刻」で予約する（setTimeoutを介さない）
    const startAt = audioCtx.currentTime;
    playSaxTone(referenceFreq, 0.4, startAt);
    playSaxTone(questionFreq, 0.6, startAt + 0.6);

    // ※ attempts（出題回数）は「回答した時点」でcheckAnswer側から加算する。
    //   ここで加算すると、時間切れで答えられなかった問題まで誤答として集計され、
    //   苦手ランキングの正答率が不当に下がってしまうため。

    // ★ 状態遷移（回答受付・反応時間計測の開始）は、問題音が実際に鳴り始める600ms後に合わせる。
    //   この setTimeout は音の再生とは無関係なので、iOSでsuspendしても実害がない。
    setTimeout(() => {
      if (!isPlayingGame) return;
      questionStartTime = performance.now();
      isWaitingForAnswer = true;
    }, 600);
  });
}

function checkAnswer(answerNote) {
  if (!isPlayingGame) {
    if (isCountingDown) return;
    if (!freePlayNotes.includes(answerNote)) return;
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
  if (currentStage === 4) intervalStats[currentIntervalClass].attempts++;

  // ★ 成長グラフ用に、今回のプレイ全体の集計も取る
  sessionAnsweredCount++;
  sessionTotalTime += responseTime;

  if (getPitchClass(answerNote) === getPitchClass(currentQuestionNote)) {
    sessionCorrectCount++;
    streak++; 
    statsForStage[currentQuestionNote].correct++;
    statsForStage[currentQuestionNote].totalTime += responseTime;

    if (currentStage === 4) {
      intervalStats[currentIntervalClass].correct++;
      intervalStats[currentIntervalClass].totalTime += responseTime;
    }

    // ★ 苦手特訓モード：スコア・コンボ・開放音の増減は行わず、統計更新と正誤フィードバックのみ
    if (isTrainingMode) {
      saveStats(); updateAnalyticsUI();
      playCorrectSE();
      document.body.classList.add('flash-green');
      setTimeout(() => document.body.classList.remove('flash-green'), 100);
      updateTrainingStats();
      document.getElementById('game-message-area').innerHTML = `<div>⭕ 正解！ <span style="font-size:0.8em; color:#bdc3c7;">(${responseTime}ms)</span></div>`;
      const trainOkBtn = document.getElementById('note-' + answerNote);
      if (trainOkBtn) { trainOkBtn.classList.add('correct-highlight'); setTimeout(() => trainOkBtn.classList.remove('correct-highlight'), 300); }
      setTimeout(nextQuestion, 500);
      return;
    }
    
    if (streak > 0 && streak % 3 === 0) {
      if (currentStage === 3) {
        // ★ STAGE3: どちらの側の正解かを問わず、両窓が1音ずつ広がる（合計+2で従来ペースと同じ）。
        //   上限クランプはupdateDifficulty側で行われる
        stage3LowWindow++;
        stage3HighWindow++;
      } else {
        currentNoteCount = Math.min(activeNoteSequence.length, currentNoteCount + 2);
      }
    }
    saveStats(); updateAnalyticsUI(); updateDifficulty();

    playCorrectSE();
    document.body.classList.add('flash-green'); 
    setTimeout(() => document.body.classList.remove('flash-green'), 100);

    let basePoints = Math.max(10, Math.floor(1000 - responseTime / 3)); 
    // ★ 難易度倍率：STAGE3は「その問題が出た側の窓のサイズ」で計算する。
    //   （2窓の合計を使うと開始時点から倍率が跳ね上がり、従来のスコアバランスと
    //     220,000点のSTAGE4解放基準が崩れるため）
    let effectiveNoteCount = currentNoteCount;
    if (currentStage === 3) {
      effectiveNoteCount = (currentReferenceNote === 'HighC') ? stage3HighWindow : stage3LowWindow;
    }
    let difficultyMultiplier = 1.0 + ((effectiveNoteCount - 4) * 0.25); 
    let stageMultiplier = STAGE_SCORE_MULTIPLIERS[currentStage] || 1.0;
    basePoints = Math.floor(basePoints * difficultyMultiplier * stageMultiplier);

    // ★ 連続正解(streak)ボーナス：5連続ごとに固定 +1,000点×ステージ倍率。
    //   「速さのコンボ」に対する「正確さへのご褒美」なので、コンボの速度倍率や
    //   開放音数の難易度倍率の影響は一切受けない固定加点とする。
    //   時間は追加しない（時間を配るとゲームが延びて3分上限管理と相性が悪いため）。
    let streakBonus = 0;
    if (streak > 0 && streak % 5 === 0) {
      streakBonus = Math.floor(1000 * stageMultiplier);
      score += streakBonus;
    }
    const streakBonusHTML = (streakBonus > 0)
      ? ` <span style="color:#2ecc71;">🎯${streak}連続 +${streakBonus}点</span>`
      : '';

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
    // ★ #game-message-area は flex-direction:column のため、加点表示とボーナス表示が
    //   別々の行に分かれないよう、1つの<div>にまとめて1行で表示する。
    document.getElementById('game-message-area').innerHTML = `<div>${msgHTML}${streakBonusHTML}</div>`;
    const correctBtn = document.getElementById('note-'+answerNote);
    if(correctBtn) { correctBtn.classList.add('correct-highlight'); setTimeout(() => correctBtn.classList.remove('correct-highlight'), 300); }
    setTimeout(nextQuestion, 500);

  } else {
    streak = 0; combo = 0;

    // ★ 今回のプレイの弱点として記録する（ステージ4は音程、それ以外は音名で集計）
    const mistakeKey = (currentStage === 4) ? ('interval:' + currentIntervalClass) : currentQuestionNote;
    sessionMistakes[mistakeKey] = (sessionMistakes[mistakeKey] || 0) + 1;

    // ★ 苦手特訓モード：開放音の縮小は行わず、正解の提示と統計更新のみ
    if (isTrainingMode) {
      saveStats(); updateAnalyticsUI();
      playIncorrectSE();
      document.body.classList.add('flash-red');
      setTimeout(() => document.body.classList.remove('flash-red'), 100);
      updateTrainingStats();
      const trainNgBtn = getHighlightKeyForNote(currentQuestionNote);
      if (trainNgBtn) { trainNgBtn.classList.add('correct-highlight'); setTimeout(() => trainNgBtn.classList.remove('correct-highlight'), 800); }
      document.getElementById('game-message-area').innerHTML = `<div>正解: <strong>${getFullNoteName(currentQuestionNote)}</strong></div>`;
      setTimeout(nextQuestion, 1000);
      return;
    }

    if (currentStage === 3) {
      // ★ STAGE3: ミスした問題の基準音側の窓だけ1音減らす（下限は開始サイズ4音）
      if (currentReferenceNote === 'HighC') {
        stage3HighWindow = Math.max(STAGE3_WINDOW_START, stage3HighWindow - 1);
      } else {
        stage3LowWindow = Math.max(STAGE3_WINDOW_START, stage3LowWindow - 1);
      }
    } else {
      currentNoteCount = Math.max(4, currentNoteCount - 1);
    }
    saveStats(); updateAnalyticsUI(); updateDifficulty(); 
    
    playIncorrectSE();
    document.body.classList.add('flash-red'); 
    setTimeout(() => document.body.classList.remove('flash-red'), 100);
    updateStats();
    
    const actualCorrectBtn = getHighlightKeyForNote(currentQuestionNote);
    if(actualCorrectBtn) {
      actualCorrectBtn.classList.add('correct-highlight');
      setTimeout(() => actualCorrectBtn.classList.remove('correct-highlight'), 800);
    }

    document.getElementById('combo-message').innerText = "";
    // ★ 鍵盤のinnerTextを正規表現で加工すると、キー表記(例:「(Spc+A)」)が残ったり
    //   改行が混入したりするため、音名は noteNames から直接引く。
    //   西塚式選択時は「カタカナ (英語)」のフルフォーマットになる（getFullNoteName）。
    //   また #game-message-area は flex-direction:column のため、テキストと<strong>が
    //   別々の行に分かれてしまう。1つの要素にまとめて1行で表示する。
    document.getElementById('game-message-area').innerHTML = `<div>正解: <strong>${getFullNoteName(currentQuestionNote)}</strong></div>`;
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

  if (currentStage === 4) {
    // ★ ステージ4（ランダム基準音）は「苦手な音程（跳躍）」のランキングを表示する
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

  // ★ ステージ1〜3は通常の「苦手な音」ランキング（ステージごとに別集計）
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
    html += `<div class="weak-note-item"><span>${i+1}. <strong>${getFullNoteName(d.note)}</strong></span><span>正答率: ${d.accuracy}% / 平均: ${d.avgTime}ms</span></div>`;
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
  // ★ 1問も回答していない場合（0点のまま終了など）は何も表示しない。
  //   回答ゼロなのに「ノーミス！」と褒めてしまうのは不自然なため。
  if (sessionAnsweredCount === 0) return '';

  const entries = Object.keys(sessionMistakes)
    .map(key => ({ key, count: sessionMistakes[key] }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 3);

  if (entries.length === 0) {
    // ★ 二重ガード：ノーミス表示は「1問以上正解している」場合のみ。
    //   （上のsessionAnsweredCountガードと論理的には重複するが、将来の改修で
    //     集計タイミングが変わっても「回答ゼロでノーミス」が復活しないよう防衛的に置く）
    if (sessionCorrectCount === 0) return '';
    return `<div class="session-weak-box session-weak-perfect">🎉 ノーミス！今回は間違いゼロでした</div>`;
  }

  const label = (key) => {
    if (key.startsWith('interval:')) {
      const idx = parseInt(key.split(':')[1], 10);
      return intervalNames[idx] || '?';
    }
    return noteNames[key] || key;
  };

  const title = (currentStage === 4) ? '今回ミスした音程' : '今回ミスした音';
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
    accuracy: sessionAnsweredCount > 0 ? Math.round((sessionCorrectCount / sessionAnsweredCount) * 100) : 0
  });
  // 履歴が無限に増えないよう直近200件までに制限する
  if (scoreHistory.length > 200) scoreHistory = scoreHistory.slice(-200);
  localStorage.setItem('saxEarTrainHistory', JSON.stringify(scoreHistory));
  updateHistoryUI(); 
  renderGrowthChart(); // ★ グラフも最新の記録で更新
  
  // ★ ベストスコアは「プレイしたステージ」の記録として更新する。
  //   ※endGameは通常プレイ専用（苦手特訓は時間無制限のためタイマー経由のendGameに到達せず、
  //     endTraining側で終了する。特訓は履歴・ベスト・ランキングに一切記録されない）
  const wasUnlocked = { 2: isStageUnlocked(2), 3: isStageUnlocked(3), 4: isStageUnlocked(4) };
  const isNewBest = score > (bestScoreByStage[currentStage] || 0);
  if (isNewBest) {
    bestScoreByStage[currentStage] = score;
    localStorage.setItem('saxEarTrainBestScoreByStage', JSON.stringify(bestScoreByStage));
    // ★ ベスト達成時の最大コンボも保存する（未送信ベストを後から送信する際に必要）
    bestComboByStage[currentStage] = finalCombo;
    localStorage.setItem('saxEarTrainBestComboByStage', JSON.stringify(bestComboByStage));
  }
  renderStageLockState();
  updateGameStatusLine();
  renderBestSubmitSection(); // ★ PCではリザルト中もサイドバーが見えるため、新ベストを送信欄へ即反映する
  
  const justUnlockedStages = [2, 3, 4].filter(n => !wasUnlocked[n] && isStageUnlocked(n));
  
  // ★ 称号のしきい値はステージ解放ライン（70,000 / 150,000 / 220,000）と揃えている。
  //   後段のステージにはスコア補正倍率（x1.8〜x2.8）がかかるため、上位称号ほど間隔を広げ、
  //   最高位「神の耳」はSTAGE1（倍率x1.0）では事実上到達不能な1,000,000点に設定。
  let rankName = ""; let rankColor = ""; let rankDesc = "";
  if (score < 10000) { rankName = "🥉 ビギナー"; rankColor = "#cd7f32"; rankDesc = "近い音程の距離感が掴めてきたレベル"; }
  else if (score < 30000) { rankName = "🥈 レギュラー"; rankColor = "#bdc3c7"; rankDesc = "1オクターブ内の跳躍に迷いがなくなってきたレベル"; }
  else if (score < 70000) { rankName = "🏅 ベテラン"; rankColor = "#3498db"; rankDesc = "拡張レンジでの跳躍にも素早く反応できる、瞬時の判断力が身についてきた証！"; }
  else if (score < 150000) { rankName = "🥇 エキスパート"; rankColor = "#f1c40f"; rankDesc = "STAGE2解放ライン(70,000点)を突破。相対音感がほぼノータイムの領域に"; }
  else if (score < 220000) { rankName = "👑 マスター"; rankColor = "#e67e22"; rankDesc = "STAGE3解放ライン(150,000点)を突破。考えなくても指が動く境地"; }
  else if (score < 1000000) { rankName = "🏆 グランドマスター"; rankColor = "#8e44ad"; rankDesc = "STAGE4解放ライン(220,000点)を突破。名手と呼ぶにふさわしい領域"; }
  else { rankName = "✨ 神の耳"; rankColor = "#ff4500"; rankDesc = "1,000,000点の壁を超えた者だけが到達できる、限界スピードを維持する究極の耳！"; }
  
  let endMsg = `<div class="result-score-line">🏁 ${score}点 <span style="font-size:0.75em; color:#bdc3c7;">(最大コンボ: ${finalCombo})</span></div>`;
  endMsg += `<div class="rank-display" style="color:${rankColor};">${rankName}<br><span style="font-size:0.55em; font-weight:normal; color:#ecf0f1;">${rankDesc}</span></div>`;

  // ★★★ 操作ボタンはリザルトの「上部」に置く。
  //     スマホ横画面では画面が狭く、弱点サマリー等を先に置くと「もう一度プレイ」が
  //     画面外に押し出されて連続プレイの妨げになるため。
  //     また、終了直前まで鍵盤を連打していた指の誤タップを吸収するため、
  //     表示直後はdisabledにしてRESULT_TAP_GUARD_MS後に有効化する。 ★★★
  endMsg += `<div class="result-actions">`;
  endMsg += `<button class="action-btn result-guard-btn" disabled onclick="startSequence()">もう一度プレイ <small>(Enter)</small></button>`;
  endMsg += `<button class="link-btn result-guard-btn" disabled onclick="returnToStartScreen();">🔁 ステージ選択</button>`;
  endMsg += `</div>`;

  justUnlockedStages.forEach(n => {
    endMsg += `<div style="color:#2ecc71; font-weight:bold; margin-bottom:6px;">🔓 ステージ${n}がアンロックされました！</div>`;
  });

  // ★★★ ランキング送信UIはフルスクリーンモーダルではなく、メッセージエリア内に直接埋め込む。
  //     こうすることで、下の鍵盤（フリープレイ用ピアノ）が隠れず、常に操作できる。
  //     表示するのは「自己ベストを更新したそのリザルト」のみ。
  //     ※以前は未送信ベストがある限り毎回表示していたが、煩わしいためやめた。
  //       送信し損ねた場合は、スタート画面サイドバーの「📤 自己ベストをランキング送信」から
  //       いつでも送信できる（そちらが救済経路）。 ★★★
  if (isNewBest) {
    endMsg += `<div style="color:#f1c40f; font-weight:bold; margin-top:6px;">🎉 STAGE${currentStage} 自己ベスト更新！ランキングに記録しよう</div>`;
    endMsg += `
      <div class="score-submit-box">
        <input type="text" id="player-name-input" class="score-name-input" placeholder="お名前を入力 (10文字以内)" maxlength="10">
        <button id="submit-score-btn" class="action-btn" onclick="submitScore(${score}, ${finalCombo}, ${currentStage})" style="width:100%; margin-top:8px;">📤 ランキングにスコアを送信</button>
        <div id="submit-status-msg" class="score-submit-status"></div>
      </div>`;
  }

  // ★ 今回のプレイの弱点サマリー
  endMsg += buildSessionWeaknessHTML();

  endMsg += `<div style="font-size:0.8em; color:#1abc9c; margin: 8px 0;">🎹 下の鍵盤はそのまま鳴らせます。ピッチ確認にどうぞ。</div>`;

  document.getElementById('game-message-area').innerHTML = endMsg;

  // ★ 誤タップ防止ガード：表示直後は操作ボタンを無効化し、一定時間後に有効化する。
  //   Enterキーによる再スタートはstartSequence側でresultGuardUntilを見てブロックされる。
  resultGuardUntil = Date.now() + RESULT_TAP_GUARD_MS;
  setTimeout(() => {
    document.querySelectorAll('.result-guard-btn').forEach(b => { b.disabled = false; });
  }, RESULT_TAP_GUARD_MS);

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

// ★ ランキング送信の共通処理。リザルト画面とサイドバー「自己ベスト送信」の両方から使う。
function sendScoreToRanking(playerName, finalScore, finalCombo, stageNum, statusEl, submitBtn) {
  // ★ 次回以降のためにプレイヤー名を保存（キー名の誤字を修正: saxEarTrainerName → saxEarTrainPlayerName）
  localStorage.setItem('saxEarTrainPlayerName', playerName);

  if (submitBtn) submitBtn.disabled = true;
  if (statusEl) statusEl.innerText = '送信中... (Sending...)';

  // ==== 1. GAS（スプレッドシート）へ送信 ====
  const deviceId = getOrCreateDeviceId();
  fetch(GAS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' }, // ★ GAS側のCORSプリフライト回避のためtext/plainを維持
    body: JSON.stringify({
      name: playerName,
      score: finalScore,
      combo: finalCombo,
      deviceId: deviceId,
      stage: stageNum, // ★ ステージ別ランキング用
      token: computeSubmitToken(playerName, finalScore, finalCombo, deviceId, stageNum) // ★ 改ざん検知トークン
    })
  })
  .then((response) => {
    // ★ fetchはネットワーク断でしか失敗しないため、GASがエラー(500等)を返した場合も
    //   .thenに到達してしまう。HTTPステータスを確認し、失敗時は成功扱いにしない
    //   （でないと未記録なのに送信済みフラグが立ち、送信ボタンが消えてしまう）。
    if (!response.ok) throw new Error('GAS送信エラー: HTTP ' + response.status);
    return response.json();
  })
  .then((json) => {
    // ★ GASは検証拒否時もHTTP 200で {result:'error'} を返すため、本文の結果も確認する
    if (!json || json.result !== 'success') {
      throw new Error('サーバー側で送信が拒否されました: ' + (json && json.message ? json.message : '不明なエラー'));
    }

    if (statusEl) statusEl.innerText = '✅ 送信完了！ランキングを更新しました';
    // ★ 送信済みベストを記録し、サイドバーで「✅ 送信済み」と表示できるようにする
    submittedBestByStage[stageNum] = Math.max(submittedBestByStage[stageNum] || 0, finalScore);
    localStorage.setItem('saxEarTrainSubmittedBestByStage', JSON.stringify(submittedBestByStage));
    renderBestSubmitSection();
    rankingCacheByTab = {}; // ★ 送信でランキングが変わるため、全タブのキャッシュを破棄して再取得
    if (typeof loadLeaderboard === 'function') loadLeaderboard();

    // ==== 2. スコアが閾値を超えていればDiscordへ通知 ====
    // ★ GAS送信の「成功後」にのみ通知する（記録されていないスコアを祝ってしまわないため）。
    //   また、同じベストを再送信するたびに通知が重複しないよう、
    //   ステージごとに「通知済みスコア」を記録し、それを超えた時だけ通知する。
    if (finalScore >= SCORE_ALERT_THRESHOLD && finalScore > (discordNotifiedByStage[stageNum] || 0)) {
      discordNotifiedByStage[stageNum] = finalScore;
      localStorage.setItem('saxEarTrainDiscordNotifiedByStage', JSON.stringify(discordNotifiedByStage));
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
  })
  .catch(err => {
    console.error(err);
    if (statusEl) statusEl.innerText = '⚠️ 送信に失敗しました。時間をおいて再試行してください。';
  })
  .finally(() => {
    if (submitBtn) submitBtn.disabled = false;
  });
}

// ★ リザルト画面の送信ボタン用（自己ベスト更新時のみ表示される）
function submitScore(finalScore, finalCombo, stageNum) {
  stageNum = stageNum || currentStage;
  const statusEl = document.getElementById('submit-status-msg');
  const nameInput = document.getElementById('player-name-input');
  const playerName = nameInput ? nameInput.value.trim() : '';

  if (!playerName) {
    if (statusEl) statusEl.innerText = '⚠️ 名前を入力してください';
    return;
  }
  sendScoreToRanking(playerName, finalScore, finalCombo, stageNum, statusEl, document.getElementById('submit-score-btn'));
}

// ==== ★ サイドバー「📤 自己ベストをランキング送信」====
// リザルトで送信し損ねた（誤タップ・通信失敗・閉じ忘れ等）場合の救済経路。
// ベストが記録されているステージを一覧表示し、未送信のものは送信ボタン、
// 送信済みのものは「✅ 送信済み」を表示する。ベストが1つも無ければセクション自体を隠す。
function renderBestSubmitSection() {
  const section = document.getElementById('best-submit-section');
  const listEl = document.getElementById('best-submit-list');
  if (!section || !listEl) return;

  const stagesWithBest = [1, 2, 3, 4].filter(n => (bestScoreByStage[n] || 0) > 0);
  if (stagesWithBest.length === 0) {
    section.style.display = 'none';
    return;
  }
  section.style.display = 'block';

  let html = '';
  stagesWithBest.forEach(n => {
    const best = bestScoreByStage[n];
    const isSubmitted = (submittedBestByStage[n] || 0) >= best;
    html += `<div class="best-submit-row"><span>STAGE${n}: <strong>${best}</strong>点</span>`;
    html += isSubmitted
      ? `<span class="best-submit-done">✅ 送信済み</span>`
      : `<button id="sidebar-submit-btn-${n}" class="link-btn best-submit-btn" onclick="submitBestFromSidebar(${n})">📤 送信</button>`;
    html += `</div>`;
  });
  listEl.innerHTML = html;

  // ★ 名前欄が空なら保存済みのプレイヤー名を事前入力する（入力途中の値は上書きしない）
  const nameInput = document.getElementById('sidebar-player-name-input');
  if (nameInput && !nameInput.value) {
    nameInput.value = localStorage.getItem('saxEarTrainPlayerName') || '';
  }
}

function submitBestFromSidebar(stageNum) {
  const best = bestScoreByStage[stageNum] || 0;
  if (best <= 0) return;

  const statusEl = document.getElementById('sidebar-submit-status');
  const nameInput = document.getElementById('sidebar-player-name-input');
  const playerName = nameInput ? nameInput.value.trim() : '';

  if (!playerName) {
    if (statusEl) statusEl.innerText = '⚠️ 名前を入力してください';
    return;
  }
  sendScoreToRanking(playerName, best, bestComboByStage[stageNum] || 0, stageNum, statusEl, document.getElementById('sidebar-submit-btn-' + stageNum));
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
// ★ Space押下中にウィンドウのフォーカスを失うとkeyupを取り逃して押下状態が固着し、
//   （修飾キーモードで）戻った後の白鍵入力が半音化してしまうため、blurで必ず解除する
window.addEventListener('blur', () => { isSpaceHeld = false; });

window.addEventListener('keydown', (e) => {
  const key = e.key.toLowerCase();

  // ★ 入力欄（名前入力・キー割り当て・セレクト等）にフォーカスがある間は、
  //   ゲーム用のキー処理を一切行わない。
  //   （従来は文字キーにこのガードが無く、リザルトの名前入力・サイドバーの名前入力・
  //     キー割り当てモーダルでの入力中に、割り当てキーと一致すると鍵盤の音が鳴っていた）
  const focusTag = document.activeElement ? document.activeElement.tagName : '';
  if (focusTag === 'INPUT' || focusTag === 'TEXTAREA' || focusTag === 'SELECT') return;

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
// ★ ランキングタブ：'all'（総合）または '1'〜'4'（ステージ別）
let currentRankingTab = 'all';
// ★ タブごとの取得結果キャッシュ（タブ切替のたびにGASへ問い合わせないため。送信成功時に破棄）
let rankingCacheByTab = {};

function setRankingTab(tab) {
  currentRankingTab = tab;
  document.querySelectorAll('#ranking-tabs .chart-tab').forEach(b => {
    b.classList.toggle('active', b.dataset.rankStage === tab);
  });
  currentRankingDisplayCount = 10;
  loadLeaderboard();
}

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

  const tab = currentRankingTab;

  // ★ キャッシュがあれば即表示する（送信成功時にキャッシュは破棄される）
  if (rankingCacheByTab[tab]) {
    globalRankingData = rankingCacheByTab[tab];
    renderLeaderboard();
    return;
  }

  listEl.innerHTML = '<div style="color:#bdc3c7; text-align:center; font-size:0.9em;">読み込み中...</div>';

  // ★ 総合はパラメータなし（旧GASとも互換）、ステージ別は ?stage=N を付けて取得する
  const url = (tab === 'all') ? GAS_URL : (GAS_URL + '?stage=' + tab);

  fetch(url)
    .then(response => response.json())
    .then(data => {
      // ★ GASが配列以外（エラーオブジェクト等）を返した場合に落ちないようガードする
      const arr = Array.isArray(data) ? data : [];
      rankingCacheByTab[tab] = arr;
      // ★ 取得中にユーザーが別のタブへ切り替えていたら、表示は上書きしない（キャッシュにだけ残す）
      if (currentRankingTab !== tab) return;
      globalRankingData = arr;
      currentRankingDisplayCount = 10;
      renderLeaderboard();
    })
    .catch(err => {
      console.error(err);
      if (currentRankingTab === tab) {
        listEl.innerHTML = '<div style="text-align:center; color:#e74c3c;">ランキング取得エラー</div>';
      }
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
    // ★ 新GASはエントリの達成ステージも返す。総合タブでどのステージの記録か分かるように表示する
    //   （旧GAS・旧データはstageが無いため何も表示しない）
    const stageTag = (entry.stage >= 1 && entry.stage <= 4)
      ? ` <span style="font-size:0.65em; color:#f1c40f;">S${escapeHtml(entry.stage)}</span>`
      : '';

    html += `<div style="display:flex; justify-content:space-between; background:rgba(255,255,255,0.05); padding:8px; margin-bottom:5px; border-radius:5px; align-items:center;">
               <div style="font-weight:bold; color:${rankColor}; width:30px; font-size:1.2em;">${rankIcon}</div>
               <div style="flex-grow:1; text-align:left; font-weight:bold; word-break:break-all;">${safeName}${stageTag}</div>
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
  // ★ 前回プレイした楽器（管）を復元する。保存が無ければHTMLのデフォルト（C管）のまま。
  //   不正な値（手動編集や旧データ）はbaseFreqsに存在するキーかどうかで弾く。
  const savedInstrument = localStorage.getItem('saxEarTrainInstrument');
  if (savedInstrument && baseFreqs[savedInstrument] !== undefined) {
    document.getElementById('instrument-select').value = savedInstrument;
    const practiceSel = document.getElementById('practice-instrument-select');
    if (practiceSel) practiceSel.value = savedInstrument;
  }

  document.getElementById('notation-select').value = notationMode;
  document.getElementById('semitone-mode-select').value = semitoneInputMode;
  document.getElementById('device-badge').innerText = `判定端末: ${DEVICE_LABELS[deviceType]}`;
  updateNoteLabels();
  updateBgmToggleUI();
  rebuildKeyMaps();
  updateKeyHintLabels();
  updateHistoryUI();
  updateAnalyticsUI();
  updateKeyboardUI();
  renderStageLockState();
  updateGameStatusLine();
  renderGrowthChart();
  renderBestSubmitSection();
}
initApp();

window.addEventListener('load', loadLeaderboard);