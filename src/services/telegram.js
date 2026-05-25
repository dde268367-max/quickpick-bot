const TelegramBot = require('node-telegram-bot-api');
const { BOT_TOKEN } = require('../config/config');

const bot = new TelegramBot(BOT_TOKEN, {
  polling: true,
});

module.exports = bot;const TelegramBot = require('node-telegram-bot-api');
const { BOT_TOKEN } = require('../config/config');

const bot = new TelegramBot(BOT_TOKEN, {
  polling: true
});

module.exports = bot;