const db = require("../config/db");
const openai = require("../config/openai");
const deepseek = require("../config/deepseek");
const { query } = require("../config/db"); // make sure you're importing correctly
const { extractUrls, processUrls } = require("../utils/urlProcessor");
const { sanitizeDisplayName } = require("../utils/FilenameGenerator"); // ✅ ADD THIS
const llama = require("../config/llama");
const { selectOptimalModel } = require("../utils/tokenCounter");
const FileGenerator = require("../utils/fileGenerator");
// ✅ ADD THESE CONSTANTS AT THE TOP OF THE FILE
const MAX_FILE_GENERATION_TIME = 10000; // 10 seconds max per file
const MAX_CONCURRENT_FILES = 3; // Maximum files to generate simultaneously
const RESPONSE_QUALITY_THRESHOLD = 60; // Minimum quality score

// Add these imports at the top
const natural = require("natural");
const compromise = require("compromise");

// ✅ SMART FILE CREATION DETECTION - Beyond regex
function intelligentFileDetectionAnalysis(userMessage) {
  if (!userMessage || typeof userMessage !== "string") {
    return {
      shouldCreateFile: false,
      confidence: 0,
      fileType: null,
      intent: "none",
    };
  }

  const message = userMessage.toLowerCase().trim();

  // ✅ Use NLP for better understanding
  const doc = compromise(userMessage);

  // Extract verbs and nouns for intent analysis
  const verbs = doc.verbs().out("array");
  const nouns = doc.nouns().out("array");

  let confidence = 0;
  let fileType = null;
  let intent = "none";

  // ✅ HIGH CONFIDENCE INDICATORS (90-100%)
  const highConfidencePatterns = [
    /create\s+(a\s+)?(pdf|document|docx|word|excel|xlsx|txt|file)/i,
    /generate\s+(a\s+)?(pdf|document|docx|word|excel|xlsx|txt|file)/i,
    /make\s+(me\s+)?(a\s+)?(pdf|document|docx|word|excel|xlsx|txt|file)/i,
    /download\s+(a\s+)?(pdf|document|docx|word|excel|xlsx|txt|file)/i,
    /prepare\s+(a\s+)?(pdf|document|docx|word|excel|xlsx|txt|file)/i,
    /draft\s+(a\s+)?(pdf|document|docx|word|excel|xlsx|txt|file)/i,
    /write\s+(a\s+)?(pdf|document|docx|word|excel|xlsx|txt|file)/i,
  ];

  // ✅ MEDIUM CONFIDENCE INDICATORS (70-89%)
  const mediumConfidencePatterns = [
    /create.*?(letter|application|resume|cv|report|invoice|contract)/i,
    /generate.*?(letter|application|resume|cv|report|invoice|contract)/i,
    /make.*?(letter|application|resume|cv|report|invoice|contract)/i,
    /write.*?(letter|application|resume|cv|report|invoice|contract)/i,
    /draft.*?(letter|application|resume|cv|report|invoice|contract)/i,
    /prepare.*?(letter|application|resume|cv|report|invoice|contract)/i,
    /need.*?(downloadable|file|document)/i,
    /want.*?(downloadable|file|document)/i,
  ];

  // ✅ CONTEXTUAL INDICATORS (50-69%)
  const contextualPatterns = [
    /can you (create|make|generate|write|draft|prepare)/i,
    /please (create|make|generate|write|draft|prepare)/i,
    /i need (a|an|some)/i,
    /help me (create|make|generate|write|draft|prepare)/i,
    /(format|template|example) (for|of)/i,
  ];

  // ✅ Check high confidence patterns
  for (const pattern of highConfidencePatterns) {
    const match = message.match(pattern);
    if (match) {
      confidence = 95;
      fileType = detectFileType(match[0], message);
      intent = "create_file";
      break;
    }
  }

  // ✅ Check medium confidence patterns
  if (confidence === 0) {
    for (const pattern of mediumConfidencePatterns) {
      const match = message.match(pattern);
      if (match) {
        confidence = 80;
        fileType = detectDocumentType(match[0], message);
        intent = "create_document";
        break;
      }
    }
  }

  // ✅ Check contextual patterns with verb analysis
  if (confidence === 0) {
    const creationVerbs = [
      "create",
      "make",
      "generate",
      "write",
      "draft",
      "prepare",
      "build",
      "design",
    ];
    const hasCreationVerb = verbs.some((verb) =>
      creationVerbs.some((cv) => verb.toLowerCase().includes(cv))
    );

    const documentNouns = [
      "document",
      "file",
      "letter",
      "application",
      "resume",
      "report",
      "invoice",
    ];
    const hasDocumentNoun = nouns.some((noun) =>
      documentNouns.some((dn) => noun.toLowerCase().includes(dn))
    );

    if (hasCreationVerb && hasDocumentNoun) {
      confidence = 75;
      fileType = detectDocumentType(message, message);
      intent = "create_document";
    } else if (hasCreationVerb) {
      for (const pattern of contextualPatterns) {
        if (pattern.test(message)) {
          confidence = 60;
          fileType = "docx"; // Default to Word document
          intent = "possible_create";
          break;
        }
      }
    }
  }

  // ✅ NEGATIVE INDICATORS (reduce confidence)
  const negativePatterns = [
    /how to (create|make|generate)/i,
    /what is/i,
    /explain/i,
    /tell me about/i,
    /difference between/i,
    /compare/i,
    /analyze/i,
    /summarize/i,
    /just (show|display|list)/i,
  ];

  for (const pattern of negativePatterns) {
    if (pattern.test(message)) {
      confidence = Math.max(0, confidence - 30);
      if (confidence < 50) {
        intent = "information_request";
      }
      break;
    }
  }

  return {
    shouldCreateFile: confidence >= 70, // Threshold for file creation
    confidence,
    fileType: fileType || "docx",
    intent,
    analysis: {
      verbs: verbs.slice(0, 3),
      nouns: nouns.slice(0, 3),
      hasCreationIntent: confidence >= 70,
    },
  };
}

// ✅ SMART FILE TYPE DETECTION
function detectFileType(matchedText, fullMessage) {
  const text = (matchedText + " " + fullMessage).toLowerCase();

  if (/pdf/i.test(text)) return "pdf";
  if (/excel|xlsx|spreadsheet|sheet/i.test(text)) return "xlsx";
  if (/word|docx|document/i.test(text)) return "docx";
  if (/txt|text|plain/i.test(text)) return "txt";

  // Default based on content type
  if (/table|data|calculation|budget|expense/i.test(text)) return "xlsx";
  if (/letter|application|resume|report|contract/i.test(text)) return "docx";

  return "docx"; // Default
}

// ✅ SMART DOCUMENT TYPE DETECTION
function detectDocumentType(matchedText, fullMessage) {
  const text = (matchedText + " " + fullMessage).toLowerCase();

  if (/letter|application|resume|cv|report|invoice|contract/i.test(text)) {
    if (/table|budget|expense|calculation/i.test(text)) return "xlsx";
    return "docx";
  }

  return "docx";
}

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

// ✅ UPDATE YOUR getConversationHistory FUNCTION
exports.getConversationHistory = async (req, res) => {
  const { conversation_id } = req.params;
  const user_id = req.user?.user_id;

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

    // ✅ FETCH HISTORY WITH GENERATED FILES INFO
    const history = await executeQuery(
      `SELECT id, user_message AS message, response, created_at, file_names, file_path, file_metadata, suggestions, generated_file_info
       FROM chat_history
       WHERE conversation_id = ?
       ORDER BY created_at ASC`,
      [parseInt(conversation_id)]
    );

    if (!history || history.length === 0) {
      return res.status(200).json({ success: true, history: [] });
    }

    // ✅ GET ALL GENERATED FILES FOR THIS CONVERSATION (Updated query for your table structure)
    const generatedFiles = await executeQuery(
      `SELECT filename, file_data, file_metadata, mime_type, file_size, 
              COALESCE(ftp_path, '') as ftp_path, 
              COALESCE(download_url, '') as download_url, 
              created_at
       FROM generated_files 
       WHERE conversation_id = ? AND user_id = ?
       ORDER BY created_at ASC`,
      [parseInt(conversation_id), user_id]
    );

    console.log(
      `📁 Found ${generatedFiles.length} generated files for conversation ${conversation_id}`
    );

    const formattedHistory = history.map((msg) => {
      
      let aiGeneratedFiles = [];
let files = [];

console.log("🔍 Processing files for message:", msg.id, {
  has_file_metadata: !!msg.file_metadata,
  file_path: msg.file_path,
  file_names: msg.file_names
});

if (msg.file_metadata) {
  try {
    let metadata = JSON.parse(msg.file_metadata);
    // console.log("📄 Parsed file metadata:", metadata);
    
    // ✅ HANDLE ARRAY OF JSON STRINGS (Your current format)
    if (Array.isArray(metadata)) {
      files = [];
      metadata.forEach((item, index) => {
        try {
          // ✅ Parse each JSON string in the array
          const fileData = typeof item === 'string' ? JSON.parse(item) : item;
          // console.log(`📁 Processing file ${index + 1}:`, fileData);
          
          files.push({
            file_path: fileData.file_path || msg.file_path || '',
            file_name: fileData.original_filename || fileData.display_filename || fileData.filename || msg.file_names || `file-${index + 1}`,
            display_name: sanitizeDisplayName(
              fileData.original_filename || fileData.display_filename || fileData.filename || msg.file_names || `file-${index + 1}`
            ),
            unique_filename: fileData.unique_filename || '',
            file_size: fileData.file_size || 0,
            mime_type: fileData.mime_type || 'application/octet-stream',
            type: (fileData.original_filename || fileData.filename || '').split(".").pop() || "file",
            upload_timestamp: fileData.upload_timestamp || msg.created_at,
            is_secure: true,
            extraction_status: fileData.extraction_status || 'unknown'
          });
        } catch (innerParseError) {
          console.error(`❌ Error parsing file metadata item ${index}:`, innerParseError);
          // ✅ Fallback to legacy format for this item
          files.push({
            file_path: msg.file_path || '',
            file_name: msg.file_names || `file-${index + 1}`,
            display_name: sanitizeDisplayName(msg.file_names || `file-${index + 1}`),
            unique_filename: '',
            file_size: 0,
            mime_type: 'application/octet-stream',
            type: (msg.file_names || '').split(".").pop() || "file",
            upload_timestamp: msg.created_at,
            is_secure: false,
            legacy_format: true
          });
        }
      });
      console.log("✅ Processed files from metadata array:", files.length);
    } 
    // ✅ HANDLE DIRECT OBJECT (Alternative format)
    else if (metadata && typeof metadata === 'object') {
      files = [{
        file_path: metadata.file_path || msg.file_path || '',
        file_name: metadata.original_filename || metadata.display_filename || metadata.filename || msg.file_names || 'file-1',
        display_name: sanitizeDisplayName(
          metadata.original_filename || metadata.display_filename || metadata.filename || msg.file_names || 'file-1'
        ),
        unique_filename: metadata.unique_filename || '',
        file_size: metadata.file_size || 0,
        mime_type: metadata.mime_type || 'application/octet-stream',
        type: (metadata.original_filename || metadata.filename || '').split(".").pop() || "file",
        upload_timestamp: metadata.upload_timestamp || msg.created_at,
        is_secure: true,
        extraction_status: metadata.extraction_status || 'unknown'
      }];
      console.log("✅ Processed single file from metadata object");
    }
  } catch (parseError) {
    console.error("❌ Error parsing file metadata:", parseError);
    files = parseLegacyFileFormat(msg.file_path, msg.file_names);
  }
} else if (msg.file_path || msg.file_names) {
  // Handle legacy format
  console.log("📁 Using legacy file format");
  files = parseLegacyFileFormat(msg.file_path, msg.file_names);
}

// console.log("📊 Final files array:", files);

      // ✅ HANDLE AI GENERATED FILES
      if (msg.generated_files_info) {
        try {
          const genFilesInfo = JSON.parse(msg.generated_files_info);

          aiGeneratedFiles = genFilesInfo.map((genFileInfo) => {
            // Find matching generated file data
            const matchingGenFile = generatedFiles.find(
              (gf) =>
                gf.filename === genFileInfo.filename &&
                Math.abs(new Date(gf.created_at) - new Date(msg.created_at)) <
                  300000 // Within 5 minutes
            );

            return {
              filename: genFileInfo.filename,
              file_type: genFileInfo.file_type,
              mime_type: genFileInfo.mime_type,
              file_size: genFileInfo.file_size,
              download_url:
                genFileInfo.download_url || matchingGenFile?.download_url || "",
              ftp_path: genFileInfo.ftp_path || matchingGenFile?.ftp_path || "",
              file_data: matchingGenFile?.file_data, // Base64 data if available
              generated_at: genFileInfo.generated_at,
              is_ai_generated: true,
              download_ready: !!(
                genFileInfo.download_url || matchingGenFile?.download_url
              ),
            };
          });

          console.log(
            `📄 AI generated files attached: ${aiGeneratedFiles.length}`
          );
        } catch (parseError) {
          console.error("❌ Error parsing generated files info:", parseError);
        }
      }

      return {
        id: msg.id,
        sender: "user",
        message: msg.message,
        response: msg.response,
        suggestions: msg.suggestions ? JSON.parse(msg.suggestions) : [],
        files: files.length > 0 ? files : undefined,
        ai_generated_files:
          aiGeneratedFiles.length > 0 ? aiGeneratedFiles : undefined,
        created_at: msg.created_at,
      };
    });

    console.log(
      "✅ Retrieved",
      formattedHistory.length,
      "messages for conversation:",
      conversation_id
    );
    console.log(
      "📁 Total uploaded files:",
      formattedHistory.reduce((sum, msg) => sum + (msg.files?.length || 0), 0)
    );
    console.log(
      "🤖 Total AI generated files:",
      formattedHistory.reduce(
        (sum, msg) => sum + (msg.ai_generated_files?.length || 0),
        0
      )
    );

    return res.status(200).json({
      success: true,
      history: formattedHistory,
      conversation_id: parseInt(conversation_id),
      user_id: user_id,
      stats: {
        total_messages: formattedHistory.length,
        uploaded_files: formattedHistory.reduce(
          (sum, msg) => sum + (msg.files?.length || 0),
          0
        ),
        ai_generated_files: formattedHistory.reduce(
          (sum, msg) => sum + (msg.ai_generated_files?.length || 0),
          0
        ),
      },
    });
    
  } catch (error) {
    console.error("❌ Error fetching conversation history:", error.message);
    return res
      .status(500)
      .json({ error: "Failed to retrieve conversation history" });
  }
};
// ✅ HELPER FUNCTION FOR LEGACY FILE FORMAT

