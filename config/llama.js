



// require("dotenv").config();
// const { InferenceClient } = require("@huggingface/inference");

// class LlamaClient {
//   constructor() {
//     this.client = new InferenceClient(process.env.LLAMA_API_KEY);
//     this.model = 'meta-llama/Llama-4-Maverick-17B-128E-Instruct-FP8';
//   }

//   async chat(options) {
//     const { messages, temperature = 0.1, max_tokens = 1200, stream = false } = options;

//     try {
//       if (stream) {
//         return this.client.chatCompletionStream({
//           provider: "together",
//           model: this.model,
//           messages,
//           temperature,
//           max_tokens
//         });
//       } else {
//         const response = await this.client.chatCompletion({
//           provider: "together",
//           model: this.model,
//           messages,
//           temperature,
//           max_tokens
//         });
//         return response;
//       }
//     } catch (error) {
//       console.error('❌ Llama API error:', error);
//       throw error;
//     }
//   }
// }

// const llama = {
//   chat: {
//     completions: {
//       create: async (options) => {
//         const client = new LlamaClient();
//         return await client.chat(options);
//       }
//     }
//   }
// };

// module.exports = llama;

require("dotenv").config();
const Together = require("together-ai");

class LlamaClient {
  constructor() {
    this.together = new Together({
      apiKey: process.env.LLAMA_API_KEY
    });
    this.model = 'meta-llama/Llama-4-Maverick-17B-128E-Instruct-FP8';
  }

  async chat(options) {
    const { messages, temperature = 0.1, max_tokens = 1200, stream = false } = options;

    try {
      const response = await this.together.chat.completions.create({
        model: this.model,
        messages,
        temperature,
        max_tokens,
        stream
      });
      
      return response;
    } catch (error) {
      console.error('❌ Llama API error:', error);
      throw error;
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
