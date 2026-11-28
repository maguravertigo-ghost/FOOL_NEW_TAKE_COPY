import { RANK_VALUE, SUITS, RANKS_36, RANKS_52 } from './constants.js';
import { canBeat, canTranslate, canAddToTable, tableRanks } from './rules.js';

export class AI {
  constructor(session, { level = 2 } = {}) {
    this.s = session;
    this.level = level;
  }

  get hand()     { return this.s.app.accordionCpu.cards; }
  get trump()    { return this.s.trump; }
  get deckLeft() { return this.s._totalRemaining(); }
  get defSize()  { return this.s._defenderHandSize(); }
  get table()    { return this.s.round.table; }
  get playerHandSize() { return this.s.app.accordionPlayer.cards.length; }

  isTrump(c) { return c.data.suit === this.trump; }
  rank(c)    { return RANK_VALUE[c.data.rank]; }

  attackValue(c) { return this.isTrump(c) ? 100 + this.rank(c) : this.rank(c); }

  rankCountMap() {
    const m = {};
    for (const c of this.hand) m[c.data.rank] = (m[c.data.rank] || 0) + 1;
    return m;
  }

  /* ============================================================
   * ЧЕСТНОЕ ВИДЕНИЕ (CARD COUNTING)
   * ============================================================ */

  _getSeenCards() {
    const seen = new Set();
    for (const c of this.hand) seen.add(c.data.rank + c.data.suit);

    // Every face-up card currently on the table has been publicly revealed.
    for (const pair of this.table || []) {
      if (pair.atk) seen.add(pair.atk.data.rank + pair.atk.data.suit);
      if (pair.def) seen.add(pair.def.data.rank + pair.def.data.suit);
    }

    // Cards in the discard pile were visible before they were turned face-down.
    for (const c of this.s.discardPile || []) seen.add(c.data.rank + c.data.suit);

    // The trump card is public from the start, even while it remains under the stock.
    if (this.s.trumpCard) seen.add(this.s.trumpCard.data.rank + this.s.trumpCard.data.suit);
    return seen;
  }

  _getUnseenCards() {
    const seen = this._getSeenCards();
    const allRanks = Number(this.s.deckSize) === 52 ? RANKS_52 : RANKS_36;
    const unseen = [];
    for (const suit of SUITS) {
      for (const rank of allRanks) {
        if (!seen.has(rank + suit)) unseen.push({ rank, suit });
      }
    }
    return unseen;
  }

  /** Probability the hidden opponent hand contains at least one legal beater. */
  _probabilityOpponentHas(predicate) {
    const unseen = this._getUnseenCards();
    const handSize = Math.min(this.playerHandSize, unseen.length);
    if (!handSize || !unseen.length) return 0;
    const matches = unseen.reduce((n, data) => n + (predicate(data) ? 1 : 0), 0);
    if (!matches) return 0;
    if (unseen.length - matches < handSize) return 1;

    // Hypergeometric probability, without peeking at the opponent's actual hand.
    let noMatch = 1;
    for (let i = 0; i < handSize; i++) {
      noMatch *= (unseen.length - matches - i) / (unseen.length - i);
    }
    return 1 - noMatch;
  }

  _opponentCanBeatProbability(card) {
    return this._probabilityOpponentHas(data => canBeat({ data }, card, this.trump));
  }

  _opponentCanTranslateProbability(card) {
    if (!this.s.translateMode || !card || this.hand.length < 3) return 0;
    // After the opening attack CPU must retain at least two cards for a legal
    // transfer. The opponent's matching rank is estimated only from unseen cards.
    return this._probabilityOpponentHas(data => data.rank === card.data.rank);
  }

  _cardResourceCost(card, hand = this.hand) {
    const rank = this.rank(card);
    let cost = this.isTrump(card) ? 3.1 + rank * 0.11 : 0.45 + rank * 0.075;
    // Face cards, especially aces, are winning resources: don't throw them
    // away for a routine attack/defense when a smaller card is available.
    if (rank >= 11) cost += 0.55 * (rank - 10) + (rank === 14 ? 1.1 : 0);
    const matching = hand.filter(c => c !== card && c.data.rank === card.data.rank).length;
    if (matching) cost += 1.1 + matching * 0.45; // preserve attack pairs/triples when practical
    return cost;
  }

