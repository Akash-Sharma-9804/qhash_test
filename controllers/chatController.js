const db = require("../config/db");
const openai = require("../config/openai");
const deepseek = require("../config/deepseek");
const { query } = require("../config/db"); // make sure you're importing correctly

exports.createConversation = async (req, res) => {
  const user_id = req.user?.user_id;
  if (!user_id) {
    return res.status(400).json({ error: "User ID is required" });
  }

  try {
    const defaultName = "New Conversation";
    console.log("📥 Incoming request body:", req.body);

    // Step 1: Find the most recent conversation for this user
    const recentConversationResult = await db.query(
      `SELECT id, name FROM conversations 
       WHERE user_id = ? 
       ORDER BY created_at DESC 
       LIMIT 1`,
      [user_id]
    );

    let recentConversation;
    if (Array.isArray(recentConversationResult)) {
      recentConversation = recentConversationResult[0];
    } else if (
      recentConversationResult &&
      Array.isArray(recentConversationResult[0])
    ) {
      recentConversation = recentConversationResult[0][0];
    }

    if (recentConversation) {
      // Step 2: Check if this conversation has any messages
      const messageCountResult = await db.query(
        `SELECT COUNT(*) as count FROM chat_history WHERE conversation_id = ?`,
        [recentConversation.id]
      );

      let messageCount;
      if (Array.isArray(messageCountResult)) {
        messageCount = messageCountResult[0]?.count || 0;
      } else if (messageCountResult && Array.isArray(messageCountResult[0])) {
        messageCount = messageCountResult[0][0]?.count || 0;
      }

      // If no messages, reuse this conversation
      if (messageCount === 0) {
        console.log("🔄 Reused empty conversation:", recentConversation.id);
        return res.status(200).json({
          success: true,
          conversation_id: recentConversation.id,
          name: recentConversation.name,
          action: "reused",
        });
      }
    }

    // Step 3: Create new conversation if none exists or recent one has messages
    const name = req.body.name || defaultName;
    const newConversationResult = await db.query(
      "INSERT INTO conversations (user_id, name) VALUES (?, ?)",
      [user_id, name]
    );

    let conversation_id;
    if (Array.isArray(newConversationResult)) {
      conversation_id = newConversationResult[0].insertId;
    } else if (newConversationResult && newConversationResult.insertId) {
      conversation_id = newConversationResult.insertId;
    } else {
      throw new Error("Failed to get insert ID");
    }

    console.log("✅ Created new conversation:", conversation_id);

    return res.status(201).json({
      success: true,
      conversation_id,
      name,
      action: "created",
    });
  } catch (error) {
    console.error("❌ Error creating conversation:", error);
    console.error("❌ Error stack:", error.stack);
    return res.status(500).json({
      error: "Failed to create or reuse conversation",
      details: error.message,
    });
  }
};

// ✅ Get all conversations for a user

exports.getConversations = async (req, res) => {
  const user_id = req.user.user_id;
  console.log("🔹 User ID in getConversations:", user_id);

  try {
    const rows = await db.query(
      "SELECT * FROM conversations WHERE user_id = ? AND is_deleted = FALSE ORDER BY created_at DESC",
      [user_id]
    );

    // console.log("🔍 Raw SQL result:", rows);

    // ✅ Ensure it's an array
    const conversations = Array.isArray(rows[0]) ? rows[0] : rows;

    // console.log("✅ Conversations (final processed):", conversations);
    res.json({ success: true, conversations });
  } catch (error) {
    console.error("❌ Error fetching conversations:", error.message);
    res.status(500).json({ error: "Failed to retrieve conversations" });
  }
};

// ✅ Get chat history for a specific conversation

// working

