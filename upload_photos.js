const axios = require('axios');
const fs = require('fs');

const BOT_TOKEN = process.env.BOT_TOKEN;
const CHAT_ID = process.env.UPLOAD_CHAT_ID; // твій Telegram ID

const realMenu = JSON.parse(fs.readFileSync('real_menu.json', 'utf8'));

async function uploadPhoto(url) {
  try {
    // Спробуємо через URL напряму
    const formData = new (require('form-data'))();
    
    // Завантажуємо фото
    const response = await axios.get(url, {
      responseType: 'arraybuffer',
      timeout: 10000,
      headers: {
        'User-Agent': 'TelegramBot (https://core.telegram.org/bots/api)',
        'Referer': 'https://choiceqr.com/'
      }
    });
    
    if (!response.headers['content-type']?.startsWith('image')) return null;
    
    const buffer = Buffer.from(response.data);
    formData.append('chat_id', CHAT_ID);
    formData.append('photo', buffer, { filename: 'photo.jpg', contentType: 'image/jpeg' });
    
    const res = await axios.post(
      `https://api.telegram.org/bot${BOT_TOKEN}/sendPhoto`,
      formData,
      { headers: formData.getHeaders(), timeout: 15000 }
    );
    
    if (res.data.ok) {
      const photos = res.data.result.photo;
      return photos[photos.length - 1].file_id; // найбільший розмір
    }
    return null;
  } catch(e) {
    console.log('Error uploading:', url, e.message);
    return null;
  }
}

async function main() {
  if (!BOT_TOKEN || !CHAT_ID) {
    console.log('Потрібні BOT_TOKEN і UPLOAD_CHAT_ID');
    console.log('Запусти: BOT_TOKEN=xxx UPLOAD_CHAT_ID=твій_id node upload_photos.js');
    process.exit(1);
  }

  const keys = Object.keys(realMenu);
  let updated = 0;
  let total = 0;

  for (const key of keys) {
    const venue = realMenu[key];
    console.log(`\n📍 ${venue.name} (${venue.menu.length} страв)`);
    
    for (const dish of venue.menu) {
      if (!dish.photo || dish.file_id) continue;
      total++;
      
      process.stdout.write(`  Завантажую ${dish.name}... `);
      const fileId = await uploadPhoto(dish.photo);
      
      if (fileId) {
        dish.file_id = fileId;
        updated++;
        console.log(`✅`);
      } else {
        console.log(`❌`);
      }
      
      // Пауза щоб не спамити Telegram API
      await new Promise(r => setTimeout(r, 500));
    }
  }

  fs.writeFileSync('real_menu.json', JSON.stringify(realMenu, null, 2));
  console.log(`\n✅ Готово! Оновлено ${updated}/${total} фото`);
}

main();
