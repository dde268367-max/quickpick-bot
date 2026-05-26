const { Redis } = require('@upstash/redis');

const redis = new Redis({
  url:   process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

// In-memory кеш — не робимо запит в Redis при кожній дії
const cache = {};
const saveTimers = {};

function defaultUser() {
  return {
    session:            {},
    history:            [],
    saved:              [],
    lastRecs:           [],
    isPro:              false,
    proStartedAt:       null,
    proExpiresAt:       null,
    hasUsedTrial:       false,
    proExpiredNotified: false,
    joinDate:           Date.now(),
    step:               null,
    searchCount:        0,
    cuisineHistory:     {},
    districtHistory:    {},
    topDishes:          [],
  };
}

function scheduleSave(id) {
  const key = String(id);
  if (saveTimers[key]) clearTimeout(saveTimers[key]);
  saveTimers[key] = setTimeout(async () => {
    try {
      const u = cache[key];
      if (!u) return;
      const toSave = { ...u, lastRecs: [] };
      await redis.set(`user:${key}`, JSON.stringify(toSave));
    } catch (e) {
      console.error(`[users] Redis save error for ${key}:`, e.message);
    }
  }, 10000);
}

function checkProExpiry(u, id) {
  if (u.isPro && u.proExpiresAt && Date.now() > u.proExpiresAt) {
    u.isPro = false;
    u.proExpiredNotified = false;
    scheduleSave(id);
  }
}

async function getUser(id) {
  const key = String(id);

  if (cache[key]) {
    checkProExpiry(cache[key], key);
    return cache[key];
  }

  try {
    const data = await redis.get(`user:${key}`);
    if (data) {
      const parsed = typeof data === 'string' ? JSON.parse(data) : data;
      const u = { ...defaultUser(), ...parsed, lastRecs: [] };
      cache[key] = u;
      checkProExpiry(u, key);
      return u;
    }
  } catch (e) {
    console.error(`[users] Redis get error for ${key}:`, e.message);
  }

  const u = defaultUser();
  cache[key] = u;
  scheduleSave(key);
  return u;
}

async function activateTrial(id) {
  const key = String(id);
  const u = await getUser(key);
  if (u.hasUsedTrial) return false;
  u.isPro = true;
  u.hasUsedTrial = true;
  u.proStartedAt = Date.now();
  u.proExpiresAt = Date.now() + 21 * 24 * 60 * 60 * 1000;
  scheduleSave(key);
  return true;
}

function getProStatus(user) {
  if (!user.isPro || !user.proExpiresAt) return null;
  const daysLeft = Math.ceil((user.proExpiresAt - Date.now()) / (24 * 60 * 60 * 1000));
  const expiresDate = new Date(user.proExpiresAt).toLocaleDateString('uk-UA', { day: 'numeric', month: 'long' });
  return { daysLeft, expiresDate };
}

function recordTaste(user, cuisine, district) {
  if (cuisine) user.cuisineHistory[cuisine] = (user.cuisineHistory[cuisine] || 0) + 1;
  if (district) user.districtHistory[district] = (user.districtHistory[district] || 0) + 1;
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