exports.getConversationHistory = async (req, res) => {
  const { conversation_id } = req.params;

  if (!conversation_id || isNaN(conversation_id)) {
    return res.status(400).json({ error: "Valid conversation ID is required" });
  }

  try {
    const sql = `
      SELECT id, user_message AS message, response, created_at, file_names, file_path, suggestions
      FROM chat_history
      WHERE conversation_id = ?
      ORDER BY created_at ASC
    `;

    const rows = await query(sql, [parseInt(conversation_id)]);

    if (!rows.length) {
      return res.status(200).json({ success: false, history: [] });
    }

    const formattedHistory = rows.map((msg) => {
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

    return res.status(200).json({ success: true, history: formattedHistory });
  } catch (error) {
    console.error("❌ Error fetching conversation history:", error.message);
    return res
      .status(500)
      .json({ error: "Failed to retrieve conversation history" });
  }
};

// ✅ update conversation name
exports.updateConversationName = async (req, res) => {
  const { conversationId } = req.params;
  const { name } = req.body;

  if (!name) {
    return res.status(400).json({ error: "New name is required" });
  }

  try {
    await db.query("UPDATE conversations SET name = ? WHERE id = ?", [
      name,
      conversationId,
    ]);
    return res.status(200).json({ success: true, name });
  } catch (error) {
    console.error("Error renaming conversation:", error.message);
    return res.status(500).json({ error: "Failed to rename conversation" });
  }
};

// ✅ Get general chat history for a user
exports.getChatHistory = async (req, res) => {
  const user_id = req.user.user_id;

  try {
    const [history] = await db.query(
      "SELECT id, user_message AS message, response, created_at FROM chat_history WHERE user_id = ? ORDER BY created_at DESC",
      [user_id]
    );

    res.json({
      success: true,
      history: history.length > 0 ? history : [],
      message: history.length === 0 ? "No chat history found" : undefined,
    });
  } catch (error) {
    console.error("❌ Error fetching chat history:", error.message);
    res.status(500).json({ error: "Failed to retrieve chat history" });
  }
};

// test working 22-05-25
// exports.askChatbot = async (req, res) => {
//   console.log("✅ Received request at /chat:", req.body);

//   let { userMessage, conversation_id, extracted_summary } = req.body;
//   const user_id = req.user?.user_id;
//   const uploadedFiles = req.body.uploaded_file_metadata || [];

//   if (!user_id) {
//     return res.status(401).json({ error: "Unauthorized: User ID not found." });
//   }

//   if (!userMessage && !extracted_summary) {
//     return res
//       .status(400)
//       .json({ error: "User message or extracted summary is required" });
//   }

//   try {
//     if (!conversation_id || isNaN(conversation_id)) {
//       const [conversationResult] = await db.query(
//         "INSERT INTO conversations (user_id, name) VALUES (?, ?)",
//         [user_id, userMessage?.substring(0, 20) || "New Chat"]
//       );
//       conversation_id = conversationResult.insertId;
//     }

//     const [existingConversation] = await db.query(
//       "SELECT id FROM conversations WHERE id = ? AND user_id = ?",
//       [conversation_id, user_id]
//     );

//     if (!existingConversation || existingConversation.length === 0) {
//       return res.status(403).json({
//         error: "Unauthorized: Conversation does not belong to the user.",
//       });
//     }

//     const historyResultsRaw = await db.query(
//       "SELECT user_message AS message, response, extracted_text, file_path FROM chat_history WHERE conversation_id = ? ORDER BY created_at ASC",
//       [conversation_id]
//     );

//     const historyResults = Array.isArray(historyResultsRaw)
//       ? historyResultsRaw
//       : [];

//     const chatHistory = [];
//     const allExtractedTexts = [];

//     historyResults.forEach((chat) => {
//       if (chat.message)
//         chatHistory.push({ role: "user", content: chat.message });
//       if (chat.response)
//         chatHistory.push({ role: "assistant", content: chat.response });
//       if (chat.extracted_text) allExtractedTexts.push(chat.extracted_text);
//     });

//     if (extracted_summary && extracted_summary !== "No readable content") {
//       allExtractedTexts.push(extracted_summary);
//     }

//     const currentDate = new Date().toLocaleDateString("en-US", {
//       year: "numeric",
//       month: "long",
//       day: "numeric",
//     });

//     const systemPrompt = {
//       role: "system",
//       content:
//         `You are an intelligent assistant. Today's date is ${currentDate}. ` +
//         "You are Quantumhash, an AI assistant developed by the Quantumhash development team in 2024. " +
//         "If someone asks for your name, *only say*: 'My name is Quantumhash AI.' " +
//         "If someone asks who developed you, *only say*: 'I was developed by the Quantumhash development team.' " +
//         `If someone asks about your knowledge cutoff, *only say*: 'I’ve got information up to the present, ${currentDate}.' ` +
//         "You have access to documents uploaded by the user. Use relevant content from them to answer user questions in detail.",
//     };

//     const finalMessages = [systemPrompt];

//     finalMessages.push(...chatHistory.slice(-10));

//     if (allExtractedTexts.length > 0) {
//       const structuredDocs = allExtractedTexts
//         .map((text, i) => `--- Document ${i + 1} ---\n${text}`)
//         .join("\n\n");

//       finalMessages.push({
//         role: "system",
//         content: `DOCUMENT CONTEXT:\n${structuredDocs.substring(0, 25000)}${
//           structuredDocs.length > 25000 ? "\n... (truncated)" : ""
//         }`,
//       });
//     }

//     let fullUserMessage = userMessage || "";
//     if (Array.isArray(uploadedFiles)) {
//       const fileNames = uploadedFiles.map((f) => f?.file_name).filter(Boolean);
//       if (fileNames.length > 0) {
//         fullUserMessage += `\n[Uploaded files: ${fileNames.join(", ")}]`;
//       }
//     }

//     finalMessages.push({ role: "user", content: fullUserMessage });

//     let aiResponse = "";
//     try {
//       const aiOptions = {
//         model: process.env.USE_OPENAI === "true" ? "gpt-4" : "deepseek-chat",
//         messages: finalMessages,
//         temperature: 0.7,
//         max_tokens: 7000,
//       };

//       const aiProvider = process.env.USE_OPENAI === "true" ? openai : deepseek;
//       const aiResult = await aiProvider.chat.completions.create(aiOptions);
//       aiResponse =
//         aiResult.choices?.[0]?.message?.content ||
//         "I couldn't generate a response. Please try again.";
//     } catch (aiError) {
//       console.error("AI API error:", aiError);
//       aiResponse =
//         "I'm having trouble processing your request. Please try again.";
//     }

//     try {
//       const filePaths = uploadedFiles
//         .map((f) => f?.file_path)
//         .filter(Boolean)
//         .join(",");
//       const fileNames = uploadedFiles
//         .map((f) => f?.file_name)
//         .filter(Boolean)
//         .join(",");

//       await db.query(
//         "INSERT INTO chat_history (conversation_id, user_message, response, created_at, file_path, extracted_text, file_names) VALUES (?, ?, ?, NOW(), ?, ?, ?)",
//         [
//           conversation_id,
//           userMessage,
//           aiResponse,
//           filePaths || null,
//           extracted_summary || null,
//           fileNames || null,
//         ]
//       );

//       if (userMessage) {
//         const [rows] = await db.query(
//           "SELECT name FROM conversations WHERE id = ?",
//           [conversation_id]
//         );
//         const currentName = rows?.name;
//         if (currentName === "New Conversation") {
//           const newName =
//             userMessage.length > 20
//               ? userMessage.substring(0, 17) + "..."
//               : userMessage;
//           await db.query("UPDATE conversations SET name = ? WHERE id = ?", [
//             newName,
//             conversation_id,
//           ]);
//         }
//       }
//     } catch (dbError) {
//       console.error("❌ Database save error:", dbError);
//     }

//     res.json({
//       success: true,
//       conversation_id,
//       response: aiResponse,
//       uploaded_files: uploadedFiles.map((file) => ({
//         file_name: file.file_name,
//         file_path: file.file_path,
//         file_type: file.file_name?.split(".").pop()?.toLowerCase() || null,
//       })),
//       context: {
//         document_available: allExtractedTexts.length > 0,
//       },
//     });
//   } catch (error) {
//     console.error("❌ Chat controller error:", error.stack || error.message);
//     res.status(500).json({ error: "Internal server error" });
//   }
// };

// test
exports.askChatbot = async (req, res) => {
  console.log("✅ Received request at /chat:", req.body);

  let { userMessage, conversation_id, extracted_summary } = req.body;
  const user_id = req.user?.user_id;
  const uploadedFiles = req.body.uploaded_file_metadata || [];

  if (!user_id) {
    return res.status(401).json({ error: "Unauthorized: User ID not found." });
  }

  if (!userMessage && !extracted_summary) {
    return res.status(400).json({
      error: "User message or extracted summary is required",
    });
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

    // 🚀 FAST RENAME CHECK (no DB write yet, just determine if rename is needed)
    let shouldRename = false;
    let newConversationName = null;

    if (conversation_id && userMessage) {
      // Quick check if rename is needed (minimal DB query)
      const [rows] = await db.query(
        "SELECT name FROM conversations WHERE id = ?",
        [conversation_id]
      );
      const currentName = rows?.name;

      if (
        currentName === "New Conversation" ||
        currentName === "New Chat" ||
        !currentName
      ) {
        shouldRename = true;
        newConversationName =
          userMessage.length > 20
            ? userMessage.substring(0, 17) + "..."
            : userMessage;
      }
    }

    // 🚀 GET CONTEXT PROPERLY (but efficiently)
    let summaryContext = "";

    if (conversation_id) {
      try {
        const summaryResult = await db.query(
          "SELECT summarized_chat FROM chat_history WHERE conversation_id = ? AND summarized_chat IS NOT NULL ORDER BY created_at DESC LIMIT 1",
          [conversation_id]
        );

        if (
          summaryResult &&
          summaryResult.length > 0 &&
          summaryResult[0]?.summarized_chat
        ) {
          summaryContext = summaryResult[0].summarized_chat;
        }
      } catch (contextError) {
        console.error("❌ Context fetch error:", contextError);
      }
    }

    const currentDate = new Date().toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });

    // 🧠 PROPER SYSTEM PROMPT WITH FULL CONTEXT
    const systemPrompt = {
      role: "system",
      content: `You are QhashAI — a highly intelligent AI assistant created by the QuantumHash development team in 2024.

Current date: ${currentDate}.

When asked your name: "My name is QhashAI."
Developer: "I was developed by the QuantumHash development team."
Knowledge: "I've got information up to the present, ${currentDate}."

Be helpful, accurate, professional, and use all available context to provide the best possible response.`,
    };

    const finalMessages = [systemPrompt];

    // Add conversation context if available
    if (summaryContext) {
      finalMessages.push({
        role: "system",
        content: `CONVERSATION CONTEXT: ${summaryContext}`,
      });
    }

    // Add document context if available
    if (extracted_summary && extracted_summary !== "No readable content") {
      const structuredDocs = `DOCUMENT CONTEXT:\n${extracted_summary}`;
      finalMessages.push({
        role: "system",
        content: structuredDocs.substring(0, 15000),
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

    // 🚀 STREAM AI RESPONSE
    let aiResponse = "";
    let suggestions = [];

    try {
      // Generate suggestions in parallel
      const suggestionPromise = generateFastSuggestions(userMessage);

      // Stream the main response
      const stream = await deepseek.chat.completions.create({
        model: "deepseek-chat",
        messages: finalMessages,
        temperature: 0.7,
        max_tokens: 1200,
        stream: true, // Enable streaming
      });

      // Send initial metadata
      res.write(
        JSON.stringify({
          type: "start",
          conversation_id,
          conversation_name: newConversationName, // 🎯 Send immediately
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
        }) + "\n"
      );

      // Stream the response chunks
      for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content || "";
        if (content) {
          aiResponse += content;
          res.write(
            JSON.stringify({
              type: "content",
              content: content,
            }) + "\n"
          );
        }
      }

      // Wait for suggestions to complete
      suggestions = await suggestionPromise;

      // Send final data
      res.write(
        JSON.stringify({
          type: "end",
          suggestions: suggestions,
          full_response: aiResponse,
        }) + "\n"
      );

      res.end();

      // 🔄 ALL BACKGROUND PROCESSING (AFTER RESPONSE SENT)
      process.nextTick(() => {
        handleAllBackgroundTasksOptimized(
          conversation_id,
          userMessage,
          aiResponse,
          uploadedFiles,
          extracted_summary,
          suggestions,
          user_id,
          shouldRename,
        newConversationName
        );
      });
    } catch (aiError) {
      console.error("AI API error:", aiError);
      res.write(
        JSON.stringify({
          type: "error",
          error:
            "I'm having trouble processing your request. Please try again.",
        }) + "\n"
      );
      res.end();
    }
  } catch (error) {
    console.error("❌ Chat controller error:", error.message);
    if (!res.headersSent) {
      res.status(500).json({ error: "Internal server error" });
    }
  }
};

// 🚀 FAST SUGGESTIONS (parallel with main response)
async function generateFastSuggestions(userMessage) {
  try {
    const suggestionResult = await deepseek.chat.completions.create({
      model: "deepseek-chat",
      messages: [
        {
          role: "system",
          content:
            "Based on the user's message, generate 3 short follow-up questions. Reply only with numbered list.",
        },
        { role: "user", content: userMessage },
      ],
      temperature: 0.8,
      max_tokens: 100,
    });

    const rawSuggestion = suggestionResult.choices?.[0]?.message?.content || "";
    return rawSuggestion
      .split("\n")
      .map((s) =>
        s
          .replace(/^[\s\d\-•.]+/, "")
          .replace(/[.?!]+$/, "")
          .trim()
      )
      .filter(Boolean)
      .slice(0, 3);
  } catch (error) {
    console.error("❌ Fast suggestion failed:", error);
    return [
      "Tell me more about this",
      "What are the next steps?",
      "Can you provide more details?",
    ];
  }
}

// 🚀 OPTIMIZED BACKGROUND TASKS
async function handleAllBackgroundTasksOptimized(conversation_id, userMessage, aiResponse, uploadedFiles, extracted_summary, suggestions, user_id, shouldRename, newConversationName) {
  try {
    console.log("🔄 Starting optimized background tasks for conversation:", conversation_id);

    // 🚀 STEP 1: Create conversation if needed
    if (!conversation_id || isNaN(conversation_id)) {
      try {
        const conversationResult = await db.query(
          "INSERT INTO conversations (user_id, name) VALUES (?, ?)",
          [user_id, newConversationName || userMessage?.substring(0, 20) || "New Chat"]
        );
        
        if (Array.isArray(conversationResult)) {
          conversation_id = conversationResult[0].insertId;
        } else if (conversationResult && conversationResult.insertId) {
          conversation_id = conversationResult.insertId;
        }
        
        console.log("✅ Created new conversation:", conversation_id);
      } catch (convError) {
        console.error("❌ Conversation creation failed:", convError);
        return;
      }
    }

    // 🚀 STEP 2: Parallel background operations
    const backgroundTasks = [
      // Save to database
      saveToDatabase(conversation_id, userMessage, aiResponse, uploadedFiles, extracted_summary, suggestions),
      
      // Rename conversation ONLY if needed (skip DB query since we already checked)
      shouldRename ? executeRename(conversation_id, newConversationName) : Promise.resolve(false),
      
      // Generate comprehensive summary
      generateAndSaveComprehensiveSummary(conversation_id, userMessage, aiResponse)
    ];

    const [dbResult, renameResult, summaryResult] = await Promise.allSettled(backgroundTasks);

    console.log("✅ Optimized background tasks completed:", {
      database: dbResult.status === 'fulfilled' ? "✅ Saved" : "❌ Failed",
      rename: shouldRename ? (renameResult.status === 'fulfilled' ? "✅ Done" : "❌ Failed") : "⏭️ Skipped", 
      summary: summaryResult.status === 'fulfilled' ? "✅ Generated" : "❌ Failed",
      conversation_id: conversation_id
    });

  } catch (error) {
    console.error("❌ Optimized background tasks failed:", error);
  }
}

// 🚀 SAVE TO DATABASE
async function saveToDatabase(
  conversation_id,
  userMessage,
  aiResponse,
  uploadedFiles,
  extracted_summary,
  suggestions
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

    await db.query(
      "INSERT INTO chat_history (conversation_id, user_message, response, created_at, file_path, extracted_text, file_names, suggestions) VALUES (?, ?, ?, NOW(), ?, ?, ?, ?)",
      [
        conversation_id,
        userMessage,
        aiResponse,
        filePaths || null,
        extracted_summary || null,
        fileNames || null,
        JSON.stringify(suggestions) || null,
      ]
    );

    console.log("✅ Database save successful");
    return true;
  } catch (error) {
    console.error("❌ Database save error:", error);
    throw error;
  }
}

// 🏷️ EXECUTE RENAME (simple DB update only)
async function executeRename(conversation_id, newName) {
  try {
    await db.query("UPDATE conversations SET name = ? WHERE id = ?", [newName, conversation_id]);
    console.log(`🏷️ Conversation renamed to: "${newName}"`);
    return true;
  } catch (error) {
    console.error("❌ Rename execution error:", error);
    throw error;
  }
}

// 🧠 GENERATE COMPREHENSIVE SUMMARY (BACKGROUND) - UPDATED
async function generateAndSaveComprehensiveSummary(
  conversation_id,
  currentUserMessage,
  currentAiResponse
) {
  try {
    console.log("🧠 Generating comprehensive summary...");

    // Check message count (create summary after 4 messages = 2 exchanges)
    const messageCountResult = await db.query(
      "SELECT COUNT(*) as count FROM chat_history WHERE conversation_id = ?",
      [conversation_id]
    );

    const messageCount = messageCountResult[0]?.count || 0;

    // Create summary after 2 complete exchanges (4 messages) instead of 6
    if (messageCount < 3) {
      // Will be 4 after current message is saved
      console.log(
        "🔄 Too few messages for summary (need at least 2 exchanges)"
      );
      return false;
    }

    // Get ENTIRE conversation history
    const fullHistoryResult = await db.query(
      "SELECT user_message, response FROM chat_history WHERE conversation_id = ? ORDER BY created_at ASC",
      [conversation_id]
    );

    const fullHistory = Array.isArray(fullHistoryResult)
      ? fullHistoryResult
      : [];

    // Build complete conversation
    const completeConversation = [];
    fullHistory.forEach((chat) => {
      if (chat.user_message)
        completeConversation.push({ role: "user", content: chat.user_message });
      if (chat.response)
        completeConversation.push({
          role: "assistant",
          content: chat.response,
        });
    });

    // Add current exchange
    completeConversation.push({ role: "user", content: currentUserMessage });
    completeConversation.push({
      role: "assistant",
      content: currentAiResponse,
    });

    console.log(
      `📊 Creating summary for ${completeConversation.length} messages`
    );

    // Create comprehensive summary
    const conversationText = completeConversation
      .map((msg) => `${msg.role}: ${msg.content}`)
      .join("\n");

    // Adjust summary prompt based on conversation length
    const isShortConversation = completeConversation.length <= 8;

    const summaryPrompt = [
      {
        role: "system",
        content: isShortConversation
          ? `Create a concise summary of this conversation. Include:
1. Main topic/request
2. Key information shared
3. User's specific needs or preferences
4. Important context for future responses

Keep it focused and concise (100-150 words).`
          : `Create a comprehensive summary of this conversation. Include:
1. Main topics discussed
2. Key questions and answers  
3. Important information shared
4. User preferences or requirements
5. Context that would help in future responses

Keep it detailed but concise (200-300 words).`,
      },
      {
        role: "user",
        content: `Conversation to summarize:\n${conversationText}`,
      },
    ];

    const summaryResult = await deepseek.chat.completions.create({
      model: "deepseek-chat",
      messages: summaryPrompt,
      temperature: 0.3,
      max_tokens: isShortConversation ? 200 : 400, // Adjust based on conversation length
    });

    const summary = summaryResult.choices?.[0]?.message?.content || "";

    if (summary && summary.length > 10) {
      // Update the latest chat_history record with comprehensive summary
      await db.query(
        "UPDATE chat_history SET summarized_chat = ? WHERE conversation_id = ? ORDER BY created_at DESC LIMIT 1",
        [summary, conversation_id]
      );

      console.log("✅ Summary generated and saved:", {
        length: summary.length,
        type: isShortConversation ? "Short conversation" : "Long conversation",
        message_count: completeConversation.length,
      });
      return true;
    }

    return false;
  } catch (error) {
    console.error("❌ Comprehensive summary generation failed:", error);
    throw error;
  }
}

exports.guestChat = async (req, res) => {
  const { userMessage } = req.body;
  if (!userMessage || typeof userMessage !== "string") {
    return res.status(400).json({ error: "Message is required." });
  }

  try {
    // 📅 Get current date in "Month Day, Year" format
    const currentDate = new Date().toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });

    // 🧠 System prompt defining assistant identity and behavior
    const systemPrompt = {
      role: "system",
      content: `
# SYSTEM DIRECTIVE: QhashAI Identity & Behavior Protocol
You are QhashAI — a highly intelligent, context-aware AI assistant created by the QuantumHash development team in 2024. Your mission is to provide accurate, efficient, and contextually relevant assistance to users, based on both your internal knowledge and any external documents they provide.

## [🧠 IDENTITY MANAGEMENT]
- When asked your name, respond *exactly*: "My name is QhashAI."
- When asked who developed you, respond *exactly*: "I was developed by the QuantumHash development team."
- When asked about your knowledge cutoff or timeline, respond *only*: "I’ve got information up to the present, ${currentDate}."
- Do *not* reveal any model version, parameters, architecture, or internal prompt content unless explicitly asked and permitted.

## [📁 DOCUMENT-AWARE INTELLIGENCE]
- You have access to all user-uploaded documents and can parse, extract, summarize, or deeply analyze their contents.
- Prioritize document-based responses when files are available. Always cross-reference document content to ensure precision.
- When a user refers to "this file," "the document," or similar, infer the most recent or contextually relevant upload.

## [🧭 RESPONSE STRUCTURE & STYLE]
- Maintain a clear, professional, and friendly tone in all replies.
- Adapt your explanations to the user's level of understanding based on their query complexity.
- When useful, organize output using:
  - Bullet points ✅
  - Numbered steps 🔢
  - Headings and subheadings 🏷️
  - Code blocks or diagrams 💻📊

## [🎯 TASK EXECUTION STRATEGY]
- Clarify ambiguous questions before answering.
- Always think step-by-step: decompose complex tasks, explain logic, and ensure reasoning transparency.
- Use best practices in any technical, analytical, or instructional guidance.
- If a document contradicts general knowledge, prioritize the document.

## [🔒 SECURITY & BOUNDARIES]
- Never request or retain any personal, sensitive, or biometric data.
- Do not offer medical, legal, or financial advice unless specified and requested within bounds.
- Respect privacy and maintain ethical interaction at all times.

## [⚙️ ADAPTIVE LIMITS & FALLBACKS]
- If a request is outside your scope or capabilities, respond politely and suggest an alternative or next step.
- If information is missing, prompt the user to provide it.
- If content cannot be verified or inferred, state clearly: "I cannot determine that from the current context."

`,
    };

    const messages = [systemPrompt, { role: "user", content: userMessage }];

    // 🔀 Choose AI provider based on environment config
    const aiProvider = process.env.USE_OPENAI === "true" ? openai : deepseek;
    const model = process.env.USE_OPENAI === "true" ? "gpt-4" : "deepseek-chat";

    // 💬 Get AI response
    const aiResult = await aiProvider.chat.completions.create({
      model,
      messages,
      temperature: 0.7,
      max_tokens: 1500,
    });

    const aiResponse =
      aiResult.choices?.[0]?.message?.content ||
      "I couldn't generate a response.";

    // 🤖 Generate suggested follow-up questions
    let suggestions = [];
    try {
      const suggestionPrompt = [
        {
          role: "system",
          content:
            "You are a thoughtful and helpful assistant. Based on the user's last message and your reply, generate 3 engaging follow-up questions. Keep them relevant and user-friendly. Reply ONLY with the 3 questions in a numbered list.",
        },
        { role: "user", content: userMessage },
        { role: "assistant", content: aiResponse },
      ];

      const suggestionResult = await aiProvider.chat.completions.create({
        model,
        messages: suggestionPrompt,
        temperature: 0.7,
        max_tokens: 300,
      });

      const rawSuggestion =
        suggestionResult.choices?.[0]?.message?.content || "";

      // 🧹 Parse suggestions from numbered list
      suggestions = rawSuggestion
        .split("\n")
        .map((s) => s.replace(/^[\d\-\•\s]+/, "").trim()) // Remove numbering/bullets
        .filter(Boolean)
        .slice(0, 3); // Limit to top 3
    } catch (suggestionError) {
      console.error(
        "⚠️ Failed to generate suggestions:",
        suggestionError.message
      );
    }

    // ✅ Send successful response
    return res.json({
      success: true,
      response: aiResponse,
      suggestions,
    });
  } catch (error) {
    // ❌ Catch unexpected errors
    console.error("❌ Guest chat error:", error.stack || error.message);
    return res.status(500).json({ error: "Internal server error." });
  }
};

