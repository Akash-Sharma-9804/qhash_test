const db = require("../config/db");
const openai = require("../config/openai");
const deepseek = require("../config/deepseek");
const { query } = require("../config/db"); // make sure you're importing correctly
const { extractUrls, processUrls } = require("../utils/urlProcessor");
// ✅ STANDARDIZED DATABASE QUERY WRAPPER
const executeQuery = async (sql, params = []) => {
  try {
    const result = await db.query(sql, params);
    // console.log("✅ Database query successful:", result);
    // Handle different return formats consistently
    if (Array.isArray(result) && Array.isArray(result[0])) {
      return result[0]; // Return the actual rows
    }
    return result;
  } catch (error) {
    console.error("❌ Database query error:", error);
    throw error;
  }
};

exports.createConversation = async (req, res) => {
  const user_id = req.user?.user_id;

  // ✅ STRICT USER VALIDATION
  if (!user_id || isNaN(user_id)) {
    console.error("❌ Invalid user_id:", user_id);
    return res.status(400).json({ error: "Valid User ID is required" });
  }

  console.log("🔍 Creating conversation for user_id:", user_id);

  try {
    const defaultName = "New Conversation";

    // ✅ CONSISTENT DATABASE QUERY
    const recentConversations = await executeQuery(
      `SELECT id, name FROM conversations 
       WHERE user_id = ? 
       ORDER BY created_at DESC 
       LIMIT 1`,
      [user_id]
    );

    console.log(
      "🔍 Recent conversations for user",
      user_id,
      ":",
      recentConversations
    );

    if (recentConversations && recentConversations.length > 0) {
      const recentConversation = recentConversations[0];

      // Check if this conversation has any messages
      const messageCountResult = await executeQuery(
        `SELECT COUNT(*) as count FROM chat_history WHERE conversation_id = ?`,
        [recentConversation.id]
      );

      const messageCount = messageCountResult[0]?.count || 0;

      // If no messages, reuse this conversation
      if (messageCount === 0) {
        console.log(
          "🔄 Reused empty conversation:",
          recentConversation.id,
          "for user:",
          user_id
        );
        return res.status(200).json({
          success: true,
          conversation_id: recentConversation.id,
          name: recentConversation.name,
          action: "reused",
        });
      }
    }

    // Create new conversation
    const name = req.body.name || defaultName;
    const newConversationResult = await executeQuery(
      "INSERT INTO conversations (user_id, name) VALUES (?, ?)",
      [user_id, name]
    );

    const conversation_id = newConversationResult.insertId;

    if (!conversation_id) {
      throw new Error("Failed to get insert ID");
    }

    console.log(
      "✅ Created new conversation:",
      conversation_id,
      "for user:",
      user_id
    );

    return res.status(201).json({
      success: true,
      conversation_id,
      name,
      action: "created",
    });
  } catch (error) {
    console.error(
      "❌ Error creating conversation for user",
      user_id,
      ":",
      error
    );
    return res.status(500).json({
      error: "Failed to create or reuse conversation",
      details: error.message,
    });
  }
};

// ✅ FIXED GET CONVERSATIONS WITH PROPER USER VALIDATION
exports.getConversations = async (req, res) => {
  const user_id = req.user?.user_id;

  // ✅ STRICT USER VALIDATION
  if (!user_id || isNaN(user_id)) {
    console.error("❌ Invalid user_id in getConversations:", user_id);
    return res.status(401).json({ error: "Unauthorized: Invalid user ID" });
  }

  console.log("🔍 Fetching conversations for user_id:", user_id);

  try {
    // ✅ CONSISTENT DATABASE QUERY WITH USER VALIDATION
    const conversations = await executeQuery(
      "SELECT * FROM conversations WHERE user_id = ? AND is_deleted = FALSE ORDER BY created_at DESC",
      [user_id]
    );

    console.log(
      "✅ Found",
      conversations.length,
      "conversations for user:",
      user_id
    );

    // ✅ LOG FIRST FEW CONVERSATION IDs FOR DEBUGGING
    if (conversations.length > 0) {
      // console.log("🔍 Conversation IDs:", conversations.slice(0, 3).map(c => c.id));
    }

    res.json({
      success: true,
      conversations: conversations || [],
      user_id: user_id, // Include for debugging
    });
  } catch (error) {
    console.error(
      "❌ Error fetching conversations for user",
      user_id,
      ":",
      error.message
    );
    res.status(500).json({ error: "Failed to retrieve conversations" });
  }
};

// ✅ FIXED GET CONVERSATION HISTORY WITH OWNERSHIP VALIDATION
exports.getConversationHistory = async (req, res) => {
  const { conversation_id } = req.params;
  const user_id = req.user?.user_id;

  // ✅ VALIDATE INPUTS
  if (!conversation_id || isNaN(conversation_id)) {
    return res.status(400).json({ error: "Valid conversation ID is required" });
  }

  if (!user_id || isNaN(user_id)) {
    console.error("❌ Invalid user_id in getConversationHistory:", user_id);
    return res.status(401).json({ error: "Unauthorized: Invalid user ID" });
  }

  console.log(
    "🔍 Fetching history for conversation:",
    conversation_id,
    "user:",
    user_id
  );

  try {
    // ✅ VERIFY CONVERSATION OWNERSHIP FIRST
    const ownershipCheck = await executeQuery(
      "SELECT id FROM conversations WHERE id = ? AND user_id = ? AND is_deleted = FALSE",
      [parseInt(conversation_id), user_id]
    );

    if (!ownershipCheck || ownershipCheck.length === 0) {
      console.error(
        "❌ Unauthorized access attempt - conversation:",
        conversation_id,
        "user:",
        user_id
      );
      return res.status(403).json({
        error: "Unauthorized: Conversation does not belong to user",
      });
    }

    // ✅ FETCH HISTORY ONLY AFTER OWNERSHIP VERIFICATION
    const history = await executeQuery(
      `SELECT id, user_message AS message, response, created_at, file_names, file_path, suggestions
       FROM chat_history
       WHERE conversation_id = ?
       ORDER BY created_at ASC`,
      [parseInt(conversation_id)]
    );

    if (!history || history.length === 0) {
      return res.status(200).json({ success: true, history: [] });
    }

    const formattedHistory = history.map((msg) => {
      const filePaths = msg.file_path ? msg.file_path.split(",") : [];
      const fileNames = msg.file_names ? msg.file_names.split(",") : [];

      const files = filePaths.map((path, index) => ({
        file_path: path,
        file_name: fileNames[index] || `file-${index + 1}`,
        type: path.split(".").pop() || "file",
      }));

      return {
        id: msg.id,
        sender: "user",
        message: msg.message,
        response: msg.response,
        suggestions: msg.suggestions ? JSON.parse(msg.suggestions) : [],
        files: files.length > 0 ? files : undefined,
        created_at: msg.created_at,
      };
    });

    console.log(
      "✅ Retrieved",
      formattedHistory.length,
      "messages for conversation:",
      conversation_id
    );

    return res.status(200).json({
      success: true,
      history: formattedHistory,
      conversation_id: parseInt(conversation_id),
      user_id: user_id, // Include for debugging
    });
  } catch (error) {
    console.error("❌ Error fetching conversation history:", error.message);
    return res
      .status(500)
      .json({ error: "Failed to retrieve conversation history" });
  }
};

