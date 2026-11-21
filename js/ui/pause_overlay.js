import { audio } from '../audio/audio_engine.js';
import { t } from '../i18n/index.js';
import { GameSettings, saveSettings } from '../game/settings.js';

export class PauseOverlay {
  constructor({ onResume, onExit }) {
    this.onResume = onResume;
    this.onExit = onExit;

    this.el = document.createElement('div');
    this.el.id = 'pause-overlay';
    this.el.innerHTML = `
      <div class="pause-box">
        <div class="pause-title">${t('pause.title')}</div>
<div class="pause-volume">
  <div class="pause-volume__label">${t('pause.volume')}</div>
          <input type="range" id="pause-volume-slider"
                 min="0" max="100" step="1"
                 value="${Math.round(audio.getVolume() * 100)}">
        </div>
<button class="pause-btn" data-action="resume">${t('pause.resume')}</button>
<button class="pause-btn pause-btn--danger" data-action="exit">${t('pause.exit')}</button>
      </div>
    `;
    this.el.style.display = 'none';

    this.el.querySelector('[data-action="resume"]').addEventListener('click', () => {
      audio.playSfx('tap_up');
      this.hide();
      if (typeof this.onResume === 'function') this.onResume();
    });
    this.el.querySelector('[data-action="exit"]').addEventListener('click', () => {
      audio.playSfx('tap_up');
      if (typeof this.onExit === 'function') this.onExit();
      else this.hide();
    });

const slider = this.el.querySelector('#pause-volume-slider');

const updateVisual = () => {
  const v = Number(slider.value);
  slider.style.setProperty('--val', v + '%');
};

slider.addEventListener('input', () => {
  const v = Number(slider.value) / 100;
  audio.setVolume(v);
  updateVisual();
});
slider.addEventListener('change', () => {
  GameSettings.masterVolume = Number(slider.value) / 100;
  saveSettings();
});

// инициализируем визуал сразу
updateVisual();
this._updateSliderVisual = updateVisual;

    // TV-навигация: Продолжить ↔ громкость ↔ В меню.
    this._navTarget = null;
    this._applyNavFocus = () => {
      this.el.querySelectorAll('.kbd-focus').forEach(node => node.classList.remove('kbd-focus'));
      if (this._navTarget === 'resume') this.el.querySelector('[data-action="resume"]')?.classList.add('kbd-focus');
      if (this._navTarget === 'volume') slider.classList.add('kbd-focus');
      if (this._navTarget === 'exit') this.el.querySelector('[data-action="exit"]')?.classList.add('kbd-focus');
    };

    this.el.addEventListener('pointerdown', () => {
      this._navTarget = null;
      this._applyNavFocus();
    });

    window.addEventListener('keydown', (e) => {
      if (this.el.style.display === 'none' || e.repeat) return;
      if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter', ' '].includes(e.key)) return;
      e.preventDefault();

      if (!this._navTarget) {
        this._navTarget = 'resume';
        this._applyNavFocus();
        if (e.key.startsWith('Arrow')) return;
      }

      if (this._navTarget === 'volume' && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
        const next = Math.max(0, Math.min(100, Number(slider.value) + (e.key === 'ArrowRight' ? 5 : -5)));
        slider.value = String(next);
        slider.dispatchEvent(new Event('input', { bubbles: true }));
        slider.dispatchEvent(new Event('change', { bubbles: true }));
        return;
      }

      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        const up = e.key === 'ArrowUp';
        if (this._navTarget === 'resume') this._navTarget = up ? 'volume' : 'exit';
        else if (this._navTarget === 'volume') this._navTarget = up ? 'resume' : 'exit';
        else this._navTarget = up ? 'resume' : 'exit';
        this._applyNavFocus();
        return;
      }

      if ((e.key === 'Enter' || e.key === ' ') && this._navTarget !== 'volume') {
        const btn = this.el.querySelector(this._navTarget === 'resume'
          ? '[data-action="resume"]' : '[data-action="exit"]');
        if (btn) { audio.playSfx('button_click'); btn.click(); }
      }
    });

    document.getElementById('scene').appendChild(this.el);
  }

show() {
  const slider = this.el.querySelector('#pause-volume-slider');
  if (slider) {
    slider.value = Math.round(audio.getVolume() * 100);
    if (this._updateSliderVisual) this._updateSliderVisual();
  }
  this.el.style.display = 'flex';

  // При входе с клавиатуры курсор сразу на «Продолжить».
  this._navTarget = window.__lastInputWasKeyboard ? 'resume' : null;
  this._applyNavFocus();
}
  hide() {
    this.el.style.display = 'none';
    this._navTarget = null;
    this._applyNavFocus();
  }
  isVisible() { return this.el.style.display !== 'none'; }
}