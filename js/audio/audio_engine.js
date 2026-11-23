/* Версия ассетов — при разработке меняется вручную или из query-строки.
   В продакшене можно зафиксировать, например, по дате сборки. */
const ASSET_VERSION =
  new URLSearchParams(location.search).get('av') || '';   // ?av=2 → новая версия

function bust(url) {
  if (!ASSET_VERSION) return url;
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}v=${ASSET_VERSION}`;
}

/* ============================================================
   Аудио-ядро: музыка (плейлист с fade) + SFX.
   Все пути к файлам — заглушки. Пока файлов нет, движок молчит.
   ============================================================ */

export const SFX_LIST = {
  // интерфейс — клики
  tap:            'assets/sound/sfx/tap.mp3',           // внешние кнопки меню
  tap_up:         'assets/sound/sfx/tap_up.mp3',        // кнопки внутри окон
  button_click:   'assets/sound/sfx/button_click.mp3',  // кнопка игрока ПАС/БЕРУ
  switch:         'assets/sound/sfx/switch.mp3',        // переключатели
  buy:            'assets/sound/sfx/buy.mp3',           // покупка
  cash:           'assets/sound/sfx/cash.mp3',          // награда за квест

  // карты
  card_selection: 'assets/sound/sfx/card_selection.mp3',// выбор карты в руке
  card_shuffle:   'assets/sound/sfx/card_shuffle.mp3',  // шафл
  card_fly:       'assets/sound/sfx/card_fly.mp3',      // вылет из колоды
  card_flip:      'assets/sound/sfx/card_flip.mp3',     // переворот
  card_hit:       'assets/sound/sfx/card_hit.mp3',      // упала на стол
  card_deal:      'assets/sound/sfx/card_deal.mp3',     // в руку / взятие со стола
  card_discard:   'assets/sound/sfx/card_discard.mp3',  // в отбой

  // результат матча
  win:            'assets/sound/sfx/win.mp3',
  lose:           'assets/sound/sfx/lose.mp3',
  draw:           'assets/sound/sfx/draw.mp3',
};

const MUSIC_PLAYLIST = [
  'assets/sound/music/Joker_theme_variant_A.ogg',
  'assets/sound/music/Joker_theme_variant_B.ogg',
];

const FADE_IN_MS     = 3000;
const FADE_OUT_MS    = 1500;
const MUSIC_GAP_MS   = 3000;
const DEFAULT_VOLUME = 0.8;

export class AudioEngine {
  constructor() {
    this.masterVolume = DEFAULT_VOLUME;
    this.sfxEnabled   = true;
    this.musicEnabled = true;

    this._el            = null;    // текущий Web Audio источник
    this._index         = 0;
    this._firstPlayDone = false;
    this._started       = false;
	
	this._sfxPool = new Set();   // ← активные SFX, чтобы их не съел GC
	this._sfxPaused = false;
	this._audioCtx = null; // Контекст для Web Audio API
    this._sfxBuffers = {}; // Кеш загруженных звуков
    this._musicBuffers = {};
    this._musicGain = null;
    this._musicOffset = 0;
    this._musicStartedAt = 0;
    this._musicTimer = null;
    this._musicSources = new Set();
	    // Глобальное возобновление AudioContext при любом тапе (для iOS)
    document.addEventListener('pointerdown', () => {
      if (this._audioCtx && this._audioCtx.state === 'suspended') {
        this._audioCtx.resume().catch(() => {});
      }
    }, { capture: true });
  }

  /* ---------- громкость ---------- */

  setVolume(v) {
    this.masterVolume = Math.max(0, Math.min(1, v));
    if (this._musicGain && this._audioCtx) {
      this._musicGain.gain.setTargetAtTime(this.musicEnabled ? this.masterVolume : 0, this._audioCtx.currentTime, 0.03);
    }
  }
  getVolume() { return this.masterVolume; }

/* ---------- запуск с первого клика (autoplay policy) ---------- */

  ensureStarted() {
    if (this._started) return;
    this._started = true;
    console.log('[audio] ensureStarted, musicEnabled =', this.musicEnabled);
    
    // Инициализация Web Audio API для мобилок
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        this._audioCtx = new AudioCtx();
        // Разблокировка контекста (iOS)
        if (this._audioCtx.state === 'suspended') {
          this._audioCtx.resume();
        }
        this._musicGain = this._audioCtx.createGain();
        this._musicGain.gain.value = 0;
        this._musicGain.connect(this._audioCtx.destination);
        // Все игровые звуки идут через Web Audio, без HTML media session.
        this._preloadSfxBuffers();
        this._preloadMusicBuffers();
      }
    } catch (e) {
      console.warn('[audio] Web Audio API failed:', e);
    }

    if (this.musicEnabled) this.startMusic();
  }
  
  async _preloadSfxBuffers() {
    if (!this._audioCtx) return;
    const urls = Object.values(SFX_LIST);
    for (const url of urls) {
      try {
        const res = await fetch(url);
        const arr = await res.arrayBuffer();
        const buf = await this._audioCtx.decodeAudioData(arr);
        this._sfxBuffers[url] = buf;
      } catch (e) {
        console.warn('[audio] SFX preload failed:', url);
      }
    }
  }

/* ---------- Музыка: только Web Audio API, без HTMLMediaElement ---------- */

async _preloadMusicBuffers() {
  if (!this._audioCtx) return;
  for (let i = 0; i < MUSIC_PLAYLIST.length; i++) {
    const url = MUSIC_PLAYLIST[i];
    try {
      const response = await fetch(bust(url));
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.arrayBuffer();
      this._musicBuffers[i] = await this._audioCtx.decodeAudioData(data);
      if (i === this._index && this.musicEnabled && this._started && !this._el) {
        this._startMusicBuffer(i, this._musicOffset, true);
      }
    } catch (error) {
      console.error('[audio] music decode failed:', url, error);
      this._failedMusicIndices = this._failedMusicIndices || new Set();
      this._failedMusicIndices.add(i);
      if (i === this._index && !this._el) this._onTrackEnded(i, true);
    }
  }
}

startMusic() {
  if (this._el || !this._audioCtx) return;
  this._index = 0;
  this._musicOffset = 0;
  this._firstPlayDone = false;
  this._startMusicBuffer(this._index, 0, true);
}

_startMusicBuffer(index, offset = 0, fadeIn = false) {
  const ctx = this._audioCtx;
  const buffer = this._musicBuffers[index];
  if (!ctx || !buffer || !this.musicEnabled || this._el) return;
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.connect(this._musicGain);
  this._el = source;
  this._musicOffset = Math.max(0, offset % buffer.duration);
  this._musicStartedAt = ctx.currentTime;
  this._musicSources.add(source);
  source.onended = () => {
    this._musicSources.delete(source);
    if (this._el !== source) return;
    this._el = null;
    this._musicOffset = 0;
    this._onTrackEnded(index, false);
  };
  try {
    source.start(0, this._musicOffset);
    const target = this.musicEnabled ? this.masterVolume : 0;
    if (fadeIn) {
      this._musicGain.gain.cancelScheduledValues(ctx.currentTime);
      this._musicGain.gain.setValueAtTime(0, ctx.currentTime);
      this._musicGain.gain.linearRampToValueAtTime(target, ctx.currentTime + FADE_IN_MS / 1000);
    } else {
      this._musicGain.gain.setTargetAtTime(target, ctx.currentTime, 0.05);
    }
  } catch (error) {
    this._el = null;
    console.error('[audio] WebAudio source start failed:', error);
    this._onTrackEnded(index, true);
  }
}

stopMusic() {
  if (this._musicTimer) clearTimeout(this._musicTimer);
  this._musicTimer = null;
  if (!this._el) return;
  const source = this._el;
  this._musicOffset = this._currentMusicOffset();
  this._el = null;
  try { source.stop(); } catch { /* already stopped */ }
  try { source.disconnect(); } catch { /* noop */ }
  this._musicGain.gain.setTargetAtTime(0, this._audioCtx.currentTime, 0.05);
}

enableMusic() {
  this.musicEnabled = true;
  if (!this._started || !this._audioCtx) return;
  if (!this._el) {
    if (this._musicBuffers[this._index]) this._startMusicBuffer(this._index, this._musicOffset, false);
    return;
  }
  this._musicGain.gain.setTargetAtTime(this.masterVolume, this._audioCtx.currentTime, 0.08);
}

disableMusic() {
  this.musicEnabled = false;
  if (this._musicGain && this._audioCtx) {
    this._musicGain.gain.setTargetAtTime(0, this._audioCtx.currentTime, 0.08);
  }
}

_currentMusicOffset() {
  const buffer = this._musicBuffers[this._index];
  if (!buffer || !this._el || !this._audioCtx) return this._musicOffset;
  return (this._musicOffset + this._audioCtx.currentTime - this._musicStartedAt) % buffer.duration;
}

_onTrackEnded(index, failed = false) {
  if (this._el) return;
  if (failed) this._failedMusicIndices = this._failedMusicIndices || new Set();
  if (failed) this._failedMusicIndices.add(index);
  if (this._failedMusicIndices?.size >= MUSIC_PLAYLIST.length) {
    console.warn('[audio] playlist failed — stopping');
    this.musicEnabled = false;
    return;
  }
  this._index = (index + 1) % MUSIC_PLAYLIST.length;
  this._musicOffset = 0;
  this._firstPlayDone = true;
  if (this._musicTimer) clearTimeout(this._musicTimer);
  const tryStartNext = () => {
    this._musicTimer = null;
    if (!this.musicEnabled || this._el) return;
    if (this._musicBuffers[this._index]) {
      this._startMusicBuffer(this._index, 0, false);
    } else if (this._failedMusicIndices?.has(this._index)) {
      this._onTrackEnded(this._index, true);
    } else {
      this._musicTimer = setTimeout(tryStartNext, 500);
    }
  };
  this._musicTimer = setTimeout(tryStartNext, MUSIC_GAP_MS);
}

  /* ---------- SFX ---------- */

  playSfx(name) {
    if (!this.sfxEnabled || this._sfxPaused || !this._audioCtx) return;
    const buffer = this._sfxBuffers[SFX_LIST[name]];
    if (!buffer) return; // no HTMLAudio fallback: it registers a system media player
    if (this._audioCtx.state === 'suspended') this._audioCtx.resume().catch(() => {});
    try {
      const source = this._audioCtx.createBufferSource();
      const gain = this._audioCtx.createGain();
      source.buffer = buffer;
      gain.gain.value = this.masterVolume;
      source.connect(gain);
      gain.connect(this._audioCtx.destination);
      this._sfxPool.add(source);
      source.onended = () => { this._sfxPool.delete(source); source.disconnect(); gain.disconnect(); };
      source.start(0);
    } catch (error) {
      console.warn('[audio] WebAudio SFX play failed:', error);
    }
  }

  /** Жёсткая остановка звуков при рекламе/сворачивании. */
  stopAllSfx() {
    this._sfxPaused = true;
    for (const source of this._sfxPool) { try { source.stop(); } catch { /* ended */ } }
    this._sfxPool.clear();
    if (this._audioCtx?.state === 'running') this._audioCtx.suspend().catch(() => {});
  }

  pauseAllSfx() {
    this._sfxPaused = true;
    if (this._audioCtx?.state === 'running') this._audioCtx.suspend().catch(() => {});
  }

  resumeAllSfx() {
    this._sfxPaused = false;
    if (this._audioCtx?.state === 'suspended') this._audioCtx.resume().catch(() => {});
  }

  /** Пауза музыки сохраняет позицию буфера. */
  pauseMusic() {
    if (!this._el || !this._audioCtx) return;
    const source = this._el;
    this._musicOffset = this._currentMusicOffset();
    this._el = null;
    try { source.stop(); } catch { /* noop */ }
    try { source.disconnect(); } catch { /* noop */ }
  }

  resumeMusic() {
    if (this._el || !this.musicEnabled || !this._audioCtx) return;
    if (this._audioCtx.state === 'suspended') this._audioCtx.resume().catch(() => {});
    if (this._musicBuffers[this._index]) this._startMusicBuffer(this._index, this._musicOffset, false);
  }

  setSfxEnabled(on) { this.sfxEnabled = !!on; }


}

/* Синглтон */
export const audio = new AudioEngine();