// ✅ UPDATE CONVERSATION NAME WITH OWNERSHIP VALIDATION
exports.updateConversationName = async (req, res) => {
  const { conversationId } = req.params;
  const { name } = req.body;
  const user_id = req.user?.user_id;

  if (!name) {
    return res.status(400).json({ error: "New name is required" });
  }

  // ✅ USER VALIDATION
  if (!user_id || isNaN(user_id)) {
    console.error("❌ Invalid user_id in updateConversationName:", user_id);
    return res.status(401).json({ error: "Unauthorized: Invalid user ID" });
  }

  console.log(
    "🔍 Updating conversation name:",
    conversationId,
    "for user:",
    user_id
  );

  try {
    // ✅ VERIFY OWNERSHIP BEFORE UPDATE
    const ownershipCheck = await executeQuery(
      "SELECT id FROM conversations WHERE id = ? AND user_id = ? AND is_deleted = FALSE",
      [conversationId, user_id]
    );

    if (!ownershipCheck || ownershipCheck.length === 0) {
      console.error(
        "❌ Unauthorized update attempt - conversation:",
        conversationId,
        "user:",
        user_id
      );
      return res.status(403).json({
        error: "Unauthorized: Conversation does not belong to user",
      });
    }

    await executeQuery(
      "UPDATE conversations SET name = ? WHERE id = ? AND user_id = ?",
      [name, conversationId, user_id]
    );

    console.log("✅ Updated conversation name:", conversationId, "to:", name);
    return res.status(200).json({ success: true, name });
  } catch (error) {
    console.error("❌ Error renaming conversation:", error.message);
    return res.status(500).json({ error: "Failed to rename conversation" });
  }
};

// ✅ GET CHAT HISTORY WITH USER VALIDATION
exports.getChatHistory = async (req, res) => {
  const user_id = req.user?.user_id;

  // ✅ USER VALIDATION
  if (!user_id || isNaN(user_id)) {
    console.error("❌ Invalid user_id in getChatHistory:", user_id);
    return res.status(401).json({ error: "Unauthorized: Invalid user ID" });
  }

  console.log("🔍 Fetching chat history for user_id:", user_id);

  try {
    const history = await executeQuery(
      "SELECT id, user_message AS message, response, created_at FROM chat_history WHERE user_id = ? ORDER BY created_at DESC",
      [user_id]
    );

    console.log("✅ Found", history.length, "chat messages for user:", user_id);

    res.json({
      success: true,
      history: history.length > 0 ? history : [],
      message: history.length === 0 ? "No chat history found" : undefined,
      user_id: user_id, // Include for debugging
    });
  } catch (error) {
    console.error(
      "❌ Error fetching chat history for user",
      user_id,
      ":",
      error.message
    );
    res.status(500).json({ error: "Failed to retrieve chat history" });
  }
};

