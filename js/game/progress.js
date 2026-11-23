const LS_KEY = 'fool_progress';

const ORDER_36 = ['6','7','8','9','10','J','Q','K','A'];
const ORDER_52 = ['2','3','4','5','6','7','8','9','10','J','Q','K','A'];

export const QUEST_STAGES = [
  { deckSize: 36, minPogons: 1, order: ORDER_36 },
  { deckSize: 52, minPogons: 1, order: ORDER_52 },
  { deckSize: 36, minPogons: 2, order: ORDER_36 },
  { deckSize: 52, minPogons: 2, order: ORDER_52 },
  { deckSize: 36, minPogons: 3, order: ORDER_36 },
  { deckSize: 52, minPogons: 3, order: ORDER_52 },
  { deckSize: 36, minPogons: 4, order: ORDER_36 },
  { deckSize: 52, minPogons: 4, order: ORDER_52 },
];

function defaultState() {
  const quests = {};
  for (const r of ORDER_52) quests[r] = { progress: 0, claimed: 0 };
  return {
    stylePoints: 0,
    quests,
    stats: { games: 0, wins: 0, losses: 0, draws: 0 },
	foolToken: null,
	firstWinShown: false,
	shopIntroSeen: false,
	seenStyleItems: {},
	giftGiven: false,
	tempItems: null,
	trialUnlocked: false,
	questStage: 0,
	achievements: {},     // { [id]: { unlockedAt: timestamp } }
	
    pendingAchievements: [],   // ← ДОБАВИТЬ
    totalEpaulettes: 0,        // ← ДОБАВИТЬ
	
	  // Счётчик подряд идущих побед/поражений на текущей сложности.
	  // Сбрасывается при смене сложности или ничьей.
	  streak: { level: 1, wins: 0, losses: 0 },
	  
    // какие индексы элементов куплены
	purchases: {
	  shirt:  [0],
	  design: [0, 3],
	  suits:  [0, 3],   // default и gradient открыты
	  table:  [0],
	  decor:  [],
	},
  };
}

function load() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return defaultState();
    const p = JSON.parse(raw);
    const def = defaultState();
    return {
      stylePoints: p.stylePoints ?? 0,
      quests:      Object.assign(def.quests, p.quests || {}),
      stats:       Object.assign(def.stats,  p.stats  || {}),
      purchases:   Object.assign(def.purchases, p.purchases || {}),
	  foolToken:   p.foolToken ?? null,
	  firstWinShown: p.firstWinShown ?? false,
	  shopIntroSeen: p.shopIntroSeen ?? false,
	  seenStyleItems: p.seenStyleItems ?? {},
	  giftGiven: p.giftGiven ?? false,
	  tempItems: p.tempItems ?? null,
	  trialUnlocked: p.trialUnlocked ?? false,
	  questStage: Number.isInteger(p.questStage)
        ? Math.max(0, Math.min(QUEST_STAGES.length - 1, p.questStage))
        : (p.trialUnlocked ? 1 : 0),
	  streak:        p.streak || { level: 1, wins: 0, losses: 0 },   // ← ДОБАВИТЬ
	  achievements: p.achievements || {},
	  
      pendingAchievements: p.pendingAchievements || [],   // ← ДОБАВИТЬ
      totalEpaulettes: p.totalEpaulettes || 0,            // ← ДОБАВИТЬ
    };
  } catch { return defaultState(); }
}

export const Progress = load();

export function saveProgress() {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(Progress));
  } catch { /* noop */ }

  // опционально — облачный синк через SDK. Ошибок локально не даёт.
  try {
    import('../sdk/yandex_sdk.js')
      .then(({ ysdk }) => ysdk.saveProgress(Progress))
      .catch(() => {});
  } catch { /* noop */ }
}

export function addStylePoints(n) {
  Progress.stylePoints = (Progress.stylePoints || 0) + n;
  //ysdk.saveProgress(Progress);
  saveProgress();
}

