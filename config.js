const BOT_TOKEN = process.env.BOT_TOKEN;
const ANTHROPIC_KEY = process.env.ANTHROPIC_KEY;

const BUDGET_RANGES = {
  '🟢 Бюджетно': { min: 0,   max: 250,  label: 'до 250 грн' },
  '🟡 Середньо': { min: 150, max: 600,  label: '150–600 грн' },
  '🔴 Дорожче':  { min: 400, max: 9999, label: '400+ грн' },
};

const CUISINE_BUTTONS = [
  ['🍝 Італійське', '🍜 Азія', '🍔 Фастфуд'],
  ['🍕 Піца', '☕ Кава та десерти', '🥩 Гриль'],
  ['👶 Дитяче', '🎲 Здивуй мене'],
];

const BUDGET_BUTTONS = [['🟢 Бюджетно', '🟡 Середньо', '🔴 Дорожче']];

module.exports = { BOT_TOKEN, ANTHROPIC_KEY, BUDGET_RANGES, CUISINE_BUTTONS, BUDGET_BUTTONS };
