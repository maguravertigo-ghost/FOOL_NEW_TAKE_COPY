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

class FakeAudio {
  constructor(src) { this.src = src; this.volume = 1; this.preload = 'auto'; this._l = {}; }
  addEventListener(t, f) { (this._l[t] ||= []).push(f); }
  removeEventListener() {} play() { return Promise.resolve(); } pause() {} load() {}
}
globalThis.Audio = window.Audio = FakeAudio;
class FakeCtx { constructor() { this.state = 'running'; this.destination = {}; this.currentTime = 0; }
  createGain() { return { gain: { value: 0, setValueAtTime() {}, linearRampToValueAtTime() {} }, connect() {} }; }
  createBufferSource() { return { buffer: null, connect() {}, start() {}, stop() {}, playbackRate: { value: 1 } }; }
  createBuffer(c, l, r) { return { getChannelData: () => new Float32Array(l) }; }
  decodeAudioData() { return Promise.resolve({}); }
  resume() { return Promise.resolve(); } close() {} }
globalThis.AudioContext = window.AudioContext = FakeCtx;
window.AudioContext = FakeCtx;

// fetch из файловой системы
globalThis.fetch = window.fetch = async (url) => {
  const p = path.join(ROOT, String(url).replace(/^\//, '').split('?')[0]);
  if (!fs.existsSync(p)) return { ok: false, status: 404, statusText: 'Not Found', text: async () => '' };
  const txt = fs.readFileSync(p, 'utf8');
  return { ok: true, status: 200, statusText: 'OK', text: async () => txt, json: async () => JSON.parse(txt) };
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
  purchases:{shirt:[0],design:[0],suits:[0,3],table:[0],decor:[]},
  achievements:{}, seenStyleItems:{}, quests:{}, tempItems:null,
}));
// app.js вешает слушатель DOMContentLoaded; в jsdom событие может прийти
// до импорта, поэтому регистрируем его вручную и создаём App ровно один раз.
let dclRegistered = false;
const _addEventListener = window.addEventListener.bind(window);
window.addEventListener = (type, fn, opts) => {
  if (type === 'DOMContentLoaded') {
    if (dclRegistered) return;
    dclRegistered = true;
  }
  return _addEventListener(type, fn, opts);
};
await import('file://' + path.join(ROOT, 'js/app.js'));
await step('DOMContentLoaded -> App', async () => {
  if (!window.__app) window.dispatchEvent(new window.Event('DOMContentLoaded'));
  for (let i = 0; i < 40 && !window.__app; i++) await new Promise(r => setTimeout(r, 50));
  await new Promise(r => setTimeout(r, 900));
  if (!window.__app) throw new Error('App не создан');
});
const app = window.__app;
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

await step('старт матча (подкидной)', async () => {
  await Promise.race([
    app._startGameFromMenu('podkidnoy'),
    new Promise((_, rej) => setTimeout(() => rej(new Error('таймаут старта матча')), 8000)),
  ]);
  await new Promise(r => setTimeout(r, 300));
  if (!app.session) throw new Error('session не создан');
});
console.log('карт в DOM:', document.querySelectorAll('.card').length, '| узлов всего:', document.querySelectorAll('*').length);

await step('открыть паузу в матче', async () => { app._openPause(); await new Promise(r => setTimeout(r, 100)); });
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