exports.askChatbot = async (req, res) => {
  console.log("✅ Received request at /chat:", req.body);

  let { userMessage, conversation_id, extracted_summary } = req.body;
  const user_id = req.user?.user_id;
  const uploadedFiles = req.body.uploaded_file_metadata || [];

  // ✅ STRICT USER VALIDATION
  if (!user_id || isNaN(user_id)) {
    console.error("❌ Invalid user_id in askChatbot:", user_id);
    return res.status(401).json({ error: "Unauthorized: Invalid user ID" });
  }

  if (!userMessage && !extracted_summary) {
    return res.status(400).json({
      error: "User message or extracted summary is required",
    });
  }

  console.log("🔍 Processing chat for user_id:", user_id, "conversation:", conversation_id);

  try {
    // Set headers for streaming
    res.writeHead(200, {
      "Content-Type": "text/plain; charset=utf-8",
      "Transfer-Encoding": "chunked",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Cache-Control",
    });

    // ✅ VERIFY CONVERSATION OWNERSHIP IF PROVIDED (Quick check)
    if (conversation_id && !isNaN(conversation_id)) {
      const ownershipCheck = await executeQuery(
        "SELECT id FROM conversations WHERE id = ? AND user_id = ? AND is_deleted = FALSE",
        [conversation_id, user_id]
      );

      if (!ownershipCheck || ownershipCheck.length === 0) {
        console.error("❌ Unauthorized conversation access");
        res.write(JSON.stringify({
          type: "error",
          error: "Unauthorized: Conversation does not belong to user",
        }) + "\n");
        res.end();
        return;
      }
    }

    // 🚀 IMMEDIATE PARALLEL PROCESSING - Start all tasks simultaneously
    const startTime = Date.now();
    
    // Task 1: URL Processing (Non-blocking)
    const urlProcessingPromise = processUrlsOptimized(userMessage, res);
    
    // Task 2: Context Retrieval (Optimized single query)
    const contextPromise = getConversationContextOptimized(conversation_id, user_id);
    
    // Task 3: Generate suggestions (Parallel)
    const suggestionPromise = generateFastSuggestions(userMessage);

  

   // ⚡ Get context immediately (don't wait for URLs or title)
const contextResult = await contextPromise;
const { summaryContext, shouldRename, newConversationName  } = contextResult;

console.log(`⚡ Context loaded in ${Date.now() - startTime}ms`);

// 🧠 GET USER INFO FOR PERSONALIZED RESPONSES
let userInfo = null;
try {
  const userResult = await executeQuery(
    "SELECT username FROM users WHERE id = ?",
    [user_id]
  );
  if (userResult && userResult.length > 0) {
    userInfo = { username: userResult[0].username };
    console.log("✅ User info loaded:", userInfo.username);
  }
} catch (userError) {
  console.log("⚠️ Could not fetch user info for personalization:", userError.message);
}

// 🧠 BUILD AI MESSAGES EFFICIENTLY WITH USER CONTEXT
const finalMessages = buildAIMessages(summaryContext, extracted_summary, userMessage, uploadedFiles, userInfo);


    // 🚀 START AI RESPONSE STREAM IMMEDIATELY (Don't wait for URLs)
    let aiResponse = "";
    const aiStartTime = Date.now();

    try {
      const stream = await deepseek.chat.completions.create({
        model: "deepseek-chat",
        messages: finalMessages,
        temperature: 0.7,
        max_tokens: 1200,
        stream: true,
      });

      // Send initial metadata immediately
      res.write(JSON.stringify({
        type: "start",
        conversation_id,
        conversation_name: shouldRename ? "Generating title..." : newConversationName,
        conversation_renamed: shouldRename,
        uploaded_files: uploadedFiles.map((file) => ({
          file_name: file.file_name,
          file_path: file.file_path,
          file_type: file.file_name?.split(".").pop()?.toLowerCase() || null,
        })),
        context: {
          document_available: !!extracted_summary,
          conversation_context_available: !!summaryContext,
        },
        processing_time: Date.now() - startTime,
      }) + "\n");

      console.log(`🚀 AI stream started in ${Date.now() - aiStartTime}ms`);

      // Stream the response chunks
      for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content || "";
        if (content) {
          aiResponse += content;
          res.write(JSON.stringify({
            type: "content",
            content: content,
          }) + "\n");
        }
      }

      // Wait for remaining tasks to complete
      const [urlResult, suggestions] = await Promise.all([
        urlProcessingPromise,
        suggestionPromise,
      ]);

      const { urlData, urlContent, processedUrls, fullUserMessage } = urlResult;

      // 🚀 HANDLE RENAME RESULT
      let finalConversationName = newConversationName;
      if (shouldRename) {
        try {
          const renameResult = await executeRename(conversation_id, userMessage, user_id);
          if (renameResult.success) {
            finalConversationName = renameResult.title;
            res.write(JSON.stringify({
              type: "conversation_renamed",
              conversation_id: conversation_id,
              new_name: finalConversationName,
              success: true,
            }) + "\n");
          }
        } catch (renameError) {
          console.error("❌ Rename failed:", renameError);
        }
      }

      // Send final data
      res.write(JSON.stringify({
        type: "end",
        suggestions: suggestions,
        full_response: aiResponse,
        processed_urls: urlData.map((data) => ({
          url: data.url,
          title: data.title,
          success: !data.error,
          error: data.error,
        })),
        context: {
          document_available: !!extracted_summary,
          conversation_context_available: !!summaryContext,
          url_content_available: !!urlContent,
          urls_processed: urlData.length,
        },
        total_processing_time: Date.now() - startTime,
      }) + "\n");

      res.end();

      // 🔄 BACKGROUND PROCESSING (AFTER RESPONSE SENT)
      process.nextTick(() => {
        handleAllBackgroundTasksOptimized(
          conversation_id,
          fullUserMessage,
          aiResponse,
          uploadedFiles,
          extracted_summary,
          suggestions,
          user_id,
          false,
          finalConversationName,
          processedUrls,
          urlData,
          urlContent
        );
      });

    } catch (aiError) {
      console.error("AI API error:", aiError);
      res.write(JSON.stringify({
        type: "error",
        error: "I'm having trouble processing your request. Please try again.",
      }) + "\n");
      res.end();
    }
  } catch (error) {
    console.error("❌ Chat controller error:", error.message);
    if (!res.headersSent) {
      res.status(500).json({ error: "Internal server error" });
    }
  }
};

// 🚀 OPTIMIZED URL PROCESSING - Non-blocking with immediate feedback
async function processUrlsOptimized(userMessage, res) {
  let urlData = [];
  let urlContent = "";
  let processedUrls = [];
  let fullUserMessage = userMessage || "";

  if (!userMessage) {
    return { urlData, urlContent, processedUrls, fullUserMessage };
  }

  const extractedUrls = extractUrls(userMessage);
  
  if (extractedUrls.length === 0) {
    return { urlData, urlContent, processedUrls, fullUserMessage };
  }

  console.log(`🔗 Found ${extractedUrls.length} URLs - processing optimized`);

  // Send URL processing status immediately
  res.write(JSON.stringify({
    type: "url_processing",
    status: "started",
    urls: extractedUrls,
    count: extractedUrls.length,
  }) + "\n");

  try {
    // ⚡ Process URLs with timeout and parallel processing
    const urlPromises = extractedUrls.map(async (url) => {
      try {
        // Set a 3-second timeout for each URL
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('URL processing timeout')), 3000)
        );
        
        const urlProcessPromise = processUrls([url]);
        
        const result = await Promise.race([urlProcessPromise, timeoutPromise]);
        return result[0]; // processUrls returns array
      } catch (error) {
        console.error(`❌ URL processing failed for ${url}:`, error.message);
        return {
          url: url,
          title: "Failed to load",
          content: "",
          error: error.message,
        };
      }
    });

    // Wait for all URLs with a maximum 4-second total timeout
    const allUrlsPromise = Promise.all(urlPromises);
    const totalTimeoutPromise = new Promise((resolve) =>
      setTimeout(() => {
        console.log("⚠️ URL processing timeout - proceeding with partial results");
        resolve([]);
      }, 4000)
    );

    urlData = await Promise.race([allUrlsPromise, totalTimeoutPromise]);
    
    if (urlData && urlData.length > 0) {
      processedUrls = extractedUrls;
      
      // Create URL content summary
      urlContent = urlData
        .filter((data) => data && data.content && !data.error)
        .map((data) => 
          `URL: ${data.url}\nTitle: ${data.title}\nContent: ${data.content.substring(0, 1500)}\n---`
        )
        .join("\n");

      // Add URL references to user message
      if (processedUrls.length > 0) {
        fullUserMessage += `\n[Referenced URLs: ${processedUrls.join(", ")}]`;
      }

      // Send completion status
      res.write(JSON.stringify({
        type: "url_processing",
        status: "completed",
        processed: urlData.length,
        successful: urlData.filter((d) => d && !d.error).length,
      }) + "\n");
    }

  } catch (error) {
    console.error("❌ URL processing error:", error);
    res.write(JSON.stringify({
      type: "url_processing",
      status: "error",
      error: "Failed to process URLs",
    }) + "\n");
  }

  return { urlData, urlContent, processedUrls, fullUserMessage };
}

