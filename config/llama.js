const fetch = require('node-fetch');
require("dotenv").config();

class LlamaClient {
  constructor() {
    this.baseURL = 'https://router.huggingface.co/together/v1/chat/completions';
    this.apiKey = process.env.LLAMA_API_KEY ;
    this.model = 'meta-llama/Llama-4-Maverick-17B-128E-Instruct-FP8';
    this.maxTokens = 1000000; // 1M tokens
  }

  async chat(options) {
    const { messages, temperature = 0.1, max_tokens = 1200, stream = false } = options;

    const requestBody = {
      model: this.model,
      messages,
      temperature,
      max_tokens,
      stream
    };

    try {
      const response = await fetch(this.baseURL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        throw new Error(`Llama API error: ${response.status} ${response.statusText}`);
      }

      if (stream) {
        return this.handleStreamResponse(response);
      } else {
        const data = await response.json();
        return data;
      }
    } catch (error) {
      console.error('❌ Llama API error:', error);
      throw error;
    }
  }

  async *handleStreamResponse(response) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') return;

            try {
              const parsed = JSON.parse(data);
              yield {
                choices: [{
                  delta: {
                    content: parsed.choices?.[0]?.delta?.content || ''
                  }
                }]
              };
            } catch (e) {
              // Skip invalid JSON
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }
}

const llama = {
  chat: {
    completions: {
      create: async (options) => {
        const client = new LlamaClient();
        return await client.chat(options);
      }
    }
  }
};

module.exports = llama;
