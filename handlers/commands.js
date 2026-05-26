const { getUser, getProStatus, getTastePhrase, getTopCuisines } = require('../users');
const { inlineKb } = require('../utils');
const { realMenu } = require('../menu');

function registerCommands(bot) {

  bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;
    const user = getUser(chatId);
    user.step = null; user.session = {};
    await bot.sendMessage(chatId,
      `⚡ *Привіт! Я QuickPick*\n\nДопоможу швидко обрати де і що поїсти 🍴\n\n❤️ Ти один із перших користувачів QuickPick`,
      { parse_mode: 'Markdown', ...inlineKb([[{ text: '🚀 Почати', data: 'start_search' }]]) }
    );
  });

  bot.onText(/\/pick/, async (msg) => {
    const chatId = msg.chat.id;
    const user = getUser(chatId);
    user.session = {}; user.step = 'location';
    await bot.sendMessage(chatId, `📍 *Як шукаємо?*`, {
      parse_mode: 'Markdown',
      ...inlineKb([
        [{ text: '📍 Поділитися геолокацією', data: 'request_geo' }],
        [{ text: '🏙 Обрати район самостійно', data: 'manual_location' }],
      ])
    });
  });

  bot.onText(/\/pro/, async (msg) => { await showPro(bot, msg.chat.id); });

  bot.onText(/\/saved/, async (msg) => {
    const user = getUser(msg.chat.id);
    if (!user.saved.length) { await bot.sendMessage(msg.chat.id, `❤️ Збережених страв поки немає.`); return; }
    const list = user.saved.map((s, i) => `${i + 1}. *${s.dish}* — ${s.place}`).join('\n');
    await bot.sendMessage(msg.chat.id, `❤️ *Збережені:*\n\n${list}`, { parse_mode: 'Markdown' });
  });

  bot.onText(/\/history/, async (msg) => {
    const user = getUser(msg.chat.id);
    if (!user.history.length) { await bot.sendMessage(msg.chat.id, `📋 Історія порожня.`); return; }
    const list = user.history.slice(-8).reverse().map((h, i) =>
      `${i + 1}. *${h.dish}* — ${h.place}\n📅 ${new Date(h.date).toLocaleDateString('uk-UA')}`
    ).join('\n\n');
    await bot.sendMessage(msg.chat.id, `📋 *Історія:*\n\n${list}`, { parse_mode: 'Markdown' });
  });

  bot.onText(/\/profile/, async (msg) => {
    const chatId = msg.chat.id;
    const user = getUser(chatId);

    const proStatus = getProStatus(user);
    const status = proStatus
      ? `⭐ PRO ACTIVE · До ${proStatus.expiresDate}`
      : (user.isPro ? '⭐ PRO' : '🆓 Безкоштовно');

    const topCuisines = getTopCuisines(user, 3);
    const cuisineStr = topCuisines.length ? topCuisines.join(', ') : 'Ще не визначились';

    const tastePhrase = getTastePhrase(user);

    const savedCount = user.saved.length;
    const searchCount = user.searchCount || 0;

    const lastHistory = user.history.slice(-3).reverse().map(h =>
      `• *${h.dish}* — ${h.place}`
    ).join('\n') || 'Поки нічого';

    let profileText = `👤 *Мій профіль*\n\n`;
    profileText += `⭐ Статус: ${status}\n`;
    profileText += `🔍 Пошуків: ${searchCount}\n`;
    profileText += `❤️ Збережено: ${savedCount}\n\n`;
    if (topCuisines.length) profileText += `🍽 Улюблені кухні: ${cuisineStr}\n`;
    if (tastePhrase) profileText += `🎯 Твій смак: _${tastePhrase}_\n`;
    profileText += `\n📋 *Останні вибори:*\n${lastHistory}`;

    await bot.sendMessage(chatId, profileText, {
      parse_mode: 'Markdown',
      ...inlineKb([
        [{ text: '🔄 Новий пошук', data: 'start_search' }, { text: '❤️ Збережені', data: 'all_saved' }],
        [{ text: '📋 Вся історія', data: 'all_history' }, { text: '🎲 Здивуй мене', data: 'surprise_me' }],
      ])
    });
  });

  bot.onText(/\/find (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const query = match[1].toLowerCase().trim();
    const found = Object.values(realMenu).filter(v => v.name.toLowerCase().includes(query));
    if (!found.length) {
      await bot.sendMessage(chatId, `❌ *${match[1]}* не знайдено в базі.`, { parse_mode: 'Markdown' });
      return;
    }
    for (const v of found.slice(0, 3)) {
      const dishes = v.menu.slice(0, 10).map(d => `• ${d.name} — ${d.price}₴`).join('\n');
      const coords = v.coords && v.coords[0] && v.coords[1] ? `\n📍 [${v.coords[1]}, ${v.coords[0]}]` : '';
      const extra = v.menu.length > 10 ? `\n\n...та ще ${v.menu.length - 10} страв` : '';
      await bot.sendMessage(chatId, `✅ *${v.name}*${coords}\n\n${dishes}${extra}`, { parse_mode: 'Markdown' });
    }
  });

  bot.onText(/\/reset/, async (msg) => {
    const chatId = msg.chat.id;
    const user = getUser(chatId);
    user.session = {}; user.step = null; user.lastRecs = [];
    await bot.sendMessage(chatId, `🔄 Скинуто!`,
      inlineKb([[{ text: '🚀 Почати', data: 'start_search' }]]));
  });
}

async function showPro(bot, chatId) {
  await bot.sendMessage(chatId,
    `⭐ *QuickPick PRO*\n\n🧠 Персональні рекомендації\n🔥 Що зараз популярне поруч\n❤️ Smart favorites\n🔁 Повтор минулих виборів\n🍷 Pair recommendations\n👀 Hidden gems\n💪 Калорії та БЖУ\n🎯 Smarter "Обери за мене"\n📋 Food profile\n∞ Безлімітні підбірки\n\n💰 *500 зірок / місяць (~10$)*\n\n_Зараз PRO безкоштовний на 21 день для перших користувачів_ ❤️`,
    { parse_mode: 'Markdown', ...inlineKb([
      [{ text: '🔓 Спробувати PRO безкоштовно', data: 'activate_trial' }],
      [{ text: '😋 Пізніше', data: 'pro_later' }],
    ]) }
  );
}

module.exports = { registerCommands, showPro };
