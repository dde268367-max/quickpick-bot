const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const fs = require('fs');

const BOT_TOKEN = process.env.BOT_TOKEN;
const ANTHROPIC_KEY = process.env.ANTHROPIC_KEY;

const realMenu = JSON.parse(fs.readFileSync('real_menu.json', 'utf8'));
const bot = new TelegramBot(BOT_TOKEN, { polling: true });
const users = {};

function getUser(id) {
  if (!users[id]) users[id] = {
    session: {}, history: [], saved: [], lastRecs: [],
    isPro: false, joinDate: Date.now(), step: null, searchCount: 0
  };
  return users[id];
}

function getDistance(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2-lat1)*Math.PI/180, dLon = (lon2-lon1)*Math.PI/180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)**2;
  return R*2*Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

function getFullPhotoUrl(url) {
  if (!url) return null;

  let clean = url;

  // прибираємо thumbnail
  clean = clean.replace('/thumbnail_', '/');
  clean = clean.replace('thumbnail_', '');

  // прибираємо зайві query params
  clean = clean.split('?')[0];

  if (clean.endsWith('.webp')) {
    return null;
  }

  return clean;
}

function enhanceCloudinaryPhoto(url) {
  if (!url) return null;
  // Додаємо трансформацію Cloudinary: найвища якість, авто-формат, ширина 1200px
  if (url.includes('res.cloudinary.com')) {
    return url.replace('/upload/', '/upload/q_auto:best,f_auto,w_1200/');
  }
  return url;
}

function getBudgetRange(cat) {
  if (cat === '🟢 Бюджетно') return { min: 0, max: 250, label: 'до 250 грн' };
  if (cat === '🟡 Середньо') return { min: 150, max: 600, label: '150–600 грн' };
  return { min: 400, max: 9999, label: '400+ грн' };
}

function inlineKb(rows) {
  return { reply_markup: { inline_keyboard: rows.map(r => r.map(b =>
    b.url ? { text: b.text, url: b.url } : { text: b.text, callback_data: b.data }
  ))}};
}
function kb(rows) {
  return { reply_markup: { keyboard: rows.map(r => r.map(t => ({ text: t }))), resize_keyboard: true, one_time_keyboard: true }};
}
function geoKb() {
  return { reply_markup: { keyboard: [[{ text: '📍 Поділитись геолокацією', request_location: true }]], resize_keyboard: true, one_time_keyboard: true }};
}