  /** Change expert posture from public game state, not hidden card identities. */
  _expertTactic() {
    if (this.deckLeft <= 6) return 'endgame';
    if (this.hand.length <= 2) return 'finish';
    if (this.playerHandSize <= 2) return 'press';
    if (this.hand.length >= this.playerHandSize + 3) return 'conserve';
    return 'tactical';
  }

  // Exact hidden-hand inference is possible only after the stock is empty.
  _isCardUnbeatable(card) {
    if (this.deckLeft > 0) return false;
    return this._opponentCanBeatProbability(card) === 0;
  }

  /* ============================================================
   * ЛОГИКА ПРИНЯТИЯ РЕШЕНИЙ
   * ============================================================ */

  pickCheapestBeater(atk) {
    const cands = this.hand.filter(c => canBeat(c, atk, this.trump));
    if (!cands.length) return null;
    cands.sort((a, b) => this.attackValue(a) - this.attackValue(b));
    return cands[0];
  }

  planDefenseAll(unbeaten) {
    const ordered = unbeaten.map(pair => ({
      pair,
      candidates: this.hand.filter(card => canBeat(card, pair.atk, this.trump)),
    }));
    if (ordered.some(item => !item.candidates.length)) return null;

    // Resolve the hardest attack first, then search all legal assignments.
    // This avoids a greedy early choice consuming the only card for a later attack.
    ordered.sort((a, b) => a.candidates.length - b.candidates.length ||
      this.attackValue(b.pair.atk) - this.attackValue(a.pair.atk));
    let bestPlan = null;
    let bestCost = Infinity;
    const search = (index, remaining, picked, cost) => {
      if (cost >= bestCost) return;
      if (index === ordered.length) {
        bestCost = cost;
        bestPlan = picked.slice();
        return;
      }
      const { pair, candidates } = ordered[index];
      const choices = candidates.filter(card => remaining.has(card))
        .sort((a, b) => this._cardResourceCost(a) - this._cardResourceCost(b));
      for (const card of choices) {
        remaining.delete(card);
        picked.push({ atk: pair.atk, def: card });
        search(index + 1, remaining, picked, cost + this._cardResourceCost(card));
        picked.pop();
        remaining.add(card);
      }
    };
    search(0, new Set(this.hand), [], 0);
    return bestPlan;
  }

  decide() {
    const r = this.s.round;
    switch (r.phase) {
      case 'A_START':  return this._decideAttackFirst();
      case 'A_ADD':    return this._decideAdd();
      case 'A_DUMP':   return this._decideDump();
      case 'D_ACT':    return this._decideDefense();
    }
    return null;
  }

