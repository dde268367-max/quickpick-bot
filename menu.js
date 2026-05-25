const fs = require('fs');
const { getDistance, getFullPhotoUrl } = require('./utils');
const { BUDGET_RANGES } = require('./config');

const realMenu = JSON.parse(fs.readFileSync('real_menu.json', 'utf8'));

function getBudgetRange(cat) {
  return BUDGET_RANGES[cat] || BUDGET_RANGES['🟡 Середньо'];
}

function getVenuesInRadius(lat, lng, radius, budgetRange) {
  return Object.values(realMenu)
    .map(v => {
      const vLat = v.coords[1];
      const vLng = v.coords[0];
      const distKm = getDistance(lat, lng, vLat, vLng).toFixed(1);
      const dishes = v.menu.filter(d => d.price >= budgetRange.min && d.price <= budgetRange.max && d.price > 0);
      const filteredMenu = dishes.length ? dishes : v.menu.filter(d => d.price > 0);
      return { ...v, distKm, lat: vLat, lng: vLng, filteredMenu };
    })
    .filter(v => parseFloat(v.distKm) <= radius && v.filteredMenu.length > 0)
    .sort((a, b) => parseFloat(a.distKm) - parseFloat(b.distKm));
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

module.exports = { realMenu, getBudgetRange, getVenuesInRadius, findDishPhoto };
