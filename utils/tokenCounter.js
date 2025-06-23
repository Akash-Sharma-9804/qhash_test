// Fix the tiktoken import
let encode;
try {
  const tiktoken = require('@dqbd/tiktoken/encoders/cl100k_base');
  encode = tiktoken.encode;
} catch (error) {
  console.error("❌ Failed to load tiktoken:", error);
  encode = null;
}

// Count tokens for DeepSeek (using tiktoken)
const countDeepSeekTokens = (messages) => {
  try {
    if (!encode) {
      // Fallback: rough estimation (4 chars = 1 token)
      const text = messages.map(msg => `${msg.role}: ${msg.content}`).join('\n');
      return Math.ceil(text.length / 4);
    }
    
    const text = messages.map(msg => `${msg.role}: ${msg.content}`).join('\n');
    const tokens = encode(text);
    return tokens.length;
  } catch (error) {
    console.error("❌ DeepSeek token counting error:", error);
    // Fallback: rough estimation (4 chars = 1 token)
    const text = messages.map(msg => `${msg.role}: ${msg.content}`).join('\n');
    return Math.ceil(text.length / 4);
  }
};

// Estimate tokens using character count (works for both models)
const estimateTokens = (messages) => {
  const text = messages.map(msg => `${msg.role}: ${msg.content}`).join('\n');
  // More conservative estimation: 3.5 chars per token on average
  return Math.ceil(text.length / 3.5);
};

// Smart model selection based on token count
const selectOptimalModel = async (messages) => {
  const DEEPSEEK_LIMIT = 60000; // Leave some buffer (62k - 2k for response)
  
  // Use precise counting for DeepSeek
  const deepseekTokens = countDeepSeekTokens(messages);
  
  if (deepseekTokens <= DEEPSEEK_LIMIT) {
    console.log(`🚀 Using DeepSeek - Tokens: ${deepseekTokens}/${DEEPSEEK_LIMIT}`);
    return {
      model: 'deepseek',
      tokenCount: deepseekTokens
    };
  }
  
  // Exceeds DeepSeek limit, use Llama
  const estimatedTokens = estimateTokens(messages);
  console.log(`🦙 Using Llama - Estimated Tokens: ${estimatedTokens} (DeepSeek: ${deepseekTokens})`);
  return {
    model: 'llama',
    tokenCount: estimatedTokens
  };
};

module.exports = {
  selectOptimalModel,
  countDeepSeekTokens,
  estimateTokens
};
