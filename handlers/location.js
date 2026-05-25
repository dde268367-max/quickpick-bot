const { getUser } = require('../users');
const { kb, inlineKb } = require('../utils');
const { CUISINE_BUTTONS, KYIV_DISTRICTS, KYIV_OBLAST_CITIES } = require('../config');

function registerLocation(bot) {

  // Геолокація від Telegram
  bot.on('location', async (msg) => {
    const chatId = msg.chat.id;
    const user = getUser(chatId);
    if (user.step !== 'location') return;

    user.session.lat = msg.location.latitude;
    user.session.lng = msg.location.longitude;
    user.step = 'cuisine';

    await bot.sendMessage(chatId, `😋 *Ну що, чого хочеться?*`, {
      parse_mode: 'Markdown',
      ...kb(CUISINE_BUTTONS),
    });
  });

  // Вибір Київ
  bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    const user = getUser(chatId);
    const data = query.data;

    if (data === 'manual_location') {
      await bot.answerCallbackQuery(query.id);
      await bot.sendMessage(chatId, `📍 Обери місто:`,
        inlineKb([
          [{ text: '🏙 Київ', data: 'city_kyiv' }, { text: '🌳 Київська область', data: 'city_oblast' }]
        ])
      );

    } else if (data === 'city_kyiv') {
      await bot.answerCallbackQuery(query.id);
      const rows = [];
      for (let i = 0; i < KYIV_DISTRICTS.length; i += 2) {
        const row = [{ text: KYIV_DISTRICTS[i].name, data: `district_${i}` }];
        if (KYIV_DISTRICTS[i+1]) row.push({ text: KYIV_DISTRICTS[i+1].name, data: `district_${i+1}` });
        rows.push(row);
      }
      await bot.sendMessage(chatId, `🏙 Обери район Києва:`, inlineKb(rows));

    } else if (data === 'city_oblast') {
      await bot.answerCallbackQuery(query.id);
      const rows = KYIV_OBLAST_CITIES.map((c, i) => [{ text: c.name, data: `oblast_${i}` }]);
      await bot.sendMessage(chatId, `🌳 Обери місто:`, inlineKb(rows));

    } else if (data.startsWith('district_')) {
      await bot.answerCallbackQuery(query.id);
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
      await bot.answerCallbackQuery(query.id);
      const idx = parseInt(data.split('_')[1]);
      const city = KYIV_OBLAST_CITIES[idx];
      user.session.lat = city.lat;
      user.session.lng = city.lng;
      user.step = 'cuisine';
      await bot.sendMessage(chatId, `😋 *Ну що, чого хочеться?*`, {
        parse_mode: 'Markdown',
        ...kb(CUISINE_BUTTONS),
      });
    }
  });
}

module.exports = { registerLocation };
