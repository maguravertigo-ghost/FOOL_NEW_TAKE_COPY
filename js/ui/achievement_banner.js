import { ASSETS } from '../assets.js';
import { t } from '../i18n/index.js';

export function createAchievementBanner(id) {
  const el = document.createElement('div');
  el.className = 'ach-banner';

  const src = (ASSETS.achievements && ASSETS.achievements[id]) || ASSETS.starIcon;
  el.innerHTML = `
    <img class="ach-banner__img" src="${src}" alt="" onerror="this.src='${ASSETS.starIcon}'">
    <div class="ach-banner__text">
      <div class="ach-banner__label">${t('achieve.unlocked')}</div>
      <div class="ach-banner__title">${t('achieve.' + id + '.title')}</div>
    </div>
  `;
  return el;
}

/** Centered pair/stack of achievements, sequenced with a short entrance delay. */
export function createAchievementBannerGroup(ids) {
  if (ids.length === 1) return createAchievementBanner(ids[0]);
  const group = document.createElement('div');
  group.className = 'ach-banner-group';
  ids.forEach((id, i) => {
    const banner = createAchievementBanner(id);
    banner.classList.add('ach-banner--grouped');
    banner.style.animationDelay = `${i * 320}ms`;
    group.appendChild(banner);
  });
  return group;
}

/** Show a floating achievement over the scene (e.g. after a menu purchase). */
export function showFloatingAchievement(id, duration = 10000) {
  const banner = createAchievementBanner(id);
  banner.classList.add('ach-banner--floating');
  document.getElementById('scene').appendChild(banner);

  setTimeout(() => {
    banner.classList.add('ach-banner--out');
    setTimeout(() => banner.remove(), 600);
  }, duration);
}
