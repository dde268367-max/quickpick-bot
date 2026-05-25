const axios = require('axios');

function getFullPhotoUrl(url) {
  if (!url) return null;

  let clean = url;

  // убираем thumbnail
  clean = clean.replace('/thumbnail_', '/');
  clean = clean.replace('thumbnail_', '');

  // убираем query params
  clean = clean.split('?')[0];

  // webp Telegram часто шакалит
  clean = clean.replace('.webp', '.jpg');

  return clean;
}

async function downloadPhoto(url) {
  try {
    const fullUrl = getFullPhotoUrl(url);

    if (!fullUrl) return null;

    const response = await axios.get(fullUrl, {
      responseType: 'arraybuffer',
      maxRedirects: 5,
      headers: {
        'User-Agent': 'Mozilla/5.0'
      }
    });

    const contentType = response.headers['content-type'];

    if (!contentType || !contentType.startsWith('image')) {
      return null;
    }

    return Buffer.from(response.data);

  } catch (e) {
    console.log('PHOTO DOWNLOAD ERROR:', e.message);
    return null;
  }
}

module.exports = {
  getFullPhotoUrl,
  downloadPhoto
};