const { getUser } = require('../users');
const { kb } = require('../utils');
const { CUISINE_BUTTONS } = require('../config');

function registerLocation(bot) {
  bot.on('location', async (msg) => {
    const chatId = msg.chat.id;
    const user = getUser(chatId);

    if (user.step !== 'location') return;

    user.session.lat = msg.location.latitude;
    user.session.lng = msg.location.longitude;
    user.step = 'cuisine';

    await bot.sendMessage(chatId, `🍽 *Що хочеться сьогодні?*`, {
      parse_mode: 'Markdown',
      ...kb(CUISINE_BUTTONS),
    });
  });
}

module.exports = { registerLocation };
