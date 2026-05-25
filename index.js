const TelegramBot = require('node-telegram-bot-api');
const { BOT_TOKEN } = require('./config');

const { registerCommands } = require('./handlers/commands');
const { registerLocation }  = require('./handlers/location');
const { registerMessages }  = require('./handlers/messages');
const { registerButtons }   = require('./handlers/buttons');

const bot = new TelegramBot(BOT_TOKEN, { polling: true });

registerCommands(bot);
registerLocation(bot);
registerMessages(bot);
registerButtons(bot);

console.log('⚡ QuickPick v10 запущено!');
