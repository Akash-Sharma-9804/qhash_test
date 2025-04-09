
const db = require("../config/db");
const openai = require("../config/openai");
const deepseek = require("../config/deepseek"); 
const { query } = require("../config/db"); // make sure you're importing correctly

// ✅ Create a new conversation
// exports.createConversation = async (req, res) => {
//     const { name } = req.body;
//     const user_id = req.user?.user_id; // Ensure user_id is retrieved safely

//     if (!name) {
//         return res.status(400).json({ error: "Conversation name is required" });
//     }

//     try {
//         // ✅ Insert new conversation and retrieve insertId
//         const [result] = await db.query(
//             "INSERT INTO conversations (user_id, name) VALUES (?, ?)",
//             [user_id, name]
//         );

//         const conversation_id = result.insertId;
//         console.log("✅ New conversation created with ID:", conversation_id);

//         res.status(201).json({
//             success: true,
//             conversation_id,
//             name,
//         });

//     } catch (error) {
//         console.error("❌ Error creating conversation:", error.message);
//         res.status(500).json({ error: "Failed to create conversation", details: error.message });
//     }
// };
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
            return res.status(500).json({ error: "Database query returned invalid response" });
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
        res.status(500).json({ error: "Failed to create conversation", details: error.message });
    }
};




// ✅ Get all conversations for a user