// 🚀 OPTIMIZED CONTEXT RETRIEVAL - Single optimized query
async function getConversationContextOptimized(conversation_id, user_id) {
  if (!conversation_id) {
    return {
      summaryContext: "",
      shouldRename: false,
      newConversationName: null,
    };
  }

  try {
    // ⚡ Single optimized query to get everything we need
    const results = await executeQuery(
      `SELECT 
        c.name as conversation_name,
        ch.summarized_chat,
        ch.user_message,
        ch.response,
        ch.url_content,
        ch.extracted_text
       FROM conversations c
       LEFT JOIN chat_history ch ON ch.conversation_id = c.id
       WHERE c.id = ? AND c.user_id = ?
       ORDER BY ch.created_at DESC
       LIMIT 5`,
      [conversation_id, user_id]
    );

    let summaryContext = "";
    let shouldRename = false;
    let newConversationName = null;

    if (results && results.length > 0) {
      const conversationName = results[0]?.conversation_name;

      // Check if rename needed
      if (conversationName === "New Conversation" || 
          conversationName === "New Chat" || 
          !conversationName) {
        shouldRename = true;
      }

      // ⚡ Priority: Use latest summarized_chat first
      const latestSummary = results.find(r => r.summarized_chat)?.summarized_chat;
      
      if (latestSummary) {
        summaryContext = latestSummary;
        console.log("✅ Using existing summary for context");
      } else {
        // Fallback: Create quick context from recent messages
        const recentContext = results
          .filter((item) => item.user_message || item.response)
          .slice(0, 3)
          .reverse()
          .map((item) => {
            let context = "";
            if (item.user_message) context += `User: ${item.user_message.substring(0, 150)}\n`;
            if (item.response) context += `AI: ${item.response.substring(0, 150)}\n`;
            return context;
          })
          .join("");

        if (recentContext) {
          summaryContext = `Recent conversation:\n${recentContext}`;
          console.log("✅ Using recent messages for context");
        }
      }
    }

    return { summaryContext, shouldRename, newConversationName };
  } catch (error) {
    console.error("❌ Context fetch error:", error);
    return {
      summaryContext: "",
      shouldRename: false,
      newConversationName: null,
    };
  }
}

 
// 🧠 BUILD AI MESSAGES EFFICIENTLY - Normal function with user context
function buildAIMessages(summaryContext, extracted_summary, userMessage, uploadedFiles, userInfo = null) {
  const currentDate = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  // Build user context for personalized responses
  let userContext = "";
  if (userInfo && userInfo.username) {
    userContext = `The user's name is ${userInfo.username}. When greeting or addressing the user, you can use their name for a more personalized experience.`;
  }

  const systemPrompt = {
    role: "system",
    content: `You are QhashAI — a highly intelligent AI assistant created by the QuantumHash development team in 2024.

Current date: ${currentDate}.

${userContext}

When asked your name: "My name is QhashAI."
Developer: "I was developed by the QuantumHash development team."

You can analyze content from URLs and documents. When referencing external content, cite your sources.

Be helpful, accurate, professional, and use all available context to provide the best possible response.`,
  };

  const finalMessages = [systemPrompt];

  // Add conversation context if available (prioritized)
  if (summaryContext) {
    finalMessages.push({
      role: "system",
      content: `CONVERSATION CONTEXT: ${summaryContext}`,
    });
  }

  // Add document context if available
  if (extracted_summary && extracted_summary !== "No readable content") {
    finalMessages.push({
      role: "system",
      content: `DOCUMENT CONTEXT:\n${extracted_summary.substring(0, 8000)}`,
    });
  }

  // Prepare user message
  let fullUserMessage = userMessage || "";
  if (Array.isArray(uploadedFiles) && uploadedFiles.length > 0) {
    const fileNames = uploadedFiles.map((f) => f?.file_name).filter(Boolean);
    if (fileNames.length > 0) {
      fullUserMessage += `\n[Uploaded files: ${fileNames.join(", ")}]`;
    }
  }

  finalMessages.push({ role: "user", content: fullUserMessage });

  return finalMessages;
}






// 🚀 OPTIMIZED FAST SUGGESTIONS
// async function generateFastSuggestions(userMessage) {
//   try {
//     const suggestionResult = await deepseek.chat.completions.create({
//       model: "deepseek-chat",
//       messages: [
//         {
//           role: "system",
//           content: "Generate 5 short follow-up questions. Reply only with numbered list.",
//         },
//         { role: "user", content: userMessage || "Continue the conversation" },
//       ],
//       temperature: 0.8,
//       max_tokens: 80, // Reduced for speed
//     });

