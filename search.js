const axios = require('axios');
const { ANTHROPIC_KEY, SEARCH_MESSAGES } = require('./config');
const { getUser, recordTaste } = require('./users');
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

async function doSearch(bot, chatId, isSwap = false, isKids = false, extendedRadius = false) {
  const user = getUser(chatId);
  const s = user.session;
  const budget = getBudgetRange(s.budget);
  const isRandom = s.cuisine === '🎲 Обери за мене';
  const cuisine = isKids ? 'kids' : s.cuisine;

  // Радіус: ручний район = макс 3км, гео = 1.5км
  const isManualDistrict = s.isManualDistrict;
  let radius = extendedRadius ? 10 : (isManualDistrict ? 3 : 1.5);

  let venues = getVenuesInRadius(s.lat, s.lng, radius, budget, cuisine);

  // Якщо мало — розширюємо тільки для гео (не для ручного)
  if (!extendedRadius && !isManualDistrict) {
    if (venues.length < 3) venues = getVenuesInRadius(s.lat, s.lng, 3, budget, cuisine);
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

  // Повідомлення під час пошуку
  if (isRandom) {
    await bot.sendMessage(chatId, `😏 Ох... ми вже настільки довіряємо одне одному?\nШукаю...`);
  } else {
    const msg = SEARCH_MESSAGES[Math.floor(Math.random() * SEARCH_MESSAGES.length)];
    await bot.sendMessage(chatId, msg);
  }

  // Записуємо смаки
  recordTaste(user, s.cuisine, s.districtName);

  // Беремо різноманітні заклади — не більше 1 страви з одного закладу
  const usedPlaces = new Set(isSwap && user.lastRecs ? user.lastRecs.map(r => r.place) : []);
  const diverseVenues = venues.filter(v => !usedPlaces.has(v.name)).slice(0, 12);
  const finalVenues = diverseVenues.length >= 3 ? diverseVenues : venues.slice(0, 12);

  // AI отримує тільки вже відфільтровані страви
  const venueList = finalVenues.map(v => {
    const dishes = v.filteredMenu.slice(0, 4).map(d => `${d.name} (${d.price}₴)`).join(', ');
    return `${v.name}: ${dishes}`;
  }).join('\n');

  const swapNote = isSwap && user.lastRecs?.length
    ? `\nВАЖЛИВО: обери ІНШІ заклади! Попередні: ${user.lastRecs.map(r => r.place).join(', ')}`
    : '';

  const prompt = `Ти QuickPick — вибираєш їжу для людини. Обери 3 варіанти з різних закладів.

Бюджет: ${budget.label}${swapNote}

Заклади і страви (вже відфільтровані, вибирай тільки з цього списку):
${venueList}

Для кожного:
- place: точна назва закладу
- dish: точна назва страви з меню вище
- price: точна ціна з меню вище (не придумуй!)
- reason: жива фраза 4-6 слів, без пафосу. Типу "Ситно і дуже в тему" або "Тут реально класно"
- description: 1 просте речення про страву

ТІЛЬКИ JSON, без коментарів:
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
  } catch (e) {
    console.error('[doSearch] parse error:', e.message);
  }

  if (!recs.length) {
    await bot.sendMessage(chatId, `😔 Не вдалось отримати рекомендації. Спробуй ще раз.`,
      inlineKb([[{ text: '🔄 Повторити', data: 'retry' }]]));
    return;
  }

  // Підставляємо реальні дані — ціну і дистанцію з бекенду
  recs = recs.map(r => {
    const venue = finalVenues.find(v => v.name === r.place) || venues.find(v => v.name === r.place);
    if (!venue) return null;
    const realDish = venue.filteredMenu.find(d => d.name === r.dish)
      || venue.filteredMenu.find(d => d.name.toLowerCase().includes(r.dish.toLowerCase()))
      || venue.filteredMenu[0];
    const { photo } = findDishPhoto(venue, r.dish);
    const distText = distanceText(venue.distKm, s.districtName);
    return {
      ...r,
      dish: realDish?.name || r.dish,
      price: realDish?.price || r.price, // реальна ціна з меню
      distText,
      photo,
      lat: venue.lat,
      lng: venue.lng,
      address: venue.address,
    };
  }).filter(Boolean);

  // Прибираємо дублікати закладів
  const seenPlaces = new Set();
  recs = recs.filter(r => {
    if (seenPlaces.has(r.place)) return false;
    seenPlaces.add(r.place);
    return true;
  }).slice(0, 3);

  if (!recs.length) {
    await bot.sendMessage(chatId, `😔 Спробуй ще раз.`, inlineKb([[{ text: '🔄 Повторити', data: 'retry' }]]));
    return;
  }

  user.lastRecs = recs;
  user.searchCount = (user.searchCount || 0) + 1;

  for (let i = 0; i < recs.length; i++) {
    const r = recs[i];
    const emoji = getCuisineEmoji(r.dish);
    const divider = '─────────────────';
    const text = `${emoji} *${r.dish}*\n${divider}\n🏠 ${r.place}\n💰 ${r.price} грн  •  📍 ${r.distText}\n\n_${r.description}_\n\n✨ ${r.reason}`;

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
        { ...inlineKb([
          [{ text: '⭐ Спробувати PRO безкоштовно', data: 'activate_trial' }],
          [{ text: '😋 Пізніше', data: 'pro_later' }],
        ]) }
      );
    }, 2000);
  }
}

module.exports = { doSearch };
