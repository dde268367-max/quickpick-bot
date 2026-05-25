const { getUser } = require('../users');
const { getCuisineEmoji, inlineKb, geoKb, kb } = require('../utils');
const { doSearch } = require('../search');
const { showPro } = require('./commands');
const { CUISINE_BUTTONS } = require('../config');

function registerButtons(bot) {
  bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    const user = getUser(chatId);
    const data = query.data;

    await bot.answerCallbackQuery(query.id);

    // --- Новий пошук ---
    if (data === 'start_search') {
      user.session = {}; user.step = 'location';
      await bot.sendMessage(chatId, `📍 *Поділись геолокацією*`, { parse_mode: 'Markdown', ...geoKb() });

    // --- Повторити / Інші варіанти ---
    } else if (data === 'retry' || data === 'swap') {
      if (!user.session.lat) {
        user.step = 'location';
        await bot.sendMessage(chatId, `📍 Поділись геолокацією`, geoKb());
        return;
      }
      await doSearch(bot, chatId);

    // --- Обрати страву ---
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
      const detailText = `✅ *Чудовий вибір!*\n\n${emoji} *${rec.dish}*\n🏠 ${rec.place}\n💰 ${rec.price} грн  📍 ${rec.distKm} км\n\n_${rec.description || ''}_\n\nСмачного 🍴`;

      const actionButtons = {
        reply_markup: {
          inline_keyboard: [
            [{ text: '📍 Маршрут', url: mapsUrl }, { text: '❤️ Зберегти', callback_data: `save_${idx}` }],
            [{ text: '🔄 Новий пошук', callback_data: 'new_search' }],
          ]
        }
      };

      if (rec.photo) {
        try {
          await bot.sendPhoto(chatId, rec.photo, { caption: detailText, parse_mode: 'Markdown', ...actionButtons });
        } catch (e) {
          console.error('[pick] PHOTO ERROR:', e.message);
          await bot.sendMessage(chatId, detailText, { parse_mode: 'Markdown', ...actionButtons });
        }
      } else {
        await bot.sendMessage(chatId, detailText, { parse_mode: 'Markdown', ...actionButtons });
      }

      // PRO підказка після 2-3 пошуків
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

    // --- Зберегти страву ---
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

    // --- Новий пошук зі збереженою геолокацією ---
    } else if (data === 'new_search') {
      const savedLat = user.session.lat;
      const savedLng = user.session.lng;
      user.session = {}; user.lastRecs = [];
      if (savedLat && savedLng) {
        user.session.lat = savedLat; user.session.lng = savedLng;
        user.step = 'cuisine';
        await bot.sendMessage(chatId, `🍽 *Що хочеться сьогодні?*`, {
          parse_mode: 'Markdown',
          ...kb(CUISINE_BUTTONS),
        });
      } else {
        user.step = 'location';
        await bot.sendMessage(chatId, `📍 *Поділись геолокацією*`, { parse_mode: 'Markdown', ...geoKb() });
      }

    // --- Скинути ---
    } else if (data === 'reset') {
      user.session = {}; user.step = null; user.lastRecs = [];
      await bot.sendMessage(chatId, `🔄 Скинуто!`,
        inlineKb([[{ text: '🚀 Почати', data: 'start_search' }]]));

    // --- PRO ---
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
    }
  });
}

module.exports = { registerButtons };