export function recordOutcome(winner, aiLevel) {
  const s = Progress.stats;
  s.games++;
  if (winner === 'player') s.wins++;
  else if (winner === 'cpu') s.losses++;
  else s.draws++;

  // Обновляем streak по сложности
  const lvl = aiLevel || 1;
  if (!Progress.streak) Progress.streak = { level: lvl, wins: 0, losses: 0 };
  if (Progress.streak.level !== lvl) {
    Progress.streak = { level: lvl, wins: 0, losses: 0 };
  }
  if (winner === 'player')      { Progress.streak.wins++;   Progress.streak.losses = 0; }
  else if (winner === 'cpu')    { Progress.streak.losses++; Progress.streak.wins   = 0; }
  // draw — streak не трогаем

  saveProgress();
}

/* ================================================================
 *  КВЕСТЫ — строго по порядку
 * ================================================================ */

/** Открыт ли режим «Испытание» — все квесты 36-колоды заклеймлены. */
export function isTestModeUnlocked() {
  return Progress.trialUnlocked === true;
}

/** Current challenge branch: 36/52 cards with a minimum pogon count. */
export function currentQuestStage() {
  const index = Math.max(0, Math.min(QUEST_STAGES.length - 1, Progress.questStage || 0));
  return { index, ...QUEST_STAGES[index] };
}

/** Текущий активный порядок квестов. */
export function activeOrder() {
  return currentQuestStage().order;
}

/** Может ли текущий игровой ранг идти в зачёт квеста?
 *  Нелинейный режим: любой ранг из активного списка засчитывается независимо от прогресса других. */
function canCredit(rank, deckSize) {
  const stage = currentQuestStage();
  return stage.order.includes(rank) && Number(deckSize) === stage.deckSize;
}

export function creditQuest(rank, count, deckSize) {
  const stage = currentQuestStage();
  if (count < stage.minPogons) return null;
  if (!canCredit(rank, deckSize)) return null;
  const q = Progress.quests[rank];
  if (!q) return null;
  // Прогресс = максимум из текущего и числа выброшенных карт этого ранга (от 1 до 4)
  const newProgress = Math.min(count, 4);
  if (newProgress <= q.progress) return null; // Прогресс не изменился — не показываем сообщение
  q.progress = newProgress;
  saveProgress();
  return rank;
}

export function claimableRanks() {
  const order = activeOrder();
  const out = [];
  for (const r of order) {
    const q = Progress.quests[r];
    if (q.progress >= currentQuestStage().minPogons && q.claimed < q.progress) out.push(r);
  }
  return out;
}

export function claimQuestReward() {
  const stageBefore = currentQuestStage();
  const ranks = claimableRanks();
  let total = 0;
  for (const r of ranks) {
    const q = Progress.quests[r];
    total += 250 + 50 * q.progress;
    q.claimed = q.progress;
  }
  if (total > 0) Progress.stylePoints += total;

  const allRanksClaimed = stageBefore.order.every((r) => {
    const q = Progress.quests[r];
    return q && q.progress >= stageBefore.minPogons && q.claimed >= q.progress;
  });

  // Achievements for the original 36/52 branches are awarded on claim, not
  // when the match ends. Advanced branches intentionally have no achievements.
  const newlyUnlocked = [];
  const all36Claimed = ORDER_36.every((r) => {
    const q = Progress.quests[r]; return q && q.progress >= 1 && q.claimed >= q.progress;
  });
  const all52Claimed = ORDER_52.every((r) => {
    const q = Progress.quests[r]; return q && q.progress >= 1 && q.claimed >= q.progress;
  });
  if (stageBefore.minPogons === 1 && all36Claimed && unlockAchievement('quest_36')) newlyUnlocked.push('quest_36');
  if (stageBefore.minPogons === 1 && all52Claimed && unlockAchievement('quest_52')) newlyUnlocked.push('quest_52');

  let trialUnlockedNow = false;
  let nextStage = stageBefore.index;
  if (allRanksClaimed && stageBefore.index < QUEST_STAGES.length - 1) {
    nextStage = stageBefore.index + 1;
    Progress.questStage = nextStage;
    if (stageBefore.index === 0 && !Progress.trialUnlocked) {
      Progress.trialUnlocked = true;
      trialUnlockedNow = true;
    }
    for (const r of ORDER_52) Progress.quests[r] = { progress: 0, claimed: 0 };
  }

  saveProgress();
  return { total, ranks, newlyUnlocked, stageCompleted: allRanksClaimed,
    previousStage: stageBefore.index, nextStage, trialUnlockedNow,
    progressionComplete: nextStage === QUEST_STAGES.length - 1 && allRanksClaimed };
}

