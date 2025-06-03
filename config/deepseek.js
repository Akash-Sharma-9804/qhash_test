const OpenAI = require("openai");
require("dotenv").config();

const deepseek = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY,
  baseURL: "https://api.deepseek.com/v1",
});

module.exports = deepseek;
