const axios = require('axios');
const fs = require('fs');
const path = require('path');
const FormData = require('form-data');

// ⬇️ ВСТАВТЕ СВОЇ ДАНІ СЮДИ
const CLOUDINARY_CLOUD = 'dxvrlkknr';
const CLOUDINARY_KEY = '697258279353925';
const CLOUDINARY_SECRET = 'ofkUwv0_iX-fTymslI2_v6L-n-w';
// ⬆️ ВСТАВТЕ СВОЇ ДАНІ СЮДИ

const crypto = require('crypto');
const realMenu = JSON.parse(fs.readFileSync('real_menu.json', 'utf8'));

function sign(params) {
  const str = Object.keys(params).sort().map(k => `${k}=${params[k]}`).join('&') + CLOUDINARY_SECRET;
  return crypto.createHash('sha1').update(str).digest('hex');
}

async function uploadPhoto(filePath, publicId) {
  try {
    const timestamp = Math.floor(Date.now() / 1000);
    const params = { public_id: publicId, timestamp };
    const signature = sign(params);

    const form = new FormData();
    form.append('file', fs.createReadStream(filePath));
    form.append('api_key', CLOUDINARY_KEY);
    form.append('timestamp', timestamp);
    form.append('public_id', publicId);
    form.append('signature', signature);

    const res = await axios.post(
      `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD}/image/upload`,
      form, { headers: form.getHeaders(), timeout: 30000 }
    );
    return res.data.secure_url;
  } catch(e) {
    return null;
  }
}

async function main() {
  const keys = Object.keys(realMenu);
  let uploaded = 0, skipped = 0;

  for (const key of keys) {
    const venue = realMenu[key];
    console.log(`\n📍 ${venue.name}`);

    for (let i = 0; i < venue.menu.length; i++) {
      const dish = venue.menu[i];
      if (!dish.photo_local) continue;
      if (dish.photo_cloud) { skipped++; continue; }

      const filePath = path.join('photos', dish.photo_local);
      if (!fs.existsSync(filePath)) continue;

      process.stdout.write(`  ${dish.name}... `);
      const publicId = `quickpick/${key}_${i}`;
      const url = await uploadPhoto(filePath, publicId);

      if (url) {
        dish.photo_cloud = url;
        uploaded++;
        console.log('✅');
      } else {
        console.log('❌');
      }

      // Зберігаємо кожні 10 фото
      if (uploaded % 10 === 0) {
        fs.writeFileSync('real_menu.json', JSON.stringify(realMenu, null, 2));
      }

      await new Promise(r => setTimeout(r, 300));
    }
  }

  fs.writeFileSync('real_menu.json', JSON.stringify(realMenu, null, 2));
  console.log(`\n✅ Завантажено: ${uploaded}, вже були: ${skipped}`);
}

main();
