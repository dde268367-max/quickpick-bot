const { getUser, activateTrial, getProStatus } = require('../users');
const { getCuisineEmoji, inlineKb, geoKb, kb } = require('../utils');
const { doSearch, sendRecs, getCalories, getPairRec } = require('../search');
const { showPro } = require('./commands');
const { CUISINE_BUTTONS, BUDGET_BUTTONS } = require('../config');
const { handleManualLocation, handleCityKyiv, handleCityOblast, handleDistrict, handleOblastCity, randomIntro } = require('./location');
const { track, identify } = require('../analytics');

// Кнопки під карткою рекомендації (під кожною стравою)
function recButtons(i, isLast) {
  if (!isLast) {
    return inlineKb([
      [{ text: '🍴 Хочу це', data: `pick_${i}` }],
      [{ text: '🔄 Інші варіанти', data: 'swap' }, { text: '🍽 Змінити кухню', data: 'back_to_cuisine' }],
      [{ text: '📍 Змінити район', data: 'change_district' }, { text: '↩️ Спочатку', data: 'start_search' }],
    ]);
  } else {
    return inlineKb([
      [{ text: '🍴 Хочу це', data: `pick_${i}` }, { text: '🔄 Інші варіанти', data: 'swap' }],
      [{ text: '🍽 Змінити кухню', data: 'back_to_cuisine' }, { text: '👶 Дитячі', data: 'kids_filter' }],
      [{ text: '📍 Змінити район', data: 'change_district' }, { text: '↩️ Спочатку', data: 'start_search' }],
    ]);
  }
}