async function askClaude(prompt) {
  try {
    const res = await axios.post('https://api.anthropic.com/v1/messages', {
      model: 'claude-sonnet-4-5', max_tokens: 1500,
      messages: [{ role: 'user', content: prompt }]
    }, { headers: { 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' }});
    return res.data.content[0].text;
  } catch(e) { console.log('Claude error:', e.response?.data || e.message); return null; }
}

function getVenuesInRadius(lat, lng, radius, budgetRange) {
  return Object.values(realMenu)
    .map(v => {
      const vLat = v.coords[1], vLng = v.coords[0];
      const distKm = getDistance(lat, lng, vLat, vLng).toFixed(1);
      const dishes = v.menu.filter(d => d.price >= budgetRange.min && d.price <= budgetRange.max && d.price > 0);
      return { ...v, distKm, lat: vLat, lng: vLng, filteredMenu: dishes.length ? dishes : v.menu.filter(d => d.price > 0) };
    })
    .filter(v => parseFloat(v.distKm) <= radius && v.filteredMenu.length > 0)
    .sort((a, b) => parseFloat(a.distKm) - parseFloat(b.distKm));
}

function getCuisineEmoji(dish) {
  const d = (dish || '').toLowerCase();
  if (d.includes('піц') || d.includes('piz')) return '🍕';
  if (d.includes('суш') || d.includes('ролл')) return '🍣';
  if (d.includes('паст') || d.includes('ризот')) return '🍝';
  if (d.includes('бург')) return '🍔';
  if (d.includes('суп') || d.includes('борщ')) return '🍲';
  if (d.includes('салат')) return '🥗';
  if (d.includes('кав') || d.includes('капуч') || d.includes('еспр')) return '☕';
  if (d.includes('торт') || d.includes('десерт') || d.includes('морозив')) return '🍰';
  if (d.includes('стейк') || d.includes('гриль') || d.includes('ребр')) return '🥩';
  return '🍽';
}

async function doSearch(chatId) {
  const user = getUser(chatId);
  const s = user.session;
  const budget = getBudgetRange(s.budget);
  const isKids = s.cuisine === '👶 Дитяче';

  let radius = 1.5;
  let venues = getVenuesInRadius(s.lat, s.lng, radius, budget);
  if (venues.length < 3) { radius = 3; venues = getVenuesInRadius(s.lat, s.lng, radius, budget); }
  if (venues.length < 1) { radius = 10; venues = getVenuesInRadius(s.lat, s.lng, radius, budget); }

  if (!venues.length) {
    await bot.sendMessage(chatId, `😔 Нічого не знайшов поруч. Спробуй інший бюджет.`,
      inlineKb([[{ text: '🔄 Спробувати знову', data: 'retry' }]]));
    return;
  }

  await bot.sendMessage(chatId, `⚡ Підбираю заклади поруч...`);

  const venueList = venues.slice(0, 15).map(v => {
    const dishes = v.filteredMenu.slice(0, 5).map(d => `${d.name} (${d.price}₴)`).join(', ');
    return `${v.name} (${v.distKm}км від тебе): ${dishes}`;
  }).join('\n');

  const kidsNote = isKids ? '\nВажливо: підбирай страви для дітей — без гострого, без алкоголю, легкі страви.' : '';

  const prompt = `Ти QuickPick — AI-помічник для вибору їжі. Обери 3 найкращі варіанти.

Кухня: ${s.cuisine}
Бюджет: ${budget.label}${kidsNote}
Заклади поруч з меню:
${venueList}

Для кожного варіанту обери КОНКРЕТНУ страву з меню вище.
Reason — коротка жива фраза 5-8 слів: "Trending nearby", "Ідеально на обід", "Популярне місце" тощо.
Також додай короткий опис страви (1 речення, смачно і коротко).

JSON ТІЛЬКИ:
[
  {"place":"Назва","dish":"Назва страви","price":340,"distKm":"1.2","reason":"Коротка причина","description":"Опис страви одним реченням"},
  {"place":"...","dish":"...","price":290,"distKm":"0.8","reason":"...","description":"..."},
  {"place":"...","dish":"...","price":450,"distKm":"2.1","reason":"...","description":"..."}
]`;

  const reply = await askClaude(prompt);
  if (!reply) {
    await bot.sendMessage(chatId, `😔 Помилка. Спробуй ще раз.`, inlineKb([[{ text: '🔄 Повторити', data: 'retry' }]]));
    return;
  }

  let recs = [];
  try {
    const match = reply.match(/\[[\s\S]*\]/);
    if (match) recs = JSON.parse(match[0]);
  } catch(e) { console.log('Parse error:', e.message); }

  if (!recs.length) {
    await bot.sendMessage(chatId, `😔 Помилка. Спробуй ще раз.`, inlineKb([[{ text: '🔄 Повторити', data: 'retry' }]]));
    return;
  }

  recs = recs.map(r => {
    const venue = venues.find(v => v.name === r.place);
    // Шукаємо страву — спочатку точний збіг, потім часткове, потім перша страва з фото
    const dish = venue?.filteredMenu.find(d => d.name === r.dish)
      || venue?.filteredMenu.find(d =>
          d.name.toLowerCase().includes(r.dish.toLowerCase()) ||
          r.dish.toLowerCase().includes(d.name.toLowerCase())
        )
      || venue?.filteredMenu.find(d => d.photo) // перша страва з фото
      || venue?.filteredMenu[0];
    return { ...r, photo: enhanceCloudinaryPhoto(dish?.photo_cloud) || dish?.file_id || getFullPhotoUrl(dish?.photo) || null, lat: venue?.lat, lng: venue?.lng, address: venue?.address };
  });

  user.lastRecs = recs;
  user.searchCount = (user.searchCount || 0) + 1;

  for (let i = 0; i < Math.min(recs.length, 3); i++) {
    const r = recs[i];
    const emoji = getCuisineEmoji(r.dish);
    const reasonEmoji = r.reason?.toLowerCase().includes('trend') || r.reason?.toLowerCase().includes('популяр') ? '🔥' :
                        r.reason?.toLowerCase().includes('ідеально') ? '⭐' : '✨';

    const text = `${emoji} *${r.dish}*\n🏠 ${r.place}\n💰 ${r.price} грн  📍 ${r.distKm} км\n\n_${r.description}_\n\n${reasonEmoji} ${r.reason}`;

    await bot.sendMessage(chatId, text, {
      parse_mode: 'Markdown',
      ...inlineKb([[{ text: '🍴 Обрати', data: `pick_${i}` }, { text: '🔄 Інші варіанти', data: 'swap' }]])
    });
  }
}

// КОМАНДИ
bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  const user = getUser(chatId);
  user.step = null;
  user.session = {};
  await bot.sendMessage(chatId,
    `⚡ *Привіт! Я QuickPick*\n\nДопоможу швидко обрати де і що поїсти 🍴`,
    { parse_mode: 'Markdown', ...inlineKb([[{ text: '🚀 Почати', data: 'start_search' }]]) }
  );
});

bot.onText(/\/pick/, async (msg) => {
  const chatId = msg.chat.id;
  const user = getUser(chatId);
  user.session = {};
  user.step = 'location';
  await bot.sendMessage(chatId, `📍 *Поділись геолокацією*`, { parse_mode: 'Markdown', ...geoKb() });
});

bot.onText(/\/pro/, async (msg) => { await showPro(msg.chat.id); });

bot.onText(/\/saved/, async (msg) => {
  const user = getUser(msg.chat.id);
  if (!user.saved.length) { await bot.sendMessage(msg.chat.id, `❤️ Збережених страв поки немає.`); return; }
  const list = user.saved.map((s,i) => `${i+1}. *${s.dish}* — ${s.place}`).join('\n');
  await bot.sendMessage(msg.chat.id, `❤️ *Збережені:*\n\n${list}`, { parse_mode: 'Markdown' });
});

bot.onText(/\/history/, async (msg) => {
  const user = getUser(msg.chat.id);
  if (!user.history.length) { await bot.sendMessage(msg.chat.id, `📋 Історія порожня.`); return; }
  const list = user.history.slice(-8).reverse().map((h,i) =>
    `${i+1}. *${h.dish}* — ${h.place}\n📅 ${new Date(h.date).toLocaleDateString('uk-UA')}`
  ).join('\n\n');
  await bot.sendMessage(msg.chat.id, `📋 *Історія:*\n\n${list}`, { parse_mode: 'Markdown' });
});

bot.onText(/\/profile/, async (msg) => {
  const chatId = msg.chat.id; const user = getUser(chatId);
  const savedList = user.saved.length
    ? user.saved.slice(-5).map((s,i) => `${i+1}. ${s.dish} — ${s.place}`).join('\n')
    : 'Немає збережених';
  const historyList = user.history.length
    ? user.history.slice(-5).reverse().map((h,i) => `${i+1}. ${h.dish} — ${h.place}\n📅 ${new Date(h.date).toLocaleDateString('uk-UA')}`).join('\n')
    : 'Ще нічого не вибирав';
  const status = user.isPro ? '⭐ PRO' : '🆓 Безкоштовно';
  await bot.sendMessage(chatId,
    `👤 *Мій профіль*\n\nСтатус: ${status}\nПошуків: ${user.searchCount || 0}\n\n❤️ *Збережені (останні 5):*\n${savedList}\n\n📋 *Історія (останні 5):*\n${historyList}`,
    { parse_mode: 'Markdown', ...inlineKb([
      [{ text: '❤️ Всі збережені', data: 'all_saved' }, { text: '📋 Вся історія', data: 'all_history' }],
      [{ text: '🚫 Очистити збережені', data: 'clear_saved' }]
    ]) }
  );
});

bot.onText(/\/reset/, async (msg) => {
  const chatId = msg.chat.id;
  const user = getUser(chatId);
  user.session = {}; user.step = null; user.lastRecs = [];
  await bot.sendMessage(chatId, `🔄 Скинуто! Починаємо заново.`,
    inlineKb([[{ text: '🚀 Почати', data: 'start_search' }]]));
});

// ГЕОЛОКАЦІЯ
bot.on('location', async (msg) => {
  const chatId = msg.chat.id; const user = getUser(chatId);
  if (user.step !== 'location') return;
  user.session.lat = msg.location.latitude;
  user.session.lng = msg.location.longitude;
  user.step = 'cuisine';
  await bot.sendMessage(chatId, `🍽 *Що хочеться сьогодні?*`, {
    parse_mode: 'Markdown',
    ...kb([['🍝 Італійське', '🍜 Азія', '🍔 Фастфуд'], ['🍕 Піца', '☕ Кава та десерти', '🥩 Гриль'], ['👶 Дитяче', '🎲 Здивуй мене']])
  });
});

// ПОВІДОМЛЕННЯ
bot.on('message', async (msg) => {
  const chatId = msg.chat.id; const text = msg.text; const user = getUser(chatId);
  if (!text || text.startsWith('/')) return;

  if (user.step === 'cuisine') {
    user.session.cuisine = text; user.step = 'budget';
    await bot.sendMessage(chatId, `💰 *Який бюджет?*`, {
      parse_mode: 'Markdown',
      ...kb([['🟢 Бюджетно', '🟡 Середньо', '🔴 Дорожче']])
    });
  } else if (user.step === 'budget') {
    user.session.budget = text; user.step = null;
    await doSearch(chatId);
  } else {
    await bot.sendMessage(chatId, `Натисни /pick щоб знайти їжу 🍽`,
      inlineKb([[{ text: '🍽 Знайти їжу', data: 'start_search' }]]));
  }
});

// КНОПКИ
bot.on('callback_query', async (query) => {
  const chatId = query.message.chat.id; const user = getUser(chatId); const data = query.data;
  await bot.answerCallbackQuery(query.id);

  if (data === 'start_search') {
    user.session = {}; user.step = 'location';
    await bot.sendMessage(chatId, `📍 *Поділись геолокацією*`, { parse_mode: 'Markdown', ...geoKb() });

  } else if (data === 'retry') {
    if (!user.session.lat) {
      user.step = 'location';
      await bot.sendMessage(chatId, `📍 Поділись геолокацією`, geoKb());
      return;
    }
    await doSearch(chatId);

  } else if (data === 'swap') {
    if (!user.session.lat) {
      user.step = 'location';
      await bot.sendMessage(chatId, `📍 Поділись геолокацією`, geoKb());
      return;
    }
    await doSearch(chatId);

  } else if (data.startsWith('pick_')) {
    const idx = parseInt(data.split('_')[1]);
    if (!user.lastRecs) user.lastRecs = [];
    const rec = user.lastRecs[idx];
    if (!rec) {
      await bot.sendMessage(chatId, `⚡ Зроби новий пошук.`,
        inlineKb([[{ text: '🍽 Знайти їжу', data: 'start_search' }]]));
      return;
    }

    user.history.push({ dish: rec.dish, place: rec.place, date: Date.now() });

    await bot.sendMessage(chatId, `⚡ Готуємо деталі...`);

    const mapsUrl = rec.lat && rec.lng
      ? `https://www.google.com/maps/dir/?api=1&destination=${rec.lat},${rec.lng}`
      : `https://www.google.com/maps/search/${encodeURIComponent((rec.place || '') + ' ' + (rec.address || 'Київ'))}`;

    const emoji = getCuisineEmoji(rec.dish);
    const detailText = `✅ *Чудовий вибір!*\n\n${emoji} *${rec.dish}*\n🏠 ${rec.place}\n💰 ${rec.price} грн  📍 ${rec.distKm} км\n\n_${rec.description || ''}_\n\nСмачного 🍴`;

    const actionButtons = { reply_markup: { inline_keyboard: [
      [{ text: '📍 Маршрут', url: mapsUrl }, { text: '❤️ Зберегти', callback_data: `save_${idx}` }],
      [{ text: '🔄 Новий пошук', callback_data: 'new_search' }]
    ]}};

    if (rec.photo) {
      try {
        // Відправляємо як document — не збільшується при кліку
        await bot.sendPhoto(chatId, rec.photo, {
          caption: detailText,
          parse_mode: 'Markdown',
          ...actionButtons
        });
      } catch(e) {
        console.log('PHOTO ERROR:', e.message);
        await bot.sendMessage(chatId, detailText, { parse_mode: 'Markdown', ...actionButtons });
      }
    } else {
      await bot.sendMessage(chatId, detailText, { parse_mode: 'Markdown', ...actionButtons });
    }

    // PRO підказка після 2-3 використань
    if (!user.isPro && user.searchCount >= 2 && user.searchCount <= 3) {
      setTimeout(async () => {
        await bot.sendMessage(chatId,
          `💡 *Подобається QuickPick?*\n\nЗ PRO версією:\n∞ Безлімітні підбірки\n🧠 Персональні рекомендації\n❤️ Збережені місця\n📋 Історія`,
          { parse_mode: 'Markdown', ...inlineKb([
            [{ text: '⭐ Дізнатись про PRO', data: 'show_pro' }],
            [{ text: '🔄 Продовжити безкоштовно', data: 'new_search' }]
          ]) }
        );
      }, 1500);
    }

  } else if (data.startsWith('save_')) {
    const idx = parseInt(data.split('_')[1]);
    const rec = user.lastRecs?.[idx];
    if (rec) {
      if (!user.saved.find(s => s.dish === rec.dish && s.place === rec.place)) {
        user.saved.push({ dish: rec.dish, place: rec.place, address: rec.address, date: Date.now() });
        await bot.sendMessage(chatId, `❤️ *${rec.dish}* збережено!
🏠 ${rec.place}`, { parse_mode: 'Markdown' });
      } else {
        await bot.sendMessage(chatId, `Вже є в збережених!`);
      }
    }

  } else if (data === 'new_search') {
    const savedLat = user.session.lat; const savedLng = user.session.lng;
    user.session = {}; user.lastRecs = [];
    if (savedLat && savedLng) {
      // Геолокація вже є — пропускаємо цей крок
      user.session.lat = savedLat; user.session.lng = savedLng;
      user.step = 'cuisine';
      await bot.sendMessage(chatId, `🍽 *Що хочеться сьогодні?*`, {
        parse_mode: 'Markdown',
        ...kb([['🍝 Італійське', '🍜 Азія', '🍔 Фастфуд'], ['🍕 Піца', '☕ Кава та десерти', '🥩 Гриль'], ['👶 Дитяче', '🎲 Здивуй мене']])
      });
    } else {
      user.step = 'location';
      await bot.sendMessage(chatId, `📍 *Поділись геолокацією*`, { parse_mode: 'Markdown', ...geoKb() });
    }

  } else if (data === 'reset') {
    user.session = {}; user.step = null; user.lastRecs = [];
    await bot.sendMessage(chatId, `🔄 Скинуто!`,
      inlineKb([[{ text: '🚀 Почати', data: 'start_search' }]]));

  } else if (data === 'show_pro' || data === 'pro') {
    await showPro(chatId);

  } else if (data === 'show_pro_full') {
    await bot.sendMessage(chatId,
      `⭐ *QuickPick PRO — повний опис*\n\n∞ *Безлімітні підбірки* — шукай скільки хочеш\n🧠 *Персональні рекомендації* — бот запам'ятовує твої смаки\n🍷 *AI-підбір напоїв* — ідеальна пара до страви\n🔁 *Повтор минулих виборів* — одна кнопка\n🔥 *Trending nearby* — що зараз популярне поруч\n💪 *Калорії та БЖУ* — контроль харчування\n❤️ *Збережені місця* — твій список улюблених\n📋 *Історія* — всі твої вибори\n\n💰 *500 зірок / місяць (~$5)*`,
      { parse_mode: 'Markdown', ...inlineKb([
        [{ text: '🔓 Активувати PRO', data: 'pay' }],
        [{ text: '↩️ Назад', data: 'new_search' }]
      ]) }
    );

  } else if (data === 'pay') {
    await bot.sendMessage(chatId, `⭐ Оплата активується найближчим часом.\n\nНапиши: @quickpick_support`);

  } else if (data === 'all_saved') {
    if (!user.saved.length) { await bot.sendMessage(chatId, `❤️ Збережених немає.`); return; }
    const list = user.saved.map((s,i) => `${i+1}. *${s.dish}* — ${s.place}`).join('\n');
    await bot.sendMessage(chatId, `❤️ *Всі збережені:*\n\n${list}`, { parse_mode: 'Markdown',
      ...inlineKb([[{ text: '🚫 Очистити', data: 'clear_saved' }]]) });

  } else if (data === 'all_history') {
    if (!user.history.length) { await bot.sendMessage(chatId, `📋 Історія порожня.`); return; }
    const list = user.history.slice(-10).reverse().map((h,i) =>
      `${i+1}. *${h.dish}* — ${h.place}\n📅 ${new Date(h.date).toLocaleDateString('uk-UA')}`
    ).join('\n\n');
    await bot.sendMessage(chatId, `📋 *Вся історія:*\n\n${list}`, { parse_mode: 'Markdown' });

  } else if (data === 'clear_saved') {
    user.saved = [];
    await bot.sendMessage(chatId, `✅ Збережені очищено.`);
  }
});

async function showPro(chatId) {
  await bot.sendMessage(chatId,
    `⭐ *QuickPick PRO*\n\n∞ Безлімітні підбірки\n🧠 Персональні рекомендації\n❤️ Збережені місця\n📋 Історія виборів\n🔥 Trending nearby\n💪 Калорії та БЖУ\n\n💰 *500 зірок / місяць (~$5)*`,
    { parse_mode: 'Markdown', ...inlineKb([
      [{ text: '🔓 Активувати PRO', data: 'pay' }],
      [{ text: '📖 Детальніше', data: 'show_pro_full' }]
    ]) }
  );
}

console.log('⚡ QuickPick v10 запущено!');
