const axios = require('axios');
const { ANTHROPIC_KEY, SEARCH_MESSAGES } = require('./config');
const { getUser, recordTaste, getTopCuisines, getLastChoice } = require('./users');
const { getBudgetRange, getVenuesInRadius, findDishPhoto, distanceText } = require('./menu');
const { getCuisineEmoji, inlineKb } = require('./utils');

async function askClaude(prompt) {
  try {
    const res = await axios.post('https://api.anthropic.com/v1/messages', {
      model: 'claude-sonnet-4-5',
      max_tokens: 1000,
      messages: [{ role: 'user', content: prompt }],
    }, {
      headers: {
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      }
    });
    return res.data.content[0].text;
  } catch (e) {
    console.error('[askClaude] ERROR:', e.response?.data || e.message);
    return null;
  }
}

// PRO: Calories через AI (базово)
async function getCalories(dish, place) {
  try {
    const res = await askClaude(`Страва: "${dish}" з закладу "${place}". Дай тільки JSON без коментарів: {"kcal":500,"protein":25,"fat":20,"carbs":40}`);
    if (!res) return null;
    const match = res.match(/\{[\s\S]*\}/);
    return match ? JSON.parse(match[0]) : null;
  } catch { return null; }
}

// PRO: Pair recommendation
async function getPairRec(dish) {
  try {
    const res = await askClaude(`До страви "${dish}" порадь 1 напій або доповнення. Відповідь ТІЛЬКИ JSON: {"pair":"назва","reason":"коротко чому"}`);
    if (!res) return null;
    const match = res.match(/\{[\s\S]*\}/);
    return match ? JSON.parse(match[0]) : null;
  } catch { return null; }
}

