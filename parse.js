const axios = require('axios');
const fs = require('fs');

const GOOGLE_KEY = 'AIzaSyDncBoFsJm3s-j3edPfHUBw_j1JKkpdX6Y';

const KYIV_DISTRICTS = [
  { name: 'Шевченківський', lat: 50.4501, lng: 30.5234 },
  { name: 'Печерський', lat: 50.4354, lng: 30.5435 },
  { name: 'Подільський', lat: 50.4647, lng: 30.5123 },
  { name: 'Оболонський', lat: 50.5013, lng: 30.4987 },
  { name: 'Голосіївський', lat: 50.3987, lng: 30.5123 },
  { name: 'Дарницький', lat: 50.4234, lng: 30.6123 },
  { name: 'Дніпровський', lat: 50.4456, lng: 30.6234 },
  { name: 'Деснянський', lat: 50.5123, lng: 30.6012 },
  { name: 'Святошинський', lat: 50.4567, lng: 30.3987 },
  { name: 'Солом\'янський', lat: 50.4234, lng: 30.4567 },
];

async function getRestaurants(lat, lng, districtName) {
  try {
    const res = await axios.post(
      'https://places.googleapis.com/v1/places:searchNearby',
      {
        includedTypes: ['restaurant', 'cafe'],
        maxResultCount: 20,
        locationRestriction: {
          circle: {
            center: { latitude: lat, longitude: lng },
            radius: 1500.0
          }
        }
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': GOOGLE_KEY,
          'X-Goog-FieldMask': 'places.displayName,places.formattedAddress,places.rating,places.id'
        }
      }
    );

    const places = res.data.places || [];
    const restaurants = places.map(p => ({
      district: districtName,
      name: p.displayName?.text || 'Без назви',
      address: p.formattedAddress || '',
      rating: p.rating || 'немає',
      place_id: p.id,
    }));
    restaurants.forEach(r => console.log(`✅ ${r.district}: ${r.name}`));
    return restaurants;
  } catch (e) {
    console.error(`❌ ${districtName}:`, e.response?.data || e.message);
    return [];
  }
}

async function main() {
  console.log('⚡️ Збираємо заклади Києва...\n');
  let all = [];
  for (const d of KYIV_DISTRICTS) {
    const list = await getRestaurants(d.lat, d.lng, d.name);
    all = all.concat(list);
    await new Promise(r => setTimeout(r, 500));
  }
  const unique = Array.from(new Map(all.map(r => [r.place_id, r])).values());
  fs.writeFileSync('restaurants.json', JSON.stringify(unique, null, 2), 'utf8');
  console.log(`\n✅ Готово! Знайдено ${unique.length} закладів`);
}

main();