const { createClient } = require("@deepgram/sdk");
const { v4: uuidv4 } = require("uuid");
const multer = require("multer");
const { uploadToFTP } = require("../utils/ftpUploader");
const db = require("../config/db");
const openai = require("../config/openai");
const deepseek = require("../config/deepseek");
const { query } = require("../config/db");
require("dotenv").config();
const fetch = require("cross-fetch"); // In case you need it elsewhere
const WebSocket = require("ws"); // ✅ Import ws package for Node.js
const { LiveTranscriptionEvents } = require("@deepgram/sdk");
const deepgram = createClient(process.env.DEEPGRAM_API_KEY);
const DEEPGRAM_URL = `wss://api.deepgram.com/v1/listen`;
let pendingAudioChunks = [];
let deepgramReady = false;

// --- FINAL AUDIO UPLOAD + ACCURATE TRANSCRIPTION ---
const storage = multer.memoryStorage();
const upload = multer({ storage }).single("audio");

// const fetch = require('node-fetch'); // Required if you're using fetch in Node <18

const generateTTS = async (text, voice = "af_heart", speed = 1.0) => {
  try {
    const response = await fetch(
      "https://composed-singular-seagull.ngrok-free.app/generate",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, voice, speed }),
      }
    );

    if (!response.ok) throw new Error(`TTS failed: ${response.status}`);

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    return buffer;
  } catch (err) {
    console.error("❌ TTS generation failed:", err.message);
    return null;
  }
};

const handleFinalUpload = (req, res) => {
  upload(req, res, async (err) => {
    if (err) {
      console.error("❌ Upload error:", err);
      return res.status(500).json({ error: "Upload failed" });
    }

    const buffer = req.file.buffer;
    const fileName = `${uuidv4()}_${req.file.originalname}`;
    const ftpPath = "/public_html/fileuploads/audio";

    try {
      // Upload audio to FTP
      const publicUrl = await uploadToFTP(buffer, `${ftpPath}/${fileName}`);
      console.log("✅ File uploaded to FTP:", publicUrl);

      // Transcribe uploaded audio
      const response = await deepgram.listen.prerecorded.transcribeFile(
        buffer,
        {
          model: "nova-3",
          language: "en-US",
          smart_format: true,
          punctuate: true,
        }
      );

      const data = response;
      const transcript =
        data?.result?.results?.channels?.[0]?.alternatives?.[0]?.transcript;

      if (!transcript || transcript.trim().length === 0) {
        console.warn("⚠️ No transcript returned from Deepgram");
        return res.json({
          transcript: "",
          audio_url: publicUrl,
        });
      }

      console.log("📄 Final transcript:", transcript);
      return res.json({
        transcript,
        audio_url: publicUrl,
      });
    } catch (err) {
      console.error("❌ Deepgram transcription failed:", err.message);
      return res.status(500).json({ error: "Transcription failed" });
    }
  });
};

const handleDictateMode = (ws, userId) => {
  console.log(`🎤 [Dictate Mode] Starting for user: ${userId}`);

  // 👈 FIXED: Use exact same URL as working handleLiveVoiceMessage
  const deepgramSocket = new WebSocket(
    "wss://api.deepgram.com/v1/listen?model=nova-3&language=en-US&punctuate=true&smart_format=true&vad_events=true&interim_results=true&encoding=linear16&sample_rate=16000",
    {
      headers: {
        Authorization: `Token ${process.env.DEEPGRAM_API_KEY}`,
      },
    }
  );

  let isDGReady = false;
  const audioQueue = [];
  let audioChunkCount = 0;
  let transcriptCount = 0;

  deepgramSocket.on("open", () => {
    console.log(
      "✅ [Dictate] Deepgram WebSocket connection opened successfully"
    );
    isDGReady = true;

    console.log(
      `📦 [Dictate] Processing ${audioQueue.length} queued audio chunks`
    );
    while (audioQueue.length > 0) {
      const chunk = audioQueue.shift();
      deepgramSocket.send(chunk);
      console.log(
        `🔊 [Dictate] Sent queued audio chunk: ${chunk.length} bytes`
      );
    }

    ws.send(
      JSON.stringify({
        type: "dictate-ready",
      })
    );
    console.log("📤 [Dictate] Sent 'dictate-ready' to frontend");
  });

  deepgramSocket.on("message", (msg) => {
    try {
      console.log(
        `📨 [Dictate] Raw message received from Deepgram: ${msg
          .toString()
          .substring(0, 200)}...`
      );

      const data = JSON.parse(msg.toString());
      const transcript = data.channel?.alternatives?.[0]?.transcript;
      const confidence = data.channel?.alternatives?.[0]?.confidence;
      const isFinal = data.is_final;

      console.log(`📝 [Dictate] Transcript details:`, {
        transcript: transcript,
        confidence: confidence,
        is_final: isFinal,
        has_transcript: !!transcript,
        transcript_length: transcript?.length || 0,
      });

      if (transcript && transcript.trim() !== "") {
        transcriptCount++;
        console.log(
          `🎯 [Dictate #${transcriptCount}] Valid transcript found: "${transcript}"`
        );

        const responseData = {
          type: "dictate-transcript",
          text: transcript,
          is_final: isFinal || false,
          confidence: confidence || 0,
        };

        ws.send(JSON.stringify(responseData));
        console.log(`📤 [Dictate] Sent transcript to frontend:`, responseData);
      } else {
        console.log(
          `⚠️ [Dictate] Empty transcript - audio might be silent or encoding mismatch`
        );
      }
    } catch (err) {
      console.error("❌ [Dictate] Error parsing Deepgram message:", err);
    }
  });

  deepgramSocket.on("error", (err) => {
    console.error("❌ [Dictate] Deepgram WebSocket error:", err);
    ws.send(JSON.stringify({ type: "error", error: "Dictate error" }));
  });

  deepgramSocket.on("close", (code, reason) => {
    console.log(
      `🔌 [Dictate] Deepgram WebSocket closed. Code: ${code}, Reason: ${reason}`
    );
  });

  const handleDictateMessage = (data) => {
    try {
      if (!Buffer.isBuffer(data)) {
        const parsed = JSON.parse(data.toString());
        if (parsed.type === "stop-dictate") {
          console.log("🛑 [Dictate] Stop dictate command received");
          deepgramSocket.close();
          ws.removeListener("message", handleDictateMessage);
          ws.send(JSON.stringify({ type: "dictate-stopped" }));
          return;
        }
      }
    } catch (err) {
      // Expected for audio data
    }

    if (Buffer.isBuffer(data)) {
      audioChunkCount++;
      console.log(
        `🔊 [Dictate Audio #${audioChunkCount}] Received audio chunk: ${data.length} bytes`
      );

      if (isDGReady && deepgramSocket.readyState === WebSocket.OPEN) {
        deepgramSocket.send(data);
        console.log(
          `📤 [Dictate] Sent audio chunk to Deepgram: ${data.length} bytes`
        );
      } else {
        audioQueue.push(data);
        console.log(`📦 [Dictate] Queued audio chunk: ${data.length} bytes`);
      }
    }
  };

  ws.on("message", handleDictateMessage);

  ws.on("close", () => {
    console.log(`🔌 [Dictate] Client WebSocket closed for user: ${userId}`);
    console.log(
      `📊 [Dictate] Session stats - Audio chunks: ${audioChunkCount}, Transcripts: ${transcriptCount}`
    );

    if (deepgramSocket.readyState === WebSocket.OPEN) {
      deepgramSocket.close();
    }
    ws.removeListener("message", handleDictateMessage);
  });
};

// const handleLiveVoiceMessage = (ws, userId) => {
//   console.log(`🎤 [Voice] Starting live session for user: ${userId}`);

//   const deepgramSocket = new WebSocket(
//     "wss://api.deepgram.com/v1/listen?model=nova-3&language=en-US&punctuate=true&smart_format=true&vad_events=true&interim_results=false&encoding=linear16&sample_rate=16000",
//     {
//       headers: {
//         Authorization: `Token ${process.env.DEEPGRAM_API_KEY}`,
//       },
//     }
//   );