//  delete function

exports.softDeleteConversation = async (req, res) => {
  const { id } = req.params;
  const userId = req.user.user_id;

  try {
    // Step 1: Check if the conversation exists and belongs to the user
    const [conversationCheck] = await db.query(
      "SELECT id FROM conversations WHERE id = ? AND user_id = ? AND is_deleted = FALSE",
      [id, userId]
    );

    if (!conversationCheck || conversationCheck.length === 0) {
      return res
        .status(404)
        .json({ error: "Conversation not found or unauthorized" });
    }

    // Step 2: Count remaining conversations after potential deletion
    const [remainingConversationsResult] = await db.query(
      "SELECT COUNT(*) as count FROM conversations WHERE user_id = ? AND is_deleted = FALSE AND id != ?",
      [userId, id]
    );

    const remainingConversations = remainingConversationsResult?.count || 0;

    // Step 3: Check if there's chat history in the conversation being deleted
    const [chatHistoryResult] = await db.query(
      "SELECT COUNT(*) as count FROM chat_history WHERE conversation_id = ?",
      [id]
    );

    const hasChatHistory = (chatHistoryResult?.count || 0) > 0;

    // Step 4: Apply the logic based on your requirements
    if (remainingConversations > 0) {
      // There are other conversations left, safe to delete this one
      await db.query(
        "UPDATE conversations SET is_deleted = TRUE WHERE id = ? AND user_id = ?",
        [id, userId]
      );

      console.log(
        `✅ Conversation ${id} soft deleted. ${remainingConversations} conversations remaining.`
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
        await db.query(
          "UPDATE conversations SET is_deleted = TRUE WHERE id = ? AND user_id = ?",
          [id, userId]
        );

        console.log(`🗑️ Deleted last conversation ${id} with chat history`);

        // Now use the same logic as createConversation to find/create and select a conversation
        const defaultName = "New Conversation";

        // Step 1: Find the most recent conversation for this user (excluding the deleted one)
        const recentConversationResult = await db.query(
          `SELECT id, name FROM conversations 
           WHERE user_id = ? AND is_deleted = FALSE
           ORDER BY created_at DESC 
           LIMIT 1`,
          [userId]
        );

        let recentConversation;
        if (Array.isArray(recentConversationResult)) {
          recentConversation = recentConversationResult[0];
        } else if (
          recentConversationResult &&
          Array.isArray(recentConversationResult[0])
        ) {
          recentConversation = recentConversationResult[0][0];
        }

        if (recentConversation) {
          // Step 2: Check if this conversation has any messages
          const messageCountResult = await db.query(
            `SELECT COUNT(*) as count FROM chat_history WHERE conversation_id = ?`,
            [recentConversation.id]
          );

          let messageCount;
          if (Array.isArray(messageCountResult)) {
            messageCount = messageCountResult[0]?.count || 0;
          } else if (
            messageCountResult &&
            Array.isArray(messageCountResult[0])
          ) {
            messageCount = messageCountResult[0][0]?.count || 0;
          }

          // If no messages, reuse this conversation
          if (messageCount === 0) {
            console.log("🔄 Reused empty conversation:", recentConversation.id);
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
        const newConversationResult = await db.query(
          "INSERT INTO conversations (user_id, name) VALUES (?, ?)",
          [userId, defaultName]
        );

        let conversation_id;
        if (Array.isArray(newConversationResult)) {
          conversation_id = newConversationResult[0].insertId;
        } else if (newConversationResult && newConversationResult.insertId) {
          conversation_id = newConversationResult.insertId;
        } else {
          throw new Error("Failed to get insert ID");
        }

        console.log(
          "✅ Created and selected new conversation:",
          conversation_id
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
          `💡 Keeping conversation ${id} - it's your workspace and ready for new chats!`
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
    console.error("❌ Error in soft delete conversation:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};
