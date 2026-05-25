const axios = require('axios');
const { ANTHROPIC_KEY } = require('./config');
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

// Маппінг кнопок кухні до реальних категорій для AI
function getCuisinePrompt(cuisine) {
  const map = {
    '🍝 Щось ситне':          'Ситна їжа — паста, ризото, борщ, вареники, картопля, м\'ясні страви',
    '🍜 Азія':                 'Азійська кухня — суші, роли, рамен, пад тай, локшина',
    '🍔 Швидко і смачно':      'Фастфуд — бургери, піца, шаурма, снеки',
    '☕ Кава і десерт':        'Кава, капучіно, десерти, торти, випічка',
    '🥩 Мʼясо':               'М\'ясні страви — стейк, гриль, ребра, шашлик',
    '🎲 Обери за мене':        'Будь-яка кухня — обери найцікавіше і несподіване',
  };
  return map[cuisine] || cuisine;
}

async function doSearch(bot, chatId, isSwap = false, isKids = false) {
  const user = getUser(chatId);
  const s = user.session;
  const budget = getBudgetRange(s.budget);
  const isRandom = s.cuisine === '🎲 Обери за мене';

  let radius = 1.5;
  let venues = getVenuesInRadius(s.lat, s.lng, radius, budget);
  if (venues.length < 3) { radius = 3;  venues = getVenuesInRadius(s.lat, s.lng, radius, budget); }
  if (venues.length < 1) { radius = 10; venues = getVenuesInRadius(s.lat, s.lng, radius, budget); }

  if (!venues.length) {
    await bot.sendMessage(chatId, `😔 Нічого не знайшов поруч. Спробуй інший район або бюджет.`,
      inlineKb([
        [{ text: '📍 Змінити район', data: 'manual_location' }],
        [{ text: '🔄 Спробувати знову', data: 'retry' }]
      ]));
    return;
  }

  // Особливий текст для "Обери за мене"
  if (isRandom) {
    await bot.sendMessage(chatId, `😏 Ох, ми вже настільки довіряємо одне одному. Шукаю...`);
  } else {
    await bot.sendMessage(chatId, `😏 Є кілька ідей... секунду`);
  }

  const venueList = venues.slice(0, 15).map(v => {
    const dishes = v.filteredMenu.slice(0, 5).map(d => `${d.name} (${d.price}₴)`).join(', ');
    return `${v.name} (${v.distKm}км): ${dishes}`;
  }).join('\n');

  const cuisineDesc = getCuisinePrompt(s.cuisine);
  const kidsNote = isKids ? '\nВАЖЛИВО: підбирай ТІЛЬКИ дитячі страви — без гострого, без алкоголю, легкі та прості.' : '';
  const swapNote = isSwap && user.lastRecs?.length
    ? `\nВАЖЛИВО: попередні варіанти були: ${user.lastRecs.map(r => r.place + ' / ' + r.dish).join(', ')}. Обери КАРДИНАЛЬНО інші заклади та страви!`
    : '';

  const prompt = `Ти QuickPick — AI-помічник для вибору їжі. Обери 3 найкращі варіанти.

Категорія: ${cuisineDesc}
Бюджет: ${budget.label}${kidsNote}${swapNote}
Заклади поруч:
${venueList}

Обери КОНКРЕТНУ страву з меню вище для кожного закладу.
reason — коротка жива фраза 5-8 слів, чіпляюча і апетитна.
description — 1 речення про страву, смачно і коротко.
hook — 1 коротка емоційна фраза чому саме зараз це треба спробувати.

Відповідь ТІЛЬКИ JSON:
[
  {"place":"Назва","dish":"Страва","price":340,"distKm":"1.2","reason":"Коротка причина","description":"Опис страви","hook":"Емоційний гачок"},
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
    await bot.sendMessage(chatId, `😔 Не вдалось розпарсити відповідь. Спробуй ще раз.`,
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

    // Кнопки: 1 і 2 — тільки "Хочу це!", 3 — + "Інші варіанти"
    let buttons;
    if (i < 2) {
      buttons = inlineKb([[{ text: '🙌 Хочу це!', data: `pick_${i}` }]]);
    } else {
      buttons = inlineKb([
        [{ text: '🙌 Хочу це!', data: `pick_${i}` }, { text: '🔀 Інші варіанти', data: 'swap' }],
        [{ text: '👶 Показати варіанти для дітей', data: 'kids_filter' }],
      ]);
    }

    await bot.sendMessage(chatId, text, {
      parse_mode: 'Markdown',
      ...buttons
    });
  }
}

module.exports = { doSearch };
