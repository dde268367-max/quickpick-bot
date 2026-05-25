const axios = require('axios');
const { ANTHROPIC_KEY, CUISINE_MAP, SEARCH_MESSAGES } = require('./config');
const { getUser } = require('./users');
const { getBudgetRange, getVenuesInRadius, findDishPhoto } = require('./menu');
const { getCuisineEmoji, inlineKb } = require('./utils');

async function askClaude(prompt) {
  try {
    const res = await axios.post('https://api.anthropic.com/v1/messages', {
      model: 'claude-sonnet-4-5',
      max_tokens: 1500,
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

// Фільтруємо страви — прибираємо алкоголь/снеки для певних категорій
function filterDishes(menu, excludeWords) {
  if (!excludeWords || !excludeWords.length) return menu;
  return menu.filter(d => {
    const name = (d.name || '').toLowerCase();
    return !excludeWords.some(w => name.includes(w));
  });
}

async function doSearch(bot, chatId, isSwap = false, isKids = false, extendedRadius = false) {
  const user = getUser(chatId);
  const s = user.session;
  const budget = getBudgetRange(s.budget);
  const isRandom = s.cuisine === '🎲 Обери за мене';
  const cuisineInfo = CUISINE_MAP[s.cuisine] || { desc: s.cuisine, exclude: [] };

  // Радіус пошуку
  let radius = extendedRadius ? 10 : 1.5;
  let venues = getVenuesInRadius(s.lat, s.lng, radius, budget);
  if (!extendedRadius) {
    if (venues.length < 3) { radius = 3;  venues = getVenuesInRadius(s.lat, s.lng, radius, budget); }
  }

  if (!venues.length) {
    await bot.sendMessage(chatId, `😔 Нічого не знайшов поруч.`,
      inlineKb([
        [{ text: '🔎 Шукати трохи далі', data: 'search_extended' }, { text: '🏙 Обрати район вручну', data: 'manual_location' }],
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

  // Фільтруємо меню закладів від барних позицій
  const filteredVenues = venues.map(v => ({
    ...v,
    filteredMenu: filterDishes(v.filteredMenu, cuisineInfo.exclude),
  })).filter(v => v.filteredMenu.length > 0);

  const venueList = (filteredVenues.length ? filteredVenues : venues).slice(0, 15).map(v => {
    const dishes = v.filteredMenu.slice(0, 5).map(d => `${d.name} (${d.price}₴)`).join(', ');
    return `${v.name} (${v.distKm}км): ${dishes}`;
  }).join('\n');

  const kidsNote = isKids ? '\nВАЖЛИВО: ТІЛЬКИ дитячі страви — без гострого, без алкоголю, прості та легкі.' : '';
  const swapNote = isSwap && user.lastRecs?.length
    ? `\nВАЖЛИВО: попередні варіанти були: ${user.lastRecs.map(r => r.place + ' / ' + r.dish).join(', ')}. Обери КАРДИНАЛЬНО інші заклади та страви!`
    : '';

  const prompt = `Ти QuickPick — AI-помічник для вибору їжі. Обери 3 найкращі варіанти.

Категорія: ${cuisineInfo.desc}
Бюджет: ${budget.label}${kidsNote}${swapNote}

ВАЖЛИВО: НЕ пропонуй алкоголь, коктейлі, пиво, вино, барні снеки, горішки до пива. Тільки їжу.

Заклади поруч:
${venueList}

Обери КОНКРЕТНУ страву з меню вище для кожного закладу.
reason — коротка жива фраза 5-8 слів, апетитна і чіпляюча.
description — 1 речення про страву, смачно і коротко.
hook — коротка емоційна фраза чому саме зараз це треба спробувати.

Відповідь ТІЛЬКИ JSON (без коментарів):
[
  {"place":"Назва","dish":"Страва","price":340,"distKm":"1.2","reason":"Причина","description":"Опис","hook":"Гачок"},
  {"place":"...","dish":"...","price":290,"distKm":"0.8","reason":"...","description":"...","hook":"..."},
  {"place":"...","dish":"...","price":450,"distKm":"2.1","reason":"...","description":"...","hook":"..."}
]`;

  const reply = await askClaude(prompt);
  if (!reply) {
    await bot.sendMessage(chatId, `😔 Помилка AI. Спробуй ще раз.`,
      inlineKb([[{ text: '🔄 Повторити', data: 'retry' }]]));
    return;
  }

  let recs = [];
  try {
    const match = reply.match(/\[[\s\S]*\]/);
    if (match) recs = JSON.parse(match[0]);
  } catch (e) {
    console.error('[doSearch] JSON parse error:', e.message);
  }

  if (!recs.length) {
    await bot.sendMessage(chatId, `😔 Не вдалось отримати рекомендації. Спробуй ще раз.`,
      inlineKb([[{ text: '🔄 Повторити', data: 'retry' }]]));
    return;
  }

  recs = recs.map(r => {
    const venue = venues.find(v => v.name === r.place);
    const { photo } = findDishPhoto(venue, r.dish);
    return { ...r, photo, lat: venue?.lat, lng: venue?.lng, address: venue?.address };
  });

  user.lastRecs = recs;
  user.searchCount = (user.searchCount || 0) + 1;

  for (let i = 0; i < Math.min(recs.length, 3); i++) {
    const r = recs[i];
    const emoji = getCuisineEmoji(r.dish);
    const divider = '─────────────────';
    const text = `${emoji} *${r.dish}*\n${divider}\n🏠 ${r.place}\n💰 ${r.price} грн  •  📍 ${r.distKm} км\n\n_${r.description}_\n\n💬 _${r.hook}_\n\n✨ ${r.reason}`;

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

  // PRO підказка після 3-5 використань — м'яка подача
  if (!user.isPro && user.searchCount >= 3 && user.searchCount <= 5) {
    setTimeout(async () => {
      await bot.sendMessage(chatId,
        `😏 Здається, ми вже непогано знаємо твій смак.\n\nХочеш, щоб QuickPick підбирав ще точніше?`,
        { parse_mode: 'Markdown', ...inlineKb([
          [{ text: '⭐ QuickPick PRO', data: 'show_pro' }],
          [{ text: '😋 Пізніше', data: 'pro_later' }],
        ]) }
      );
    }, 2000);
  }
}

module.exports = { doSearch };
