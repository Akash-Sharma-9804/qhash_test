
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
        return res.status(200).json({ success: false, history: [] });
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



// working
 
// exports.askChatbot = async (req, res) => {
//     console.log("✅ Received request at /chat:", req.body);

//     let { userMessage, conversation_id, extracted_summary } = req.body;
//     const user_id = req.user?.user_id;

//     if (!user_id) {
//         return res.status(401).json({ error: "Unauthorized: User ID not found." });
//     }

//     if (!userMessage && !extracted_summary) {
//         return res.status(400).json({ error: "User message or extracted summary is required" });
//     }

//     try {
//         // Step 1: Create conversation if not exists
//         if (!conversation_id || isNaN(conversation_id)) {
//             const [conversationResult] = await db.query(
//                 "INSERT INTO conversations (user_id, name) VALUES (?, ?)",
//                 [user_id, userMessage?.substring(0, 20) || "New Chat"]
//             );
//             conversation_id = conversationResult.insertId;
//         }

//         // Step 2: Check ownership
//         const [existingConversation] = await db.query(
//             "SELECT id FROM conversations WHERE id = ? AND user_id = ?",
//             [conversation_id, user_id]
//         );
//         if (!existingConversation || existingConversation.length === 0) {
//             return res.status(403).json({ error: "Unauthorized: Conversation does not belong to the user." });
//         }

//         // Step 3: Fetch history
//         // const [historyResultsRaw] = await db.query(
//         //     "SELECT user_message AS message, response FROM chat_history WHERE conversation_id = ? ORDER BY created_at DESC LIMIT 5",
//         //     [conversation_id]
//         // );

//         const [historyResultsRaw] = await db.query(
//             "SELECT user_message AS message, response FROM chat_history WHERE conversation_id = ? ORDER BY created_at ASC",
//             [conversation_id]
//           );
          


//         const historyResults = Array.isArray(historyResultsRaw) ? historyResultsRaw : [];
//         const chatHistory = historyResults
//             .map(chat => [
//                 { role: "user", content: chat.message },
//                 { role: "assistant", content: chat.response },
//             ])
//             .flat()
//             .filter(m => m?.content);

//         // Step 4: System prompt
//         const currentDate = new Date().toLocaleDateString('en-US', {
//             year: 'numeric', month: 'long', day: 'numeric'
//         });

//         const systemPrompt = {
//             role: "system",
//             content:
//                 "You are Quantumhash, an AI assistant developed by the Quantumhash development team. " +
//                 "When you were developed, you were created in 2024 by the Quantumhash development team. " +
//                 "If someone asks for your name, *only say*: 'My name is Quantumhash AI.' " +
//                 "If someone asks who developed you, *only say*: 'I was developed by the Quantumhash development team.' " +
//                 `If someone asks about your knowledge cutoff date, *only say*: 'I’ve got information up to the present, ${currentDate}.'`
//         };

//         chatHistory.unshift(systemPrompt);

//         // Step 5: Get uploaded file paths and names
//         let filePaths = [];
//         let fileNames = [];
        
//         if (Array.isArray(req.body.uploaded_file_metadata) && req.body.uploaded_file_metadata.length > 0) {
//             filePaths = req.body.uploaded_file_metadata.map(f => f.file_path);
//             fileNames = req.body.uploaded_file_metadata.map(f => f.file_name);
//           }
          
        

// // Step 6: Construct full user message
// let fullUserMessage = userMessage || "";

// if (fileNames.length > 0) {
//     fullUserMessage += `\n\n[Uploaded files:]\n${fileNames.map(name => `📎 ${name}`).join("\n")}`;
//     // DO NOT override filePaths here — it's already correct
// }


//         console.log("Full User Message (with filenames only):", fullUserMessage);
//         console.log("File Paths (for DB insertion):", filePaths); // Debug log to check if filePaths is populated

//         // Step 7: Add fullUserMessage to chat history
//         chatHistory.push({
//             role: "user",
//             content: fullUserMessage,
//         });

//         // ✅ Step 7.5: Add extracted summary for AI context only (page-specific Q&A enabled)
//         if (extracted_summary && extracted_summary.trim() && extracted_summary !== "No readable content") {
//             chatHistory.push({
//                 role: "user",
//                 content:
//                     `The following is the full extracted content from the uploaded files, broken down by page. ` +
//                     `Use this to answer page-specific questions, such as "what is on page 9":\n\n` +
//                     extracted_summary
//             });
//         }

