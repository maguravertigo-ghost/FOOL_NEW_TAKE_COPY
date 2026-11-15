import {
  Progress,
  unlockAchievement,
  isAchievementUnlocked,
  setPendingAchievement,
} from './progress.js';
import { ASSETS } from '../assets.js';

const ORDER_36 = ['6','7','8','9','10','J','Q','K','A'];
const ORDER_52 = ['2','3','4','5','6','7','8','9','10','J','Q','K','A'];

// Если за матч открылось несколько — показываем только первый по этому списку
const PRIORITY = [
  'quest_52', 'quest_36', 'collector',
  'pogon_4', 'pogon_3', 'pogon_2', 'pogon_1',
  'first_win', 'first_lose', 'first_draw',
];

export const AchievementManager = {
  /**
   * Вызывать в конце матча (после recordOutcome).
   * @param {{ winner: 'player'|'cpu'|'draw', pogonsThrown: number }} ctx
   * @returns {string[]} массив ID только что открытых достижений
   */
    check({ winner, pogonsThrown }) {
    const newly = [];

    // ---- 1. Первая победа / поражение / ничья ----
    if (winner === 'player' && Progress.stats.wins === 1) {
      if (unlockAchievement('first_win')) newly.push('first_win');
    }
    if (winner === 'cpu' && Progress.stats.losses === 1) {
      if (unlockAchievement('first_lose')) newly.push('first_lose');
    }
    if (winner === 'draw' && Progress.stats.draws === 1) {
      if (unlockAchievement('first_draw')) newly.push('first_draw');
    }

    // ---- 2. Погоны — ТОЧНОЕ число выброшенных карт одного ранга ----
    // 1 карта → pogon_1, 2 карты → pogon_2, 3 карты → pogon_3, 4 карты → pogon_4.
    // События независимые: выкинул 4 — открывается только pogon_4.
    // Отдельные pogon_1/2/3 откроются в других матчах, где выбросишь 1/2/3.
    if (winner === 'player' && pogonsThrown === 1) {
      if (unlockAchievement('pogon_1')) newly.push('pogon_1');
    }
    if (winner === 'player' && pogonsThrown === 2) {
      if (unlockAchievement('pogon_2')) newly.push('pogon_2');
    }
    if (winner === 'player' && pogonsThrown === 3) {
      if (unlockAchievement('pogon_3')) newly.push('pogon_3');
    }
    if (winner === 'player' && pogonsThrown === 4) {
      if (unlockAchievement('pogon_4')) newly.push('pogon_4');
    }

    // ---- 4. Все квесты классики ----
    const all36 = ORDER_36.every(r => {
      const q = Progress.quests[r];
      return q && q.progress >= 1 && q.claimed >= q.progress;
    });
    if (all36 && !isAchievementUnlocked('quest_36')) {
      if (unlockAchievement('quest_36')) newly.push('quest_36');
    }

    // ---- 5. Все квесты испытания ----
    const all52 = ORDER_52.every(r => {
      const q = Progress.quests[r];
      return q && q.progress >= 1 && q.claimed >= q.progress;
    });
    if (all52 && !isAchievementUnlocked('quest_52')) {
      if (unlockAchievement('quest_52')) newly.push('quest_52');
    }

    // ---- 6. Все элементы стиля куплены ----
    if (!isAchievementUnlocked('collector')) {
      const allBought =
        Progress.purchases.shirt.length  >= ASSETS.shirts.length &&
        Progress.purchases.table.length  >= ASSETS.tables.length &&
        Progress.purchases.decor.length  >= ASSETS.decorations.length &&
        Progress.purchases.suits.length  >= 6 &&
        Progress.purchases.design.length >= 6;
      if (allBought) {
        if (unlockAchievement('collector')) newly.push('collector');
      }
    }

    // ---- Приоритет + pending ----
    newly.sort((a, b) => PRIORITY.indexOf(a) - PRIORITY.indexOf(b));
    if (newly.length > 0) {
      setPendingAchievement(newly[0]);
    }

    return newly;
  },

  /** Для UI — отдать порядок по приоритету */
  PRIORITY,
};