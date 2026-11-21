const LS_KEY = 'fool_game_settings';

export const DEFAULT_SETTINGS = {
  sfxEnabled:    true,
  musicEnabled:  true,
  masterVolume:  0.8,      // ← добавь
  deckSize:      36,
  handLayout:    'fan',
  cardStyle:     'wide-grid',
  suitStyle:     'default',
  shirtStyle:    0,
  tableStyle:    0,
  decorStyle:    -1,
  moveHints: true,   // показывать красные блоки на нелегальных картах
  showDeckCounter: true,   // счётчик карт на колоде
  aiLevel: 1,               // 1 = новичок, 2 = обычный, 3 = эксперт
};

function load() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_SETTINGS, ...parsed };
  } catch { return { ...DEFAULT_SETTINGS }; }
}

export const GameSettings = load();

export function saveSettings() {
  try { localStorage.setItem(LS_KEY, JSON.stringify(GameSettings)); } catch {}
}