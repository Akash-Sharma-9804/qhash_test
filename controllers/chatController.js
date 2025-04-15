
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

        // Step 3: Fetch chat history with proper error handling
        let historyResults = [];
        try {
            const [historyResultsRaw] = await db.query(
                "SELECT user_message AS message, response, extracted_text, file_path FROM chat_history WHERE conversation_id = ? ORDER BY created_at ASC",
                [conversation_id]
            );
            historyResults = Array.isArray(historyResultsRaw) ? historyResultsRaw : [];
        } catch (dbError) {
            console.error("Database history fetch error:", dbError);
            historyResults = [];
        }

        // Step 4: Build conversation context safely
        const chatHistory = [];
        let activeDocument = null;
        let candidateName = null;

        // Safely iterate through history
        if (historyResults && historyResults.forEach) {
            historyResults.forEach(chat => {
                // Track active document
                if (chat?.extracted_text) {
                    activeDocument = {
                        content: chat.extracted_text,
                        filePaths: chat.file_path ? chat.file_path.split(',') : []
                    };
                    
                    // Extract candidate name if available
                    if (chat.extracted_text) {
                        const nameMatch = chat.extracted_text.match(/Candidate['']s Name:\s*([^\n|]+)/i);
                        if (nameMatch) candidateName = nameMatch[1].trim();
                    }
                }

                // Build message history
                if (chat?.message) chatHistory.push({ role: "user", content: chat.message });
                if (chat?.response) chatHistory.push({ role: "assistant", content: chat.response });
            });
        }

        // Step 5: Handle new document uploads
        if (extracted_summary && extracted_summary !== "No readable content") {
            activeDocument = {
                content: extracted_summary,
                filePaths: (req.body.uploaded_file_metadata || []).map(f => f?.file_path).filter(Boolean)
            };
            
            // Extract candidate name from new document
            const nameMatch = extracted_summary.match(/Candidate['']s Name:\s*([^\n|]+)/i);
            if (nameMatch) candidateName = nameMatch[1].trim();
        }

        // Step 6: Create system prompt
        const currentDate = new Date().toLocaleDateString('en-US', {
            year: 'numeric', month: 'long', day: 'numeric'
        });

        const systemPrompt = {
            role: "system",
            content: `You are an expert document assistant. Follow these rules:
1. Current Date: ${currentDate}
2. ${activeDocument ? 'DOCUMENT AVAILABLE' : 'NO DOCUMENT'}
3. ${candidateName ? `Candidate: ${candidateName}` : 'No candidate identified'}
4. For personal data: Only share if found in documents`
        };

        // Step 7: Construct final messages safely
        const finalMessages = [systemPrompt];
        
        // Add last 10 exchanges (5 user + 5 assistant)
        const recentHistory = chatHistory.slice(-10);
        finalMessages.push(...recentHistory);

        // Add document context if available
        if (activeDocument?.content) {
            finalMessages.push({
                role: "system",
                content: `DOCUMENT CONTEXT:\n${activeDocument.content.substring(0, 2000)}${activeDocument.content.length > 2000 ? '...' : ''}`
            });
        }

        // Add current message with file context
        let fullUserMessage = userMessage || "";
        if (Array.isArray(req.body.uploaded_file_metadata)) {
            const fileNames = req.body.uploaded_file_metadata
                .map(f => f?.file_name)
                .filter(Boolean);
            if (fileNames.length > 0) {
                fullUserMessage += `\n[Attached files: ${fileNames.join(', ')}]`;
            }
        }
        finalMessages.push({ role: "user", content: fullUserMessage });

        // Step 8: Generate AI response
        let aiResponse = "";
        try {
            const aiOptions = {
                model: process.env.USE_OPENAI === "true" ? "gpt-4" : "deepseek-chat",
                messages: finalMessages,
                temperature: 0.7,
                max_tokens: 1500
            };

            const aiProvider = process.env.USE_OPENAI === "true" ? openai : deepseek;
            const aiResult = await aiProvider.chat.completions.create(aiOptions);
            aiResponse = aiResult.choices?.[0]?.message?.content || "I couldn't generate a response. Please try again.";

            // Enhance document-specific responses
            if (activeDocument?.content) {
                if (userMessage.toLowerCase().includes('date of birth')) {
                    const dobMatch = activeDocument.content.match(/date of birth[:]?\s*([^\n]+)/i);
                    aiResponse = dobMatch 
                        ? `From the document: Date of Birth is ${dobMatch[1].trim()}`
                        : "The document doesn't contain a clear date of birth. It might use different wording like 'DOB' or be in another section.";
                }
            }
        } catch (aiError) {
            console.error("AI API error:", aiError);
            aiResponse = "I'm having trouble processing your request. Please try again.";
        }

        // Step 9: Save conversation with error handling
        try {
            const filePaths = (req.body.uploaded_file_metadata || [])
                .map(f => f?.file_path)
                .filter(Boolean);
            
            await db.query(
                "INSERT INTO chat_history (conversation_id, user_message, response, created_at, file_path, extracted_text) VALUES (?, ?, ?, NOW(), ?, ?)",
                [
                    conversation_id, 
                    fullUserMessage, 
                    aiResponse, 
                    filePaths.join(','), 
                    extracted_summary || null
                ]
            );
        } catch (dbError) {
            console.error("Database save error:", dbError);
        }

        // Step 10: Return response
        res.json({
            success: true,
            conversation_id,
            response: aiResponse,
            context: {
                document_available: !!activeDocument,
                candidate_name: candidateName || undefined
            }
        });

    } catch (error) {
        console.error("❌ Chat controller error:", error.stack || error.message);
        res.status(500).json({ 
            error: "Internal server error",
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};


// exports.askChatbot = async (req, res) => {
//     console.log("✅ Received request at /chat:", req.body);

//     let { userMessage, conversation_id, extracted_summary } = req.body;
//     const user_id = req.user?.user_id;

//     // Authentication and validation
//     if (!user_id) return res.status(401).json({ error: "Unauthorized" });
//     if (!userMessage && !extracted_summary) return res.status(400).json({ error: "Message or document required" });

//     try {
//         // Conversation management
//         if (!conversation_id || isNaN(conversation_id)) {
//             const [convResult] = await db.query(
//                 "INSERT INTO conversations (user_id, name) VALUES (?, ?)",
//                 [user_id, userMessage?.substring(0, 20) || "New Chat"]
//             );
//             conversation_id = convResult.insertId;
//         }

//         // Verify ownership
//         const [existingConv] = await db.query(
//             "SELECT id FROM conversations WHERE id = ? AND user_id = ?",
//             [conversation_id, user_id]
//         );
//         if (!existingConv?.length) return res.status(403).json({ error: "Unauthorized conversation" });

//         // Get conversation history with document context
//         const [history] = await db.query(`
//             SELECT user_message, response, extracted_text, file_path 
//             FROM chat_history 
//             WHERE conversation_id = ? 
//             ORDER BY created_at ASC
//         `, [conversation_id]);

//         // Context tracking
//         const messages = [];
//         let documentContext = null;
//         let candidateDetails = {
//             name: null,
//             dob: null,
//             id: null
//         };

//         // Process history to extract and maintain context
//         history.forEach(record => {
//             // Add conversation messages
//             if (record.user_message) messages.push({ role: "user", content: record.user_message });
//             if (record.response) messages.push({ role: "assistant", content: record.response });

//             // Extract and maintain document context
//             if (record.extracted_text) {
//                 documentContext = record.extracted_text;
                
//                 // Enhanced information extraction
//                 const nameMatch = documentContext.match(/Candidate['’]s Name[:]?\s*([^\n|]+)/i);
//                 const dobMatch = documentContext.match(/Date of Birth[:]?\s*([^\n|]+)/i);
//                 const idMatch = documentContext.match(/(Candidate ID|ID Number)[:]?\s*([^\n|]+)/i);

//                 if (nameMatch) candidateDetails.name = nameMatch[1].trim();
//                 if (dobMatch) candidateDetails.dob = dobMatch[1].trim();
//                 if (idMatch) candidateDetails.id = idMatch[2]?.trim();
//             }
//         });

//         // Handle new document upload
//         if (extracted_summary && extracted_summary !== "No readable content") {
//             documentContext = extracted_summary;
            
//             // Extract details from new document
//             const nameMatch = documentContext.match(/Candidate['’]s Name[:]?\s*([^\n|]+)/i);
//             const dobMatch = documentContext.match(/Date of Birth[:]?\s*([^\n|]+)/i);
//             const idMatch = documentContext.match(/(Candidate ID|ID Number)[:]?\s*([^\n|]+)/i);

//             if (nameMatch) candidateDetails.name = nameMatch[1].trim();
//             if (dobMatch) candidateDetails.dob = dobMatch[1].trim();
//             if (idMatch) candidateDetails.id = idMatch[2]?.trim();
//         }

//         // Build system prompt with dynamic context
//         const systemPrompt = {
//             role: "system",
//             content: `You are QuantumHash Assistant. Current context:
// ${candidateDetails.name ? `- Candidate: ${candidateDetails.name}` : "- No candidate identified"}
// ${candidateDetails.dob ? `- Date of Birth: ${candidateDetails.dob}` : "- DOB not specified"}
// ${documentContext ? "- Document available for reference" : "- No document provided"}

// Rules:
// 1. For candidate queries, use EXACT details from documents when available
// 2. Never invent personal information
// 3. When details are missing, specify what's needed`
//         };

//         // Construct message history (last 6 exchanges)
//         const recentMessages = messages.slice(-12); // Last 6 user-assistant pairs
//         const finalMessages = [systemPrompt, ...recentMessages];

//         // Add current message with file context
//         let currentMessage = userMessage || "";
//         if (req.body.uploaded_file_metadata?.length) {
//             const fileList = req.body.uploaded_file_metadata.map(f => f.file_name).join(", ");
//             currentMessage += `\n[Attached files: ${fileList}]`;
//         }
//         finalMessages.push({ role: "user", content: currentMessage });

//         // Generate response
//         let response = "";
//         try {
//             const aiResponse = await openai.chat.completions.create({
//                 model: "gpt-4",
//                 messages: finalMessages,
//                 temperature: 0.7,
//                 max_tokens: 1500
//             });
//             response = aiResponse.choices[0].message.content;

//             // Enhance specific responses
//             if (userMessage.toLowerCase().includes('date of birth')) {
//                 response = candidateDetails.dob 
//                     ? `The candidate's date of birth is ${candidateDetails.dob} (from document)`
//                     : "Date of birth not found in the document. Please verify the document or provide more details.";
//             }
//         } catch (error) {
//             console.error("AI error:", error);
//             response = "I encountered an error processing your request. Please try again.";
//         }

//         // Save conversation
//         await db.query(
//             `INSERT INTO chat_history 
//              (conversation_id, user_message, response, file_path, extracted_text) 
//              VALUES (?, ?, ?, ?, ?)`,
//             [
//                 conversation_id,
//                 currentMessage,
//                 response,
//                 req.body.uploaded_file_metadata?.map(f => f.file_path).join(",") || null,
//                 extracted_summary || null
//             ]
//         );

//         // Return response with context
//         res.json({
//             success: true,
//             conversation_id,
//             response,
//             context: {
//                 candidate_name: candidateDetails.name,
//                 date_of_birth: candidateDetails.dob,
//                 document_available: !!documentContext
//             }
//         });

//     } catch (error) {
//         console.error("Controller error:", error);
//         res.status(500).json({ 
//             error: "Internal server error",
//             details: process.env.NODE_ENV === 'development' ? error.message : null
//         });
//     }
// };








  
    


