const axios = require('axios');
const { ANTHROPIC_KEY, SEARCH_MESSAGES } = require('./config');
const { getUser, recordTaste, getTopCuisines, getLastChoice } = require('./users');
const { getBudgetRange, getVenuesInRadius, findDishPhoto, distanceText } = require('./menu');
const { getCuisineEmoji, inlineKb } = require('./utils');
const { track } = require('./analytics');
const { recButtons } = require('./recButtons'); // окремий файл, без циклічного імпорту

// ─── Cache ────────────────────────────────────────────────────────────────────
const searchCache = new Map();
const CACHE_TTL = 7 * 60 * 1000;

function cacheKey(lat, lng, budget, cuisine) {
  return `${lat.toFixed(3)}_${lng.toFixed(3)}_${budget}_${cuisine}`;
}
function getCached(key) {
  const c = searchCache.get(key);
  if (!c) return null;
  if (Date.now() - c.ts > CACHE_TTL) { searchCache.delete(key); return null; }
  return c.recs;
}
function setCache(key, recs) {
  searchCache.set(key, { recs, ts: Date.now() });
  if (searchCache.size > 500) {
    const oldest = [...searchCache.entries()].sort((a, b) => a[1].ts - b[1].ts)[0];
    searchCache.delete(oldest[0]);
  }
}

