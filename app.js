const LANGUAGES = [
  { code: 'zh-TW', label: '繁體中文', speech: 'zh-TW', mymemory: 'zh-TW' },
  { code: 'zh-CN', label: '簡體中文', speech: 'zh-CN', mymemory: 'zh-CN' },
  { code: 'en', label: 'English', speech: 'en-US', mymemory: 'en' },
  { code: 'ja', label: '日本語', speech: 'ja-JP', mymemory: 'ja' },
  { code: 'ko', label: '한국어', speech: 'ko-KR', mymemory: 'ko' },
  { code: 'es', label: 'Español', speech: 'es-ES', mymemory: 'es' },
  { code: 'fr', label: 'Français', speech: 'fr-FR', mymemory: 'fr' },
  { code: 'de', label: 'Deutsch', speech: 'de-DE', mymemory: 'de' },
  { code: 'pt-BR', label: '葡萄牙文（巴西）', speech: 'pt-BR', mymemory: 'pt-BR' },
  { code: 'pt-PT', label: '葡萄牙文（歐洲）', speech: 'pt-PT', mymemory: 'pt-PT' },
  { code: 'vi', label: 'Tiếng Việt', speech: 'vi-VN', mymemory: 'vi' },
  { code: 'th', label: 'ไทย', speech: 'th-TH', mymemory: 'th' },
  { code: 'id', label: 'Bahasa Indonesia', speech: 'id-ID', mymemory: 'id' },
];

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

const els = {
  sourceLang: document.getElementById('source-lang'),
  targetLang: document.getElementById('target-lang'),
  swapLangs: document.getElementById('swap-langs'),
  sourceText: document.getElementById('source-text'),
  targetText: document.getElementById('target-text'),
  micBtn: document.getElementById('mic-btn'),
  micHint: document.getElementById('mic-hint'),
  copySource: document.getElementById('copy-source'),
  copyTarget: document.getElementById('copy-target'),
  speakTarget: document.getElementById('speak-target'),
  continuousMode: document.getElementById('continuous-mode'),
  statusBar: document.getElementById('status-bar'),
  statusText: document.getElementById('status-text'),
  toast: document.getElementById('toast'),
  footerHint: document.getElementById('footer-hint'),
  clearHistory: document.getElementById('clear-history'),
  sourceHistoryContent: document.getElementById('source-history-content'),
  targetHistoryContent: document.getElementById('target-history-content'),
  sourceHistoryEmpty: document.getElementById('source-history-empty'),
  targetHistoryEmpty: document.getElementById('target-history-empty'),
  copySourceHistory: document.getElementById('copy-source-history'),
  copyTargetHistory: document.getElementById('copy-target-history'),
  speakTargetHistory: document.getElementById('speak-target-history'),
  clearSourceHistory: document.getElementById('clear-source-history'),
  clearTargetHistory: document.getElementById('clear-target-history'),
};

const SOURCE_HISTORY_KEY = 'voice-translate-source-history';
const TARGET_HISTORY_KEY = 'voice-translate-target-history';
let sourceRecords = [];
let targetRecords = [];

let recognition = null;
let isListening = false;
let shouldTranslateOnStop = false;
let finalTranscript = '';
let latestTranscript = '';
let toastTimer = null;
let speechResumeTimer = null;
let voicesReady = false;

let audioContext = null;
let analyser = null;
let micStream = null;
let silenceCheckFrame = null;
let silenceStartTime = null;
let hasDetectedSpeech = false;
let isArmed = false;
let isSpeaking = false;
let soundHoldStartTime = null;

const SILENCE_THRESHOLD = 0.015;
const SOUND_HOLD_MS = 120;
const SILENCE_DURATION_MS = 2000;

const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isAndroid = /Android/i.test(navigator.userAgent);
const isMobile = isIOS || isAndroid || window.matchMedia('(max-width: 768px)').matches;

function init() {
  populateLanguageSelects();
  checkBrowserSupport();
  setupMobileHints();
  bindEvents();
  loadVoices();
  loadHistory();
  renderHistory();
}