//   let fullTranscript = "";
//   let isDGReady = false;
//   const audioBufferQueue = [];

//   // Handle Deepgram connection open
//   deepgramSocket.on("open", () => {
//     console.log("✅ [Deepgram] Connection opened");
//     isDGReady = true;

//     // Flush any buffered audio
//     while (audioBufferQueue.length > 0) {
//       deepgramSocket.send(audioBufferQueue.shift());
//     }
//   });

//   // Handle transcription messages
//   deepgramSocket.on("message", async (msg) => {
//     try {
//       const data = JSON.parse(msg.toString());
//       const transcript = data.channel?.alternatives?.[0]?.transcript;

//       if (transcript && transcript.trim() !== "") {
//         console.log(`📝 [Transcript] ${transcript}`);
//         fullTranscript += transcript + " ";

//         ws.send(JSON.stringify({ type: "transcript", text: transcript }));

//         if (data.is_final) {
//           console.log(`✅ [Final Transcript] ${fullTranscript.trim()}`);
//           const aiResponse = await fetchDeepseekAI(fullTranscript.trim());
//           console.log(`🤖 [DeepSeek] Response: ${aiResponse}`);

//           ws.send(
//             JSON.stringify({
//               type: "ai-response",
//               text: aiResponse,
//             })
//           );

//           fullTranscript = "";
//         }
//       }
//     } catch (err) {
//       console.error("❌ [Parse Error]", err);
//     }
//   });

//   // Handle Deepgram errors
//   deepgramSocket.on("error", (err) => {
//     console.error("❌ [Deepgram Socket Error]", err);
//     ws.send(
//       JSON.stringify({ type: "error", error: "Deepgram connection error" })
//     );
//   });

//   // Handle Deepgram close
//   deepgramSocket.on("close", () => {
//     console.log("🔌 [Deepgram] Connection closed");
//   });

//   // Handle audio chunks from frontend
//   ws.on("message", (data) => {
//     if (Buffer.isBuffer(data)) {
//       if (isDGReady && deepgramSocket.readyState === WebSocket.OPEN) {
//         deepgramSocket.send(data);
//       } else {
//         audioBufferQueue.push(data); // Buffer until ready
//       }
//     }
//   });

//   ws.on("close", () => {
//     console.log(`🔌 [Voice] WebSocket closed for user: ${userId}`);
//     deepgramSocket.close();
//   });
// };

// DeepSeek AI integration

// ✅ STANDARDIZED DATABASE QUERY WRAPPER (from chatController)
const executeQuery = async (sql, params = []) => {
  try {
    const result = await db.query(sql, params);
    if (Array.isArray(result) && Array.isArray(result[0])) {
      return result[0];
    }
    return result;
  } catch (error) {
    console.error("❌ Database query error:", error);
    throw error;
  }
};

let sttStartTime = null;
let aiStartTime = null;
let ttsStartTime = null;
let firstAIChunkTime = null;
let firstTTSChunkTime = null;

// 🚀 OPTIMIZED CONTEXT RETRIEVAL (from chatController)
async function getConversationContextOptimized(conversation_id, user_id) {
  if (!conversation_id) {
    return {
      summaryContext: "",
      shouldRename: false,
      newConversationName: null,
    };
  }

  try {
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
        LIMIT 3`,
      [conversation_id, user_id]
    );

    let summaryContext = "";
    let shouldRename = false;
    let newConversationName = null;

    if (results && results.length > 0) {
      const conversationName = results[0]?.conversation_name;

      if (
        conversationName === "New Conversation" ||
        conversationName === "New Chat" ||
        !conversationName
      ) {
        shouldRename = true;
      }

      const latestSummary = results.find(
        (r) => r.summarized_chat
      )?.summarized_chat;

      if (latestSummary) {
        summaryContext = latestSummary;
        console.log("✅ Using existing summary for context");
      } else {
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

// 🧠 BUILD AI MESSAGES FOR VOICE MODE - Optimized for short, conversational responses
// 🧠 BUILD AI MESSAGES FOR VOICE MODE - Optimized for short, conversational responses
// ✅ IMPROVED SYSTEM PROMPT for better responses
// ✅ IMPROVED SYSTEM PROMPT - Allow markdown for frontend display
function buildAIMessages(summaryContext, userMessage, userInfo = null) {
  const currentDate = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  // Build user context for personalized responses
  let userContext = "";
  if (userInfo && userInfo.username) {
    userContext = `You're chatting with ${userInfo.username}. Use their name sparingly and naturally - only when it feels conversational, like greeting them or when being supportive.`;
  }

  const systemPrompt = {
    role: "system",
    content: `You are QhashAI — an intelligent voice assistant created by the QuantumHash development team in 2024.

Current date: ${currentDate}.

${userContext}

VOICE MODE GUIDELINES:
- Provide ACCURATE and COMPLETE answers to user questions
- Be conversational but thorough - don't sacrifice accuracy for brevity
- For simple questions: Keep responses concise (2-3 sentences)
- For complex questions: Provide detailed explanations (up to 3-4 sentences if needed)
- Always prioritize correctness over speed
- If you need to explain something technical, break it down clearly
- Use a warm, helpful tone but ensure information is comprehensive
- For factual questions: Provide specific, accurate information
- For how-to questions: Give step-by-step guidance
- If unsure about something, acknowledge it rather than guessing
- You can use markdown formatting (**bold**, *italic*, etc.) for better text display
- Use formatting to emphasize important points and improve readability

When asked your name: "I'm QhashAI, built by the QuantumHash team."
For complex requests: Give a complete answer, then offer to elaborate if needed.

Remember: Accuracy and helpfulness are more important than being brief. Users need correct, complete information.`,
  };

  const finalMessages = [systemPrompt];

  // ✅ INCREASED context limit for better understanding
  if (summaryContext) {
    finalMessages.push({
      role: "system",
      content: `CONVERSATION CONTEXT: ${summaryContext.substring(0, 1000)}`, // ✅ INCREASED from 500 to 1000
    });
  }

  finalMessages.push({ role: "user", content: userMessage });

  return finalMessages;
}

 

const SILENT_PCM_FRAME = Buffer.alloc(320, 0);
let silenceInterval = null;

const startSendingSilence = (socket) => {
  stopSendingSilence();
  silenceInterval = setInterval(() => {
    if (socket.readyState === WebSocket.OPEN) {
      const silenceFrame = Buffer.alloc(320, 0); // ✅ Explicitly fill with zeros
      socket.send(silenceFrame);
    }
  }, 50); // ✅ Reduced interval for better connection maintenance
};


const stopSendingSilence = () => {
  if (silenceInterval) {
    clearInterval(silenceInterval);
    silenceInterval = null;
  }
};

