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

/** Build the selected deck and ask the browser to decode every unique face image
 * before gameplay, avoiding decode work on the first visible reveal. */
export async function warmUpDeckDecoded(cardStyle, suitStyle) {
  warmUpDeck(cardStyle, suitStyle);
  const images = new Map();
  for (const suit of SUITS) for (const rank of RANKS) {
    const template = getCardTemplate(rank, suit, cardStyle, suitStyle);
    for (const image of template.querySelectorAll('img')) {
      const url = image.currentSrc || image.src;
      if (url && !images.has(url)) images.set(url, image);
    }
    // Rank glyphs are CSS mask URLs rather than <img> nodes.
    for (const glyph of template.querySelectorAll('.corner__rank-img, .center-rank__rank-img')) {
      const value = glyph.style.getPropertyValue('--src');
      const url = value.match(/url\(["']?(.*?)["']?\)/)?.[1];
      if (url && !images.has(url)) {
        const image = new Image();
        image.src = url;
        images.set(url, image);
      }
    }
  }
  await Promise.allSettled([...images.entries()].map(async ([url, image]) => {
    const started = performance.now();
    let decoded = true;
    try {
      if (typeof image.decode === 'function') await image.decode();
      else if (!image.complete) await new Promise(resolve => {
        image.addEventListener('load', resolve, { once: true });
        image.addEventListener('error', () => { decoded = false; resolve(); }, { once: true });
      });
    } catch { decoded = false; }
    window.__gameProfiler?.record('card.imageDecode', performance.now() - started, { asset: url.split('/').pop(), decoded });
  }));
  return images.size;
}

export function clearCache() {
  __cache.clear();
}

export function cacheSize() {
  return __cache.size;
}

export const ALL_RANKS = RANKS;
export const ALL_SUITS = SUITS;
