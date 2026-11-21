/* focus_nav.js
   Единая клавиатурная/ТВ-навигация по элементам с классом .kbd-focus.

   Заменяет восемь почти одинаковых реализаций, которые были разбросаны
   по main_menu.js (_navigateHelp / _navigateShopCategories / _navigateShopItems /
   _navigateQuest / _navigateMsg / _navigateLang / _navigateSettings / _navigateStyle)
   и app.js (_navigateMsgGlobal).

   Модуль ничего не знает про конкретные оверлеи: он получает список элементов
   или массив строк и двигает фокус. Логика зон (табы → плитки → футер в «Стиле»)
   остаётся у вызывающего кода.
*/

import { audio } from '../audio/audio_engine.js';

export const FOCUS_CLASS = 'kbd-focus';

const ARROWS = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
const ACTIVATE = ['Enter', ' '];

export const isArrow = (e) => ARROWS.includes(e.key);
export const isActivate = (e) => ACTIVATE.includes(e.key);
/** Направление для линейного обхода: вперёд — вниз/вправо. */
export const linearDir = (e) => (e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1 : -1);

/* ============================================================
   Фокус
   ============================================================ */

export function clearFocus(root) {
  if (!root) return;
  root.querySelectorAll('.' + FOCUS_CLASS).forEach(el => el.classList.remove(FOCUS_CLASS));
}

export function currentFocus(root) {
  return root ? root.querySelector('.' + FOCUS_CLASS) : null;
}

/**
 * Поставить фокус на элемент (со снятием фокуса с остальных).
 * @param {Element} root контейнер, внутри которого живёт фокус
 * @param {Element|null} el
 * @param {{scroll?: boolean}} [opts]
 */
export function focusElement(root, el, { scroll = false } = {}) {
  clearFocus(root);
  if (!el) return null;
  el.classList.add(FOCUS_CLASS);
  if (scroll && typeof el.scrollIntoView === 'function') {
    el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }
  return el;
}

/**
 * Фокус на элементе, если он входит в список; иначе — на initial (или первом).
 * Не делает ничего, если фокус уже стоит на элементе из списка.
 */
export function ensureFocus(root, list, initial) {
  const cur = currentFocus(root);
  if (cur && list.includes(cur)) return cur;
  return focusElement(root, initial ?? list[0] ?? null);
}

/* ============================================================
   Активация (Enter / Space)
   ============================================================ */

/**
 * Нажать текущий элемент: чекбокс — переключить, остальное — click().
 * Возвращает true, если что-то нажали.
 */
export function activateFocused(root) {
  const cur = currentFocus(root);
  if (!cur) return false;
  audio.playSfx('tap');
  if (cur.tagName === 'INPUT' && cur.type === 'checkbox') {
    cur.checked = !cur.checked;
  } else {
    cur.click();
  }
  return true;
}

/** Все кликабельные элементы оверлея в порядке DOM: чекбоксы, затем кнопки. */
export function focusableControls(root) {
  const list = [];
  root.querySelectorAll('input[type="checkbox"]').forEach(cb => list.push(cb));
  root.querySelectorAll('button').forEach(b => list.push(b));
  return list;
}

/* ============================================================
   Линейный обход (одна колонка / плоский список)
   ============================================================ */

/**
 * Навигация по плоскому списку с зацикливанием.
 * Подходит для списков кнопок, категорий магазина, кнопок модалок.
 *
 * @param {Element} root
 * @param {KeyboardEvent} e
 * @param {Element[]} list
 * @param {{initial?: Element, scroll?: boolean, wrap?: boolean}} [opts]
 * @returns {boolean} true, если клавиша обработана
 */
export function navigateLinear(root, e, list, opts = {}) {
  const { initial, scroll = false, wrap = true } = opts;
  const items = list.filter(Boolean);
  if (!items.length) return false;

  if (!isArrow(e) && !isActivate(e)) return false;

  const cur = ensureFocus(root, items, initial);

  if (isActivate(e)) {
    activateFocused(root);
    return true;
  }

  const dir = linearDir(e);
  const idx = items.indexOf(cur);
  let next = idx + dir;
  if (next < 0 || next >= items.length) {
    if (!wrap) return true;
    next = (next + items.length) % items.length;
  }
  focusElement(root, items[next], { scroll });
  return true;
}

/* ============================================================
   Сетка из строк (строки могут быть разной длины)
   ============================================================ */

/**
 * Навигация по строкам: ↑/↓ — смена строки (по кругу), ←/→ — внутри строки
 * (или onHorizontal, если передан).
 *
 * Состояние позиции хранится в объекте `state` ({ row, col }), чтобы позиция
 * восстанавливалась между показами оверлея. Строки передаются функцией,
 * потому что DOM перерисовывается и ссылки на элементы устаревают.
 *
 * @param {Element} root
 * @param {KeyboardEvent} e
 * @param {Element[][]|(() => Element[][])} rowsSource
 * @param {{row: number, col: number}} state
 * @param {{
 *   onEnter?: (e: KeyboardEvent) => void,
 *   onHorizontal?: (e: KeyboardEvent, rowItems: Element[], state: object) => void,
 * }} [opts]
 * @returns {boolean}
 */
export function navigateRows(root, e, rowsSource, state, opts = {}) {
  const rows = (typeof rowsSource === 'function' ? rowsSource() : rowsSource)
    .map(row => (row || []).filter(Boolean))
    .filter(row => row.length);
  if (!rows.length) return false;

  if (!isArrow(e) && !isActivate(e)) return false;

  // чиним состояние, если разметка изменилась
  if (!Number.isInteger(state.row) || state.row < 0 || state.row >= rows.length) state.row = 0;
  if (!Number.isInteger(state.col) || state.col < 0 || state.col >= rows[state.row].length) state.col = 0;

  if (isActivate(e)) {
    // Как и в исходных навигаторах: если фокус никуда не поставлен — не нажимаем,
    // чтобы Enter «с пустого места» не сработал по первой найденной кнопке.
    if (opts.onEnter) {
      opts.onEnter(e);
      return true;
    }
    if (currentFocus(root)) activateFocused(root);
    return true;
  }

  if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && opts.onHorizontal) {
    opts.onHorizontal(e, rows[state.row], state);
    return true;
  }

  if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
    const row = rows[state.row];
    // одна колонка — двигать некуда (поведение исходных навигаторов)
    if (row.length <= 1) return true;
    const dir = e.key === 'ArrowRight' ? 1 : -1;
    state.col = (state.col + dir + row.length) % row.length;
    focusElement(root, row[state.col]);
    return true;
  }

  // ↑ / ↓
  const dir = e.key === 'ArrowDown' ? 1 : -1;
  state.row = (state.row + dir + rows.length) % rows.length;
  state.col = Math.min(state.col, rows[state.row].length - 1);
  focusElement(root, rows[state.row][state.col]);
  return true;
}

/* ============================================================
   Геометрия визуальной сетки
   ============================================================ */

/**
 * Число колонок в сетке плиток — по верхнему ряду (сравнение по top).
 * Нужно там, где элементы разложены CSS-grid/flex и порядок в DOM линейный.
 */
export function gridColumns(elements, tolerance = 5) {
  if (!elements.length) return 1;
  const top0 = elements[0].getBoundingClientRect().top;
  let cols = 0;
  for (const el of elements) {
    if (Math.abs(el.getBoundingClientRect().top - top0) < tolerance) cols++;
    else break;
  }
  return Math.max(1, cols);
}