const handleLiveVoiceMessage = async (ws, userId, conversationId) => {
  console.log(
    `🎤 [Voice] Starting live session for user: ${userId}, conversation: ${conversationId}`
  );

  // ✅ VERIFY CONVERSATION OWNERSHIP IF PROVIDED (like chatController.js)
  if (conversationId && !isNaN(conversationId)) {
    const ownershipCheck = await executeQuery(
      "SELECT id FROM conversations WHERE id = ? AND user_id = ? AND is_deleted = FALSE",
      [conversationId, userId]
    );

    if (!ownershipCheck || ownershipCheck.length === 0) {
      console.warn(
        "⚠️ Provided conversation invalid or not owned. Trying fallback..."
      );

      // Try fallback to latest conversation (like chatController.js)
      const latest = await executeQuery(
        `SELECT id FROM conversations WHERE user_id = ? AND is_deleted = FALSE ORDER BY updated_at DESC LIMIT 1`,
        [userId]
      );

      if (latest && latest.length > 0) {
        conversationId = latest[0].id;
        console.log(
          "✅ Fallback to latest active conversation:",
          conversationId
        );
      } else {
        console.error("❌ No valid conversation found and none provided.");
        ws.send(
          JSON.stringify({ type: "error", error: "No conversation found." })
        );
        return;
      }
    } else {
      console.log(`✅ Using provided conversation ID: ${conversationId}`);
    }
  } else {
    // ✅ NO CONVERSATION PROVIDED - Use empty conversation logic (like chatController.js createConversation)
    console.log(
      "🔍 No conversation provided, checking for empty conversations..."
    );

    const recentConversations = await executeQuery(
      `SELECT id, name FROM conversations 
        WHERE user_id = ? AND is_deleted = FALSE
        ORDER BY created_at DESC 
        LIMIT 1`,
      [userId]
    );

    console.log(
      "🔍 Recent conversations for user",
      userId,
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
        conversationId = recentConversation.id;
        console.log(
          "🔄 Reused empty conversation:",
          conversationId,
          "for user:",
          userId
        );
      } else {
        // Create new conversation if recent one has messages
        const newConversationResult = await executeQuery(
          "INSERT INTO conversations (user_id, name) VALUES (?, ?)",
          [userId, "New Conversation"]
        );
        conversationId = newConversationResult.insertId;
        console.log(
          "🆕 Created new conversation:",
          conversationId,
          "for user:",
          userId
        );
      }
    } else {
      // No conversations exist, create new one
      const newConversationResult = await executeQuery(
        "INSERT INTO conversations (user_id, name) VALUES (?, ?)",
        [userId, "New Conversation"]
      );
      conversationId = newConversationResult.insertId;
      console.log(
        "🆕 Created first conversation:",
        conversationId,
        "for user:",
        userId
      );
    }
  }

  // ✅ Initialize Deepgram STT WebSocket
   const deepgramSocket = new WebSocket(
      "wss://api.deepgram.com/v1/listen?model=nova-2&language=en-US&punctuate=true&smart_format=true&vad_events=true&interim_results=true&encoding=linear16&sample_rate=16000",
    {
      headers: {
        Authorization: `Token ${process.env.DEEPGRAM_API_KEY}`,
      },
    }
  );

  // ✅ Initialize Deepgram TTS WebSocket for streaming audio
  let ttsSocket = null;
  let isTTSReady = false;
let ttsAudioChunkBuffer = [];

  const initializeTTSSocket = () => {
  console.log("🔊 [TTS Init] Initializing TTS WebSocket...");
  
  ttsSocket = new WebSocket(
    "wss://api.deepgram.com/v1/speak?model=aura-asteria-en&encoding=linear16&sample_rate=24000&container=none&buffer_size=150",
    {
      headers: {
        Authorization: `Token ${process.env.DEEPGRAM_API_KEY}`,
      },
    }
  );

  ttsSocket.on("open", () => {
    console.log("✅ [TTS Socket] Opened successfully");
    isTTSReady = true;
    
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: "tts-ready",
        message: "TTS ready for streaming"
      }));
      console.log("📤 [TTS Ready] Signal sent to frontend");
    }
  });

  // ✅ ULTRA-FAST AUDIO FORWARDING
// ✅ OPTIMIZED TTS MESSAGE HANDLER - IMMEDIATE FORWARDING
// ✅ OPTIMIZED TTS MESSAGE HANDLER - IMMEDIATE FORWARDING
  isFinalTTSOfResponse = true;
let ttsChunkNumber = 0;
   ttsSocket.on("message", (data) => {
      try {
        // ✅ Handle JSON metadata
        if (data.toString().startsWith("{")) {
          const message = JSON.parse(data.toString());

          if (message.type === "Results") {
            console.log("📊 [TTS] Metadata received");
            return;
          } else if (message.type === "Flushed") {
  console.log("🔊 [TTS] Flush completed - sending buffered audio chunks to frontend");

  // Send all buffered audio chunks for THIS Speak, mark last as is_final: true
  if (ws && ws.readyState === WebSocket.OPEN && ttsAudioChunkBuffer.length > 0) {
    for (let i = 0; i < ttsAudioChunkBuffer.length; i++) {
      ws.send(JSON.stringify({
  type: "tts-audio-chunk",
  audio: ttsAudioChunkBuffer[i].toString("base64"),
  encoding: "linear16",
  sample_rate: 24000,
  chunk_number: ttsChunksReceived - ttsAudioChunkBuffer.length + i + 1,
  chunk_size: ttsAudioChunkBuffer[i].length,
  timestamp: Date.now(),
  is_final: i === ttsAudioChunkBuffer.length - 1 // true for last chunk of this Speak
}));

// After sending the last chunk of the last Speak (i.e., after the buffer loop and only if this is the last response)
// You need a flag to know when the entire response is done. 
// The best place is after the FINAL Flush (after all TTS chunks for the response are sent).
if (
  i === ttsAudioChunkBuffer.length - 1 // last chunk of this Speak
  && isFinalTTSOfResponse // <-- you need to set this flag when the last TTS Flush is done for the response
) {
  ws.send(JSON.stringify({
    type: "tts-complete",
    total_chunks: ttsChunksReceived
  }));
}

    }
    ttsAudioChunkBuffer = []; // Clear for next Speak
  }

  // DO NOT send tts-complete here unless this is the last Speak of the whole response!
  // Only send tts-complete when the entire response is done (your existing logic).
  return;
}

else if (message.type === "Warning") {
            console.warn("⚠️ [TTS] Warning:", message);
            return;
          }
        }

        // ✅ IMMEDIATE AUDIO FORWARDING WITH PROPER TRACKING
               // ✅ IMMEDIATE AUDIO FORWARDING WITH PROPER TRACKING
       if (Buffer.isBuffer(data) && data.length > 50) {
  // Buffer the chunk for this Speak
  ttsAudioChunkBuffer.push(data);

  ttsChunksReceived++;
  ttsChunkNumber++;
  totalTTSBytes += data.length;
  backendChunksSent++;

  if (!ttsStreamStartTime) {
    ttsStreamStartTime = Date.now();
    const streamLatency = ttsStreamStartTime - ttsStartTime;
    console.log(`🔊 [TTS Stream] First audio in ${streamLatency}ms`);
  }
  // Do NOT send to frontend yet!
}

      } catch (parseError) {
        console.error("❌ [TTS] Parse error:", parseError.message);
      }
    });





  ttsSocket.on("close", (code, reason) => {
    console.log(`🔌 [TTS Socket] Closed: ${code} - ${reason}`);
    isTTSReady = false;
  });

  ttsSocket.on("error", (err) => {
    console.error("❌ [TTS Socket Error]:", err.message);
    isTTSReady = false;
  });
};


  // Initialize TTS socket
  initializeTTSSocket();

  // let isDGReady = false;
  // let isGenerating = false;
  // let transcriptBuffer = "";
  // const audioQueue = [];
  // let aiTriggerTimeout = null;
  // let keepAliveInterval = null;

  // // ✅ RESET TRANSCRIPT BUFFERS FOR NEW SESSION
  // let liveTranscriptBuffer = "";
  // let lastProcessTime = 0;
  // const LIVE_PROCESS_INTERVAL = 2000;

  // // ADD THESE PERFORMANCE TRACKING VARIABLES:
  // // ✅ Performance tracking
  // let ttsChunksReceived = 0;
  // let totalTTSBytes = 0;
  // let ttsStreamStartTime = null;
