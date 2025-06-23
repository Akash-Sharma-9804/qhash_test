const db = require("../config/db");
const openai = require("../config/openai");
const deepseek = require("../config/deepseek");
const { query } = require("../config/db"); // make sure you're importing correctly
const { extractUrls, processUrls } = require("../utils/urlProcessor");
const { sanitizeDisplayName } = require("../utils/FilenameGenerator"); // ✅ ADD THIS
const llama = require("../config/llama");
const { selectOptimalModel } = require("../utils/tokenCounter");

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
   WHERE user_id = ? AND is_deleted = FALSE
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
      let files = [];

      // ✅ PREFER JSON METADATA OVER LEGACY FORMAT
      if (msg.file_metadata) {
        try {
          const metadata = JSON.parse(msg.file_metadata);
          files = metadata.map(file => ({
            file_path: file.file_path,
            file_name: file.original_filename || file.display_filename, // ✅ Show original name
            display_name: sanitizeDisplayName(file.original_filename || file.display_filename),
            unique_filename: file.unique_filename,
            file_size: file.file_size,
            mime_type: file.mime_type,
            type: file.file_path?.split(".").pop() || "file",
            upload_timestamp: file.upload_timestamp,
            is_secure: true // ✅ Indicates unique filename system
          }));
        } catch (parseError) {
          console.error("❌ Error parsing file metadata:", parseError);
          // Fallback to legacy format
          files = parseLegacyFileFormat(msg.file_path, msg.file_names);
        }
      } else {
        // ✅ LEGACY SUPPORT
        files = parseLegacyFileFormat(msg.file_path, msg.file_names);
      }

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

    console.log("✅ Retrieved", formattedHistory.length, "messages for conversation:", conversation_id);

    return res.status(200).json({
      success: true,
      history: formattedHistory,
      conversation_id: parseInt(conversation_id),
      user_id: user_id,
    });
  } catch (error) {
    console.error("❌ Error fetching conversation history:", error.message);
    return res.status(500).json({ error: "Failed to retrieve conversation history" });
  }
};
// ✅ FIXED GET CONVERSATION HISTORY WITH OWNERSHIP VALIDATION
// exports.getConversationHistory = async (req, res) => {
//   const { conversation_id } = req.params;
//   const user_id = req.user?.user_id;

//   // ✅ VALIDATE INPUTS
//   if (!conversation_id || isNaN(conversation_id)) {
//     return res.status(400).json({ error: "Valid conversation ID is required" });
//   }

//   if (!user_id || isNaN(user_id)) {
//     console.error("❌ Invalid user_id in getConversationHistory:", user_id);
//     return res.status(401).json({ error: "Unauthorized: Invalid user ID" });
//   }

//   console.log("🔍 Fetching history for conversation:", conversation_id, "user:", user_id);

//   try {
//     // ✅ VERIFY CONVERSATION OWNERSHIP FIRST
//     const ownershipCheck = await executeQuery(
//       "SELECT id FROM conversations WHERE id = ? AND user_id = ? AND is_deleted = FALSE",
//       [parseInt(conversation_id), user_id]
//     );

//     if (!ownershipCheck || ownershipCheck.length === 0) {
//       console.error("❌ Unauthorized access attempt - conversation:", conversation_id, "user:", user_id);
//       return res.status(403).json({
//         error: "Unauthorized: Conversation does not belong to user",
//       });
//     }

//     // ✅ FETCH HISTORY WITH ALL FILE COLUMNS
//     const history = await executeQuery(
//       `SELECT id, user_message AS message, response, created_at, file_names, file_path, file_metadata, suggestions
//        FROM chat_history
//        WHERE conversation_id = ?
//        ORDER BY created_at ASC`,
//       [parseInt(conversation_id)]
//     );

//     if (!history || history.length === 0) {
//       return res.status(200).json({ success: true, history: [] });
//     }

//     // ✅ ALSO GET ALL FILES FROM uploaded_files TABLE FOR THIS CONVERSATION
//     const allUploadedFiles = await executeQuery(
//       `SELECT file_path, file_metadata, created_at 
//        FROM uploaded_files 
//        WHERE conversation_id = ? AND user_id = ? 
//        AND (status = 'confirmed' OR status IS NULL)
//        ORDER BY created_at ASC`,
//       [parseInt(conversation_id), user_id]
//     );

//     console.log(`📁 Found ${allUploadedFiles.length} uploaded files for conversation ${conversation_id}`);

//     const formattedHistory = history.map((msg) => {
//       let files = [];

//       // ✅ METHOD 1: Try to get files from chat_history file_metadata
//       if (msg.file_metadata) {
//         try {
//           const metadataArray = JSON.parse(msg.file_metadata);
//           if (Array.isArray(metadataArray)) {
//             files = metadataArray.map(metadataStr => {
//               try {
//                 const metadata = typeof metadataStr === 'string' ? JSON.parse(metadataStr) : metadataStr;
//                 return {
//                   file_path: metadata.file_path,
//                   file_name: metadata.original_filename || metadata.display_filename,
//                   display_name: sanitizeDisplayName(metadata.original_filename || metadata.display_filename),
//                   unique_filename: metadata.unique_filename,
//                   file_size: metadata.file_size,
//                   mime_type: metadata.mime_type,
//                   type: metadata.file_path?.split(".").pop() || "file",
//                   upload_timestamp: metadata.upload_timestamp,
//                   is_secure: true
//                 };
//               } catch (innerParseError) {
//                 console.error("❌ Error parsing inner metadata:", innerParseError);
//                 return null;
//               }
//             }).filter(Boolean);
//           }
//         } catch (parseError) {
//           console.error("❌ Error parsing file_metadata from chat_history:", parseError);
//         }
//       }

//       // ✅ METHOD 2: If no files from chat_history, try legacy format
//       if (files.length === 0 && (msg.file_path || msg.file_names)) {
//         files = parseLegacyFileFormat(msg.file_path, msg.file_names);
//       }

//       // ✅ METHOD 3: If still no files, match by timestamp from uploaded_files table
//       if (files.length === 0 && allUploadedFiles.length > 0) {
//         const messageTime = new Date(msg.created_at);
//         const matchingFiles = allUploadedFiles.filter(file => {
//           const fileTime = new Date(file.created_at);
//           const timeDiff = Math.abs(messageTime - fileTime);
//           return timeDiff <= 120000; // Within 2 minutes
//         });

