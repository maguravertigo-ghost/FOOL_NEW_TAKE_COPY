/* card_cache.js
   Кеш готовых шаблонов карт.
   Строим каждую комбинацию (ранг × масть × стиль карты × стиль мастей)
   один раз, дальше отдаём через cloneNode — это <0.2 мс на карту. */

import { buildCard } from './card_constructor.js';

const RANKS = ['2','3','4','5','6','7','8','9','10','J','Q','K','A'];
const SUITS = ['hearts','diamonds','clubs','spades'];

const __cache = new Map();

const key = (rank, suit, cardStyle, suitStyle) =>
  `${rank}|${suit}|${cardStyle}|${suitStyle}`;

export function getCardTemplate(rank, suit, cardStyle, suitStyle) {
  const k = key(rank, suit, cardStyle, suitStyle);
  let node = __cache.get(k);
  if (!node) {
    const started = performance.now();
    node = buildCard(rank, suit, cardStyle, { suitStyle });
    __cache.set(k, node);
    window.__gameProfiler?.record('card.templateBuild', performance.now() - started, { rank, suit, cardStyle, suitStyle });
  }
  return node;
}

export function spawnCard(rank, suit, cardStyle, suitStyle) {
  const started = performance.now();
  const node = getCardTemplate(rank, suit, cardStyle, suitStyle).cloneNode(true);
  window.__gameProfiler?.record('card.templateClone', performance.now() - started, { rank, suit, cardStyle, suitStyle });
  return node;
}

export function warmUpDeck(cardStyle, suitStyle) {
  for (const s of SUITS)
    for (const r of RANKS)
      getCardTemplate(r, s, cardStyle, suitStyle);
}

export function clearCache() {
  __cache.clear();
}

export function cacheSize() {
  return __cache.size;
}

export const ALL_RANKS = RANKS;
export const ALL_SUITS = SUITS;