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
       LIMIT 5`,
      [conversation_id, user_id]
    );

    let summaryContext = "";
    let shouldRename = false;
    let newConversationName = null;

    if (results && results.length > 0) {
      const conversationName = results[0]?.conversation_name;

      if (conversationName === "New Conversation" || 
          conversationName === "New Chat" || 
          !conversationName) {
        shouldRename = true;
      }

      const latestSummary = results.find(r => r.summarized_chat)?.summarized_chat;
      
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

 
// 🧠 BUILD AI MESSAGES FOR VOICE MODE - Optimized for short, conversational responses
// 🧠 BUILD AI MESSAGES FOR VOICE MODE - Optimized for short, conversational responses
function buildAIMessages(summaryContext, userMessage, userInfo = null) {
  const currentDate = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  // Build user context for personalized responses (more natural approach)
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
- Keep responses SHORT and CONVERSATIONAL (3-4 sentences maximum)
- Speak naturally and warmly, like a helpful friend
- Be direct but friendly - get to the point quickly
- Use a casual, approachable tone
- Avoid repetitive name usage - only use names when it feels natural
- If complex topics need detailed answers, offer briefly: "Want me to dive deeper into that?"
- Sound human and relatable, not robotic

When asked your name: "I'm QhashAI, built by the QuantumHash team."
For complex requests: Give a concise answer first, then ask if they want more details.

Remember: This is a friendly voice conversation - keep it natural, warm, and brief!`,
  };

  const finalMessages = [systemPrompt];

  // Add conversation context if available (but keep it concise for voice)
  if (summaryContext) {
    finalMessages.push({
      role: "system",
      content: `CONVERSATION CONTEXT: ${summaryContext.substring(0, 500)}`, // Limit context for voice mode
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
      const silenceFrame = Buffer.alloc(320);
      socket.send(silenceFrame);
    }
  }, 200);
};

const stopSendingSilence = () => {
  if (silenceInterval) {
    clearInterval(silenceInterval);
    silenceInterval = null;
  }
};