  _decideAttackFirst() {
    const hand = this.hand;
    if (!hand.length) return { type: 'pass' };

    const nonT = hand.filter(c => !this.isTrump(c));
    const pool = nonT.length ? nonT : hand;

    if (this.level === 1) {
      const sorted = pool.slice().sort((a, b) => this.rank(a) - this.rank(b));
      return { type: 'attack', card: sorted[0] };
    }

    if (this.level >= 3) {
      const nonAceNonTrump = nonT.filter(card => this.rank(card) < 14);
      const nonAceInHand = hand.filter(card => this.rank(card) < 14);
      // Keep aces until all cheaper options are gone. A non-trump ace should
      // not be the opening lead when a lower card (even a low trump) is held.
      const leadPool = nonAceNonTrump.length ? nonAceNonTrump
        : nonAceInHand.length ? nonAceInHand : pool;
      const tactic = this._expertTactic();
      const pressureWeight = tactic === 'finish' ? 6 : tactic === 'press' ? 5.5
        : tactic === 'conserve' ? 2.5 : tactic === 'endgame' ? 6 : 4;
      const resourceWeight = tactic === 'conserve' ? 0.65 : tactic === 'finish' ? 0.18 : 0.32;
      const scoreLead = (card) => {
        const sameRank = hand.filter(other => other !== card && other.data.rank === card.data.rank).length;
        const usefulAdds = Math.min(sameRank, Math.max(0, this.playerHandSize - 1), 5);
        const noBeater = 1 - this._opponentCanBeatProbability(card);
        const endgameBonus = tactic === 'endgame' && noBeater >= 0.999999 ? 4 : 0;
        const transferRisk = this._opponentCanTranslateProbability(card);
        const transferPenalty = this.s.translateMode ? transferRisk * (tactic === 'endgame' ? 4 : 3) : 0;
        return noBeater * pressureWeight + usefulAdds * 1.4 + endgameBonus
          - this._cardResourceCost(card) * resourceWeight - transferPenalty;
      };
      const best = leadPool.slice().sort((a, b) => scoreLead(b) - scoreLead(a))[0];
      return { type: 'attack', card: best };
    }

    if (this.deckLeft === 0) {
      // Level 3 — использует подсчёт карт для поиска непобедимых
      if (this.level >= 3) {
        const unbeatable = pool.filter(c => this._isCardUnbeatable(c));
        if (unbeatable.length) {
          unbeatable.sort((a, b) => this.attackValue(b) - this.attackValue(a));
          return { type: 'attack', card: unbeatable[0] };
        }
      }
      // Level 1-2 (и level 3 без непобедимых) — по классике
      const sorted = pool.slice().sort((a, b) => this.rank(a) - this.rank(b));
      return { type: 'attack', card: sorted[0] };
    }

    // === LEVEL 2 и 3: серия карт одного ранга ===
    // Level 2 — пара (2+), Level 3 — тройка (3+)
    if (this.level >= 2) {
      const minGroupSize = (this.level >= 3) ? 3 : 2;
      const rankGroups = {};
      for (const c of pool) {
        rankGroups[c.data.rank] = (rankGroups[c.data.rank] || 0) + 1;
      }
      const groups = Object.entries(rankGroups)
        .filter(([_, n]) => n >= minGroupSize)
        .sort(([r1], [r2]) => RANK_VALUE[r1] - RANK_VALUE[r2]);

      if (groups.length) {
        const [rank] = groups[0];
        const groupCards = pool.filter(c => c.data.rank === rank);
        groupCards.sort((a, b) => this.rank(a) - this.rank(b));
        return { type: 'attack', card: groupCards[0] };
      }
    }

    // === СЕРЕДИНА: самая слабая карта ===
    const lowest = pool.reduce((min, c) =>
      this.rank(c) < this.rank(min) ? c : min, pool[0]);
    return { type: 'attack', card: lowest };
  }

  _decideAdd() {
    const r = this.s.round;
    if (this.defSize === 0) return { type: 'pass' };
    if (r.table.length >= 6) return { type: 'pass' };

    if (this.s._devForceAIAdd) {
      const tR = tableRanks(r.table);
      const cands = this.hand.filter(c => canAddToTable(c, tR));
      if (!cands.length) return { type: 'pass' };
      cands.sort((a, b) => this.attackValue(a) - this.attackValue(b));
      return { type: 'attack', card: cands[0], dump: false };
    }

    const tR = tableRanks(r.table);
    const cands = this.hand.filter(c => canAddToTable(c, tR));
    if (!cands.length) return { type: 'pass' };

    const nonT = cands.filter(c => !this.isTrump(c));

    if (this.level === 1) {
      if (!nonT.length) return { type: 'pass' };
      if (Math.random() > 0.4) return { type: 'pass' };
      return { type: 'attack', card: nonT[0], dump: false };
    }

    let pool;
    if (this.deckLeft > 0) {
      if (!nonT.length) return { type: 'pass' };
      pool = nonT;
    } else {
      pool = nonT.length ? nonT : cands;
    }

    if (this.level >= 3 && pool.length) {
      const tactic = this._expertTactic();
      const pressureWeight = tactic === 'finish' ? 6 : tactic === 'press' ? 5.5
        : tactic === 'conserve' ? 2.2 : tactic === 'endgame' ? 5 : 3.8;
      const resourceWeight = tactic === 'conserve' ? 0.65 : 0.28;
      const scored = pool.map(card => {
        const noBeater = 1 - this._opponentCanBeatProbability(card);
        const sameRank = this.hand.filter(c => c !== card && c.data.rank === card.data.rank).length;
        return { card, noBeater, score: noBeater * pressureWeight + Math.min(sameRank, 3) * 0.45
          - this._cardResourceCost(card) * resourceWeight };
      }).sort((a, b) => b.score - a.score);
      const best = scored[0];
      // When comfortably ahead in cards, don't swell the table with an
      // attack the defender is very likely to beat; switch back to pressure
      // when close to finishing or when the opponent is nearly out of cards.
      if (tactic === 'conserve' && best.noBeater < 0.32) return { type: 'pass' };
      if (tactic === 'tactical' && best.noBeater < 0.16) return { type: 'pass' };
      return { type: 'attack', card: best.card, dump: false };
    }

    let chance = this.deckLeft === 0 ? 0.95 : (this.deckLeft < 6 ? 0.85 : 0.75);

    if (this.level === 1) {
      chance = 0.5;
    } else if (this.level === 2) {
      const sameRankCount = pool.filter(c => tR.has(c.data.rank)).length;
      if (sameRankCount >= 3) chance = 0.95;
      else if (sameRankCount === 2) chance = 0.85;
    } else {
      const sameRankCount = pool.filter(c => tR.has(c.data.rank)).length;
      if (sameRankCount >= 3) chance = 1.0;
      else if (sameRankCount === 2) chance = 0.95;
    }

    if (this.playerHandSize <= 2) chance = 1.0;

    if (Math.random() > chance) return { type: 'pass' };

    pool.sort((a, b) => this.attackValue(a) - this.attackValue(b));
    return { type: 'attack', card: pool[0], dump: false };
  }

