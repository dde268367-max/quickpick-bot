const { getUser } = require('../users');
const { kb, inlineKb } = require('../utils');
const { BUDGET_BUTTONS, CUISINE_BUTTONS } = require('../config');
const { doSearch } = require('../search');
const { randomIntro } = require('./location');

function registerMessages(bot) {
  bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;
    const user = await getUser(chatId);

    if (!text || text.startsWith('/')) return;

    if (user.step === 'cuisine') {
      user.session.cuisine = text;
      user.step = 'budget';
      await bot.sendMessage(chatId, `💰 *Який бюджет?*`, {
        parse_mode: 'Markdown',
        ...kb([...BUDGET_BUTTONS, ['↩️ Назад']]),
      });

    } else if (user.step === 'budget') {
      if (text === '↩️ Назад') {
        user.step = 'cuisine';
        await bot.sendMessage(chatId, `*${randomIntro()}*`, {
          parse_mode: 'Markdown',
          ...kb(CUISINE_BUTTONS),
        });
        return;
      }
      user.session.budget = text;
      user.step = null;
      await doSearch(bot, chatId, false);

    } else {
      await bot.sendMessage(chatId, `Натисни /pick щоб знайти їжу 🍽`,
        inlineKb([[{ text: '🍽 Знайти їжу', data: 'start_search' }]]));
    }
  });
}

module.exports = { registerMessages };