const handleLiveVoiceMessage = async (ws, userId, conversationId) => {
  console.log(`🎤 [Voice] Starting live session for user: ${userId}, conversation: ${conversationId}`);

  // ✅ VERIFY CONVERSATION OWNERSHIP IF PROVIDED (like chatController.js)
  if (conversationId && !isNaN(conversationId)) {
    const ownershipCheck = await executeQuery(
      "SELECT id FROM conversations WHERE id = ? AND user_id = ? AND is_deleted = FALSE",
      [conversationId, userId]
    );

    if (!ownershipCheck || ownershipCheck.length === 0) {
      console.warn("⚠️ Provided conversation invalid or not owned. Trying fallback...");
      
      // Try fallback to latest conversation (like chatController.js)
      const latest = await executeQuery(
        `SELECT id FROM conversations WHERE user_id = ? AND is_deleted = FALSE ORDER BY updated_at DESC LIMIT 1`,
        [userId]
      );

      if (latest && latest.length > 0) {
        conversationId = latest[0].id;
        console.log("✅ Fallback to latest active conversation:", conversationId);
      } else {
        console.error("❌ No valid conversation found and none provided.");
        ws.send(JSON.stringify({ type: "error", error: "No conversation found." }));
        return;
      }
    } else {
      console.log(`✅ Using provided conversation ID: ${conversationId}`);
    }
  } else {
    // ✅ NO CONVERSATION PROVIDED - Use empty conversation logic (like chatController.js createConversation)
    console.log("🔍 No conversation provided, checking for empty conversations...");
    
    const recentConversations = await executeQuery(
      `SELECT id, name FROM conversations 
       WHERE user_id = ? AND is_deleted = FALSE
       ORDER BY created_at DESC 
       LIMIT 1`,
      [userId]
    );

    console.log("🔍 Recent conversations for user", userId, ":", recentConversations);

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
        console.log("🔄 Reused empty conversation:", conversationId, "for user:", userId);
      } else {
        // Create new conversation if recent one has messages
        const newConversationResult = await executeQuery(
          "INSERT INTO conversations (user_id, name) VALUES (?, ?)",
          [userId, 'New Conversation']
        );
        conversationId = newConversationResult.insertId;
        console.log("🆕 Created new conversation:", conversationId, "for user:", userId);
      }
    } else {
      // No conversations exist, create new one
      const newConversationResult = await executeQuery(
        "INSERT INTO conversations (user_id, name) VALUES (?, ?)",
        [userId, 'New Conversation']
      );
      conversationId = newConversationResult.insertId;
      console.log("🆕 Created first conversation:", conversationId, "for user:", userId);
    }
  }

  // ✅ Initialize Deepgram STT WebSocket
  const deepgramSocket = new WebSocket(
    "wss://api.deepgram.com/v1/listen?model=nova-3&language=en-US&punctuate=true&smart_format=true&vad_events=true&interim_results=false&encoding=linear16&sample_rate=16000",
    {
      headers: {
        Authorization: `Token ${process.env.DEEPGRAM_API_KEY}`,
      },
    }
  );

  // ✅ Initialize Deepgram TTS WebSocket for streaming audio
  let ttsSocket = null;
  let isTTSReady = false;

  const initializeTTSSocket = () => {
    ttsSocket = new WebSocket(
      "wss://api.deepgram.com/v1/speak?model=aura-asteria-en&encoding=linear16&sample_rate=24000",
      {
        headers: {
          Authorization: `Token ${process.env.DEEPGRAM_API_KEY}`,
        },
      }
    );

    ttsSocket.on("open", () => {
      console.log("✅ [TTS] Deepgram TTS WebSocket opened");
      isTTSReady = true;
    });

    ttsSocket.on("message", (data) => {
      try {
        // Check if it's JSON metadata or binary audio
        const message = JSON.parse(data.toString());
        
        if (message.type === "Results") {
          console.log("📊 [TTS] Metadata received:", message);
        }
      } catch (e) {
        // It's binary audio data - stream to frontend
        console.log(`🔊 [TTS] Streaming audio chunk: ${data.length} bytes`);
        
        // Send audio chunk to frontend
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({
            type: "tts-audio-chunk",
            audio: data.toString('base64'), // Convert to base64 for JSON transport
            encoding: "linear16",
            sample_rate: 24000
          }));
        }
      }
    });

    ttsSocket.on("close", () => {
      console.log("🔌 [TTS] TTS WebSocket closed");
      isTTSReady = false;
    });

    ttsSocket.on("error", (err) => {
      console.error("❌ [TTS] TTS WebSocket error:", err);
      isTTSReady = false;
    });
  };

  // Initialize TTS socket
  initializeTTSSocket();

  let isDGReady = false;
  let isGenerating = false;
  let transcriptBuffer = "";
  const audioQueue = [];
  let aiTriggerTimeout = null;
  let keepAliveInterval = null;

  const TRIGGER_DELAY = 2500;

  function shutdown(reason = 'unknown') {
    console.log(`🛑 [Cleanup] Shutting down voice for user: ${userId}. Reason: ${reason}`);

    stopSendingSilence();
    clearInterval(keepAliveInterval);
    clearTimeout(aiTriggerTimeout);

    if (deepgramSocket?.readyState === WebSocket.OPEN || deepgramSocket?.readyState === WebSocket.CONNECTING) {
      deepgramSocket.terminate();
      console.log("💥 Deepgram STT terminated");
    }

    // ✅ Close TTS socket
    if (ttsSocket?.readyState === WebSocket.OPEN || ttsSocket?.readyState === WebSocket.CONNECTING) {
      ttsSocket.terminate();
      console.log("💥 Deepgram TTS terminated");
    }

    if (ws?.readyState === WebSocket.OPEN || ws?.readyState === WebSocket.CONNECTING) {
      ws.close();
      console.log("🔌 Client WebSocket closed");
    }
  }

  deepgramSocket.on("open", () => {
    console.log("✅ [STT] Deepgram STT Connection opened");

    keepAliveInterval = setInterval(() => {
      if (deepgramSocket.readyState === WebSocket.OPEN) {
        deepgramSocket.ping();
      }
    }, 10000);

    isDGReady = true;

    while (audioQueue.length > 0) {
      deepgramSocket.send(audioQueue.shift());
    }
  });

  deepgramSocket.on("message", (msg) => {
    try {
      const data = JSON.parse(msg.toString());
      const transcript = data.channel?.alternatives?.[0]?.transcript;

      if (transcript && transcript.trim() !== "") {
        console.log(`📝 [Live Transcript] ${transcript}`);
        transcriptBuffer += transcript + " ";
        
        // Send live transcript to frontend
        ws.send(JSON.stringify({ type: "transcript", text: transcript }));

        if (data.is_final) {
          if (aiTriggerTimeout) clearTimeout(aiTriggerTimeout);

          aiTriggerTimeout = setTimeout(async () => {
            if (isGenerating) return;

            const finalText = transcriptBuffer.trim();
            if (!finalText) return;

            console.log(`✅ [Final Transcript] ${finalText}`);
            isGenerating = true;

            // 🚀 Send user message to frontend
            ws.send(JSON.stringify({
              type: "user-message",
              text: finalText,
              conversation_id: conversationId,
            }));

            ws.send(JSON.stringify({ type: "bot-typing", status: true }));
            startSendingSilence(deepgramSocket);

            // ✅ Signal TTS start to frontend
            ws.send(JSON.stringify({ 
              type: "tts-start",
              message: "Starting audio generation..."
            }));

            // 🚀 Call enhanced fetchDeepseekAI with TTS streaming
            const aiResponse = await fetchDeepseekAIWithTTS(
              finalText,
              userId,
              conversationId,
              ws,
              ttsSocket
            );

            stopSendingSilence();

            console.log(`🤖 [DeepSeek] Response completed`);

            // ✅ Signal TTS end to frontend
            ws.send(JSON.stringify({ 
              type: "tts-end",
              message: "Audio generation completed"
            }));

            transcriptBuffer = "";
            isGenerating = false;
            ws.send(JSON.stringify({ type: "bot-typing", status: false }));
          }, TRIGGER_DELAY);
        }
      }
    } catch (err) {
      console.error("❌ [Parse Error]", err);
    }
  });

  deepgramSocket.on("error", (err) => {
    console.error("❌ [STT] Deepgram Error", err);
    ws.send(JSON.stringify({ type: "error", error: "Deepgram connection error" }));
    shutdown("deepgram error");
  });

  deepgramSocket.on("close", (code, reason) => {
    console.log(`🔌 [STT] Deepgram Connection closed. Code: ${code}, Reason: ${reason}`);
  });

  ws.on("message", (data) => {
    try {
      if (!Buffer.isBuffer(data)) {
        const parsed = JSON.parse(data.toString());
        if (parsed.type === "stop-voice") {
          console.log("🛑 [Voice] stop-voice received from client");
          shutdown("stop-voice from client");
          return;
        }
      }
    } catch (err) {
      console.error("❌ [Voice] Error handling message", err);
    }

    if (Buffer.isBuffer(data)) {
      if (isGenerating) return;
      if (isDGReady && deepgramSocket.readyState === WebSocket.OPEN) {
        deepgramSocket.send(data);
      } else {
        audioQueue.push(data);
      }
    }
  });

  ws.on("close", () => {
    console.log(`🔌 [Voice] Client WebSocket closed`);
    shutdown("client websocket close");
  });
};