async function doSearch(bot, chatId, isSwap = false, isKids = false, extendedRadius = false) {
  const user = getUser(chatId);
  const s = user.session;
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
    await bot.sendMessage(chatId, `😅 Поруч нічого цікавого не знайшов.`,
      inlineKb([
        [{ text: '🔎 Шукати трохи далі', data: 'search_extended' }],
        [{ text: '🏙 Обрати інший район', data: 'manual_location' }],
        [{ text: '↩️ Змінити кухню', data: 'back_to_cuisine' }],
      ]));
    return;
  }

  // Повідомлення пошуку
  if (isRandom && isPro) {
    await bot.sendMessage(chatId, `🎯 Підбираю на основі твоїх смаків...`);
  } else if (isRandom) {
    await bot.sendMessage(chatId, `😏 Ох... ми вже настільки довіряємо одне одному?\nШукаю...`);
  } else {
    const msg = SEARCH_MESSAGES[Math.floor(Math.random() * SEARCH_MESSAGES.length)];
    await bot.sendMessage(chatId, msg);
  }

  recordTaste(user, s.cuisine, s.districtName);

  // Diversity: не повторювати заклади з попереднього пошуку
  const usedPlaces = new Set(isSwap && user.lastRecs ? user.lastRecs.map(r => r.place) : []);
  let finalVenues = venues.filter(v => !usedPlaces.has(v.name));
  if (finalVenues.length < 3) finalVenues = venues;
  finalVenues = finalVenues.slice(0, 12);

  // PRO: Hidden gems — заклади яких немає в топ-збережених
  let hiddenGems = [];
  if (isPro) {
    const popularPlaces = new Set(user.saved.map(s => s.place));
    hiddenGems = finalVenues.filter(v => !popularPlaces.has(v.name)).slice(0, 3).map(v => v.name);
  }

  // PRO: Taste memory — враховуємо улюблені кухні
  const topCuisines = getTopCuisines(user, 2);
  const tasteNote = isPro && topCuisines.length && isRandom
    ? `\nУлюблені кухні цього користувача: ${topCuisines.join(', ')}. Враховуй це.`
    : '';

  const venueList = finalVenues.map(v => {
    const dishes = v.filteredMenu.slice(0, 4).map(d => `${d.name} (${d.price}₴)`).join(', ');
    const gem = hiddenGems.includes(v.name) ? ' [hidden gem]' : '';
    return `${v.name}${gem}: ${dishes}`;
  }).join('\n');

  const swapNote = isSwap && user.lastRecs?.length
    ? `\nОбери ІНШІ заклади! Попередні: ${user.lastRecs.map(r => r.place).join(', ')}`
    : '';

  const prompt = `Ти QuickPick — вибираєш їжу. Обери 3 варіанти з РІЗНИХ закладів.

Бюджет: ${budget.label}${tasteNote}${swapNote}
${hiddenGems.length ? `\nЗаклади з [hidden gem] — менш відомі, але варті уваги. Включи хоча б один.` : ''}

Заклади (вибирай ТІЛЬКИ з цього списку):
${venueList}

Для кожного:
- place: точна назва
- dish: точна назва страви
- price: точна ціна (не придумуй!)
- reason: жива фраза 4-6 слів без пафосу
- description: 1 просте речення
${hiddenGems.length ? '- isGem: true якщо це hidden gem, інакше false' : ''}

ТІЛЬКИ JSON:
[{"place":"...","dish":"...","price":0,"reason":"...","description":"..."},{"place":"...","dish":"...","price":0,"reason":"...","description":"..."},{"place":"...","dish":"...","price":0,"reason":"...","description":"..."}]`;

  const reply = await askClaude(prompt);
  if (!reply) {
    await bot.sendMessage(chatId, `😔 Помилка. Спробуй ще раз.`,
      inlineKb([[{ text: '🔄 Повторити', data: 'retry' }]]));
    return;
  }

  let recs = [];
  try {
    const match = reply.match(/\[[\s\S]*\]/);
    if (match) recs = JSON.parse(match[0]);
  } catch (e) { console.error('[doSearch] parse error:', e.message); }

  if (!recs.length) {
    await bot.sendMessage(chatId, `😔 Спробуй ще раз.`, inlineKb([[{ text: '🔄 Повторити', data: 'retry' }]]));
    return;
  }

  // Підставляємо реальні дані з бекенду
  recs = recs.map(r => {
    const venue = finalVenues.find(v => v.name === r.place) || venues.find(v => v.name === r.place);
    if (!venue) return null;
    const realDish = venue.filteredMenu.find(d => d.name === r.dish)
      || venue.filteredMenu.find(d => d.name.toLowerCase().includes((r.dish || '').toLowerCase()))
      || venue.filteredMenu[0];
    const { photo } = findDishPhoto(venue, r.dish);
    return {
      ...r,
      dish:     realDish?.name || r.dish,
      price:    realDish?.price || r.price,
      distText: distanceText(venue.distKm, s.districtName),
      distKm:   venue.distKm,
      photo,
      lat:      venue.lat,
      lng:      venue.lng,
      address:  venue.address,
      isGem:    hiddenGems.includes(r.place),
    };
  }).filter(Boolean);

  // Прибираємо дублікати
  const seen = new Set();
  recs = recs.filter(r => { if (seen.has(r.place)) return false; seen.add(r.place); return true; }).slice(0, 3);

  if (!recs.length) {
    await bot.sendMessage(chatId, `😔 Спробуй ще раз.`, inlineKb([[{ text: '🔄 Повторити', data: 'retry' }]]));
    return;
  }

  user.lastRecs = recs;
  user.searchCount = (user.searchCount || 0) + 1;

  // PRO: Smart Repeat підказка
  if (isPro) {
    const last = getLastChoice(user);
    if (last && user.searchCount > 1) {
      await bot.sendMessage(chatId,
        `🔁 _До речі, минулого разу ти обирав *${last.dish}* у *${last.place}*. Хочеш повторити?_`,
        { parse_mode: 'Markdown', ...inlineKb([[{ text: '🔁 Так, повторити', data: 'repeat_last' }, { text: 'Ні, далі', data: 'skip_repeat' }]]) }
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
    const divider = '─────────────────';
    const text = `${emoji} *${r.dish}*\n${divider}\n🏠 ${r.place}\n💰 ${r.price} грн  •  📍 ${r.distText}${gemBadge}\n\n_${r.description}_\n\n✨ ${r.reason}`;

    let buttons;
    if (i < 2) {
      buttons = inlineKb([
        [{ text: '🍴 Хочу це', data: `pick_${i}` }],
        [{ text: '↩️ Назад', data: 'back_to_cuisine' }],
      ]);
    } else {
      buttons = inlineKb([
        [{ text: '🍴 Хочу це', data: `pick_${i}` }, { text: '🔄 Інші варіанти', data: 'swap' }],
        [{ text: '↩️ Назад', data: 'back_to_cuisine' }, { text: '👶 Дитячі варіанти', data: 'kids_filter' }],
      ]);
    }

    await bot.sendMessage(chatId, text, { parse_mode: 'Markdown', ...buttons });
  }

  // PRO після 3-5 пошуків
  if (!user.isPro && !user.hasUsedTrial && user.searchCount >= 3 && user.searchCount <= 5) {
    setTimeout(async () => {
      await bot.sendMessage(chatId,
        `😏 Здається, ми вже непогано знаємо твій смак.\n\nХочеш, щоб QuickPick підбирав ще точніше?`,
        inlineKb([
          [{ text: '⭐ Спробувати PRO безкоштовно', data: 'activate_trial' }],
          [{ text: '😋 Пізніше', data: 'pro_later' }],
        ])
      );
    }, 2000);
  }
}

module.exports = { doSearch, sendRecs, getCalories, getPairRec };
