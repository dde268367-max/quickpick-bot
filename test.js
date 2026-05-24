const axios = require('axios');
const key = require('fs').readFileSync('key.txt','utf8').trim();
axios.post('https://api.anthropic.com/v1/messages',
  {model:'claude-sonnet-4-20250514',max_tokens:10,messages:[{role:'user',content:'hi'}]},
  {headers:{'x-api-key':key,'anthropic-version':'2023-06-01','content-type':'application/json'}}
).then(r=>console.log('✅ Ключ працює!')).catch(e=>console.log('❌',e.response?.data||e.message));