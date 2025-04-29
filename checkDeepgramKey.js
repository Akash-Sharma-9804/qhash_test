const axios = require('axios');

const DEEPGRAM_API_KEY = '21b00cb9e1d16d7200859b306a3b59c438b82d28'; // put your key here

async function checkKey() {
  try {
    const response = await axios.get('https://api.deepgram.com/v1/projects', {
      headers: {
        Authorization: `Token ${DEEPGRAM_API_KEY}`,
      },
    });

    console.log("✅ API Key is valid. Project info:");
    console.dir(response.data, { depth: null });
  } catch (error) {
    if (error.response) {
      console.error(`❌ API Error: ${error.response.status} ${error.response.statusText}`);
      console.error(error.response.data);
    } else {
      console.error('❌ Error:', error.message);
    }
  }
}

checkKey();