//         if (matchingFiles.length > 0) {
//           files = matchingFiles.map(file => {
//             try {
//               const metadata = JSON.parse(file.file_metadata);
//               return {
//                 file_path: metadata.file_path,
//                 file_name: metadata.original_filename || metadata.display_filename,
//                 display_name: sanitizeDisplayName(metadata.original_filename || metadata.display_filename),
//                 unique_filename: metadata.unique_filename,
//                 file_size: metadata.file_size,
//                 mime_type: metadata.mime_type,
//                 type: metadata.file_path?.split(".").pop() || "file",
//                 upload_timestamp: metadata.upload_timestamp,
//                 is_secure: true
//               };
//             } catch (parseError) {
//               console.error("❌ Error parsing uploaded file metadata:", parseError);
//               return null;
//             }
//           }).filter(Boolean);
//         }
//       }

//       console.log(`📄 Message ${msg.id}: Found ${files.length} files`);

//       return {
//         id: msg.id,
//         sender: "user",
//         message: msg.message,
//         response: msg.response,
//         suggestions: msg.suggestions ? JSON.parse(msg.suggestions) : [],
//         files: files.length > 0 ? files : undefined,
//         created_at: msg.created_at,
//       };
//     });

//     console.log("✅ Retrieved", formattedHistory.length, "messages for conversation:", conversation_id);
//     console.log("📁 Total files across all messages:", formattedHistory.reduce((sum, msg) => sum + (msg.files?.length || 0), 0));

//     return res.status(200).json({
//       success: true,
//       history: formattedHistory,
//       conversation_id: parseInt(conversation_id),
//       user_id: user_id,
//     });
//   } catch (error) {
//     console.error("❌ Error fetching conversation history:", error.message);
//     return res.status(500).json({ error: "Failed to retrieve conversation history" });
//   }
// };