//     const rawSuggestion = suggestionResult.choices?.[0]?.message?.content || "";
//     return rawSuggestion
//       .split("\n")
//       .map((s) => s.replace(/^[\s\d\-•.]+/, "").replace(/[.?!]+$/, "").trim())
//       .filter(Boolean)
//       .slice(0, 5);
//   } catch (error) {
//     console.error("❌ Fast suggestion failed:", error);
//     return ["Tell me more about this", "What are the next steps?", "Can you provide more details?"];
//   }
// }
// 🚀 OPTIMIZED FAST SUGGESTIONS - Async function with timeout
async function generateFastSuggestions(userMessage, aiResponse = null) {
  try {
    // Build context from both user message and AI response
    let context = userMessage || "Continue the conversation";
    
    if (aiResponse && aiResponse.trim().length > 20) {
      // Add AI response context (first 500 chars for efficiency)
      const responsePreview = aiResponse.length > 500 
        ? aiResponse.substring(0, 500) + "..." 
        : aiResponse;
      context = `User asked: "${userMessage}"\nAI responded: "${responsePreview}"`;
    }

    const suggestionResult = await deepseek.chat.completions.create({
      model: "deepseek-chat",
      messages: [
        {
          role: "system",
          content: "Based on the conversation, generate 5 short follow-up questions that the user would naturally ask next. Make them specific to the topics discussed. Reply only with numbered list.",
        },
        { role: "user", content: context },
      ],
      temperature: 0.8,
      max_tokens: 120, // Increased slightly for better quality
    });

    const rawSuggestion = suggestionResult.choices?.[0]?.message?.content || "";
    return rawSuggestion
      .split("\n")
      .map((s) => s.replace(/^[\s\d\-•.]+/, "").replace(/[.?!]+$/, "").trim())
      .filter(Boolean)
      .slice(0, 5);
  } catch (error) {
    console.error("❌ Fast suggestion failed:", error);
    return ["Can you explain this further?", "What are some examples?", "How can I apply this?"];
  }
}



 
// 🚀 OPTIMIZED BACKGROUND TASKS WITH USER VALIDATION AND URL SUPPORT - Async function
async function handleAllBackgroundTasksOptimized(
  conversation_id,
  userMessage,
  aiResponse,
  uploadedFiles,
  extracted_summary,
  suggestions,
  user_id,
  shouldRename,
  newConversationName,
  processedUrls = [],
  urlData = [],
  urlContent = ""
) {
  try {
    console.log("🔄 Starting optimized background tasks for conversation:", conversation_id, "user:", user_id);

    // ✅ USER VALIDATION IN BACKGROUND TASKS
    if (!user_id || isNaN(user_id)) {
      console.error("❌ Invalid user_id in background tasks:", user_id);
      return;
    }

    // 🚀 STEP 1: Create conversation if needed
    if (!conversation_id || isNaN(conversation_id)) {
      try {
        const conversationResult = await executeQuery(
          "INSERT INTO conversations (user_id, name) VALUES (?, ?)",
          [user_id, newConversationName || userMessage?.substring(0, 20) || "New Chat"]
        );

        conversation_id = conversationResult.insertId;
        console.log("✅ Created new conversation:", conversation_id, "for user:", user_id);
      } catch (convError) {
        console.error("❌ Conversation creation failed:", convError);
        return;
      }
    }

    // 🚀 STEP 2: Parallel background operations with timeout
    const backgroundTasks = [
      // Save to database with URL data
      Promise.race([
        saveToDatabase(conversation_id, userMessage, aiResponse, uploadedFiles, extracted_summary, suggestions, processedUrls, urlData),
        new Promise((resolve) => setTimeout(() => resolve({ timeout: true }), 5000))
      ]),

      // Rename conversation ONLY if needed
      shouldRename
        ? Promise.race([
            executeRename(conversation_id, userMessage, user_id),
            new Promise((resolve) => setTimeout(() => resolve({ timeout: true }), 3000))
          ])
        : Promise.resolve(false),

      // Generate comprehensive summary
      Promise.race([
        generateAndSaveComprehensiveSummary(conversation_id, userMessage, aiResponse, urlContent),
        new Promise((resolve) => setTimeout(() => resolve({ timeout: true }), 8000))
      ]),
    ];

    const [dbResult, renameResult, summaryResult] = await Promise.allSettled(backgroundTasks);

    console.log("✅ Optimized background tasks completed:", {
      database: dbResult.status === "fulfilled" && !dbResult.value?.timeout ? "✅ Saved" : "❌ Failed/Timeout",
      rename: shouldRename
        ? renameResult.status === "fulfilled" && !renameResult.value?.timeout ? "✅ Done" : "❌ Failed/Timeout"
        : "⏭️ Skipped",
      summary: summaryResult.status === "fulfilled" && !summaryResult.value?.timeout ? "✅ Generated" : "❌ Failed/Timeout",
      conversation_id: conversation_id,
      user_id: user_id,
      urls_processed: urlData.length,
    });
  } catch (error) {
    console.error("❌ Optimized background tasks failed:", error);
  }
}


 
// 🚀 SAVE TO DATABASE WITH URL SUPPORT - Async function
async function saveToDatabase(
  conversation_id,
  userMessage,
  aiResponse,
  uploadedFiles,
  extracted_summary,
  suggestions,
  processedUrls = [],
  urlData = []
) {
  try {
    const filePaths = uploadedFiles
      .map((f) => f?.file_path)
      .filter(Boolean)
      .join(",");
    const fileNames = uploadedFiles
      .map((f) => f?.file_name)
      .filter(Boolean)
      .join(",");

    // Prepare URL data for database
    const urlsString = processedUrls.length > 0 ? processedUrls.join(",") : null;

    const urlContentString = urlData.length > 0
      ? urlData
          .filter((data) => data && data.content && !data.error)
          .map((data) => `[${data.title || 'Untitled'}] ${data.content}`)
          .join("\n---\n")
      : null;

    const urlMetadata = urlData.length > 0
      ? JSON.stringify(
          urlData.map((data) => ({
            url: data?.url || '',
            title: data?.title || 'Untitled',
            description: data?.description || '',
            success: !data?.error,
            error: data?.error || null,
            metadata: data?.metadata || null,
          }))
        )
      : null;

    await executeQuery(
      `INSERT INTO chat_history 
       (conversation_id, user_message, response, created_at, file_path, extracted_text, file_names, suggestions, urls, url_content, url_metadata) 
       VALUES (?, ?, ?, NOW(), ?, ?, ?, ?, ?, ?, ?)`,
      [
        conversation_id,
        userMessage,
        aiResponse,
        filePaths || null,
        extracted_summary || null,
        fileNames || null,
        JSON.stringify(suggestions) || null,
        urlsString,
        urlContentString,
        urlMetadata,
      ]
    );

    console.log("✅ Database save successful for conversation:", conversation_id, "with", urlData.length, "URLs");
    return true;
  } catch (error) {
    console.error("❌ Database save error:", error);
    throw error;
  }
}