// ✅ OPTIMIZED STATE MANAGEMENT
 // ✅ OPTIMIZED STATE MANAGEMENT
 // ✅ OPTIMIZED STATE MANAGEMENT
  let isDGReady = false;
  let isGenerating = false;
  let sttPaused = false;
  
  // ✅ LIVE TRANSCRIPT PROCESSING
  let liveTranscriptBuffer = "";
  let finalTranscriptBuffer = "";
  let transcriptBuffer = ""; // ✅ ADD MISSING VARIABLE
  let lastSpeechTime = 0;
  let speechEndTimeout = null;
  let aiTriggerTimeout = null; // ✅ ADD MISSING VARIABLE
  let isUserSpeaking = false;
  const audioQueue = [];
  let keepAliveInterval = null;

  // ✅ Performance tracking
  let ttsChunksReceived = 0;
  let totalTTSBytes = 0;
  let ttsStreamStartTime = null;
  let sttStartTime = null;
  let aiStartTime = null;
  let ttsStartTime = null;
  let firstAIChunkTime = null;
  let firstTTSChunkTime = null;

  // ✅ ADD FRONTEND TRACKING VARIABLES
  let frontendChunksReceived = 0;
  let frontendChunksPlayed = 0;
  let backendChunksSent = 0;
let lastTranscriptSent = ""; // Add at top-level state


  // ✅ SPEECH DETECTION CONSTANTS
  const SPEECH_END_DELAY = 800; // ✅ Reduced from 2000ms to 800ms
  const VAD_SILENCE_THRESHOLD = 1200; // ✅ 1.2 seconds of silence triggers processing


  // ✅ ADD THESE STT CONTROL FUNCTIONS HERE
  // let sttPaused = false; // ✅ ADD THIS FLAG

    function pauseSTT() {
    console.log("⏸️ [STT] Pausing speech recognition");
    sttPaused = true;
    
    // ✅ CLEAR ANY PENDING TIMEOUTS
    if (aiTriggerTimeout) clearTimeout(aiTriggerTimeout);
    
    // Keep connection alive with silence
    if (deepgramSocket && deepgramSocket.readyState === WebSocket.OPEN) {
      startSendingSilence(deepgramSocket);
      console.log("🔄 [STT] Started sending silence to Deepgram");
    }
  }

  function resumeSTT() {
    console.log("▶️ [STT] Resuming speech recognition");
    sttPaused = false;
    stopSendingSilence();
    
    // ✅ RESET ALL TRANSCRIPT BUFFERS
    liveTranscriptBuffer = "";
    finalTranscriptBuffer = "";
    transcriptBuffer = "";
    
    // ✅ RESET TIMING AND STATE
    sttStartTime = null;
    isUserSpeaking = false;
    lastSpeechTime = 0;
    
    // ✅ CLEAR ANY PENDING TIMEOUTS
    if (aiTriggerTimeout) clearTimeout(aiTriggerTimeout);
  }


 // ✅ ADD MISSING FUNCTION
  async function processCompleteTranscript(transcript) {
    if (isGenerating || !transcript || transcript.trim().length < 2) return;

    const sttTotalTime = sttStartTime ? Date.now() - sttStartTime : 0;
    console.log(`✅ [Processing Complete Message] "${transcript}" (STT: ${sttTotalTime}ms)`);
    console.log(`🚀 [STT Complete] Total STT time: ${sttTotalTime}ms`);

    // Reset transcript buffer
    transcriptBuffer = "";
     lastTranscriptSent = "";
    // Process the speech
    await processUserSpeech(transcript);
  }

  // ✅ OPTIMIZED TRANSCRIPT PROCESSING
  async function processUserSpeech(transcript) {
    if (isGenerating || !transcript || transcript.trim().length < 2) return;

    const sttTotalTime = sttStartTime ? Date.now() - sttStartTime : 0;
    console.log(`✅ [Processing Speech] "${transcript}" (STT: ${sttTotalTime}ms)`);

    aiStartTime = Date.now();
    isGenerating = true;
    pauseSTT();

    // ✅ Send user message immediately
    ws.send(JSON.stringify({
      type: "user-message",
      text: transcript,
      conversation_id: conversationId,
    }));

    // ✅ Start TTS preparation
    ttsStartTime = Date.now();
    ws.send(JSON.stringify({
      type: "tts-start",
      message: "Generating response...",
    }));

    ws.send(JSON.stringify({ type: "bot-typing", status: true }));

    // ✅ Process with AI
    // ✅ Process with AI
    const aiResponse = await fetchDeepseekAIWithTTS(
      transcript,
      userId,
      conversationId,
      ws,
      ttsSocket,
      { 
        ttsChunksReceived, 
        totalTTSBytes, 
        ttsStreamStartTime,
        frontendChunksReceived,
        frontendChunksPlayed,
        backendChunksSent
      }
    );


    const aiTotalTime = Date.now() - aiStartTime;
    console.log(`🤖 [AI Complete] ${aiTotalTime}ms`);

    ws.send(JSON.stringify({
      type: "tts-end",
      message: "Response ready - playing audio",
    }));

    // ✅ Reset for next interaction
    setTimeout(() => {
      liveTranscriptBuffer = "";
      finalTranscriptBuffer = "";
      
      lastSpeechTime = 0;
      isGenerating = false;
      // resumeSTT();
      ws.send(JSON.stringify({ type: "bot-typing", status: false }));

      // Reset timing
      sttStartTime = null;
      aiStartTime = null;
      ttsStartTime = null;
      firstAIChunkTime = null;
      firstTTSChunkTime = null;
    }, 500); // ✅ Reduced delay
  }

   function shutdown(reason = "unknown") {
    console.log(
      `🛑 [Cleanup] Shutting down voice for user: ${userId}. Reason: ${reason}`
    );

    stopSendingSilence();
    clearInterval(keepAliveInterval);
    clearTimeout(speechEndTimeout);
    clearTimeout(aiTriggerTimeout); // ✅ ADD MISSING CLEANUP

    if (deepgramSocket?.readyState === WebSocket.OPEN || deepgramSocket?.readyState === WebSocket.CONNECTING) {
      deepgramSocket.terminate();
    }

    if (ttsSocket?.readyState === WebSocket.OPEN || ttsSocket?.readyState === WebSocket.CONNECTING) {
      ttsSocket.terminate();
    }

    if (ws?.readyState === WebSocket.OPEN || ws?.readyState === WebSocket.CONNECTING) {
      ws.close();
    }
  }



   deepgramSocket.on("open", () => {
    console.log("✅ [STT] Deepgram STT Connection opened");

    // ✅ IMPROVED KEEP-ALIVE - Send actual audio data to prevent timeout
    keepAliveInterval = setInterval(() => {
      if (deepgramSocket.readyState === WebSocket.OPEN) {
        // Send small silence frame to keep connection alive
        const silenceFrame = Buffer.alloc(320, 0); // 20ms of silence at 16kHz
        deepgramSocket.send(silenceFrame);
        console.log("🔄 [STT] Sent keep-alive silence frame");
      }
    }, 250); // ✅ Reduced from 8000ms to 5000ms

    isDGReady = true;

    while (audioQueue.length > 0) {
      deepgramSocket.send(audioQueue.shift());
    }
  });


 deepgramSocket.on("message", (msg) => {
    try {
      // ✅ IGNORE ALL STT MESSAGES WHEN PAUSED
      if (sttPaused || isGenerating) {
        console.log("🔇 [STT] Ignoring transcript - AI is responding");
        return;
      }

      const data = JSON.parse(msg.toString());
      const transcript = data.channel?.alternatives?.[0]?.transcript;

      if (transcript && transcript.trim() !== "") {
        if (!sttStartTime) sttStartTime = Date.now();
        console.log(`📝 [Live Transcript] ${transcript}`);

        
      // Only send if transcript changed
      if (transcript !== lastTranscriptSent) {
        ws.send(JSON.stringify({ 
          type: "transcript", 
          text: transcript,
          is_final: data.is_final || false
        }));
        lastTranscriptSent = transcript;
      }
        
        // ✅ ONLY ADD TO BUFFER IF IT'S FINAL - Prevents duplicates
        if (data.is_final) {
          transcriptBuffer += transcript + " ";
          console.log(`✅ [Final Transcript] ${transcriptBuffer.trim()}`);
          
          // Clear any existing timeout
          if (aiTriggerTimeout) clearTimeout(aiTriggerTimeout);
          
          // ✅ REDUCED timeout for faster response
          aiTriggerTimeout = setTimeout(() => {
            if (!isGenerating && !sttPaused && transcriptBuffer.trim()) {
              processCompleteTranscript(transcriptBuffer.trim());
                    // Clear buffer and last sent after processing
            transcriptBuffer = "";
            lastTranscriptSent = "";
            }
          }, 800);
        }
        
        // Send live transcript to frontend for display (interim results)
        // ws.send(JSON.stringify({ 
        //   type: "transcript", 
        //   text: transcript,
        //   is_final: data.is_final || false
        // }));
      }

      // ✅ IMPROVED VAD Detection for faster silence detection
      if (data.type === "Results" && data.channel?.alternatives?.[0]?.transcript === "") {
        // This indicates silence/pause
        if (transcriptBuffer.trim() && !isGenerating && !sttPaused) {
          if (aiTriggerTimeout) clearTimeout(aiTriggerTimeout);
          
          // ✅ MUCH FASTER silence detection
          aiTriggerTimeout = setTimeout(() => {
            if (!isGenerating && !sttPaused && transcriptBuffer.trim()) {
              processCompleteTranscript(transcriptBuffer.trim());
            }
          }, 600);
        }
      }

      // ✅ ADD SPEECH ACTIVITY DETECTION
      if (data.type === "SpeechStarted") {
        isUserSpeaking = true;
        lastSpeechTime = Date.now();
        if (aiTriggerTimeout) clearTimeout(aiTriggerTimeout);
      }

    } catch (err) {
      console.error("❌ [Parse Error]", err);
    }
  });



  deepgramSocket.on("error", (err) => {
    console.error("❌ [STT] Deepgram Error", err);
    ws.send(
      JSON.stringify({ type: "error", error: "Deepgram connection error" })
    );
    shutdown("deepgram error");
  });

  deepgramSocket.on("close", (code, reason) => {
    console.log(
      `🔌 [STT] Deepgram Connection closed. Code: ${code}, Reason: ${reason}`
    );
  });

 