//         console.log("Full User Message:", fullUserMessage);

//         // Step 8: AI API
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
//         console.log("AI Response:", aiResponse);

//         // Step 9: Save to DB with extracted_summary
//         console.log("Inserting into DB - Conversation ID:", conversation_id, "Full User Message:", fullUserMessage, "AI Response:", aiResponse, "File Paths:", filePaths, "Extracted Summary:", extracted_summary);
//         await db.query(
//             "INSERT INTO chat_history (conversation_id, user_message, response, created_at, file_path, extracted_text) VALUES (?, ?, ?, NOW(), ?, ?)",
//             [conversation_id, fullUserMessage, aiResponse, filePaths.join(","), extracted_summary || null]
//         );

//         // Step 10: Return response
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

// test

exports.askChatbot = async (req, res) => {
    console.log("✅ Received request at /chat:", req.body);

    let { userMessage, conversation_id, extracted_summary } = req.body;
    const user_id = req.user?.user_id;

    if (!user_id) {
        return res.status(401).json({ error: "Unauthorized: User ID not found." });
    }

    if (!userMessage && !extracted_summary) {
        return res.status(400).json({ error: "User message or extracted summary is required" });
    }

    try {
        // Step 1: Create conversation if not exists
        if (!conversation_id || isNaN(conversation_id)) {
            const [conversationResult] = await db.query(
                "INSERT INTO conversations (user_id, name) VALUES (?, ?)",
                [user_id, userMessage?.substring(0, 20) || "New Chat"]
            );
            conversation_id = conversationResult.insertId;
        }

        // Step 2: Check ownership
        const [existingConversation] = await db.query(
            "SELECT id FROM conversations WHERE id = ? AND user_id = ?",
            [conversation_id, user_id]
        );
        if (!existingConversation || existingConversation.length === 0) {
            return res.status(403).json({ error: "Unauthorized: Conversation does not belong to the user." });
        }

        // Step 3: Fetch chat history with more context
        const [historyResultsRaw] = await db.query(
            `SELECT 
                user_message AS message, 
                response, 
                extracted_text,
                file_path,
                created_at
             FROM chat_history 
             WHERE conversation_id = ? 
             ORDER BY created_at ASC`,
            [conversation_id]
        );

        const historyResults = Array.isArray(historyResultsRaw) ? historyResultsRaw : [];
        
        // Build conversation history with context awareness
        const chatHistory = [];
        let lastExtractedText = null;
        
        historyResults.forEach(chat => {
            // Add user message
            if (chat.message) {
                chatHistory.push({ role: "user", content: chat.message });
            }
            
            // Add assistant response
            if (chat.response) {
                chatHistory.push({ role: "assistant", content: chat.response });
            }
            
            // Track the most recent extracted text
            if (chat.extracted_text) {
                lastExtractedText = chat.extracted_text;
            }
        });

        // Step 4: Enhanced system prompt with conversation management
        const currentDate = new Date().toLocaleDateString('en-US', {
            year: 'numeric', month: 'long', day: 'numeric'
        });

        const systemPrompt = {
            role: "system",
            content:
                `You are Quantumhash, an intelligent AI assistant. Follow these guidelines:\n` +
                `1. Maintain full context of the ongoing conversation\n` +
                `2. Remember all previously discussed topics in this chat\n` +
                `3. For file-related questions, reference the extracted content when available\n` +
                `4. If a question refers to previous messages, connect it to the relevant context\n` +
                `5. When unsure, ask clarifying questions\n` +
                `Current date: ${currentDate}\n\n` +
                `Conversation context:\n` +
                `- User ID: ${user_id}\n` +
                `- Conversation ID: ${conversation_id}\n` +
                `${lastExtractedText ? '- Document content is available for reference' : ''}`
        };

        const finalMessages = [systemPrompt];

        // Step 5: Smarter document context injection
        const hasExistingSummary = historyResults.some(chat => chat.extracted_text === extracted_summary);
        
        if (extracted_summary && extracted_summary.trim() && extracted_summary !== "No readable content") {
            if (!hasExistingSummary) {
                // For new documents, provide full context
                finalMessages.push({
                    role: "assistant",
                    content: `📄 Document content available for reference (${extracted_summary.length.toLocaleString()} characters)`
                });
                
                // Store the full content in the lastExtractedText variable
                lastExtractedText = extracted_summary;
            }
            
            // Always add a condensed version of the document to the context
            const condensedSummary = extracted_summary.length > 2000 
                ? `${extracted_summary.substring(0, 2000)}... [document continues]`
                : extracted_summary;
                
            finalMessages.push({
                role: "system",
                content: `Current document context:\n${condensedSummary}`
            });
        }

        // Step 6: Add conversation history with context window management
        const MAX_HISTORY_LENGTH = 20; // Limit to last 20 exchanges
        const recentHistory = chatHistory.slice(-MAX_HISTORY_LENGTH * 2); // Multiply by 2 for user/assistant pairs
        
        finalMessages.push(...recentHistory);

        // Step 7: Enhanced current message handling
        let fullUserMessage = userMessage || "";
        const fileContext = [];
        
        if (Array.isArray(req.body.uploaded_file_metadata) {
            req.body.uploaded_file_metadata.forEach(f => {
                fileContext.push(`- ${f.file_name} (${f.file_size ? (f.file_size / 1024).toFixed(1) + 'KB' : 'size unknown'})`);
            });
        }

        if (fileContext.length > 0) {
            fullUserMessage += `\n\n[Attached files:\n${fileContext.join('\n')}]`;
        }

        finalMessages.push({
            role: "user",
            content: fullUserMessage
        });

        console.log("🧠 Final Prompt to AI:", JSON.stringify(finalMessages, null, 2));

        // Step 8: Enhanced AI response generation
        let aiResponse = "";
        const aiOptions = {
            model: process.env.USE_OPENAI === "true" ? "gpt-4" : "deepseek-chat",
            messages: finalMessages,
            temperature: 0.7,
            max_tokens: 1500,
            top_p: 0.9,
            frequency_penalty: 0.2, // Slightly reduce repetition
            presence_penalty: 0.2   // Slightly encourage new topics
        };

        try {
            const aiProvider = process.env.USE_OPENAI === "true" ? openai : deepseek;
            const aiResult = await aiProvider.chat.completions.create(aiOptions);
            
            aiResponse = aiResult.choices?.[0]?.message?.content || "I couldn't generate a response. Please try again.";
            
            // Post-process the response for better conversation flow
            if (lastExtractedText && userMessage.toLowerCase().match(/(page|section|part)\s+\d+/i)) {
                const pageMatch = userMessage.match(/(page|section|part)\s+(\d+)/i);
                if (pageMatch) {
                    const pageNum = pageMatch[2];
                    if (!aiResponse.includes(pageNum) && !aiResponse.includes("page")) {
                        aiResponse = `Regarding page ${pageNum}:\n${aiResponse}\n\n[If this doesn't answer your question about page ${pageNum}, please provide more details]`;
                    }
                }
            }
        } catch (error) {
            console.error("AI API error:", error);
            aiResponse = "I'm having trouble processing your request. Please try again later.";
        }

        console.log("🤖 AI Response:", aiResponse);

        // Step 9: Enhanced database storage
        const filePaths = (req.body.uploaded_file_metadata || []).map(f => f.file_path);
        await db.query(
            `INSERT INTO chat_history 
             (conversation_id, user_message, response, created_at, file_path, extracted_text, message_context) 
             VALUES (?, ?, ?, NOW(), ?, ?, ?)`,
            [
                conversation_id, 
                fullUserMessage, 
                aiResponse, 
                filePaths.join(","), 
                extracted_summary || null,
                JSON.stringify({
                    systemPrompt: systemPrompt.content,
                    historyLength: recentHistory.length
                })
            ]
        );

        // Step 10: Return enhanced response
        res.json({
            success: true,
            conversation_id,
            response: aiResponse,
            uploaded_files: (req.body.uploaded_file_metadata || []).map(f => f.file_name),
            context: {
                history_items: recentHistory.length / 2,
                document_available: !!lastExtractedText
            }
        });

    } catch (error) {
        console.error("❌ askChatbot error:", error.stack || error.message);
        res.status(500).json({ 
            error: "Internal server error", 
            details: error.message,
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
};











  
    