function setupMobileHints() {
  if (isIOS) {
    els.footerHint.textContent = 'iOS 不支援網頁語音辨識，請改用 Android Chrome';
  } else if (isAndroid) {
    els.footerHint.textContent = '建議使用 Chrome 瀏覽器，並允許麥克風權限';
  } else if (isMobile) {
    els.footerHint.textContent = '請使用 Chrome 或 Edge，並允許麥克風權限';
  } else {
    els.footerHint.textContent = '建議使用 Chrome 或 Edge 瀏覽器';
  }
}

function checkBrowserSupport() {
  if (!SpeechRecognition) {
    const msg = isIOS
      ? 'iOS 目前不支援網頁語音辨識，請改用 Android 手機的 Chrome'
      : '此瀏覽器不支援語音辨識，請使用 Android Chrome 或桌面版 Chrome / Edge';
    setStatus(msg, 'error');
    els.micBtn.disabled = true;
    els.micBtn.style.opacity = '0.5';
    els.micBtn.style.cursor = 'not-allowed';
    return;
  }

  if (isMobile && location.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(location.hostname)) {
    setStatus('手機需使用 HTTPS 才能啟用麥克風，請參考部署說明', 'error');
    showToast('請使用 HTTPS 網址開啟');
  }
}

function loadVoices() {
  if (!window.speechSynthesis) return;

  const cacheVoices = () => {
    if (window.speechSynthesis.getVoices().length > 0) {
      voicesReady = true;
    }
  };

  cacheVoices();
  window.speechSynthesis.onvoiceschanged = cacheVoices;
}

function populateLanguageSelects() {
  const options = LANGUAGES.map(
    (lang) => `<option value="${lang.code}">${lang.label}</option>`
  ).join('');

  els.sourceLang.innerHTML = options;
  els.targetLang.innerHTML = options;

  els.sourceLang.value = 'zh-TW';
  els.targetLang.value = 'en';
}

function getLang(code) {
  return LANGUAGES.find((l) => l.code === code);
}

function bindEvents() {
  els.micBtn.addEventListener('click', toggleListening);
  els.swapLangs.addEventListener('click', swapLanguages);
  els.copySource.addEventListener('click', () => copyText(getSourceContent(), '原文已複製'));
  els.copyTarget.addEventListener('click', () => copyText(getTargetContent(), '譯文已複製'));
  els.speakTarget.addEventListener('click', () => speakText(getTargetContent()));
  els.sourceLang.addEventListener('change', onLanguageChange);
  els.targetLang.addEventListener('change', onLanguageChange);
  els.clearHistory.addEventListener('click', clearAllHistory);
  els.clearSourceHistory.addEventListener('click', () => clearHistory('source'));
  els.clearTargetHistory.addEventListener('click', () => clearHistory('target'));
  els.copySourceHistory.addEventListener('click', () => copyText(getCombinedText(sourceRecords), '全部原文已複製'));
  els.copyTargetHistory.addEventListener('click', () => copyText(getCombinedText(targetRecords), '全部譯文已複製'));
  els.speakTargetHistory.addEventListener('click', () => {
    const text = getCombinedText(targetRecords);
    if (text) speakText(text);
    else showToast('尚無譯文可播放');
  });
}

function onLanguageChange() {
  if (isListening) {
    stopListening(false, { releaseMonitor: false, rearm: true });
  }
}

function swapLanguages() {
  const temp = els.sourceLang.value;
  els.sourceLang.value = els.targetLang.value;
  els.targetLang.value = temp;

  const sourceContent = getSourceContent();
  const targetContent = getTargetContent();

  if (sourceContent) {
    setPanelText(els.targetText, sourceContent);
  }
  if (targetContent) {
    setPanelText(els.sourceText, targetContent);
    finalTranscript = targetContent;
    latestTranscript = targetContent;
  }
}

function unlockSpeech() {
  if (!window.speechSynthesis) return;

  window.speechSynthesis.resume();
  const unlock = new SpeechSynthesisUtterance('\u200B');
  unlock.volume = 0.01;
  unlock.rate = 10;
  window.speechSynthesis.speak(unlock);
}

function toggleListening() {
  unlockSpeech();

  if (isListening || isArmed) {
    disarm();
  } else {
    armStandby();
  }
}