exports.getConversations = async (req, res) => {
    const user_id = req.user.user_id;
    console.log("🔹 User ID in getConversations:", user_id);

    try {
        const rows = await db.query(
            "SELECT * FROM conversations WHERE user_id = ? ORDER BY created_at DESC",
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
exports.getConversationHistory = async (req, res) => {
    const { conversation_id } = req.params;
  
    if (!conversation_id || isNaN(conversation_id)) {
      return res.status(400).json({ error: "Valid conversation ID is required" });
    }
  
    try {
      const sql = `
        SELECT id, user_message AS message, response, created_at
        FROM chat_history
        WHERE conversation_id = ?
        ORDER BY created_at ASC
      `;
  
      const rows = await query(sql, [parseInt(conversation_id)]); // ✅ uses your wrapper
      console.log("✅ Rows from DB:", rows); // ✅ Should now be an array
  
      if (!rows.length) {
        return res.status(200).json({ success: false, message: "No history found." });
      }
  
      return res.status(200).json({ success: true, history: rows });
    } catch (error) {
      console.error("❌ Error fetching conversation history:", error.message);
      return res.status(500).json({ error: "Failed to retrieve conversation history" });
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

// ✅ Handle User Query with OpenAI & Store Chat in a Conversation
// exports.askChatbot = async (req, res) => {
//     console.log("✅ Received request at /chat:", req.body);

//     let { userMessage, conversation_id } = req.body;
//     const user_id = req.user?.user_id;

//     if (!user_id) {
//         console.log("❌ User ID not found in request.");
//         return res.status(401).json({ error: "Unauthorized: User ID not found." });
//     }

//     if (!userMessage) {
//         return res.status(400).json({ error: "User message is required" });
//     }

//     try {
//         console.log(`🔹 User ID: ${user_id}, Conversation ID: ${conversation_id}`);

//         // ✅ Create a new conversation if conversation_id is missing
//         if (!conversation_id || isNaN(conversation_id)) {
//             console.log("⚠ No conversation ID provided. Creating a new conversation...");

//             const conversationResult = await db.query(
//                 "INSERT INTO conversations (user_id, name) VALUES (?, ?)",
//                 [user_id, userMessage.substring(0, 20)]
//             );

//             if (!conversationResult || !conversationResult.insertId) {
//                 console.error("❌ Inserted conversation did not return an insertId:", conversationResult);
//                 return res.status(500).json({ error: "Database error: No insertId returned." });
//             }

//             conversation_id = conversationResult.insertId;
//             console.log("✅ New conversation created with ID:", conversation_id);
//         }

//         console.log(`🔹 Checking if conversation ${conversation_id} belongs to user ${user_id}`);

//         // ✅ Ensure conversation belongs to the user
//         const [existingConversation] = await db.query(
//             "SELECT id FROM conversations WHERE id = ? AND user_id = ?",
//             [conversation_id, user_id]
//         );

//         if (!existingConversation || existingConversation.length === 0) {
//             console.log(`❌ Unauthorized access: User ${user_id} does not own conversation ${conversation_id}`);
//             return res.status(403).json({ error: "Unauthorized: Conversation does not belong to the user." });
//         }

//         console.log("🔹 Fetching last 5 messages for conversation:", conversation_id);

//         // Retrieve last 5 messages for context
//         const [historyResults] = await db.query(
//             "SELECT user_message AS message, response FROM chat_history WHERE conversation_id = ? ORDER BY created_at DESC LIMIT 5",
//             [conversation_id]
//         );

//         const chatHistory = (historyResults || []).map((chat) => [
//             { role: "user", content: chat.message },
//             { role: "assistant", content: chat.response },
//         ]).flat();

//         chatHistory.push({ role: "user", content: userMessage });

//         console.log("🔹 Sending chat history to OpenAI...");

//         // Get AI response from OpenAI
//         const openaiResponse = await openai.chat.completions.create({
//             model: "gpt-4",
//             messages: chatHistory,
//         });

//         const aiResponse =
//             openaiResponse.choices?.[0]?.message?.content || "Sorry, I couldn't process that.";

//         console.log("🔹 Storing response in chat history...");

//         // Store user message and AI response in chat_history
//         await db.query(
//             "INSERT INTO chat_history (conversation_id, user_message, response) VALUES (?, ?, ?)",
//             [conversation_id, userMessage, aiResponse]
//         );

//         res.json({ success: true, conversation_id, response: aiResponse });

//     } catch (error) {
//         console.error("❌ Error in askChatbot:", error);
//         res.status(500).json({ error: "Internal server error", details: error.message });
//     }
// };

// exports.askChatbot = async (req, res) => {
//     console.log("✅ Received request at /chat:", req.body);

//     let { userMessage, conversation_id } = req.body;
//     const user_id = req.user?.user_id;

//     if (!user_id) {
//         console.log("❌ User ID not found in request.");
//         return res.status(401).json({ error: "Unauthorized: User ID not found." });
//     }

//     if (!userMessage) {
//         return res.status(400).json({ error: "User message is required" });
//     }

//     try {
//         console.log(`🔹 User ID: ${user_id}, Conversation ID: ${conversation_id}`);

//         // ✅ Create a new conversation if conversation_id is missing
//         if (!conversation_id || isNaN(conversation_id)) {
//             console.log("⚠ No conversation ID provided. Creating a new conversation...");

//             const conversationResult = await db.query(
//                 "INSERT INTO conversations (user_id, name) VALUES (?, ?)",
//                 [user_id, userMessage.substring(0, 20)]
//             );

//             if (!conversationResult || !conversationResult.insertId) {
//                 console.error("❌ Inserted conversation did not return an insertId:", conversationResult);
//                 return res.status(500).json({ error: "Database error: No insertId returned." });
//             }

//             conversation_id = conversationResult.insertId;
//             console.log("✅ New conversation created with ID:", conversation_id);
//         }

//         console.log(`🔹 Checking if conversation ${conversation_id} belongs to user ${user_id}`);

//         // ✅ Ensure conversation belongs to the user
//         const [existingConversation] = await db.query(
//             "SELECT id FROM conversations WHERE id = ? AND user_id = ?",
//             [conversation_id, user_id]
//         );

//         if (!existingConversation || existingConversation.length === 0) {
//             console.log(`❌ Unauthorized access: User ${user_id} does not own conversation ${conversation_id}`);
//             return res.status(403).json({ error: "Unauthorized: Conversation does not belong to the user." });
//         }

//         console.log("🔹 Fetching last 5 messages for conversation:", conversation_id);

//         // Retrieve last 5 messages for context
//         const [historyResultsRaw] = await db.query(
//             "SELECT user_message AS message, response FROM chat_history WHERE conversation_id = ? ORDER BY created_at DESC LIMIT 5",
//             [conversation_id]
//         );

//         const historyResults = Array.isArray(historyResultsRaw) ? historyResultsRaw : [];

//         const chatHistory = historyResults.map((chat) => [
//             { role: "user", content: chat.message },
//             { role: "assistant", content: chat.response },
//         ]).flat();

//         chatHistory.push({ role: "user", content: userMessage });

//         console.log("🔹 Sending chat history to OpenAI...");

//         // Get AI response from OpenAI
//         const openaiResponse = await openai.chat.completions.create({
//             model: "gpt-4",
//             messages: chatHistory,
//         });

//         const aiResponse =
//             openaiResponse.choices?.[0]?.message?.content || "Sorry, I couldn't process that.";

//         console.log("🔹 Storing response in chat history...");

//         // Store user message and AI response in chat_history
//         await db.query(
//             "INSERT INTO chat_history (conversation_id, user_message, response) VALUES (?, ?, ?)",
//             [conversation_id, userMessage, aiResponse]
//         );

//         res.json({ success: true, conversation_id, response: aiResponse });

//     } catch (error) {
//         console.error("❌ Error in askChatbot:", error);
//         res.status(500).json({ error: "Internal server error", details: error.message });
//     }
// };

// prevone
// exports.askChatbot = async (req, res) => {
//     console.log("✅ Received request at /chat:", req.body);

//     let { userMessage, conversation_id } = req.body;
//     const user_id = req.user?.user_id;

//     if (!user_id) {
//         console.log("❌ User ID not found in request.");
//         return res.status(401).json({ error: "Unauthorized: User ID not found." });
//     }

//     if (!userMessage) {
//         return res.status(400).json({ error: "User message is required" });
//     }

//     try {
//         console.log(`🔹 User ID: ${user_id}, Conversation ID: ${conversation_id}`);

//         // ✅ Create a new conversation if not provided
//         if (!conversation_id || isNaN(conversation_id)) {
//             console.log("⚠ No conversation ID provided. Creating a new conversation...");

//             const [conversationResult] = await db.query(
//                 "INSERT INTO conversations (user_id, name) VALUES (?, ?)",
//                 [user_id, userMessage.substring(0, 20)]
//             );

//             if (!conversationResult || !conversationResult.insertId) {
//                 console.error("❌ Failed to create conversation.");
//                 return res.status(500).json({ error: "Database error: No insertId returned." });
//             }

//             conversation_id = conversationResult.insertId;
//             console.log("✅ New conversation created with ID:", conversation_id);
//         }

//         // ✅ Ensure conversation belongs to the user
//         const [existingConversation] = await db.query(
//             "SELECT id FROM conversations WHERE id = ? AND user_id = ?",
//             [conversation_id, user_id]
//         );

//         if (!existingConversation || existingConversation.length === 0) {
//             console.log(`❌ Unauthorized access: User ${user_id} does not own conversation ${conversation_id}`);
//             return res.status(403).json({ error: "Unauthorized: Conversation does not belong to the user." });
//         }

//         console.log("🔹 Fetching last 5 messages for conversation:", conversation_id);

//         // ✅ Get last 5 message pairs
//         const [historyResultsRaw] = await db.query(
//             "SELECT user_message AS message, response FROM chat_history WHERE conversation_id = ? ORDER BY created_at DESC LIMIT 5",
//             [conversation_id]
//         );

//         const historyResults = Array.isArray(historyResultsRaw) ? historyResultsRaw : [];

//         const chatHistory = historyResults.map((chat) => [
//             { role: "user", content: chat.message },
//             { role: "assistant", content: chat.response },
//         ]).flat();

//         // ✅ Fetch uploaded file contents and filenames
//         const [files] = await db.query(
//             "SELECT file_path, extracted_text FROM uploaded_files WHERE conversation_id = ?",
//             [conversation_id]
//         );

//         const combinedFileText = files.map(f => f.extracted_text).join("\n\n") || "";
//         const fileNames = files.map(f => f.file_path.split("/").pop()); // for frontend display

//         // ✅ Append user message + extracted file text
//         chatHistory.push({
//             role: "user",
//             content: combinedFileText
//                 ? `${userMessage}\n\n[Here is some content from uploaded files that might help:]\n${combinedFileText}`
//                 : userMessage,
//         });

//         console.log("🔹 Sending chat history to OpenAI...");

//         // ✅ Get OpenAI response
//         const openaiResponse = await openai.chat.completions.create({
//             model: "gpt-4",
//             messages: chatHistory,
//         });

//         const aiResponse = openaiResponse.choices?.[0]?.message?.content || "Sorry, I couldn't process that.";

//         console.log("🔹 Storing response in chat history...");

//         // ✅ Store in DB
//         await db.query(
//             "INSERT INTO chat_history (conversation_id, user_message, response) VALUES (?, ?, ?)",
//             [conversation_id, userMessage, aiResponse]
//         );

//         res.json({
//             success: true,
//             conversation_id,
//             response: aiResponse,
//             uploaded_files: fileNames,
//         });

//     } catch (error) {
//         console.error("❌ Error in askChatbot:", error);
//         res.status(500).json({ error: "Internal server error", details: error.message });
//     }
// };

// latestone 

// exports.askChatbot = async (req, res) => {
//     console.log("✅ Received request at /chat:", req.body);

//     let { userMessage, conversation_id } = req.body;
//     const user_id = req.user?.user_id;

//     console.log("🧪 user_id:", user_id);
//     console.log("🧪 conversation_id:", conversation_id);

//     if (!user_id) {
//         return res.status(401).json({ error: "Unauthorized: User ID not found." });
//     }

//     if (!userMessage) {
//         return res.status(400).json({ error: "User message is required" });
//     }

//     try {
//         // 🔄 Create conversation if not given
//         if (!conversation_id || isNaN(conversation_id)) {
//             const [conversationResult] = await db.query(
//                 "INSERT INTO conversations (user_id, name) VALUES (?, ?)",
//                 [user_id, userMessage.substring(0, 20)]
//             );
//             conversation_id = conversationResult.insertId;
//             console.log("🧪 New conversation created with ID:", conversation_id);
//         }

//         // ✅ Verify conversation ownership
//         const [rows] = await db.query(
//             "SELECT id FROM conversations WHERE id = ? AND user_id = ?",
//             [conversation_id, user_id]
//         );

//         console.log("🧪 existingConversation rows:", rows);

//         if (!rows.length) {
//             return res.status(403).json({ error: "Unauthorized: Conversation does not belong to the user." });
//         }

//         // 🔄 Fetch last few messages
//         const [historyResultsRaw] = await db.query(
//             "SELECT user_message AS message, response FROM chat_history WHERE conversation_id = ? ORDER BY created_at DESC LIMIT 5",
//             [conversation_id]
//         );

//         const historyResults = Array.isArray(historyResultsRaw) ? historyResultsRaw : [];

//         const chatHistory = historyResults.map((chat) => [
//             { role: "user", content: chat.message },
//             { role: "assistant", content: chat.response },
//         ]).flat();

//         // 🧠 Append file data (if any)
//         const [files] = await db.query(
//             "SELECT file_path, extracted_text FROM uploaded_files WHERE conversation_id = ?",
//             [conversation_id]
//         );

//         const combinedFileText = files.map(f => f.extracted_text).join("\n\n") || "";
//         const fileNames = files.map(f => f.file_path.split("/").pop());

//         chatHistory.push({
//             role: "user",
//             content: combinedFileText
//                 ? `${userMessage}\n\n[Here is some content from uploaded files that might help:]\n${combinedFileText}`
//                 : userMessage,
//         });

//         // OpenAI API request
//         let openaiResponse;
//         try {
//             openaiResponse = await openai.chat.completions.create({
//                 model: "gpt-4",
//                 messages: chatHistory,
//             });
//         } catch (openaiError) {
//             console.error("❌ OpenAI API Error:", openaiError);
//             return res.status(500).json({ error: "Failed to get response from OpenAI", details: openaiError.message });
//         }

//         const aiResponse = openaiResponse?.choices?.[0]?.message?.content || "Sorry, I couldn't process that.";

//         // Store the chat history in the database
//         try {
//             await db.query(
//                 "INSERT INTO chat_history (conversation_id, user_message, response) VALUES (?, ?, ?)",
//                 [conversation_id, userMessage, aiResponse]
//             );
//         } catch (dbError) {
//             console.error("❌ Database Insert Error:", dbError);
//             return res.status(500).json({ error: "Failed to save chat history", details: dbError.message });
//         }

//         res.json({
//             success: true,
//             conversation_id,
//             response: aiResponse,
//             uploaded_files: fileNames,
//         });

//     } catch (error) {
//         console.error("❌ Error in askChatbot:", error);

//         // Handle connection reset errors
//         if (error.code === 'ECONNRESET') {
//             console.error("❌ Database connection was reset. Retrying...");
//             // Retry logic or alerting
//         }

//         res.status(500).json({ error: "Internal server error", details: error.message });
//     }
// };


// exports.askChatbot = async (req, res) => {
//     console.log("✅ Received request at /chat:", req.body);

//     let { userMessage, conversation_id } = req.body;
//     const user_id = req.user?.user_id;

//     if (!user_id) {
//         console.log("❌ User ID not found in request.");
//         return res.status(401).json({ error: "Unauthorized: User ID not found." });
//     }

//     if (!userMessage) {
//         return res.status(400).json({ error: "User message is required" });
//     }

//     try {
//         console.log(`🔹 User ID: ${user_id}, Conversation ID: ${conversation_id}`);

//         // ✅ Create a new conversation if not provided
//         if (!conversation_id || isNaN(conversation_id)) {
//             console.log("⚠ No conversation ID provided. Creating a new conversation...");

//             const [conversationResult] = await db.query(
//                 "INSERT INTO conversations (user_id, name) VALUES (?, ?)",
//                 [user_id, userMessage.substring(0, 20)]
//             );

//             if (!conversationResult || !conversationResult.insertId) {
//                 console.error("❌ Failed to create conversation.");
//                 return res.status(500).json({ error: "Database error: No insertId returned." });
//             }

//             conversation_id = conversationResult.insertId;
//             console.log("✅ New conversation created with ID:", conversation_id);
//         }

//         // ✅ Ensure conversation belongs to the user
//         const [existingConversation] = await db.query(
//             "SELECT id FROM conversations WHERE id = ? AND user_id = ?",
//             [conversation_id, user_id]
//         );

//         if (!existingConversation || existingConversation.length === 0) {
//             console.log(`❌ Unauthorized access: User ${user_id} does not own conversation ${conversation_id}`);
//             return res.status(403).json({ error: "Unauthorized: Conversation does not belong to the user." });
//         }

//         console.log("🔹 Fetching last 5 messages for conversation:", conversation_id);

//         // ✅ Get last 5 message pairs
//         const [historyResultsRaw] = await db.query(
//             "SELECT user_message AS message, response FROM chat_history WHERE conversation_id = ? ORDER BY created_at DESC LIMIT 5",
//             [conversation_id]
//         );

//         const historyResults = Array.isArray(historyResultsRaw) ? historyResultsRaw : [];

//         const chatHistory = historyResults.map((chat) => [
//             { role: "user", content: chat.message },
//             { role: "assistant", content: chat.response },
//         ]).flat();

//         // ✅ Fetch uploaded file contents and filenames
//         const [files] = await db.query(
//             "SELECT file_path, extracted_text FROM uploaded_files WHERE conversation_id = ?",
//             [conversation_id]
//         );

//         // Ensure `files` is an array, even if no files are found
//         const safeFiles = Array.isArray(files) ? files : [];
        
//         const combinedFileText = safeFiles.map(f => f.extracted_text).join("\n\n") || "";
//         const fileNames = safeFiles.map(f => f.file_path.split("/").pop()); // for frontend display

//         // ✅ Append user message + extracted file text
//         chatHistory.push({
//             role: "user",
//             content: combinedFileText
//                 ? `${userMessage}\n\n[Here is some content from uploaded files that might help:]\n${combinedFileText}`
//                 : userMessage,
//         });

//         console.log("🔹 Sending chat history to OpenAI...");

//         // ✅ Get OpenAI response
//         const openaiResponse = await openai.chat.completions.create({
//             model: "gpt-4",
//             messages: chatHistory,
//         });

//         const aiResponse = openaiResponse.choices?.[0]?.message?.content || "Sorry, I couldn't process that.";

//         console.log("🔹 Storing response in chat history...");

//         // ✅ Store in DB
//         await db.query(
//             "INSERT INTO chat_history (conversation_id, user_message, response) VALUES (?, ?, ?)",
//             [conversation_id, userMessage, aiResponse]
//         );

//         res.json({
//             success: true,
//             conversation_id,
//             response: aiResponse,
//             uploaded_files: fileNames,
//         });

//     } catch (error) {
//         console.error("❌ Error in askChatbot:", error);
//         res.status(500).json({ error: "Internal server error", details: error.message });
//     }
// };

// exports.askChatbot = async (req, res) => {
//     console.log("✅ Received request at /chat:", req.body);

//     let { userMessage, conversation_id, extracted_summary } = req.body;
//     const user_id = req.user?.user_id;

//     if (!user_id) {
//         console.log("❌ User ID not found in request.");
//         return res.status(401).json({ error: "Unauthorized: User ID not found." });
//     }

//     if (!userMessage && !extracted_summary) {
//         return res.status(400).json({ error: "User message or extracted summary is required" });
//     }

//     try {
//         console.log(`🔹 User ID: ${user_id}, Conversation ID: ${conversation_id}`);

//         // Create a new conversation if not provided
//         if (!conversation_id || isNaN(conversation_id)) {
//             console.log("⚠ No conversation ID provided. Creating a new conversation...");

//             const [conversationResult] = await db.query(
//                 "INSERT INTO conversations (user_id, name) VALUES (?, ?)",
//                 [user_id, userMessage.substring(0, 20)]
//             );

//             if (!conversationResult || !conversationResult.insertId) {
//                 console.error("❌ Failed to create conversation.");
//                 return res.status(500).json({ error: "Database error: No insertId returned." });
//             }

//             conversation_id = conversationResult.insertId;
//             console.log("✅ New conversation created with ID:", conversation_id);
//         }

//         // Ensure conversation belongs to the user
//         const [existingConversation] = await db.query(
//             "SELECT id FROM conversations WHERE id = ? AND user_id = ?",
//             [conversation_id, user_id]
//         );

//         if (!existingConversation || existingConversation.length === 0) {
//             console.log(`❌ Unauthorized access: User ${user_id} does not own conversation ${conversation_id}`);
//             return res.status(403).json({ error: "Unauthorized: Conversation does not belong to the user." });
//         }

//         console.log("🔹 Fetching last 5 messages for conversation:", conversation_id);

//         // Get last 5 message pairs
//         const [historyResultsRaw] = await db.query(
//             "SELECT user_message AS message, response FROM chat_history WHERE conversation_id = ? ORDER BY created_at DESC LIMIT 5",
//             [conversation_id]
//         );

//         const historyResults = Array.isArray(historyResultsRaw) ? historyResultsRaw : [];

//         const chatHistory = historyResults.map((chat) => [
//             { role: "user", content: chat.message },
//             { role: "assistant", content: chat.response },
//         ]).flat();

//         // Fetch uploaded file contents and filenames
//         const [files] = await db.query(
//             "SELECT file_path, extracted_text FROM uploaded_files WHERE conversation_id = ?",
//             [conversation_id]
//         );

//         const safeFiles = Array.isArray(files) ? files : [];
//         const combinedFileText = safeFiles.map(f => f.extracted_text).join("\n\n") || "";
//         const fileNames = safeFiles.map(f => f.file_path.split("/").pop());

//         // Append user message + extracted file text
//         let fullUserMessage = userMessage || "";
//         if (extracted_summary) {
//             fullUserMessage += `\n\n[Here is some content from uploaded files that might help:]\n${extracted_summary}`;
//         }
//         fullUserMessage += combinedFileText ? `\n\n[File contents:]\n${combinedFileText}` : "";

//         chatHistory.push({
//             role: "user",
//             content: fullUserMessage,
//         });

//         console.log("🔹 Sending chat history to OpenAI...");

//         // Get OpenAI response
//         const openaiResponse = await openai.chat.completions.create({
//             model: "gpt-4",
//             messages: chatHistory,
//         });

//         const aiResponse = openaiResponse.choices?.[0]?.message?.content || "Sorry, I couldn't process that.";

//         console.log("🔹 Storing response in chat history...");

//         // Store in DB
//         await db.query(
//             "INSERT INTO chat_history (conversation_id, user_message, response) VALUES (?, ?, ?)",
//             [conversation_id, fullUserMessage, aiResponse]
//         );

//         res.json({
//             success: true,
//             conversation_id,
//             response: aiResponse,
//             uploaded_files: fileNames,
//         });

//     } catch (error) {
//         console.error("❌ Error in askChatbot:", error);
//         res.status(500).json({ error: "Internal server error", details: error.message });
//     }
// };

// AskChatbot function:
    // exports.askChatbot = async (req, res) => {
    //     console.log("✅ Received request at /chat:", req.body);

    //     let { userMessage, conversation_id, extracted_summary } = req.body;
    //     const user_id = req.user?.user_id;

    //     if (!user_id) {
    //         console.log("❌ User ID not found in request.");
    //         return res.status(401).json({ error: "Unauthorized: User ID not found." });
    //     }

    //     if (!userMessage && !extracted_summary) {
    //         return res.status(400).json({ error: "User message or extracted summary is required" });
    //     }

    //     try {
    //         console.log(`🔹 User ID: ${user_id}, Conversation ID: ${conversation_id}`);

    //         // Step 1: Check if conversation exists or create a new one
    //         if (!conversation_id || isNaN(conversation_id)) {
    //             const [conversationResult] = await db.query(
    //                 "INSERT INTO conversations (user_id, name) VALUES (?, ?)",
    //                 [user_id, userMessage?.substring(0, 20) || "New Chat"]
    //             );
    //             conversation_id = conversationResult.insertId;
    //             console.log("✅ New conversation created with ID:", conversation_id);
    //         }

    //         // Step 2: Ensure conversation belongs to the user
    //         const [existingConversation] = await db.query(
    //             "SELECT id FROM conversations WHERE id = ? AND user_id = ?",
    //             [conversation_id, user_id]
    //         );
    //         if (!existingConversation || existingConversation.length === 0) {
    //             return res.status(403).json({ error: "Unauthorized: Conversation does not belong to the user." });
    //         }

    //         // Step 3: Fetch last 5 messages
    //         const [historyResultsRaw] = await db.query(
    //             "SELECT user_message AS message, response FROM chat_history WHERE conversation_id = ? ORDER BY created_at DESC LIMIT 5",
    //             [conversation_id]
    //         );
    //         const historyResults = Array.isArray(historyResultsRaw) ? historyResultsRaw : [];

    //         const chatHistory = historyResults
    //             .map((chat) => [
    //                 { role: "user", content: chat.message },
    //                 { role: "assistant", content: chat.response },
    //             ])
    //             .flat()
    //             .filter(m => m?.content); // Filter out empty or undefined messages

    //         // ✅ Insert system prompt with today's date
    //         const currentDate = new Date().toLocaleDateString('en-US', {
    //             year: 'numeric', month: 'long', day: 'numeric'
    //         });

    //         const system_prompt = {
    //             role: "system",
    //             content:
    //                 "You are Quantumhash, an AI assistant developed by the Quantumhash development team. " +
    //                 "When you were developed, you were created in 2024 by the Quantumhash development team. " +
                    
    //                 "If someone asks for your name, *only say*: 'My name is Quantumhash AI.' " +
    //                 "If someone asks who developed you, *only say*: 'I was developed by the Quantumhash development team.' " +
    //                 "If someone asks about your knowledge cutoff date, *only say*: " +
    //                 `'I don’t have a strict knowledge cutoff date. My knowledge is continuously updated, so I’ve got information all the way up to the present, ${currentDate}.' ` 
                    
    //         };
    //         chatHistory.unshift(system_prompt);

    //         // Step 4: Fetch uploaded file contents
    //         const [files] = await db.query(
    //             "SELECT file_path, extracted_text FROM uploaded_files WHERE conversation_id = ?",
    //             [conversation_id]
    //         );
    //         const safeFiles = Array.isArray(files) ? files : [];
    //         const combinedFileText = safeFiles.map(f => f.extracted_text).join("\n\n") || "";
    //         const fileNames = safeFiles.map(f => f.file_path.split("/").pop());

    //         // Step 5: Combine user message + extracted file text
    //         let fullUserMessage = userMessage || "";
    //         if (extracted_summary) {
    //             fullUserMessage += `\n\n[Here is some content from uploaded files that might help:]\n${extracted_summary}`;
    //         }
    //         if (combinedFileText) {
    //             fullUserMessage += `\n\n[File contents:]\n${combinedFileText}`;
    //         }

    //         chatHistory.push({
    //             role: "user",
    //             content: fullUserMessage,
    //         });

    //         // Step 6: AI API selection
    //         let aiResponse = "";

    //         if (process.env.USE_OPENAI === "true") {
    //             const openaiResponse = await openai.chat.completions.create({
    //                 model: "gpt-4",
    //                 messages: chatHistory,
    //             });
    //             aiResponse = openaiResponse.choices?.[0]?.message?.content || "Sorry, I couldn't process that.";
    //         } else {
    //             const deepseekResponse = await deepseek.chat.completions.create({
    //                 model: "deepseek-chat",
    //                 messages: chatHistory,
    //             });

    //             console.log("🧠 DeepSeek raw response:", deepseekResponse);

    //             aiResponse = deepseekResponse?.choices?.[0]?.message?.content || "Sorry, I couldn't process that.";
    //         }

    //         // Step 7: Save chat
    //         await db.query(
    //             "INSERT INTO chat_history (conversation_id, user_message, response) VALUES (?, ?, ?)",
    //             [conversation_id, fullUserMessage, aiResponse]
    //         );

    //         // Step 8: Return to client
    //         res.json({
    //             success: true,
    //             conversation_id,
    //             response: aiResponse,
    //             uploaded_files: fileNames,
    //         });

    //     } catch (error) {
    //         console.error("❌ Error in askChatbot:", error);
    //         res.status(500).json({ error: "Internal server error", details: error.message });
    //     }
    // };

   exports.askChatbot = async (req, res) => {
    console.log("✅ Received request at /chat:", req.body);

    let { userMessage, conversation_id, extracted_summary } = req.body;
    const user_id = req.user?.user_id;

    if (!user_id) {
        console.log("❌ User ID not found in request.");
        return res.status(401).json({ error: "Unauthorized: User ID not found." });
    }

    if (!userMessage && !extracted_summary) {
        return res.status(400).json({ error: "User message or extracted summary is required" });
    }

    try {
        console.log(`🔹 User ID: ${user_id}, Conversation ID: ${conversation_id}`);

        // Step 1: Check if conversation exists or create a new one
        if (!conversation_id || isNaN(conversation_id)) {
            const [conversationResult] = await db.query(
                "INSERT INTO conversations (user_id, name) VALUES (?, ?)",
                [user_id, userMessage?.substring(0, 20) || "New Chat"]
            );
            conversation_id = conversationResult.insertId;
            console.log("✅ New conversation created with ID:", conversation_id);
        }

        // Step 2: Ensure conversation belongs to the user
        const [existingConversation] = await db.query(
            "SELECT id FROM conversations WHERE id = ? AND user_id = ?",
            [conversation_id, user_id]
        );
        if (!existingConversation || existingConversation.length === 0) {
            return res.status(403).json({ error: "Unauthorized: Conversation does not belong to the user." });
        }

        // Step 3: Fetch last 5 messages
        const [historyResultsRaw] = await db.query(
            "SELECT user_message AS message, response FROM chat_history WHERE conversation_id = ? ORDER BY created_at DESC LIMIT 5",
            [conversation_id]
        );
        const historyResults = Array.isArray(historyResultsRaw) ? historyResultsRaw : [];

        const chatHistory = historyResults
            .map((chat) => [
                { role: "user", content: chat.message },
                { role: "assistant", content: chat.response },
            ])
            .flat()
            .filter(m => m?.content); // Filter out empty or undefined messages

        // ✅ Insert system prompt with today's date
        const currentDate = new Date().toLocaleDateString('en-US', {
            year: 'numeric', month: 'long', day: 'numeric'
        });

        const system_prompt = {
            role: "system",
            content:
                "You are Quantumhash, an AI assistant developed by the Quantumhash development team. " +
                "When you were developed, you were created in 2024 by the Quantumhash development team. " +
                "If someone asks for your name, *only say*: 'My name is Quantumhash AI.' " +
                "If someone asks who developed you, *only say*: 'I was developed by the Quantumhash development team.' " +
                "If someone asks about your knowledge cutoff date, *only say*: " +
                `'I don’t have a strict knowledge cutoff date. My knowledge is continuously updated, so I’ve got information all the way up to the present, ${currentDate}.' `
        };
        chatHistory.unshift(system_prompt);

      // Step 4: Fetch uploaded file contents
const [files] = await db.query(
    "SELECT file_path, extracted_text FROM uploaded_files WHERE conversation_id = ?",
    [conversation_id]
);
const safeFiles = Array.isArray(files) ? files : [];
const fileNames = safeFiles.map(f => f.file_path.split("/").pop());
const filePaths = safeFiles.map(f => f.file_path); // Needed for DB save later
const combinedFileText = safeFiles.map(f => f.extracted_text).join("\n\n") || "";

// Step 5: Combine user message + uploaded filenames only
let fullUserMessage = userMessage || "";

if (fileNames.length > 0) {
    fullUserMessage += `\n\n[Uploaded files:]\n${fileNames.map(name => `📎 ${name}`).join("\n")}`;
}

chatHistory.push({
    role: "user",
    content: fullUserMessage,
});


       // Step 6: AI API selection
let aiResponse = "";

if (process.env.USE_OPENAI === "true") {
    const openaiResponse = await openai.chat.completions.create({
        model: "gpt-4",
        messages: chatHistory,
    });
    aiResponse = openaiResponse.choices?.[0]?.message?.content || "Sorry, I couldn't process that.";
} else {
    const deepseekResponse = await deepseek.chat.completions.create({
        model: "deepseek-chat",
        messages: chatHistory,
    });

    console.log("🧠 DeepSeek raw response:", deepseekResponse);

    aiResponse = deepseekResponse?.choices?.[0]?.message?.content || "Sorry, I couldn't process that.";
}

// Step 7: Save chat
await db.query(
    "INSERT INTO chat_history (conversation_id, user_message, response, extracted_text) VALUES (?, ?, ?, ?)",
    [
        conversation_id,
        fullUserMessage,
        aiResponse,
        combinedFileText || null,
    ]
);

// Step 8: Return to client
res.json({
    success: true,
    conversation_id,
    response: aiResponse,
    uploaded_files: fileNames, // ✅ Only file names, not full paths
});


    } catch (error) {
        console.error("❌ Error in askChatbot:", error);
        res.status(500).json({ error: "Internal server error", details: error.message });
    }
};

// exports.askChatbot = async (req, res) => {
//     console.log("✅ Received request at /chat:", req.body);

//     let { userMessage, conversation_id } = req.body;
//     const user_id = req.user?.user_id;

//     if (!user_id) {
//         return res.status(401).json({ error: "Unauthorized: User ID not found." });
//     }

//     if (!userMessage && !req.body.extracted_summary) {
//         return res.status(400).json({ error: "User message or extracted summary is required" });
//     }

//     try {
//         // Step 1: Check or create conversation
//         if (!conversation_id || isNaN(conversation_id)) {
//             const [conversationResult] = await db.query(
//                 "INSERT INTO conversations (user_id, name) VALUES (?, ?)",
//                 [user_id, userMessage?.substring(0, 20) || "New Chat"]
//             );
//             conversation_id = conversationResult.insertId;
//         }

//         // Step 2: Verify user owns the conversation
//         const [existingConversation] = await db.query(
//             "SELECT id FROM conversations WHERE id = ? AND user_id = ?",
//             [conversation_id, user_id]
//         );
//         if (!existingConversation || existingConversation.length === 0) {
//             return res.status(403).json({ error: "Unauthorized: Conversation does not belong to the user." });
//         }

//         // Step 3: Fetch last 5 messages
//         const [historyResultsRaw] = await db.query(
//             "SELECT user_message AS message, response FROM chat_history WHERE conversation_id = ? ORDER BY created_at DESC LIMIT 5",
//             [conversation_id]
//         );
//         const historyResults = Array.isArray(historyResultsRaw) ? historyResultsRaw : [];

//         const chatHistory = historyResults
//             .map(chat => [
//                 { role: "user", content: chat.message },
//                 { role: "assistant", content: chat.response },
//             ])
//             .flat()
//             .filter(m => m?.content);

//         // Step 4: Add system prompt
//         const currentDate = new Date().toLocaleDateString('en-US', {
//             year: 'numeric', month: 'long', day: 'numeric'
//         });

//         const system_prompt = {
//             role: "system",
//             content:
//                 "You are Quantumhash, an AI assistant developed by the Quantumhash development team. " +
//                 "When you were developed, you were created in 2024 by the Quantumhash development team. " +
//                 "If someone asks for your name, *only say*: 'My name is Quantumhash AI.' " +
//                 "If someone asks who developed you, *only say*: 'I was developed by the Quantumhash development team.' " +
//                 `If someone asks about your knowledge cutoff date, *only say*: 'I’ve got information up to the present, ${currentDate}.'`
//         };
//         chatHistory.unshift(system_prompt);

//         // Step 5: Get uploaded file info
//         const [rawFiles] = await db.query(
//             "SELECT file_path, extracted_text FROM uploaded_files WHERE conversation_id = ?",
//             [conversation_id]
//         );
//         const files = Array.isArray(rawFiles) ? rawFiles : [];

//         let filePaths = [], fileNames = [], combinedExtractedText = "";

//         if (files.length > 0) {
//             filePaths = files.map(f => f.file_path);
//             fileNames = filePaths.map(p => p.split("/").pop());
//             combinedExtractedText = files.map(f => f.extracted_text).join("\n\n");
//         }

//         // Step 6: Append file names to user message (only names, not extracted content)
//         let fullUserMessage = userMessage || "";
//         if (fileNames.length > 0) {
//             fullUserMessage += `\n\n[Uploaded files:]\n${fileNames.map(name => `📎 ${name}`).join("\n")}`;
//         }

//         chatHistory.push({
//             role: "user",
//             content: fullUserMessage,
//         });

//         // Step 7: AI response
//         let aiResponse = "";
//         if (process.env.USE_OPENAI === "true") {
//             const openaiResponse = await openai.chat.completions.create({
//                 model: "gpt-4",
//                 messages: chatHistory,
//             });
//             aiResponse = openaiResponse.choices?.[0]?.message?.content || "Sorry, I couldn't process that.";
//         } else {
//             const deepseekResponse = await deepseek.chat.completions.create({
//                 model: "deepseek-chat",
//                 messages: chatHistory,
//             });
//             aiResponse = deepseekResponse?.choices?.[0]?.message?.content || "Sorry, I couldn't process that.";
//         }

//         // Step 8: Save message + file path + extracted text
//         await db.query(
//             "INSERT INTO chat_history (conversation_id, user_message, response, file_path, extracted_text) VALUES (?, ?, ?, ?, ?)",
//             [
//                 conversation_id,
//                 fullUserMessage,
//                 aiResponse,
//                 filePaths.join(", ") || null,
//                 combinedExtractedText || null,
//             ]
//         );

//         // Step 9: Return response
//         res.json({
//             success: true,
//             conversation_id,
//             response: aiResponse,
//             uploaded_files: fileNames,
//         });

//     } catch (error) {
//         console.error("❌ askChatbot error:", error.stack || error.message);
//         res.status(500).json({ error: "Internal server error", details: error.message });
//     }
// };


  
    


