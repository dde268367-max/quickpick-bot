const BOT_TOKEN = process.env.BOT_TOKEN;
const ANTHROPIC_KEY = process.env.ANTHROPIC_KEY;

const BUDGET_RANGES = {
  '🥲 Сьогодні економимо': { min: 150, max: 650,  label: '150–650 грн' },
  '💸 Гуляємо на повну':   { min: 700, max: 9999, label: '700–2500 грн' },
};

const CUISINE_BUTTONS = [
  ['🍝 Щось ситне', '🍜 Азія', '🍔 Швидко і смачно'],
  ['☕ Кава і десерт', '🥩 Мʼясо', '🎲 Обери за мене'],
];

const BUDGET_BUTTONS = [['🥲 Сьогодні економимо', '💸 Гуляємо на повну']];

const KYIV_DISTRICTS = [
  { name: 'Шевченківський', lat: 50.4501, lng: 30.5234 },
  { name: 'Печерський',     lat: 50.4354, lng: 30.5435 },
  { name: 'Подільський',    lat: 50.4647, lng: 30.5123 },
  { name: 'Оболонський',    lat: 50.5013, lng: 30.4987 },
  { name: 'Голосіївський',  lat: 50.3987, lng: 30.5123 },
  { name: 'Дарницький',     lat: 50.4234, lng: 30.6123 },
  { name: 'Дніпровський',   lat: 50.4456, lng: 30.6234 },
  { name: 'Деснянський',    lat: 50.5123, lng: 30.6012 },
  { name: 'Святошинський',  lat: 50.4567, lng: 30.3987 },
  { name: 'Солом\'янський', lat: 50.4234, lng: 30.4567 },
];

const KYIV_OBLAST_CITIES = [
  { name: 'Бровари',  lat: 50.5112, lng: 30.7897 },
  { name: 'Буча',     lat: 50.5509, lng: 30.2326 },
  { name: 'Ірпінь',  lat: 50.5214, lng: 30.2545 },
  { name: 'Вишневе', lat: 50.3756, lng: 30.3678 },
  { name: 'Бориспіль', lat: 50.3514, lng: 30.9567 },
];

module.exports = { BOT_TOKEN, ANTHROPIC_KEY, BUDGET_RANGES, CUISINE_BUTTONS, BUDGET_BUTTONS, KYIV_DISTRICTS, KYIV_OBLAST_CITIES };