// ✅ HELPER FUNCTION FOR LEGACY FILE FORMAT
function parseLegacyFileFormat(filePaths, fileNames) {
  if (!filePaths && !fileNames) return [];
  
  const paths = filePaths ? filePaths.split(",") : [];
  const names = fileNames ? fileNames.split(",") : [];

  return paths.map((path, index) => ({
    file_path: path.trim(),
    file_name: names[index]?.trim() || `file-${index + 1}`,
    display_name: sanitizeDisplayName(names[index]?.trim() || `file-${index + 1}`),
    type: path.split(".").pop() || "file",
    legacy_format: true,
    is_secure: false // ✅ Legacy files may not be secure
  }));
}

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

  let { userMessage, conversation_id, extracted_summary, _file_upload_ids } = req.body;
  const user_id = req.user?.user_id;
  // const uploadedFiles = req.body.uploaded_file_metadata || [];

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
  // ✅ ENSURE USER MESSAGE EXISTS (even if no files)
  if (!userMessage || userMessage.trim().length === 0) {
    return res.status(400).json({
      error: "User message cannot be empty",
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

           // ✅ ROLLBACK FILES IF UNAUTHORIZED
        await rollbackPendingFiles(_file_upload_ids);

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
    
    // Task 3: Get file context based on whether there's a new upload
const fileContextPromise = getFileContextBasedOnUpload(conversation_id, user_id, extracted_summary, userMessage);   
    // Task 4: Generate suggestions
    const suggestionPromise = generateFastSuggestions(userMessage);

    // ⚡ Get context immediately
    const [contextResult, fileContextResult] = await Promise.all([
      contextPromise,
      fileContextPromise
    ]);

    const { summaryContext, shouldRename, newConversationName } = contextResult;
    const { 
      fileContext = "", 
      fileNames = [], 
      fileCount = 0, 
      contextType = "none" 
    } = fileContextResult || {};

    console.log(`📄 File context: ${fileCount} files, ${fileContext.length} characters, type: ${contextType}`);
    console.log(`📄 File names:`, fileNames);

    console.log(`⚡ Context loaded in ${Date.now() - startTime}ms`);


// After file processing, before sending to AI:
// ✅ HANDLE FILE UPLOADS (Only if files are provided)
   // ✅ HANDLE FILE UPLOADS (Only if files are provided)
    // let fileUploadResults = [];
    // if (uploadedFiles && uploadedFiles.length > 0) {
    //   console.log(`📁 Processing ${uploadedFiles.length} uploaded files...`);
      
    //   for (const file of uploadedFiles) {
    //     try {
    //       const fileBuffer = file.buffer;
    //       const originalFilename = file.originalname;
          
    //       let filePath;
    //       try {
    //         filePath = await uploadToFTP(fileBuffer, originalFilename);
    //         console.log("✅ File uploaded successfully:", filePath);
    //       } catch (ftpError) {
    //         console.error("❌ FTP upload failed:", ftpError.message);
            
    //         fileUploadResults.push({
    //           file_name: originalFilename,
    //           original_filename: originalFilename,
    //           display_filename: sanitizeDisplayName(originalFilename),
    //           file_path: null,
    //           file_size: fileBuffer.length,
    //           mime_type: file.mimetype,
    //           upload_success: false,
    //           error: ftpError.message || "Upload failed",
    //           upload_timestamp: new Date().toISOString()
    //         });
    //         continue;
    //       }
          
    //       let extractedText = "";
    //       try {
    //         extractedText = await extractText(fileBuffer, file.mimetype, originalFilename);
    //       } catch (extractError) {
    //         console.error("❌ Text extraction failed:", extractError.message);
    //         extractedText = "[Error extracting text]";
    //       }
          
    //       fileUploadResults.push({
    //         file_name: originalFilename,
    //         original_filename: originalFilename,
    //         display_filename: sanitizeDisplayName(originalFilename),
    //         unique_filename: filePath.split('/').pop(),
    //         file_path: filePath,
    //         file_size: fileBuffer.length,
    //         mime_type: file.mimetype,
    //         upload_success: true,
    //         error: null,
    //         extracted_text: extractedText,
    //         upload_timestamp: new Date().toISOString()
    //       });
          
    //     } catch (generalError) {
    //       console.error("❌ File processing failed:", generalError.message);
          
    //       fileUploadResults.push({
    //         file_name: file.originalname || "unknown",
    //         original_filename: file.originalname || "unknown",
    //         display_filename: sanitizeDisplayName(file.originalname || "unknown"),
    //         file_path: null,
    //         file_size: file.size || 0,
    //         mime_type: file.mimetype || "unknown",
    //         upload_success: false,
    //         error: generalError.message || "Processing failed",
    //         upload_timestamp: new Date().toISOString()
    //       });
    //     }
    //   }
    // } else {
    //   console.log("📁 No files to process - continuing with text-only chat");
    // }

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
 const finalMessages = buildAIMessagesWithSmartContext(
      summaryContext, 
      extracted_summary, 
      userMessage, 
      userInfo, 
      fileNames,
      fileContext,
      contextType
    );

    // 🚀 START AI RESPONSE STREAM IMMEDIATELY (Don't wait for URLs)
    // let aiResponse = "";
    // const aiStartTime = Date.now();

    // try {
    //   const stream = await deepseek.chat.completions.create({
    //     model: "deepseek-chat",
    //     messages: finalMessages,
    //     temperature: 0.2,
    //     max_tokens: 2000,
    //     stream: true,
    //   });
// 🚀 SMART MODEL SELECTION & AI RESPONSE STREAM
// 🚀 SMART MODEL SELECTION & AI RESPONSE STREAM
let aiResponse = "";
const aiStartTime = Date.now();

// ⚡ Select optimal model based on token count
const modelSelection = await selectOptimalModel(finalMessages);
const selectedModel = modelSelection.model;

console.log(`🤖 Selected Model: ${selectedModel.toUpperCase()} | Tokens: ${modelSelection.tokenCount}`);

let stream;

try {
  if (selectedModel === 'deepseek') {
    // Use DeepSeek - should be reliable
    stream = await deepseek.chat.completions.create({
      model: "deepseek-chat",
      messages: finalMessages,
      temperature: 0.2,
      max_tokens: 2000,
      stream: true,
    });
  } else {
    // Use Llama - handle failure explicitly
    stream = await llama.chat.completions.create({
      messages: finalMessages,
      temperature: 0.2,
      max_tokens: 2000,
      stream: true,
    });
  }
} catch (modelError) {
  console.error(`❌ ${selectedModel.toUpperCase()} API failed:`, modelError.message);
  
  // ✅ ROLLBACK FILES ON MODEL ERROR
  if (_file_upload_ids && Array.isArray(_file_upload_ids) && _file_upload_ids.length > 0) {
    try {
      await rollbackPendingFiles(_file_upload_ids);
      console.log(`🔄 Rolled back ${_file_upload_ids.length} pending files`);
    } catch (rollbackError) {
      console.error("❌ Failed to rollback files:", rollbackError);
    }
  }

  // ✅ SEND ERROR MESSAGE TO FRONTEND (NO AI NEEDED)
  try {
    console.log("📤 Sending error message to frontend...");
    
    res.write(JSON.stringify({
      type: "error",
      error: "I'm unable to process your request at the moment. Please try again in a few minutes.",
      timestamp: new Date().toISOString()
    }) + "\n");
    
    res.end();
    console.log("✅ Error message sent to frontend");
    
  } catch (responseError) {
    console.error("❌ Failed to send error response:", responseError);
  }
  
  return; // ✅ Exit function completely
}

// ✅ Continue with successful stream processing ONLY if no error occurred above
console.log("✅ Model API call successful, starting stream...");

try {
  // Send initial metadata immediately
  res.write(JSON.stringify({
    type: "start",
    conversation_id,
    conversation_name: shouldRename ? "Generating title..." : newConversationName,
    conversation_renamed: shouldRename,
    context: {
      document_available: !!extracted_summary,
      conversation_context_available: !!summaryContext,
      uploaded_files_available: fileCount > 0,
      uploaded_files_count: fileCount,
      uploaded_file_names: fileNames,
      file_context_type: contextType,
    },
    processing_time: Date.now() - startTime,
  }) + "\n");

  console.log(`🚀 AI stream started with ${selectedModel.toUpperCase()} in ${Date.now() - aiStartTime}ms`);

  // Stream the response chunks
// Stream the response chunks
for await (const chunk of stream) {
  if (chunk.choices && chunk.choices.length > 0) {
    const content = chunk.choices[0].delta?.content || "";
    if (content) {
      aiResponse += content;
      res.write(JSON.stringify({
        type: "content",
        content: content,
      }) + "\n");
    }
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

  // ✅ CONFIRM FILES AFTER SUCCESSFUL AI RESPONSE
  if (_file_upload_ids && Array.isArray(_file_upload_ids) && _file_upload_ids.length > 0) {
    try {
      await confirmPendingFiles(_file_upload_ids);
      console.log(`✅ Confirmed ${_file_upload_ids.length} files after successful AI response`);
    } catch (confirmError) {
      console.error("❌ Failed to confirm files:", confirmError);
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
      uploaded_files_available: fileCount > 0,
      uploaded_files_count: fileCount,
      file_context_type: contextType,
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
      extracted_summary,
      suggestions,
      user_id,
      shouldRename,
      finalConversationName,
      processedUrls,
      urlData,
      urlContent,
      fileContext
    );
  });

} catch (streamError) {
  console.error("❌ Streaming error:", streamError);
  
  // ✅ ROLLBACK FILES ON STREAMING ERROR
  if (_file_upload_ids && Array.isArray(_file_upload_ids) && _file_upload_ids.length > 0) {
    try {
      await rollbackPendingFiles(_file_upload_ids);
    } catch (rollbackError) {
      console.error("❌ Failed to rollback files:", rollbackError);
    }
  }
  
  if (!res.headersSent) {
    try {
      res.write(JSON.stringify({
        type: "error",
        error: "I'm unable to process your request at the moment. Please try again in a few minutes."
      }) + "\n");
      res.end();
    } catch (responseError) {
      console.error("❌ Failed to send streaming error response:", responseError);
    }
  }
} 

}catch (error) {
    console.error("❌ Chat controller error:", error.message);
      
    // ✅ ROLLBACK FILES ON GENERAL ERROR
    await rollbackPendingFiles(_file_upload_ids);
    
    if (!res.headersSent) {
      res.status(500).json({ error: "Internal server error" });
    }
  };
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

// ✅ HELPER FUNCTION: ROLLBACK PENDING FILES
async function rollbackPendingFiles(fileIds) {
  if (!fileIds || !Array.isArray(fileIds) || fileIds.length === 0) {
    return;
  }

  try {
    console.log(`🔄 Rolling back ${fileIds.length} pending files...`);
    
    // Delete from database
    await executeQuery(
      `DELETE FROM uploaded_files WHERE id IN (${fileIds.map(() => '?').join(',')}) AND status = 'pending_response'`,
      fileIds
    );
    
    console.log(`✅ Successfully rolled back ${fileIds.length} pending files`);
  } catch (error) {
    console.error("❌ Failed to rollback pending files:", error);
  }
}

// ✅ HELPER FUNCTION: CONFIRM PENDING FILES
async function confirmPendingFiles(fileIds) {
  if (!fileIds || !Array.isArray(fileIds) || fileIds.length === 0) {
    return;
  }

  try {
    console.log(`✅ Confirming ${fileIds.length} pending files...`);
    
    // Update status to confirmed
    await executeQuery(
      `UPDATE uploaded_files SET status = 'confirmed' WHERE id IN (${fileIds.map(() => '?').join(',')}) AND status = 'pending_response'`,
      fileIds
    );
    
    console.log(`✅ Successfully confirmed ${fileIds.length} files`);
  } catch (error) {
    console.error("❌ Failed to confirm pending files:", error);
  }
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

  
// ✅ UPDATE: Only get confirmed files for context
// ✅ SMART: Full context with intelligent token management
// ✅ SMART: Full context with intelligent prioritization (no truncation)
async function getFileContextBasedOnUpload(conversation_id, user_id, extracted_summary, userMessage) {
  if (!conversation_id || isNaN(conversation_id)) {
    return { fileContext: "", fileNames: [], fileCount: 0, contextType: "none" };
  }

  try {
    const hasNewUpload = (extracted_summary && extracted_summary.trim().length > 0 && extracted_summary !== "Success");
    const isAskingAboutFiles = checkIfAskingAboutFiles(userMessage);

    console.log(`📄 New upload: ${hasNewUpload}, Asking about files: ${isAskingAboutFiles}`);

    // Get ALL files
    const allFiles = await executeQuery(
      `SELECT file_path, extracted_text, file_metadata, created_at, status
       FROM uploaded_files 
       WHERE conversation_id = ? AND user_id = ? 
       ORDER BY created_at DESC`,
      [conversation_id, user_id]
    );

    console.log(`🔍 Found ${allFiles.length} total files in conversation`);
    
    const fileNames = [];
    const validFiles = [];

    // Process all files
    if (allFiles && allFiles.length > 0) {
      allFiles.forEach((file, index) => {
        let fileName = "Unknown File";
        if (file.file_metadata) {
          try {
            const metadata = JSON.parse(file.file_metadata);
            fileName = metadata.original_filename || metadata.display_filename || fileName;
          } catch (e) {
            fileName = file.file_path?.split('/').pop() || fileName;
          }
        }
        fileNames.push(fileName);

        // Include files with valid content
        if (file.extracted_text && 
            file.extracted_text !== "No readable content extracted" && 
            file.extracted_text !== "Text extraction failed" &&
            file.extracted_text !== "[Error extracting text]" &&
            file.extracted_text !== "Success" &&
            file.extracted_text.trim().length > 10) {
          
          validFiles.push({ 
            ...file, 
            fileName,
            isNew: file.status === 'pending_response',
            tokenEstimate: Math.ceil(file.extracted_text.length / 4) // Rough token estimate
          });
        }
      });
    }

    // ✅ SMART PRIORITIZATION LOGIC
    if (hasNewUpload || isAskingAboutFiles) {
      const selectedFiles = smartFileSelection(validFiles, userMessage, hasNewUpload, extracted_summary);
      
      let fullContext = "";
      
      // Add new upload content first (highest priority)
      if (hasNewUpload && extracted_summary !== "Success") {
        fullContext += `📎 NEWLY UPLOADED FILES:\n${extracted_summary}\n`;
      }
      
      // Add selected existing files
      if (selectedFiles.length > 0) {
        const fileContexts = selectedFiles.map(file => {
          const statusInfo = file.isNew ? ' [JUST UPLOADED]' : '';
          return `📎 FILE: ${file.fileName}${statusInfo}\n${file.extracted_text}`;
        });

        if (fileContexts.length > 0) {
          const separator = fullContext ? `\n${'='.repeat(60)}\n\nRELEVANT FILES:\n\n` : `RELEVANT FILES:\n\n`;
          fullContext += separator + fileContexts.join('\n\n' + '='.repeat(50) + '\n\n');
        }
      }

      // Add summary of other files if any were excluded
      const excludedFiles = validFiles.filter(f => !selectedFiles.includes(f));
      if (excludedFiles.length > 0) {
        const excludedNames = excludedFiles.map(f => f.fileName).join(", ");
        fullContext += `\n\n📋 OTHER FILES AVAILABLE: ${excludedNames}\n(Ask specifically about any of these for detailed analysis)`;
      }

      const totalTokens = Math.ceil(fullContext.length / 4);
      console.log(`📄 Smart context: ${selectedFiles.length}/${validFiles.length} files, ~${totalTokens} tokens`);

      return {
        fileContext: fullContext,
        fileNames: fileNames,
        fileCount: selectedFiles.length,
        contextType: hasNewUpload ? "new_upload_smart" : "smart_selection",
        totalFiles: validFiles.length,
        excludedFiles: excludedFiles.length
      };
    }

    // Regular chat - minimal context
    const minimalContext = fileNames.length > 0 
      ? `Files available: ${fileNames.join(", ")}\n(Ask me about any file for detailed analysis!)`
      : "";

    return { 
      fileContext: minimalContext, 
      fileNames: fileNames,
      fileCount: fileNames.length,
      contextType: "minimal"
    };

  } catch (error) {
    console.error("❌ Error getting smart file context:", error);
    return { fileContext: "", fileNames: [], fileCount: 0, contextType: "error" };
  }
}

// ✅ SMART FILE SELECTION: Choose files intelligently based on context and tokens
function smartFileSelection(validFiles, userMessage, hasNewUpload, extracted_summary) {
  if (validFiles.length === 0) return [];

  const MAX_CONTEXT_TOKENS = 12000; // Safe limit for file content
  let currentTokens = 0;
  const selectedFiles = [];

  // Add token estimate for new upload
  if (hasNewUpload && extracted_summary) {
    currentTokens += Math.ceil(extracted_summary.length / 4);
  }

  // ✅ PRIORITY 1: New uploads (always include)
  const newFiles = validFiles.filter(f => f.isNew);
  newFiles.forEach(file => {
    if (currentTokens + file.tokenEstimate <= MAX_CONTEXT_TOKENS) {
      selectedFiles.push(file);
      currentTokens += file.tokenEstimate;
    }
  });

  // ✅ PRIORITY 2: Specifically mentioned files
  const message = userMessage.toLowerCase();
  const mentionedFiles = validFiles.filter(file => 
    !file.isNew && // Don't double-add new files
    (message.includes(file.fileName.toLowerCase()) ||
     message.includes(file.fileName.toLowerCase().replace(/\.[^/.]+$/, "")))
  );

  mentionedFiles.forEach(file => {
    if (currentTokens + file.tokenEstimate <= MAX_CONTEXT_TOKENS && !selectedFiles.includes(file)) {
      selectedFiles.push(file);
      currentTokens += file.tokenEstimate;
    }
  });

  // ✅ PRIORITY 3: Handle special requests
  if (message.includes('all files') || message.includes('every file') || message.includes('each file')) {
    // User wants all files - add as many as tokens allow, prioritizing smaller files first
    const remainingFiles = validFiles
      .filter(f => !selectedFiles.includes(f))
      .sort((a, b) => a.tokenEstimate - b.tokenEstimate); // Smaller files first

    remainingFiles.forEach(file => {
      if (currentTokens + file.tokenEstimate <= MAX_CONTEXT_TOKENS) {
        selectedFiles.push(file);
        currentTokens += file.tokenEstimate;
      }
    });
  } else {
    // ✅ PRIORITY 4: Most recent files (if space allows)
    const recentFiles = validFiles
      .filter(f => !selectedFiles.includes(f))
      .slice(0, 2); // Max 2 additional recent files

    recentFiles.forEach(file => {
      if (currentTokens + file.tokenEstimate <= MAX_CONTEXT_TOKENS) {
        selectedFiles.push(file);
        currentTokens += file.tokenEstimate;
      }
    });
  }

  console.log(`🎯 Smart selection: ${selectedFiles.length} files, ~${currentTokens} tokens`);
  return selectedFiles;
}

// ✅ ENHANCED: Better file question detection
function checkIfAskingAboutFiles(userMessage) {
  if (!userMessage) return false;
  
  const message = userMessage.toLowerCase();
  const fileKeywords = [
    // Direct file references
    'file', 'document', 'pdf', 'uploaded', 'attachment', 'doc',
    // Analysis requests  
    'analyze', 'summarize', 'review', 'read', 'explain', 'extract', 'detail',
    // Content queries
    'what does', 'what is in', 'content', 'tell me about', 'show me', 'what are in',
    // Listing requests
    'names', 'list', 'each', 'every', 'all', 'details', 'mention',
    // Comparison requests
    'compare', 'difference', 'similar', 'both files', 'these files',
    // Reference phrases
    'according to', 'based on', 'from the document', 'in the file'
  ];

  return fileKeywords.some(keyword => message.includes(keyword));
}


 

 


// ✅ UPDATED BUILD AI MESSAGES WITH SMART CONTEXT
function buildAIMessagesWithSmartContext(summaryContext, extracted_summary, userMessage, userInfo = null, fileNames = [], fileContext = "", contextType = "none") {
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

  // ✅ CONTEXT-AWARE SYSTEM PROMPT
  let contextInstructions = "";
  switch (contextType) {
    case "current_upload":
      contextInstructions = "\n\nIMPORTANT: The user has just uploaded new files. Focus your response on analyzing and discussing these newly uploaded files unless they specifically ask about previous files in the conversation.";
      break;
    case "minimal_reference":
      contextInstructions = "\n\nNote: There are files available in this conversation, but the user hasn't uploaded new files or asked about existing ones. Focus on their current question. Only reference files if directly relevant to their query.";
      break;
    default:
      contextInstructions = "";
  }

  const systemPrompt = {
    role: "system",
    content: `You are QhashAI — a highly intelligent AI assistant created by the QuantumHash development team in 2024.

Current date: ${currentDate}.

${userContext}

When asked your name: "My name is QhashAI."
Developer: "I was developed by the QuantumHash development team."

You can analyze content from URLs and documents. When referencing external content, cite your sources.

Be helpful, accurate, professional, and use all available context to provide the best possible response.${contextInstructions}`,
  };

  const finalMessages = [systemPrompt];

  // Add conversation context if available
  if (summaryContext) {
    finalMessages.push({
      role: "system",
      content: `CONVERSATION CONTEXT: ${summaryContext}`,
    });
  }

  // ✅ ADD FILE CONTEXT BASED ON TYPE
  if (fileContext && fileContext.length > 0) {
    finalMessages.push({
      role: "system",
      content: fileContext,
    });
    console.log(`📄 Added ${contextType} file context: ${fileContext.length} characters`);
  }

  // Add current document context if available (new upload)
  if (extracted_summary && extracted_summary !== "No readable content") {
    finalMessages.push({
      role: "system",
      content: `NEW DOCUMENT UPLOADED:\n${extracted_summary}`,
    });
  }

  // ✅ PREPARE USER MESSAGE
  let fullUserMessage = userMessage || "";
  
  // Add file reference based on context type
  if (contextType === "current_upload" && Array.isArray(fileNames) && fileNames.length > 0) {
    fullUserMessage += `\n[Just uploaded: ${fileNames.join(", ")}]`;
  } else if (contextType === "minimal_reference" && Array.isArray(fileNames) && fileNames.length > 0) {
    fullUserMessage += `\n[Available files: ${fileNames.join(", ")}]`;
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
// 🚀 OPTIMIZED BACKGROUND TASKS - FIX PARAMETER ORDER
async function handleAllBackgroundTasksOptimized(
  conversation_id,
  userMessage,
  aiResponse,
  extracted_summary,     // ✅ FIX: Move this parameter
  suggestions,
  user_id,              // ✅ FIX: Move this parameter
  shouldRename,
  newConversationName,
  processedUrls = [],
  urlData = [],
  urlContent = "",
  fileContext = ""
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


    // ✅ GET ACTUAL FILE DATA FROM DATABASE
    let uploadedFiles = [];
    if (conversation_id) {
      try {
        const recentFiles = await executeQuery(
          `SELECT file_path, file_metadata, extracted_text, created_at 
           FROM uploaded_files 
           WHERE conversation_id = ? AND user_id = ? 
           AND created_at >= DATE_SUB(NOW(), INTERVAL 5 MINUTE)
           AND (status = 'confirmed' OR status = 'pending_response' OR status IS NULL)
           ORDER BY created_at DESC`,
          [conversation_id, user_id]
        );
        
        uploadedFiles = recentFiles || [];
        console.log(`📁 Found ${uploadedFiles.length} recent files for chat history`);
      } catch (fileError) {
        console.error("❌ Error fetching recent files:", fileError);
      }
    }
    // 🚀 STEP 2: Parallel background operations with timeout
    const backgroundTasks = [
      // ✅ PASS ACTUAL FILE DATA TO saveToDatabase
      Promise.race([
        saveToDatabase(
          conversation_id, 
          userMessage, 
          aiResponse, 
          uploadedFiles, // ✅ FIX: Pass actual file data
          extracted_summary,
          suggestions, 
          processedUrls, 
          urlData, 
          fileContext
        ),
        new Promise((resolve) => setTimeout(() => resolve({ timeout: true }), 5000))
      ]),

      // Rename conversation ONLY if needed
      shouldRename
        ? Promise.race([
            executeRename(conversation_id, userMessage, user_id),
            new Promise((resolve) => setTimeout(() => resolve({ timeout: true }), 3000))
          ])
        : Promise.resolve(false),

       // Generate comprehensive summary with file context
      Promise.race([
        generateAndSaveComprehensiveSummary(conversation_id, userMessage, aiResponse, urlContent, fileContext),
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
      urls_processed: Array.isArray(urlData) ? urlData.length : 0,
    });
  } catch (error) {
    console.error("❌ Optimized background tasks failed:", error);
  }
}


 
// ✅ FIXED SAVE TO DATABASE FUNCTION
async function saveToDatabase(
  conversation_id,
  userMessage,
  aiResponse,
  uploadedFiles,
  extracted_summary,
  suggestions,
  processedUrls = [],
  urlData = [],
  fileContext = ""
) {
  try {
    // ✅ HANDLE UPLOADED FILES WITH CONFIRMED STATUS CHECK
    const filesArray = Array.isArray(uploadedFiles) ? uploadedFiles : [];
    const confirmedFiles = filesArray.filter(file => file && file.status !== 'pending_response');
    
    console.log(`📁 Processing ${filesArray.length} total files, ${confirmedFiles.length} confirmed files`);
    
    // Prepare file data from CONFIRMED files only
    const filePaths = [];
    const fileNames = [];
    const fileMetadataArray = [];

    confirmedFiles.forEach(file => {
      if (file.file_path) {
        filePaths.push(file.file_path);
      }
      
      // Extract file name and metadata
      if (file.file_metadata) {
        try {
          const metadata = JSON.parse(file.file_metadata);
          fileNames.push(metadata.original_filename || metadata.display_filename || 'Unknown');
          fileMetadataArray.push(file.file_metadata);
        } catch (parseError) {
          console.error("❌ Error parsing file metadata:", parseError);
          fileNames.push(file.file_name || file.original_filename || 'Unknown');
        }
      } else {
        // Fallback to direct file properties
        fileNames.push(file.file_name || file.original_filename || 'Unknown');
      }
    });

    // Prepare data for database
    const filePathsString = filePaths.length > 0 ? filePaths.join(",") : null;
    const fileNamesString = fileNames.length > 0 ? fileNames.join(",") : null;
    const fileMetadataString = fileMetadataArray.length > 0 ? JSON.stringify(fileMetadataArray) : null;

    // Prepare URL data
    const urlsString = processedUrls.length > 0 ? processedUrls.join(",") : null;
    const urlContentString = urlData.length > 0
      ? urlData
          .filter((data) => data && data.content && !data.error)
          .map((data) => `[${data.title || 'Untitled'}] ${data.content}`)
          .join("\n---\n")
      : null;

    // ✅ COMBINE ONLY CONFIRMED EXTRACTED TEXT
    let allExtractedText = "";
    if (extracted_summary) {
      allExtractedText += `CURRENT UPLOAD:\n${extracted_summary}\n\n`;
    }
    if (fileContext) {
      allExtractedText += `PREVIOUS FILES:\n${fileContext}`;
    }

    // ✅ UPDATED INSERT QUERY WITH FILE_METADATA
    await executeQuery(
      `INSERT INTO chat_history 
       (conversation_id, user_message, response, created_at, file_path, extracted_text, file_names, file_metadata, suggestions, urls, url_content) 
       VALUES (?, ?, ?, NOW(), ?, ?, ?, ?, ?, ?, ?)`,
      [
        conversation_id,
        userMessage,
        aiResponse,
        filePathsString,
        allExtractedText || null,
        fileNamesString,
        fileMetadataString, // ✅ ADD FILE METADATA
        suggestions && suggestions.length > 0 ? JSON.stringify(suggestions) : null,
        urlsString,
        urlContentString,
      ]
    );

    console.log("✅ Database save successful with confirmed files only:", {
      total_files: filesArray.length,
      confirmed_files: confirmedFiles.length,
      files_saved: filePaths.length,
      file_names: fileNames,
      has_metadata: !!fileMetadataString
    });
    
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
// 🧠 GENERATE COMPREHENSIVE SUMMARY WITH ALL FILE CONTEXT
// async function generateAndSaveComprehensiveSummary(
//   conversation_id,
//   currentUserMessage,
//   currentAiResponse,
//   urlContent = "",
//   fileContext = "" 
// ) {
//   try {
//     console.log("🧠 Generating comprehensive summary with full file context...");

//     // Get ENTIRE conversation history including ALL files
//     const fullHistory = await executeQuery(
//       "SELECT user_message, response, url_content, extracted_text FROM chat_history WHERE conversation_id = ? ORDER BY created_at ASC",
//       [conversation_id]
//     );

//     // ✅ GET ALL FILES EVER UPLOADED IN THIS CONVERSATION
//     const allConversationFiles = await executeQuery(
//       `SELECT extracted_text, file_metadata FROM uploaded_files 
//        WHERE conversation_id = ? 
//        ORDER BY created_at ASC`,
//       [conversation_id]
//     );

//     // Build complete conversation with ALL file context
//     const completeConversation = [];
//     const allFileContext = [];

//     // ✅ ADD ALL FILE CONTEXT TO SUMMARY
//     if (allConversationFiles && allConversationFiles.length > 0) {
//       allConversationFiles.forEach(file => {
//         if (file.extracted_text && 
//             file.extracted_text !== "No readable content extracted" && 
//             file.extracted_text !== "Text extraction failed") {
          
//           let fileName = "Unknown File";
//           if (file.file_metadata) {
//             try {
//               const metadata = JSON.parse(file.file_metadata);
//               fileName = metadata.original_filename || metadata.display_filename || fileName;
//             } catch (parseError) {
//               // Use default name
//             }
//           }
          
//           allFileContext.push(`FILE: ${fileName}\n${file.extracted_text}`);
//         }
//       });
//     }
//     fullHistory.forEach((chat) => {
//       if (chat.user_message) {
//     let userContent = chat.user_message;

//     // Add URL context if available (limited)
//     if (chat.url_content) {
//       const limitedUrlContent = chat.url_content.length > 500 
//         ? chat.url_content.substring(0, 500) + "... [truncated]"
//         : chat.url_content;
//       userContent += `\n[URL Context: ${limitedUrlContent}]`;
//     }

//     // ✅ SKIP FILE CONTEXT - Only note if files were mentioned
//     if (chat.extracted_text) {
//       userContent += `\n[Note: User uploaded files in this message]`;
//     }

//     completeConversation.push({ role: "user", content: userContent });

//   }

//   if (chat.response) {
//     // ✅ LIMIT AI RESPONSE LENGTH
//     const limitedResponse = chat.response.length > 800 
//       ? chat.response.substring(0, 800) + "... [truncated]"
//       : chat.response;
    
//     completeConversation.push({
//   role: "assistant",
//   content: limitedResponse,
// });

//   }
//     });

//     // Add current exchange with all context
//     let currentUserContent = currentUserMessage;
// if (urlContent) {
//   const limitedUrlContent = urlContent.length > 500 
//     ? urlContent.substring(0, 500) + "... [truncated]"
//     : urlContent;
//   currentUserContent += `\n[Current URL Context: ${limitedUrlContent}]`;
// }
// // ✅ SKIP FILE CONTEXT - Only note if files were involved
// if (fileContext) {
//   currentUserContent += `\n[Note: Files were involved in this interaction]`;
// }

//     completeConversation.push({ role: "user", content: currentUserContent });
//     completeConversation.push({
//       role: "assistant",
//       content: currentAiResponse,
//     });

//     console.log(`📊 Creating comprehensive summary for ${completeConversation.length} messages with ALL file context`);
    
//     // Create comprehensive summary with ALL file context
//     const conversationText = completeConversation
//       .map((msg) => `${msg.role}: ${msg.content}`)
//       .join("\n");

//     // ✅ ADD ALL FILE CONTEXT TO SUMMARY PROMPT
//     const allFileContextText = allFileContext.length > 0 
//       ? `\n\nALL FILES IN CONVERSATION:\n${allFileContext.join('\n---\n')}`
//       : "";

//     const summaryPrompt = [
//       {
//         role: "system",
//          content: `Create a comprehensive summary of this conversation focusing on CHAT HISTORY ONLY. Include:

// 1. Main topics and questions discussed in the conversation
// 2. Key insights and conclusions reached through discussion
// 3. User's specific needs, preferences, and communication style
// 4. Important decisions, recommendations, or next steps discussed
// 5. Any technical details, examples, or specific requests mentioned in chat
// 6. URL content insights if any were discussed

// DO NOT include raw file content - only mention what files were discussed and key insights derived from them in the conversation.

// This summary focuses on conversation flow and will be used alongside real-time file context for future AI responses (400-500 words).${allFileContext}`,
//   },
//       {
//         role: "user",
//         content: `Conversation to summarize:\n${conversationText.substring(0, 15000)}`,
//       },
//     ];

//     const summaryResult = await deepseek.chat.completions.create({
//       model: "deepseek-chat",
//       messages: summaryPrompt,
//       temperature: 0.2,
//       max_tokens: 800,
//     });

//     const summary = summaryResult.choices?.[0]?.message?.content || "";

//     if (summary && summary.length > 10) {
//       await executeQuery(
//         "UPDATE chat_history SET summarized_chat = ? WHERE conversation_id = ? ORDER BY created_at DESC LIMIT 1",
//         [summary, conversation_id]
//       );

//       console.log("✅ Comprehensive summary with ALL files generated and saved:", {
//         length: summary.length,
//         message_count: completeConversation.length,
//         files_included: allFileContext.length,
//         conversation_id: conversation_id,
//         summary_preview: summary.substring(0, 100) + "...",
//       });

//       return true;
//     }

//     console.log("⚠️ Summary generation failed - empty or too short");
//     return false;
//   } catch (error) {
//     console.error("❌ Comprehensive summary generation failed:", error);

//     // Fallback: Create a basic summary with file context
//     try {
//       let basicSummary = `User discussed: ${currentUserMessage.substring(0, 200)}${
//         currentUserMessage.length > 200 ? "..." : ""
//       }. AI provided assistance with this topic.`;
      
//       if (urlContent) {
//         basicSummary += " URLs were referenced in the conversation.";
//       }
      
//       if (fileContext) {
//         basicSummary += " Multiple files were uploaded and analyzed throughout the conversation.";
//       }

//       await executeQuery(
//         "UPDATE chat_history SET summarized_chat = ? WHERE conversation_id = ? ORDER BY created_at DESC LIMIT 1",
//         [basicSummary, conversation_id]
//       );

//       console.log("✅ Fallback summary with file context saved");
//       return true;
//     } catch (fallbackError) {
//       console.error("❌ Even fallback summary failed:", fallbackError);
//       return false;
//     }
//   }
// }
// 🧠 FIXED: Lightweight summary with Llama (no file content)
async function generateAndSaveComprehensiveSummary(
  conversation_id,
  currentUserMessage,
  currentAiResponse,
  urlContent = "",
  fileContext = "" 
) {
  try {
    console.log("🧠 Generating lightweight summary with Llama...");

    // ✅ ONLY get chat history (no file content)
    const fullHistory = await executeQuery(
      "SELECT user_message, response FROM chat_history WHERE conversation_id = ? ORDER BY created_at ASC",
      [conversation_id]
    );

    // ✅ ONLY get file NAMES (not content)
    const allConversationFiles = await executeQuery(
      `SELECT file_metadata FROM uploaded_files 
       WHERE conversation_id = ? 
       AND (status = 'confirmed' OR status = 'pending_response' OR status IS NULL)
       ORDER BY created_at ASC`,
      [conversation_id]
    );

    // ✅ Build conversation WITHOUT file content
    const completeConversation = [];
    
    fullHistory.forEach((chat) => {
      if (chat.user_message) {
        // ✅ LIMIT user message length for summary
        const limitedUserMessage = chat.user_message.length > 300 
          ? chat.user_message.substring(0, 300) + "..."
          : chat.user_message;
        
        completeConversation.push({ role: "user", content: limitedUserMessage });
      }

      if (chat.response) {
        // ✅ LIMIT AI response length for summary
        const limitedResponse = chat.response.length > 400 
          ? chat.response.substring(0, 400) + "..."
          : chat.response;
        
        completeConversation.push({ role: "assistant", content: limitedResponse });
      }
    });

    // Add current exchange (also limited)
    const currentUserLimited = currentUserMessage.length > 300 
      ? currentUserMessage.substring(0, 300) + "..."
      : currentUserMessage;
    
    const currentAiLimited = currentAiResponse.length > 400 
      ? currentAiResponse.substring(0, 400) + "..."
      : currentAiResponse;

    completeConversation.push({ role: "user", content: currentUserLimited });
    completeConversation.push({ role: "assistant", content: currentAiLimited });

    // ✅ Create file names summary (NOT content)
    let filesSummary = "";
    if (allConversationFiles && allConversationFiles.length > 0) {
      const fileNames = [];
      allConversationFiles.forEach(file => {
        if (file.file_metadata) {
          try {
            const metadata = JSON.parse(file.file_metadata);
            fileNames.push(metadata.original_filename || metadata.display_filename);
          } catch (e) {}
        }
      });
      
      if (fileNames.length > 0) {
        filesSummary = `\n\nFiles mentioned in conversation: ${fileNames.join(", ")}`;
      }
    }

    // ✅ Build conversation text (limited length)
    const conversationText = completeConversation
      .map((msg) => `${msg.role}: ${msg.content}`)
      .join("\n");

    // ✅ SAFE: Limit total conversation text to prevent token overflow
    const maxConversationLength = 8000; // Safe limit
    const finalConversationText = conversationText.length > maxConversationLength
      ? conversationText.substring(0, maxConversationLength) + "\n...[Earlier messages truncated for summary]"
      : conversationText;

    console.log(`📊 Creating summary: ${completeConversation.length} messages, ${finalConversationText.length} chars`);
    
    // ✅ LIGHTWEIGHT summary prompt (NO file content)
    const summaryPrompt = [
      {
        role: "system",
        content: `Create a concise conversation summary focusing on:

1. Main topics and questions discussed
2. User's key needs and preferences  
3. Important decisions or recommendations made
4. Technical details or specific requests mentioned
5. Files mentioned by name (not content)

Keep it under 400 words for efficient context loading. Focus on conversation flow, not file content.`,
      },
      {
        role: "user",
        content: `Conversation to summarize:\n${finalConversationText}${filesSummary}`,
      },
    ];

    // ✅ USE LLAMA for summary generation
    const summaryResult = await llama.chat.completions.create({
      messages: summaryPrompt,
      temperature: 0.2,
      max_tokens: 600, // Reduced for efficiency
    });

    const summary = summaryResult.choices?.[0]?.message?.content || "";

    if (summary && summary.length > 10) {
      await executeQuery(
        "UPDATE chat_history SET summarized_chat = ? WHERE conversation_id = ? ORDER BY created_at DESC LIMIT 1",
        [summary, conversation_id]
      );

      console.log("✅ Lightweight summary generated with Llama:", {
        length: summary.length,
        message_count: completeConversation.length,
        files_mentioned: allConversationFiles.length,
        conversation_id: conversation_id,
        model: "Llama",
        summary_preview: summary.substring(0, 100) + "...",
      });

      return true;
    }

    console.log("⚠️ Summary generation failed - empty or too short");
    return false;
  } catch (error) {
    console.error("❌ Summary generation failed:", error.message);

    // ✅ SIMPLE fallback summary
    try {
      let basicSummary = `User discussed: ${currentUserMessage.substring(0, 150)}${
        currentUserMessage.length > 150 ? "..." : ""
      }. AI provided assistance with this topic.`;
      
      if (urlContent) {
        basicSummary += " URLs were referenced.";
      }
      
      // ✅ Only mention file count, not content
      const fileCount = allConversationFiles?.length || 0;
      if (fileCount > 0) {
        basicSummary += ` ${fileCount} files were discussed.`;
      }

      await executeQuery(
        "UPDATE chat_history SET summarized_chat = ? WHERE conversation_id = ? ORDER BY created_at DESC LIMIT 1",
        [basicSummary, conversation_id]
      );

      console.log("✅ Fallback summary saved with Llama");
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