  _decideDump() {
    const r = this.s.round;
    if (this.defSize === 0) return { type: 'done' };

    const tR = tableRanks(r.table);
    const cands = this.hand.filter(c => canAddToTable(c, tR));
    if (!cands.length) return { type: 'done' };

    const limit = Math.min(6, this.defSize);
    if (r.table.length >= limit) return { type: 'done' };

    if (this.level === 1) {
      const nonT = cands.filter(c => !this.isTrump(c));
      if (!nonT.length) return { type: 'done' };
      nonT.sort((a, b) => this.attackValue(a) - this.attackValue(b));
      return { type: 'attack', card: nonT[0], dump: true };
    }

    const nonT = cands.filter(c => !this.isTrump(c));
    if (this.level >= 3) {
      const late = this.deckLeft <= 6;
      let pool = nonT.filter(card => this.rank(card) <= 10);
      if (!pool.length && late && this.playerHandSize <= 2) {
        pool = nonT.filter(card => this.rank(card) < 14);
      }
      if (!pool.length) return { type: 'done' };
      pool.sort((a, b) => {
        const score = card => (1 - this._opponentCanBeatProbability(card)) * (this.playerHandSize <= 2 ? 4 : 1.5)
          - this._cardResourceCost(card) * (late ? 0.45 : 0.65);
        return score(b) - score(a);
      });
      return { type: 'attack', card: pool[0], dump: true };
    }

    if (this.deckLeft > 6 || (this.deckLeft > 0 && this.level < 3)) {
      if (!nonT.length) return { type: 'done' };
      nonT.sort((a, b) => this.attackValue(a) - this.attackValue(b));
      return { type: 'attack', card: nonT[0], dump: true };
    }

    const lowTrumps = cands.filter(c => this.isTrump(c) && this.rank(c) <= 10);
    const pool = nonT.length ? nonT : lowTrumps;
    if (!pool.length) return { type: 'done' };
    pool.sort((a, b) => this.attackValue(a) - this.attackValue(b));
    return { type: 'attack', card: pool[0], dump: true };
  }