ws.on("message", (data) => {
  // Try to handle both Buffer and string messages for maximum compatibility
  let parsed = null;
  let isJSON = false;

  // 1. Try to parse Buffer as JSON if possible
  if (Buffer.isBuffer(data)) {
    const asString = data.toString();
    if (asString.startsWith("{")) {
      try {
        parsed = JSON.parse(asString);
        isJSON = true;
        console.log("🔍 [Voice WS] Received JSON message (from Buffer):", parsed.type, parsed);
      } catch (e) {
        // Not JSON, treat as binary audio
        isJSON = false;
      }
    }
  } else if (typeof data === "string") {
    try {
      parsed = JSON.parse(data);
      isJSON = true;
      console.log("🔍 [Voice WS] Received message (string):", parsed.type, parsed);
    } catch (e) {
      isJSON = false;
    }
  }

  // 2. If JSON, handle control messages
  if (isJSON && parsed) {
    if (parsed.type === "stop-voice") {
      console.log("🛑 [Voice] stop-voice received from client");
      shutdown("stop-voice from client");
      return;
    }

    // ✅ TRACK FRONTEND AUDIO CHUNKS
    if (parsed.type === "audio-chunk-received") {
      frontendChunksReceived++;
      console.log(`📥 [Frontend] Received chunk #${parsed.chunk_number} (${frontendChunksReceived}/${ttsChunksReceived})`);
      return;
    }

    if (parsed.type === "audio-chunk-played") {
      frontendChunksPlayed++;
      console.log(`🔊 [Frontend] Played chunk #${parsed.chunk_number} (${frontendChunksPlayed}/${ttsChunksReceived})`);
      return;
    }

    // ✅ HANDLE FRONTEND AUDIO STATE MESSAGES
    if (parsed.type === "audio-playback-started") {
      console.log("🔊 [Frontend] Audio playback started - keeping STT paused");
      if (!sttPaused) {
        pauseSTT();
      }
      return;
    }

    if (parsed.type === "audio-playback-ended") {
  console.log(`🔊 [Frontend] Audio playback ended - resuming STT`);
  console.log(`📊 [Audio Stats] Backend sent: ${ttsChunksReceived}, Frontend received: ${frontendChunksReceived}, Frontend played: ${frontendChunksPlayed}`);
  // Reset counters for next interaction
  frontendChunksReceived = 0;
  frontendChunksPlayed = 0;
  ttsChunksReceived = 0;
  totalTTSBytes = 0;
  // Resume STT immediately, regardless of isGenerating
  if (sttPaused) {
    resumeSTT();
  }
  return;
}


    // ✅ ADD MANUAL TRIGGER FOR PROCESSING
    if (parsed.type === "force-process" && transcriptBuffer.trim()) {
      if (aiTriggerTimeout) clearTimeout(aiTriggerTimeout);
      processCompleteTranscript(transcriptBuffer.trim());
      return;
    }
    return; // Don't fall through to audio processing
  }

  // 3. If not JSON, treat as audio
  if (Buffer.isBuffer(data) && !isGenerating && !sttPaused) {
    if (isDGReady && deepgramSocket.readyState === WebSocket.OPEN) {
      deepgramSocket.send(data);
    } else {
      audioQueue.push(data);
    }
  } else if (Buffer.isBuffer(data) && (isGenerating || sttPaused)) {
    console.log("🔇 [Audio] Dropping audio chunk - AI is responding");
  }
});



  ws.on("close", () => {
    console.log(`🔌 [Voice] Client WebSocket closed`);
    shutdown("client websocket close");
  });
};
// ✅ Add this new function for processing live transcript

