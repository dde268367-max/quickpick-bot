const { inlineKb } = require('./utils');

function recButtons(i, isLast) {
  if (!isLast) {
    return inlineKb([
      [{ text: '🍴 Хочу це', data: `pick_${i}` }],
      [{ text: '🔄 Інші варіанти', data: 'swap' }, { text: '🍽 Змінити кухню', data: 'back_to_cuisine' }],
      [{ text: '📍 Змінити район', data: 'change_district' }, { text: '↩️ Спочатку', data: 'start_search' }],
    ]);
  } else {
    return inlineKb([
      [{ text: '🍴 Хочу це', data: `pick_${i}` }, { text: '🔄 Інші варіанти', data: 'swap' }],
      [{ text: '🍽 Змінити кухню', data: 'back_to_cuisine' }, { text: '👶 Дитячі', data: 'kids_filter' }],
      [{ text: '📍 Змінити район', data: 'change_district' }, { text: '↩️ Спочатку', data: 'start_search' }],
    ]);
  }
}

module.exports = { recButtons };
