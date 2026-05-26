const { getUser } = require('../users');
const { kb, inlineKb } = require('../utils');
const { CUISINE_BUTTONS, CUISINE_INTROS, KYIV_DISTRICTS, KYIV_OBLAST_CITIES } = require('../config');

function randomIntro() {
  return CUISINE_INTROS[Math.floor(Math.random() * CUISINE_INTROS.length)];
}

function registerLocation(bot) {
  bot.on('location', async (msg) => {
    const chatId = msg.chat.id;
    const user = await getUser(chatId); // await!
    if (user.step !== 'location') return;

    user.session.lat = msg.location.latitude;
    user.session.lng = msg.location.longitude;
    user.session.isManualDistrict = false;
    user.step = 'cuisine';

    await bot.sendMessage(chatId, `*${randomIntro()}*`, {
      parse_mode: 'Markdown',
      ...kb(CUISINE_BUTTONS),
    });
  });
}

async function handleManualLocation(bot, chatId) {
  await bot.sendMessage(chatId, `📍 Обери місто:`,
    inlineKb([
      [{ text: '🏙 Київ', data: 'city_kyiv' }, { text: '🌳 Київська область', data: 'city_oblast' }],
      [{ text: '↩️ Назад', data: 'start_search' }],
    ])
  );
}

async function handleCityKyiv(bot, chatId) {
  const rows = [];
  for (let i = 0; i < KYIV_DISTRICTS.length; i += 2) {
    const row = [{ text: KYIV_DISTRICTS[i].name, data: `district_${i}` }];
    if (KYIV_DISTRICTS[i + 1]) row.push({ text: KYIV_DISTRICTS[i + 1].name, data: `district_${i + 1}` });
    rows.push(row);
  }
  rows.push([{ text: '↩️ Назад', data: 'manual_location' }]);
  await bot.sendMessage(chatId, `🏙 Обери район Києва:`, inlineKb(rows));
}

async function handleCityOblast(bot, chatId) {
  const rows = [];
  for (let i = 0; i < KYIV_OBLAST_CITIES.length; i += 2) {
    const row = [{ text: KYIV_OBLAST_CITIES[i].name, data: `oblast_${i}` }];
    if (KYIV_OBLAST_CITIES[i + 1]) row.push({ text: KYIV_OBLAST_CITIES[i + 1].name, data: `oblast_${i + 1}` });
    rows.push(row);
  }
  rows.push([{ text: '↩️ Назад', data: 'manual_location' }]);
  await bot.sendMessage(chatId, `🌳 Обери місто:`, inlineKb(rows));
}

async function handleDistrict(bot, chatId, user, idx) {
  const district = KYIV_DISTRICTS[idx];
  user.session.lat = district.lat;
  user.session.lng = district.lng;
  user.session.districtName = district.name;
  user.session.isManualDistrict = true;
  user.step = 'cuisine';
  await bot.sendMessage(chatId, `*${randomIntro()}*`, {
    parse_mode: 'Markdown',
    ...kb(CUISINE_BUTTONS),
  });
}

async function handleOblastCity(bot, chatId, user, idx) {
  const city = KYIV_OBLAST_CITIES[idx];
  user.session.lat = city.lat;
  user.session.lng = city.lng;
  user.session.districtName = city.name;
  user.session.isManualDistrict = true;
  user.step = 'cuisine';
  await bot.sendMessage(chatId, `*${randomIntro()}*`, {
    parse_mode: 'Markdown',
    ...kb(CUISINE_BUTTONS),
  });
}

module.exports = { registerLocation, handleManualLocation, handleCityKyiv, handleCityOblast, handleDistrict, handleOblastCity, randomIntro };
