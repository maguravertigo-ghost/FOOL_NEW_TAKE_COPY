import {
  Progress,
  unlockAchievement,
  isAchievementUnlocked,
} from './progress.js';
import { ASSETS } from '../assets.js';

// In a match, first-time result achievements precede the exact pogon achievement.
const PRIORITY = [
  'first_win', 'first_lose', 'first_draw',
  'pogon_4', 'pogon_3', 'pogon_2', 'pogon_1',
  'quest_52', 'quest_36', 'collector',
];

export function isCollectorComplete() {
  const requirements = {
    shirt: ASSETS.shirts,
    table: ASSETS.tables,
    decor: ASSETS.decorations,
    suits: Array(6),
    design: Array(6),
  };
  return Object.entries(requirements).every(([cat, items]) => {
    const owned = Progress.purchases[cat] || [];
    return items.every((_, index) => owned.includes(index));
  });
}

export function checkCollectorAchievement() {
  return isCollectorComplete() && unlockAchievement('collector');
}

export const AchievementManager = {
  /** Check one match result. Pogon achievements require the exact count thrown. */
  check({ winner, pogonsThrown }) {
    const newly = [];
    if (winner === 'player' && Progress.stats.wins === 1 && unlockAchievement('first_win')) newly.push('first_win');
    if (winner === 'cpu' && Progress.stats.losses === 1 && unlockAchievement('first_lose')) newly.push('first_lose');
    if (winner === 'draw' && Progress.stats.draws === 1 && unlockAchievement('first_draw')) newly.push('first_draw');

    if (winner === 'player' && [1, 2, 3, 4].includes(pogonsThrown)) {
      const id = `pogon_${pogonsThrown}`;
      if (unlockAchievement(id)) newly.push(id);
    }
    if (checkCollectorAchievement()) newly.push('collector');

    newly.sort((a, b) => PRIORITY.indexOf(a) - PRIORITY.indexOf(b));
    return newly;
  },
  PRIORITY,
};