// ─── Claude ───────────────────────────────────────────────────────────────────
async function askClaude(prompt, maxTokens = 600) {
  try {
    const res = await axios.post('https://api.anthropic.com/v1/messages', {
      model: 'claude-sonnet-4-6',
      max_tokens: maxTokens,
      messages: [{ role: 'user', content: prompt }],
    }, {
      headers: {
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      timeout: 15000,
    });
    return res.data.content[0].text;
  } catch (e) {
    console.error('[askClaude] ERROR:', e.response?.data || e.message);
    return null;
  }
}

// ─── Алкоголь ─────────────────────────────────────────────────────────────────
const ALCOHOL_KEYWORDS = [
  'вино','wine','verde','vinho','пиво','beer','коктейль','cocktail',
  'горілка','whisky','віскі','джин','ром','лікер','шот','бренді',
  'текіла','абсент','просекко','шампан','cava','брют','н/сухе',
  'п/сухе','п/солодке','портвейн','херес','мартіні',
  'aperol','campari','spritz','сидр','cider','медовуха',
];
function isDrink(dishName) {
  const name = (dishName || '').toLowerCase();
  return ALCOHOL_KEYWORDS.some(k => name.includes(k));
}

// ─── PRO: Calories ────────────────────────────────────────────────────────────
async function getCalories(dish, place) {
  try {
    const res = await askClaude(
      `Дай приблизні калорії для страви "${dish}" з ресторану "${place}".\nВідповідь ТІЛЬКИ JSON без тексту:\n{"kcal":450,"protein":20,"fat":15,"carbs":50}`,
      250
    );
    if (!res) return null;
    const match = res.match(/\{[^{}]*"kcal"[^{}]*\}/);
    if (!match) return null;
    const parsed = JSON.parse(match[0]);
    const { kcal, protein, fat, carbs } = parsed;
    if (!kcal || !protein || !fat || !carbs) return null;
    if (isNaN(kcal) || isNaN(protein) || isNaN(fat) || isNaN(carbs)) return null;
    return {
      kcal:    Math.round(Number(kcal)),
      protein: Math.round(Number(protein)),
      fat:     Math.round(Number(fat)),
      carbs:   Math.round(Number(carbs)),
    };
  } catch (e) {
    console.error('[getCalories] error:', e.message);
    return null;
  }
}

// ─── PRO: Pair ────────────────────────────────────────────────────────────────
async function getPairRec(dish, venueMenu) {
  try {
    const dishIsDrink = isDrink(dish);
    const relevantMenu = (venueMenu || []).filter(d =>
      dishIsDrink ? !isDrink(d.name) : true
    ).slice(0, 8);
    const menuStr = relevantMenu.map(d => `${d.name}(${d.price}₴)`).join(', ');
    const menuNote = menuStr ? ` Меню: ${menuStr}.` : '';
    const context = dishIsDrink
      ? 'Це напій. Порадь 1 закуску або страву.'
      : 'Це страва. Порадь 1 напій або доповнення.';
    const res = await askClaude(
      `До "${dish}" — ${context}${menuNote}\nJSON: {"pair":"назва","reason":"1 речення"}`,
      180
    );
    if (!res) return null;
    const match = res.match(/\{[^{}]*"pair"[^{}]*\}/);
    return match ? JSON.parse(match[0]) : null;
  } catch (e) {
    console.error('[getPairRec] error:', e.message);
    return null;
  }
}

// ─── Main search ──────────────────────────────────────────────────────────────
async function doSearch(bot, chatId, isSwap = false, isKids = false, extendedRadius = false) {
  const user = await getUser(chatId);
  const s = user.session;

  // Захист від порожньої сесії
  if (!s || !s.lat || !s.budget) {
    const { handleManualLocation } = require('./handlers/location');
    await handleManualLocation(bot, chatId);
    return;
  }

  const budget = getBudgetRange(s.budget);
  const isRandom = s.cuisine === '🎲 Обери за мене';
  const cuisine = isKids ? 'kids' : s.cuisine;
  const isPro = user.isPro;
  const isManualDistrict = s.isManualDistrict;

  let radius = extendedRadius ? 10 : (isManualDistrict ? 3 : 1.5);
  let venues = getVenuesInRadius(s.lat, s.lng, radius, budget, cuisine);
  if (!extendedRadius && !isManualDistrict && venues.length < 3) {
    venues = getVenuesInRadius(s.lat, s.lng, 3, budget, cuisine);
  }

  if (!venues.length) {
    await bot.sendMessage(chatId, `😅 Поруч нічого не знайшов за цими параметрами.`,
      inlineKb([
        [{ text: '🔎 Шукати далі', data: 'search_extended' }],
        [{ text: '🏙 Інший район', data: 'change_district' }],
        [{ text: '🍽 Змінити кухню', data: 'back_to_cuisine' }],
      ]));
    return;
  }

  if (isRandom && isPro) {
    await bot.sendMessage(chatId, `🎯 Підбираю на основі твоїх смаків...`);
  } else if (isRandom) {
    await bot.sendMessage(chatId, `😏 Шукаю щось цікаве...`);
  } else {
    const msg = SEARCH_MESSAGES[Math.floor(Math.random() * SEARCH_MESSAGES.length)];
    await bot.sendMessage(chatId, msg);
  }

  recordTaste(user, s.cuisine, s.districtName);
  track(chatId, 'search', {
    cuisine, budget: s.budget,
    district: s.districtName || 'geo',
    is_pro: isPro, is_swap: isSwap, is_kids: isKids,
  });

  const usedPlaces = new Set(isSwap && user.lastRecs ? user.lastRecs.map(r => r.place) : []);
  let finalVenues = venues.filter(v => !usedPlaces.has(v.name));
  if (finalVenues.length < 3) finalVenues = venues;

  let hiddenGems = new Set();
  if (isPro) {
    const savedPlaces = new Set(user.saved.map(s => s.place));
    finalVenues.filter(v => !savedPlaces.has(v.name)).slice(0, 2).forEach(v => hiddenGems.add(v.name));
  }

  finalVenues = finalVenues.slice(0, 8);

  const ck = cacheKey(s.lat, s.lng, s.budget, cuisine);
  let recs = (!isSwap && !isKids && !isPro) ? getCached(ck) : null;

  if (!recs) {
    const topCuisines = getTopCuisines(user, 2);
    const tasteNote = isPro && topCuisines.length && isRandom ? ` Улюблені кухні: ${topCuisines.join(', ')}.` : '';
    const swapNote = isSwap && user.lastRecs?.length ? ` УНИКАЙ: ${user.lastRecs.map(r => r.place).join(', ')}.` : '';

    const venueList = finalVenues.map(v => {
      const dishes = v.filteredMenu.slice(0, 3).map(d => `${d.name}(${d.price}₴)`).join(', ');
      return `${v.name}${hiddenGems.has(v.name) ? '[gem]' : ''}: ${dishes}`;
    }).join('\n');

    const prompt = `Обери 3 варіанти з різних закладів. Бюджет: ${budget.label}.${tasteNote}${swapNote}${hiddenGems.size ? ' Включи хоча б 1 [gem].' : ''}

${venueList}

JSON (тільки з цього списку, точні назви!):
[{"place":"...","dish":"...","reason":"4-5 слів","description":"1 речення"}]`;

    const reply = await askClaude(prompt, 600);
    if (!reply) {
      await bot.sendMessage(chatId, `😔 Помилка. Спробуй ще раз.`,
        inlineKb([[{ text: '🔄 Повторити', data: 'retry' }], [{ text: '🍽 Змінити кухню', data: 'back_to_cuisine' }]]));
      return;
    }
    try {
      const match = reply.match(/\[[\s\S]*\]/);
      if (match) recs = JSON.parse(match[0]);
    } catch (e) { console.error('[doSearch] parse error:', e.message); }
  }

  if (!recs?.length) {
    await bot.sendMessage(chatId, `😔 Спробуй ще раз.`,
      inlineKb([[{ text: '🔄 Повторити', data: 'retry' }], [{ text: '🍽 Змінити кухню', data: 'back_to_cuisine' }]]));
    return;
  }

  recs = recs.map(r => {
    const venue = finalVenues.find(v => v.name === r.place) || venues.find(v => v.name === r.place);
    if (!venue) return null;
    const realDish = venue.filteredMenu.find(d => d.name === r.dish)
      || venue.filteredMenu.find(d => d.name.toLowerCase().includes((r.dish || '').toLowerCase()))
      || venue.filteredMenu[0];
    if (!realDish) return null;
    const { photo } = findDishPhoto(venue, realDish.name);
    return {
      ...r,
      dish:     realDish.name,
      price:    realDish.price,
      distText: distanceText(venue.distKm, s.districtName),
      distKm:   venue.distKm,
      photo, lat: venue.lat, lng: venue.lng, address: venue.address,
      isGem:    hiddenGems.has(r.place),
    };
  }).filter(Boolean);

  const seen = new Set();
  recs = recs.filter(r => { if (seen.has(r.place)) return false; seen.add(r.place); return true; }).slice(0, 3);

  if (!recs.length) {
    await bot.sendMessage(chatId, `😔 Спробуй ще раз.`,
      inlineKb([[{ text: '🔄 Повторити', data: 'retry' }]]));
    return;
  }

  if (!isSwap && !isKids && !isPro) setCache(ck, recs);

  user.lastRecs = recs;
  user.searchCount = (user.searchCount || 0) + 1;

  if (isPro && !isKids) {
    const last = getLastChoice(user);
    const sixHours = 6 * 60 * 60 * 1000;
    if (last && user.searchCount > 2 && (Date.now() - last.date) > sixHours) {
      await bot.sendMessage(chatId,
        `🔁 _Минулого разу ти обирав *${last.dish}* у *${last.place}*. Повторити?_`,
        { parse_mode: 'Markdown', ...inlineKb([[
          { text: '🔁 Так', data: 'repeat_last' },
          { text: 'Ні, далі', data: 'skip_repeat' }
        ]]) }
      );
      user.session.pendingRecs = recs;
      return;
    }
  }

  await sendRecs(bot, chatId, user, recs, isPro);
}

async function sendRecs(bot, chatId, user, recs, isPro) {
  for (let i = 0; i < recs.length; i++) {
    const r = recs[i];
    const emoji = getCuisineEmoji(r.dish);
    const gemBadge = r.isGem ? '\n👀 _Місце, яке часто пропускають_' : '';
    const text = `${emoji} *${r.dish}*\n─────────────────\n🏠 ${r.place}\n💰 ${r.price} грн  •  📍 ${r.distText}${gemBadge}\n\n_${r.description}_\n\n✨ ${r.reason}`;
    const buttons = recButtons(i, i === recs.length - 1);
    await bot.sendMessage(chatId, text, { parse_mode: 'Markdown', ...buttons });
    await new Promise(r => setTimeout(r, 250));
  }

  if (!user.isPro && !user.hasUsedTrial && user.searchCount >= 3 && user.searchCount <= 5) {
    setTimeout(async () => {
      await bot.sendMessage(chatId,
        `😏 Здається, вже непогано знаємо твій смак.\n\nХочеш, щоб QuickPick підбирав точніше?`,
        inlineKb([
          [{ text: '⭐ Спробувати PRO безкоштовно', data: 'activate_trial' }],
          [{ text: '😋 Пізніше', data: 'pro_later' }],
        ])
      );
    }, 2000);
  }
}

module.exports = { doSearch, sendRecs, getCalories, getPairRec };
