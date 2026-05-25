function getDistance(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function getCuisineEmoji(dish) {
  const d = (dish || '').toLowerCase();
  if (d.includes('піц') || d.includes('piz'))               return '🍕';
  if (d.includes('суш') || d.includes('ролл'))              return '🍣';
  if (d.includes('паст') || d.includes('ризот'))            return '🍝';
  if (d.includes('бург'))                                    return '🍔';
  if (d.includes('суп') || d.includes('борщ'))              return '🍲';
  if (d.includes('салат'))                                   return '🥗';
  if (d.includes('кав') || d.includes('капуч') || d.includes('еспр')) return '☕';
  if (d.includes('торт') || d.includes('десерт') || d.includes('морозив')) return '🍰';
  if (d.includes('стейк') || d.includes('гриль') || d.includes('ребр')) return '🥩';
  return '🍽';
}

function getFullPhotoUrl(url) {
  if (!url) return null;
  let clean = url.replace('/thumbnail_', '/').replace('thumbnail_', '').split('?')[0];
  if (clean.endsWith('.webp')) return null;
  return clean;
}

// Клавіатури
function inlineKb(rows) {
  return {
    reply_markup: {
      inline_keyboard: rows.map(r => r.map(b =>
        b.url ? { text: b.text, url: b.url } : { text: b.text, callback_data: b.data }
      ))
    }
  };
}

function kb(rows) {
  return {
    reply_markup: {
      keyboard: rows.map(r => r.map(t => ({ text: t }))),
      resize_keyboard: true,
      one_time_keyboard: true,
    }
  };
}

function geoKb() {
  return {
    reply_markup: {
      keyboard: [[{ text: '📍 Поділитись геолокацією', request_location: true }]],
      resize_keyboard: true,
      one_time_keyboard: true,
    }
  };
}

module.exports = { getDistance, getCuisineEmoji, getFullPhotoUrl, inlineKb, kb, geoKb };
