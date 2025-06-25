



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
// require("dotenv").config();

// class LlamaClient {
//   constructor() {
//     this.apiKey = process.env.PARASAIL_API_KEY || process.env.LLAMA_API_KEY;
//     this.baseURL = 'https://api.parasail.io/v1';
//     this.model = 'parasail-llama-4-maverick-instruct-fp8';
//   }

//   async chat(options) {
//     const { messages, temperature = 0.1, max_tokens = 1200, stream = false } = options;

//     try {
//       const response = await fetch(`${this.baseURL}/chat/completions`, {
//         method: 'POST',
//         headers: {
//           'Authorization': `Bearer ${this.apiKey}`,
//           'Content-Type': 'application/json'
//         },
//         body: JSON.stringify({
//           model: this.model,
//           messages,
//           temperature,
//           max_tokens,
//           stream
//         })
//       });

//       if (!response.ok) {
//         throw new Error(`Parasail API error: ${response.status} ${response.statusText}`);
//       }

//       if (stream) {
//         // Return the async generator for streaming
//         return this.handleStreamResponse(response);
//       } else {
//         // Return parsed JSON for non-streaming
//         return await response.json();
//       }
//     } catch (error) {
//       console.error('❌ Parasail Llama API error:', error);
//       throw error;
//     }
//   }

//   async *handleStreamResponse(response) {
//     try {
//       // Convert response body to async iterable
//       const decoder = new TextDecoder();
//       let buffer = '';

//       // Handle the response body as a stream
//       for await (const chunk of response.body) {
//         buffer += decoder.decode(chunk, { stream: true });
        
//         // Process complete lines
//         const lines = buffer.split('\n');
//         buffer = lines.pop() || ''; // Keep incomplete line in buffer

//         for (const line of lines) {
//           const trimmedLine = line.trim();
          
//           if (trimmedLine.startsWith('data: ')) {
//             const data = trimmedLine.slice(6);
            
//             if (data === '[DONE]') {
//               return;
//             }
            
//             try {
//               const parsed = JSON.parse(data);
//               yield parsed;
//             } catch (e) {
//               // Skip invalid JSON chunks
//               console.warn('⚠️ Failed to parse streaming chunk:', data);
//               continue;
//             }
//           }
//         }
//       }

//       // Process any remaining data in buffer
//       if (buffer.trim()) {
//         const trimmedBuffer = buffer.trim();
//         if (trimmedBuffer.startsWith('data: ')) {
//           const data = trimmedBuffer.slice(6);
//           if (data !== '[DONE]') {
//             try {
//               const parsed = JSON.parse(data);
//               yield parsed;
//             } catch (e) {
//               console.warn('⚠️ Failed to parse final chunk:', data);
//             }
//           }
//         }
//       }
//     } catch (error) {
//       console.error('❌ Stream processing error:', error);
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

