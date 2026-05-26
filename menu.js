const fs = require('fs');
const { getDistance, getFullPhotoUrl } = require('./utils');
const { BUDGET_RANGES } = require('./config');

// ─── Теги страв ───────────────────────────────────────────────────────────────
const DISH_TAGS = {
  coffee:  ['кава','капучіно','латте','еспресо','americano','флет','доппіо','макіато','моккіно','раф','coffee','americano'],
  dessert: ['торт','тістечко','десерт','морозиво','чізкейк','тірамісу','брауні','вафл','панна','круасан','еклер','маффін','кекс','пирі','пряник'],
  asian:   ['суші','ролл','рамен','пад тай','вок','удон','місо','нігірі','темпура','локшина','нудл','dim sum','gyoza','дімсам'],
  pizza:   ['піца','pizza'],
  burger:  ['бургер','burger','сендвіч','sandwich','хот-дог','hotdog','шаурма','wrap','врап'],
  soup:    ['суп','борщ','крем-суп','юшка','бульйон','рамен','том ям','солянка','харчо','окрошка'],
  pasta:   ['паста','ризото','лазанья','тальятел','феттучін','спагет','пенне','фарфал','равіол'],
  grill:   ['стейк','гриль','ребра','антрекот','шашлик','барбек','тібон','рибай','філе міньйон'],
  meat:    ['відбивна','котлета','шніцель','биток','запечен','свинин','яловичин','курк','гриль','м\'яс'],
  fish:    ['риба','лосось','тунець','дорадо','сьомга','окунь','форель','короп','судак','морепродукт','краб','креветк','мідії','устриц'],
  kids:    ['дитяч','kids','курч','паста','пюре','сирник','млинц','вафл','омлет','запіканк','нагетс','пальч'],
  salad:   ['салат','цезар','нікуаз','грецьк','руккол','мікс'],
  alcohol: ['пиво','вино','коктейль','горілка','whisky','віскі','джин','ром','лікер','шот','beer','wine','spirits','алкоголь','бренді','текіла','абсент'],
  snack:   ['горішки','снек','чіпси','сухарик','попкорн','crackers','фісташк'],
};

function getDishTags(dishName) {
  const name = (dishName || '').toLowerCase();
  const tags = [];
  for (const [tag, keywords] of Object.entries(DISH_TAGS)) {
    if (keywords.some(k => name.includes(k))) tags.push(tag);
  }
  return tags;
}

// ─── Категорії ───────────────────────────────────────────────────────────────
// Суворіше: include обов'язковий якщо задано, exclude завжди виключає
const CATEGORY_RULES = {
  '🍝 Щось ситне':      { include: ['pasta','soup','meat','grill','fish','pizza'], exclude: ['alcohol','snack','coffee','dessert'] },
  '🍜 Азія':            { include: ['asian'], exclude: ['alcohol','snack','coffee','dessert'] },
  '🍔 Швидко і смачно': { include: ['burger','pizza'], exclude: ['alcohol','snack','coffee','dessert'] },
  '☕ Кава і десерт':   { include: ['coffee','dessert'], exclude: ['alcohol','meat','grill','fish','soup','pasta','asian'] },
  '🥩 Мʼясо':          { include: ['meat','grill'], exclude: ['alcohol','snack','coffee','dessert','fish','salad'] },
  '🎲 Обери за мене':   { include: [], exclude: ['alcohol','snack'] },
  'kids':               { include: ['kids','pasta','soup','dessert','pizza'], exclude: ['alcohol','snack','grill','fish','meat','burger'] },
};

function filterDishesByCategory(dishes, cuisine) {
  const rules = CATEGORY_RULES[cuisine] || CATEGORY_RULES['🎲 Обери за мене'];

  const filtered = dishes.filter(d => {
    const tags = getDishTags(d.name);
    if (rules.exclude.some(t => tags.includes(t))) return false;
    if (rules.include.length > 0) return rules.include.some(t => tags.includes(t));
    return true;
  });

  // Якщо після суворої фільтрації нічого немає — повертаємо з exclude-only
  // (краще показати щось, ніж нічого, але алкоголь/снеки завжди виключаємо)
  if (!filtered.length) {
    return dishes.filter(d => {
      const tags = getDishTags(d.name);
      return !['alcohol','snack'].some(t => tags.includes(t));
    });
  }

  return filtered;
}