function parseLegacyFileFormat(filePaths, fileNames) {
  if (!filePaths && !fileNames) return [];

  const paths = filePaths ? filePaths.split(",") : [];
  const names = fileNames ? fileNames.split(",") : [];

  return paths.map((path, index) => ({
    file_path: path.trim(),
    file_name: names[index]?.trim() || `file-${index + 1}`,
    display_name: sanitizeDisplayName(
      names[index]?.trim() || `file-${index + 1}`
    ),
    type: path.split(".").pop() || "file",
    legacy_format: true,
    is_secure: false, // ✅ Legacy files may not be secure
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

// ✅ IMPROVED formatLikeChatGPT FUNCTION
function formatLikeChatGPT(content) {
  if (!content) return "";

  let formatted = content;

  // ✅ SKIP FORMATTING IF CONTENT CONTAINS ESCAPED HTML
  const hasEscapedHtml = /&lt;|&gt;|&amp;/.test(content);
  
  if (hasEscapedHtml) {
    // ✅ For escaped HTML content, just return as-is
    return formatted;
  }

  // ✅ APPLY FORMATTING ONLY FOR NON-HTML CONTENT
  formatted = formatted
    // ✅ ENHANCED FORMATTING FOR BETTER READABILITY
    .replace(/\*\*(.*?)\*\*/g, "**$1**") // Keep bold
    .replace(/\*(.*?)\*/g, "*$1*") // Keep italic
    .replace(/`(.*?)`/g, "`$1`") // Keep code

    // ✅ SMART KEYWORD HIGHLIGHTING
    .replace(/\b(IMPORTANT|CRITICAL|NOTE|WARNING|ALERT)\b:/gi, "⚠️ **$1:**")
    .replace(/\b(TIP|PRO TIP|ADVICE|SUGGESTION)\b:/gi, "💡 **$1:**")
    .replace(/\b(EXAMPLE|SAMPLE|TEMPLATE)\b:/gi, "📝 **$1:**")
    .replace(/\b(SUMMARY|CONCLUSION|RESULT)\b:/gi, "📊 **$1:**")

    // ✅ LIST FORMATTING
    .replace(/^(\d+)\.\s/gm, "**$1.** ")
    .replace(/^[-•*]\s/gm, "• ")

    // ✅ HEADER FORMATTING (for complete lines only)
    .replace(/^#{1}\s(.*?)$/gm, "\n## **$1**\n")
    .replace(/^#{2}\s(.*?)$/gm, "\n### **$1**\n")
    .replace(/^#{3}\s(.*?)$/gm, "\n#### **$1**\n");

  return formatted;
}



 
// ✅ ENHANCED: Helper function to escape HTML content
function escapeHtmlContent(content) {
  if (!content) return "";
  
  // ✅ Always escape HTML characters to prevent rendering as HTML
  return content
    .replace(/&/g, '&amp;')      // Must be first
    .replace(/</g, '&lt;')       // Escape opening tags
    .replace(/>/g, '&gt;')       // Escape closing tags
    .replace(/"/g, '&quot;')     // Escape quotes in attributes
    .replace(/'/g, '&#39;');     // Escape single quotes
}


 

// exports.askChatbot = async (req, res) => {
//  console.log("✅ Received request at /chat:", req.body);

//   let { userMessage, conversation_id, extracted_summary, _file_upload_ids } =
//     req.body;
//   const user_id = req.user?.user_id;

//   // ✅ STRICT USER VALIDATION
//   if (!user_id || isNaN(user_id)) {
//     console.error("❌ Invalid user_id in askChatbot:", user_id);
//     return res.status(401).json({ error: "Unauthorized: Invalid user ID" });
//   }

//   if (!userMessage || userMessage.trim().length === 0) {
//     return res.status(400).json({
//       error: "User message cannot be empty",
//     });
//   }

//   console.log(
//     `🔍 Processing chat for user_id: ${user_id}, conversation: ${conversation_id}`
//   );

//   try {
//     // Set headers for streaming
//     res.writeHead(200, {
//       "Content-Type": "text/plain; charset=utf-8",
//       "Transfer-Encoding": "chunked",
//       "Cache-Control": "no-cache",
//       Connection: "keep-alive",
//       "Access-Control-Allow-Origin": "*",
//       "Access-Control-Allow-Headers": "Cache-Control",
//     });

//     // ✅ VERIFY CONVERSATION OWNERSHIP IF PROVIDED
//     if (conversation_id && !isNaN(conversation_id)) {
//       try {
//         const ownershipCheck = await executeQuery(
//           "SELECT id FROM conversations WHERE id = ? AND user_id = ? AND is_deleted = FALSE",
//           [conversation_id, user_id]
//         );

//         if (!ownershipCheck || ownershipCheck.length === 0) {
//           console.error("❌ Unauthorized conversation access");
//           await rollbackPendingFiles(_file_upload_ids);
//           res.write(
//             JSON.stringify({
//               type: "error",
//               error: "Unauthorized: Conversation does not belong to user",
//             }) + "\n"
//           );
//           res.end();
//           return;
//         }
//         console.log("✅ Conversation ownership verified");
//       } catch (ownershipError) {
//         console.error("❌ Ownership check failed:", ownershipError);
//         res.write(
//           JSON.stringify({
//             type: "error",
//             error: "Database error during ownership verification",
//           }) + "\n"
//         );
//         res.end();
//         return;
//       }
//     }

//     // 🚀 IMMEDIATE PARALLEL PROCESSING WITH PERFORMANCE TRACKING
//     const startTime = Date.now();

//     // ✅ SMART FILE ANALYSIS (with caching)
//     const fileAnalysisStart = Date.now();
//     const fileAnalysis = getCachedFileAnalysis(userMessage);
//     logAIPerformance(fileAnalysisStart, "Smart File Analysis", {
//       confidence: fileAnalysis.confidence,
//       shouldCreate: fileAnalysis.shouldCreateFile,
//       intent: fileAnalysis.intent,
//     });

//     console.log("🔄 Starting parallel processing...");

//     // ✅ FIXED: Add proper error handling for each promise
//     let contextResult, fileContextResult, urlResult;

//     try {
//       // Task 1: URL Processing
//       console.log("🔗 Starting URL processing...");
//       const urlProcessingPromise = processUrlsOptimized(userMessage, res).catch(error => {
//         console.error("❌ URL processing failed:", error);
//         return { urlData: [], urlContent: "", processedUrls: [], fullUserMessage: userMessage };
//       });

//       // Task 2: Context Retrieval
//       console.log("📚 Starting context retrieval...");
//       const contextPromise = getConversationContextOptimized(
//         conversation_id,
//         user_id
//       ).catch(error => {
//         console.error("❌ Context retrieval failed:", error);
//         return { summaryContext: "", shouldRename: false, newConversationName: null };
//       });

//       // Task 3: File context
//       console.log("📄 Starting file context retrieval...");
//       const fileContextPromise = getFileContextBasedOnUpload(
//         conversation_id,
//         user_id,
//         extracted_summary,
//         userMessage
//       ).catch(error => {
//         console.error("❌ File context retrieval failed:", error);
//         return { fileContext: "", fileNames: [], fileCount: 0, contextType: "error" };
//       });

//       // Task 4: Generate suggestions
//       console.log("💡 Starting suggestions generation...");
//       const suggestionPromise = generateFastSuggestions(userMessage).catch(error => {
//         console.error("❌ Suggestions generation failed:", error);
//         return [];
//       });

//       // ⚡ Get context immediately with proper error handling
//       console.log("⏳ Waiting for parallel tasks to complete...");
//       [contextResult, fileContextResult, urlResult] = await Promise.all([
//         contextPromise,
//         fileContextPromise,
//         urlProcessingPromise,
//       ]);

//       console.log("✅ Parallel processing completed successfully");
//       console.log("📊 Context result:", !!contextResult);
//       console.log("📊 File context result:", !!fileContextResult);
//       console.log("📊 URL result:", !!urlResult);

//     } catch (parallelError) {
//       console.error("❌ Parallel processing failed:", parallelError);
      
//       // Provide fallback values
//       contextResult = { summaryContext: "", shouldRename: false, newConversationName: null };
//       fileContextResult = { fileContext: "", fileNames: [], fileCount: 0, contextType: "error" };
//       urlResult = { urlData: [], urlContent: "", processedUrls: [], fullUserMessage: userMessage };
//     }

//     const { summaryContext, shouldRename, newConversationName } = contextResult;
//     const {
//       fileContext = "",
//       fileNames = [],
//       fileCount = 0,
//       contextType = "none",
//     } = fileContextResult || {};

//     const { urlData, urlContent, processedUrls, fullUserMessage } = urlResult;

//     console.log("🔄 Getting suggestions...");
//     let suggestions = [];
//     try {
//       suggestions = await generateFastSuggestions(userMessage);
//       console.log("✅ Suggestions generated:", suggestions.length);
//     } catch (suggestionError) {
//       console.error("❌ Suggestions failed:", suggestionError);
//       suggestions = [];
//     }

//     console.log(`⚡ Context loaded in ${Date.now() - startTime}ms`);

//     // 🧠 GET USER INFO FOR PERSONALIZED RESPONSES
//     let userInfo = null;
//     try {
//       const userResult = await executeQuery(
//         "SELECT username FROM users WHERE id = ?",
//         [user_id]
//       );
//       if (userResult && userResult.length > 0) {
//         userInfo = { username: userResult[0].username };
//         console.log("✅ User info loaded:", userInfo.username);
//       }
//     } catch (userError) {
//       console.log(
//         "⚠️ Could not fetch user info for personalization:",
//         userError.message
//       );
//     }

//     // 🧠 BUILD ENHANCED AI MESSAGES WITH SMART FILE DETECTION
//     console.log("🧠 Building AI messages...");
//     const messagesBuildStart = Date.now();
//     const finalMessages = buildAIMessagesWithSmartContext(
//       summaryContext,
//       extracted_summary,
//       fullUserMessage,
//       userInfo,
//       fileNames,
//       fileContext,
//       contextType,
//       urlContent
//     );
//     logAIPerformance(messagesBuildStart, "AI Messages Build", {
//       messagesCount: finalMessages.length,
//       fileDetected: fileAnalysis.shouldCreateFile,
//     });

//     console.log("🤖 Starting AI model selection and response...");

//     // 🚀 SMART MODEL SELECTION & AI RESPONSE STREAM
//     let aiResponse = "";
//     let rawAiResponse = "";
//     const aiStartTime = Date.now();

//     const modelSelection = await selectOptimalModel(finalMessages);
//     const selectedModel = modelSelection.model;

//     console.log(
//       `🤖 Selected Model: ${selectedModel.toUpperCase()} | Tokens: ${
//         modelSelection.tokenCount
//       } | File Creation: ${fileAnalysis.shouldCreateFile ? "YES" : "NO"}`
//     );

//     let stream;

//     try {
//       console.log("🚀 Creating AI stream...");
      
//       if (selectedModel === "deepseek") {
//         stream = await deepseek.chat.completions.create({
//           model: "deepseek-chat",
//           messages: finalMessages,
//           temperature: fileAnalysis.shouldCreateFile ? 0.3 : 0.7,
//           max_tokens: fileAnalysis.shouldCreateFile ? 3000 : 2000,
//           stream: true,
//         });
//       } else {
//         stream = await llama.chat.completions.create({
//           messages: finalMessages,
//           temperature: fileAnalysis.shouldCreateFile ? 0.3 : 0.7,
//           max_tokens: fileAnalysis.shouldCreateFile ? 3000 : 2000,
//           stream: true,
//         });
//       }

//       console.log("✅ AI stream created successfully");

//     } catch (modelError) {
//       console.error(
//         `❌ ${selectedModel.toUpperCase()} API failed:`,
//         modelError.message
//       );

//       if (
//         _file_upload_ids &&
//         Array.isArray(_file_upload_ids) &&
//         _file_upload_ids.length > 0
//       ) {
//         try {
//           await rollbackPendingFiles(_file_upload_ids);
//           console.log(
//             `🔄 Rolled back ${_file_upload_ids.length} pending files`
//           );
//         } catch (rollbackError) {
//           console.error("❌ Failed to rollback files:", rollbackError);
//         }
//       }

//       try {
//         console.log("📤 Sending error message to frontend...");
//         res.write(
//           JSON.stringify({
//             type: "error",
//             error:
//               "I'm unable to process your request at the moment. Please try again in a few minutes.",
//             timestamp: new Date().toISOString(),
//           }) + "\n"
//         );
//         res.end();
//         console.log("✅ Error message sent to frontend");
//       } catch (responseError) {
//         console.error("❌ Failed to send error response:", responseError);
//       }

//       return;
//     }

//     console.log("✅ Model API call successful, starting stream...");
//     try {
//       // Send initial metadata immediately with file analysis
//       res.write(
//         JSON.stringify({
//           type: "start",
//           conversation_id,
//           conversation_name: shouldRename
//             ? "Generating title..."
//             : newConversationName,
//           conversation_renamed: shouldRename,
//           file_creation_mode: fileAnalysis.shouldCreateFile,
//           file_analysis: {
//             confidence: fileAnalysis.confidence,
//             intent: fileAnalysis.intent,
//             expected_file_type: fileAnalysis.fileType,
//           },
//           context: {
//             document_available: !!extracted_summary,
//             conversation_context_available: !!summaryContext,
//             uploaded_files_available: fileCount > 0,
//             uploaded_files_count: fileCount,
//             uploaded_file_names: fileNames,
//             file_context_type: contextType,
//           },
//           processing_time: Date.now() - startTime,
//         }) + "\n"
//       );

//       console.log(
//         `🚀 AI stream started with ${selectedModel.toUpperCase()} in ${
//           Date.now() - aiStartTime
//         }ms`
//       );

//       // ✅ ENHANCED STREAMING WITH PROPER CREATE_FILE HANDLING
// let isInFileCreation = false;
// let fileCreationBuffer = "";
// let completeCreateFileContent = "";

// // for await (const chunk of stream) {
// //   if (chunk.choices && chunk.choices.length > 0) {
// //     const content = chunk.choices[0].delta?.content || "";
// //     if (content) {
// //       rawAiResponse += content;
      
// //       // ✅ DETECT CREATE_FILE START
// //       if (content.includes('[CREATE_FILE:') && !isInFileCreation) {
// //         isInFileCreation = true;
// //         fileCreationBuffer = content;
// //         completeCreateFileContent = content;
        
// //         // Extract file info and send header
// //         const match = content.match(/\[CREATE_FILE:([^:]+):([^:]+):/);
// //         if (match) {
// //           const [, fileType, fileName] = match;
// //           const markdownHeader = `\n\n## 🎯 Creating ${fileType.toUpperCase()} Document: "${fileName.replace(/_/g, ' ')}"\n\n---\n\n`;
          
// //           aiResponse += markdownHeader;
// //           res.write(JSON.stringify({
// //             type: "content",
// //             content: markdownHeader,
// //           }) + "\n");
// //         }
        
// //         continue; // Don't process content yet, wait for complete content
// //       }
      
// //       // ✅ COLLECT ALL CONTENT DURING FILE CREATION
// //       if (isInFileCreation) {
// //         completeCreateFileContent += content;
// //         fileCreationBuffer += content;
        
// //         // ✅ CHECK IF FILE CREATION IS COMPLETE
// //         if (content.includes(']')) {
// //           isInFileCreation = false;
          
// //           // ✅ EXTRACT COMPLETE CONTENT AND FORMAT IT PROPERLY
// //           const completeMatch = completeCreateFileContent.match(/\[CREATE_FILE:([^:]+):([^:]+):([\s\S]*?)\]/);
// //           if (completeMatch) {
// //             const [, fileType, fileName, fileContent] = completeMatch;
            
// //             console.log(`📝 COMPLETE Content length: ${fileContent.length} chars`);
// //             console.log(`📄 Raw content with \\n: ${fileContent.substring(0, 200)}`);
            
// //             // ✅ FIXED: Convert \n to actual newlines for display (this is the key fix)
// //             const displayFormattedContent = fileContent
// //               .replace(/\\n/g, '\n')       // Convert \n to actual newlines
// //               .replace(/\\t/g, '    ')     // Convert \t to spaces
// //               .replace(/\\\"/g, '"')       // Convert \" to "
// //               .replace(/\\\'/g, "'")       // Convert \' to '
// //               .trim();
            
// //             console.log(`📄 After newline conversion: ${displayFormattedContent.substring(0, 200)}`);
            
// //             // Stream the content with actual newlines
// //             aiResponse += displayFormattedContent;
// //             res.write(JSON.stringify({
// //               type: "content",
// //               content: displayFormattedContent,
// //             }) + "\n");
            
// //             // Send completion message
// //             const completionMarkdown = "\n\n---\n\n✅ **Document Generated Successfully!**\n\n";
// //             aiResponse += completionMarkdown;
// //             res.write(JSON.stringify({
// //               type: "content",
// //               content: completionMarkdown,
// //             }) + "\n");
// //           }
          
// //           // Reset buffers
// //           fileCreationBuffer = "";
// //           completeCreateFileContent = "";
// //         }
        
// //         continue; // Don't process individual chunks during file creation
// //       }
      
// //       // ✅ NORMAL CONTENT PROCESSING (this works fine)
// //       let displayContent = formatLikeChatGPT(content);
// //       aiResponse += displayContent;
      
// //       res.write(JSON.stringify({
// //         type: "content",
// //         content: displayContent,
// //       }) + "\n");
// //     }
// //   }
// // }
// // ✅ ENHANCED STREAMING WITH PROPER HTML ESCAPING
// for await (const chunk of stream) {
//   if (chunk.choices && chunk.choices.length > 0) {
//     const content = chunk.choices[0].delta?.content || "";
//     if (content) {
//       rawAiResponse += content;
      
//       // ✅ CONVERT \n TO ACTUAL NEWLINES AND ESCAPE HTML
//       let displayContent = content
//         .replace(/\\n/g, '\n')       // Convert \n to actual newlines
//         .replace(/\\t/g, '    ')     // Convert \t to spaces
//         .replace(/\\\"/g, '"')       // Convert \" to quotes
//         .replace(/\\\'/g, "'");      // Convert \' to apostrophes
      
//       // ✅ ESCAPE HTML CONTENT TO PREVENT RENDERING
//       displayContent = escapeHtmlContent(displayContent);
      
//       // ✅ APPLY ADDITIONAL FORMATTING
//       displayContent = formatLikeChatGPT(displayContent);
      
//       aiResponse += displayContent;
      
//       res.write(JSON.stringify({
//         type: "content",
//         content: displayContent,
//       }) + "\n");
//     }
//   }
// }



//       logAIPerformance(aiStartTime, "AI Response Stream", {
//         model: selectedModel,
//         responseLength: aiResponse.length,
//         fileCreationMode: fileAnalysis.shouldCreateFile,
//       });

//       // ✅ PROCESS FILES USING RAW RESPONSE
//       let generatedFiles = [];
//       let finalAiResponse = aiResponse;

//       try {
//         console.log(
//           `🤖 Checking raw AI response for file generation requests...`
//         );

//         if (rawAiResponse.includes("[CREATE_FILE:")) {
//           const fileGenStart = Date.now();

//           res.write(
//             JSON.stringify({
//               type: "file_generation",
//               status: "processing",
//               message: "⚡ Processing your document...",
//             }) + "\n"
//           );

//           const fileGenerationResult = await handleAIFileGeneration(
//             rawAiResponse,
//             conversation_id,
//             user_id,
//             res
//           );

//           logAIPerformance(fileGenStart, "File Generation", {
//             filesCreated: fileGenerationResult.generatedFiles?.length || 0,
//           });

//           if (fileGenerationResult.hasGeneratedFiles) {
//             generatedFiles = fileGenerationResult.generatedFiles;

//             // Add professional download links
//             generatedFiles.forEach((file) => {
//               const downloadLink = `\n\n📄 **${
//                 file.originalFilename || file.filename
//               }.${
//                 file.fileType
//               }** - Professional document ready!\n🔗 [**Download ${
//                 file.originalFilename || file.filename
//               }**](${file.downloadUrl})\n*File size: ${(
//                 file.size / 1024
//               ).toFixed(1)} KB*\n`;

//               res.write(
//                 JSON.stringify({
//                   type: "content",
//                   content: downloadLink,
//                 }) + "\n"
//               );
//             });

//             console.log(
//               `✅ AI generated ${generatedFiles.length} file(s) successfully`
//             );
//           }

//           // Send completion event
//           res.write(
//             JSON.stringify({
//               type: "file_created",
//               status: "completed",
//               files_count: generatedFiles.length,
//               message:
//                 generatedFiles.length > 0
//                   ? "🎉 Documents created successfully!"
//                   : "⚠️ No files were created",
//             }) + "\n"
//           );
//         }
//         // ✅ APPLY COMPLETE FORMATTING AT THE END
//         // const finalFormattedResponse = formatLikeChatGPT(finalAiResponse, true);
//       } catch (fileError) {
//         console.error("❌ AI file generation failed:", fileError);

//         res.write(
//           JSON.stringify({
//             type: "file_error",
//             error: "File creation failed",
//             message: fileError.message,
//           }) + "\n"
//         );
//       }

//       // 🚀 HANDLE RENAME RESULT
//       let finalConversationName = newConversationName;
//       if (shouldRename) {
//         try {
//           const renameResult = await executeRename(
//             conversation_id,
//             userMessage,
//             user_id
//           );
//           if (renameResult.success) {
//             finalConversationName = renameResult.title;
//             res.write(
//               JSON.stringify({
//                 type: "conversation_renamed",
//                 conversation_id: conversation_id,
//                 new_name: finalConversationName,
//                 success: true,
//               }) + "\n"
//             );
//           }
//         } catch (renameError) {
//           console.error("❌ Rename failed:", renameError);
//         }
//       }

//       // ✅ CONFIRM FILES AFTER SUCCESSFUL AI RESPONSE
//       // ✅ CONFIRM FILES AFTER SUCCESSFUL AI RESPONSE
//       if (
//         _file_upload_ids &&
//         Array.isArray(_file_upload_ids) &&
//         _file_upload_ids.length > 0
//       ) {
//         try {
//           await confirmPendingFiles(_file_upload_ids);
//           console.log(
//             `✅ Confirmed ${_file_upload_ids.length} files after successful AI response`
//           );
//         } catch (confirmError) {
//           console.error("❌ Failed to confirm files:", confirmError);
//         }
//       }

//       // Send final data with enhanced information
//       res.write(
//         JSON.stringify({
//           type: "end",
//           suggestions: suggestions,
//           full_response: finalAiResponse,
//           processed_urls: urlData.map((data) => ({
//             url: data.url,
//             title: data.title,
//             success: !data.error,
//             error: data.error,
//             site_type: data.metadata?.siteType,
//             content_length: data.content?.length || 0,
//           })),
//           // ✅ ENHANCED: Send generated files with professional info
//           generated_files: generatedFiles.map((file) => ({
//             filename: file.originalFilename || file.filename,
//             actual_filename: file.filename,
//             type: file.fileType,
//             size: file.size,
//             size_formatted: `${(file.size / 1024).toFixed(1)} KB`,
//             download_url: file.downloadUrl,
//             ai_generated: true,
//             created_at: new Date().toISOString(),
//             professional: true,
//           })),
//           // ✅ ENHANCED CONTEXT INFO
//           context: {
//             document_available: !!extracted_summary,
//             conversation_context_available: !!summaryContext,
//             url_content_available: !!urlContent,
//             urls_processed: urlData.length,
//             uploaded_files_available: fileCount > 0,
//             uploaded_files_count: fileCount,
//             file_context_type: contextType,
//             files_generated: generatedFiles.length,
//             ai_analysis: {
//               file_creation_detected: fileAnalysis.shouldCreateFile,
//               confidence: fileAnalysis.confidence,
//               intent: fileAnalysis.intent,
//               model_used: selectedModel,
//             },
//           },
//           performance: {
//             total_processing_time: Date.now() - startTime,
//             ai_response_time: Date.now() - aiStartTime,
//             files_created: generatedFiles.length,
//             model_used: selectedModel.toUpperCase(),
//           },
//         }) + "\n"
//       );

//       res.end();

//       // 🔄 BACKGROUND PROCESSING (AFTER RESPONSE SENT)
//       process.nextTick(() => {
//         // ✅ ENSURE finalAiResponse includes download links
//         let responseWithLinks = aiResponse;

//         if (generatedFiles && generatedFiles.length > 0) {
//           generatedFiles.forEach((file) => {
//             const downloadLink = `\n\n📄 **${
//               file.originalFilename || file.filename
//             }.${
//               file.fileType
//             }** - Professional document ready!\n🔗 [**Download ${
//               file.originalFilename || file.filename
//             }**](${file.downloadUrl})\n*File size: ${(file.size / 1024).toFixed(
//               1
//             )} KB*\n`;
//             responseWithLinks += downloadLink;
//           });
//         }

//         handleAllBackgroundTasksOptimizedWithFiles(
//           conversation_id,
//           fullUserMessage,
//           responseWithLinks,
//           extracted_summary,
//           suggestions,
//           user_id,
//           shouldRename,
//           finalConversationName,
//           processedUrls,
//           urlData,
//           urlContent,
//           fileContext,
//           _file_upload_ids,
//           generatedFiles
//         );
//       });
//     } catch (streamError) {
//       console.error("❌ Streaming error:", streamError);

//       if (
//         _file_upload_ids &&
//         Array.isArray(_file_upload_ids) &&
//         _file_upload_ids.length > 0
//       ) {
//         try {
//           await rollbackPendingFiles(_file_upload_ids);
//         } catch (rollbackError) {
//           console.error("❌ Failed to rollback files:", rollbackError);
//         }
//       }

//       if (!res.headersSent) {
//         try {
//           res.write(
//             JSON.stringify({
//               type: "error",
//               error:
//                 "I'm unable to process your request at the moment. Please try again in a few minutes.",
//             }) + "\n"
//           );
//           res.end();
//         } catch (responseError) {
//           console.error(
//             "❌ Failed to send streaming error response:",
//             responseError
//           );
//         }
//       }
//     }
//   } catch (error) {
//     console.error("❌ Chat controller error:", error.message);
//      console.error("❌ Full error:", error);
//     await rollbackPendingFiles(_file_upload_ids);

//     if (!res.headersSent) {
//       res.status(500).json({ error: "Internal server error" });
//     }
//   }
// };

exports.askChatbot = async (req, res) => {
  console.log("✅ Received request at /chat:", req.body);

  let { userMessage, conversation_id, extracted_summary, _file_upload_ids } =
    req.body;
  const user_id = req.user?.user_id;

  // ✅ STRICT USER VALIDATION
  if (!user_id || isNaN(user_id)) {
    console.error("❌ Invalid user_id in askChatbot:", user_id);
    return res.status(401).json({ error: "Unauthorized: Invalid user ID" });
  }

  if (!userMessage || userMessage.trim().length === 0) {
    return res.status(400).json({
      error: "User message cannot be empty",
    });
  }

  console.log(
    `🔍 Processing chat for user_id: ${user_id}, conversation: ${conversation_id}`
  );

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

    // ✅ VERIFY CONVERSATION OWNERSHIP IF PROVIDED
    if (conversation_id && !isNaN(conversation_id)) {
      try {
        const ownershipCheck = await executeQuery(
          "SELECT id FROM conversations WHERE id = ? AND user_id = ? AND is_deleted = FALSE",
          [conversation_id, user_id]
        );

        if (!ownershipCheck || ownershipCheck.length === 0) {
          console.error("❌ Unauthorized conversation access");
          await rollbackPendingFiles(_file_upload_ids);
          res.write(
            JSON.stringify({
              type: "error",
              error: "Unauthorized: Conversation does not belong to user",
            }) + "\n"
          );
          res.end();
          return;
        }
        console.log("✅ Conversation ownership verified");
      } catch (ownershipError) {
        console.error("❌ Ownership check failed:", ownershipError);
        res.write(
          JSON.stringify({
            type: "error",
            error: "Database error during ownership verification",
          }) + "\n"
        );
        res.end();
        return;
      }
    }

    // 🚀 IMMEDIATE PARALLEL PROCESSING WITH PERFORMANCE TRACKING
    const startTime = Date.now();

    // ✅ SMART FILE ANALYSIS (with caching)
    const fileAnalysisStart = Date.now();
    const fileAnalysis = getCachedFileAnalysis(userMessage);
    logAIPerformance(fileAnalysisStart, "Smart File Analysis", {
      confidence: fileAnalysis.confidence,
      shouldCreate: fileAnalysis.shouldCreateFile,
      intent: fileAnalysis.intent,
    });

    console.log("🔄 Starting parallel processing...");

    // ✅ FIXED: Remove suggestions from parallel processing - do it after AI response
    let contextResult, fileContextResult, urlResult;

    try {
      // Task 1: URL Processing
      console.log("🔗 Starting URL processing...");
      const urlProcessingPromise = processUrlsOptimized(userMessage, res).catch(error => {
        console.error("❌ URL processing failed:", error);
        return { urlData: [], urlContent: "", processedUrls: [], fullUserMessage: userMessage };
      });

      // Task 2: Context Retrieval
      console.log("📚 Starting context retrieval...");
      const contextPromise = getConversationContextOptimized(
        conversation_id,
        user_id
      ).catch(error => {
        console.error("❌ Context retrieval failed:", error);
        return { summaryContext: "", shouldRename: false, newConversationName: null };
      });

      // Task 3: File context
      console.log("📄 Starting file context retrieval...");
      const fileContextPromise = getFileContextBasedOnUpload(
        conversation_id,
        user_id,
        extracted_summary,
        userMessage
      ).catch(error => {
        console.error("❌ File context retrieval failed:", error);
        return { fileContext: "", fileNames: [], fileCount: 0, contextType: "error" };
      });

      // ⚡ Get context immediately with proper error handling - ONLY 3 TASKS NOW
      console.log("⏳ Waiting for parallel tasks to complete...");
      [contextResult, fileContextResult, urlResult] = await Promise.all([
        contextPromise,
        fileContextPromise,
        urlProcessingPromise,
      ]);

      console.log("✅ Parallel processing completed successfully");
      console.log("📊 Context result:", !!contextResult);
      console.log("📊 File context result:", !!fileContextResult);
      console.log("📊 URL result:", !!urlResult);

    } catch (parallelError) {
      console.error("❌ Parallel processing failed:", parallelError);
      
      // Provide fallback values
      contextResult = { summaryContext: "", shouldRename: false, newConversationName: null };
      fileContextResult = { fileContext: "", fileNames: [], fileCount: 0, contextType: "error" };
      urlResult = { urlData: [], urlContent: "", processedUrls: [], fullUserMessage: userMessage };
    }

    const { summaryContext, shouldRename, newConversationName } = contextResult;
    const {
      fileContext = "",
      fileNames = [],
      fileCount = 0,
      contextType = "none",
    } = fileContextResult || {};

    const { urlData, urlContent, processedUrls, fullUserMessage } = urlResult;

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
      console.log(
        "⚠️ Could not fetch user info for personalization:",
        userError.message
      );
    }

    // 🧠 BUILD ENHANCED AI MESSAGES WITH SMART FILE DETECTION
    console.log("🧠 Building AI messages...");
    const messagesBuildStart = Date.now();
    const finalMessages = buildAIMessagesWithSmartContext(
      summaryContext,
      extracted_summary,
      fullUserMessage,
      userInfo,
      fileNames,
      fileContext,
      contextType,
      urlContent
    );
    logAIPerformance(messagesBuildStart, "AI Messages Build", {
      messagesCount: finalMessages.length,
      fileDetected: fileAnalysis.shouldCreateFile,
    });

    console.log("🤖 Starting AI model selection and response...");

    // 🚀 SMART MODEL SELECTION & AI RESPONSE STREAM
    let aiResponse = "";
    let rawAiResponse = "";
    const aiStartTime = Date.now();

    const modelSelection = await selectOptimalModel(finalMessages);
    const selectedModel = modelSelection.model;

    console.log(
      `🤖 Selected Model: ${selectedModel.toUpperCase()} | Tokens: ${
        modelSelection.tokenCount
      } | File Creation: ${fileAnalysis.shouldCreateFile ? "YES" : "NO"}`
    );

    let stream;

    try {
      console.log("🚀 Creating AI stream...");
      
      if (selectedModel === "deepseek") {
        stream = await deepseek.chat.completions.create({
          model: "deepseek-chat",
          messages: finalMessages,
          temperature: fileAnalysis.shouldCreateFile ? 0.3 : 0.7,
          max_tokens: fileAnalysis.shouldCreateFile ? 3000 : 2000,
          stream: true,
        });
      } else {
        stream = await llama.chat.completions.create({
          messages: finalMessages,
          temperature: fileAnalysis.shouldCreateFile ? 0.3 : 0.7,
          max_tokens: fileAnalysis.shouldCreateFile ? 3000 : 2000,
          stream: true,
        });
      }

      console.log("✅ AI stream created successfully");

    } catch (modelError) {
      console.error(
        `❌ ${selectedModel.toUpperCase()} API failed:`,
        modelError.message
      );

      if (
        _file_upload_ids &&
        Array.isArray(_file_upload_ids) &&
        _file_upload_ids.length > 0
      ) {
        try {
          await rollbackPendingFiles(_file_upload_ids);
          console.log(
            `🔄 Rolled back ${_file_upload_ids.length} pending files`
          );
        } catch (rollbackError) {
          console.error("❌ Failed to rollback files:", rollbackError);
        }
      }

      try {
        console.log("📤 Sending error message to frontend...");
        res.write(
          JSON.stringify({
            type: "error",
            error:
              "I'm unable to process your request at the moment. Please try again in a few minutes.",
            timestamp: new Date().toISOString(),
          }) + "\n"
        );
        res.end();
        console.log("✅ Error message sent to frontend");
      } catch (responseError) {
        console.error("❌ Failed to send error response:", responseError);
      }

      return;
    }

    console.log("✅ Model API call successful, starting stream...");
    try {
      // Send initial metadata immediately with file analysis
      res.write(
        JSON.stringify({
          type: "start",
          conversation_id,
          conversation_name: shouldRename
            ? "Generating title..."
            : newConversationName,
          conversation_renamed: shouldRename,
          file_creation_mode: fileAnalysis.shouldCreateFile,
          file_analysis: {
            confidence: fileAnalysis.confidence,
            intent: fileAnalysis.intent,
            expected_file_type: fileAnalysis.fileType,
          },
          context: {
            document_available: !!extracted_summary,
            conversation_context_available: !!summaryContext,
            uploaded_files_available: fileCount > 0,
            uploaded_files_count: fileCount,
            uploaded_file_names: fileNames,
            file_context_type: contextType,
          },
          processing_time: Date.now() - startTime,
        }) + "\n"
      );

      console.log(
        `🚀 AI stream started with ${selectedModel.toUpperCase()} in ${
          Date.now() - aiStartTime
        }ms`
      );

      // ✅ ENHANCED STREAMING WITH PROPER HTML ESCAPING
//       for await (const chunk of stream) {
//   if (chunk.choices && chunk.choices.length > 0) {
//     const content = chunk.choices[0].delta?.content || "";
//     if (content) {
//       rawAiResponse += content;
      
//       // ✅ SIMPLE FIX: Process content in correct order
//       let displayContent = content;
      
//       // Step 1: Convert escape sequences to actual characters
//       displayContent = displayContent
//         .replace(/\\n/g, '\n')       // Convert \n to actual newlines
//         .replace(/\\t/g, '\t')       // Convert \t to actual tabs
//         .replace(/\\\"/g, '"')       // Convert \" to quotes
//         .replace(/\\\'/g, "'");      // Convert \' to apostrophes
      
//       // Step 2: Escape HTML BEFORE applying formatting
//       displayContent = escapeHtmlContent(displayContent);
      
//       // Step 3: Apply ChatGPT-like formatting AFTER HTML escaping
//       displayContent = formatLikeChatGPT(displayContent);
      
//       aiResponse += displayContent;
      
//       res.write(JSON.stringify({
//         type: "content",
//         content: displayContent,
//       }) + "\n");
//     }
//   }
// }
// ✅ ENHANCED STREAMING WITH PROPER HTML ESCAPING
// let isInCreateFile = false;
// let createFileBuffer = "";
// if (isInCreateFile) {
//   displayContent = displayContent
//     .replace(/&/g, '&amp;')
//     .replace(/</g, '&lt;')
//     .replace(/>/g, '&gt;')
//     .replace(/"/g, '&quot;')
//     .replace(/'/g, '&#39;');
// }

// ✅ ENHANCED STREAMING WITH PROPER HTML ESCAPING
let isInCreateFile = false;
let createFileBuffer = "";

for await (const chunk of stream) {
  if (chunk.choices && chunk.choices.length > 0) {
    const content = chunk.choices[0].delta?.content || "";
    if (content) {
      rawAiResponse += content;
      
      // ✅ DETECT CREATE_FILE START/END
      if (content.includes('[CREATE_FILE:')) {
        isInCreateFile = true;
        createFileBuffer = content;
      } else if (isInCreateFile) {
        createFileBuffer += content;
        if (content.includes(']')) {
          isInCreateFile = false;
          createFileBuffer = "";
        }
      }
      
      // ✅ SIMPLE FIX: Process content in correct order
      let displayContent = content;
      
      // Step 1: Convert escape sequences to actual characters
      displayContent = displayContent
        .replace(/\\n/g, '\n')       // Convert \n to actual newlines
        .replace(/\\t/g, '\t')       // Convert \t to actual tabs
        .replace(/\\\"/g, '"')       // Convert \" to quotes
        .replace(/\\\'/g, "'");      // Convert \' to apostrophes
      
      // Step 2: Handle HTML content ONLY inside CREATE_FILE
      if (isInCreateFile) {
        // Check if this is HTML content
        if (displayContent.includes('<!DOCTYPE html>') || 
            displayContent.includes('<html') || 
            displayContent.includes('<head>') || 
            displayContent.includes('<body>') ||
            displayContent.includes('<div') ||
            displayContent.includes('<p>') ||
            displayContent.includes('<h1>') ||
            displayContent.includes('<style>')) {
          
          // Escape HTML for display
          displayContent = displayContent
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
        }
      }
      
      // Step 3: Apply ChatGPT-like formatting (will skip if HTML is escaped)
      displayContent = formatLikeChatGPT(displayContent);
      
      aiResponse += displayContent;
      
      res.write(JSON.stringify({
        type: "content",
        content: displayContent,
      }) + "\n");
    }
  }
}


      logAIPerformance(aiStartTime, "AI Response Stream", {
        model: selectedModel,
        responseLength: aiResponse.length,
        fileCreationMode: fileAnalysis.shouldCreateFile,
      });

      // ✅ PROCESS FILES USING RAW RESPONSE
      let generatedFiles = [];
      let finalAiResponse = aiResponse;

      try {
        console.log(
          `🤖 Checking raw AI response for file generation requests...`
        );

        if (rawAiResponse.includes("[CREATE_FILE:")) {
          const fileGenStart = Date.now();

          res.write(
            JSON.stringify({
              type: "file_generation",
              status: "processing",
              message: "⚡ Processing your document...",
            }) + "\n"
          );

          const fileGenerationResult = await handleAIFileGeneration(
            rawAiResponse,
            conversation_id,
            user_id,
            res
          );

          logAIPerformance(fileGenStart, "File Generation", {
            filesCreated: fileGenerationResult.generatedFiles?.length || 0,
          });

          if (fileGenerationResult.hasGeneratedFiles) {
            generatedFiles = fileGenerationResult.generatedFiles;

            // Add professional download links
            generatedFiles.forEach((file) => {
              const downloadLink = `\n\n📄 **${
                file.originalFilename || file.filename
              }.${
                file.fileType
              }** - Professional document ready!\n🔗 [**Download ${
                file.originalFilename || file.filename
              }**](${file.downloadUrl})\n*File size: ${(
                file.size / 1024
              ).toFixed(1)} KB*\n`;

              res.write(
                JSON.stringify({
                  type: "content",
                  content: downloadLink,
                }) + "\n"
              );
            });

            console.log(
              `✅ AI generated ${generatedFiles.length} file(s) successfully`
            );
          }

          // Send completion event
          res.write(
            JSON.stringify({
              type: "file_created",
              status: "completed",
              files_count: generatedFiles.length,
              message:
                generatedFiles.length > 0
                  ? "🎉 Documents created successfully!"
                  : "⚠️ No files were created",
            }) + "\n"
          );
        }
      } catch (fileError) {
        console.error("❌ AI file generation failed:", fileError);

        res.write(
          JSON.stringify({
            type: "file_error",
            error: "File creation failed",
            message: fileError.message,
          }) + "\n"
        );
      }

           // 🚀 HANDLE RENAME RESULT
      let finalConversationName = newConversationName;
      if (shouldRename) {
        try {
          const renameResult = await executeRename(
            conversation_id,
            userMessage,
            user_id
          );
          if (renameResult.success) {
            finalConversationName = renameResult.title;
            res.write(
              JSON.stringify({
                type: "conversation_renamed",
                conversation_id: conversation_id,
                new_name: finalConversationName,
                success: true,
              }) + "\n"
            );
          }
        } catch (renameError) {
          console.error("❌ Rename failed:", renameError);
        }
      }

      // ✅ CONFIRM FILES AFTER SUCCESSFUL AI RESPONSE
      if (
        _file_upload_ids &&
        Array.isArray(_file_upload_ids) &&
        _file_upload_ids.length > 0
      ) {
        try {
          await confirmPendingFiles(_file_upload_ids);
          console.log(
            `✅ Confirmed ${_file_upload_ids.length} files after successful AI response`
          );
        } catch (confirmError) {
          console.error("❌ Failed to confirm files:", confirmError);
        }
      }

      // ✅ GENERATE SUGGESTIONS AFTER AI RESPONSE (MOVED HERE)
      console.log("💡 Generating suggestions based on conversation...");
      let suggestions = [];
      try {
        const suggestionStart = Date.now();
        suggestions = await generateFastSuggestions(userMessage, aiResponse);
        logAIPerformance(suggestionStart, "Suggestions Generation", {
          count: suggestions.length,
        });
        console.log("✅ Suggestions generated:", suggestions.length);
      } catch (suggestionError) {
        console.error("❌ Suggestions failed:", suggestionError);
        suggestions = [
          "Can you explain this further?",
          "What are some examples?",
          "How can I apply this?",
        ];
      }

      // Send final data with enhanced information
      res.write(
        JSON.stringify({
          type: "end",
          suggestions: suggestions,
          full_response: finalAiResponse,
          processed_urls: urlData.map((data) => ({
            url: data.url,
            title: data.title,
            success: !data.error,
            error: data.error,
            site_type: data.metadata?.siteType,
            content_length: data.content?.length || 0,
          })),
          // ✅ ENHANCED: Send generated files with professional info
          generated_files: generatedFiles.map((file) => ({
            filename: file.originalFilename || file.filename,
            actual_filename: file.filename,
            type: file.fileType,
            size: file.size,
            size_formatted: `${(file.size / 1024).toFixed(1)} KB`,
            download_url: file.downloadUrl,
            ai_generated: true,
            created_at: new Date().toISOString(),
            professional: true,
          })),
          // ✅ ENHANCED CONTEXT INFO
          context: {
            document_available: !!extracted_summary,
            conversation_context_available: !!summaryContext,
            url_content_available: !!urlContent,
            urls_processed: urlData.length,
            uploaded_files_available: fileCount > 0,
            uploaded_files_count: fileCount,
            file_context_type: contextType,
            files_generated: generatedFiles.length,
            ai_analysis: {
              file_creation_detected: fileAnalysis.shouldCreateFile,
              confidence: fileAnalysis.confidence,
              intent: fileAnalysis.intent,
              model_used: selectedModel,
            },
          },
          performance: {
            total_processing_time: Date.now() - startTime,
            ai_response_time: Date.now() - aiStartTime,
            files_created: generatedFiles.length,
            model_used: selectedModel.toUpperCase(),
          },
        }) + "\n"
      );

      res.end();

      // 🔄 BACKGROUND PROCESSING (AFTER RESPONSE SENT)
      process.nextTick(() => {
        // ✅ ENSURE finalAiResponse includes download links
        let responseWithLinks = aiResponse;

        if (generatedFiles && generatedFiles.length > 0) {
          generatedFiles.forEach((file) => {
            const downloadLink = `\n\n📄 **${
              file.originalFilename || file.filename
            }.${
              file.fileType
            }** - Professional document ready!\n🔗 [**Download ${
              file.originalFilename || file.filename
            }**](${file.downloadUrl})\n*File size: ${(file.size / 1024).toFixed(
              1
            )} KB*\n`;
            responseWithLinks += downloadLink;
          });
        }

        handleAllBackgroundTasksOptimizedWithFiles(
          conversation_id,
          fullUserMessage,
          responseWithLinks,
          extracted_summary,
          suggestions,
          user_id,
          shouldRename,
          finalConversationName,
          processedUrls,
          urlData,
          urlContent,
          fileContext,
          _file_upload_ids,
          generatedFiles
        );
      });
    } catch (streamError) {
      console.error("❌ Streaming error:", streamError);

      if (
        _file_upload_ids &&
        Array.isArray(_file_upload_ids) &&
        _file_upload_ids.length > 0
      ) {
        try {
          await rollbackPendingFiles(_file_upload_ids);
        } catch (rollbackError) {
          console.error("❌ Failed to rollback files:", rollbackError);
        }
      }

      if (!res.headersSent) {
        try {
          res.write(
            JSON.stringify({
              type: "error",
              error:
                "I'm unable to process your request at the moment. Please try again in a few minutes.",
            }) + "\n"
          );
          res.end();
        } catch (responseError) {
          console.error(
            "❌ Failed to send streaming error response:",
            responseError
          );
        }
      }
    }
  } catch (error) {
    console.error("❌ Chat controller error:", error.message);
    console.error("❌ Full error:", error);
    await rollbackPendingFiles(_file_upload_ids);

    if (!res.headersSent) {
      res.status(500).json({ error: "Internal server error" });
    }
  }
};


// exports.askChatbot = async (req, res) => {
//   console.log("✅ Received request at /chat:", req.body);

//   let { userMessage, conversation_id, extracted_summary, _file_upload_ids } =
//     req.body;
//   const user_id = req.user?.user_id;

//   // ✅ STRICT USER VALIDATION
//   if (!user_id || isNaN(user_id)) {
//     console.error("❌ Invalid user_id in askChatbot:", user_id);
//     return res.status(401).json({ error: "Unauthorized: Invalid user ID" });
//   }

//   if (!userMessage || userMessage.trim().length === 0) {
//     return res.status(400).json({
//       error: "User message cannot be empty",
//     });
//   }

//   console.log(
//     "🔍 Processing chat for user_id:",
//     user_id,
//     "conversation:",
//     conversation_id
//   );

//   try {
//     // Set headers for streaming
//     res.writeHead(200, {
//       "Content-Type": "text/plain; charset=utf-8",
//       "Transfer-Encoding": "chunked",
//       "Cache-Control": "no-cache",
//       Connection: "keep-alive",
//       "Access-Control-Allow-Origin": "*",
//       "Access-Control-Allow-Headers": "Cache-Control",
//     });

//     // ✅ VERIFY CONVERSATION OWNERSHIP IF PROVIDED
//     if (conversation_id && !isNaN(conversation_id)) {
//       const ownershipCheck = await executeQuery(
//         "SELECT id FROM conversations WHERE id = ? AND user_id = ? AND is_deleted = FALSE",
//         [conversation_id, user_id]
//       );

//       if (!ownershipCheck || ownershipCheck.length === 0) {
//         console.error("❌ Unauthorized conversation access");
//         await rollbackPendingFiles(_file_upload_ids);
//         res.write(
//           JSON.stringify({
//             type: "error",
//             error: "Unauthorized: Conversation does not belong to user",
//           }) + "\n"
//         );
//         res.end();
//         return;
//       }
//     }

//     // 🚀 IMMEDIATE PARALLEL PROCESSING
//     const startTime = Date.now();

//     // Task 1: URL Processing
//     const urlProcessingPromise = processUrlsOptimized(userMessage, res);

//     // Task 2: Context Retrieval
//     const contextPromise = getConversationContextOptimized(
//       conversation_id,
//       user_id
//     );

//     // Task 3: File context
//     const fileContextPromise = getFileContextBasedOnUpload(
//       conversation_id,
//       user_id,
//       extracted_summary,
//       userMessage
//     );

//     // Task 4: Generate suggestions
//     const suggestionPromise = generateFastSuggestions(userMessage);

//     // ⚡ Get context immediately
//     const [contextResult, fileContextResult, urlResult] = await Promise.all([
//       contextPromise,
//       fileContextPromise,
//       urlProcessingPromise,
//     ]);

//     const { summaryContext, shouldRename, newConversationName } = contextResult;
//     const {
//       fileContext = "",
//       fileNames = [],
//       fileCount = 0,
//       contextType = "none",
//     } = fileContextResult || {};

//     const { urlData, urlContent, processedUrls, fullUserMessage } = urlResult;

//     // Wait for suggestions
//     const suggestions = await suggestionPromise;

//     console.log(`⚡ Context loaded in ${Date.now() - startTime}ms`);

//     // 🧠 GET USER INFO FOR PERSONALIZED RESPONSES
//     let userInfo = null;
//     try {
//       const userResult = await executeQuery(
//         "SELECT username FROM users WHERE id = ?",
//         [user_id]
//       );
//       if (userResult && userResult.length > 0) {
//         userInfo = { username: userResult[0].username };
//         console.log("✅ User info loaded:", userInfo.username);
//       }
//     } catch (userError) {
//       console.log(
//         "⚠️ Could not fetch user info for personalization:",
//         userError.message
//       );
//     }

//     // 🧠 BUILD AI MESSAGES
//     const finalMessages = buildAIMessagesWithSmartContext(
//       summaryContext,
//       extracted_summary,
//       fullUserMessage,
//       userInfo,
//       fileNames,
//       fileContext,
//       contextType,
//       urlContent
//     );

//     // 🚀 SMART MODEL SELECTION & AI RESPONSE STREAM
//     let aiResponse = "";
//      let rawAiResponse = ""; // Keep original for file processing
//     const aiStartTime = Date.now();

//     const modelSelection = await selectOptimalModel(finalMessages);
//     const selectedModel = modelSelection.model;

//     console.log(
//       `🤖 Selected Model: ${selectedModel.toUpperCase()} | Tokens: ${
//         modelSelection.tokenCount
//       }`
//     );

//     let stream;

//     try {
//       if (selectedModel === "deepseek") {
//         stream = await deepseek.chat.completions.create({
//           model: "deepseek-chat",
//           messages: finalMessages,
//           temperature: 0.5,
//           max_tokens: 2000,
//           stream: true,
//         });
//       } else {
//         stream = await llama.chat.completions.create({
//           messages: finalMessages,
//           temperature: 0.7,
//           max_tokens: 2000,
//           stream: true,
//         });
//       }
//     } catch (modelError) {
//       console.error(
//         `❌ ${selectedModel.toUpperCase()} API failed:`,
//         modelError.message
//       );

//       if (
//         _file_upload_ids &&
//         Array.isArray(_file_upload_ids) &&
//         _file_upload_ids.length > 0
//       ) {
//         try {
//           await rollbackPendingFiles(_file_upload_ids);
//           console.log(
//             `🔄 Rolled back ${_file_upload_ids.length} pending files`
//           );
//         } catch (rollbackError) {
//           console.error("❌ Failed to rollback files:", rollbackError);
//         }
//       }

//       try {
//         console.log("📤 Sending error message to frontend...");
//         res.write(
//           JSON.stringify({
//             type: "error",
//             error:
//               "I'm unable to process your request at the moment. Please try again in a few minutes.",
//             timestamp: new Date().toISOString(),
//           }) + "\n"
//         );
//         res.end();
//         console.log("✅ Error message sent to frontend");
//       } catch (responseError) {
//         console.error("❌ Failed to send error response:", responseError);
//       }

//       return;
//     }

//     console.log("✅ Model API call successful, starting stream...");

//     try {
//       // Send initial metadata immediately
//       res.write(
//         JSON.stringify({
//           type: "start",
//           conversation_id,
//           conversation_name: shouldRename
//             ? "Generating title..."
//             : newConversationName,
//           conversation_renamed: shouldRename,
//           context: {
//             document_available: !!extracted_summary,
//             conversation_context_available: !!summaryContext,
//             uploaded_files_available: fileCount > 0,
//             uploaded_files_count: fileCount,
//             uploaded_file_names: fileNames,
//             file_context_type: contextType,

//           },
//           processing_time: Date.now() - startTime,
//         }) + "\n"
//       );

//       console.log(
//         `🚀 AI stream started with ${selectedModel.toUpperCase()} in ${
//           Date.now() - aiStartTime
//         }ms`
//       );

//       // Stream the response chunks
//      // Stream the response chunks
// for await (const chunk of stream) {
//   if (chunk.choices && chunk.choices.length > 0) {
//     const content = chunk.choices[0].delta?.content || "";
//     if (content) {
//       rawAiResponse += content; // Store complete response for file processing

//       // ✅ INTELLIGENT FORMATTING - Apply different formatting based on context
//       let displayContent = content;

//       // ✅ DETECT if we're inside a CREATE_FILE tag for special handling
//       const isInFileCreation = rawAiResponse.includes('[CREATE_FILE:') &&
//                               !rawAiResponse.includes(']', rawAiResponse.lastIndexOf('[CREATE_FILE:'));

//       if (isInFileCreation) {
//         // ✅ SPECIAL FORMATTING for file content within CREATE_FILE tags
//         displayContent = content
//           .replace(/\\n/g, '\n')
//           .replace(/\*\*([^*]+)\*\*/g, '**$1**')  // Keep bold formatting
//           .replace(/^([A-Z][A-Z\s]+)$/gm, '## **$1**')  // ALL CAPS to headers
//           .replace(/^([A-Z][^:]+):$/gm, '### **$1:**')   // Title case with colon
//           .replace(/^(To|From|Date|Subject|Dear|Respected|Sincerely):/gm, '**$1:**'); // Business format
//       } else {
//         // ✅ REGULAR CONTENT FORMATTING
//         displayContent = formatLikeChatGPT(content);
//       }

//       // ✅ SPECIAL HANDLING for CREATE_FILE start tags
//       if (content.includes('[CREATE_FILE:')) {
//         const fileMatch = content.match(/\[CREATE_FILE:([^:]+):([^:]+):/);
//         if (fileMatch) {
//           const fileType = fileMatch[1].toUpperCase();
//           const fileName = fileMatch[2].replace(/_/g, ' ');

//           displayContent = content.replace(/\[CREATE_FILE:([^:]+):([^:]+):/g,
//             `\n\n🎯 **Creating Professional ${fileType} Document**\n📝 *Document: "${fileName}"*\n\n✨ *Generating with AI precision...*\n\n---\n\n`);
//         }
//       }

//       aiResponse += displayContent;

//       res.write(
//         JSON.stringify({
//           type: "content",
//           content: displayContent,
//         }) + "\n"
//       );
//     }
//   }
// }

//     // ✅ PROCESS FILES USING RAW RESPONSE
//     // ✅ PROCESS FILES USING RAW RESPONSE
// // ✅ PROCESS FILES USING RAW RESPONSE
// let generatedFiles = [];
// let finalAiResponse = aiResponse;

//       try {
//         console.log(`🤖 Checking raw AI response for file generation requests...`);

//         // ✅ SEND FILE CREATION STARTED NOTIFICATION
//         if (rawAiResponse.includes('[CREATE_FILE:')) {
//           res.write(
//             JSON.stringify({
//               type: "file_generation",
//               status: "creating",
//               message: "Creating your file..."
//             }) + "\n"
//           );

//           console.log("📤 Sent file_generation event to frontend");

//           // Process files
//           const fileGenerationResult = await handleAIFileGeneration(
//             rawAiResponse,
//             conversation_id,
//             user_id,
//             res
//           );

//           console.log("🔍 File generation result:", {
//             hasGeneratedFiles: fileGenerationResult.hasGeneratedFiles,
//             filesCount: fileGenerationResult.generatedFiles?.length || 0
//           });

//           if (fileGenerationResult.hasGeneratedFiles) {
//             generatedFiles = fileGenerationResult.generatedFiles;

//             // Add download links
//             generatedFiles.forEach(file => {
//               const downloadLink = `\n\n📄 **${file.originalFilename || file.filename}.${file.fileType}** has been created!\n🔗 [Download ${file.originalFilename || file.filename}](${file.downloadUrl})`;

//               res.write(
//                 JSON.stringify({
//                   type: "content",
//                   content: downloadLink,
//                 }) + "\n"
//               );
//             });

//             console.log(`✅ AI generated ${generatedFiles.length} file(s) successfully`);
//           }

//           // ✅ ALWAYS SEND COMPLETION EVENT
//           res.write(
//             JSON.stringify({
//               type: "file_created",
//               status: "completed",
//               files_count: generatedFiles.length
//             }) + "\n"
//           );

//           console.log("📤 Sent file_created event to frontend");
//         }

//       } catch (fileError) {
//         console.error("❌ AI file generation failed:", fileError);

//         res.write(
//           JSON.stringify({
//             type: "file_error",
//             error: "File creation failed",
//             message: fileError.message
//           }) + "\n"
//         );

//         console.log("📤 Sent file_error event to frontend");
//       }

//       // 🚀 HANDLE RENAME RESULT
//       let finalConversationName = newConversationName;
//       if (shouldRename) {
//         try {
//           const renameResult = await executeRename(
//             conversation_id,
//             userMessage,
//             user_id
//           );
//           if (renameResult.success) {
//             finalConversationName = renameResult.title;
//             res.write(
//               JSON.stringify({
//                 type: "conversation_renamed",
//                 conversation_id: conversation_id,
//                 new_name: finalConversationName,
//                 success: true,
//               }) + "\n"
//             );
//           }
//         } catch (renameError) {
//           console.error("❌ Rename failed:", renameError);
//         }
//       }

//       // ✅ CONFIRM FILES AFTER SUCCESSFUL AI RESPONSE
//       if (
//         _file_upload_ids &&
//         Array.isArray(_file_upload_ids) &&
//         _file_upload_ids.length > 0
//       ) {
//         try {
//           await confirmPendingFiles(_file_upload_ids);
//           console.log(
//             `✅ Confirmed ${_file_upload_ids.length} files after successful AI response`
//           );
//         } catch (confirmError) {
//           console.error("❌ Failed to confirm files:", confirmError);
//         }
//       }

//       // Send final data
//    res.write(
//   JSON.stringify({
//     type: "end",
//     suggestions: suggestions,
//     full_response: finalAiResponse,
//     processed_urls: urlData.map((data) => ({
//       url: data.url,
//       title: data.title,
//       success: !data.error,
//       error: data.error,
//       site_type: data.metadata?.siteType,
//       content_length: data.content?.length || 0,
//     })),
//     // ✅ FIXED: Send generated files with ACTUAL URLs
//     generated_files: generatedFiles.map(file => ({
//       filename: file.originalFilename || file.filename, // Display name
//       actual_filename: file.filename, // Actual FTP filename
//       type: file.fileType,
//       size: file.size,
//       download_url: file.downloadUrl, // Actual download URL
//       ai_generated: true,
//     })),
//     context: {
//       document_available: !!extracted_summary,
//       conversation_context_available: !!summaryContext,
//       url_content_available: !!urlContent,
//       urls_processed: urlData.length,
//       uploaded_files_available: fileCount > 0,
//       uploaded_files_count: fileCount,
//       file_context_type: contextType,
//       files_generated: generatedFiles.length,
//     },
//     total_processing_time: Date.now() - startTime,
//   }) + "\n"
// );

//   res.end();

//       // 🔄 BACKGROUND PROCESSING (AFTER RESPONSE SENT)
//      // 🔄 BACKGROUND PROCESSING (AFTER RESPONSE SENT)
// process.nextTick(() => {
//   // ✅ ENSURE finalAiResponse includes download links
//   let responseWithLinks = aiResponse;

//   if (generatedFiles && generatedFiles.length > 0) {
//     generatedFiles.forEach(file => {
//       const downloadLink = `\n\n📄 **${file.originalFilename || file.filename}.${file.fileType}** has been created!\n🔗 [Download ${file.originalFilename || file.filename}](${file.downloadUrl})`;
//       responseWithLinks += downloadLink;
//     });
//   }

//   handleAllBackgroundTasksOptimizedWithFiles(
//     conversation_id,
//     fullUserMessage,
//     responseWithLinks, // ✅ Pass response WITH download links
//     extracted_summary,
//     suggestions,
//     user_id,
//     shouldRename,
//     finalConversationName,
//     processedUrls,
//     urlData,
//     urlContent,
//     fileContext,
//     _file_upload_ids,
//     generatedFiles
//   );
// });

//     } catch (streamError) {
//       console.error("❌ Streaming error:", streamError);

//       if (
//         _file_upload_ids &&
//         Array.isArray(_file_upload_ids) &&
//         _file_upload_ids.length > 0
//       ) {
//         try {
//           await rollbackPendingFiles(_file_upload_ids);
//         } catch (rollbackError) {
//           console.error("❌ Failed to rollback files:", rollbackError);
//         }
//       }

//       if (!res.headersSent) {
//         try {
//           res.write(
//             JSON.stringify({
//               type: "error",
//               error:
//                 "I'm unable to process your request at the moment. Please try again in a few minutes.",
//             }) + "\n"
//           );
//           res.end();
//         } catch (responseError) {
//           console.error(
//             "❌ Failed to send streaming error response:",
//             responseError
//           );
//         }
//       }
//     }
//   } catch (error) {
//     console.error("❌ Chat controller error:", error.message);
//     await rollbackPendingFiles(_file_upload_ids);

//     if (!res.headersSent) {
//       res.status(500).json({ error: "Internal server error" });
//     }
//   }
// };

// ✅ HELPER: Check if we're inside a CREATE_FILE tag

// ✅ REPLACE the main askChatbot function with this optimized version

 
// 🚀 IMPROVED URL PROCESSING - Process all URLs together
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

  console.log(
    `🔗 Found ${extractedUrls.length} URLs - processing all together with universal extractor`
  );

  // Send URL processing status immediately
  res.write(
    JSON.stringify({
      type: "url_processing",
      status: "started",
      urls: extractedUrls,
      count: extractedUrls.length,
    }) + "\n"
  );

  try {
    // ✅ PROCESS ALL URLs TOGETHER (not individually)
    urlData = await processUrls(extractedUrls); // This processes all URLs in one call

    if (urlData && urlData.length > 0) {
      // ✅ Get all URLs that were attempted (including failed ones)
      processedUrls = extractedUrls;

      // ✅ Create URL content summary with MORE content and better formatting
      urlContent = urlData
        .filter((data) => data && data.content && !data.error)
        .map((data, index) => {
          const siteType = data.metadata?.siteType
            ? ` [${data.metadata.siteType.toUpperCase()}]`
            : "";
          const contentPreview =
            data.content.length > 4000
              ? data.content.substring(0, 4000) + "... [content truncated]"
              : data.content;

          return `=== URL ${index + 1}${siteType} ===
URL: ${data.url}
Title: ${data.title}
Description: ${data.description || "No description available"}

Content:
${contentPreview}

${"=".repeat(80)}`;
        })
        .join("\n\n");

      // ✅ Add URL references to user message
      if (processedUrls.length > 0) {
        const successfulCount = urlData.filter((d) => !d.error).length;
        fullUserMessage += `\n\n[Referenced ${successfulCount}/${processedUrls.length} URLs successfully processed]`;
      }

      // Send completion status with details
      const successfulUrls = urlData.filter((d) => d && !d.error);
      const failedUrls = urlData.filter((d) => d && d.error);

      res.write(
        JSON.stringify({
          type: "url_processing",
          status: "completed",
          total_urls: urlData.length,
          successful: successfulUrls.length,
          failed: failedUrls.length,
          content_extracted: urlContent.length > 0,
          failed_urls: failedUrls.map((d) => ({ url: d.url, error: d.error })),
          successful_urls: successfulUrls.map((d) => ({
            url: d.url,
            title: d.title,
            site_type: d.metadata?.siteType,
            content_length: d.content?.length || 0,
          })),
        }) + "\n"
      );

      console.log(
        `✅ Batch URL processing completed: ${successfulUrls.length}/${urlData.length} successful`
      );
      console.log(
        `📄 Total URL content: ${urlContent.length.toLocaleString()} characters`
      );
    }
  } catch (error) {
    console.error("❌ Batch URL processing error:", error);
    res.write(
      JSON.stringify({
        type: "url_processing",
        status: "error",
        error: "Failed to process URLs in batch",
        details: error.message,
      }) + "\n"
    );
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
      `DELETE FROM uploaded_files WHERE id IN (${fileIds
        .map(() => "?")
        .join(",")}) AND status = 'pending_response'`,
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
      `UPDATE uploaded_files SET status = 'confirmed' WHERE id IN (${fileIds
        .map(() => "?")
        .join(",")}) AND status = 'pending_response'`,
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
      if (
        conversationName === "New Conversation" ||
        conversationName === "New Chat" ||
        !conversationName
      ) {
        shouldRename = true;
      }

      // ⚡ Priority: Use latest summarized_chat first
      const latestSummary = results.find(
        (r) => r.summarized_chat
      )?.summarized_chat;

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
            if (item.user_message)
              context += `User: ${item.user_message.substring(0, 150)}\n`;
            if (item.response)
              context += `AI: ${item.response.substring(0, 150)}\n`;
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

// ✅ ALWAYS FULL CONTEXT: No truncation, no token limits for files
// ✅ ALWAYS FULL CONTEXT: No truncation, no token limits for files
// async function getFileContextBasedOnUpload(conversation_id, user_id, extracted_summary, userMessage) {
//   if (!conversation_id || isNaN(conversation_id)) {
//     return { fileContext: "", fileNames: [], fileCount: 0, contextType: "none" };
//   }

//   try {
//     const hasNewUpload = (extracted_summary && extracted_summary.trim().length > 0 && extracted_summary !== "Success");
//     const isAskingAboutFiles = checkIfAskingAboutFiles(userMessage);

//     console.log(`📄 New upload: ${hasNewUpload}, Asking about files: ${isAskingAboutFiles}`);

//     // Get ALL files - no status filtering
//     const allFiles = await executeQuery(
//       `SELECT file_path, extracted_text, file_metadata, created_at, status
//        FROM uploaded_files
//        WHERE conversation_id = ? AND user_id = ?
//        ORDER BY created_at DESC`,
//       [conversation_id, user_id]
//     );

//     console.log(`🔍 Found ${allFiles.length} total files in conversation`);

//     const fileNames = [];
//     const validFiles = [];

//     // Process ALL files and get their COMPLETE content
//     if (allFiles && allFiles.length > 0) {
//       allFiles.forEach((file, index) => {
//         let fileName = "Unknown File";
//         if (file.file_metadata) {
//           try {
//             const metadata = JSON.parse(file.file_metadata);
//             fileName = metadata.original_filename || metadata.display_filename || fileName;
//           } catch (e) {
//             fileName = file.file_path?.split('/').pop() || fileName;
//           }
//         }
//         fileNames.push(fileName);

//         // ✅ INCLUDE ALL FILES WITH ANY VALID CONTENT
//         if (file.extracted_text &&
//             file.extracted_text !== "No readable content extracted" &&
//             file.extracted_text !== "Text extraction failed" &&
//             file.extracted_text !== "[Error extracting text]" &&
//             file.extracted_text !== "Success" && // ✅ EXCLUDE "Success" placeholder
//             file.extracted_text.trim().length > 10) {

//           validFiles.push({
//             ...file,
//             fileName,
//             isNew: file.status === 'pending_response',
//             contentLength: file.extracted_text.length
//           });

//           console.log(`✅ Including file: ${fileName} (${file.extracted_text.length} chars)`);
//         } else {
//           console.log(`❌ Skipping file with no content: ${fileName} - extracted_text: "${file.extracted_text?.substring(0, 50)}..."`);
//         }
//       });
//     }

//     // ✅ ALWAYS PROVIDE FULL CONTEXT - No conditions, no limits
//     let fullContext = "";

//     // ✅ REMOVE THIS SECTION - Don't use extracted_summary for new uploads
//     // Instead, get the actual extracted text from the most recent file
//     if (hasNewUpload) {
//       console.log(`⚠️ New upload detected but extracted_summary is: "${extracted_summary}"`);
//       // Find the most recent file and use its extracted text
//       const mostRecentFile = validFiles.find(file => file.isNew);
//       if (mostRecentFile && mostRecentFile.extracted_text) {
//         fullContext += `📎 NEWLY UPLOADED FILE:\n${mostRecentFile.extracted_text}\n`;
//         console.log(`📄 Using actual extracted text from new file: ${mostRecentFile.extracted_text.length} characters`);
//       }
//     }

//     // ✅ ADD ALL EXISTING FILES - COMPLETE CONTENT, NO TRUNCATION
//     if (validFiles.length > 0) {
//       const fileContexts = validFiles.map(file => {
//         const statusInfo = file.isNew ? ' [JUST UPLOADED]' : '';
//         console.log(`📄 Adding FULL content for: ${file.fileName} (${file.contentLength} chars)`);
//         return `📎 FILE: ${file.fileName}${statusInfo}\n${file.extracted_text}`;
//       });

//       if (fileContexts.length > 0) {
//         const separator = fullContext ? `\n${'='.repeat(60)}\n\nALL FILES IN CONVERSATION:\n\n` : `ALL FILES IN CONVERSATION:\n\n`;
//         fullContext += separator + fileContexts.join('\n\n' + '='.repeat(50) + '\n\n');
//       }
//     }

//     const totalChars = fullContext.length;
//     const estimatedTokens = Math.ceil(totalChars / 4);

//     console.log(`📄 COMPLETE FILE CONTEXT PROVIDED:`);
//     console.log(`   - Files: ${validFiles.length}`);
//     console.log(`   - Total Characters: ${totalChars.toLocaleString()}`);
//     console.log(`   - Estimated Tokens: ${estimatedTokens.toLocaleString()}`);
//     console.log(`   - No Truncation: ✅ All content included`);

//     return {
//       fileContext: fullContext,
//       fileNames: fileNames,
//       fileCount: validFiles.length,
//       contextType: "always_full_context",
//       totalTokens: estimatedTokens,
//       totalChars: totalChars,
//       noTruncation: true
//     };

//   } catch (error) {
//     console.error("❌ Error getting full file context:", error);
//     return { fileContext: "", fileNames: [], fileCount: 0, contextType: "error" };
//   }
// }
// ✅ SIMPLE: Always get full file context from database
// async function getFileContextBasedOnUpload(conversation_id, user_id, extracted_summary, userMessage) {
//   if (!conversation_id || isNaN(conversation_id)) {
//     return { fileContext: "", fileNames: [], fileCount: 0, contextType: "none" };
//   }

//   try {
//     console.log(`📄 Getting file context for conversation: ${conversation_id}`);

//     // Get ALL files from database - simple query
//     const allFiles = await executeQuery(
//       `SELECT file_path, extracted_text, file_metadata, created_at, status
//        FROM uploaded_files
//        WHERE conversation_id = ? AND user_id = ?
//        ORDER BY created_at DESC`,
//       [conversation_id, user_id]
//     );

//     console.log(`🔍 Found ${allFiles.length} total files in conversation`);

//     const fileNames = [];
//     let fullContext = "";
//     let validFileCount = 0;

//     // Process ALL files - simple loop
//     if (allFiles && allFiles.length > 0) {
//       allFiles.forEach((file, index) => {
//         // Get file name
//         let fileName = "Unknown File";
//         if (file.file_metadata) {
//           try {
//             const metadata = JSON.parse(file.file_metadata);
//             fileName = metadata.original_filename || metadata.display_filename || fileName;
//           } catch (e) {
//             fileName = file.file_path?.split('/').pop() || fileName;
//           }
//         }
//         fileNames.push(fileName);

//         // ✅ SIMPLE: Include file if it has valid extracted text
//       // Replace the complex filtering with this simple check:
// if (file.extracted_text &&
//     file.extracted_text.trim().length > 50 && // Increase minimum length
//     !file.extracted_text.includes("extraction failed") &&
//     !file.extracted_text.includes("No readable content")) {

//     validFileCount++;
//     const statusInfo = file.status === 'pending_response' ? ' [JUST UPLOADED]' : '';

//     // ✅ Add the full extracted text
//     fullContext += `📎 FILE: ${fileName}${statusInfo}\n${file.extracted_text}\n\n${'='.repeat(50)}\n\n`;

//     console.log(`✅ Added file: ${fileName} (${file.extracted_text.length} chars)`);
//     console.log(`📄 First 200 chars: ${file.extracted_text.substring(0, 200)}`);
// } else {
//     console.log(`❌ Skipped file: ${fileName} - extracted_text: "${file.extracted_text?.substring(0, 100)}..."`);
// }
//       });
//     }

//     console.log(`📄 SIMPLE FILE CONTEXT:`);
//     console.log(`   - Total Files: ${allFiles.length}`);
//     console.log(`   - Valid Files: ${validFileCount}`);
//     console.log(`   - Total Characters: ${fullContext.length.toLocaleString()}`);
//     console.log(`   - No Truncation: ✅ Full content provided`);

//     return {
//       fileContext: fullContext.trim(),
//       fileNames: fileNames,
//       fileCount: validFileCount,
//       contextType: "simple_full_context"
//     };

//   } catch (error) {
//     console.error("❌ Error getting file context:", error);
//     return { fileContext: "", fileNames: [], fileCount: 0, contextType: "error" };
//   }
// }

// ✅ SIMPLE: Always get full file context from database with NEW FILE PRIORITY
async function getFileContextBasedOnUpload(
  conversation_id,
  user_id,
  extracted_summary,
  userMessage
) {
  if (!conversation_id || isNaN(conversation_id)) {
    return {
      fileContext: "",
      fileNames: [],
      fileCount: 0,
      contextType: "none",
    };
  }

  try {
    console.log(`📄 Getting file context for conversation: ${conversation_id}`);

    // Get ALL files from database - simple query
    const allFiles = await executeQuery(
      `SELECT file_path, extracted_text, file_metadata, created_at, status
       FROM uploaded_files 
       WHERE conversation_id = ? AND user_id = ? 
       ORDER BY created_at DESC`,
      [conversation_id, user_id]
    );

    console.log(`🔍 Found ${allFiles.length} total files in conversation`);

    const fileNames = [];
    let fullContext = "";
    let validFileCount = 0;

    // ✅ CHECK IF THERE'S A NEW UPLOAD
    const hasNewUpload =
      extracted_summary &&
      extracted_summary.trim().length > 50 &&
      extracted_summary !== "Success" &&
      !extracted_summary.includes("extraction failed");

    // ✅ PRIORITY 1: Add new upload first if exists
    if (hasNewUpload) {
      fullContext += `🆕 NEWLY UPLOADED FILE (PRIORITY):\n${extracted_summary}\n\n${"=".repeat(
        60
      )}\n\n`;
      console.log(
        `✅ Added NEW UPLOAD as priority: ${extracted_summary.length} chars`
      );
    }

    // ✅ PRIORITY 2: Add existing files (excluding the new one if it exists)
    if (allFiles && allFiles.length > 0) {
      allFiles.forEach((file, index) => {
        // Get file name
        let fileName = "Unknown File";
        if (file.file_metadata) {
          try {
            const metadata = JSON.parse(file.file_metadata);
            fileName =
              metadata.original_filename ||
              metadata.display_filename ||
              fileName;
          } catch (e) {
            fileName = file.file_path?.split("/").pop() || fileName;
          }
        }
        fileNames.push(fileName);

        // ✅ Include file if it has valid extracted text
        if (
          file.extracted_text &&
          file.extracted_text.trim().length > 50 &&
          !file.extracted_text.includes("extraction failed") &&
          !file.extracted_text.includes("No readable content")
        ) {
          // ✅ SKIP if this is the same as new upload (avoid duplication)
          if (hasNewUpload && file.extracted_text === extracted_summary) {
            console.log(
              `⏭️ Skipped duplicate: ${fileName} (already added as new upload)`
            );
            return;
          }

          validFileCount++;
          const statusInfo =
            file.status === "pending_response" ? " [RECENT]" : " [PREVIOUS]";

          // ✅ Add as previous file context
          fullContext += `📎 FILE: ${fileName}${statusInfo}\n${
            file.extracted_text
          }\n\n${"=".repeat(50)}\n\n`;

          console.log(
            `✅ Added previous file: ${fileName} (${file.extracted_text.length} chars)`
          );
        } else {
          console.log(`❌ Skipped file: ${fileName} - invalid extracted text`);
        }
      });
    }

    // ✅ Add header for previous files if new upload exists
    if (hasNewUpload && validFileCount > 0) {
      fullContext = fullContext.replace(
        "📎 FILE:",
        "\n📚 PREVIOUS FILES FOR REFERENCE:\n\n📎 FILE:"
      );
    }

    console.log(`📄 PRIORITIZED FILE CONTEXT:`);
    console.log(`   - New Upload: ${hasNewUpload ? "YES (PRIORITY)" : "No"}`);
    console.log(`   - Previous Files: ${validFileCount}`);
    console.log(
      `   - Total Characters: ${fullContext.length.toLocaleString()}`
    );

    return {
      fileContext: fullContext.trim(),
      fileNames: fileNames,
      fileCount: validFileCount + (hasNewUpload ? 1 : 0),
      contextType: hasNewUpload ? "new_upload_priority" : "existing_files_only",
    };
  } catch (error) {
    console.error("❌ Error getting file context:", error);
    return {
      fileContext: "",
      fileNames: [],
      fileCount: 0,
      contextType: "error",
    };
  }
}

// ✅ ALWAYS DETECT FILE QUESTIONS - More comprehensive
function checkIfAskingAboutFiles(userMessage) {
  // ✅ ALWAYS return true if there are files - AI should always have context
  return true; // Simple: always provide file context if files exist

  // Alternative: Keep detection but make it more inclusive
  /*
  if (!userMessage) return true; // Default to providing context
  
  const message = userMessage.toLowerCase();
  const fileKeywords = [
    'file', 'document', 'pdf', 'uploaded', 'attachment', 'doc', 'content',
    'analyze', 'summarize', 'review', 'read', 'explain', 'extract', 'detail',
    'what', 'tell', 'show', 'list', 'name', 'mention', 'describe',
    'compare', 'difference', 'similar', 'both', 'all', 'each', 'every'
  ];

  return fileKeywords.some(keyword => message.includes(keyword));
  */
}

// ✅ UPDATED: Include URL content in AI context
function buildAIMessagesWithSmartContext(
  summaryContext,
  extracted_summary,
  userMessage,
  userInfo = null,
  fileNames = [],
  fileContext = "",
  contextType = "none",
  urlContent = ""
) {
  const currentDate = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  // ✅ INTELLIGENT FILE CREATION ANALYSIS
  const fileAnalysis = getCachedFileAnalysis(userMessage);

  console.log(`🧠 AI File Analysis:`, {
    shouldCreate: fileAnalysis.shouldCreateFile,
    confidence: fileAnalysis.confidence,
    fileType: fileAnalysis.fileType,
    intent: fileAnalysis.intent,
    verbs: fileAnalysis.analysis.verbs,
    nouns: fileAnalysis.analysis.nouns,
  });

  // Build user context for personalized responses
  let userContext = "";
  if (userInfo && userInfo.username) {
    userContext = `The user's name is ${userInfo.username}. When greeting or addressing the user, you can use their name for a more personalized experience.`;
  }

  // ✅ CLEARER FILE GENERATION INSTRUCTIONS
  const enhancedFileGenerationInstructions = `
🎯 INTELLIGENT FILE CREATION SYSTEM:

DETECTION RULES:
- Analyze user intent beyond keywords
- Look for creation verbs: create, make, generate, write, draft, prepare, build
- Identify document nouns: file, document, letter, application, resume, report, invoice, contract
- Consider context and user's specific needs

WHEN TO CREATE FILES:
✅ HIGH CONFIDENCE (Always create):
- "Create a PDF of..."
- "Generate a Word document for..."
- "Make me a resume"
- "Draft a letter to..."
- "Prepare an invoice"

✅ MEDIUM CONFIDENCE (Create with explanation):
- "I need a leave application"
- "Help me write a report"
- "Can you make a contract"

❌ DON'T CREATE (Information requests):
- "How to create a PDF"
- "What is a resume"
- "Explain document types"
- "Tell me about..."

FILE CREATION FORMAT:
[CREATE_FILE:type:filename:content]

SUPPORTED TYPES: pdf, docx, xlsx, txt

CONTENT FORMATTING RULES:
- Write content with natural line breaks - DO NOT use \\n
- For HTML/CSS content, ALWAYS wrap in code blocks: \`\`\`html ... \`\`\`
- Use **text** for bold headings
- Include complete, professional content with proper structure
- No file extensions in filename
- Ensure content is substantial (minimum 100 characters)
- Format content naturally like you would in a normal response

SPECIAL HANDLING FOR CODE/HTML:
- When creating HTML files, save as .txt but include complete HTML structure
- Preserve proper indentation and formatting for code
- Don't escape HTML tags in file content - keep them as valid HTML

EXAMPLE FOR HTML:
User: "Create an HTML file for Hello World"
Response: "I'll create an HTML file with CSS styling for a Hello World page.

[CREATE_FILE:txt:hello_world_html:\`\`\`html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Hello World</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            text-align: center;
            margin-top: 50px;
        }
    </style>
</head>
<body>
    <h1>Hello World!</h1>
    <p>Welcome to my webpage</p>
</body>
</html>
\`\`\`]

Your HTML file has been created with proper structure and styling."
RESPONSE STYLE:
1. First acknowledge: "I'll create [document type] for you."
2. Then create the file with [CREATE_FILE:...]
3. Provide brief context about the document

EXAMPLE:
User: "Create a leave application for John Doe"
Response: "I'll create a professional leave application for John Doe.

[CREATE_FILE:docx:Leave_Application_John_Doe:**LEAVE APPLICATION**

**To:** [Principal/Manager Name]
**From:** John Doe
**Date:** [Current Date]
**Subject:** Application for Leave

Respected Sir/Madam,

I am writing to formally request leave from [Start Date] to [End Date] due to [Reason for leave].

I have ensured that all my current projects and responsibilities will be properly managed during my absence. I will coordinate with my team members to ensure smooth workflow continuation.

I would be grateful if you could approve my leave request. I will be available via email for any urgent matters that may require my attention.

Thank you for your understanding and consideration.

**Sincerely,**
**John Doe**
**[Position]**
**[Contact Information]**
**[Employee ID]**]

Your professional leave application document has been created and is ready for download."

CRITICAL: Write content naturally with proper line breaks. Never use \\n sequences.
CRITICAL: Write content naturally with proper formatting. For HTML content, preserve all tags and structure.
`;
  let systemPrompt;

  if (fileAnalysis.shouldCreateFile) {
    systemPrompt = {
      role: "system",
      content: `You are QhashAI — an intelligent AI assistant by QuantumHash team (2024).

Current date: ${currentDate}.
${userContext}

🎯 FILE CREATION MODE ACTIVATED (Confidence: ${fileAnalysis.confidence}%)

ANALYSIS RESULTS:
- Intent: ${fileAnalysis.intent}
- Recommended file type: ${fileAnalysis.fileType}
- User wants: ${fileAnalysis.analysis.verbs.join(
        ", "
      )} ${fileAnalysis.analysis.nouns.join(", ")}

${enhancedFileGenerationInstructions}

RESPONSE STRATEGY:
1. Acknowledge the file creation request professionally
2. Create the file using [CREATE_FILE:type:filename:content] format
3. Ensure content is complete, professional, and properly formatted
4. Use business-appropriate language and structure
5. Include all necessary sections and details

Remember: The user specifically wants a file created. Don't just provide information - CREATE THE ACTUAL FILE.`,
    };
  } else {
    systemPrompt = {
      role: "system",
      content: `You are QhashAI — an intelligent AI assistant by QuantumHash team (2024).

Current date: ${currentDate}.
${userContext}

💬 CONVERSATION MODE (File creation not detected)

You can analyze content from URLs and documents. When referencing external content, cite sources clearly.

Be helpful, accurate, professional, and engaging. Use appropriate emojis and formatting for better readability.

If the user later asks for file creation, you can create documents using the [CREATE_FILE:type:filename:content] format.`,
    };
  }

  const finalMessages = [systemPrompt];

  // Add conversation context if available
  if (summaryContext) {
    finalMessages.push({
      role: "system",
      content: `CONVERSATION CONTEXT: ${summaryContext}`,
    });
  }

  // ✅ ADD URL CONTENT FIRST (for product comparisons)
  if (urlContent && urlContent.length > 0) {
    finalMessages.push({
      role: "system",
      content: `WEBSITE CONTENT FOR ANALYSIS:\n${urlContent}`,
    });
    console.log(
      `🔗 Added URL content: ${urlContent.length.toLocaleString()} characters`
    );
  }

  // ✅ ADD COMPLETE FILE CONTEXT - NO LIMITS
  if (fileContext && fileContext.length > 0) {
    finalMessages.push({
      role: "system",
      content: `COMPLETE FILE CONTENT:\n${fileContext}`,
    });
    console.log(
      `📄 Added COMPLETE file context: ${fileContext.length.toLocaleString()} characters`
    );
    // console.log(`📄 First 300 chars of context: ${fileContext.substring(0, 300)}`);
  }
  // Add this debug line in buildAIMessagesWithSmartContext
  console.log(
    "🔍 DEBUG - fileContext parameter:",
    fileContext?.substring(0, 200)
  );
  console.log("🔍 DEBUG - fileContext length:", fileContext?.length);

  // Add current document context if available (new upload)
  // if (extracted_summary && extracted_summary !== "Success" && extracted_summary !== "No readable content") {
  //   finalMessages.push({
  //     role: "system",
  //     content: `ADDITIONAL NEW DOCUMENT:\n${extracted_summary}`,
  //   });
  // }

  // Add user message
  finalMessages.push({ role: "user", content: userMessage || "" });

  // ✅ LOG TOTAL CONTEXT SIZE
  const totalContextLength = finalMessages.reduce(
    (total, msg) => total + msg.content.length,
    0
  );
  const estimatedTokens = Math.ceil(totalContextLength / 4);

  console.log(`🧠 AI Context Summary:`);
  console.log(`   - Total Messages: ${finalMessages.length}`);
  console.log(`   - Total Characters: ${totalContextLength.toLocaleString()}`);
  console.log(`   - Estimated Tokens: ${estimatedTokens.toLocaleString()}`);
  console.log(`   - URL Content: ${urlContent ? "INCLUDED" : "None"}`);
  console.log(`   - File Context: ${fileContext ? "FULL CONTENT" : "None"}`);

  return finalMessages;
}
const fileAnalysisCache = new Map();
const CACHE_TTL = 300000; // 5 minutes

function getCachedFileAnalysis(userMessage) {
  const key = userMessage.toLowerCase().trim();
  const cached = fileAnalysisCache.get(key);

  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.analysis;
  }

  const analysis = intelligentFileDetectionAnalysis(userMessage);
  fileAnalysisCache.set(key, {
    analysis,
    timestamp: Date.now(),
  });

  // Clean cache periodically
  if (fileAnalysisCache.size > 100) {
    const oldEntries = Array.from(fileAnalysisCache.entries()).filter(
      ([_, value]) => Date.now() - value.timestamp > CACHE_TTL
    );
    oldEntries.forEach(([key]) => fileAnalysisCache.delete(key));
  }

  return analysis;
}

function logAIPerformance(startTime, operation, details = {}) {
  const duration = Date.now() - startTime;
  const emoji = duration < 1000 ? "⚡" : duration < 3000 ? "🚀" : "⏱️";

  console.log(`${emoji} ${operation}: ${duration}ms`, details);

  // Log slow operations for optimization
  if (duration > 5000) {
    console.warn(`🐌 SLOW OPERATION: ${operation} took ${duration}ms`, details);
  }
}

// ✅ SIMPLE: AI File Generation Handler
const handleAIFileGeneration = async (
  aiResponse,
  conversation_id,
  user_id,
  res
) => {
  console.log(`🔍 Smart file generation check...`);

  const generatedFiles = [];
  let cleanedResponse = aiResponse;
  const FileGenerator = require("../utils/fileGenerator");

  console.log(`🔍 Searching for CREATE_FILE in ${aiResponse.length} chars`);
  console.log(`🔍 Raw response contains CREATE_FILE: ${aiResponse.includes('[CREATE_FILE:')}`);

  // ✅ FIXED: Manual parsing to handle content with brackets properly
  const createFileMatches = [];
  let searchText = aiResponse;
  
  while (searchText.includes('[CREATE_FILE:')) {
    const startIndex = searchText.indexOf('[CREATE_FILE:');
    if (startIndex === -1) break;
    
    // Find the matching closing bracket by counting brackets
    let endIndex = -1;
    let bracketCount = 0;
    let inContent = false;
    let colonCount = 0;
    
    for (let i = startIndex; i < searchText.length; i++) {
      const char = searchText[i];
      
      if (char === '[') {
        bracketCount++;
      } else if (char === ']') {
        bracketCount--;
        // Only close if we're at bracket count 0 and we've seen at least 2 colons (type:filename:content)
        if (bracketCount === 0 && colonCount >= 2) {
          endIndex = i;
          break;
        }
      } else if (char === ':' && bracketCount === 1 && !inContent) {
        colonCount++;
        if (colonCount === 2) {
          inContent = true; // Now we're in the content section
        }
      }
    }
    
    if (endIndex === -1) {
      // If no proper closing bracket found, take everything till the end
      endIndex = searchText.length - 1;
    }
    
    const fullTag = searchText.substring(startIndex, endIndex + 1);
    createFileMatches.push(fullTag);
    
    console.log(`🔍 Extracted full tag (${fullTag.length} chars): ${fullTag.substring(0, 200)}...`);
    
    // Remove this match and continue searching
    searchText = searchText.substring(endIndex + 1);
    
    if (createFileMatches.length >= 5) break; // Safety limit
  }

  console.log(`🔍 Found ${createFileMatches.length} CREATE_FILE tags`);

  let fileCount = 0;
  for (const fullTag of createFileMatches) {
    if (fileCount >= 5) break;
    fileCount++;
    
    console.log(`📝 Processing file ${fileCount}:`);
    console.log(`   - Full tag length: ${fullTag.length} chars`);
    console.log(`   - Tag preview: ${fullTag.substring(0, 100)}...`);
    
    let fileType = '';
    let filename = '';
    let content = '';
    
    try {
      // ✅ FIXED: Proper parsing - remove only the brackets, not the CREATE_FILE: part
      const tagContent = fullTag.slice(1, -1); // Remove [ and ]
      console.log(`   - Tag content after bracket removal: ${tagContent.substring(0, 100)}...`);
      
      // Now remove CREATE_FILE: prefix
      if (!tagContent.startsWith('CREATE_FILE:')) {
        throw new Error('Invalid CREATE_FILE format: missing CREATE_FILE prefix');
      }
      
      const contentAfterPrefix = tagContent.substring(12); // Remove 'CREATE_FILE:'
      console.log(`   - Content after prefix removal: ${contentAfterPrefix.substring(0, 100)}...`);
      
      // Find first colon for file type
      const firstColonIndex = contentAfterPrefix.indexOf(':');
      if (firstColonIndex === -1) {
        throw new Error('Invalid CREATE_FILE format: missing type separator');
      }
      
      fileType = contentAfterPrefix.substring(0, firstColonIndex).trim();
      
      // Find second colon for filename
      const remainingAfterType = contentAfterPrefix.substring(firstColonIndex + 1);
      const secondColonIndex = remainingAfterType.indexOf(':');
      if (secondColonIndex === -1) {
        throw new Error('Invalid CREATE_FILE format: missing filename separator');
      }
      
      filename = remainingAfterType.substring(0, secondColonIndex).trim();
      content = remainingAfterType.substring(secondColonIndex + 1); // Don't trim here to preserve formatting
      
      console.log(`   - Type: "${fileType}"`);
      console.log(`   - Filename: "${filename}"`);
      console.log(`   - Raw content length: ${content.length} chars`);
      console.log(`   - Raw content preview: "${content.substring(0, 150)}..."`);

      // ✅ FAST VALIDATION
      if (!fileType || !filename || content.length < 20) {
        throw new Error(
          `Invalid file data: type=${fileType}, name=${filename}, content=${content.length}chars`
        );
      }

      // ✅ OPTIMIZED CONTENT PROCESSING
      const cleanFilename = filename
        .replace(/\.(pdf|docx|xlsx|txt)$/i, "")
        .replace(/[^a-zA-Z0-9_\-\s]/g, "");

      // ✅ FIXED: Proper content decoding with better newline handling
      const decodedContent = content
        .replace(/\\n\\n/g, "\n\n")  // Double newlines first
        .replace(/\\n/g, "\n")       // Then single newlines
        .replace(/\\t/g, "\t")
        .replace(/\\\"/g, '"')
        .replace(/\\\'/g, "'")
        .replace(/\\r/g, "\r")
        .trim(); // Only trim at the end

      console.log(`   - Decoded content length: ${decodedContent.length} chars`);
      console.log(`   - Decoded preview: "${decodedContent.substring(0, 200)}..."`);

      if (decodedContent.length < 30) {
        throw new Error(
          `Content too short after decoding: ${decodedContent.length} characters`
        );
      }

      // ✅ IMMEDIATE FILE GENERATION (no delays)
      console.log(`⚡ Generating ${fileType} file: ${cleanFilename}`);

      const fileResult = await FileGenerator.generateFromAI(
        fileType,
        decodedContent,
        cleanFilename,
        conversation_id,
        user_id
      );

      if (fileResult.success) {
        generatedFiles.push(fileResult);

        // ✅ PARALLEL DATABASE SAVE (don't wait)
        saveGeneratedFileToDatabase(
          fileResult,
          conversation_id,
          user_id,
          decodedContent
        ).catch((err) => console.error("❌ DB save failed:", err));

        // ✅ PROFESSIONAL REPLACEMENT
        const displayName = fileResult.originalFilename || cleanFilename;
        const downloadLink = `\n\n📄 **${displayName}.${fileType}** - Professional document created!\n🔗 [**Download ${displayName}**](${fileResult.downloadUrl})\n`;
        cleanedResponse = cleanedResponse.replace(fullTag, downloadLink);

        console.log(
          `✅ File created: ${fileResult.filename}`
        );

        // ✅ IMMEDIATE FRONTEND NOTIFICATION
        res.write(
          JSON.stringify({
            type: "file_ready",
            filename: displayName,
            download_url: fileResult.downloadUrl,
            file_type: fileType,
          }) + "\n"
        );
      } else {
        throw new Error(fileResult.error || "File generation failed");
      }
    } catch (error) {
      console.error(`❌ File ${fileCount} creation failed:`, error.message);

      const cleanFilename = filename?.replace(/\.(pdf|docx|xlsx|txt)$/i, "") || `file_${fileCount}`;
      cleanedResponse = cleanedResponse.replace(
        fullTag,
        `\n❌ **Could not create ${cleanFilename}.${fileType || 'docx'}**\n*Error: ${error.message}*\n`
      );

      // ✅ IMMEDIATE ERROR NOTIFICATION
      res.write(
        JSON.stringify({
          type: "file_error",
          filename: cleanFilename,
          error: error.message,
          file_type: fileType || 'docx',
        }) + "\n"
      );
    }
  }

  console.log(
    `🎯 File generation completed: ${generatedFiles.length}/${fileCount} successful`
  );

  return {
    hasGeneratedFiles: generatedFiles.length > 0,
    cleanedResponse,
    generatedFiles,
  };
};






// ✅ FIXED: Database save function
const saveGeneratedFileToDatabase = async (
  fileData,
  conversation_id,
  user_id,
  originalTextContent = null
) => {
  try {
    const metadata = {
      original_filename: fileData.originalFilename || fileData.filename,
      actual_filename: fileData.filename,
      file_size: fileData.size,
      mime_type: fileData.mimeType,
      ai_generated: true,
      created_at: new Date().toISOString(),
      ftp_path: fileData.ftpPath,
      download_url: fileData.downloadUrl,
    };

    await executeQuery(
      `INSERT INTO generated_files 
       (conversation_id, user_id, filename, file_data, file_metadata, mime_type, file_size, ftp_path, download_url) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        conversation_id,
        user_id,
        fileData.filename,
        originalTextContent || "", // ✅ Store original text with UTF-8 support
        JSON.stringify(metadata),
        fileData.mimeType,
        fileData.size,
        fileData.ftpPath,
        fileData.downloadUrl,
      ]
    );

    console.log(`✅ File saved to database: ${fileData.filename}`);
  } catch (error) {
    console.error(`❌ Database save failed:`, error);
    throw error;
  }
};

async function generateFastSuggestions(userMessage, aiResponse = null) {
  try {
    // Build context from both user message and AI response
    let context = userMessage || "Continue the conversation";

    if (aiResponse && aiResponse.trim().length > 20) {
      // Add AI response context (first 500 chars for efficiency)
      const responsePreview =
        aiResponse.length > 500
          ? aiResponse.substring(0, 500) + "..."
          : aiResponse;
      context = `User asked: "${userMessage}"\nAI responded: "${responsePreview}"`;
    }

    const suggestionResult = await deepseek.chat.completions.create({
      model: "deepseek-chat",
      messages: [
        {
          role: "system",
          content:
            "Based on the conversation, generate 5 short follow-up questions that the user would naturally ask next. Make them specific to the topics discussed. Reply only with numbered list.",
        },
        { role: "user", content: context },
      ],
      temperature: 0.8,
      max_tokens: 120, // Increased slightly for better quality
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
      .slice(0, 5);
  } catch (error) {
    console.error("❌ Fast suggestion failed:", error);
    return [
      "Can you explain this further?",
      "What are some examples?",
      "How can I apply this?",
    ];
  }
}

// ✅ ENHANCED BACKGROUND TASKS WITH FILE SAVING (Continued)
async function handleAllBackgroundTasksOptimizedWithFiles(
  conversation_id,
  userMessage,
  aiResponse,
  extracted_summary,
  suggestions,
  user_id,
  shouldRename,
  newConversationName,
  processedUrls = [],
  urlData = [],
  urlContent = "",
  fileContext = "",
  _file_upload_ids = [],
  generatedFiles = null // ✅ New parameter
) {
  try {
    console.log(
      "🔄 Starting enhanced background tasks with file generation support"
    );

    if (!user_id || isNaN(user_id)) {
      console.error("❌ Invalid user_id in background tasks:", user_id);
      return;
    }

    // 🚀 STEP 1: Create conversation if needed
    if (!conversation_id || isNaN(conversation_id)) {
      try {
        const conversationResult = await executeQuery(
          "INSERT INTO conversations (user_id, name) VALUES (?, ?)",
          [
            user_id,
            newConversationName || userMessage?.substring(0, 20) || "New Chat",
          ]
        );

        conversation_id = conversationResult.insertId;
        console.log(
          "✅ Created new conversation:",
          conversation_id,
          "for user:",
          user_id
        );
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
        console.log(
          `📁 Found ${uploadedFiles.length} recent files for chat history`
        );
      } catch (fileError) {
        console.error("❌ Error fetching recent files:", fileError);
      }
    }

    // 🚀 STEP 2: Parallel background operations with timeout
    const backgroundTasks = [
      // Save to database with generated file info
      Promise.race([
        saveToDatabase(
          conversation_id,
          userMessage,
          aiResponse,
          uploadedFiles,
          extracted_summary,
          suggestions,
          processedUrls,
          urlData,
          fileContext,
          _file_upload_ids,
          generatedFiles,
          user_id // ✅ Pass generated file data
        ),
        new Promise((resolve) =>
          setTimeout(() => resolve({ timeout: true }), 5000)
        ),
      ]),

      // Rename conversation ONLY if needed
      shouldRename
        ? Promise.race([
            executeRename(conversation_id, userMessage, user_id),
            new Promise((resolve) =>
              setTimeout(() => resolve({ timeout: true }), 3000)
            ),
          ])
        : Promise.resolve(false),

      // Generate comprehensive summary with file context
      Promise.race([
        generateAndSaveComprehensiveSummary(
          conversation_id,
          userMessage,
          aiResponse,
          urlContent,
          fileContext
        ),
        new Promise((resolve) =>
          setTimeout(() => resolve({ timeout: true }), 8000)
        ),
      ]),
    ];

    const [dbResult, renameResult, summaryResult, fileResult] =
      await Promise.allSettled(backgroundTasks);

    console.log("✅ Enhanced background tasks completed:", {
      database:
        dbResult.status === "fulfilled" && !dbResult.value?.timeout
          ? "✅ Saved"
          : "❌ Failed/Timeout",
      rename: shouldRename
        ? renameResult.status === "fulfilled" && !renameResult.value?.timeout
          ? "✅ Done"
          : "❌ Failed/Timeout"
        : "⏭️ Skipped",
      summary:
        summaryResult.status === "fulfilled" && !summaryResult.value?.timeout
          ? "✅ Generated"
          : "❌ Failed/Timeout",
      generated_files: generatedFiles // ✅ FIXED variable name
        ? generatedFiles.length > 0
          ? "✅ Saved"
          : "⏭️ No files generated"
        : "⏭️ No files generated",
      conversation_id: conversation_id,
      user_id: user_id,
      urls_processed: Array.isArray(urlData) ? urlData.length : 0,
    });
  } catch (error) {
    console.error("❌ Enhanced background tasks failed:", error);
  }
}

// ✅ NEW: Save all generated files to database
const saveAllGeneratedFilesToDatabase = async (
  conversation_id,
  generatedFiles,
  user_id
) => {
  if (!generatedFiles || generatedFiles.length === 0) return null;

  try {
    const savedFiles = [];

    for (const fileData of generatedFiles) {
      const fileMetadata = {
        original_filename: fileData.filename,
        display_filename: fileData.filename,
        unique_filename: fileData.filename,
        file_size: fileData.size,
        mime_type: fileData.mimeType,
        file_type: "ai_generated",
        generated_at: new Date().toISOString(),
        is_ai_generated: true,
        ftp_path: fileData.ftpPath,
        download_url: fileData.downloadUrl,
      };

      const result = await executeQuery(
        `INSERT INTO generated_files 
         (conversation_id, user_id, filename, file_data, file_metadata, mime_type, file_size, ftp_path, download_url, created_at) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
        [
          conversation_id,
          user_id,
          fileData.filename,
          fileData.buffer ? fileData.buffer.toString("base64") : null, // Optional: store buffer
          JSON.stringify(fileMetadata),
          fileData.mimeType,
          fileData.size,
          fileData.ftpPath,
          fileData.downloadUrl,
        ]
      );

      savedFiles.push({
        id: result.insertId,
        filename: fileData.filename,
        download_url: fileData.downloadUrl,
      });

      console.log(
        `✅ AI-generated file saved to database: ${fileData.filename}`
      );
    }

    return savedFiles;
  } catch (error) {
    console.error("❌ Failed to save generated files to database:", error);
    return null;
  }
};
// ✅ ENHANCED SAVE TO DATABASE WITH GENERATED FILE INFO
async function saveToDatabase(
  conversation_id,
  userMessage,
  aiResponse,
  uploadedFiles,
  extracted_summary,
  suggestions,
  processedUrls = [],
  urlData = [],
  fileContext = "",
  _file_upload_ids = [],
  generatedFiles = null,
  user_id = null // ✅ New parameter
) {
  try {
    // ✅ Handle uploaded files (existing logic)
    let filePaths = [];
    let fileNames = [];
    let fileMetadataArray = [];

    const hasNewFiles =
      _file_upload_ids &&
      Array.isArray(_file_upload_ids) &&
      _file_upload_ids.length > 0;

    if (hasNewFiles) {
      console.log(
        `📁 New files detected - Processing ${_file_upload_ids.length} file IDs`
      );

      const placeholders = _file_upload_ids.map(() => "?").join(",");
      const newFiles = await executeQuery(
        `SELECT file_path, file_metadata, extracted_text, created_at 
         FROM uploaded_files 
         WHERE id IN (${placeholders})
         AND conversation_id = ?`,
        [..._file_upload_ids, conversation_id]
      );

      console.log(
        `📁 Found ${newFiles.length} files for IDs: ${_file_upload_ids.join(
          ", "
        )}`
      );

      if (newFiles && newFiles.length > 0) {
        newFiles.forEach((file) => {
          if (file.file_path) {
            filePaths.push(file.file_path);
          }

          if (file.file_metadata) {
            try {
              const metadata = JSON.parse(file.file_metadata);
              fileNames.push(
                metadata.original_filename ||
                  metadata.display_filename ||
                  "Unknown"
              );
              fileMetadataArray.push(file.file_metadata);
            } catch (parseError) {
              console.error("❌ Error parsing file metadata:", parseError);
              fileNames.push("Unknown");
            }
          } else {
            fileNames.push("Unknown");
          }
        });
      }
    } else {
      console.log("📁 No new files - Skipping file data save");
    }

    // ✅ Handle generated files info
    // ✅ Handle generated files info
    let generatedFilesInfo = null;
    if (generatedFiles && generatedFiles.length > 0) {
      generatedFilesInfo = generatedFiles.map((file) => ({
        filename: file.filename,
        file_type: file.fileType,
        download_url: file.downloadUrl,
        size: file.size,
        ai_generated: true,
      }));
    }

    // Prepare data for database
    const filePathsString = filePaths.length > 0 ? filePaths.join(",") : null;
    const fileNamesString = fileNames.length > 0 ? fileNames.join(",") : null;
    const fileMetadataString =
      fileMetadataArray.length > 0 ? JSON.stringify(fileMetadataArray) : null;

    // ✅ URL processing (existing logic)
    const urlsString =
      processedUrls.length > 0 ? processedUrls.join(",") : null;
    const urlContentString =
      urlData.length > 0
        ? urlData
            .map((data, index) => {
              const status = data.error ? "FAILED" : "SUCCESS";
              const siteType = data.metadata?.siteType || "unknown";
              const contentLength = data.content?.length || 0;
              const content =
                data.content && !data.error
                  ? data.content
                  : `[ERROR: ${data.error}]`;

              return `[URL ${index + 1} - ${status} - ${siteType.toUpperCase()}]
URL: ${data.url}
Title: ${data.title || "No title"}
Description: ${data.description || "No description"}
Content Length: ${contentLength} characters
Site Type: ${siteType}

Content:
${content}

${"=".repeat(100)}`;
            })
            .join("\n\n")
        : null;

    const urlMetadata =
      urlData.length > 0
        ? JSON.stringify(
            urlData.map((data) => ({
              url: data.url,
              title: data.title,
              success: !data.error,
              error: data.error || null,
              site_type: data.metadata?.siteType,
              content_length: data.content?.length || 0,
              extraction_method: data.metadata?.extractionMethod,
              hostname: data.metadata?.hostname,
              processed_at: new Date().toISOString(),
            }))
          )
        : null;

    // ✅ COMBINE EXTRACTED TEXT WITH URL CONTENT
    let allExtractedText = "";
    if (extracted_summary) {
      allExtractedText += `CURRENT UPLOAD:\n${extracted_summary}\n\n`;
    }
    if (fileContext) {
      allExtractedText += `PREVIOUS FILES:\n${fileContext}\n\n`;
    }
    if (urlContentString) {
      allExtractedText += `URL CONTENT (${urlData.length} URLs):\n${urlContentString}`;
    }

    // ✅ INSERT QUERY WITH GENERATED FILE INFO
    await executeQuery(
      `INSERT INTO chat_history 
       (conversation_id, user_message, response, created_at, file_path, extracted_text, file_names, file_metadata, suggestions, urls, url_content, url_metadata, generated_file_info) 
       VALUES (?, ?, ?, NOW(), ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        conversation_id,
        userMessage,
        aiResponse,
        filePathsString,
        allExtractedText || null,
        fileNamesString,
        fileMetadataString,
        suggestions && suggestions.length > 0
          ? JSON.stringify(suggestions)
          : null,
        urlsString,
        urlContentString,
        urlMetadata,
        generatedFilesInfo ? JSON.stringify(generatedFilesInfo) : null, // ✅ New field
      ]
    );

    console.log("✅ Enhanced database save successful:", {
      has_new_files: hasNewFiles,
      file_upload_ids: _file_upload_ids,
      new_files_saved: filePaths.length,
      has_generated_files: !!(generatedFiles && generatedFiles.length > 0), // ✅ FIXED
      generated_files_count: generatedFiles ? generatedFiles.length : 0, // ✅ FIXED
      total_urls: processedUrls.length,
      successful_urls: urlData.filter((d) => !d.error).length,
    });

    return true;
  } catch (error) {
    console.error("❌ Enhanced database save error:", error);
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

    console.log(
      `🏷️ Conversation renamed to: "${aiGeneratedTitle}" for user:`,
      user_id
    );
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
          content:
            "Generate a short, descriptive title (3-6 words) for a conversation based on the user's first message. Reply with only the title, no quotes or extra text.",
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
// async function generateAndSaveComprehensiveSummary(
//   conversation_id,
//   currentUserMessage,
//   currentAiResponse,
//   urlContent = "",
//   fileContext = ""
// ) {
//   try {
//     console.log("🧠 Generating lightweight summary with Llama...");

//     // ✅ ONLY get chat history (no file content)
//     const fullHistory = await executeQuery(
//       "SELECT user_message, response FROM chat_history WHERE conversation_id = ? ORDER BY created_at ASC",
//       [conversation_id]
//     );

//     // ✅ ONLY get file NAMES (not content)
//     const allConversationFiles = await executeQuery(
//       `SELECT file_metadata FROM uploaded_files 
//        WHERE conversation_id = ? 
//        AND (status = 'confirmed' OR status = 'pending_response' OR status IS NULL)
//        ORDER BY created_at ASC`,
//       [conversation_id]
//     );
//     // ✅ GET ALL URLS FROM THIS CONVERSATION
//     const allConversationUrls = await executeQuery(
//       `SELECT urls, url_metadata FROM chat_history 
//    WHERE conversation_id = ? AND urls IS NOT NULL
//    ORDER BY created_at ASC`,
//       [conversation_id]
//     );

//     // ✅ Create URL summary for the comprehensive summary
//     let urlSummary = "";
//     const importantUrls = new Set();

//     if (allConversationUrls && allConversationUrls.length > 0) {
//       allConversationUrls.forEach((chat) => {
//         if (chat.urls) {
//           const urls = chat.urls.split(",");
//           urls.forEach((url) => importantUrls.add(url.trim()));
//         }

//         // Extract successful URLs from metadata
//         if (chat.url_metadata) {
//           try {
//             const metadata = JSON.parse(chat.url_metadata);
//             metadata.forEach((urlMeta) => {
//               if (urlMeta.success && urlMeta.site_type) {
//                 importantUrls.add(`${urlMeta.url} [${urlMeta.site_type}]`);
//               }
//             });
//           } catch (e) {
//             // Ignore parsing errors
//           }
//         }
//       });

//       if (importantUrls.size > 0) {
//         urlSummary = `\n\nIMPORTANT URLs REFERENCED:\n${Array.from(
//           importantUrls
//         )
//           .slice(0, 10)
//           .join("\n")}`;
//       }
//     }
//     // ✅ Build conversation WITHOUT file content
//     const completeConversation = [];

//     fullHistory.forEach((chat) => {
//       if (chat.user_message) {
//         // ✅ LIMIT user message length for summary
//         const limitedUserMessage =
//           chat.user_message.length > 300
//             ? chat.user_message.substring(0, 300) + "..."
//             : chat.user_message;

//         completeConversation.push({
//           role: "user",
//           content: limitedUserMessage,
//         });
//       }

//       if (chat.response) {
//         // ✅ LIMIT AI response length for summary
//         const limitedResponse =
//           chat.response.length > 400
//             ? chat.response.substring(0, 400) + "..."
//             : chat.response;

//         completeConversation.push({
//           role: "assistant",
//           content: limitedResponse,
//         });
//       }
//     });

//     // Add current exchange (also limited)
//     const currentUserLimited =
//       currentUserMessage.length > 300
//         ? currentUserMessage.substring(0, 300) + "..."
//         : currentUserMessage;

//     const currentAiLimited =
//       currentAiResponse.length > 400
//         ? currentAiResponse.substring(0, 400) + "..."
//         : currentAiResponse;

//     completeConversation.push({ role: "user", content: currentUserLimited });
//     completeConversation.push({ role: "assistant", content: currentAiLimited });

//     // ✅ Create file names summary (NOT content)
//     let filesSummary = "";
//     if (allConversationFiles && allConversationFiles.length > 0) {
//       const fileNames = [];
//       allConversationFiles.forEach((file) => {
//         if (file.file_metadata) {
//           try {
//             const metadata = JSON.parse(file.file_metadata);
//             fileNames.push(
//               metadata.original_filename || metadata.display_filename
//             );
//           } catch (e) {}
//         }
//       });

//       if (fileNames.length > 0) {
//         filesSummary = `\n\nFiles mentioned in conversation: ${fileNames.join(
//           ", "
//         )}`;
//       }
//     }

//     // ✅ Build conversation text (limited length)
//     const conversationText = completeConversation
//       .map((msg) => `${msg.role}: ${msg.content}`)
//       .join("\n");

//     // ✅ SAFE: Limit total conversation text to prevent token overflow
//     const maxConversationLength = 8000; // Safe limit
//     const finalConversationText =
//       conversationText.length > maxConversationLength
//         ? conversationText.substring(0, maxConversationLength) +
//           "\n...[Earlier messages truncated for summary]"
//         : conversationText;

//     console.log(
//       `📊 Creating summary: ${completeConversation.length} messages, ${finalConversationText.length} chars`
//     );

//     // ✅ LIGHTWEIGHT summary prompt (NO file content)
//     const summaryPrompt = [
//       {
//         role: "system",
//         content: `Create a concise conversation summary focusing on:

// 1. Main topics and questions discussed
// 2. User's key needs and preferences  
// 3. Important decisions or recommendations made
// 4. Technical details or specific requests mentioned
// 5. Files mentioned by name (not content)

// Keep it under 400 words for efficient context loading. Focus on conversation flow, not file content.

// Also include any important URLs or websites that were referenced and discussed in the conversation.`,
//       },
//       {
//         role: "user",
//         content: `Conversation to summarize:\n${finalConversationText}${filesSummary}${urlSummary}`,
//       },
//     ];

//     // ✅ USE LLAMA for summary generation
//     const summaryResult = await llama.chat.completions.create({
//       messages: summaryPrompt,
//       temperature: 0.2,
//       max_tokens: 600, // Reduced for efficiency
//     });

//     const summary = summaryResult.choices?.[0]?.message?.content || "";

//     if (summary && summary.length > 10) {
//       await executeQuery(
//         "UPDATE chat_history SET summarized_chat = ? WHERE conversation_id = ? ORDER BY created_at DESC LIMIT 1",
//         [summary, conversation_id]
//       );

//       console.log("✅ Lightweight summary generated with Llama:", {
//         length: summary.length,
//         message_count: completeConversation.length,
//         files_mentioned: allConversationFiles.length,
//         urls_mentioned: importantUrls.size,
//         conversation_id: conversation_id,
//         model: "Llama",
//         summary_preview: summary.substring(0, 100) + "...",
//       });

//       return true;
//     }

//     console.log("⚠️ Summary generation failed - empty or too short");
//     return false;
//   } catch (error) {
//     console.error("❌ Summary generation failed:", error.message);

//     // ✅ SIMPLE fallback summary
//     try {
//       let basicSummary = `User discussed: ${currentUserMessage.substring(
//         0,
//         150
//       )}${
//         currentUserMessage.length > 150 ? "..." : ""
//       }. AI provided assistance with this topic.`;

//       if (urlContent) {
//         basicSummary += " URLs were referenced.";
//       }

//       // ✅ Only mention file count, not content
//       const fileCount = allConversationFiles?.length || 0;
//       if (fileCount > 0) {
//         basicSummary += ` ${fileCount} files were discussed.`;
//       }
//       // ✅ Mention URL count
//       const urlCount = importantUrls?.size || 0;
//       if (urlCount > 0) {
//         basicSummary += ` ${urlCount} URLs were referenced.`;
//       }

//       await executeQuery(
//         "UPDATE chat_history SET summarized_chat = ? WHERE conversation_id = ? ORDER BY created_at DESC LIMIT 1",
//         [basicSummary, conversation_id]
//       );

//       console.log("✅ Fallback summary saved with Llama");
//       return true;
//     } catch (fallbackError) {
//       console.error("❌ Even fallback summary failed:", fallbackError);
//       return false;
//     }
//   }
// }

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
    // ✅ GET ALL URLS FROM THIS CONVERSATION
    const allConversationUrls = await executeQuery(
      `SELECT urls, url_metadata FROM chat_history 
   WHERE conversation_id = ? AND urls IS NOT NULL
   ORDER BY created_at ASC`,
      [conversation_id]
    );

    // ✅ Create URL summary for the comprehensive summary
    let urlSummary = "";
    const importantUrls = new Set();

    if (allConversationUrls && allConversationUrls.length > 0) {
      allConversationUrls.forEach((chat) => {
        if (chat.urls) {
          const urls = chat.urls.split(",");
          urls.forEach((url) => importantUrls.add(url.trim()));
        }

        // Extract successful URLs from metadata
        if (chat.url_metadata) {
          try {
            const metadata = JSON.parse(chat.url_metadata);
            metadata.forEach((urlMeta) => {
              if (urlMeta.success && urlMeta.site_type) {
                importantUrls.add(`${urlMeta.url} [${urlMeta.site_type}]`);
              }
            });
          } catch (e) {
            // Ignore parsing errors
          }
        }
      });

      if (importantUrls.size > 0) {
        urlSummary = `\n\nIMPORTANT URLs REFERENCED:\n${Array.from(
          importantUrls
        )
          .slice(0, 10)
          .join("\n")}`;
      }
    }
    
    // ✅ Build conversation WITHOUT file content
    const completeConversation = [];

    fullHistory.forEach((chat) => {
      if (chat.user_message) {
        // ✅ LIMIT user message length for summary
        const limitedUserMessage =
          chat.user_message.length > 300
            ? chat.user_message.substring(0, 300) + "..."
            : chat.user_message;

        completeConversation.push({
          role: "user",
          content: limitedUserMessage,
        });
      }

      if (chat.response) {
        // ✅ LIMIT AI response length for summary
        const limitedResponse =
          chat.response.length > 400
            ? chat.response.substring(0, 400) + "..."
            : chat.response;

        completeConversation.push({
          role: "assistant",
          content: limitedResponse,
        });
      }
    });

    // Add current exchange (also limited)
    const currentUserLimited =
      currentUserMessage.length > 300
        ? currentUserMessage.substring(0, 300) + "..."
        : currentUserMessage;

    const currentAiLimited =
      currentAiResponse.length > 400
        ? currentAiResponse.substring(0, 400) + "..."
        : currentAiResponse;

    completeConversation.push({ role: "user", content: currentUserLimited });
    completeConversation.push({ role: "assistant", content: currentAiLimited });

    // ✅ NEW: Extract last 4 messages for better accuracy
    const recentMessages = completeConversation.slice(-4);
    const recentMessagesText = recentMessages
      .map((msg) => `${msg.role}: ${msg.content}`)
      .join("\n");

    // ✅ Create file names summary (NOT content)
    let filesSummary = "";
    if (allConversationFiles && allConversationFiles.length > 0) {
      const fileNames = [];
      allConversationFiles.forEach((file) => {
        if (file.file_metadata) {
          try {
            const metadata = JSON.parse(file.file_metadata);
            fileNames.push(
              metadata.original_filename || metadata.display_filename
            );
          } catch (e) {}
        }
      });

      if (fileNames.length > 0) {
        filesSummary = `\n\nFiles mentioned in conversation: ${fileNames.join(
          ", "
        )}`;
      }
    }

    // ✅ Build conversation text (limited length)
    const conversationText = completeConversation
      .map((msg) => `${msg.role}: ${msg.content}`)
      .join("\n");

    // ✅ SAFE: Limit total conversation text to prevent token overflow
    const maxConversationLength = 8000; // Safe limit
    const finalConversationText =
      conversationText.length > maxConversationLength
        ? conversationText.substring(0, maxConversationLength) +
          "\n...[Earlier messages truncated for summary]"
        : conversationText;

    console.log(
      `📊 Creating summary: ${completeConversation.length} messages, ${finalConversationText.length} chars, last 4 messages: ${recentMessages.length}`
    );

    // ✅ ENHANCED summary prompt with recent messages for better accuracy
    const summaryPrompt = [
      {
        role: "system",
        content: `Create a concise conversation summary focusing on:

1. Main topics and questions discussed
2. User's key needs and preferences  
3. Important decisions or recommendations made
4. Technical details or specific requests mentioned
5. Files mentioned by name (not content)

Keep it under 400 words for efficient context loading. Focus on conversation flow, not file content.

Also include any important URLs or websites that were referenced and discussed in the conversation.

Pay special attention to the recent messages for the most current context and user intent.`,
      },
      {
        role: "user",
        content: `Full conversation to summarize:\n${finalConversationText}${filesSummary}${urlSummary}

RECENT MESSAGES (for better accuracy):
${recentMessagesText}`,
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
        recent_messages_count: recentMessages.length,
        files_mentioned: allConversationFiles.length,
        urls_mentioned: importantUrls.size,
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
      let basicSummary = `User discussed: ${currentUserMessage.substring(
        0,
        150
      )}${
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
      // ✅ Mention URL count
      const urlCount = importantUrls?.size || 0;
      if (urlCount > 0) {
        basicSummary += ` ${urlCount} URLs were referenced.`;
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
      res.write(
        JSON.stringify({
          type: "start",
          guest_mode: true,
          context: {
            url_processing_started: true,
          },
          processing_time: Date.now() - startTime,
        }) + "\n"
      );

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
          res.write(
            JSON.stringify({
              type: "content",
              content: content,
            }) + "\n"
          );
        }
      }

      // Wait for URL processing to complete
      const urlResult = await urlProcessingPromise;
      const { urlData, urlContent, processedUrls } = urlResult;

      // 🚀 GENERATE SIMPLE CONTEXTUAL SUGGESTIONS AFTER AI RESPONSE
      console.log("🎯 Generating guest suggestions based on conversation...");
      const suggestions = await generateFastGuestSuggestions(
        userMessage,
        aiResponse
      );

      // Send final data
      res.write(
        JSON.stringify({
          type: "end",
          suggestions: suggestions,
          full_response: aiResponse,
          guest_mode: true,
          processed_urls: urlData.map((data) => ({
            url: data.url,
            title: data.title,
            success: !data.error,
            error: data.error,
            site_type: data.metadata?.siteType, // Optional enhancement
            content_length: data.content?.length || 0, // Optional enhancement
          })),
          context: {
            url_content_available: !!urlContent,
            urls_processed: urlData.length,
          },
          total_processing_time: Date.now() - startTime,
        }) + "\n"
      );

      res.end();

      // 📊 Optional: Log guest interactions with URLs for analytics (without storing personal data)
      if (urlData.length > 0) {
        console.log(
          `📊 Guest interaction: ${urlData.length} URLs processed, ${
            urlData.filter((d) => !d.error).length
          } successful`
        );
      }
    } catch (aiError) {
      console.error("AI API error in guest mode:", aiError);
      res.write(
        JSON.stringify({
          type: "error",
          error:
            "I'm having trouble processing your request. Please try again.",
          guest_mode: true,
        }) + "\n"
      );
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

  console.log(
    `🔗 Guest mode: Found ${extractedUrls.length} URLs - processing optimized`
  );

  // Send URL processing status immediately
  res.write(
    JSON.stringify({
      type: "url_processing",
      status: "started",
      urls: extractedUrls,
      count: extractedUrls.length,
      guest_mode: true,
    }) + "\n"
  );

  try {
    // ⚡ Process URLs with timeout and parallel processing
    const urlPromises = extractedUrls.map(async (url) => {
      try {
        // Set a 3-second timeout for each URL
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error("URL processing timeout")), 3000)
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
        console.log(
          "⚠️ Guest URL processing timeout - proceeding with partial results"
        );
        resolve([]);
      }, 4000)
    );

    urlData = await Promise.race([allUrlsPromise, totalTimeoutPromise]);

    if (urlData && urlData.length > 0) {
      processedUrls = extractedUrls;

      // Create URL content summary
      urlContent = urlData
        .filter((data) => data && data.content && !data.error)
        .map(
          (data) =>
            `URL: ${data.url}\nTitle: ${
              data.title
            }\nContent: ${data.content.substring(0, 1500)}\n---`
        )
        .join("\n");

      // Send completion status
      res.write(
        JSON.stringify({
          type: "url_processing",
          status: "completed",
          processed: urlData.length,
          successful: urlData.filter((d) => d && !d.error).length,
          guest_mode: true,
        }) + "\n"
      );
    }
  } catch (error) {
    console.error("❌ Guest URL processing error:", error);
    res.write(
      JSON.stringify({
        type: "url_processing",
        status: "error",
        error: "Failed to process URLs",
        guest_mode: true,
      }) + "\n"
    );
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
      const responsePreview =
        aiResponse.length > 500
          ? aiResponse.substring(0, 500) + "..."
          : aiResponse;
      context = `User asked: "${userMessage}"\nAI responded: "${responsePreview}"`;
    }

    const suggestionResult = await deepseek.chat.completions.create({
      model: "deepseek-chat",
      messages: [
        {
          role: "system",
          content:
            "Based on the conversation, generate 3 short follow-up questions that the user would naturally ask next. Make them specific to the topics discussed. Reply only with numbered list.",
        },
        { role: "user", content: context },
      ],
      temperature: 0.8,
      max_tokens: 100, // Reduced for guest mode speed
    });

    const rawSuggestion = suggestionResult.choices?.[0]?.message?.content || "";
    const suggestions = rawSuggestion
      .split("\n")
      .map((s) =>
        s
          .replace(/^[\s\d\-•.]+/, "")
          .replace(/[.?!]+$/, "")
          .trim()
      )
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

// ✅ SMART CONTENT VALIDATOR
function validateFileContent(content, fileType) {
  if (!content || content.length < 50) {
    return { valid: false, reason: "Content too short" };
  }

  // Type-specific validation
  switch (fileType.toLowerCase()) {
    case "docx":
      if (!content.includes("\n") && content.length < 100) {
        return { valid: false, reason: "Document content seems incomplete" };
      }
      break;
    case "xlsx":
      if (
        !content.includes("|") &&
        !content.includes("\t") &&
        !content.includes(",")
      ) {
        return {
          valid: false,
          reason: "Spreadsheet should contain tabular data",
        };
      }
      break;
    case "pdf":
      if (content.length < 200) {
        return { valid: false, reason: "PDF content too minimal" };
      }
      break;
  }

  return { valid: true };
}

// ✅ PROFESSIONAL FILENAME GENERATOR
function generateProfessionalFilename(originalName, fileType, userInfo = null) {
  let cleanName = originalName
    .replace(/[^a-zA-Z0-9_\-\s]/g, "")
    .replace(/\s+/g, "_")
    .substring(0, 50);

  // Add user context if available
  if (userInfo && userInfo.username) {
    const userName = userInfo.username.replace(/[^a-zA-Z0-9]/g, "");
    if (!cleanName.toLowerCase().includes(userName.toLowerCase())) {
      cleanName = `${cleanName}_${userName}`;
    }
  }

  // Add timestamp for uniqueness
  const timestamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");

  return `${cleanName}_${timestamp}`;
}

// ✅ RESPONSE QUALITY ANALYZER
function analyzeResponseQuality(userMessage, aiResponse, fileAnalysis) {
  const analysis = {
    score: 0,
    issues: [],
    suggestions: [],
  };

  // Check if file creation was requested but not delivered
  if (fileAnalysis.shouldCreateFile && !aiResponse.includes("[CREATE_FILE:")) {
    analysis.issues.push("File creation requested but not provided");
    analysis.score -= 30;
  }

  // Check response length appropriateness
  if (userMessage.length > 100 && aiResponse.length < 200) {
    analysis.issues.push("Response may be too brief for detailed request");
    analysis.score -= 10;
  }

  // Check for professional formatting
  if (fileAnalysis.shouldCreateFile && aiResponse.includes("[CREATE_FILE:")) {
    if (!aiResponse.includes("**") && !aiResponse.includes("*")) {
      analysis.suggestions.push(
        "Consider adding more formatting to file content"
      );
      analysis.score -= 5;
    }
  }

  // Base score
  analysis.score += 70;

  return analysis;
}

// ✅ PERFORMANCE MONITOR
class PerformanceMonitor {
  constructor() {
    this.metrics = new Map();
  }

  start(operation) {
    this.metrics.set(operation, {
      startTime: Date.now(),
      endTime: null,
      duration: null,
    });
  }

  end(operation) {
    const metric = this.metrics.get(operation);
    if (metric) {
      metric.endTime = Date.now();
      metric.duration = metric.endTime - metric.startTime;

      // Log slow operations
      if (metric.duration > 3000) {
        console.warn(`🐌 SLOW: ${operation} took ${metric.duration}ms`);
      } else if (metric.duration < 500) {
        console.log(`⚡ FAST: ${operation} took ${metric.duration}ms`);
      }
    }
  }

  getMetrics() {
    const results = {};
    for (const [operation, metric] of this.metrics.entries()) {
      results[operation] = metric.duration;
    }
    return results;
  }

  reset() {
    this.metrics.clear();
  }
}

// ✅ GLOBAL PERFORMANCE MONITOR INSTANCE
const performanceMonitor = new PerformanceMonitor();

// ✅ ENHANCED ERROR RECOVERY
async function handleCriticalError(error, context, res) {
  console.error(`🚨 CRITICAL ERROR in ${context}:`, error);

  // Try to provide helpful error message based on error type
  let userMessage =
    "I'm experiencing technical difficulties. Please try again.";

  if (error.message.includes("timeout")) {
    userMessage =
      "The request is taking longer than expected. Please try again with a shorter message.";
  } else if (error.message.includes("token")) {
    userMessage =
      "Your request is quite complex. Please try breaking it into smaller parts.";
  } else if (error.message.includes("file")) {
    userMessage =
      "There was an issue with file processing. Please try uploading your files again.";
  }

  if (!res.headersSent) {
    res.write(
      JSON.stringify({
        type: "error",
        error: userMessage,
        context: context,
        timestamp: new Date().toISOString(),
        recoverable: true,
      }) + "\n"
    );
  }
}

// ✅ EXPORT PERFORMANCE MONITOR FOR TESTING
module.exports.performanceMonitor = performanceMonitor;
