const fs = require('fs');
const { getDistance, getFullPhotoUrl } = require('./utils');
const { BUDGET_RANGES } = require('./config');

// Завантажуємо і валідуємо меню
const rawMenu = JSON.parse(fs.readFileSync('real_menu.json', 'utf8'));

// Теги страв для фільтрації
const DISH_TAGS = {
  coffee:  ['кава','капучіно','латте','еспресо','americano','americano','флет','доппіо','макіато','моккіно','раф','coffee'],
  dessert: ['торт','тістечко','десерт','морозиво','чізкейк','тірамісу','брауні','вафл','панна','круасан','еклер','маффін','кекс'],
  asian:   ['суші','ролл','рамен','пад тай','вок','удон','місо','нігірі','темпура','локшина','нудл','dim sum','gyoza'],
  pizza:   ['піца','pizza'],
  burger:  ['бургер','burger','сендвіч','sandwich','хот-дог','hotdog','шаурма','wrap'],
  soup:    ['суп','борщ','крем-суп','юшка','бульйон','рамен','том ям','солянка','харчо'],
  pasta:   ['паста','ризото','лазанья','тальятел','феттучін','спагет','пенне','фарфал'],
  grill:   ['стейк','гриль','ребра','антрекот','шашлик','барбек','тібон','рибай','філе міньйон'],
  meat:    ['м\'ясо','відбивна','котлета','шніцель','биток','запечен','смажен'],
  fish:    ['риба','лосось','тунець','дорадо','сьомга','окунь','форель','короп','судак','морепродукт','краб','креветк','мідії','устриц'],
  kids:    ['дитяч','kids','курч','паста','пюре','сирник','млинц','вафл','омлет','запіканк'],
  salad:   ['салат','цезар','нікуаз','грецьк'],
  alcohol: ['пиво','вино','коктейль','горілка','whisky','віскі','джин','ром','лікер','шот','beer','wine','spirits','алкоголь'],
  snack:   ['горішки','снек','чіпси','сухарик','попкорн','crackers'],
};

// Визначаємо теги страви
function getDishTags(dishName) {
  const name = (dishName || '').toLowerCase();
  const tags = [];
  for (const [tag, keywords] of Object.entries(DISH_TAGS)) {
    if (keywords.some(k => name.includes(k))) tags.push(tag);
  }
  return tags;
}

// Фільтруємо страви за категорією пошуку
function filterDishesByCategory(menu, cuisine) {
  const CATEGORY_RULES = {
    '🍝 Щось ситне':      { include: ['pasta','soup','meat','grill','fish','pizza'], exclude: ['alcohol','snack','coffee','dessert'] },
    '🍜 Азія':            { include: ['asian'], exclude: ['alcohol','snack'] },
    '🍔 Швидко і смачно': { include: ['burger','pizza'], exclude: ['alcohol','snack'] },
    '☕ Кава і десерт':   { include: ['coffee','dessert'], exclude: ['alcohol','meat','grill','fish'] },
    '🥩 Мʼясо':          { include: ['meat','grill'], exclude: ['alcohol','snack','coffee','dessert'] },
    '🎲 Обери за мене':   { include: [], exclude: ['alcohol','snack'] },
    'kids':               { include: ['kids','pasta','soup','dessert','pizza'], exclude: ['alcohol','snack','grill','fish'] },
  };

  const rules = CATEGORY_RULES[cuisine] || CATEGORY_RULES['🎲 Обери за мене'];

  return menu.filter(d => {
    const tags = getDishTags(d.name);
    // Виключаємо заборонені
    if (rules.exclude.some(t => tags.includes(t))) return false;
    // Якщо є include-правила — беремо тільки відповідні
    if (rules.include.length > 0) {
      return rules.include.some(t => tags.includes(t));
    }
    return true;
  });
}

// Валідуємо і очищаємо меню при завантаженні
const realMenu = {};
for (const [key, v] of Object.entries(rawMenu)) {
  if (!v.coords || !Array.isArray(v.coords) || v.coords.length < 2) continue;
  if (!v.coords[0] || !v.coords[1]) continue;

  const cleanMenu = (v.menu || []).filter(d =>
    d.name && typeof d.name === 'string' && d.name.length > 0 &&
    d.price && !isNaN(d.price) && d.price > 0
  );

  if (!cleanMenu.length) continue;

  realMenu[key] = { ...v, menu: cleanMenu };
}

console.log(`[menu] Завантажено ${Object.keys(realMenu).length} закладів`);

function getBudgetRange(cat) {
  return BUDGET_RANGES[cat] || BUDGET_RANGES['🥲 Сьогодні економимо'];
}

function getVenuesInRadius(lat, lng, radius, budgetRange, cuisine) {
  return Object.values(realMenu)
    .map(v => {
      const vLat = v.coords[1];
      const vLng = v.coords[0];
      const distKm = getDistance(lat, lng, vLat, vLng);

      // Фільтруємо по бюджету
      let dishes = v.menu.filter(d => d.price >= budgetRange.min && d.price <= budgetRange.max);
      if (!dishes.length) dishes = v.menu.filter(d => d.price > 0);

      // Фільтруємо по категорії кухні
      if (cuisine) {
        const catDishes = filterDishesByCategory(dishes, cuisine);
        if (catDishes.length > 0) dishes = catDishes;
      }

      return { ...v, distKm, distKmRaw: distKm, lat: vLat, lng: vLng, filteredMenu: dishes };
    })
    .filter(v => v.distKm <= radius && v.filteredMenu.length > 0)
    .sort((a, b) => a.distKm - b.distKm);
}

// Текстова дистанція замість цифр
function distanceText(distKm, districtName) {
  if (distKm <= 0.5) return 'Зовсім поруч';
  if (distKm <= 1.2) return 'Недалеко від тебе';
  if (distKm <= 2.5) return 'Декілька хвилин ходу';
  if (distKm <= 5)   return districtName ? `На ${districtName}` : 'Трохи далі';
  return 'Трохи далі, але варте уваги';
}

function findDishPhoto(venue, dishName) {
  const dish = venue?.filteredMenu.find(d => d.name === dishName)
    || venue?.filteredMenu.find(d =>
        d.name.toLowerCase().includes(dishName.toLowerCase()) ||
        dishName.toLowerCase().includes(d.name.toLowerCase())
      )
    || venue?.filteredMenu.find(d => d.photo)
    || venue?.filteredMenu[0];

  return {
    dish,
    photo: dish?.photo_cloud || dish?.file_id || getFullPhotoUrl(dish?.photo) || null,
  };
}

module.exports = { realMenu, getBudgetRange, getVenuesInRadius, findDishPhoto, distanceText, filterDishesByCategory };