function registerButtons(bot) {
  bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    const user = await getUser(chatId);
    const data = query.data;

    await bot.answerCallbackQuery(query.id);

    // Повідомлення про закінчення PRO
    if (!user.isPro && user.proExpiresAt && !user.proExpiredNotified && user.hasUsedTrial) {
      user.proExpiredNotified = true;
      await bot.sendMessage(chatId,
        `⭐ Твій PRO-доступ завершився.\n\nДякуємо що тестував QuickPick PRO ❤️`,
        inlineKb([[{ text: '🔓 Відновити PRO', data: 'show_pro' }]])
      );
    }

    if (data === 'start_search') {
      track(chatId, 'start_search', { is_pro: user.isPro });
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

    } else if (data === 'manual_location') {
      await handleManualLocation(bot, chatId);
    } else if (data === 'city_kyiv') {
      await handleCityKyiv(bot, chatId);
    } else if (data === 'city_oblast') {
      await handleCityOblast(bot, chatId);
    } else if (data.startsWith('district_')) {
      await handleDistrict(bot, chatId, user, parseInt(data.split('_')[1]));
    } else if (data.startsWith('oblast_')) {
      await handleOblastCity(bot, chatId, user, parseInt(data.split('_')[1]));

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

    } else if (data === 'back_to_cuisine') {
      // Зберігаємо локацію, тільки скидаємо кухню/бюджет
      const { lat, lng, districtName, isManualDistrict } = user.session;
      user.session = { lat, lng, districtName, isManualDistrict };
      user.step = 'cuisine';
      await bot.sendMessage(chatId, `*${randomIntro()}*`, {
        parse_mode: 'Markdown', ...kb(CUISINE_BUTTONS),
      });

    } else if (data === 'back_to_budget') {
      user.step = 'budget';
      await bot.sendMessage(chatId, `💰 *Який бюджет?*`, {
        parse_mode: 'Markdown', ...kb([...BUDGET_BUTTONS, ['↩️ Назад']]),
      });

    } else if (data === 'repeat_last') {
      const last = user.history[user.history.length - 1];
      if (!last) return;
      await bot.sendMessage(chatId,
        `✅ *${last.dish}* у *${last.place}* — чудовий вибір!`,
        { parse_mode: 'Markdown', ...inlineKb([
          [{ text: '🔄 Новий пошук', data: 'new_search' }, { text: '📍 Змінити район', data: 'change_district' }],
        ]) }
      );

    } else if (data === 'skip_repeat') {
      const pendingRecs = user.session.pendingRecs;
      if (pendingRecs) {
        delete user.session.pendingRecs;
        await sendRecs(bot, chatId, user, pendingRecs, user.isPro);
      }

    } else if (data === 'surprise_me') {
      user.session.cuisine = '🎲 Обери за мене';
      user.session.budget = user.session.budget || '🥲 Сьогодні економимо';
      if (!user.session.lat) { await handleManualLocation(bot, chatId); return; }
      await doSearch(bot, chatId, false);

    } else if (data.startsWith('pick_')) {
      const idx = parseInt(data.split('_')[1]);
      const rec = user.lastRecs?.[idx];
      if (!rec) {
        await bot.sendMessage(chatId, `⚡ Зроби новий пошук.`,
          inlineKb([[{ text: '🍽 Знайти їжу', data: 'start_search' }]]));
        return;
      }

      user.history.push({ dish: rec.dish, place: rec.place, date: Date.now() });
      if (!user.topDishes) user.topDishes = [];
      user.topDishes.push(rec.dish);
      const { scheduleSave } = require('../users');
      scheduleSave(String(chatId));

      track(chatId, 'dish_picked', {
        dish: rec.dish,
        place: rec.place,
        price: rec.price,
        cuisine: user.session?.cuisine,
        is_pro: user.isPro,
        is_gem: rec.isGem || false,
      });

      const mapsUrl = rec.lat && rec.lng
        ? `https://www.google.com/maps/dir/?api=1&destination=${rec.lat},${rec.lng}`
        : `https://www.google.com/maps/search/${encodeURIComponent((rec.place || '') + ' Київ')}`;

      const emoji = getCuisineEmoji(rec.dish);
      const proStatus = getProStatus(user);
      const proLine = proStatus ? `\n⭐ _PRO ACTIVE · До ${proStatus.expiresDate}_` : '';
      const gemLine = rec.isGem ? '\n👀 _Hidden gem — місце, яке варто відкрити_' : '';

      const detailText = `✅ *Чудовий вибір!*\n\n${emoji} *${rec.dish}*\n🏠 ${rec.place}\n💰 ${rec.price} грн  •  📍 ${rec.distText}${gemLine}\n\n_${rec.description || ''}_\n\nСмачного! 🍴${proLine}`;

      const actionButtons = [
        [{ text: '📍 Маршрут', url: mapsUrl }, { text: '❤️ Зберегти', callback_data: `save_${idx}` }],
        [{ text: '🔄 Новий пошук', callback_data: 'new_search' }, { text: '📍 Змінити район', callback_data: 'change_district' }],
        [{ text: '🍽 Змінити кухню', callback_data: 'back_to_cuisine' }, { text: '👤 Профіль', callback_data: 'show_profile' }],
      ];

      if (user.isPro) {
        actionButtons.splice(1, 0, [{ text: '🍷 Що до цього підійде?', callback_data: `pair_${idx}` }]);
        actionButtons.push([{ text: '💪 Калорії та БЖУ', callback_data: `calories_${idx}` }]);
      }

      await bot.sendMessage(chatId, detailText, {
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: actionButtons }
      });

    } else if (data.startsWith('pair_')) {
      if (!user.isPro) { await bot.sendMessage(chatId, `⭐ Ця функція доступна у PRO`); return; }
      const idx = parseInt(data.split('_')[1]);
      const rec = user.lastRecs?.[idx];
      if (!rec) return;
      await bot.sendMessage(chatId, `🍷 Шукаю ідеальну пару...`);
      const { realMenu } = require('../menu');
      const venueKey = Object.keys(realMenu).find(k => realMenu[k].name === rec.place);
      const venueMenu = venueKey ? realMenu[venueKey].menu : [];
      const pair = await getPairRec(rec.dish, venueMenu);
      if (pair) {
        await bot.sendMessage(chatId, `🍷 До *${rec.dish}* ідеально підійде:\n\n*${pair.pair}*\n_${pair.reason}_`, { parse_mode: 'Markdown' });
      } else {
        await bot.sendMessage(chatId, `😔 Не вдалось підібрати пару. Спробуй пізніше.`);
      }

    } else if (data.startsWith('calories_')) {
      if (!user.isPro) { await bot.sendMessage(chatId, `⭐ Ця функція доступна у PRO`); return; }
      const idx = parseInt(data.split('_')[1]);
      const rec = user.lastRecs?.[idx];
      if (!rec) return;
      await bot.sendMessage(chatId, `💪 Рахую калорії...`);
      const cal = await getCalories(rec.dish, rec.place);
      if (cal) {
        await bot.sendMessage(chatId,
          `💪 *${rec.dish}*\n\n~${cal.kcal} ккал\nБілки: ${cal.protein}г  •  Жири: ${cal.fat}г  •  Вуглеводи: ${cal.carbs}г\n\n_Приблизні дані_`,
          { parse_mode: 'Markdown' }
        );
      } else {
        await bot.sendMessage(chatId, `😔 Не вдалось порахувати. Спробуй пізніше.`);
      }

    } else if (data.startsWith('save_')) {
      const idx = parseInt(data.split('_')[1]);
      const rec = user.lastRecs?.[idx];
      if (!rec) return;
      if (user.saved.find(s => s.dish === rec.dish && s.place === rec.place)) {
        await bot.sendMessage(chatId, `Вже є в збережених!`);
      } else {
        user.saved.push({ dish: rec.dish, place: rec.place, address: rec.address, date: Date.now() });
        const { scheduleSave } = require('../users');
        scheduleSave(String(chatId));
        await bot.sendMessage(chatId, `❤️ *${rec.dish}* збережено!\n🏠 ${rec.place}`, { parse_mode: 'Markdown' });
      }

    } else if (data === 'new_search') {
      // Зберігаємо район — тільки скидаємо кухню/бюджет
      const { lat, lng, districtName, isManualDistrict } = user.session;
      user.lastRecs = [];
      if (lat && lng) {
        user.session = { lat, lng, districtName, isManualDistrict };
        user.step = 'cuisine';
        await bot.sendMessage(chatId, `*${randomIntro()}*`, {
          parse_mode: 'Markdown', ...kb(CUISINE_BUTTONS),
        });
      } else {
        user.session = {};
        user.step = 'location';
        await bot.sendMessage(chatId, `📍 *Як шукаємо?*`, {
          parse_mode: 'Markdown',
          ...inlineKb([
            [{ text: '📍 Поділитися геолокацією', data: 'request_geo' }],
            [{ text: '🏙 Обрати район самостійно', data: 'manual_location' }],
          ])
        });
      }

    } else if (data === 'change_district') {
      // Повністю скидаємо локацію — вибір з нуля
      user.session = {};
      user.step = 'location';
      await bot.sendMessage(chatId, `📍 *Як шукаємо?*`, {
        parse_mode: 'Markdown',
        ...inlineKb([
          [{ text: '📍 Поділитися геолокацією', data: 'request_geo' }],
          [{ text: '🏙 Обрати район самостійно', data: 'manual_location' }],
        ])
      });

    } else if (data === 'show_profile') {
      const proStatus = getProStatus(user);
      const status = proStatus
        ? `⭐ PRO ACTIVE · До ${proStatus.expiresDate}`
        : (user.hasUsedTrial ? '🆓 Базова версія' : '🆓 Безкоштовно');

      const { getTopCuisines, getTastePhrase } = require('../users');
      const topCuisines = getTopCuisines(user, 3);
      const cuisineStr = topCuisines.length ? topCuisines.join(', ') : 'Ще не визначились';
      const tastePhrase = getTastePhrase(user);
      const savedCount = user.saved.length;
      const searchCount = user.searchCount || 0;
      const lastHistory = user.history.slice(-3).reverse().map(h => `• *${h.dish}* — ${h.place}`).join('\n') || 'Поки нічого';

      let profileText = `👤 *Мій профіль*\n\n`;
      profileText += `⭐ Статус: ${status}\n`;
      profileText += `🔍 Пошуків: ${searchCount}  •  ❤️ Збережено: ${savedCount}\n`;
      if (topCuisines.length) profileText += `\n🍽 Улюблені кухні: ${cuisineStr}\n`;
      if (tastePhrase) profileText += `🎯 Твій смак: _${tastePhrase}_\n`;
      profileText += `\n📋 *Останні вибори:*\n${lastHistory}`;

      const profileButtons = [
        [{ text: '🔄 Новий пошук', callback_data: 'new_search' }, { text: '📍 Змінити район', callback_data: 'change_district' }],
        [{ text: '❤️ Збережені', callback_data: 'all_saved' }, { text: '📋 Вся історія', callback_data: 'all_history' }],
        [{ text: '🎲 Здивуй мене', callback_data: 'surprise_me' }],
      ];
      if (!user.isPro && !user.hasUsedTrial) {
        profileButtons.push([{ text: '⭐ Спробувати PRO', callback_data: 'activate_trial' }]);
      }

      await bot.sendMessage(chatId, profileText, {
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: profileButtons }
      });

    } else if (data === 'activate_trial') {
      const ok = await activateTrial(chatId);
      if (ok) {
        track(chatId, 'pro_activated', { source: 'trial' });
        identify(chatId, { is_pro: true, pro_started_at: new Date().toISOString() });
        const proStatus = getProStatus(user);
        await bot.sendMessage(chatId,
          `🎉 *QuickPick PRO активовано!*\n\n⭐ PRO ACTIVE · До ${proStatus.expiresDate}\n\n🧠 Персональні рекомендації — увімкнено\n🔥 Hidden gems — увімкнено\n🔁 Smart repeats — увімкнено\n🍷 Pair recommendations — увімкнено\n💪 Калорії та БЖУ — увімкнено\n\n❤️ Ти один із перших користувачів QuickPick`,
          { parse_mode: 'Markdown', ...inlineKb([[{ text: '🍽 Знайти їжу', data: 'start_search' }]]) }
        );
      } else {
        await bot.sendMessage(chatId, `Ти вже використав безкоштовний PRO-trial.\n\nНапиши @quickpick_support для відновлення.`);
      }

    } else if (data === 'show_pro') {
      await showPro(bot, chatId);

    } else if (data === 'pro_later') {
      await bot.sendMessage(chatId, `😊 Добре! Повернемось до цього пізніше.`,
        inlineKb([[{ text: '🔄 Новий пошук', data: 'new_search' }, { text: '❤️ Збережені', data: 'all_saved' }]])
      );

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
      const { scheduleSave } = require('../users');
      scheduleSave(String(chatId));
      await bot.sendMessage(chatId, `✅ Збережені очищено.`);

    } else if (data === 'reset') {
      user.session = {}; user.step = null; user.lastRecs = [];
      await bot.sendMessage(chatId, `🔄 Скинуто!`,
        inlineKb([[{ text: '🚀 Почати', data: 'start_search' }]]));
    }
  });
}

// Експортуємо recButtons для використання в search.js
module.exports = { registerButtons, recButtons };
