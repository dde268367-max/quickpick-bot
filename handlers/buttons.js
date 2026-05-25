const { getUser } = require('../users');
const { getCuisineEmoji, inlineKb, geoKb, kb } = require('../utils');
const { doSearch } = require('../search');
const { showPro } = require('./commands');
const { CUISINE_BUTTONS, KYIV_DISTRICTS, KYIV_OBLAST_CITIES } = require('../config');

function registerButtons(bot) {
  bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    const user = getUser(chatId);
    const data = query.data;

    // location.js також слухає callback_query — пропускаємо його події тут
    if (['manual_location','city_kyiv','city_oblast'].includes(data) ||
        data.startsWith('district_') || data.startsWith('oblast_')) return;

    await bot.answerCallbackQuery(query.id);

    if (data === 'start_search') {
      user.session = {}; user.step = 'location';
      await bot.sendMessage(chatId,
        `📍 *Поділись геолокацією або обери район вручну*`,
        {
          parse_mode: 'Markdown',
          reply_markup: {
            keyboard: [[{ text: '📍 Поділитись геолокацією', request_location: true }]],
            resize_keyboard: true,
            one_time_keyboard: true,
          }
        }
      );
      // Через секунду показуємо inline-кнопку для ручного вибору
      setTimeout(async () => {
        await bot.sendMessage(chatId, `або`,
          inlineKb([[{ text: '🗺 Обрати район вручну', data: 'manual_location' }]]));
      }, 500);

    } else if (data === 'manual_location') {
      await bot.sendMessage(chatId, `📍 Обери місто:`,
        inlineKb([
          [{ text: '🏙 Київ', data: 'city_kyiv' }, { text: '🌳 Київська область', data: 'city_oblast' }]
        ])
      );

    } else if (data === 'city_kyiv') {
      const rows = [];
      for (let i = 0; i < KYIV_DISTRICTS.length; i += 2) {
        const row = [{ text: KYIV_DISTRICTS[i].name, data: `district_${i}` }];
        if (KYIV_DISTRICTS[i+1]) row.push({ text: KYIV_DISTRICTS[i+1].name, data: `district_${i+1}` });
        rows.push(row);
      }
      await bot.sendMessage(chatId, `🏙 Обери район Києва:`, inlineKb(rows));

    } else if (data === 'city_oblast') {
      const rows = KYIV_OBLAST_CITIES.map((c, i) => [{ text: c.name, data: `oblast_${i}` }]);
      await bot.sendMessage(chatId, `🌳 Обери місто:`, inlineKb(rows));

    } else if (data.startsWith('district_')) {
      const idx = parseInt(data.split('_')[1]);
      const district = KYIV_DISTRICTS[idx];
      user.session.lat = district.lat;
      user.session.lng = district.lng;
      user.step = 'cuisine';
      await bot.sendMessage(chatId, `😋 *Ну що, чого хочеться?*`, {
        parse_mode: 'Markdown',
        ...kb(CUISINE_BUTTONS),
      });

    } else if (data.startsWith('oblast_')) {
      const idx = parseInt(data.split('_')[1]);
      const city = KYIV_OBLAST_CITIES[idx];
      user.session.lat = city.lat;
      user.session.lng = city.lng;
      user.step = 'cuisine';
      await bot.sendMessage(chatId, `😋 *Ну що, чого хочеться?*`, {
        parse_mode: 'Markdown',
        ...kb(CUISINE_BUTTONS),
      });

    } else if (data === 'retry') {
      if (!user.session.lat) {
        await bot.sendMessage(chatId, `📍 Обери район:`,
          inlineKb([[{ text: '🗺 Обрати район вручну', data: 'manual_location' }]]));
        return;
      }
      await doSearch(bot, chatId, false);

    } else if (data === 'swap') {
      if (!user.session.lat) {
        await bot.sendMessage(chatId, `📍 Обери район:`,
          inlineKb([[{ text: '🗺 Обрати район вручну', data: 'manual_location' }]]));
        return;
      }
      await doSearch(bot, chatId, true);

    } else if (data === 'kids_filter') {
      if (!user.session.lat) return;
      await doSearch(bot, chatId, false, true); // isKids = true

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

      const actionButtons = {
        reply_markup: {
          inline_keyboard: [
            [{ text: '🗺 Маршрут', url: mapsUrl }, { text: '❤️ Зберегти', callback_data: `save_${idx}` }],
            [{ text: '🔍 Шукати знову', callback_data: 'new_search' }],
          ]
        }
      };

      await bot.sendMessage(chatId, detailText, { parse_mode: 'Markdown', ...actionButtons });

      if (!user.isPro && user.searchCount >= 2 && user.searchCount <= 3) {
        setTimeout(async () => {
          await bot.sendMessage(chatId,
            `💡 *Подобається QuickPick?*\n\nЗ PRO:\n∞ Безлімітні підбірки\n🧠 Персональні рекомендації\n❤️ Збережені місця`,
            { parse_mode: 'Markdown', ...inlineKb([
              [{ text: '⭐ Дізнатись про PRO', data: 'show_pro' }],
              [{ text: '🔄 Продовжити безкоштовно', data: 'new_search' }],
            ]) }
          );
        }, 1500);
      }

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
        await bot.sendMessage(chatId, `😋 *Ну що, чого хочеться?*`, {
          parse_mode: 'Markdown',
          ...kb(CUISINE_BUTTONS),
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
      await showPro(bot, chatId);

    } else if (data === 'show_pro_full') {
      await bot.sendMessage(chatId,
        `⭐ *QuickPick PRO — повний опис*\n\n∞ *Безлімітні підбірки*\n🧠 *Персональні рекомендації*\n🍷 *AI-підбір напоїв*\n🔥 *Trending nearby*\n💪 *Калорії та БЖУ*\n❤️ *Збережені місця*\n📋 *Історія*\n\n💰 *500 зірок / місяць (~$5)*`,
        { parse_mode: 'Markdown', ...inlineKb([
          [{ text: '🔓 Активувати PRO', data: 'pay' }],
          [{ text: '↩️ Назад', data: 'new_search' }],
        ]) }
      );

    } else if (data === 'pay') {
      await bot.sendMessage(chatId, `⭐ Оплата активується найближчим часом.\n\nНапиши: @quickpick_support`);

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
    }
  });
}

module.exports = { registerButtons };
