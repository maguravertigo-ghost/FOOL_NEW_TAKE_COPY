import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
const require = createRequire(import.meta.url);
const { JSDOM } = require('jsdom');

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const errors = [];
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const dom = new JSDOM(html, {
  url: 'http://localhost:8080/',
  pretendToBeVisual: true,
  runScripts: 'outside-only',
});
const { window } = dom;
window.innerWidth = 1366; window.innerHeight = 768;

globalThis.window = window;
globalThis.document = window.document;
Object.defineProperty(globalThis,'navigator',{value:window.navigator,configurable:true});
globalThis.location = window.location;
globalThis.localStorage = window.localStorage;
globalThis.HTMLElement = window.HTMLElement;
globalThis.Element = window.Element;
globalThis.Node = window.Node;
globalThis.Event = window.Event;
globalThis.CustomEvent = window.CustomEvent;
globalThis.Image = window.Image;
globalThis.getComputedStyle = window.getComputedStyle.bind(window);
globalThis.requestAnimationFrame = window.requestAnimationFrame.bind(window);
globalThis.cancelAnimationFrame = window.cancelAnimationFrame.bind(window);
window.matchMedia = globalThis.matchMedia = (q) => ({
  matches: false, media: q, addEventListener() {}, removeEventListener() {},
  addListener() {}, removeListener() {}, onchange: null, dispatchEvent() { return false; },
});
class RO { constructor(cb) { this.cb = cb; } observe() {} unobserve() {} disconnect() {} }
globalThis.ResizeObserver = window.ResizeObserver = RO;
class IO { constructor(cb) { this.cb = cb; } observe() {} unobserve() {} disconnect() {} takeRecords() { return []; } }
globalThis.IntersectionObserver = window.IntersectionObserver = IO;
window.HTMLCanvasElement.prototype.getContext = function () { return null; };
document.fonts = { ready: Promise.resolve(), add() {}, load: () => Promise.resolve([]) };

// jsdom не загружает картинки: эмулируем load/decode, иначе preload* никогда не резолвятся
const srcDesc = Object.getOwnPropertyDescriptor(window.HTMLImageElement.prototype, 'src');
Object.defineProperty(window.HTMLImageElement.prototype, 'src', {
  configurable: true,
  get() { return srcDesc.get.call(this); },
  set(value) {
    srcDesc.set.call(this, value);
    setTimeout(() => {
      this.dispatchEvent(new window.Event('load'));
      if (typeof this.onload === 'function') this.onload(new window.Event('load'));
    }, 0);
  },
});
window.HTMLImageElement.prototype.decode = function () { return Promise.resolve(); };

// jsdom не реализует прокрутку и scrollIntoView
window.Element.prototype.scrollBy = function () {};
window.Element.prototype.scrollTo = function () {};
window.Element.prototype.scrollIntoView = function () {};

let fakeAudioElementCreations = 0;
class FakeAudio {
  constructor(src) { fakeAudioElementCreations++; this.src = src; this.volume = 1; this.preload = 'auto'; this._l = {}; }
  addEventListener(t, f) { (this._l[t] ||= []).push(f); }
  removeEventListener() {} play() { return Promise.resolve(); } pause() {} load() {}
}
globalThis.Audio = window.Audio = FakeAudio;
class FakeCtx { constructor() { this.state = 'running'; this.destination = {}; this.currentTime = 0; }
  createGain() { return { gain: { value: 0, setValueAtTime() {}, linearRampToValueAtTime() {}, setTargetAtTime() {}, cancelScheduledValues() {} }, connect() {}, disconnect() {} }; }
  createBufferSource() { return { buffer: null, connect() {}, disconnect() {}, start() {}, stop() {}, playbackRate: { value: 1 } }; }
  createBuffer(c, l, r) { return { duration: 100, getChannelData: () => new Float32Array(l) }; }
  decodeAudioData() { return Promise.resolve({ duration: 100 }); }
  resume() { return Promise.resolve(); } suspend() { return Promise.resolve(); } close() {} }
