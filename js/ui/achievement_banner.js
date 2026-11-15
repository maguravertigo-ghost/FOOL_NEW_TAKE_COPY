import { ASSETS } from '../assets.js';
import { t } from '../i18n/index.js';

export function createAchievementBanner(id) {
  const el = document.createElement('div');
  el.className = 'ach-banner';

  const src = (ASSETS.achievements && ASSETS.achievements[id]) || ASSETS.starIcon;

  el.innerHTML = `
    <img class="ach-banner__img" src="${src}" alt=""
         onerror="this.src='${ASSETS.starIcon}'">
    <div class="ach-banner__text">
      <div class="ach-banner__label">${t('achieve.unlocked')}</div>
      <div class="ach-banner__title">${t('achieve.' + id + '.title')}</div>
    </div>
  `;
  return el;
}

/**
 * Показать «плавающий» баннер поверх сцены (для показа в меню после перезахода).
 * Автоматически скрывается через `duration` мс.
 */
export function showFloatingAchievement(id, duration = 10000) {
  const banner = createAchievementBanner(id);
  banner.classList.add('ach-banner--floating');
  document.getElementById('scene').appendChild(banner);

  setTimeout(() => {
    banner.classList.add('ach-banner--out');
    setTimeout(() => banner.remove(), 600);
  }, duration);
}