// ─── Валідація та завантаження меню ──────────────────────────────────────────
let rawMenu;
try {
  rawMenu = JSON.parse(fs.readFileSync('real_menu.json', 'utf8'));
} catch (e) {
  console.error('[menu] CRITICAL: не вдалось завантажити real_menu.json:', e.message);
  process.exit(1);
}

const realMenu = {};
let skippedVenues = 0;
let skippedDishes = 0;

for (const [key, v] of Object.entries(rawMenu)) {
  // Валідація координат
  if (!v.coords || !Array.isArray(v.coords) || v.coords.length < 2) {
    console.warn(`[menu] SKIP venue "${v.name || key}": немає координат`);
    skippedVenues++;
    continue;
  }
  const [lng, lat] = v.coords;
  if (!lat || !lng || isNaN(lat) || isNaN(lng) || lat < 44 || lat > 53 || lng < 22 || lng > 40) {
    console.warn(`[menu] SKIP venue "${v.name || key}": невалідні координати [${lng}, ${lat}]`);
    skippedVenues++;
    continue;
  }
  if (!v.name || typeof v.name !== 'string' || !v.name.trim()) {
    console.warn(`[menu] SKIP venue key="${key}": немає назви`);
    skippedVenues++;
    continue;
  }

  // Валідація страв
  const cleanMenu = [];
  for (const d of (v.menu || [])) {
    if (!d.name || typeof d.name !== 'string' || !d.name.trim()) {
      skippedDishes++;
      continue;
    }
    const price = Number(d.price);
    if (!price || isNaN(price) || price <= 0 || price > 50000) {
      skippedDishes++;
      continue;
    }
    cleanMenu.push({ ...d, price });
  }

  if (!cleanMenu.length) {
    console.warn(`[menu] SKIP venue "${v.name}": порожнє меню після валідації`);
    skippedVenues++;
    continue;
  }

  realMenu[key] = { ...v, menu: cleanMenu };
}

console.log(`[menu] Завантажено: ${Object.keys(realMenu).length} закладів (пропущено: ${skippedVenues} закладів, ${skippedDishes} страв)`);

// ─── Budget ───────────────────────────────────────────────────────────────────
function getBudgetRange(cat) {
  return BUDGET_RANGES[cat] || BUDGET_RANGES['🥲 Сьогодні економимо'];
}

// ─── Пошук закладів ───────────────────────────────────────────────────────────
function getVenuesInRadius(lat, lng, radius, budgetRange, cuisine) {
  const results = [];

  for (const v of Object.values(realMenu)) {
    const vLat = v.coords[1];
    const vLng = v.coords[0];
    const distKm = getDistance(lat, lng, vLat, vLng);

    if (distKm > radius) continue;

    // Фільтр по бюджету
    let dishes = v.menu.filter(d => d.price >= budgetRange.min && d.price <= budgetRange.max);
    // Fallback: якщо нічого в бюджеті немає
    if (!dishes.length) dishes = v.menu.filter(d => d.price > 0);
    if (!dishes.length) continue;

    // Фільтр по категорії — ЗАВЖДИ застосовуємо
    if (cuisine) {
      dishes = filterDishesByCategory(dishes, cuisine);
      if (!dishes.length) continue; // заклад без потрібних страв — пропускаємо
    }

    results.push({
      ...v,
      distKm,
      lat: vLat,
      lng: vLng,
      filteredMenu: dishes,
    });
  }

  return results.sort((a, b) => a.distKm - b.distKm);
}

// ─── Текстова дистанція ───────────────────────────────────────────────────────
function distanceText(distKm, districtName) {
  if (distKm <= 0.5) return 'Зовсім поруч';
  if (distKm <= 1.2) return 'Недалеко від тебе';
  if (distKm <= 2.5) return 'Декілька хвилин ходу';
  if (distKm <= 5)   return districtName ? `На ${districtName}` : 'Трохи далі';
  return 'Трохи далі, але варте уваги';
}

// ─── Фото страви ─────────────────────────────────────────────────────────────
function findDishPhoto(venue, dishName) {
  const menu = venue?.filteredMenu || venue?.menu || [];
  const dish = menu.find(d => d.name === dishName)
    || menu.find(d => d.name.toLowerCase().includes((dishName || '').toLowerCase()))
    || menu.find(d => d.photo || d.photo_cloud || d.file_id)
    || menu[0];

  return {
    dish,
    photo: dish?.photo_cloud || dish?.file_id || getFullPhotoUrl(dish?.photo) || null,
  };
}

module.exports = { realMenu, getBudgetRange, getVenuesInRadius, findDishPhoto, distanceText, filterDishesByCategory };
