const axios = require('axios');
const fs = require('fs');
const path = require('path');

const realMenu = JSON.parse(fs.readFileSync('real_menu.json', 'utf8'));

// Створюємо папку для фото
if (!fs.existsSync('photos')) fs.mkdirSync('photos');

async function downloadPhoto(url, filename) {
  try {
    const res = await axios.get(url, {
      responseType: 'arraybuffer',
      timeout: 10000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://choiceqr.com/',
        'Accept': 'image/webp,image/apng,image/*,*/*;q=0.8'
      }
    });
    fs.writeFileSync(path.join('photos', filename), Buffer.from(res.data));
    return true;
  } catch(e) {
    return false;
  }
}

async function main() {
  const keys = Object.keys(realMenu);
  let downloaded = 0, skipped = 0, total = 0;

  for (const key of keys) {
    const venue = realMenu[key];
    console.log(`\n📍 ${venue.name}`);

    for (let i = 0; i < venue.menu.length; i++) {
      const dish = venue.menu[i];
      if (!dish.photo) continue;
      total++;

      // Ім'я файлу
      const ext = dish.photo.includes('.webp') ? 'webp' : 'jpg';
      const filename = `${key}_${i}.${ext}`;
      const localPath = path.join('photos', filename);

      // Якщо вже скачано — пропускаємо
      if (fs.existsSync(localPath)) {
        dish.photo_local = filename;
        skipped++;
        continue;
      }

      process.stdout.write(`  ${dish.name}... `);
      const ok = await downloadPhoto(dish.photo, filename);
      if (ok) {
        dish.photo_local = filename;
        downloaded++;
        console.log('✅');
      } else {
        console.log('❌');
      }

      await new Promise(r => setTimeout(r, 200));
    }
  }

  fs.writeFileSync('real_menu.json', JSON.stringify(realMenu, null, 2));
  console.log(`\n✅ Готово! Скачано: ${downloaded}, вже були: ${skipped}, не вдалось: ${total - downloaded - skipped}`);
  console.log(`📁 Фото збережені в папці photos/`);
}

main();