// ✅ NEW FUNCTION: Enhanced fetchDeepseekAI with TTS streaming
const fetchDeepseekAIWithTTS = async (
  userMessage,
  userId,
  conversationId = null,
  ws = null,
  ttsSocket = null,
  ttsMetrics = null // Add TTS metrics parameter
) => {
  try {
    console.log(
      "🚀 [Voice AI + TTS] Processing message for user:",
      userId,
      "conversation:",
      conversationId
    );

    // ✅ STRICT USER VALIDATION (keep existing validation code)
    if (!userId || isNaN(userId)) {
      console.error("❌ Invalid user_id in fetchDeepseekAI:", userId);
      if (ws) {
        ws.send(
          JSON.stringify({ type: "error", error: "Invalid user session" })
        );
      }
      return "Authentication error occurred.";
    }

    // ✅ VERIFY CONVERSATION OWNERSHIP (existing validation code)
    if (conversationId && !isNaN(conversationId)) {
      const ownershipCheck = await executeQuery(
        "SELECT id FROM conversations WHERE id = ? AND user_id = ? AND is_deleted = FALSE",
        [conversationId, userId]
      );

      if (!ownershipCheck || ownershipCheck.length === 0) {
        console.warn(
          "⚠️ Provided conversation invalid or not owned. Trying fallback..."
        );
        const latest = await executeQuery(
          `SELECT id FROM conversations WHERE user_id = ? AND is_deleted = FALSE ORDER BY updated_at DESC LIMIT 1`,
          [userId]
        );

        if (latest && latest.length > 0) {
          conversationId = latest[0].id;
          console.log(
            "✅ Fallback to latest active conversation:",
            conversationId
          );
        } else {
          console.error("❌ No valid conversation found and none provided.");
          if (ws) {
            ws.send(
              JSON.stringify({ type: "error", error: "No conversation found." })
            );
          }
          return "No conversation context is available.";
        }
      }
    }

    // 🧠 GET USER INFO FOR PERSONALIZED RESPONSES (existing code)

    // ⚡ Get context immediately (existing code)
    // ✅ Get context immediately
    // ✅ PARALLEL PROCESSING: Get context and user info simultaneously
      const parallelStart = Date.now();
    const [contextResult, userInfoResult] = await Promise.allSettled([
      Promise.race([
        getConversationContextOptimized(conversationId, userId),
        new Promise((resolve) =>
          setTimeout(
            () =>
              resolve({
                summaryContext: "",
                shouldRename: false,
                newConversationName: null,
              }),
            50 // ✅ REDUCED from 100ms to 50ms
          )
        ),
      ]),
      Promise.race([
        executeQuery("SELECT username FROM users WHERE id = ?", [userId]),
        new Promise((resolve) => setTimeout(() => resolve([]), 25)), // ✅ REDUCED from 50ms to 25ms
      ]),
    ]);

    const { summaryContext, shouldRename, newConversationName } =
      contextResult.status === "fulfilled"
        ? contextResult.value
        : {
            summaryContext: "",
            shouldRename: false,
            newConversationName: null,
          };
 // ✅ ADD THIS CHECK FOR RENAME LOGIC
    let actualShouldRename = shouldRename;
    
    // Check if conversation needs renaming (if it's "New Conversation")
    if (!actualShouldRename) {
      actualShouldRename = true; // ✅ Always attempt rename for new conversations
      console.log("✅ Will check rename in background");
    }

    const userInfo =
      userInfoResult.status === "fulfilled" && userInfoResult.value?.length > 0
        ? { username: userInfoResult.value[0].username }
        : null;

    const parallelTime = Date.now() - parallelStart;
    console.log(
      `⚡ [Parallel Processing] Context + User info loaded in ${parallelTime}ms`
    );

    // ✅ Build AI messages
    const finalMessages = buildAIMessages(
      summaryContext,
      userMessage,
      userInfo
    );
 
   // ✅ REPLACE the existing timing variables section with:
   // ✅ REPLACE the existing timing variables section with:
let aiResponse = "";
const aiStartTime = Date.now();

// ✅ EXTRACT VARIABLES FROM ttsMetrics
let ttsStreamStartTime = ttsMetrics?.ttsStreamStartTime || null;
let firstTTSChunkTime = null;
let ttsChunksReceived = ttsMetrics?.ttsChunksReceived || 0;
let totalTTSBytes = ttsMetrics?.totalTTSBytes || 0;
let frontendChunksReceived = ttsMetrics?.frontendChunksReceived || 0;
let frontendChunksPlayed = ttsMetrics?.frontendChunksPlayed || 0;
let backendChunksSent = ttsMetrics?.backendChunksSent || 0;
let ttsStartTime = Date.now(); // ✅ ADD THIS LINE


    try {
      const stream = await deepseek.chat.completions.create({
        model: "deepseek-chat",
        messages: finalMessages,
        temperature: 0.5, // ✅ Lower for faster, more focused responses
        max_tokens: 300, // ✅ Shorter for speed
        stream: true,
        top_p: 0.7, // ✅ Faster token selection
        frequency_penalty: 0.3, // ✅ Reduce repetition
        presence_penalty: 0.3, // ✅ Keep responses concise
        stream_options: { include_usage: false }, // ✅ DISABLE usage stats for speed
      });

      // ✅ AUDIO-FIRST APPROACH: Start TTS immediately, delay text
      if (ws) {
        // ✅ Start TTS immediately
        ws.send(
          JSON.stringify({
            type: "tts-start",
            message: "Starting audio generation...",
          })
        );

        ws.send(
          JSON.stringify({
            type: "start",
            conversation_id: conversationId,
            conversation_name: shouldRename
              ? "Generating title..."
              : newConversationName,
            conversation_renamed: shouldRename,
            context: {
              conversation_context_available: !!summaryContext,
            },
            processing_time: Date.now() - aiStartTime,
          })
        );
      }

      console.log(
        `🚀 Voice AI stream started in ${Date.now() - aiStartTime}ms`
      );

      // ✅ IMPROVED: Buffer text for sentence-based processing only
      let displayBuffer = "";
      let sentenceBuffer = ""; // ✅ For sentence-based chunking
      const TEXT_DISPLAY_DELAY = 20;

      let textDisplayTimeout = null;
      let isFirstChunk = true;
      let chunkCount = 0;
      let ttsChunkCount = 0; // ✅ NEW: Track TTS chunks

      // ✅ NEW: Start TTS immediately when we have any meaningful content
      let ttsStarted = false;
      let firstMeaningfulWord = false;

      // ✅ Stream the response chunks with BATCHED TTS sending

      let wordCount = 0;
      

   

for await (const chunk of stream) {
  const content = chunk.choices[0]?.delta?.content || "";
  if (content) {
    chunkCount++;
    
    if (!firstAIChunkTime) {
      firstAIChunkTime = Date.now();
      console.log(`🤖 [AI First Chunk] Generated in ${firstAIChunkTime - aiStartTime}ms`);
    }

    aiResponse += content;
    sentenceBuffer += content;

    // ✅ IMMEDIATE SENTENCE DETECTION WITH CHUNKING
    const shouldSendTTS = detectCompleteSentenceImmediate(sentenceBuffer.trim());

    if (shouldSendTTS && ttsSocket && ttsSocket.readyState === WebSocket.OPEN) {
      let cleanText = cleanMarkdownForTTS(sentenceBuffer.trim());
      
      if (cleanText.length > 3) {
        // ✅ CHUNK LARGE SENTENCES TO PREVENT DELAYS
        const chunks = chunkLargeSentence(cleanText);
        
        for (const textChunk of chunks) {
          ttsChunkCount++;
          
          console.log(`🔊 [TTS Send #${ttsChunkCount}] Sending: "${textChunk}"`);
          
          try {
            // ✅ SEND TO TTS IMMEDIATELY
            ttsSocket.send(JSON.stringify({
              type: "Speak",
              text: textChunk,
              model_options: {
                speed: 1.8,
                pitch: 0.0,
                emphasis: 0.0,
              },
            }));
            
            // ✅ FLUSH MORE FREQUENTLY FOR FASTER AUDIO
            if (ttsChunkCount % 2 === 0) {
              ttsSocket.send(JSON.stringify({ type: "Flush" }));
              console.log(`🔊 [TTS Batch Flush #${Math.floor(ttsChunkCount/2)}]`);
            }
            
            if (!firstTTSChunkTime) {
              firstTTSChunkTime = Date.now();
              console.log(`🔊 [TTS First] Sent in ${firstTTSChunkTime - ttsStartTime}ms`);
            }
            
          } catch (ttsError) {
            console.error("❌ [TTS Send Error]:", ttsError.message);
          }
        }
        
        sentenceBuffer = ""; // ✅ RESET BUFFER IMMEDIATELY
      }
    }

    // ✅ Send text to frontend immediately
    if (ws) {
      ws.send(JSON.stringify({
        type: "content",
        content: content,
      }));
    }
  }
}

// ✅ SEND FINAL SENTENCE + FINAL FLUSH
if (sentenceBuffer.trim().length > 0 && ttsSocket && ttsSocket.readyState === WebSocket.OPEN) {
  let finalText = cleanMarkdownForTTS(sentenceBuffer.trim());
  if (finalText.length > 3) {
    // ✅ CHUNK FINAL SENTENCE TOO
    const finalChunks = chunkLargeSentence(finalText);
    
    for (const textChunk of finalChunks) {
      ttsChunkCount++;
      console.log(`🔊 [TTS Final #${ttsChunkCount}] Sending: "${textChunk}"`);
      
      try {
        ttsSocket.send(JSON.stringify({
          type: "Speak",
          text: textChunk,
          model_options: {
            speed: 1.8,
            pitch: 0.0,
            emphasis: 0.0,
          },
        }));
      } catch (error) {
        console.error("❌ [TTS Final Error]:", error.message);
      }
    }
  
    // ✅ FINAL FLUSH ONLY
    ttsSocket.send(JSON.stringify({ type: "Flush" }));
    console.log(`🔊 [TTS Final] Final flush completed`);
  }
}



      // ✅ Function to display text after audio starts
      function startDisplayingText() {
        if (!ws) return;

        let displayedLength = 0;
        const words = displayBuffer.split(" ");

        const displayInterval = setInterval(() => {
          if (displayedLength >= words.length) {
            clearInterval(displayInterval);
            return;
          }

          // Display 2-3 words at a time for smooth text appearance
          const wordsToShow = words.slice(0, displayedLength + 2).join(" ");

          ws.send(
            JSON.stringify({
              type: "content",
              content:
                words.slice(displayedLength, displayedLength + 2).join(" ") +
                " ",
            })
          );

          displayedLength += 2;
        }, 200); // Show text every 200ms for smooth appearance
      }

      console.log(`🤖 [AI Complete Response] ${aiResponse}`);

      // ✅ Send final data after a delay to ensure audio is prioritized
      // setTimeout(() => {
      if (ws) {
        ws.send(
          JSON.stringify({
            type: "end",
            full_response: aiResponse,
            context: {
              conversation_context_available: !!summaryContext,
            },
            total_processing_time: Date.now() - aiStartTime,
          })
        );

        // ✅ IMMEDIATE TTS end signal - no setTimeout
        ws.send(
          JSON.stringify({
            type: "tts-end",
            message: "Audio generation completed",
          })
        );
      }
      // }, 500);

      // 🚀 HANDLE RENAME RESULT (existing code)
      let finalConversationName = newConversationName;
      if (shouldRename) {
        try {
          const renameResult = await executeRename(
            conversationId,
            userMessage,
            userId
          );
          if (renameResult.success) {
            finalConversationName = renameResult.title;
            if (ws) {
              ws.send(
                JSON.stringify({
                  type: "conversation_renamed",
                  conversation_id: conversationId,
                  new_name: finalConversationName,
                  success: true,
                })
              );
            }
          }
        } catch (renameError) {
          console.error("❌ Rename failed:", renameError);
        }
      }

            setImmediate(async () => {
        console.log(`🔄 [Background] Starting parallel background tasks`);
        const backgroundStartTime = Date.now();

        try {
          // ✅ SAVE TO DATABASE FIRST (synchronous)
          await saveToDatabase(
            conversationId,
            userMessage,
            aiResponse,
            [],
            null,
            [],
            [],
            []
          );
          console.log("✅ Database saved successfully");

          // ✅ SMART RENAME CHECK - Only rename if actually needed
          if (conversationId) {
            try {
              const convCheck = await executeQuery(
                "SELECT name FROM conversations WHERE id = ? AND user_id = ?",
                [conversationId, userId]
              );
              
              if (convCheck && convCheck.length > 0) {
                const currentName = convCheck[0].name;
                if (currentName === "New Conversation" || currentName === "New Chat" || !currentName) {
                  const renameResult = await executeRename(conversationId, userMessage, userId);
                  if (renameResult.success && ws) {
                    ws.send(JSON.stringify({
                      type: "conversation_renamed",
                      conversation_id: conversationId,
                      new_name: renameResult.title,
                      success: true,
                    }));
                    console.log(`✅ Conversation renamed to: "${renameResult.title}"`);
                  }
                }
              }
            } catch (renameError) {
              console.error("❌ Rename failed:", renameError);
            }
          }

          // ✅ GENERATE SUMMARY (lowest priority)
          generateAndSaveComprehensiveSummary(
            conversationId,
            userMessage,
            aiResponse,
            ""
          ).catch(err => console.error("❌ Summary generation failed:", err));

          const backgroundTime = Date.now() - backgroundStartTime;
          console.log(`✅ [Background] Core tasks completed in ${backgroundTime}ms`);
          
        } catch (error) {
          console.error("❌ Background tasks failed:", error);
        }
      });


      // REPLACE WITH:
      // ✅ DETAILED PERFORMANCE LOGGING
// ✅ FIXED PERFORMANCE LOGGING
// ✅ ENHANCED PERFORMANCE LOGGING WITH TRACKING
const totalProcessingTime = Date.now() - aiStartTime;
const sttToAI = aiStartTime && sttStartTime ? aiStartTime - sttStartTime : 0;
const aiFirstChunkLatency = firstAIChunkTime && aiStartTime ? firstAIChunkTime - aiStartTime : 0;
const ttsFirstLatency = firstTTSChunkTime && ttsStartTime ? firstTTSChunkTime - ttsStartTime : 0;
const ttsFirstAudio = ttsStreamStartTime && ttsStartTime && ttsStreamStartTime > ttsStartTime 
  ? ttsStreamStartTime - ttsStartTime 
  : 0;

console.log(`📊 [PERFORMANCE BREAKDOWN]`);
console.log(`   🎤 STT → AI: ${sttToAI}ms`);
console.log(`   🤖 AI First Chunk: ${aiFirstChunkLatency}ms`);
console.log(`   🔊 TTS First Send: ${ttsFirstLatency}ms`);
console.log(`   🔊 TTS First Audio: ${ttsFirstAudio}ms`);
console.log(`   ⚡ Total Processing: ${totalProcessingTime}ms`);
console.log(`   📊 AI Chunks: ${chunkCount} | TTS Sentences: ${ttsChunkCount || 0}`);
console.log(`   📈 Backend Audio Chunks: ${ttsChunksReceived} (${(totalTTSBytes / 1024).toFixed(1)}KB)`);
console.log(`   📥 Frontend Received: ${frontendChunksReceived} | Played: ${frontendChunksPlayed}`);
console.log(`   📊 Sync Status: ${frontendChunksReceived === ttsChunksReceived ? '✅ Synced' : '⚠️ Out of sync'}`);

if (ttsChunkCount > 0 && ttsFirstAudio > 0) {
  console.log(`   🚀 Avg TTS Latency: ${Math.round(ttsFirstAudio / ttsChunkCount)}ms per sentence`);
}

// ✅ SEND FINAL STATS TO FRONTEND
if (ws && ws.readyState === WebSocket.OPEN) {
  ws.send(JSON.stringify({
    type: "performance-stats",
    stats: {
      stt_to_ai: sttToAI,
      ai_first_chunk: aiFirstChunkLatency,
      tts_first_send: ttsFirstLatency,
      tts_first_audio: ttsFirstAudio,
      total_processing: totalProcessingTime,
      backend_chunks_sent: ttsChunksReceived,
      frontend_chunks_received: frontendChunksReceived,
      frontend_chunks_played: frontendChunksPlayed,
      sync_status: frontendChunksReceived === ttsChunksReceived
    }
  }));
}



// ✅ Add streaming performance metrics
const streamingEfficiency =
  firstTTSChunkTime && aiStartTime
    ? ((firstTTSChunkTime - aiStartTime) / 1000).toFixed(2)
    : "N/A";
console.log(
  `   🚀 End-to-End Latency: ${streamingEfficiency}s (AI start → First audio)`
);

      // ✅ ADD THE TTS STREAMING SUMMARY RIGHT HERE:
      // ✅ TTS Streaming Performance Summary
      if (ttsMetrics && ttsMetrics.ttsChunksReceived > 0) {
        const { ttsChunksReceived, totalTTSBytes, ttsStreamStartTime } =
          ttsMetrics;
        const avgTTSChunkSize = Math.round(totalTTSBytes / ttsChunksReceived);
        const ttsStreamDuration = ttsStreamStartTime
          ? ((Date.now() - ttsStreamStartTime) / 1000).toFixed(2)
          : "N/A";

        console.log(`🔊 [TTS STREAMING SUMMARY]`);
        console.log(`   📦 Audio Chunks: ${ttsChunksReceived}`);
        console.log(
          `   📊 Total Audio: ${(totalTTSBytes / 1024).toFixed(1)}KB`
        );
        console.log(`   📈 Avg Chunk Size: ${avgTTSChunkSize} bytes`);
        console.log(`   ⏱️ Stream Duration: ${ttsStreamDuration}s`);
        console.log(
          `   🚀 Streaming Rate: ${
            ttsChunksReceived > 0
              ? Math.round(ttsChunksReceived / parseFloat(ttsStreamDuration))
              : 0
          } chunks/sec`
        );
      }

      return aiResponse;
    } catch (aiError) {
      console.error("❌ Voice AI API error:", aiError);
      if (ws) {
        ws.send(
          JSON.stringify({
            type: "error",
            error:
              "I'm having trouble processing your request. Please try again.",
          })
        );
      }
      return "I'm having trouble processing your request. Please try again.";
    }
  } catch (error) {
    console.error("❌ fetchDeepseekAIWithTTS error:", error.message);
    if (ws) {
      ws.send(
        JSON.stringify({
          type: "error",
          error: "Internal server error occurred.",
        })
      );
    }
    return "An error occurred while processing your request.";
  }
};

