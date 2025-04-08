// deepseek.js (If needed for DeepSeek)
const axios = require("axios");
require("dotenv").config();

const deepseekAPI = axios.create({
  baseURL: "https://api.deepseek.com", // Example base URL, change accordingly
  headers: {
    "Authorization": `Bearer ${process.env.DEEPSEEK_API_KEY}`,
    "Content-Type": "application/json"
  }
});

module.exports = deepseekAPI;
