const { getUser } = require('../users');
const { getCuisineEmoji, inlineKb, geoKb, kb } = require('../utils');
const { doSearch } = require('../search');
const { showPro } = require('./commands');
const { CUISINE_BUTTONS, BUDGET_BUTTONS } = require('../config');
const {
  handleManualLocation, handleCityKyiv, handleCityOblast,
  handleDistrict, handleOblastCity, randomIntro
} = require('./location');

function registerButtons(bot) {
  bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    const user = getUser(chatId);
    const data = query.data;

    await bot.answerCallbackQuery(query.id);

    // --- Старт ---
    if (data === 'start_search') {
      user.session = {}; user.step = 'location';
      await bot.sendMessage(chatId, `📍 *Як шукаємо?*`, {
        parse_mode: 'Markdown',
        ...inlineKb([
          [{ text: '📍 Поділитися геолокацією', data: 'request_geo' }],
          [{ text: '🏙 Обрати район самостійно', data: 'manual_location' }],
        ])
      });

    } else if (data === 'request_geo') {
      await bot.sendMessage(chatId, `📍 Натисни кнопку нижче`, { ...geoKb() });

    // --- Ручний вибір ---
    } else if (data === 'manual_location') {
      await handleManualLocation(bot, chatId);

    } else if (data === 'city_kyiv') {
      await handleCityKyiv(bot, chatId);

    } else if (data === 'city_oblast') {
      await handleCityOblast(bot, chatId);

    } else if (data.startsWith('district_')) {
      const idx = parseInt(data.split('_')[1]);
      await handleDistrict(bot, chatId, user, idx);

    } else if (data.startsWith('oblast_')) {
      const idx = parseInt(data.split('_')[1]);
      await handleOblastCity(bot, chatId, user, idx);

    // --- Пошук ---
    } else if (data === 'retry') {
      if (!user.session.lat) { await handleManualLocation(bot, chatId); return; }
      await doSearch(bot, chatId, false);

    } else if (data === 'swap') {
      if (!user.session.lat) { await handleManualLocation(bot, chatId); return; }
      await doSearch(bot, chatId, true);

    } else if (data === 'search_extended') {
      if (!user.session.lat) { await handleManualLocation(bot, chatId); return; }
      await doSearch(bot, chatId, false, false, true);

    } else if (data === 'kids_filter') {
      if (!user.session.lat) return;
      await doSearch(bot, chatId, false, true);

    // --- Назад ---
    } else if (data === 'back_to_cuisine') {
      user.step = 'cuisine';
      await bot.sendMessage(chatId, `*${randomIntro()}*`, {
        parse_mode: 'Markdown',
        ...kb(CUISINE_BUTTONS),
      });

    } else if (data === 'back_to_budget') {
      user.step = 'budget';
      await bot.sendMessage(chatId, `💰 *Який бюджет?*`, {
        parse_mode: 'Markdown',
        ...kb([...BUDGET_BUTTONS, ['↩️ Назад']]),
      });

    // --- Вибір страви ---
    } else if (data.startsWith('pick_')) {
      const idx = parseInt(data.split('_')[1]);
      const rec = user.lastRecs?.[idx];

      if (!rec) {
        await bot.sendMessage(chatId, `⚡ Зроби новий пошук.`,
          inlineKb([[{ text: '🍽 Знайти їжу', data: 'start_search' }]]));
        return;
      }

      user.history.push({ dish: rec.dish, place: rec.place, date: Date.now() });

      const mapsUrl = rec.lat && rec.lng
        ? `https://www.google.com/maps/dir/?api=1&destination=${rec.lat},${rec.lng}`
        : `https://www.google.com/maps/search/${encodeURIComponent((rec.place || '') + ' ' + (rec.address || 'Київ'))}`;

      const emoji = getCuisineEmoji(rec.dish);
      const detailText = `✅ *Чудовий вибір!*\n\n${emoji} *${rec.dish}*\n🏠 ${rec.place}\n💰 ${rec.price} грн  •  📍 ${rec.distKm} км\n\n_${rec.description || ''}_\n\nСмачного! 🍴`;

      await bot.sendMessage(chatId, detailText, {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '📍 Маршрут', url: mapsUrl }, { text: '❤️ Зберегти', callback_data: `save_${idx}` }],
            [{ text: '🔄 Новий пошук', callback_data: 'new_search' }],
          ]
        }
      });

    } else if (data.startsWith('save_')) {
      const idx = parseInt(data.split('_')[1]);
      const rec = user.lastRecs?.[idx];
      if (!rec) return;
      if (user.saved.find(s => s.dish === rec.dish && s.place === rec.place)) {
        await bot.sendMessage(chatId, `Вже є в збережених!`);
      } else {
        user.saved.push({ dish: rec.dish, place: rec.place, address: rec.address, date: Date.now() });
        await bot.sendMessage(chatId, `❤️ *${rec.dish}* збережено!\n🏠 ${rec.place}`, { parse_mode: 'Markdown' });
      }

    } else if (data === 'new_search') {
      const savedLat = user.session.lat;
      const savedLng = user.session.lng;
      user.session = {}; user.lastRecs = [];
      if (savedLat && savedLng) {
        user.session.lat = savedLat; user.session.lng = savedLng;
        user.step = 'cuisine';
        await bot.sendMessage(chatId, `*${randomIntro()}*`, {
          parse_mode: 'Markdown',
          ...kb(CUISINE_BUTTONS),
        });
      } else {
        user.step = 'location';
        await bot.sendMessage(chatId, `📍 *Як шукаємо?*`, {
          parse_mode: 'Markdown',
          ...inlineKb([
            [{ text: '📍 Поділитися геолокацією', data: 'request_geo' }],
            [{ text: '🏙 Обрати район самостійно', data: 'manual_location' }],
          ])
        });
      }

    // --- PRO ---
    } else if (data === 'show_pro') {
      await bot.sendMessage(chatId,
        `⭐ *QuickPick PRO*\n\n🧠 AI запамʼятовує твої смаки\n🔥 Що зараз популярне поруч\n🍷 Ідеальний напій до страви\n💪 Калорії та БЖУ\n❤️ Власна колекція місць\n∞ Безлімітні підбірки\n\n💰 *500 зірок / місяць (~10$)*`,
        { parse_mode: 'Markdown', ...inlineKb([
          [{ text: '🔓 Спробувати PRO', data: 'pay' }],
          [{ text: '😋 Пізніше', data: 'pro_later' }],
        ]) }
      );

    } else if (data === 'pro_later') {
      await bot.sendMessage(chatId, `😊 Добре, повернемось до цього пізніше!`);

    } else if (data === 'pay') {
      await bot.sendMessage(chatId, `⭐ Оплата активується найближчим часом.\n\nНапиши: @quickpick_support`);

    // --- Профіль ---
    } else if (data === 'all_saved') {
      if (!user.saved.length) { await bot.sendMessage(chatId, `❤️ Збережених немає.`); return; }
      const list = user.saved.map((s, i) => `${i + 1}. *${s.dish}* — ${s.place}`).join('\n');
      await bot.sendMessage(chatId, `❤️ *Всі збережені:*\n\n${list}`, {
        parse_mode: 'Markdown',
        ...inlineKb([[{ text: '🚫 Очистити', data: 'clear_saved' }]]),
      });

    } else if (data === 'all_history') {
      if (!user.history.length) { await bot.sendMessage(chatId, `📋 Історія порожня.`); return; }
      const list = user.history.slice(-10).reverse().map((h, i) =>
        `${i + 1}. *${h.dish}* — ${h.place}\n📅 ${new Date(h.date).toLocaleDateString('uk-UA')}`
      ).join('\n\n');
      await bot.sendMessage(chatId, `📋 *Вся історія:*\n\n${list}`, { parse_mode: 'Markdown' });

    } else if (data === 'clear_saved') {
      user.saved = [];
      await bot.sendMessage(chatId, `✅ Збережені очищено.`);

    } else if (data === 'reset') {
      user.session = {}; user.step = null; user.lastRecs = [];
      await bot.sendMessage(chatId, `🔄 Скинуто!`,
        inlineKb([[{ text: '🚀 Почати', data: 'start_search' }]]));
    }
  });
}

module.exports = { registerButtons };