// ✅ IMMEDIATE SENTENCE DETECTION for instant TTS
// ✅ IMMEDIATE SENTENCE DETECTION for instant TTS
// ✅ OPTIMIZED SENTENCE DETECTION - Prevents long delays
function detectCompleteSentenceImmediate(text) {
  if (!text || text.length < 3) return false;
  
  const words = text.trim().split(/\s+/);
  const wordCount = words.length;
  
  // ✅ IMMEDIATE SENTENCE ENDINGS
  if (/[.!?]+(\s|$)/.test(text)) {
    return true;
  }
  
  // ✅ FASTER TRIGGERS - Send after just 3 words for common patterns
  if (wordCount >= 3 && /^(Hi|Hello|I'm|My name|Yes|No|Sure|Of course|Thank you|You're welcome)\b/i.test(text.trim())) {
    return true;
  }
  
  // ✅ NATURAL PAUSES - comma detection
  if (wordCount >= 4 && /,\s+(and|but|however|therefore|also|then|now|so)\s+\w+/i.test(text)) {
    return true;
  }
  
  // ✅ PREVENT LONG DELAYS - Force break at 8 words
  if (wordCount >= 8) {
    return true;
  }
  
  // ✅ CHARACTER LIMIT - Prevent extremely long sentences
  if (text.length >= 100) {
    return true;
  }
  
  return false;
}


