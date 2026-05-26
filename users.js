/**
 * users.js — зберігання юзерів з персистентністю через JSON файл.
 *
 * Чому JSON а не DB? Бот невеликий, Railway перезапускає контейнер,
 * файл на диску зберігається між деплоями (якщо є volume).
 * Для масштабування > 1000 юзерів — переходь на Redis або SQLite.
 */

const fs = require('fs');
const path = require('path');

const USERS_FILE = path.join(process.cwd(), 'users_data.json');

// ─── Завантаження ─────────────────────────────────────────────────────────────
let users = {};
try {
  if (fs.existsSync(USERS_FILE)) {
    users = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
    console.log(`[users] Завантажено ${Object.keys(users).length} юзерів`);
  }
} catch (e) {
  console.error('[users] Помилка завантаження, починаємо з нуля:', e.message);
  users = {};
}

// ─── Авто-збереження кожні 30 секунд ─────────────────────────────────────────
let saveTimer = null;
function scheduleSave() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    try {
      // Зберігаємо без session/lastRecs (вони тимчасові)
      const toSave = {};
      for (const [id, u] of Object.entries(users)) {
        toSave[id] = {
          ...u,
          session:  {},
          lastRecs: [],
          step:     null,
        };
      }
      fs.writeFileSync(USERS_FILE, JSON.stringify(toSave));
    } catch (e) {
      console.error('[users] Помилка збереження:', e.message);
    }
  }, 30000);
}

// Зберігаємо при завершенні процесу
process.on('SIGTERM', () => { try { fs.writeFileSync(USERS_FILE, JSON.stringify(users)); } catch {} });
process.on('SIGINT',  () => { try { fs.writeFileSync(USERS_FILE, JSON.stringify(users)); } catch {} });

// ─── Структура юзера ─────────────────────────────────────────────────────────
function defaultUser() {
  return {
    session:            {},
    history:            [],      // [{ dish, place, date }]
    saved:              [],      // [{ dish, place, address, date }]
    lastRecs:           [],      // тимчасово, не зберігається
    isPro:              false,
    proStartedAt:       null,
    proExpiresAt:       null,
    hasUsedTrial:       false,
    proExpiredNotified: false,
    joinDate:           Date.now(),
    step:               null,
    searchCount:        0,
    cuisineHistory:     {},      // { '🍝 Щось ситне': 3 }
    districtHistory:    {},      // { 'Поділ': 2 }
    topDishes:          [],
  };
}

function getUser(id) {
  const key = String(id);
  if (!users[key]) {
    users[key] = defaultUser();
    scheduleSave();
  }

  const u = users[key];

  // Автоперевірка закінчення PRO
  if (u.isPro && u.proExpiresAt && Date.now() > u.proExpiresAt) {
    u.isPro = false;
    u.proExpiredNotified = false;
    scheduleSave();
  }

  // Міграція: додаємо відсутні поля до старих юзерів
  let migrated = false;
  const defaults = defaultUser();
  for (const [k, v] of Object.entries(defaults)) {
    if (u[k] === undefined) { u[k] = v; migrated = true; }
  }
  if (migrated) scheduleSave();

  return u;
}

function activateTrial(id) {
  const u = getUser(id);
  if (u.hasUsedTrial) return false;
  u.isPro = true;
  u.hasUsedTrial = true;
  u.proStartedAt = Date.now();
  u.proExpiresAt = Date.now() + 21 * 24 * 60 * 60 * 1000;
  scheduleSave();
  return true;
}

function getProStatus(user) {
  if (!user.isPro || !user.proExpiresAt) return null;
  const daysLeft = Math.ceil((user.proExpiresAt - Date.now()) / (24 * 60 * 60 * 1000));
  const expiresDate = new Date(user.proExpiresAt).toLocaleDateString('uk-UA', { day: 'numeric', month: 'long' });
  return { daysLeft, expiresDate };
}

function recordTaste(user, cuisine, district) {
  if (cuisine) {
    user.cuisineHistory[cuisine] = (user.cuisineHistory[cuisine] || 0) + 1;
  }
  if (district) {
    user.districtHistory[district] = (user.districtHistory[district] || 0) + 1;
  }
  scheduleSave();
}

function getTopCuisines(user, limit = 3) {
  return Object.entries(user.cuisineHistory || {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([c]) => c);
}

function getTastePhrase(user) {
  const top = getTopCuisines(user, 1)[0];
  if (!top) return null;
  const phrases = {
    '☕ Кава і десерт':    'Любиш затишні кавʼярні ☕',
    '🍝 Щось ситне':      'Часто обираєш щось ситне 🍝',
    '🎲 Обери за мене':   'Любиш сюрпризи 🎲',
    '🍜 Азія':            'Тягне на азійську кухню 🍜',
    '🍔 Швидко і смачно': 'Цінуєш швидко і смачно 🍔',
    '🥩 Мʼясо':          'Мʼясоїд з досвідом 🥩',
  };
  return phrases[top] || null;
}

function getLastChoice(user) {
  if (!user.history?.length) return null;
  return user.history[user.history.length - 1];
}

module.exports = {
  getUser, activateTrial, getProStatus,
  recordTaste, getTopCuisines, getTastePhrase, getLastChoice,
  scheduleSave,
};