globalThis.AudioContext = window.AudioContext = FakeCtx;
window.AudioContext = FakeCtx;

// fetch из файловой системы
globalThis.fetch = window.fetch = async (url) => {
  const p = path.join(ROOT, String(url).replace(/^\//, '').split('?')[0]);
  if (!fs.existsSync(p)) return { ok: false, status: 404, statusText: 'Not Found', text: async () => '' };
  const txt = fs.readFileSync(p, 'utf8');
  return { ok: true, status: 200, statusText: 'OK', text: async () => txt, arrayBuffer: async () => new TextEncoder().encode(txt).buffer, json: async () => JSON.parse(txt) };
};

const origError = console.error;
window.addEventListener('error', (e) => errors.push('window.error: ' + (e.error?.stack || e.message)));
process.on('unhandledRejection', (r) => errors.push('unhandledRejection: ' + (r?.stack || r)));
console.error = (...a) => { errors.push('console.error: ' + a.map(x => (x && x.stack) || String(x)).join(' ')); };
console.warn = () => {};

const step = async (name, fn) => {
  const before = errors.length;
  try { await fn(); } catch (e) { errors.push(`[${name}] throw: ${e.stack || e}`); }
  const found = errors.slice(before);
  console.log(`${found.length ? 'FAIL' : ' ok '}  ${name}${found.length ? ' -> ' + found[0].split('\n')[0].slice(0, 160) : ''}`);
};

window.localStorage.setItem('fool_progress', JSON.stringify({
  stylePoints: 120, stats:{games:2,wins:1,losses:1,draws:0},
  foolToken:{ owner:'player' }, giftGiven:true, shopIntroSeen:true, trialUnlocked:true,
  purchases:{shirt:[0],design:[0,3],suits:[0,3],table:[0],decor:[]},
  achievements:{}, seenStyleItems:{}, quests:{}, tempItems:null,
}));
// app.js вешает слушатель DOMContentLoaded; в jsdom событие может прийти
// до импорта, поэтому регистрируем его вручную и создаём App ровно один раз.
let domReadyHandler = null;
const _addEventListener = window.addEventListener.bind(window);
window.addEventListener = (type, fn, opts) => {
  if (type === 'DOMContentLoaded') {
    domReadyHandler = fn;      // создадим App ровно один раз, вручную
    return;
  }
  return _addEventListener(type, fn, opts);
};
await import('file://' + path.join(ROOT, 'js/app.js'));
await step('DOMContentLoaded -> App', async () => {
  if (!window.__app && domReadyHandler) domReadyHandler(new window.Event('DOMContentLoaded'));
  for (let i = 0; i < 40 && !window.__app; i++) await new Promise(r => setTimeout(r, 50));
  await new Promise(r => setTimeout(r, 900));
  if (!window.__app) throw new Error('App не создан');
});
const app = window.__app;
const { GameSettings: defaultsUnderTest } = await import('file://' + path.join(ROOT, 'js/game/settings.js'));
const { Progress: progressUnderTest } = await import('file://' + path.join(ROOT, 'js/game/progress.js'));
await step('blocked hand stays on the player action button', async () => {
  const { GameSession } = await import('file://' + path.join(ROOT, 'js/game/game_session.js'));
  const classList = () => ({
    values: new Set(),
    add(v) { this.values.add(v); },
    remove(v) { this.values.delete(v); },
    toggle(v, on) { on ? this.values.add(v) : this.values.delete(v); },
  });
  const redCard = { el: { classList: classList() } };
  const actionBtn = { disabled: false, classList: classList() };
  const s = Object.create(GameSession.prototype);
  Object.assign(s, {
    app: { accordionPlayer: { cards: [redCard] } },
    actionBtn, round: { move: 'player', phase: 'A_START' },
    _gameOverPending: false, _slotFocusIdx: -1,
    _kbdFocusOnButton: true, _kbdReturnCard: redCard,
    _lastCycledCard: redCard, selectedCard: null,
    blockedCards: new Set([redCard]),
    _getCardLegalSlots: () => [],
  });
  s._returnFromButtonToCard();
  if (s.selectedCard || !s._kbdFocusOnButton || !actionBtn.classList.values.has('kbd-focus')) {
    throw new Error('возврат с кнопки выбрал запрещённую карту вместо кнопки');
  }
  actionBtn.classList.remove('kbd-focus');
  s._kbdFocusOnButton = false;
  s.selectNextCard();
  if (s.selectedCard || !s._kbdFocusOnButton) throw new Error('стрелка подняла красную карту');

  const duringDealButton = { disabled: false, textContent: '', dataset: {}, classList: classList() };
  const duringDeal = Object.create(GameSession.prototype);
  Object.assign(duringDeal, {
    app: { accordionPlayer: { cards: [] } },
    actionBtn: duringDealButton,
    round: { phase: 'END' },
    _kbdFocusOnButton: true,
  });
  duringDeal._updateButton();
  if (duringDeal._kbdFocusOnButton || duringDealButton.classList.values.has('kbd-focus')) {
    throw new Error('фокус остался на disabled кнопке во время дораздачи');
  }

  let finishCalled = false;
  let resultsCalled = false;
  const endRound = Object.create(GameSession.prototype);
  Object.assign(endRound, {
    _busy: false, _finishingGame: false,
    round: { attack: 'player', table: [] },
    app: { accordionPlayer: { cards: [] } },
    _checkImmediateEnd: () => null,
    _clearSlotHighlights() {}, _deselect() {}, _animateDiscard: async () => {},
    _updateHUD() {}, _updateButton() {}, _updateAIMessage() {}, _refillHands: async () => {},
    _checkGameEnd: () => 'player',
    _finishGame: async winner => { finishCalled = winner === 'player'; },
    _showGameOver() { resultsCalled = true; },
  });
  await endRound._endRound('discard');
  if (!finishCalled || resultsCalled) throw new Error('победа после добора обошла финальный путь с кольцом');
});

await step('финальный таймер отображает и снимает кольцо прогресса', async () => {
  const { GameSession } = await import('file://' + path.join(ROOT, 'js/game/game_session.js'));
  const session = Object.create(GameSession.prototype);
  session.actionBtn = document.createElement('button');
  session._victoryPending = false;
  document.body.appendChild(session.actionBtn);
  const pending = session._waitFinishProgress();
  if (!session.actionBtn.querySelector('.btn-ring')) throw new Error('нет кольца прогресса');
  session._victoryResolve();
  await pending;
  if (session.actionBtn.querySelector('.btn-ring') || session._victoryPending) throw new Error('кольцо не удалено после отмены ожидания');
  session.actionBtn.remove();
});

await step('first-run settings match requested defaults', async () => {
  const actual = [defaultsUnderTest.sfxEnabled, defaultsUnderTest.musicEnabled,
    defaultsUnderTest.deckSize, defaultsUnderTest.handLayout, defaultsUnderTest.moveHints,
    defaultsUnderTest.showDeckCounter, defaultsUnderTest.aiLevel, defaultsUnderTest.shirtStyle,
    defaultsUnderTest.cardStyle, defaultsUnderTest.suitStyle, defaultsUnderTest.tableStyle,
    defaultsUnderTest.decorStyle];
  const expected = [true, true, 36, 'fan', true, true, 1, 0, 'wide-grid', 'default', 0, -1];
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`неожиданные defaults: ${JSON.stringify(actual)}`);
  if (!progressUnderTest.purchases.design.includes(3)) throw new Error('широкий дизайн по умолчанию не открыт');
});

await step('quest branches advance 36/52 then require exact minimum pogons', async () => {
  const progress = await import('file://' + path.join(ROOT, 'js/game/progress.js'));
  const original = JSON.parse(JSON.stringify(progress.Progress));
  try {
    progress.Progress.questStage = 0;
    progress.Progress.trialUnlocked = false;
    progress.Progress.achievements = {};
    for (const rank of Object.keys(progress.Progress.quests)) progress.Progress.quests[rank] = { progress: 0, claimed: 0 };
    for (const rank of progress.activeOrder()) progress.creditQuest(rank, 1, 36);
    const classic = progress.claimQuestReward();
    if (progress.currentQuestStage().index !== 1 || !classic.trialUnlockedNow || !classic.newlyUnlocked.includes('quest_36')) throw new Error('classic branch did not unlock trial/achievement on claim');
    for (const rank of progress.activeOrder()) progress.creditQuest(rank, 1, 52);
    const trial = progress.claimQuestReward();
    if (progress.currentQuestStage().index !== 2 || !trial.newlyUnlocked.includes('quest_52')) throw new Error('52-card branch did not unlock next stage');
    progress.Progress.achievements = {};
    const minTwoRank = progress.activeOrder()[0];
    if (progress.creditQuest(minTwoRank, 1, 36) !== null) throw new Error('one pogon incorrectly counted in min-two branch');
    for (const rank of progress.activeOrder()) progress.creditQuest(rank, 2, 36);
    const minTwo = progress.claimQuestReward();
    if (progress.currentQuestStage().index !== 3 || minTwo.newlyUnlocked.length) throw new Error('minimum-two branch progression/achievement behavior incorrect');
    const minTwo52Rank = progress.activeOrder()[0];
    if (progress.creditQuest(minTwo52Rank, 2, 36) !== null) throw new Error('wrong deck size counted in 52-card branch');
    if (progress.creditQuest(minTwo52Rank, 2, 52) !== minTwo52Rank) throw new Error('two pogons were not credited to 52-card branch');
  } finally {
    for (const key of Object.keys(progress.Progress)) delete progress.Progress[key];
    Object.assign(progress.Progress, original);
    progress.saveProgress();
  }
});

await step('audio engine plays and pauses music using Web Audio only', async () => {
  const { AudioEngine } = await import('file://' + path.join(ROOT, 'js/audio/audio_engine.js'));
  const engine = new AudioEngine();
  const sources = [];
  const makeGain = () => ({
    gain: { value: 0, setTargetAtTime() {}, cancelScheduledValues() {}, setValueAtTime() {}, linearRampToValueAtTime() {} },
    connect() {}, disconnect() {},
  });
  engine._audioCtx = {
    state: 'running', currentTime: 1, destination: {},
    createGain: makeGain,
    createBufferSource() {
      const source = { buffer: null, connect() {}, disconnect() {}, start(_when, offset) { this.offset = offset; }, stop() {} };
      sources.push(source);
      return source;
    },
  };
  engine._musicGain = makeGain();
  engine._musicBuffers[0] = { duration: 100 };
  const before = fakeAudioElementCreations;
  const sourceText = fs.readFileSync(path.join(ROOT, 'js/audio/audio_engine.js'), 'utf8');
  const appText = fs.readFileSync(path.join(ROOT, 'js/app.js'), 'utf8');
  if (/new\s+Audio\s*\(/.test(sourceText + appText)) throw new Error('HTMLAudio construction remains in game audio paths');
  engine.startMusic();
  if (!engine._el || sources.length !== 1) throw new Error('music did not start from a Web Audio buffer');
  engine._audioCtx.currentTime = 8;
  engine.pauseMusic();
  if (engine._el || engine._musicOffset !== 7) throw new Error('music pause did not preserve position');
  engine.resumeMusic();
  if (!engine._el || sources.length !== 2 || sources[1].offset !== 7) throw new Error('music did not resume at saved position');
  engine.playSfx('not-a-real-sfx');
  if (fakeAudioElementCreations !== before) throw new Error('audio engine created HTMLAudioElement');
  engine.pauseMusic();
});

await step('achievement priority, exact pogon count and collector unlock', async () => {
  const progress = await import('file://' + path.join(ROOT, 'js/game/progress.js'));
  const { AchievementManager, checkCollectorAchievement } = await import('file://' + path.join(ROOT, 'js/game/achievements.js'));
  const { ASSETS } = await import('file://' + path.join(ROOT, 'js/assets.js'));
  const original = JSON.parse(JSON.stringify(progress.Progress));
  try {
    progress.Progress.stats.wins = 1;
    progress.Progress.achievements = {};
    const firstAndThree = AchievementManager.check({ winner: 'player', pogonsThrown: 3 });
    if (firstAndThree.join(',') !== 'first_win,pogon_3') throw new Error(`wrong achievement order: ${firstAndThree}`);
    for (const id of ['pogon_1', 'pogon_2', 'pogon_4']) {
      if (progress.isAchievementUnlocked(id)) throw new Error(`non-exact pogon achievement unlocked: ${id}`);
    }
    progress.Progress.purchases = Object.fromEntries([
      ['shirt', ASSETS.shirts], ['table', ASSETS.tables], ['decor', ASSETS.decorations], ['suits', Array(6)], ['design', Array(6)],
    ].map(([cat, items]) => [cat, items.map((_, i) => i)]));
    if (!checkCollectorAchievement() || !progress.isAchievementUnlocked('collector')) throw new Error('collector did not unlock at full collection');
  } finally {
    for (const key of Object.keys(progress.Progress)) delete progress.Progress[key];
    Object.assign(progress.Progress, original);
    progress.saveProgress();
  }
});
console.log('app создан:', !!app, '| меню в DOM:', !!document.querySelector('#main-menu, .mm-root, .menu'));

const q = (s) => document.querySelector(s);
console.log('DOM узлов:', document.querySelectorAll('*').length);

for (const name of ['help', 'style', 'shop', 'quest', 'achieve', 'settings', 'lang']) {
  await step('открыть оверлей: ' + name, async () => {
    const btn = document.querySelector(`[data-open="${name}"]`);
    if (!btn) throw new Error('нет кнопки');
    btn.click();
    await new Promise(r => setTimeout(r, 120));
    if (!app.menu._activeOverlay) throw new Error('оверлей не открылся');
    app.menu._closeOverlay();
  });
}

// ---------- клавиатурная навигация в оверлеях ----------
const press = (key) => document.dispatchEvent(new window.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
const focused = () => document.querySelector('.kbd-focus');

const navCases = [
  ['lang',    'ArrowDown'],
  ['settings','ArrowDown'],
  ['quest',   'ArrowDown'],
  ['shop',    'ArrowDown'],
  ['style',   'ArrowDown'],
  ['achieve', 'ArrowUp'],
  ['help',    'ArrowRight'],
];

for (const [name, key] of navCases) {
  await step(`клавиатура: ${name} (${key})`, async () => {
    const btn = document.querySelector(`[data-open="${name}"]`);
    if (!btn) throw new Error('нет кнопки');
    btn.click();
    await new Promise(r => setTimeout(r, 160));
    if (!app.menu._activeOverlay) throw new Error('оверлей не открылся');

    press(key);
    await new Promise(r => setTimeout(r, 40));
    const first = focused();
    if (!first) throw new Error('фокус не появился после стрелки');
    if (name === 'help' && first !== document.querySelector('[data-help-up]')) {
      throw new Error('первый шаг в справке должен быть «прокрутка вверх»');
    }

    press(key);
    await new Promise(r => setTimeout(r, 40));
    if (!focused()) throw new Error('фокус потерян после второй стрелки');
    if (name === 'help' && focused() !== document.querySelector('[data-help-down]')) {
      throw new Error('второй шаг в справке должен быть «прокрутка вниз»');
    }

    // Enter не жмём на выборе языка: там location.reload(), jsdom такое не умеет
    if (name !== 'lang') {
      press('Enter');
      await new Promise(r => setTimeout(r, 80));
      if (name === 'achieve' && document.querySelector('.msg-overlay')) {
        const ok = document.querySelector('.msg-overlay [data-close]');
        if (!ok?.classList.contains('kbd-focus')) throw new Error('на деталях достижения фокус не на ОК');
        press('Enter');
        await new Promise(r => setTimeout(r, 40));
        if (!focused()?.classList.contains('mm-achievement')) throw new Error('не восстановлен фокус на плитке достижения');
      }
    }

    // приводим состояние в порядок: закрываем всё, что открылось
    press('Escape');
    await new Promise(r => setTimeout(r, 100));
    if (app.menu._activeOverlay) app.menu._closeOverlay();
  });
}

await step('вход в режим курсора ставит фокус на «Переводной»', async () => {
  const button = document.querySelector('[data-mode="perevodnoy"]');
  button.dispatchEvent(new window.Event('pointerdown', { bubbles: true }));
  press('ArrowUp');
  if (!button.classList.contains('kbd-focus')) throw new Error('первый курсор не на «Переводной»');
  press('ArrowUp');
  if (!document.querySelector('[data-mode="podkidnoy"].kbd-focus')) throw new Error('↑ не перешёл к «Подкидному»');
});

await step('сетка меню: Об игре → вниз → Настройки', async () => {
  const defaultBtn = document.querySelector('[data-mode="perevodnoy"]');
  defaultBtn.dispatchEvent(new window.Event('pointerdown', { bubbles: true }));
  press('ArrowUp'); // вход в режим клавиатуры — «Переводной»
  press('ArrowUp'); // «Подкидной»
  if (!document.querySelector('[data-mode="podkidnoy"].kbd-focus')) throw new Error('↑ не попал на «Подкидной»');
  press('ArrowLeft'); // «Об игре»
  if (!document.querySelector('[data-open="about"].kbd-focus')) throw new Error('← не попал на «Об игре»');
  press('ArrowDown'); // «Настройки» после перестановки с «Войти»
  if (!document.querySelector('[data-open="settings"].kbd-focus')) throw new Error('↓ с «Об игре» должен вести в «Настройки»');
});

await step('обучение: верх/низ меняют цель фокуса предсказуемо', async () => {
  app.menu._openOverlay('help');
  await new Promise(r => setTimeout(r, 80));
  document.querySelector('[data-tutorial-btn]').click();
  await new Promise(r => setTimeout(r, 80));
  if (!document.querySelector('.tutorial-overlay [data-action="next"].kbd-focus')) {
    throw new Error('обучение должно начинаться с кнопки «Вперёд»');
  }
  press('ArrowUp');
  if (!document.querySelector('.tutorial-overlay [data-action="skip"].kbd-focus')) throw new Error('↑ должен вести на «Пропустить»');
  press('ArrowDown');
  if (!document.querySelector('.tutorial-overlay [data-action="next"].kbd-focus')) throw new Error('↓ должен возвращать на «Вперёд»');
  press('Enter');
  if (document.querySelector('.tutorial__counter')?.textContent !== '2 / 8') throw new Error('Enter на «Вперёд» не переключил слайд');
  document.querySelector('.tutorial-overlay [data-action="skip"]').click();
  await new Promise(r => setTimeout(r, 60));
  if (!document.querySelector('[data-tutorial-btn].kbd-focus')) throw new Error('после обучения фокус не вернулся на кнопку запуска');
  app.menu._closeOverlay();
});

await step('стиль: варп табов вниз и пропуск недоступного Random', async () => {
  const opener = document.querySelector('[data-open="style"]');
  opener.dispatchEvent(new window.Event('pointerdown', { bubbles: true }));
  opener.click();
  await new Promise(r => setTimeout(r, 80));
  const random = document.querySelector('[data-random]');
  if (!random) throw new Error('нет кнопки Random');
  random.disabled = true; // имитируем уже недоступную кнопку
  press('ArrowUp');
  if (!document.querySelector('.mm-overlay__footer [data-close].kbd-focus')) throw new Error('↑ с табов должен варпать к нижней кнопке');
  press('ArrowLeft');
  if (!document.querySelector('.mm-overlay__footer [data-preview].kbd-focus')) throw new Error('недоступный Random должен пропускаться');
  if (random.classList.contains('kbd-focus')) throw new Error('фокус попал на disabled Random');
  press('ArrowDown');
  if (!document.querySelector('.mm-tab--active.kbd-focus')) throw new Error('↓ с футера должен возвращать на табы');
  app.menu._closeOverlay();
});

await step('режим ввода: мышь скрывает, клавиатура показывает фокус', async () => {
  const btn = document.querySelector('[data-open="help"]');
  btn.dispatchEvent(new window.Event('pointerdown', { bubbles: true }));
  if (window.__lastInputWasKeyboard !== false) throw new Error('pointerdown не вернул режим мыши');
  btn.click();
  await new Promise(r => setTimeout(r, 80));
  if (document.querySelector('.kbd-focus')) throw new Error('фокус виден в режиме мыши');
  press('ArrowRight');
  if (window.__lastInputWasKeyboard !== true) throw new Error('клавиша не включила режим клавиатуры');
  if (!document.querySelector('.kbd-focus')) throw new Error('клавиша не показала фокус');
  app.menu._closeOverlay();
});

await step('старт матча (подкидной)', async () => {
  await Promise.race([
    app._startGameFromMenu('podkidnoy'),
    new Promise((_, rej) => setTimeout(() => rej(new Error('таймаут старта матча')), 8000)),
  ]);
  await new Promise(r => setTimeout(r, 300));
  if (!app.session) throw new Error('session не создан');
});
console.log('карт в DOM:', document.querySelectorAll('.card').length, '| узлов всего:', document.querySelectorAll('*').length);

await step('пауза: фокус Продолжить → громкость → В меню', async () => {
  app._openPause();
  await new Promise(r => setTimeout(r, 100));
  const slider = document.querySelector('#pause-volume-slider');
  if (!document.querySelector('#pause-overlay [data-action="resume"].kbd-focus')) throw new Error('автофокус паузы не на Продолжить');
  const before = Number(slider.value);
  press('ArrowUp');
  if (!slider.classList.contains('kbd-focus')) throw new Error('↑ с Продолжить должен переводить на громкость');
  press('ArrowRight');
  if (Number(slider.value) !== Math.min(100, before + 5)) throw new Error('←/→ не меняют громкость');
  press('ArrowDown');
  if (!document.querySelector('#pause-overlay [data-action="exit"].kbd-focus')) throw new Error('↓ с громкости должен вести в меню');
  press('ArrowUp');
  if (!document.querySelector('#pause-overlay [data-action="resume"].kbd-focus')) throw new Error('↑ с выхода должен возвращать на Продолжить');
});
await step('закрыть паузу', async () => { app._closePause(); await new Promise(r => setTimeout(r, 100)); });
await step('выход в меню', async () => { await app._exitToMenu(); await new Promise(r => setTimeout(r, 400)); });

await step('повторный запуск матча', async () => {
  await app._startGameFromMenu('perevodnoy');
  await new Promise(r => setTimeout(r, 400));
  if (!app.session) throw new Error('session не создан');
});

console.log('\n=== всего ошибок:', errors.length, '===');
for (const e of errors.slice(0, 12)) console.log('-', e.split('\n').slice(0, 3).join('\n   '));
process.exit(errors.length ? 1 : 0);