// 🏷️ EXECUTE RENAME WITH USER VALIDATION AND AI TITLE GENERATION - Async function
async function executeRename(conversation_id, userMessage, user_id) {
  try {
    // Generate AI title based on user message
    const aiGeneratedTitle = await generateConversationTitle(userMessage);

    await executeQuery(
      "UPDATE conversations SET name = ? WHERE id = ? AND user_id = ?",
      [aiGeneratedTitle, conversation_id, user_id]
    );

    console.log(`🏷️ Conversation renamed to: "${aiGeneratedTitle}" for user:`, user_id);
    return { success: true, title: aiGeneratedTitle };
  } catch (error) {
    console.error("❌ Rename execution error:", error);
    throw error;
  }
}


 
// 🤖 GENERATE AI TITLE BASED ON USER MESSAGE - Async function
async function generateConversationTitle(userMessage) {
  try {
    if (!userMessage || userMessage.length < 5) {
      return "New Conversation";
    }

    const titleResult = await deepseek.chat.completions.create({
      model: "deepseek-chat",
      messages: [
        {
          role: "system",
          content: "Generate a short, descriptive title (3-6 words) for a conversation based on the user's first message. Reply with only the title, no quotes or extra text.",
        },
        {
          role: "user",
          content: userMessage.substring(0, 200), // Limit input for efficiency
        },
      ],
      temperature: 0.3,
      max_tokens: 20,
    });

    const aiTitle = titleResult.choices?.[0]?.message?.content?.trim();

    if (aiTitle && aiTitle.length > 0 && aiTitle.length <= 50) {
      console.log(`🤖 AI generated title: "${aiTitle}"`);
      return aiTitle;
    }

    // Fallback to truncated user message
    return userMessage.length > 20
      ? userMessage.substring(0, 17) + "..."
      : userMessage;
  } catch (error) {
    console.error("❌ AI title generation failed:", error);
    // Fallback to truncated user message
    return userMessage.length > 20
      ? userMessage.substring(0, 17) + "..."
      : userMessage;
  }
}


 
// 🧠 GENERATE COMPREHENSIVE SUMMARY (BACKGROUND) - Async function with URL content
async function generateAndSaveComprehensiveSummary(
  conversation_id,
  currentUserMessage,
  currentAiResponse,
  urlContent = ""
) {
  try {
    console.log("🧠 Generating comprehensive summary...");

    // Check message count
    const messageCountResult = await executeQuery(
      "SELECT COUNT(*) as count FROM chat_history WHERE conversation_id = ?",
      [conversation_id]
    );

    const messageCount = messageCountResult[0]?.count || 0;

    if (messageCount < 1) {
      console.log("🔄 No messages yet for summary generation");
      return false;
    }

    // Get ENTIRE conversation history including URL content
    const fullHistory = await executeQuery(
      "SELECT user_message, response, url_content, extracted_text FROM chat_history WHERE conversation_id = ? ORDER BY created_at ASC",
      [conversation_id]
    );

    // Build complete conversation with URL context and document context
    const completeConversation = [];
    const allDocumentContext = [];

    fullHistory.forEach((chat) => {
      if (chat.user_message) {
        let userContent = chat.user_message;

        // Add URL context if available
        if (chat.url_content) {
          userContent += `\n[URL Context: ${chat.url_content.substring(0, 1000)}]`;
        }

        // Add document context if available
        if (chat.extracted_text) {
          userContent += `\n[Document Context: ${chat.extracted_text.substring(0, 500)}]`;
          allDocumentContext.push(chat.extracted_text);
        }

        completeConversation.push({ role: "user", content: userContent });
      }

      if (chat.response) {
        completeConversation.push({
          role: "assistant",
          content: chat.response,
        });
      }
    });

    // Add current exchange with URL content
    let currentUserContent = currentUserMessage;
    if (urlContent) {
      currentUserContent += `\n[Current URL Context: ${urlContent.substring(0, 1000)}]`;
    }

    completeConversation.push({ role: "user", content: currentUserContent });
    completeConversation.push({
      role: "assistant",
      content: currentAiResponse,
    });

    console.log(`📊 Creating summary for ${completeConversation.length} messages`);

    // Create comprehensive summary
    const conversationText = completeConversation
      .map((msg) => `${msg.role}: ${msg.content}`)
      .join("\n");

    const summaryPrompt = [
      {
        role: "system",
        content: `Create a comprehensive summary of this conversation that will serve as context for future AI responses. Include:

1. Main topics and questions discussed
2. Key information shared (including URL content, document content, and file uploads)
3. User's specific needs, preferences, and requirements
4. Important context and background information
5. Any technical details, examples, or specific requests
6. User's communication style and preferences

This summary will be used to maintain context in future conversations, so be thorough and include all relevant details that would help provide better responses.

Keep it detailed but well-organized (150-400 words depending on conversation length).`,
      },
      {
        role: "user",
        content: `Conversation to summarize:\n${conversationText.substring(0, 12000)}`,
      },
    ];

    const summaryResult = await deepseek.chat.completions.create({
      model: "deepseek-chat",
      messages: summaryPrompt,
      temperature: 0.2,
      max_tokens: 500,
    });

    const summary = summaryResult.choices?.[0]?.message?.content || "";

    if (summary && summary.length > 10) {
      await executeQuery(
        "UPDATE chat_history SET summarized_chat = ? WHERE conversation_id = ? ORDER BY created_at DESC LIMIT 1",
        [summary, conversation_id]
      );

      console.log("✅ Summary generated and saved:", {
        length: summary.length,
        message_count: completeConversation.length,
        conversation_id: conversation_id,
        summary_preview: summary.substring(0, 100) + "...",
      });

      return true;
    }

    console.log("⚠️ Summary generation failed - empty or too short");
    return false;
  } catch (error) {
    console.error("❌ Comprehensive summary generation failed:", error);

    // Fallback: Create a basic summary
    try {
      const basicSummary = `User discussed: ${currentUserMessage.substring(0, 200)}${
        currentUserMessage.length > 200 ? "..." : ""
      }. AI provided assistance with this topic.${urlContent ? " URLs were referenced in the conversation." : ""}`;

      await executeQuery(
        "UPDATE chat_history SET summarized_chat = ? WHERE conversation_id = ? ORDER BY created_at DESC LIMIT 1",
        [basicSummary, conversation_id]
      );

      console.log("✅ Fallback summary saved");
      return true;
    } catch (fallbackError) {
      console.error("❌ Even fallback summary failed:", fallbackError);
      return false;
    }
  }
}


