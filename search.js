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

async function doSearch(bot, chatId) {
  const user = getUser(chatId);
  const s = user.session;
  const budget = getBudgetRange(s.budget);
  const isKids = s.cuisine === '👶 Дитяче';

  // Розширюємо радіус якщо мало закладів
  let radius = 1.5;
  let venues = getVenuesInRadius(s.lat, s.lng, radius, budget);
  if (venues.length < 3) { radius = 3;  venues = getVenuesInRadius(s.lat, s.lng, radius, budget); }
  if (venues.length < 1) { radius = 10; venues = getVenuesInRadius(s.lat, s.lng, radius, budget); }

  if (!venues.length) {
    await bot.sendMessage(chatId, `😔 Нічого не знайшов поруч. Спробуй інший бюджет.`,
      inlineKb([[{ text: '🔄 Спробувати знову', data: 'retry' }]]));
    return;
  }

  await bot.sendMessage(chatId, `⚡ Підбираю заклади поруч...`);

  const venueList = venues.slice(0, 15).map(v => {
    const dishes = v.filteredMenu.slice(0, 5).map(d => `${d.name} (${d.price}₴)`).join(', ');
    return `${v.name} (${v.distKm}км): ${dishes}`;
  }).join('\n');

  const kidsNote = isKids ? '\nВажливо: тільки дитячі страви — без гострого, без алкоголю.' : '';

  const prompt = `Ти QuickPick — AI-помічник для вибору їжі. Обери 3 найкращі варіанти.

Кухня: ${s.cuisine}
Бюджет: ${budget.label}${kidsNote}
Заклади поруч:
${venueList}

Обери КОНКРЕТНУ страву з меню вище для кожного закладу.
Reason — коротка жива фраза 5-8 слів.
Description — 1 речення про страву, смачно і коротко.

Відповідь ТІЛЬКИ JSON:
[
  {"place":"Назва","dish":"Страва","price":340,"distKm":"1.2","reason":"Коротка причина","description":"Опис страви"},
  {"place":"...","dish":"...","price":290,"distKm":"0.8","reason":"...","description":"..."},
  {"place":"...","dish":"...","price":450,"distKm":"2.1","reason":"...","description":"..."}
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

  // Додаємо фото та координати до кожної рекомендації
  recs = recs.map(r => {
    const venue = venues.find(v => v.name === r.place);
    const { photo } = findDishPhoto(venue, r.dish);
    return { ...r, photo, lat: venue?.lat, lng: venue?.lng, address: venue?.address };
  });

  user.lastRecs = recs;
  user.searchCount = (user.searchCount || 0) + 1;

  // Відправляємо 3 картки
  for (let i = 0; i < Math.min(recs.length, 3); i++) {
    const r = recs[i];
    const emoji = getCuisineEmoji(r.dish);
    const reasonEmoji = r.reason?.toLowerCase().includes('популяр') || r.reason?.toLowerCase().includes('trend') ? '🔥'
                      : r.reason?.toLowerCase().includes('ідеально') ? '⭐' : '✨';

    const text = `${emoji} *${r.dish}*\n🏠 ${r.place}\n💰 ${r.price} грн  📍 ${r.distKm} км\n\n_${r.description}_\n\n${reasonEmoji} ${r.reason}`;

    await bot.sendMessage(chatId, text, {
      parse_mode: 'Markdown',
      ...inlineKb([[{ text: '🍴 Обрати', data: `pick_${i}` }, { text: '🔄 Інші варіанти', data: 'swap' }]])
    });
  }
}

module.exports = { doSearch };