  _decideDefense() {
    const r = this.s.round;
    const unbeaten = r.table.filter(p => p.atk && !p.def);
    if (!unbeaten.length) return { type: 'take' };

    if (this.level === 1) {
      const atk = unbeaten[0].atk;
      const cands = this.hand.filter(c => canBeat(c, atk, this.trump));
      if (!cands.length) return { type: 'take' };
      // Beginner makes occasional mistakes, but should not routinely take a
      // simple attack it can beat. Most of its difficulty comes from weaker
      // attack/defense choices elsewhere, not refusing every hand.
      if (this.deckLeft > 0 && Math.random() < 0.08) return { type: 'take' };
      const pairIdx = r.table.findIndex(p => p.atk === atk);
      return { type: 'defense', card: cands[0], pairIdx };
    }

    // === ПЕРЕВОД ===
    if (this.s.translateMode && !r.anyBeaten) {
      const firstAtk = unbeaten[0].atk;
      const translators = this.hand.filter(c => canTranslate(c, firstAtk, false, {
        unbeatenCount: unbeaten.length,
        opponentHandSize: this.playerHandSize,
      }));

      if (translators.length) {
        const nonT = translators.filter(c => !this.isTrump(c));
        const trumps = translators.filter(c => this.isTrump(c));
        const trumpsInHand = this.hand.filter(c => this.isTrump(c)).length;

        if (nonT.length && (this.level >= 3 || Math.random() < 0.75)) {
          nonT.sort((a, b) => this.attackValue(a) - this.attackValue(b));
          return { type: 'translate', card: nonT[0] };
        }

        if (trumps.length && trumpsInHand >= 3 && this.level >= 2) {
          const lowTrumps = trumps.filter(c => this.rank(c) < 11);
          if (lowTrumps.length && (this.deckLeft === 0 || this.playerHandSize <= 3)) {
            lowTrumps.sort((a, b) => this.attackValue(a) - this.attackValue(b));
            return { type: 'translate', card: lowTrumps[0] };
          }
        }
      }
    }

    // === ПЛАН ЗАЩИТЫ ===
    const plan = this.planDefenseAll(unbeaten);
    if (!plan) return { type: 'take' };

    // ============================================================
    // ЭНДШПИЛЬ (колода пуста): ЗАЩИЩАЕМСЯ ВСЕГДА
    // ============================================================
    if (this.deckLeft === 0) {
      // With no stock, taking only feeds cards to the hand and gives away
      // tempo. If the AI can legally beat the table, it does so at every level.
      const first = plan[0];
      const pairIdx = r.table.findIndex(p => p.atk === first.atk);
      return { type: 'defense', card: first.def, pairIdx };
    }

    // ============================================================
    // ФАЗА ДОБОРА (колода не пуста)
    // ============================================================
    const trumpsInHand = this.hand.filter(c => this.isTrump(c)).length;
    const rankCounts = this.rankCountMap();

    let trumpCost = 0;
    let highCost = 0;
    let pairBreaking = 0;
    let totalRank = 0;

    for (const { def } of plan) {
      if (this.isTrump(def)) trumpCost++;
      if (this.rank(def) >= 11) highCost++;
      if (rankCounts[def.data.rank] > 1) pairBreaking++;
      totalRank += this.rank(def);
    }

    // === РАЗНЫЕ ПОРОГИ ПО УРОВНЮ ===
    if (this.level === 1) {
      // Level 1 (новичок): часто берёт, плохо защищается
      if (Math.random() < 0.4) return { type: 'take' };
      if (trumpCost >= 2) return { type: 'take' };
    }
    else if (this.level === 2) {
      // Level 2 (норма): защищается охотнее, но экономит козыри
      if (trumpCost >= 3) return { type: 'take' };
      if (trumpCost === 2 && trumpsInHand < 3) return { type: 'take' };
      if (trumpCost === 1 && trumpsInHand < 2) return { type: 'take' };

      if (highCost >= 3) return { type: 'take' };
      if (highCost === 2 && plan.length >= 3 && totalRank >= 30) return { type: 'take' };

      if (pairBreaking >= 2) return { type: 'take' };
      if (plan.length >= 4) return { type: 'take' };
    }
    else {
      // Expert compares the resource cost of a legal defense with the likely
      // cost of taking. It no longer takes merely because one or two trumps
      // are involved, and protects a near-empty hand in the endgame.
      const defenseCost = plan.reduce((sum, item) => sum + this._cardResourceCost(item.def), 0);
      let takeCost = 7.0 + plan.length * 1.5;
      if (this.playerHandSize <= 2) takeCost += 2.4;
      if (this.deckLeft === 0 && this.hand.length <= this.playerHandSize + 1) takeCost += 2.0;
      if (this.hand.length <= 2) takeCost += 1.5;
      if (defenseCost > takeCost) return { type: 'take' };
    }

    const first = plan[0];
    const pairIdx = r.table.findIndex(p => p.atk === first.atk);
    return { type: 'defense', card: first.def, pairIdx };
  }
}