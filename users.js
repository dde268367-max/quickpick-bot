const users = {};

function getUser(id) {
  if (!users[id]) {
    users[id] = {
      session:       {},
      history:       [],
      saved:         [],
      lastRecs:      [],
      isPro:         false,
      proStartedAt:  null,
      proExpiresAt:  null,
      hasUsedTrial:  false,
      joinDate:      Date.now(),
      step:          null,
      searchCount:   0,
      // Taste memory
      cuisineHistory: {},   // { '🍝 Щось ситне': 3, ... }
      districtHistory: {},  // { 'Поділ': 2, ... }
      topDishes:      [],   // останні вибрані страви
    };
  }

  // Автоперевірка PRO trial
  const u = users[id];
  if (u.isPro && u.proExpiresAt && Date.now() > u.proExpiresAt) {
    u.isPro = false;
    u.proExpiredNotified = false; // щоб показати повідомлення
  }

  return u;
}

function activateTrial(id) {
  const u = getUser(id);
  if (u.hasUsedTrial) return false;
  u.isPro = true;
  u.hasUsedTrial = true;
  u.proStartedAt = Date.now();
  u.proExpiresAt = Date.now() + 21 * 24 * 60 * 60 * 1000; // 21 день
  return true;
}

function getProStatus(user) {
  if (!user.isPro) return null;
  if (!user.proExpiresAt) return null;
  const daysLeft = Math.ceil((user.proExpiresAt - Date.now()) / (24 * 60 * 60 * 1000));
  const expiresDate = new Date(user.proExpiresAt).toLocaleDateString('uk-UA', { day: 'numeric', month: 'long' });
  return { daysLeft, expiresDate };
}

// Записуємо смаки користувача
function recordTaste(user, cuisine, district) {
  if (cuisine) {
    user.cuisineHistory[cuisine] = (user.cuisineHistory[cuisine] || 0) + 1;
  }
  if (district) {
    user.districtHistory[district] = (user.districtHistory[district] || 0) + 1;
  }
}

// Топ-кухні користувача
function getTopCuisines(user, limit = 3) {
  return Object.entries(user.cuisineHistory || {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([cuisine]) => cuisine);
}

// Генеруємо taste phrase
function getTastePhrase(user) {
  const top = getTopCuisines(user, 1)[0];
  if (!top) return null;
  const phrases = {
    '☕ Кава і десерт': 'Любиш затишні кавʼярні ☕',
    '🍝 Щось ситне':   'Часто обираєш щось ситне 🍝',
    '🎲 Обери за мене':'Любиш сюрпризи 🎲',
    '🍜 Азія':         'Тягне на азійську кухню 🍜',
    '🍔 Швидко і смачно': 'Цінуєш швидко і смачно 🍔',
    '🥩 Мʼясо':        'М\'ясоїд з досвідом 🥩',
  };
  return phrases[top] || null;
}

module.exports = { getUser, activateTrial, getProStatus, recordTaste, getTopCuisines, getTastePhrase };