async function armStandby() {
  if (!SpeechRecognition) return;

  isArmed = true;
  els.micBtn.classList.add('recording');
  els.micHint.textContent = '等待聲音中…聽到就會自動錄音';
  els.micHint.classList.add('active');
  setStatus('待機：等待聲音', 'listening');

  const ok = await ensureVolumeMonitor();
  if (!ok) {
    isArmed = false;
    els.micBtn.classList.remove('recording');
    els.micHint.textContent = '點擊開始，聽到聲音會自動錄音';
    els.micHint.classList.remove('active');
    setStatus('無法啟用麥克風，請允許權限', 'error');
    showToast('無法啟用麥克風');
    return;
  }

  resetVolumeState();
  startVolumeLoop();
}

function enterStandby() {
  if (!isArmed) return;

  isListening = false;
  hasDetectedSpeech = false;
  silenceStartTime = null;
  soundHoldStartTime = null;

  els.micBtn.classList.add('recording');
  els.micHint.textContent = '等待聲音中…聽到就會自動錄音';
  els.micHint.classList.add('active');
  setStatus('待機：等待聲音', 'listening');
  startVolumeLoop();
}

function disarm() {
  const wasListening = isListening;
  isArmed = false;
  stopListening(wasListening, { releaseMonitor: true, rearm: false });
}

function startListening() {
  if (!SpeechRecognition || isListening) return;

  finalTranscript = '';
  latestTranscript = '';
  shouldTranslateOnStop = true;
  hasDetectedSpeech = true;
  silenceStartTime = null;
  soundHoldStartTime = null;
  setPanelText(els.sourceText, '');
  setPanelText(els.targetText, '');

  recognition = new SpeechRecognition();
  recognition.lang = getLang(els.sourceLang.value).speech;
  recognition.continuous = els.continuousMode.checked;
  recognition.interimResults = true;
  recognition.maxAlternatives = 1;

  isListening = true;
  isArmed = true;
  els.micBtn.classList.add('recording');
  els.micHint.textContent = '正在錄音… 停止說話 2 秒後自動翻譯';
  els.micHint.classList.add('active');
  setStatus('錄音中', 'listening');

  recognition.onresult = (event) => {
    let interim = '';

    for (let i = event.resultIndex; i < event.results.length; i++) {
      const transcript = event.results[i][0].transcript;
      if (event.results[i].isFinal) {
        finalTranscript += transcript;
      } else {
        interim += transcript;
      }
    }

    let allText = '';
    for (let i = 0; i < event.results.length; i++) {
      allText += event.results[i][0].transcript;
    }
    latestTranscript = allText;
    if (allText.trim()) {
      hasDetectedSpeech = true;
      silenceStartTime = null;
    }

    const display = finalTranscript + (interim ? `<span class="interim">${interim}</span>` : '');
    if (display.trim()) {
      els.sourceText.innerHTML = display;
    } else if (allText.trim()) {
      els.sourceText.textContent = allText;
    }
  };

  recognition.onerror = (event) => {
    const messages = {
      'not-allowed': '麥克風權限被拒絕，請在瀏覽器設定中允許麥克風',
      'no-speech': '未偵測到語音，請再試一次',
      'network': '網路錯誤，請檢查連線',
      'aborted': '',
    };

    const msg = messages[event.error];
    if (msg) {
      setStatus(msg, 'error');
      showToast(msg);
    }

    if (event.error === 'no-speech') {
      shouldTranslateOnStop = false;
      if (isArmed) {
        isListening = false;
        recognition = null;
        enterStandby();
        return;
      }
    }

    if (event.error !== 'aborted' && event.error !== 'no-speech') {
      stopListening(false, { releaseMonitor: true, rearm: false });
    }
  };

  recognition.onend = () => {
    if (!isListening) return;

    if (els.continuousMode.checked) {
      try {
        recognition.start();
      } catch {
        stopListening(true);
      }
    } else {
      stopListening(true);
    }
  };

  try {
    recognition.start();
    ensureVolumeMonitor().then((ok) => {
      if (ok && isListening) startVolumeLoop();
    });
  } catch {
    isListening = false;
    setStatus('無法啟動語音辨識', 'error');
    if (isArmed) enterStandby();
  }
}

function getMicVolume() {
  if (!analyser) return 0;

  const dataArray = new Uint8Array(analyser.frequencyBinCount);
  analyser.getByteTimeDomainData(dataArray);

  let sum = 0;
  for (let i = 0; i < dataArray.length; i++) {
    const normalized = (dataArray[i] - 128) / 128;
    sum += normalized * normalized;
  }
  return Math.sqrt(sum / dataArray.length);
}