exports.guestChat = async (req, res) => {
  const { userMessage } = req.body;
  if (!userMessage || typeof userMessage !== "string") {
    return res.status(400).json({ error: "Message is required." });
  }

  try {
    // Set headers for streaming
    res.writeHead(200, {
      "Content-Type": "text/plain; charset=utf-8",
      "Transfer-Encoding": "chunked",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Cache-Control",
    });

    // 🚀 IMMEDIATE PARALLEL PROCESSING - Start all tasks simultaneously
    const startTime = Date.now();

    // Task 1: URL Processing (Non-blocking)
    const urlProcessingPromise = processUrlsOptimizedGuest(userMessage, res);

    // 📅 Get current date
    const currentDate = new Date().toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });

    // 🧠 Enhanced system prompt with URL capabilities for guest mode
    const systemPrompt = {
      role: "system",
      content: `You are QhashAI, an AI assistant by QuantumHash team (2024). Current date: ${currentDate}.

You can analyze and understand content from URLs that users share. When referencing URL content, be specific about which website or source you're citing.

Be helpful, accurate, and concise. This is guest mode, so provide complete responses without requiring conversation history.`,
    };

    const messages = [systemPrompt];

    // We'll add URL content after processing
    let aiResponse = "";

    try {
      // Send initial metadata immediately
      res.write(JSON.stringify({
        type: "start",
        guest_mode: true,
        context: {
          url_processing_started: true,
        },
        processing_time: Date.now() - startTime,
      }) + "\n");

      // 🚀 START AI RESPONSE STREAM IMMEDIATELY (Don't wait for URLs)
      let finalMessages = [...messages];
      finalMessages.push({ role: "user", content: userMessage });

      const stream = await deepseek.chat.completions.create({
        model: "deepseek-chat",
        messages: finalMessages,
        temperature: 0.7,
        max_tokens: 1200,
        stream: true,
      });

      console.log(`🚀 Guest AI stream started in ${Date.now() - startTime}ms`);

      // Stream the response chunks
      for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content || "";
        if (content) {
          aiResponse += content;
          res.write(JSON.stringify({
            type: "content",
            content: content,
          }) + "\n");
        }
      }

      // Wait for URL processing to complete
      const urlResult = await urlProcessingPromise;
      const { urlData, urlContent, processedUrls } = urlResult;

      // 🚀 GENERATE SIMPLE CONTEXTUAL SUGGESTIONS AFTER AI RESPONSE
      console.log("🎯 Generating guest suggestions based on conversation...");
      const suggestions = await generateFastGuestSuggestions(userMessage, aiResponse);

      // Send final data
      res.write(JSON.stringify({
        type: "end",
        suggestions: suggestions,
        full_response: aiResponse,
        guest_mode: true,
        processed_urls: urlData.map((data) => ({
          url: data.url,
          title: data.title,
          success: !data.error,
          error: data.error,
          description: data.description,
        })),
        context: {
          url_content_available: !!urlContent,
          urls_processed: urlData.length,
        },
        total_processing_time: Date.now() - startTime,
      }) + "\n");

      res.end();

      // 📊 Optional: Log guest interactions with URLs for analytics (without storing personal data)
      if (urlData.length > 0) {
        console.log(`📊 Guest interaction: ${urlData.length} URLs processed, ${urlData.filter((d) => !d.error).length} successful`);
      }

    } catch (aiError) {
      console.error("AI API error in guest mode:", aiError);
      res.write(JSON.stringify({
        type: "error",
        error: "I'm having trouble processing your request. Please try again.",
        guest_mode: true,
      }) + "\n");
      res.end();
    }
  } catch (error) {
    console.error("❌ Guest chat error:", error.stack || error.message);
    if (!res.headersSent) {
      res.status(500).json({ error: "Internal server error." });
    }
  }
};

// 🚀 OPTIMIZED URL PROCESSING FOR GUEST - Non-blocking with immediate feedback
async function processUrlsOptimizedGuest(userMessage, res) {
  let urlData = [];
  let urlContent = "";
  let processedUrls = [];

  if (!userMessage) {
    return { urlData, urlContent, processedUrls };
  }

  const extractedUrls = extractUrls(userMessage);
  
  if (extractedUrls.length === 0) {
    return { urlData, urlContent, processedUrls };
  }

  console.log(`🔗 Guest mode: Found ${extractedUrls.length} URLs - processing optimized`);

  // Send URL processing status immediately
  res.write(JSON.stringify({
    type: "url_processing",
    status: "started",
    urls: extractedUrls,
    count: extractedUrls.length,
    guest_mode: true,
  }) + "\n");

  try {
    // ⚡ Process URLs with timeout and parallel processing
    const urlPromises = extractedUrls.map(async (url) => {
      try {
        // Set a 3-second timeout for each URL
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('URL processing timeout')), 3000)
        );
        
        const urlProcessPromise = processUrls([url]);
        
        const result = await Promise.race([urlProcessPromise, timeoutPromise]);
        return result[0]; // processUrls returns array
      } catch (error) {
        console.error(`❌ URL processing failed for ${url}:`, error.message);
        return {
          url: url,
          title: "Failed to load",
          content: "",
          error: error.message,
        };
      }
    });

    // Wait for all URLs with a maximum 4-second total timeout
    const allUrlsPromise = Promise.all(urlPromises);
    const totalTimeoutPromise = new Promise((resolve) =>
      setTimeout(() => {
        console.log("⚠️ Guest URL processing timeout - proceeding with partial results");
        resolve([]);
      }, 4000)
    );

    urlData = await Promise.race([allUrlsPromise, totalTimeoutPromise]);
    
    if (urlData && urlData.length > 0) {
      processedUrls = extractedUrls;
      
      // Create URL content summary
      urlContent = urlData
        .filter((data) => data && data.content && !data.error)
        .map((data) => 
          `URL: ${data.url}\nTitle: ${data.title}\nContent: ${data.content.substring(0, 1500)}\n---`
        )
        .join("\n");

      // Send completion status
      res.write(JSON.stringify({
        type: "url_processing",
        status: "completed",
        processed: urlData.length,
        successful: urlData.filter((d) => d && !d.error).length,
        guest_mode: true,
      }) + "\n");
    }

  } catch (error) {
    console.error("❌ Guest URL processing error:", error);
    res.write(JSON.stringify({
      type: "url_processing",
      status: "error",
      error: "Failed to process URLs",
      guest_mode: true,
    }) + "\n");
  }

  return { urlData, urlContent, processedUrls };
}

