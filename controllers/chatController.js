  const db = require("../config/db");
const openai = require("../config/openai");
const deepseek = require("../config/deepseek");
const { query } = require("../config/db"); // make sure you're importing correctly

// ✅ Create a new conversation

exports.createConversation = async (req, res) => {
  const user_id = req.user?.user_id;
  if (!user_id) {
    return res.status(400).json({ error: "User ID is required" });
  }

  try {
    const name = req.body.name || "New Conversation";
    console.log("📥 Incoming request body:", req.body);

    // 🔍 Execute database query
    const result = await db.query(
      "INSERT INTO conversations (user_id, name) VALUES (?, ?)",
      [user_id, name]
    );

    console.log("🔍 DB Query Result:", result);

    // ✅ Ensure result has insertId
    if (!result || !result.insertId) {
      console.error("❌ Unexpected DB response format:", result);
      return res
        .status(500)
        .json({ error: "Database query returned invalid response" });
    }

    const conversation_id = result.insertId; // ✅ Directly accessing insertId
    console.log("✅ New conversation created with ID:", conversation_id);

    return res.status(201).json({
      success: true,
      conversation_id,
      name,
    });
  } catch (error) {
    console.error("❌ Error creating conversation:", error.message);
    res
      .status(500)
      .json({ error: "Failed to create conversation", details: error.message });
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

    console.log("🔍 Raw SQL result:", rows);

    // ✅ Ensure it's an array
    const conversations = Array.isArray(rows[0]) ? rows[0] : rows;

    console.log("✅ Conversations (final processed):", conversations);
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
      SELECT id, user_message AS message, response, created_at, file_names, file_path
      FROM chat_history
      WHERE conversation_id = ?
      ORDER BY created_at ASC
    `;

    const rows = await query(sql, [parseInt(conversation_id)]);
    console.log("✅ Rows from DB:", rows);

    if (!rows.length) {
      return res.status(200).json({ success: false, history: [] });
    }

    // Reformat messages to include 'files' array
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
        sender: "user", // You can adjust this logic if needed
        message: msg.message,
        response: msg.response,
        files: files.length > 0 ? files : undefined,
        created_at: msg.created_at,
      };
    });

    return res.status(200).json({ success: true, history: formattedHistory });
  } catch (error) {
    console.error("❌ Error fetching conversation history:", error.message);
    return res.status(500).json({ error: "Failed to retrieve conversation history" });
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

 

// final working
// exports.askChatbot = async (req, res) => {
//   console.log("✅ Received request at /chat:", req.body);

//   let { userMessage, conversation_id, extracted_summary } = req.body;
//   const user_id = req.user?.user_id;

//   if (!user_id) {
//     return res.status(401).json({ error: "Unauthorized: User ID not found." });
//   }

//   if (!userMessage && !extracted_summary) {
//     return res
//       .status(400)
//       .json({ error: "User message or extracted summary is required" });
//   }

//   try {
//     // Step 1: Create new conversation if needed
//     if (!conversation_id || isNaN(conversation_id)) {
//       const [conversationResult] = await db.query(
//         "INSERT INTO conversations (user_id, name) VALUES (?, ?)",
//         [user_id, userMessage?.substring(0, 20) || "New Chat"]
//       );
//       conversation_id = conversationResult.insertId;
//     }

//     // Step 2: Verify user owns this conversation
//     const [existingConversation] = await db.query(
//       "SELECT id FROM conversations WHERE id = ? AND user_id = ?",
//       [conversation_id, user_id]
//     );
//     if (!existingConversation || existingConversation.length === 0) {
//       return res
//         .status(403)
//         .json({
//           error: "Unauthorized: Conversation does not belong to the user.",
//         });
//     }

//     // Step 3: Fetch full chat history
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

//       if (chat.extracted_text) {
//         allExtractedTexts.push(chat.extracted_text);
//       }
//     });

//     // Step 4: Include new document (if any)
//     if (extracted_summary && extracted_summary !== "No readable content") {
//       allExtractedTexts.push(extracted_summary);
//     }

//     // Step 5: Create system prompt
//     const currentDate = new Date().toLocaleDateString("en-US", {
//       year: "numeric",
//       month: "long",
//       day: "numeric",
//     });

//     const systemPrompt = {
//       role: "system",
//       content:
//         `You are an intelligent assistant. Today's date is ${currentDate}.` +
//         " You are Quantumhash, an AI assistant developed by the Quantumhash development team. " +
//         "When you were developed, you were created in 2024 by the Quantumhash development team. " +
//         "If someone asks for your name, *only say*: 'My name is Quantumhash AI.' " +
//         " If someone asks who developed you, *only say*: 'I was developed by the Quantumhash development team." +
//         ` If someone asks about your knowledge cutoff date, *only say*: 'I’ve got information up to the present, ${currentDate}.` +
//         "You have access to previous documents uploaded by the user during this conversation ,Use all relevant information from those documents to help answer the user's current and follow-up questions.",
//     };

//     // Step 6: Build messages array
//     const finalMessages = [systemPrompt];

//     // Add recent 10 messages (5 user + 5 assistant)
//     const recentHistory = chatHistory.slice(-10);
//     finalMessages.push(...recentHistory);

//     // Add combined document context
//     if (allExtractedTexts.length > 0) {
//       const combinedText = allExtractedTexts.join("\n---\n").substring(0, 5000);
//       finalMessages.push({
//         role: "system",
//         content: `DOCUMENT CONTEXT:\n${combinedText}${
//           combinedText.length >= 5000 ? "\n... (truncated)" : ""
//         }`,
//       });
//     }

//     // Build full user message
//     let fullUserMessage = userMessage || "";
//     if (Array.isArray(req.body.uploaded_file_metadata)) {
//       const fileNames = req.body.uploaded_file_metadata
//         .map((f) => f?.file_name)
//         .filter(Boolean);
//       if (fileNames.length > 0) {
//         fullUserMessage += `\n[Uploaded files: ${fileNames.join(", ")}]`;
//       }
//     }

//     finalMessages.push({ role: "user", content: fullUserMessage });

//     // Step 7: AI Response
//     let aiResponse = "";
//     try {
//       const aiOptions = {
//         model: process.env.USE_OPENAI === "true" ? "gpt-4" : "deepseek-chat",
//         messages: finalMessages,
//         temperature: 0.7,
//         max_tokens: 1500,
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

//     // Step 8: Save new chat entry working
//     // try {
//     //     const filePaths = (req.body.uploaded_file_metadata || [])
//     //         .map(f => f?.file_path)
//     //         .filter(Boolean);

//     //     await db.query(
//     //         "INSERT INTO chat_history (conversation_id, user_message, response, created_at, file_path, extracted_text) VALUES (?, ?, ?, NOW(), ?, ?)",
//     //         [
//     //             conversation_id,
//     //             fullUserMessage,
//     //             aiResponse,
//     //             filePaths.join(','),
//     //             extracted_summary || null
//     //         ]
//     //     );
//     // } catch (dbError) {
//     //     console.error("Database save error:", dbError);
//     // }

//     // Step 8: Save new chat entry try
//     try {
//       const filePaths = (req.body.uploaded_file_metadata || [])
//         .map((f) => f?.file_path)
//         .filter(Boolean);

//       await db.query(
//         "INSERT INTO chat_history (conversation_id, user_message, response, created_at, file_path, extracted_text) VALUES (?, ?, ?, NOW(), ?, ?)",
//         [
//           conversation_id,
//           fullUserMessage,
//           aiResponse,
//           filePaths.join(","),
//           extracted_summary || null,
//         ]
//       );

//       // 🔄 Rename logic
//       if (userMessage) {
//         const [rows] = await db.query(
//           "SELECT name FROM conversations WHERE id = ?",
//           [conversation_id]
//         );

//         const currentName = rows?.name;
//         console.log("Current conversation name:", currentName);
//         console.log("User message:", userMessage);

//         if (currentName === "New Conversation") {
//             const newName = userMessage.length > 20
//             ? userMessage.substring(0, 17) + "..."
//             : userMessage;
          

//           console.log("Renaming conversation to:", newName);

//           const [updateResult] = await db.query(
//             "UPDATE conversations SET name = ? WHERE id = ?",
//             [newName, conversation_id]
//           );

//           console.log("✅ Rename result:", updateResult);
//         }
//       }
//     } catch (dbError) {
//       console.error("❌ Database save error:", dbError);
//     }

//     // Step 9: Respond to frontend
//     res.json({
//       success: true,
//       conversation_id,
//       response: aiResponse,
//       context: {
//         document_available: allExtractedTexts.length > 0,
//       },
//     });
//   } catch (error) {
//     console.error("❌ Chat controller error:", error.stack || error.message);
//     res.status(500).json({ error: "Internal server error" });
//   }
// };

// final working code 

// test

exports.askChatbot = async (req, res) => {
  console.log("✅ Received request at /chat:", req.body);

  let { userMessage, conversation_id, extracted_summary } = req.body;
  const user_id = req.user?.user_id;

  if (!user_id) {
    return res.status(401).json({ error: "Unauthorized: User ID not found." });
  }

  if (!userMessage && !extracted_summary) {
    return res
      .status(400)
      .json({ error: "User message or extracted summary is required" });
  }

  const uploadedFiles = req.body.uploaded_file_metadata || [];

  try {
    // Step 1: Create new conversation if needed
    if (!conversation_id || isNaN(conversation_id)) {
      const [conversationResult] = await db.query(
        "INSERT INTO conversations (user_id, name) VALUES (?, ?)",
        [user_id, userMessage?.substring(0, 20) || "New Chat"]
      );
      conversation_id = conversationResult.insertId;
    }

    // Step 2: Verify user owns this conversation
    const [existingConversation] = await db.query(
      "SELECT id FROM conversations WHERE id = ? AND user_id = ?",
      [conversation_id, user_id]
    );
    if (!existingConversation || existingConversation.length === 0) {
      return res
        .status(403)
        .json({
          error: "Unauthorized: Conversation does not belong to the user.",
        });
    }

    // Step 3: Fetch full chat history
    const historyResultsRaw = await db.query(
      "SELECT user_message AS message, response, extracted_text, file_path FROM chat_history WHERE conversation_id = ? ORDER BY created_at ASC",
      [conversation_id]
    );
    const historyResults = Array.isArray(historyResultsRaw)
      ? historyResultsRaw
      : [];

    const chatHistory = [];
    const allExtractedTexts = [];

    historyResults.forEach((chat) => {
      if (chat.message)
        chatHistory.push({ role: "user", content: chat.message });
      if (chat.response)
        chatHistory.push({ role: "assistant", content: chat.response });

      if (chat.extracted_text) {
        allExtractedTexts.push(chat.extracted_text);
      }
    });

    // Step 4: Include new document (if any)
    if (extracted_summary && extracted_summary !== "No readable content") {
      allExtractedTexts.push(extracted_summary);
    }

    // Step 5: Create system prompt
    const currentDate = new Date().toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });

    const systemPrompt = {
      role: "system",
      content:
        `You are an intelligent assistant. Today's date is ${currentDate}.` +
        " You are Quantumhash, an AI assistant developed by the Quantumhash development team. " +
        "When you were developed, you were created in 2024 by the Quantumhash development team. " +
        "If someone asks for your name, *only say*: 'My name is Quantumhash AI.' " +
        " If someone asks who developed you, *only say*: 'I was developed by the Quantumhash development team." +
        ` If someone asks about your knowledge cutoff date, *only say*: 'I’ve got information up to the present, ${currentDate}.` +
        "You have access to previous documents uploaded by the user during this conversation ,Use all relevant information from those documents to help answer the user's current and follow-up questions.",
    };

    // Step 6: Build messages array
    const finalMessages = [systemPrompt];

    // Add recent 10 messages (5 user + 5 assistant)
    const recentHistory = chatHistory.slice(-10);
    finalMessages.push(...recentHistory);

    // Add combined document context
    if (allExtractedTexts.length > 0) {
      const combinedText = allExtractedTexts.join("\n---\n").substring(0, 5000);
      finalMessages.push({
        role: "system",
        content: `DOCUMENT CONTEXT:\n${combinedText}${
          combinedText.length >= 5000 ? "\n... (truncated)" : ""
        }`,
      });
    }

    // Build full user message
    let fullUserMessage = userMessage || "";
    if (Array.isArray(uploadedFiles)) {
      const fileNames = uploadedFiles
        .map((f) => f?.file_name)
        .filter(Boolean);
      if (fileNames.length > 0) {
        fullUserMessage += `\n[Uploaded files: ${fileNames.join(", ")}]`;
      }
    }

    finalMessages.push({ role: "user", content: fullUserMessage });

    // Step 7: AI Response
    let aiResponse = "";
    try {
      const aiOptions = {
        model: process.env.USE_OPENAI === "true" ? "gpt-4" : "deepseek-chat",
        messages: finalMessages,
        temperature: 0.7,
        max_tokens: 1500,
      };

      const aiProvider = process.env.USE_OPENAI === "true" ? openai : deepseek;
      const aiResult = await aiProvider.chat.completions.create(aiOptions);
      aiResponse =
        aiResult.choices?.[0]?.message?.content ||
        "I couldn't generate a response. Please try again.";
    } catch (aiError) {
      console.error("AI API error:", aiError);
      aiResponse =
        "I'm having trouble processing your request. Please try again.";
    }

    // Step 8: Save new chat entry
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
        "INSERT INTO chat_history (conversation_id, user_message, response, created_at, file_path, extracted_text,file_names) VALUES (?, ?, ?, NOW(), ?, ?, ?)",
        [
          conversation_id,
          userMessage, // No filename in user message
          aiResponse,
          filePaths || null,
          extracted_summary || null,
          fileNames || null,
        ]
      );

      // 🔄 Rename logic (keep same)
      if (userMessage) {
        const [rows] = await db.query(
          "SELECT name FROM conversations WHERE id = ?",
          [conversation_id]
        );

        const currentName = rows?.name;
        console.log("Current conversation name:", currentName);
        console.log("User message:", userMessage);

        if (currentName === "New Conversation") {
          const newName =
            userMessage.length > 20
              ? userMessage.substring(0, 17) + "..."
              : userMessage;

          console.log("Renaming conversation to:", newName);

          const [updateResult] = await db.query(
            "UPDATE conversations SET name = ? WHERE id = ?",
            [newName, conversation_id]
          );

          console.log("✅ Rename result:", updateResult);
        }
      }
    } catch (dbError) {
      console.error("❌ Database save error:", dbError);
    }

    // Step 9: Respond to frontend
    res.json({
      success: true,
      conversation_id,
      response: aiResponse,
      uploaded_files: uploadedFiles.map((file) => ({
        file_name: file.file_name,
        file_path: file.file_path,
        file_type: file.file_name?.split(".").pop()?.toLowerCase() || null,
      })),
      context: {
        document_available: allExtractedTexts.length > 0,
      },
    });
  } catch (error) {
    console.error("❌ Chat controller error:", error.stack || error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};







//  delete function 

exports.softDeleteConversation = async (req, res) => {
  const { id } = req.params;
  const userId = req.user.user_id;

  try {
    const result = await db.query(
      'UPDATE conversations SET is_deleted = TRUE WHERE id = ? AND user_id = ?',
      [id, userId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Conversation not found or unauthorized' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('❌ Error soft deleting conversation:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

