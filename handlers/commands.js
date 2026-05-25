const { getUser } = require('../users');
const { inlineKb, geoKb } = require('../utils');
const { realMenu } = require('../menu');

function registerCommands(bot) {

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

  bot.onText(/\/pro/, async (msg) => {
    await showPro(bot, msg.chat.id);
  });

  bot.onText(/\/saved/, async (msg) => {
    const user = getUser(msg.chat.id);
    if (!user.saved.length) {
      await bot.sendMessage(msg.chat.id, `❤️ Збережених страв поки немає.`);
      return;
    }
    const list = user.saved.map((s, i) => `${i + 1}. *${s.dish}* — ${s.place}`).join('\n');
    await bot.sendMessage(msg.chat.id, `❤️ *Збережені:*\n\n${list}`, { parse_mode: 'Markdown' });
  });

  bot.onText(/\/history/, async (msg) => {
    const user = getUser(msg.chat.id);
    if (!user.history.length) {
      await bot.sendMessage(msg.chat.id, `📋 Історія порожня.`);
      return;
    }
    const list = user.history.slice(-8).reverse().map((h, i) =>
      `${i + 1}. *${h.dish}* — ${h.place}\n📅 ${new Date(h.date).toLocaleDateString('uk-UA')}`
    ).join('\n\n');
    await bot.sendMessage(msg.chat.id, `📋 *Історія:*\n\n${list}`, { parse_mode: 'Markdown' });
  });

  bot.onText(/\/profile/, async (msg) => {
    const chatId = msg.chat.id;
    const user = getUser(chatId);
    const savedList = user.saved.length
      ? user.saved.slice(-5).map((s, i) => `${i + 1}. ${s.dish} — ${s.place}`).join('\n')
      : 'Немає збережених';
    const historyList = user.history.length
      ? user.history.slice(-5).reverse().map((h, i) =>
          `${i + 1}. ${h.dish} — ${h.place}\n📅 ${new Date(h.date).toLocaleDateString('uk-UA')}`
        ).join('\n')
      : 'Ще нічого не вибирав';
    const status = user.isPro ? '⭐ PRO' : '🆓 Безкоштовно';
    await bot.sendMessage(chatId,
      `👤 *Мій профіль*\n\nСтатус: ${status}\nПошуків: ${user.searchCount || 0}\n\n❤️ *Збережені (останні 5):*\n${savedList}\n\n📋 *Історія (останні 5):*\n${historyList}`,
      { parse_mode: 'Markdown', ...inlineKb([
        [{ text: '❤️ Всі збережені', data: 'all_saved' }, { text: '📋 Вся історія', data: 'all_history' }],
        [{ text: '🚫 Очистити збережені', data: 'clear_saved' }],
      ]) }
    );
  });

  // /find Назва — пошук заклаgу в базі
  bot.onText(/\/find (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const query = match[1].toLowerCase().trim();

    const found = Object.values(realMenu).filter(v =>
      v.name.toLowerCase().includes(query)
    );

    if (!found.length) {
      await bot.sendMessage(chatId, `❌ Заклад *${match[1]}* не знайдено в базі.`, { parse_mode: 'Markdown' });
      return;
    }

    for (const v of found.slice(0, 3)) {
      const dishes = v.menu.slice(0, 10).map(d => `• ${d.name} — ${d.price}₴`).join('\n');
      const coords = v.coords ? `\n📍 coords: [${v.coords[1]}, ${v.coords[0]}]` : '';
      const extra = v.menu.length > 10 ? `\n\n...та ще ${v.menu.length - 10} страв` : '';
      await bot.sendMessage(chatId,
        `✅ *${v.name}*${coords}\n\n${dishes}${extra}`,
        { parse_mode: 'Markdown' }
      );
    }
  });

  bot.onText(/\/reset/, async (msg) => {
    const chatId = msg.chat.id;
    const user = getUser(chatId);
    user.session = {}; user.step = null; user.lastRecs = [];
    await bot.sendMessage(chatId, `🔄 Скинуто! Починаємо заново.`,
      inlineKb([[{ text: '🚀 Почати', data: 'start_search' }]]));
  });
}

async function showPro(bot, chatId) {
  await bot.sendMessage(chatId,
    `⭐ *QuickPick PRO*\n\n∞ Безлімітні підбірки\n🧠 Персональні рекомендації\n❤️ Збережені місця\n📋 Історія виборів\n🔥 Trending nearby\n💪 Калорії та БЖУ\n\n💰 *500 зірок / місяць (~$5)*`,
    { parse_mode: 'Markdown', ...inlineKb([
      [{ text: '🔓 Активувати PRO', data: 'pay' }],
      [{ text: '📖 Детальніше', data: 'show_pro_full' }],
    ]) }
  );
}

module.exports = { registerCommands, showPro };