// 🚀 SIMPLE FAST SUGGESTIONS FOR GUEST CHAT
async function generateFastGuestSuggestions(userMessage, aiResponse = null) {
  try {
    // Build context from both user message and AI response
    let context = userMessage || "Continue the conversation";
    
    if (aiResponse && aiResponse.trim().length > 20) {
      // Add AI response context (first 500 chars for efficiency)
      const responsePreview = aiResponse.length > 500 
        ? aiResponse.substring(0, 500) + "..." 
        : aiResponse;
      context = `User asked: "${userMessage}"\nAI responded: "${responsePreview}"`;
    }

    const suggestionResult = await deepseek.chat.completions.create({
      model: "deepseek-chat",
      messages: [
        {
          role: "system",
          content: "Based on the conversation, generate 3 short follow-up questions that the user would naturally ask next. Make them specific to the topics discussed. Reply only with numbered list.",
        },
        { role: "user", content: context },
      ],
      temperature: 0.8,
      max_tokens: 100, // Reduced for guest mode speed
    });

    const rawSuggestion = suggestionResult.choices?.[0]?.message?.content || "";
    const suggestions = rawSuggestion
      .split("\n")
      .map((s) => s.replace(/^[\s\d\-•.]+/, "").replace(/[.?!]+$/, "").trim())
      .filter(Boolean)
      .slice(0, 3); // Only 3 suggestions for guest mode

    return suggestions.length > 0 ? suggestions : [];
  } catch (error) {
    console.error("❌ Guest suggestion failed:", error);
    return [];
  }
}


//  delete function
exports.softDeleteConversation = async (req, res) => {
  const { id } = req.params;
  const userId = req.user?.user_id;

  // ✅ USER VALIDATION
  if (!userId || isNaN(userId)) {
    console.error("❌ Invalid user_id in softDeleteConversation:", userId);
    return res.status(401).json({ error: "Unauthorized: Invalid user ID" });
  }

  console.log("🔍 Soft deleting conversation:", id, "for user:", userId);

  try {
    // Step 1: Check if the conversation exists and belongs to the user
    const conversationCheck = await executeQuery(
      "SELECT id FROM conversations WHERE id = ? AND user_id = ? AND is_deleted = FALSE",
      [id, userId]
    );

    if (!conversationCheck || conversationCheck.length === 0) {
      console.error(
        "❌ Unauthorized delete attempt - conversation:",
        id,
        "user:",
        userId
      );
      return res
        .status(404)
        .json({ error: "Conversation not found or unauthorized" });
    }

    // Step 2: Count remaining conversations after potential deletion
    const remainingConversationsResult = await executeQuery(
      "SELECT COUNT(*) as count FROM conversations WHERE user_id = ? AND is_deleted = FALSE AND id != ?",
      [userId, id]
    );

    const remainingConversations = remainingConversationsResult[0]?.count || 0;

    // Step 3: Check if there's chat history in the conversation being deleted
    const chatHistoryResult = await executeQuery(
      "SELECT COUNT(*) as count FROM chat_history WHERE conversation_id = ?",
      [id]
    );

    const hasChatHistory = (chatHistoryResult[0]?.count || 0) > 0;

    // Step 4: Apply the logic based on your requirements
    if (remainingConversations > 0) {
      // There are other conversations left, safe to delete this one
      await executeQuery(
        "UPDATE conversations SET is_deleted = TRUE WHERE id = ? AND user_id = ?",
        [id, userId]
      );

      console.log(
        `✅ Conversation ${id} soft deleted. ${remainingConversations} conversations remaining for user ${userId}.`
      );

      return res.json({
        success: true,
        message: "Conversation deleted successfully",
        action: "deleted",
      });
    } else {
      // This is the last conversation
      if (hasChatHistory) {
        // Has chat history: delete it and create/select a new conversation using createConversation logic

        // First, delete the current conversation
        await executeQuery(
          "UPDATE conversations SET is_deleted = TRUE WHERE id = ? AND user_id = ?",
          [id, userId]
        );

        console.log(
          `🗑️ Deleted last conversation ${id} with chat history for user ${userId}`
        );

        // Now use the same logic as createConversation to find/create and select a conversation
        const defaultName =
          (await generateConversationTitle("New Conversation")) ||
          "New Conversation";

        // Step 1: Find the most recent conversation for this user (excluding the deleted one)
        const recentConversations = await executeQuery(
          `SELECT id, name FROM conversations 
           WHERE user_id = ? AND is_deleted = FALSE
           ORDER BY created_at DESC 
           LIMIT 1`,
          [userId]
        );

        if (recentConversations && recentConversations.length > 0) {
          const recentConversation = recentConversations[0];

          // Step 2: Check if this conversation has any messages
          const messageCountResult = await executeQuery(
            `SELECT COUNT(*) as count FROM chat_history WHERE conversation_id = ?`,
            [recentConversation.id]
          );

          const messageCount = messageCountResult[0]?.count || 0;

          // If no messages, reuse this conversation
          if (messageCount === 0) {
            console.log(
              "🔄 Reused empty conversation:",
              recentConversation.id,
              "for user:",
              userId
            );
            return res.status(200).json({
              success: true,
              conversation_id: recentConversation.id,
              name: recentConversation.name,
              action: "deleted_and_selected_existing",
              message:
                "Conversation deleted and existing empty conversation selected",
              selected: true,
            });
          }
        }

        // Step 3: Create new conversation if none exists or recent one has messages
        const newConversationResult = await executeQuery(
          "INSERT INTO conversations (user_id, name) VALUES (?, ?)",
          [userId, defaultName]
        );

        const conversation_id = newConversationResult.insertId;

        if (!conversation_id) {
          throw new Error("Failed to get insert ID");
        }

        console.log(
          "✅ Created and selected new conversation:",
          conversation_id,
          "for user:",
          userId
        );

        return res.status(201).json({
          success: true,
          conversation_id,
          name: defaultName,
          action: "deleted_and_created_new",
          message:
            "Conversation deleted and new conversation created and selected",
          selected: true,
        });
      } else {
        // No chat history: keep the conversation (it's a feature!)
        console.log(
          `💡 Keeping conversation ${id} - it's your workspace and ready for new chats for user ${userId}!`
        );

        return res.status(200).json({
          success: true,
          message:
            "This is your active workspace! Start a new conversation here.",
          action: "kept_as_workspace",
          conversation_id: parseInt(id),
          workspace: true,
        });
      }
    }
  } catch (error) {
    console.error(
      "❌ Error in soft delete conversation for user",
      userId,
      ":",
      error
    );
    res.status(500).json({ error: "Internal server error" });
  }
};