// ✅ NEW FUNCTION: Enhanced fetchDeepseekAI with TTS streaming
const fetchDeepseekAIWithTTS = async (
  userMessage,
  userId,
  conversationId = null,
  ws = null,
  ttsSocket = null
) => {
  try {
    console.log("🚀 [Voice AI + TTS] Processing message for user:", userId, "conversation:", conversationId);

    // ✅ STRICT USER VALIDATION (keep existing validation code)
    if (!userId || isNaN(userId)) {
      console.error("❌ Invalid user_id in fetchDeepseekAI:", userId);
      if (ws) {
        ws.send(JSON.stringify({ type: "error", error: "Invalid user session" }));
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
        console.warn("⚠️ Provided conversation invalid or not owned. Trying fallback...");
        const latest = await executeQuery(
          `SELECT id FROM conversations WHERE user_id = ? AND is_deleted = FALSE ORDER BY updated_at DESC LIMIT 1`,
          [userId]
        );

        if (latest && latest.length > 0) {
          conversationId = latest[0].id;
          console.log("✅ Fallback to latest active conversation:", conversationId);
        } else {
          console.error("❌ No valid conversation found and none provided.");
          if (ws) {
            ws.send(JSON.stringify({ type: "error", error: "No conversation found." }));
          }
          return "No conversation context is available.";
        }
      }
    }

    // 🧠 GET USER INFO FOR PERSONALIZED RESPONSES (existing code)
   

    // ⚡ Get context immediately (existing code)
     // ✅ Get context immediately
    const contextResult = await getConversationContextOptimized(conversationId, userId);
    const { summaryContext, shouldRename, newConversationName } = contextResult;

    // ✅ Get user info
    let userInfo = null;
    try {
      const userResult = await executeQuery(
        "SELECT username FROM users WHERE id = ?",
        [userId]
      );
      if (userResult && userResult.length > 0) {
         userInfo = { username: userResult[0].username };
        console.log("✅ User info loaded:", userInfo.username);
      }
    } catch (userError) {
      console.log("⚠️ Could not fetch user info for personalization:", userError.message);
    }

    // ✅ Build AI messages
    const finalMessages = buildAIMessages(summaryContext, userMessage, userInfo);

    // 🚀 START AI RESPONSE STREAM IMMEDIATELY
    let aiResponse = "";
    const aiStartTime = Date.now();

    try {
      const stream = await deepseek.chat.completions.create({
        model: "deepseek-chat",
        messages: finalMessages,
        temperature: 0.7,
        max_tokens: 150,
        stream: true,
      });

      // ✅ AUDIO-FIRST APPROACH: Start TTS immediately, delay text
      if (ws) {
        ws.send(JSON.stringify({
          type: "start",
          conversation_id: conversationId,
          conversation_name: shouldRename ? "Generating title..." : newConversationName,
          conversation_renamed: shouldRename,
          context: {
            conversation_context_available: !!summaryContext,
          },
          processing_time: Date.now() - aiStartTime,
        }));

        // ✅ Start TTS immediately
        ws.send(JSON.stringify({ 
          type: "tts-start",
          message: "Starting audio generation..."
        }));
      }

      console.log(`🚀 Voice AI stream started in ${Date.now() - aiStartTime}ms`);

      // ✅ IMPROVED: Buffer text for better TTS chunks and delayed text display
      let textBuffer = "";
      let displayBuffer = "";
      const MIN_TTS_CHUNK_SIZE = 20; // Larger chunks for smoother audio
      const TEXT_DISPLAY_DELAY = 800; // Delay text display to let audio start first

      let textDisplayTimeout = null;
      let isFirstChunk = true;

      // ✅ Stream the response chunks
      for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content || "";
        if (content) {
          aiResponse += content;
          textBuffer += content;
          displayBuffer += content;
          
          console.log(`🤖 [AI Chunk] ${content}`);
          
          // ✅ AUDIO FIRST: Send to TTS immediately with larger chunks
          if (textBuffer.length >= MIN_TTS_CHUNK_SIZE && ttsSocket && ttsSocket.readyState === WebSocket.OPEN) {
            ttsSocket.send(JSON.stringify({
              type: "Speak",
              text: textBuffer,
              // ✅ Add natural speech rate
  model_options: {
    speed: 0.9, // Slightly slower for more natural speech
    pitch: 0.0, // Neutral pitch
    emphasis: 0.1 // Slight emphasis for natural variation
  }
            }));
            console.log(`🔊 [TTS] Sent to TTS: "${textBuffer}"`);
            textBuffer = ""; // Reset buffer
          }

          // ✅ DELAYED TEXT DISPLAY: Show text after audio has started
          if (isFirstChunk) {
            isFirstChunk = false;
            textDisplayTimeout = setTimeout(() => {
              startDisplayingText();
            }, TEXT_DISPLAY_DELAY);
          }
        }
      }

      // ✅ Send any remaining text to TTS
      if (textBuffer.length > 0 && ttsSocket && ttsSocket.readyState === WebSocket.OPEN) {
        ttsSocket.send(JSON.stringify({
          type: "Speak",
          text: textBuffer
        }));
        console.log(`🔊 [TTS] Sent final chunk to TTS: "${textBuffer}"`);
      }

      // ✅ Send final flush to TTS
      if (ttsSocket && ttsSocket.readyState === WebSocket.OPEN) {
        ttsSocket.send(JSON.stringify({
           type: "Flush"
        }));
        console.log(`🔊 [TTS] Sent flush command to complete audio generation`);
      }

      // ✅ Function to display text after audio starts
      function startDisplayingText() {
        if (!ws) return;
        
        let displayedLength = 0;
        const words = displayBuffer.split(' ');
        
        const displayInterval = setInterval(() => {
          if (displayedLength >= words.length) {
            clearInterval(displayInterval);
            return;
          }
          
          // Display 2-3 words at a time for smooth text appearance
          const wordsToShow = words.slice(0, displayedLength + 2).join(' ');
          
          ws.send(JSON.stringify({
            type: "content",
            content: words.slice(displayedLength, displayedLength + 2).join(' ') + ' ',
          }));
          
          displayedLength += 2;
        }, 200); // Show text every 200ms for smooth appearance
      }

      console.log(`🤖 [AI Complete Response] ${aiResponse}`);

      // ✅ Send final data after a delay to ensure audio is prioritized
      setTimeout(() => {
        if (ws) {
          ws.send(JSON.stringify({
            type: "end",
            full_response: aiResponse,
            context: {
              conversation_context_available: !!summaryContext,
            },
            total_processing_time: Date.now() - aiStartTime,
          }));

          // ✅ Signal TTS end
          setTimeout(() => {
            ws.send(JSON.stringify({ 
              type: "tts-end",
              message: "Audio generation completed"
            }));
          }, 1000);
        }
      }, 500);

      // 🚀 HANDLE RENAME RESULT (existing code)
      let finalConversationName = newConversationName;
      if (shouldRename) {
        try {
          const renameResult = await executeRename(conversationId, userMessage, userId);
          if (renameResult.success) {
            finalConversationName = renameResult.title;
            if (ws) {
              ws.send(JSON.stringify({
                type: "conversation_renamed",
                conversation_id: conversationId,
                new_name: finalConversationName,
                success: true,
              }));
            }
          }
        } catch (renameError) {
          console.error("❌ Rename failed:", renameError);
        }
      }

     

      // 🔄 BACKGROUND PROCESSING (AFTER RESPONSE SENT) - existing code
      process.nextTick(() => {
        handleAllBackgroundTasksOptimized(
          conversationId,
          userMessage,
          aiResponse,
          [],
          null,
          [],
          userId,
          false,
          finalConversationName,
          [],
          [],
          ""
        );
      });

      return aiResponse;

    } catch (aiError) {
      console.error("❌ Voice AI API error:", aiError);
      if (ws) {
        ws.send(JSON.stringify({
          type: "error",
          error: "I'm having trouble processing your request. Please try again.",
        }));
      }
      return "I'm having trouble processing your request. Please try again.";
    }

  } catch (error) {
    console.error("❌ fetchDeepseekAIWithTTS error:", error.message);
    if (ws) {
      ws.send(JSON.stringify({
        type: "error",
        error: "Internal server error occurred.",
      }));
    }
    return "An error occurred while processing your request.";
  }
};