function resetVolumeState() {
  hasDetectedSpeech = false;
  silenceStartTime = null;
  soundHoldStartTime = null;
}

function checkVolume() {
  if (!isArmed && !isListening) return;

  // 播放譯文時略過，避免喇叭回授觸發錄音
  if (isSpeaking) {
    soundHoldStartTime = null;
    silenceStartTime = null;
    silenceCheckFrame = requestAnimationFrame(checkVolume);
    return;
  }

  const volume = getMicVolume();
  const hasSound = volume > SILENCE_THRESHOLD;

  if (!isListening && isArmed) {
    if (hasSound) {
      if (!soundHoldStartTime) {
        soundHoldStartTime = Date.now();
      } else if (Date.now() - soundHoldStartTime >= SOUND_HOLD_MS) {
        soundHoldStartTime = null;
        startListening();
        silenceCheckFrame = requestAnimationFrame(checkVolume);
        return;
      }
    } else {
      soundHoldStartTime = null;
    }
  } else if (isListening) {
    if (hasSound) {
      hasDetectedSpeech = true;
      silenceStartTime = null;
    } else if (hasDetectedSpeech) {
      if (!silenceStartTime) {
        silenceStartTime = Date.now();
      } else if (Date.now() - silenceStartTime >= SILENCE_DURATION_MS) {
        stopListening(true);
        return;
      }
    }
  }

  silenceCheckFrame = requestAnimationFrame(checkVolume);
}

function startVolumeLoop() {
  if (silenceCheckFrame) {
    cancelAnimationFrame(silenceCheckFrame);
    silenceCheckFrame = null;
  }
  if (!analyser) return;
  silenceCheckFrame = requestAnimationFrame(checkVolume);
}

async function ensureVolumeMonitor() {
  if (analyser && micStream) {
    if (audioContext?.state === 'suspended') {
      try {
        await audioContext.resume();
      } catch {
        /* ignore */
      }
    }
    return true;
  }

  if (!navigator.mediaDevices?.getUserMedia) return false;

  try {
    stopVolumeMonitor(true);
    micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const source = audioContext.createMediaStreamSource(micStream);
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = 0.4;
    source.connect(analyser);
    return true;
  } catch {
    return false;
  }
}

function stopVolumeMonitor(releaseHardware = true) {
  if (silenceCheckFrame) {
    cancelAnimationFrame(silenceCheckFrame);
    silenceCheckFrame = null;
  }
  silenceStartTime = null;
  soundHoldStartTime = null;
  hasDetectedSpeech = false;

  if (!releaseHardware) return;

  analyser = null;

  if (micStream) {
    micStream.getTracks().forEach((track) => track.stop());
    micStream = null;
  }

  if (audioContext) {
    audioContext.close().catch(() => {});
    audioContext = null;
  }
}

function getRecordedText() {
  return (latestTranscript || finalTranscript || getSourceContent()).trim();
}

function stopListening(shouldTranslate, options = {}) {
  const { releaseMonitor = !isArmed, rearm = isArmed } = options;
  const wasListening = isListening;
  const keepArmed = rearm && isArmed;

  isListening = false;

  if (silenceCheckFrame) {
    cancelAnimationFrame(silenceCheckFrame);
    silenceCheckFrame = null;
  }

  if (recognition) {
    recognition.onend = null;
    try {
      recognition.stop();
    } catch {
      /* already stopped */
    }
    recognition = null;
  }

  const text = getRecordedText();
  const doTranslate = shouldTranslate && shouldTranslateOnStop && wasListening && text;
  shouldTranslateOnStop = false;

  if (!keepArmed) {
    isArmed = false;
    stopVolumeMonitor(true);
    els.micBtn.classList.remove('recording');
    els.micHint.textContent = '點擊開始，聽到聲音會自動錄音';
    els.micHint.classList.remove('active');
  } else {
    stopVolumeMonitor(releaseMonitor);
    if (doTranslate) {
      els.micHint.textContent = '翻譯播放中…結束後繼續等待聲音';
    }
  }

  if (doTranslate) {
    processTranslation(text).finally(() => {
      if (!keepArmed) return;
      // 播報結束後稍等，避免喇叭回授立刻觸發下一輪錄音
      setTimeout(() => {
        if (isArmed && !isListening) enterStandby();
      }, 500);
    });
  } else if (keepArmed) {
    enterStandby();
  } else if (wasListening) {
    setStatus(text ? '就緒' : '未偵測到語音內容', text ? '' : 'error');
  } else {
    setStatus('就緒');
  }
}

