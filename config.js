const BOT_TOKEN = process.env.BOT_TOKEN;
const ANTHROPIC_KEY = process.env.ANTHROPIC_KEY;

const BUDGET_RANGES = {
  '🥲 Сьогодні економимо': { min: 150, max: 650,  label: '150–650 грн' },
  '💸 Гуляємо на повну':   { min: 700, max: 9999, label: '700–2500 грн' },
};

const CUISINE_BUTTONS = [
  ['🍝 Італійське', '🍜 Азія', '🍔 Фастфуд'],
  ['🍕 Піца', '☕ Кава та десерти', '🥩 Гриль'],
  ['👶 Дитяче', '🎲 Здивуй мене'],
];

const BUDGET_BUTTONS = [['🥲 Сьогодні економимо', '💸 Гуляємо на повну']];

module.exports = { BOT_TOKEN, ANTHROPIC_KEY, BUDGET_RANGES, CUISINE_BUTTONS, BUDGET_BUTTONS };