const fetchDeepseekAI = async (
  userMessage,
  userId,
  conversationId = null,
  ws = null
) => {
  try {
    console.log("🚀 [Voice AI] Processing message for user:", userId, "conversation:", conversationId);

    // ✅ STRICT USER VALIDATION (like askChatbot)
    if (!userId || isNaN(userId)) {
      console.error("❌ Invalid user_id in fetchDeepseekAI:", userId);
      if (ws) {
        ws.send(JSON.stringify({ type: "error", error: "Invalid user session" }));
      }
      return "Authentication error occurred.";
    }

    // ✅ VERIFY CONVERSATION OWNERSHIP IF PROVIDED (like askChatbot)
    if (conversationId && !isNaN(conversationId)) {
      const ownershipCheck = await executeQuery(
        "SELECT id FROM conversations WHERE id = ? AND user_id = ? AND is_deleted = FALSE",
        [conversationId, userId]
      );

      if (!ownershipCheck || ownershipCheck.length === 0) {
        console.warn("⚠️ Provided conversation invalid or not owned. Trying fallback...");
        // Try fallback
        const latest = await executeQuery(
          `SELECT id FROM conversations WHERE user_id = ? AND is_deleted = FALSE ORDER BY updated_at DESC LIMIT 1`,
          [userId]
        );

        if (latest && latest.length > 0) {
          conversationId = latest[0].id;
          console.log("✅ Fallback to latest active conversation:", conversationId);
        } else {
          console.error("❌ No valid conversation found and none provided.");
          if (ws) {
            ws.send(JSON.stringify({ type: "error", error: "No conversation found." }));
          }
          return "No conversation context is available.";
        }
      }
    }

    // 🧠 GET USER INFO FOR PERSONALIZED RESPONSES (like askChatbot)
    let userInfo = null;
    try {
      const userResult = await executeQuery(
        "SELECT username FROM users WHERE id = ?",
        [userId]
      );
      if (userResult && userResult.length > 0) {
         userInfo = { username: userResult[0].username };
        console.log("✅ User info loaded:", userInfo.username);
      }
    } catch (userError) {
      console.log("⚠️ Could not fetch user info for personalization:", userError.message);
    }

    // ⚡ Get context immediately (like askChatbot)
     // ✅ Get context immediately
    const contextResult = await getConversationContextOptimized(conversationId, userId);
    const { summaryContext, shouldRename, newConversationName } = contextResult;

    // ✅ Build AI messages
    const finalMessages = buildAIMessages(summaryContext, userMessage, userInfo);

    // 🚀 START AI RESPONSE STREAM IMMEDIATELY
    let aiResponse = "";
    const aiStartTime = Date.now();

    try {
      const stream = await deepseek.chat.completions.create({
        model: "deepseek-chat",
        messages: finalMessages,
        temperature: 0.7,
        max_tokens: 150,
        stream: true,
      });

      // Send initial metadata immediately
      if (ws) {
        ws.send(JSON.stringify({
          type: "start",
          conversation_id: conversationId,
          conversation_name: shouldRename ? "Generating title..." : newConversationName,
          conversation_renamed: shouldRename,
          context: {
            conversation_context_available: !!summaryContext,
          },
          processing_time: Date.now() - aiStartTime,
        }));

        // ✅ IMMEDIATELY start TTS - don't wait
        ws.send(JSON.stringify({ 
          type: "tts-start",
          message: "Starting audio generation..."
        }));
      }

      console.log(`🚀 Voice AI stream started in ${Date.now() - aiStartTime}ms`);

      // ✅ CRITICAL FIX: Accumulate text in chunks before sending to TTS
      let textBuffer = "";
      const MIN_CHUNK_SIZE = 10; // Send to TTS every 10 characters

      // ✅ Stream the response chunks AND send to TTS in real-time
      for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content || "";
        if (content) {
          aiResponse += content;
          textBuffer += content;
          
          console.log(`🤖 [AI Chunk] ${content}`);
          
          // Send text chunk to frontend immediately
          if (ws) {
            ws.send(JSON.stringify({
              type: "content",
              content: content,
            }));
          }

          // ✅ REAL-TIME TTS: Send accumulated text to TTS when we have enough
          if (textBuffer.length >= MIN_CHUNK_SIZE && ttsSocket && ttsSocket.readyState === WebSocket.OPEN) {
            ttsSocket.send(JSON.stringify({
              type: "Speak",
              text: textBuffer,
              
            }));
            console.log(`🔊 [TTS] Sent to TTS: "${textBuffer}"`);
            textBuffer = ""; // Reset buffer
          }
        }
      }

      // ✅ Send any remaining text to TTS
      if (textBuffer.length > 0 && ttsSocket && ttsSocket.readyState === WebSocket.OPEN) {
        ttsSocket.send(JSON.stringify({
          type: "Speak",
          text: textBuffer
        }));
        console.log(`🔊 [TTS] Sent final chunk to TTS: "${textBuffer}"`);
      }

      // ✅ Send final flush to TTS to ensure all audio is generated
      if (ttsSocket && ttsSocket.readyState === WebSocket.OPEN) {
        ttsSocket.send(JSON.stringify({
           type: "Flush"
        }));
        console.log(`🔊 [TTS] Sent flush command to complete audio generation`);
      }

      console.log(`🤖 [AI Complete Response] ${aiResponse}`);

      // Send final data
      if (ws) {
        ws.send(JSON.stringify({
          type: "end",
          full_response: aiResponse,
          context: {
            conversation_context_available: !!summaryContext,
          },
          total_processing_time: Date.now() - aiStartTime,
        }));

        // ✅ Signal TTS end after a small delay to ensure all audio is processed
        setTimeout(() => {
          ws.send(JSON.stringify({ 
            type: "tts-end",
            message: "Audio generation completed"
          }));
        }, 500);
      }

      // 🔄 BACKGROUND PROCESSING (AFTER RESPONSE SENT) - like askChatbot
      process.nextTick(() => {
        handleAllBackgroundTasksOptimized(
          conversationId,
          userMessage,
          aiResponse,
          [],
          null,
          [],
          userId,
          false,
          finalConversationName,
          [],
          [],
          ""
        );
      });

      return aiResponse;

    } catch (aiError) {
      console.error("❌ Voice AI API error:", aiError);
      if (ws) {
        ws.send(JSON.stringify({
          type: "error",
          error: "I'm having trouble processing your request. Please try again.",
        }));
      }
      return "I'm having trouble processing your request. Please try again.";
    }

  } catch (error) {
    console.error("❌ fetchDeepseekAI error:", error.message);
    if (ws) {
      ws.send(JSON.stringify({
        type: "error",
        error: "Internal server error occurred.",
      }));
    }
    return "An error occurred while processing your request.";
  }
};

// 🏷️ EXECUTE RENAME WITH USER VALIDATION AND AI TITLE GENERATION (from chatController)
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
          [user_id, newConversationName || userMessage?.substring(0, 20) || "Voice Chat"]
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
      // Save to database
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

    console.log("✅ Database save successful for conversation:", conversation_id);
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
          userContent += `\n[URL Context: ${chat.url_content.substring(0, 1000)}]`;
        }

        if (chat.extracted_text) {
          userContent += `\n[Document Context: ${chat.extracted_text.substring(0, 500)}]`;
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
    content: `Create a concise summary of this voice conversation for future context. Focus on:

1. Main topics discussed
2. User's key questions and needs
3. Important context for future voice interactions
4. User's communication preferences

Keep it brief but informative (100-200 words max) since this is for voice mode context.`,
  },
  {
    role: "user",
    content: `Voice conversation to summarize:\n${conversationText.substring(0, 8000)}`, // Reduced from 12000
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

module.exports = {
  handleFinalUpload,
  handleLiveVoiceMessage,
  fetchDeepseekAI,
  fetchDeepseekAIWithTTS,
};

