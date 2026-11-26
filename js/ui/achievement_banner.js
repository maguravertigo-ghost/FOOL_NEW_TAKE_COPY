import { ASSETS } from '../assets.js';
import { t } from '../i18n/index.js';

const activeTimers = new Set();
let adsPaused = false;
let gameIsActive = false;
let frameId = 0;
let lastFrameAt = 0;

export function shouldPauseAchievementTimers() {
  return adsPaused || document.hidden || !!document.querySelector('.msg-overlay');
}

function tick(now) {
  if (!lastFrameAt) lastFrameAt = now;
  const delta = Math.min(250, now - lastFrameAt);
  lastFrameAt = now;
  const isGameOver = !!document.getElementById('game-over');
  const multiplier = gameIsActive && !isGameOver ? 2 : 1;
  // Modal dialogs (notably the first-win style-points dialog) cover the toast;
  // do not burn its visible-time budget while the player cannot see it.
  const suspended = shouldPauseAchievementTimers();

  for (const timer of [...activeTimers]) {
    if (suspended) continue;
    timer.remaining -= delta * multiplier;
    if (timer.remaining <= 0) {
      activeTimers.delete(timer);
      timer.node.classList.add('ach-banner--out');
      setTimeout(() => timer.node.remove(), 600);
    }
  }
  if (activeTimers.size) frameId = requestAnimationFrame(tick);
  else { frameId = 0; lastFrameAt = 0; }
}

function registerTimedBanner(node, parent, duration) {
  // A fresh unlock restarts the visible achievement window, so stacked unlocks
  // are not lost behind the previous notification's timeout.
  for (const timer of activeTimers) timer.remaining = duration;
  parent.appendChild(node);
  activeTimers.add({ node, remaining: duration });
  if (!frameId) frameId = requestAnimationFrame(tick);
  return node;
}

export function setAchievementTimerState({ paused, inGame } = {}) {
  if (typeof paused === 'boolean') adsPaused = paused;
  if (typeof inGame === 'boolean') gameIsActive = inGame;
}

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
    banner.style.animationDelay = `${i * 500}ms`;
    group.appendChild(banner);
  });
  return group;
}

export function showFloatingAchievement(id, duration = 10000) {
  const scene = document.getElementById('scene');
  if (!scene) return null;
  const banner = createAchievementBanner(id);
  banner.classList.add('ach-banner--floating');
  return registerTimedBanner(banner, scene, duration);
}

export function showFloatingAchievementGroup(ids, duration = 10000) {
  if (!ids || !ids.length) return null;
  if (ids.length === 1) return showFloatingAchievement(ids[0], duration);
  const scene = document.getElementById('scene');
  if (!scene) return null;
  const group = createAchievementBannerGroup(ids);
  group.classList.add('ach-banner--floating-group');
  return registerTimedBanner(group, scene, duration);
}

export function showTimedAchievementNode(node, parent, duration = 10000) {
  return registerTimedBanner(node, parent, duration);
}