export const AD_ITEMS = {
  shirt:  [4],   // shirt_N1
  design: [3],   // 'rank-no-corners'
  suits:  [5],   // 'golden'
  table:  [4],   // violet_table
  decor:  [2],   // parket
};
export function isAdItem(cat, index) {
  return (AD_ITEMS[cat] || []).includes(index);
}
export function unlockByAd(cat, index) {
  if (!Progress.purchases[cat]) Progress.purchases[cat] = [];
  if (Progress.purchases[cat].includes(index)) return { ok: false, reason: 'already' };
  Progress.purchases[cat].push(index);
  saveProgress();
  return { ok: true };
}

/* ================================================================
 *  FIRST-RUN GIFT — временные предметы на 3 матча
 * ================================================================ */

/**
 * Подарок при первом запуске: набор оформления на 3 матча.
 * Индексы соответствуют массивам в ASSETS / стилям из STYLE.
 */
export const GIFT_ITEMS = {
  shirt:  { index: 3, matches: 3 },   // shirt_N1
  design: { index: 1, matches: 3 },   // 'center'
  suits:  { index: 2, matches: 3 },   // 'barhat'
  table:  { index: 3, matches: 3 },   // orange_table
  decor:  { index: 1, matches: 3 },   // collage
};

/** Выдать подарок (один раз в жизни профиля). Возвращает true если выдан. */
export function giveFirstRunGift() {
  if (Progress.giftGiven) return false;
  const items = {};
  for (const cat in GIFT_ITEMS) {
    items[cat] = {
      index: GIFT_ITEMS[cat].index,
      matchesLeft: GIFT_ITEMS[cat].matches,
    };
  }
  Progress.tempItems = items;
  Progress.giftGiven = true;
  saveProgress();
  return true;
}

/** Является ли элемент активным временным подарком (ещё не истёк). */
export function isTempItem(cat, index) {
  const t = Progress.tempItems;
  return !!(t && t[cat] && t[cat].index === index && t[cat].matchesLeft > 0);
}

/** Сколько матчей осталось у временного предмета (0 если не активен). */
export function getTempMatchesLeft(cat, index) {
  const t = Progress.tempItems;
  if (!t || !t[cat]) return 0;
  if (t[cat].index !== index) return 0;
  return t[cat].matchesLeft;
}

/**
 * Уменьшить счётчики на 1 (после завершённого матча).
 * Возвращает массив истёкших { cat, index } — их надо откатить.
 */
export function tickTempItems() {
  if (!Progress.tempItems) return [];
  const expired = [];
  for (const cat in Progress.tempItems) {
    const ti = Progress.tempItems[cat];
    if (ti.matchesLeft > 0) ti.matchesLeft--;
    if (ti.matchesLeft === 0) expired.push({ cat, index: ti.index });
  }
  // удаляем истёкшие из tempItems
  for (const e of expired) {
    delete Progress.tempItems[e.cat];
  }
  saveProgress();
  return expired;
}

/* ================================================================
 *  STYLE — просмотренные элементы
 * ================================================================ */

/** Пометить элемент STYLE просмотренным (после клика). */
export function markStyleItemSeen(cat, index) {
  Progress.seenStyleItems[`${cat}:${index}`] = true;
  saveProgress();
}

/** Просмотрен ли элемент STYLE. */
export function isStyleItemSeen(cat, index) {
  return !!Progress.seenStyleItems[`${cat}:${index}`];
}

/**
 * Есть ли хотя бы один купленный, но не просмотренный в STYLE элемент.
 * Элементы с index 0 (стартовые) не считаются "новыми".
 */
export function hasUnseenStyleItems() {
  for (const cat of ['shirt', 'design', 'suits', 'table', 'decor']) {
    const purchased = Progress.purchases[cat] || [];
    for (const idx of purchased) {
      if (idx === 0) continue;
      if (!isStyleItemSeen(cat, idx)) return true;
    }
  }
  return false;
}

export function resetQuests() {
  for (const r of ORDER_52) {
    Progress.quests[r] = { progress: 0, claimed: 0 };
  }
  Progress.stylePoints = 0;
  Progress.trialUnlocked = false;
  Progress.questStage = 0;
  saveProgress();
}