async function processTranslation(text) {
  setStatus('翻譯中', 'translating');
  const translated = await translate(text);
  if (translated) {
    addHistoryRecord(text, translated);
    await speakText(translated);
  }
}

async function translate(text) {
  if (!text.trim()) return null;

  const source = getLang(els.sourceLang.value);
  const target = getLang(els.targetLang.value);

  if (source.mymemory === target.mymemory) {
    setPanelText(els.targetText, text);
    setStatus('翻譯完成');
    return text;
  }

  setPanelText(els.targetText, '<span class="loading-dots">翻譯中</span>');

  const langPairs = [
    `${source.mymemory}|${target.mymemory}`,
    `${source.mymemory.split('-')[0]}|${target.mymemory.split('-')[0]}`,
  ];

  for (const langpair of [...new Set(langPairs)]) {
    try {
      const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${langpair}`;
      const res = await fetch(url);

      if (!res.ok) continue;

      const data = await res.json();

      if (data.responseStatus === 200 && data.responseData?.translatedText) {
        const translated = data.responseData.translatedText;
        setPanelText(els.targetText, translated);
        setStatus('翻譯完成');
        return translated;
      }
    } catch {
      /* try next lang pair */
    }
  }

  setPanelText(els.targetText, '');
  setStatus('翻譯失敗，請稍後再試', 'error');
  showToast('翻譯失敗，請稍後再試');
  return null;
}

function speakText(text, langCode) {
  if (!text || !window.speechSynthesis) {
    showToast('無法播放語音');
    return Promise.resolve();
  }

  const synth = window.speechSynthesis;
  synth.cancel();
  isSpeaking = true;

  if (speechResumeTimer) {
    clearInterval(speechResumeTimer);
    speechResumeTimer = null;
  }

  const target = getLang(langCode || els.targetLang.value);

  return new Promise((resolve) => {
    const finish = (statusText = '就緒', statusType = '') => {
      isSpeaking = false;
      if (speechResumeTimer) {
        clearInterval(speechResumeTimer);
        speechResumeTimer = null;
      }
      if (!isArmed && !isListening) {
        setStatus(statusText, statusType);
      }
      resolve();
    };

    const doSpeak = () => {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = target.speech;
      utterance.rate = 0.9;
      utterance.pitch = 1;
      utterance.volume = 1;

      const voices = synth.getVoices();
      const voice = voices.find((v) => v.lang.replace('_', '-').startsWith(target.speech))
        || voices.find((v) => v.lang.replace('_', '-').startsWith(target.speech.split('-')[0]));
      if (voice) utterance.voice = voice;

      utterance.onstart = () => setStatus('正在播放譯文', 'listening');
      utterance.onend = () => finish();
      utterance.onerror = () => finish('播放失敗，請點擊喇叭重試', 'error');

      synth.resume();
      synth.speak(utterance);

      // Chrome 語音合成修復：防止播放被靜音卡住
      speechResumeTimer = setInterval(() => {
        if (!synth.speaking) {
          clearInterval(speechResumeTimer);
          speechResumeTimer = null;
          return;
        }
        synth.pause();
        synth.resume();
      }, 5000);
    };

    if (!voicesReady && synth.getVoices().length === 0) {
      synth.onvoiceschanged = () => {
        voicesReady = true;
        doSpeak();
      };
      setTimeout(doSpeak, 300);
    } else {
      setTimeout(doSpeak, 100);
    }
  });
}

function setPanelText(el, text) {
  if (!text) {
    const isSource = el === els.sourceText;
    el.innerHTML = `<span class="placeholder">${isSource ? '點擊麥克風後，聽到聲音會自動錄音…' : '翻譯結果將顯示於此'}</span>`;
  } else if (text.includes('<')) {
    el.innerHTML = text;
  } else {
    el.textContent = text;
  }
}

function getSourceContent() {
  return els.sourceText.textContent.trim();
}

function getTargetContent() {
  return els.targetText.textContent.trim();
}

async function copyText(text, message) {
  if (!text) {
    showToast('沒有可複製的內容');
    return;
  }

  try {
    await navigator.clipboard.writeText(text);
    showToast(message);
  } catch {
    showToast('複製失敗');
  }
}

function setStatus(text, type = '') {
  els.statusText.textContent = text;
  els.statusBar.className = 'status-bar' + (type ? ` ${type}` : '');
}

function showToast(message) {
  clearTimeout(toastTimer);
  els.toast.textContent = message;
  els.toast.classList.add('show');
  toastTimer = setTimeout(() => els.toast.classList.remove('show'), 2500);
}

function loadHistory() {
  try {
    const savedSource = localStorage.getItem(SOURCE_HISTORY_KEY);
    const savedTarget = localStorage.getItem(TARGET_HISTORY_KEY);
    sourceRecords = savedSource ? JSON.parse(savedSource) : [];
    targetRecords = savedTarget ? JSON.parse(savedTarget) : [];

    // 遷移舊版合併記錄
    const oldKey = 'voice-translate-history';
    const oldSaved = localStorage.getItem(oldKey);
    if (oldSaved) {
      const oldRecords = JSON.parse(oldSaved);
      oldRecords.forEach((r) => {
        if (r.source) {
          sourceRecords.push({
            id: r.id,
            text: r.source,
            lang: r.sourceLang,
            timestamp: r.timestamp,
          });
        }
        if (r.target) {
          targetRecords.push({
            id: r.id + 1,
            text: r.target,
            lang: r.targetLang,
            timestamp: r.timestamp,
          });
        }
      });
      localStorage.removeItem(oldKey);
      saveHistory();
    }
  } catch {
    sourceRecords = [];
    targetRecords = [];
  }
}

function saveHistory() {
  try {
    localStorage.setItem(SOURCE_HISTORY_KEY, JSON.stringify(sourceRecords));
    localStorage.setItem(TARGET_HISTORY_KEY, JSON.stringify(targetRecords));
  } catch {
    /* storage full or unavailable */
  }
}

function formatTime(timestamp) {
  const d = new Date(timestamp);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getMonth() + 1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function addHistoryRecord(source, target) {
  const now = Date.now();

  sourceRecords.unshift({
    id: now,
    text: source,
    lang: els.sourceLang.value,
    timestamp: now,
  });

  targetRecords.unshift({
    id: now + 1,
    text: target,
    lang: els.targetLang.value,
    timestamp: now,
  });

  saveHistory();
  renderHistory();
}

function getCombinedText(records) {
  return records.map((r) => r.text).join('\n\n');
}

function renderHistoryArea(records, contentEl, emptyEl, type) {
  contentEl.querySelectorAll('.msg').forEach((el) => el.remove());

  if (records.length === 0) {
    emptyEl.style.display = 'block';
    return;
  }

  emptyEl.style.display = 'none';

  const chronological = [...records].reverse();

  chronological.forEach((record) => {
    const lang = getLang(record.lang);
    const msg = document.createElement('div');
    msg.className = `msg msg-${type}`;
    msg.innerHTML = `
      <div class="msg-bubble">${escapeHtml(record.text)}</div>
      <div class="msg-meta">${formatTime(record.timestamp)} · ${escapeHtml(lang?.label || '')}</div>
    `;
    contentEl.appendChild(msg);
  });

  requestAnimationFrame(() => {
    contentEl.scrollTop = contentEl.scrollHeight;
  });
}

function renderHistory() {
  renderHistoryArea(sourceRecords, els.sourceHistoryContent, els.sourceHistoryEmpty, 'source');
  renderHistoryArea(targetRecords, els.targetHistoryContent, els.targetHistoryEmpty, 'target');
}

function clearHistory(type) {
  if (type === 'source') {
    if (sourceRecords.length === 0) return;
    sourceRecords = [];
    showToast('已清除原文記錄');
  } else {
    if (targetRecords.length === 0) return;
    targetRecords = [];
    showToast('已清除譯文記錄');
  }
  saveHistory();
  renderHistory();
}

function clearAllHistory() {
  if (sourceRecords.length === 0 && targetRecords.length === 0) return;

  sourceRecords = [];
  targetRecords = [];
  saveHistory();
  renderHistory();
  showToast('已清除全部記錄');
}

init();