// ✅ CLEAN MARKDOWN FOR TTS - Remove formatting for natural speech
function cleanMarkdownForTTS(text) {
  if (!text) return "";
  
  return text
    .replace(/\*\*(.*?)\*\*/g, '$1') // Remove bold **text**
    .replace(/\*(.*?)\*/g, '$1')     // Remove italic *text*
    .replace(/`(.*?)`/g, '$1')       // Remove code `text`
    .replace(/\[(.*?)\]\(.*?\)/g, '$1') // Remove links [text](url)
    .replace(/#{1,6}\s*/g, '')       // Remove headers
    .replace(/^\s*[-*+]\s*/gm, '')   // Remove list markers
    .replace(/^\s*\d+\.\s*/gm, '')   // Remove numbered lists
    .replace(/\s+/g, ' ')            // Normalize whitespace
    .trim();
}

// ✅ NEW FUNCTION: Chunk large sentences to prevent TTS delays
function chunkLargeSentence(text, maxLength = 80) {
  if (!text || text.length <= maxLength) {
    return [text];
  }
  const chunks = [];
  let i = 0;
  while (i < text.length) {
    chunks.push(text.slice(i, i + maxLength));
    i += maxLength;
  }
  console.log(`📝 [Chunking] Split "${text.substring(0, 50)}..." into ${chunks.length} equal chunks`);
  return chunks;
}





// 🏷️ EXECUTE RENAME WITH USER VALIDATION AND AI TITLE GENERATION (from chatController)
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

// 🤖 GENERATE AI TITLE BASED ON USER MESSAGE (from chatController)
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

// 🚀 OPTIMIZED BACKGROUND TASKS WITH USER VALIDATION (from chatController)
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
    console.log(
      "🔄 Starting optimized background tasks for conversation:",
      conversation_id,
      "user:",
      user_id
    );

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
          [
            user_id,
            newConversationName ||
              userMessage?.substring(0, 20) ||
              "Voice Chat",
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

    // 🚀 STEP 2: Parallel background operations with timeout
    const backgroundTasks = [
      // Save to database
      Promise.race([
        saveToDatabase(
          conversation_id,
          userMessage,
          aiResponse,
          uploadedFiles,
          extracted_summary,
          suggestions,
          processedUrls,
          urlData
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

      // Generate comprehensive summary
      Promise.race([
        generateAndSaveComprehensiveSummary(
          conversation_id,
          userMessage,
          aiResponse,
          urlContent
        ),
        new Promise((resolve) =>
          setTimeout(() => resolve({ timeout: true }), 8000)
        ),
      ]),
    ];

    const [dbResult, renameResult, summaryResult] = await Promise.allSettled(
      backgroundTasks
    );

    console.log("✅ Optimized background tasks completed:", {
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
      conversation_id: conversation_id,
      user_id: user_id,
    });
  } catch (error) {
    console.error("❌ Optimized background tasks failed:", error);
  }
}

// 🚀 SAVE TO DATABASE (from chatController)
async function saveToDatabase(
  conversation_id,
  userMessage,
  aiResponse,
  uploadedFiles = [],
  extracted_summary = null,
  suggestions = [],
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
    const urlsString =
      processedUrls.length > 0 ? processedUrls.join(",") : null;

    const urlContentString =
      urlData.length > 0
        ? urlData
            .filter((data) => data && data.content && !data.error)
            .map((data) => `[${data.title || "Untitled"}] ${data.content}`)
            .join("\n---\n")
        : null;

    const urlMetadata =
      urlData.length > 0
        ? JSON.stringify(
            urlData.map((data) => ({
              url: data?.url || "",
              title: data?.title || "Untitled",
              description: data?.description || "",
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

    console.log(
      "✅ Database save successful for conversation:",
      conversation_id
    );
    return true;
  } catch (error) {
    console.error("❌ Database save error:", error);
    throw error;
  }
}

// 🧠 GENERATE COMPREHENSIVE SUMMARY (from chatController)
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

    // Get ENTIRE conversation history
    const fullHistory = await executeQuery(
      "SELECT user_message, response, url_content, extracted_text FROM chat_history WHERE conversation_id = ? ORDER BY created_at ASC",
      [conversation_id]
    );

    // Build complete conversation
    const completeConversation = [];

    fullHistory.forEach((chat) => {
      if (chat.user_message) {
        let userContent = chat.user_message;

        if (chat.url_content) {
          userContent += `\n[URL Context: ${chat.url_content.substring(
            0,
            1000
          )}]`;
        }

        if (chat.extracted_text) {
          userContent += `\n[Document Context: ${chat.extracted_text.substring(
            0,
            500
          )}]`;
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

    // Add current exchange
    let currentUserContent = currentUserMessage;
    if (urlContent) {
      currentUserContent += `\n[Current URL Context: ${urlContent.substring(
        0,
        1000
      )}]`;
    }

    completeConversation.push({ role: "user", content: currentUserContent });
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

    const summaryPrompt = [
      {
        role: "system",
        content: `Create a concise summary of this voice conversation for future context. Focus on:

  1. Main topics discussed
  2. User's key questions and needs
  3. Important context for future voice interactions
  4. User's communication preferences

  Keep it brief but informative (100-200 words max) since this is for voice mode context.`,
      },
      {
        role: "user",
        content: `Voice conversation to summarize:\n${conversationText.substring(
          0,
          8000
        )}`, // Reduced from 12000
      },
    ];

    const summaryResult = await deepseek.chat.completions.create({
      model: "deepseek-chat",
      messages: summaryPrompt,
      temperature: 0.2,
      max_tokens: 300, // Reduced from 500 for more concise summaries
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
      const basicSummary = `User discussed: ${currentUserMessage.substring(
        0,
        200
      )}${
        currentUserMessage.length > 200 ? "..." : ""
      }. AI provided assistance with this topic.${
        urlContent ? " URLs were referenced in the conversation." : ""
      }`;

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

module.exports = {
  handleFinalUpload,
  handleLiveVoiceMessage,

  fetchDeepseekAIWithTTS,
  handleDictateMode,
};