/**
 * DEV-функция. Полный сброс прогресса — как при первом запуске.
 * Сбрасывает статистику, очки, квесты, покупки, жетон дурака.
 * Купленное и подарки будут пересозданы заново.
 */
export function resetAll() {
  Progress.stylePoints = 0;
  Progress.stats = { games: 0, wins: 0, losses: 0, draws: 0 };

  Progress.quests = {};
  for (const r of ORDER_52) Progress.quests[r] = { progress: 0, claimed: 0 };

  Progress.purchases = {
    shirt:  [0],
    design: [0, 3],
    suits:  [0, 3],
    table:  [0],
    decor:  [],
  };

  Progress.foolToken = null;
  Progress.firstWinShown = false;
  Progress.shopIntroSeen = false;
  Progress.seenStyleItems = {};
  Progress.giftGiven = false;
  Progress.tempItems = null;
  Progress.trialUnlocked = false;
  Progress.questStage = 0;
  Progress.streak = { level: 1, wins: 0, losses: 0 };   // ← ДОБАВИТЬ
  Progress.achievements = {};
  
  Progress.pendingAchievements = [];
  Progress.totalEpaulettes = 0;
  
  saveProgress();
}

//~
/* ================================================================
 *  ЖЕТОН ДУРАКА
 * ================================================================ */

/**
 * Присвоить жетон дурака. owner: 'player' | 'cpu', mode: 'podkidnoy' | 'perevodnoy'.
 * Токен запоминает, кто в каком режиме остался дураком.
 */
export function setFoolToken(owner, mode) {
  Progress.foolToken = { owner, mode };
  saveProgress();
}

/** Сбросить жетон (например, после ничьей). */
export function clearFoolToken() {
  Progress.foolToken = null;
  saveProgress();
}

/* ================================================================
 *  ПОКУПКИ
 * ================================================================ */

export const PRICES = {
  shirt:  500,
  design: 350,
  suits:  400,   // ← стили мастей
  table:  250,
  decor:  2000,
};

export function isPurchased(cat, index) {
  if ((Progress.purchases[cat] || []).includes(index)) return true;
  return isTempItem(cat, index);
}

export function purchaseItem(cat, index, price) {
  // Блокируем только ПЕРМАНЕНТНУЮ покупку.
  // Временный подарок (tempItems) покупать разрешено — он станет постоянным.
  if ((Progress.purchases[cat] || []).includes(index)) {
    return { ok: false, reason: 'already' };
  }
  if (Progress.stylePoints < price) return { ok: false, reason: 'no_money' };
  Progress.stylePoints -= price;
  if (!Progress.purchases[cat]) Progress.purchases[cat] = [];
  Progress.purchases[cat].push(index);
  saveProgress();
  return { ok: true };
}

/* ================================================================
 *  ДОСТИЖЕНИЯ
 * ================================================================ */

export function isAchievementUnlocked(id) {
  return !!(Progress.achievements && Progress.achievements[id]);
}

/**
 * Открыть достижение. Возвращает true, если только что открыто
 * (false — если уже было).
 */
export function unlockAchievement(id) {
  if (!Progress.achievements) Progress.achievements = {};
  if (Progress.achievements[id]) return false;
  Progress.achievements[id] = { unlockedAt: Date.now() };
  saveProgress();
  return true;
}

export function unlockedCount() {
  return Object.keys(Progress.achievements || {}).length;
}

export function setPendingAchievement(id) {
  if (!Progress.pendingAchievements) Progress.pendingAchievements = [];
  if (Progress.pendingAchievements.length > 0) return false; // уже есть один
  Progress.pendingAchievements.push(id);
  saveProgress();
  return true;
}

export function popPendingAchievement() {
  if (!Progress.pendingAchievements || !Progress.pendingAchievements.length) return null;
  const id = Progress.pendingAchievements.shift();
  saveProgress();
  return id;
}

export function peekPendingAchievement() {
  if (!Progress.pendingAchievements || !Progress.pendingAchievements.length) return null;
  return Progress.pendingAchievements[0];
}

export function addTotalEpaulettes(n) {
  Progress.totalEpaulettes = (Progress.totalEpaulettes || 0) + Math.max(0, n | 0);
  saveProgress();
}