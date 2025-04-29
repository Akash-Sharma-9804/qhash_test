const { createClient } = require("@deepgram/sdk");
const { v4: uuidv4 } = require("uuid");
const multer = require("multer");
const uploadToFTP = require("../utils/ftpUploader");
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

const handleFinalUpload = (req, res) => {
  upload(req, res, async (err) => {
    if (err) {
      console.error("❌ Upload error:", err);
      return res.status(500).json({ error: "Upload failed" });
    }

    const buffer = req.file.buffer;
    const fileName = `${uuidv4()}_${req.file.originalname}`;
    const ftpPath = "/fileuploads/audio";

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
        data.result?.results?.channels?.[0]?.alternatives?.[0]?.transcript;

      if (!transcript) {
        console.error(
          "❌ Deepgram transcription failed: No transcript found",
          data
        );
        return res.status(500).json({ error: "Transcription failed" });
      }

      // For file upload, just return transcript and audio URL without DB storage
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

// --- LIVE VOICE TRANSCRIPT (FROM FRONTEND) + AI CHAT + SAVE

// const handleLiveVoiceMessage = async (ws, user_id) => {
//   let deepgramLiveSocket;
//   let conversation_id = null;
//   let lastTranscriptTime = Date.now();
//   let sessionAudioBuffer = Buffer.alloc(0);
//   let isRecording = true;
//   let silenceTimeout = 1500; // Increased pause detection to 1.5s for better user experience
//   let silenceTimer;
//   let currentTranscript = "";
//   let isProcessing = false;

//   try {
//     // Create a Deepgram live socket for real-time transcription
//     deepgramLiveSocket = deepgram.listen.live({
//       encoding: "opus", // ✅ Add this
//       sample_rate:  48000, // ✅ Add this too
//       punctuate: true,
//       model: "nova-3",
//       language: "en-US",
//       interim_results: true,
//       smart_format: true,
//     })

//     // ✅ Add proper event handlers
//     deepgramLiveSocket.on(LiveTranscriptionEvents.Open, () => {
//       console.log("🔗 Deepgram WebSocket connected");
//       ws.send(JSON.stringify({ type: "ready", status: "connected" }));
//     });

//     deepgramLiveSocket.on(LiveTranscriptionEvents.Close, () => {
//       console.log("❌ Deepgram WebSocket closed");
//       ws.send(JSON.stringify({ type: "status", status: "disconnected" }));
//     });

//     deepgramLiveSocket.on(LiveTranscriptionEvents.Error, (error) => {
//       console.error("🚨 Deepgram WebSocket error:", error.message || error);
//       ws.send(JSON.stringify({ type: "error", error: "Transcription error" }));
//     });

//     // Process transcripts from Deepgram
//     deepgramLiveSocket.on(LiveTranscriptionEvents.Transcript, async (data) => {
//       // Clear silence timer on new transcript
//       clearTimeout(silenceTimer);

//       const transcript = data.channel?.alternatives?.[0]?.transcript;
//       if (!transcript || transcript.trim() === "") return;

//       lastTranscriptTime = Date.now();

//       // Send interim results to frontend for real-time display
//       if (data.is_final === false) {
//         currentTranscript = transcript;
//         ws.send(JSON.stringify({
//           type: "interim",
//           transcript: currentTranscript,
//           is_final: false
//         }));
//         return;
//       }

//       // For final segments, update currentTranscript
//       currentTranscript = transcript;
//       console.log("✍️ Final segment received:", currentTranscript);

//       // Send this final segment to frontend
//       ws.send(JSON.stringify({
//         type: "interim",
//         transcript: currentTranscript,
//         is_final: true
//       }));

//       // Start silence detection timer
//       silenceTimer = setTimeout(() => {
//         if (!isProcessing && currentTranscript.trim().length > 0) {
//           processTranscript(currentTranscript);
//         }
//       }, silenceTimeout);
//     });

//     // Function to process the transcript after silence detection
//     const processTranscript = async (transcript) => {
//       if (isProcessing) return; // Prevent multiple simultaneous processing
//       isProcessing = true;

//       console.log("📄 Processing final transcript:", transcript);
//       ws.send(JSON.stringify({ type: "processing", status: "started" }));

//       try {
//         // Create conversation if not already created
//         if (!conversation_id) {
//           const title = transcript.length > 50
//             ? transcript.substring(0, 47) + "..."
//             : transcript || "Voice Message";

//           const [result] = await query(
//             "INSERT INTO conversations (user_id, name) VALUES (?, ?)",
//             [user_id, title]
//           );
//           conversation_id = result.insertId;

//           console.log("🎉 New conversation created with ID:", conversation_id);

//           // Inform frontend of new conversation
//           ws.send(
//             JSON.stringify({
//               type: "conversation_created",
//               conversation_id,
//             })
//           );
//         }

//         // Validate conversation ownership
//         const [exists] = await query(
//           "SELECT id FROM conversations WHERE id = ? AND user_id = ?",
//           [conversation_id, user_id]
//         );
//         if (!exists.length) {
//           console.log("❌ Unauthorized access to conversation");
//           ws.send(
//             JSON.stringify({ type: "error", error: "Unauthorized conversation access." })
//           );
//           isProcessing = false;
//           return;
//         }

//         // Get recent chat history
//         const [historyResults] = await query(
//           "SELECT user_message AS message, response, extracted_text FROM chat_history WHERE conversation_id = ? ORDER BY created_at ASC",
//           [conversation_id]
//         );

//         const chatHistory = [];
//         const allExtractedTexts = [];

//         for (const chat of historyResults) {
//           if (chat.message)
//             chatHistory.push({ role: "user", content: chat.message });
//           if (chat.response)
//             chatHistory.push({ role: "assistant", content: chat.response });
//           if (chat.extracted_text) allExtractedTexts.push(chat.extracted_text);
//         }

//         const currentDate = new Date().toLocaleDateString("en-US", {
//           year: "numeric",
//           month: "long",
//           day: "numeric",
//         });

//         const systemPrompt = {
//           role: "system",
//           content:
//             `You are an intelligent assistant. Today's date is ${currentDate}. ` +
//             "You are Quantumhash, an AI assistant developed by the Quantumhash development team. " +
//             "If someone asks for your name, *only say*: 'My name is Quantumhash AI.' " +
//             "If someone asks who developed you, *only say*: 'I was developed by the Quantumhash development team.' " +
//             `If someone asks about your knowledge cutoff date, *only say*: 'I've got information up to the present, ${currentDate}.'` +
//             "You have access to previous documents uploaded by the user during this conversation, use them to answer questions.",
//         };

//         const finalMessages = [systemPrompt, ...chatHistory.slice(-10)];

//         if (allExtractedTexts.length > 0) {
//           const combined = allExtractedTexts.join("\n---\n").substring(0, 5000);
//           finalMessages.push({
//             role: "system",
//             content: `DOCUMENT CONTEXT:\n${combined}${
//               combined.length >= 5000 ? "\n...(truncated)" : ""
//             }`,
//           });
//         }

//         finalMessages.push({ role: "user", content: transcript });

//         // Get AI response
//         let aiResponse = "";
//         try {
//           const aiOptions = {
//             model:
//               process.env.USE_OPENAI === "true" ? "gpt-4" : "deepseek-chat",
//             messages: finalMessages,
//             temperature: 0.7,
//             max_tokens: 1500,
//           };

//           const aiProvider =
//             process.env.USE_OPENAI === "true" ? openai : deepseek;
//           const aiResult = await aiProvider.chat.completions.create(aiOptions);
//           aiResponse =
//             aiResult.choices?.[0]?.message?.content ||
//             "🤖 I couldn't generate a response.";
//         } catch (err) {
//           console.error("AI error:", err.message);
//           aiResponse =
//             "⚠️ I'm having trouble processing your voice. Try again.";
//         }

//         // Save transcript to FTP as audio file
//         let audioUrl = null;
//         if (sessionAudioBuffer.length > 0) {
//           try {
//             const fileName = `session_${uuidv4()}.webm`;
//             const ftpPath = "/fileuploads/audio";

//             // Upload audio to FTP
//             audioUrl = await uploadToFTP(
//               sessionAudioBuffer,
//               `${ftpPath}/${fileName}`
//             );
//             console.log("✅ Audio uploaded to FTP:", audioUrl);

//             // Reset buffer after successful upload
//             sessionAudioBuffer = Buffer.alloc(0);
//           } catch (ftpError) {
//             console.error("Failed to upload audio to FTP:", ftpError);
//           }
//         }

//         // Save to DB with audio URL if available
//         await query(
//           "INSERT INTO chat_history (conversation_id, user_message, response, audio_url, created_at) VALUES (?, ?, ?, ?, NOW())",
//           [conversation_id, transcript, aiResponse, audioUrl]
//         );

//         // Send both transcript and response to frontend
//         console.log("🔄 Sending transcript and AI response to frontend");
//         ws.send(
//           JSON.stringify({
//             type: "userMessage",
//             message: transcript, // ✅ add this
//             audioUrl: audioUrl,  // ✅ fix camelCase to match frontend
//             conversation_id,
//           })
//         );

//         // Then send the AI's response separately
//         ws.send(
//           JSON.stringify({
//             type: "aiMessage",
//             message: aiResponse,
//             conversation_id,
//             // optionally aiAudioUrl
//           })
//         );

//         // Reset current transcript after processing
//         currentTranscript = "";
//         isProcessing = false;

//         // Generate TTS for response (optional - add your TTS code here)
//         // sendTTSResponse(aiResponse, ws);

//       } catch (dbError) {
//         console.error("Database error:", dbError);
//         ws.send(
//           JSON.stringify({
//             type: "error",
//             error: "Failed to process transcript and generate response",
//           })
//         );
//         isProcessing = false;
//       }
//     };

//     // WebSocket stream input handler
//     ws.on("message", (message, isBinary) => {
//       console.log('📥 Received audio chunk of size:', message.length);
//       if (isBinary) {
//         // Collect audio data for eventual FTP upload
//         sessionAudioBuffer = Buffer.concat([sessionAudioBuffer, message]);

//         // Send to Deepgram for transcription
//         if (isRecording) {
//           deepgramLiveSocket.send(message);
//         }
//       } else {
//         // Process control messages from frontend
//         try {
//           const controlMsg = JSON.parse(message.toString());

//           // Allow frontend to set existing conversation
//           if (controlMsg.conversation_id) {
//             conversation_id = controlMsg.conversation_id;
//             console.log("📨 Using conversation ID:", conversation_id);
//           }

//           // Handle recording state changes
//           if (controlMsg.type === 'control') {
//             if (controlMsg.action === 'stop') {
//               isRecording = false;
//               // Flush current transcript if any
//               if (currentTranscript.trim().length > 0) {
//                 clearTimeout(silenceTimer);
//                 processTranscript(currentTranscript);
//               }
//               deepgramLiveSocket.finish();
//               ws.send(JSON.stringify({ type: "status", status: "stopped" }));
//             } else if (controlMsg.action === 'start') {
//               isRecording = true;
//               ws.send(JSON.stringify({ type: "status", status: "recording" }));
//             } else if (controlMsg.action === 'pause') {
//               // Process current transcript when explicitly paused
//               if (currentTranscript.trim().length > 0) {
//                 clearTimeout(silenceTimer);
//                 processTranscript(currentTranscript);
//               }
//             }
//           }
//         } catch (e) {
//           console.log("Received non-binary message:", message.toString());
//         }
//       }
//     });

//     // On socket close
//     ws.on(LiveTranscriptionEvents.Close, () => {
//       console.log("🔌 Voice socket closed for user:", user_id);
//       deepgramLiveSocket.finish();
//       clearTimeout(silenceTimer);
//       isRecording = false;
//     });

//   } catch (err) {
//     console.error("❌ Deepgram setup failed:", err.message);
//     ws.send(JSON.stringify({ error: "Failed to start voice recognition." }));
//   }
// };

// test
// const handleLiveVoiceMessage = async (ws, user_id) => {
//   let deepgramLiveSocket;
//   let conversation_id = null;
//   let lastTranscriptTime = Date.now();
//   let sessionAudioBuffer = Buffer.alloc(0);
//   let isRecording = true;
//   let silenceTimeout = 1500;
//   let silenceTimer;
//   let currentTranscript = "";
//   let isProcessing = false;

//   try {
//     deepgramLiveSocket = deepgram.listen.live({
//       encoding: "linear16",     // ✅ For raw WAV audio
//       sample_rate: 16000,
//       punctuate: true,
//       model: "nova-3",
//       language: "en-US",
//       interim_results: true,
//       smart_format: true,
//     });

//     // ✅ Deepgram event handlers
//     deepgramLiveSocket.on(LiveTranscriptionEvents.Open, () => {
//       console.log("🔗 Deepgram WebSocket connected");
//       ws.send(JSON.stringify({ type: "ready", status: "connected" }));
//     });

//     deepgramLiveSocket.on(LiveTranscriptionEvents.Close, () => {
//       console.log("❌ Deepgram WebSocket closed");
//       ws.send(JSON.stringify({ type: "status", status: "disconnected" }));
//     });

//     deepgramLiveSocket.on(LiveTranscriptionEvents.Error, (error) => {
//       console.error("🚨 Deepgram WebSocket error:", error.message || error);
//       ws.send(JSON.stringify({ type: "error", error: "Transcription error" }));
//     });

//     deepgramLiveSocket.on(LiveTranscriptionEvents.Transcript, async (data) => {
//       console.log("data", data);
//       clearTimeout(silenceTimer);

//       const transcript = data.channel?.alternatives?.[0]?.transcript;
//       console.log("transcipt", transcript);
//       if (!transcript || transcript.trim() === "") return;

//       lastTranscriptTime = Date.now();

//       if (!data.is_final) {
//         currentTranscript = transcript;
//         ws.send(JSON.stringify({
//           type: "interim",
//           transcript: currentTranscript,
//           is_final: false,
//         }));
//         return;
//       }

//       currentTranscript = transcript;
//       console.log("✍️ Final segment received:",  JSON.stringify(data.channel?.alternatives?.[0], null, 2));
//       ws.send(JSON.stringify({
//         type: "interim",
//         transcript: currentTranscript,
//         is_final: true,
//       }));

//       silenceTimer = setTimeout(() => {
//         if (!isProcessing && currentTranscript.trim().length > 0) {
//           processTranscript(currentTranscript);
//         }
//       }, silenceTimeout);
//     });

//     const processTranscript = async (transcript) => {
//       if (isProcessing) return;
//       isProcessing = true;

//       console.log("📄 Processing final transcript:", transcript);
//       ws.send(JSON.stringify({ type: "processing", status: "started" }));

//       try {
//         if (!conversation_id) {
//           const title = transcript.length > 50
//             ? transcript.substring(0, 47) + "..."
//             : transcript || "Voice Message";

//           const [result] = await query(
//             "INSERT INTO conversations (user_id, name) VALUES (?, ?)",
//             [user_id, title]
//           );
//           conversation_id = result.insertId;

//           console.log("🎉 New conversation created with ID:", conversation_id);
//           ws.send(JSON.stringify({
//             type: "conversation_created",
//             conversation_id,
//           }));
//         }

//         const [exists] = await query(
//           "SELECT id FROM conversations WHERE id = ? AND user_id = ?",
//           [conversation_id, user_id]
//         );
//         if (!exists.length) {
//           console.log("❌ Unauthorized access to conversation");
//           ws.send(JSON.stringify({ type: "error", error: "Unauthorized conversation access." }));
//           isProcessing = false;
//           return;
//         }

//         const [historyResults] = await query(
//           "SELECT user_message AS message, response, extracted_text FROM chat_history WHERE conversation_id = ? ORDER BY created_at ASC",
//           [conversation_id]
//         );

//         const chatHistory = [];
//         const allExtractedTexts = [];

//         for (const chat of historyResults) {
//           if (chat.message) chatHistory.push({ role: "user", content: chat.message });
//           if (chat.response) chatHistory.push({ role: "assistant", content: chat.response });
//           if (chat.extracted_text) allExtractedTexts.push(chat.extracted_text);
//         }

//         const currentDate = new Date().toLocaleDateString("en-US", {
//           year: "numeric",
//           month: "long",
//           day: "numeric",
//         });

//         const systemPrompt = {
//           role: "system",
//           content:
//             `You are an intelligent assistant. Today's date is ${currentDate}. ` +
//             "You are Quantumhash, an AI assistant developed by the Quantumhash development team. " +
//             "If someone asks for your name, *only say*: 'My name is Quantumhash AI.' " +
//             "If someone asks who developed you, *only say*: 'I was developed by the Quantumhash development team.' " +
//             `If someone asks about your knowledge cutoff date, *only say*: 'I've got information up to the present, ${currentDate}.' ` +
//             "You have access to previous documents uploaded by the user during this conversation, use them to answer questions.",
//         };

//         const finalMessages = [systemPrompt, ...chatHistory.slice(-10)];

//         if (allExtractedTexts.length > 0) {
//           const combined = allExtractedTexts.join("\n---\n").substring(0, 5000);
//           finalMessages.push({
//             role: "system",
//             content: `DOCUMENT CONTEXT:\n${combined}${combined.length >= 5000 ? "\n...(truncated)" : ""}`,
//           });
//         }

//         finalMessages.push({ role: "user", content: transcript });

//         let aiResponse = "";
//         try {
//           const aiOptions = {
//             model: process.env.USE_OPENAI === "true" ? "gpt-4" : "deepseek-chat",
//             messages: finalMessages,
//             temperature: 0.7,
//             max_tokens: 1500,
//           };

//           const aiProvider = process.env.USE_OPENAI === "true" ? openai : deepseek;
//           const aiResult = await aiProvider.chat.completions.create(aiOptions);
//           aiResponse = aiResult.choices?.[0]?.message?.content || "🤖 I couldn't generate a response.";
//         } catch (err) {
//           console.error("AI error:", err.message);
//           aiResponse = "⚠️ I'm having trouble processing your voice. Try again.";
//         }

//         let audioUrl = null;
//         if (sessionAudioBuffer.length > 0) {
//           try {
//             const fileName = `session_${uuidv4()}.webm`;
//             const ftpPath = "/fileuploads/audio";
//             audioUrl = await uploadToFTP(sessionAudioBuffer, `${ftpPath}/${fileName}`);
//             console.log("✅ Audio uploaded to FTP:", audioUrl);
//             sessionAudioBuffer = Buffer.alloc(0);
//           } catch (ftpError) {
//             console.error("Failed to upload audio to FTP:", ftpError);
//           }
//         }

//         await query(
//           "INSERT INTO chat_history (conversation_id, user_message, response, audio_url, created_at) VALUES (?, ?, ?, ?, NOW())",
//           [conversation_id, transcript, aiResponse, audioUrl]
//         );

//         ws.send(JSON.stringify({
//           type: "userMessage",
//           message: transcript,
//           audioUrl,
//           conversation_id,
//         }));

//         ws.send(JSON.stringify({
//           type: "aiMessage",
//           message: aiResponse,
//           conversation_id,
//         }));

//         currentTranscript = "";
//         isProcessing = false;
//       } catch (dbError) {
//         console.error("Database error:", dbError);
//         ws.send(JSON.stringify({
//           type: "error",
//           error: "Failed to process transcript and generate response",
//         }));
//         isProcessing = false;
//       }
//     };

//     ws.on("message", (message, isBinary) => {
//       if (isBinary) {
//         sessionAudioBuffer = Buffer.concat([sessionAudioBuffer, message]);
//         if (isRecording) {
//           deepgramLiveSocket.send(message);
//         }
//       } else {
//         try {
//           const controlMsg = JSON.parse(message.toString());

//           if (controlMsg.conversation_id) {
//             conversation_id = controlMsg.conversation_id;
//             console.log("📨 Using conversation ID:", conversation_id);
//           }

//           if (controlMsg.type === "control") {
//             if (controlMsg.action === "stop") {
//               isRecording = false;
//               if (currentTranscript.trim().length > 0) {
//                 clearTimeout(silenceTimer);
//                 processTranscript(currentTranscript);
//               }
//               deepgramLiveSocket.finish();
//               ws.send(JSON.stringify({ type: "status", status: "stopped" }));
//             } else if (controlMsg.action === "start") {
//               isRecording = true;
//               ws.send(JSON.stringify({ type: "status", status: "recording" }));
//             } else if (controlMsg.action === "pause") {
//               if (currentTranscript.trim().length > 0) {
//                 clearTimeout(silenceTimer);
//                 processTranscript(currentTranscript);
//               }
//             }
//           }
//         } catch (e) {
//           console.log("Received non-binary message:", message.toString());
//         }
//       }
//     });

//     ws.on("close", () => {
//       console.log("🔌 Voice socket closed for user:", user_id);
//       try {
//         deepgramLiveSocket?.finish();
//       } catch (e) {
//         console.error("Error finishing Deepgram socket:", e.message);
//       }
//       clearTimeout(silenceTimer);
//       isRecording = false;
//       sessionAudioBuffer = Buffer.alloc(0);
//       currentTranscript = "";
//     });

//   } catch (err) {
//     console.error("❌ Deepgram setup failed:", err.message);
//     ws.send(JSON.stringify({ error: "Failed to start voice recognition." }));
//   }
// };

// working
// const handleLiveVoiceMessage = async (ws, user_id) => {
//   let deepgramLiveSocket;
//   let conversation_id = null;
//   let lastTranscriptTime = Date.now();
//   let sessionAudioBuffer = Buffer.alloc(0);
//   let isRecording = true;
//   let silenceTimeout = 1500; // 1.5 seconds of silence detection
//   let silenceTimer;
//   let currentTranscript = "";
//   let isProcessing = false;

//   try {
//     // Initialize Deepgram live WebSocket
//     deepgramLiveSocket = deepgram.listen.live({
//       encoding: "opus", // Tell Deepgram you are sending OPUS
//       sample_rate: 48000, // Deepgram needs to know 48kHz sample rate
//       channels: 1, // Mono is fine
//       punctuate: true,
//       model: "nova-3",
//       language: "en-US",
//       interim_results: true,
//       smart_format: true,
//       filter_profanity: true, // Optional, depending on your use case
//       noise_suppression: true, // Enable noise suppression
//     });

//     // ✅ Deepgram event handlers
//     deepgramLiveSocket.on(LiveTranscriptionEvents.Open, () => {
//       console.log("🔗 Deepgram WebSocket connected");
//       ws.send(JSON.stringify({ type: "ready", status: "connected" }));
//     });

//     deepgramLiveSocket.on(LiveTranscriptionEvents.Close, () => {
//       console.log("❌ Deepgram WebSocket closed");
//       ws.send(JSON.stringify({ type: "status", status: "disconnected" }));
//     });

//     deepgramLiveSocket.on(LiveTranscriptionEvents.Error, (error) => {
//       console.error("🚨 Deepgram WebSocket error:", error.message || error);
//       ws.send(JSON.stringify({ type: "error", error: "Transcription error" }));
//     });

//     deepgramLiveSocket.on(LiveTranscriptionEvents.Transcript, async (data) => {
//       console.log("Received data:", data);

//       // Check if the alternatives array exists and has a valid transcript
//       if (data.channel && data.channel.alternatives) {
//         console.log("Alternatives:", data.channel.alternatives);
//       } else {
//         console.log("No alternatives found in the data.");
//       }

//       // Extract transcript and confidence
//       const alternative = data.channel?.alternatives?.[0];
//       const transcript = alternative?.transcript;
//       const confidence = alternative?.confidence;

//       console.log("Transcript:", transcript);
//       console.log("Confidence:", confidence);

//       if (!transcript || transcript.trim() === "" || confidence < 0.3) {
//         // Handle low confidence or empty transcript
//         console.log("Empty transcript or low confidence (below 0.5).");
//         return;
//       }

//       lastTranscriptTime = Date.now();

//       // Handle interim results (non-final)
//       if (!data.is_final) {
//         currentTranscript = transcript;
//         ws.send(
//           JSON.stringify({
//             type: "interim",
//             transcript: currentTranscript,
//             is_final: false,
//           })
//         );
//         resetSilenceTimer(); // Reset the silence timer on each interim result
//         return;
//       }

//       // Handle final results (user stops speaking)
//       currentTranscript = transcript;
//       console.log("Final transcript received:", currentTranscript);

//       // Send final transcript to WebSocket
//       ws.send(
//         JSON.stringify({
//           type: "interim",
//           transcript: currentTranscript,
//           is_final: true,
//         })
//       );

//       resetSilenceTimer(); // Reset timer after sending the final transcript
//     });

//     // Function to handle silence detection and process transcript if user pauses
//     const resetSilenceTimer = () => {
//       clearTimeout(silenceTimer);
//       console.log("⏱️ Resetting silence timer...");

//       silenceTimer = setTimeout(() => {
//         if (!isProcessing && currentTranscript.trim().length > 0) {
//           processTranscript(currentTranscript);
//         }
//       }, silenceTimeout);
//     };

//     // Function to process the transcript after silence is detected
//     const processTranscript = async (transcript) => {
//       if (isProcessing) return;
//       isProcessing = true;

//       console.log("📄 Processing final transcript:", transcript);
//       ws.send(JSON.stringify({ type: "processing", status: "started" }));

//       try {
//         if (!conversation_id) {
//           const title =
//             transcript.length > 50
//               ? transcript.substring(0, 47) + "..."
//               : transcript || "Voice Message";

//           const [result] = await query(
//             "INSERT INTO conversations (user_id, name) VALUES (?, ?)",
//             [user_id, title]
//           );
//           conversation_id = result.insertId;

//           console.log("🎉 New conversation created with ID:", conversation_id);
//           ws.send(
//             JSON.stringify({
//               type: "conversation_created",
//               conversation_id,
//             })
//           );
//         }

//         const [exists] = await query(
//           "SELECT id FROM conversations WHERE id = ? AND user_id = ?",
//           [conversation_id, user_id]
//         );
//         if (!exists.length) {
//           console.log("❌ Unauthorized access to conversation");
//           ws.send(
//             JSON.stringify({
//               type: "error",
//               error: "Unauthorized conversation access.",
//             })
//           );
//           isProcessing = false;
//           return;
//         }

//         const [historyResults] = await query(
//           "SELECT user_message AS message, response, extracted_text FROM chat_history WHERE conversation_id = ? ORDER BY created_at ASC",
//           [conversation_id]
//         );

//         const chatHistory = [];
//         const allExtractedTexts = [];

//         for (const chat of historyResults) {
//           if (chat.message)
//             chatHistory.push({ role: "user", content: chat.message });
//           if (chat.response)
//             chatHistory.push({ role: "assistant", content: chat.response });
//           if (chat.extracted_text) allExtractedTexts.push(chat.extracted_text);
//         }

//         const currentDate = new Date().toLocaleDateString("en-US", {
//           year: "numeric",
//           month: "long",
//           day: "numeric",
//         });

//         const systemPrompt = {
//           role: "system",
//           content:
//             `You are an intelligent assistant. Today's date is ${currentDate}. ` +
//             "You are Quantumhash, an AI assistant developed by the Quantumhash development team. " +
//             "If someone asks for your name, *only say*: 'My name is Quantumhash AI.' " +
//             "If someone asks who developed you, *only say*: 'I was developed by the Quantumhash development team.' " +
//             `If someone asks about your knowledge cutoff date, *only say*: 'I've got information up to the present, ${currentDate}.' ` +
//             "You have access to previous documents uploaded by the user during this conversation, use them to answer questions.",
//         };

//         const finalMessages = [systemPrompt, ...chatHistory.slice(-10)];

//         if (allExtractedTexts.length > 0) {
//           const combined = allExtractedTexts.join("\n---\n").substring(0, 5000);
//           finalMessages.push({
//             role: "system",
//             content: `DOCUMENT CONTEXT:\n${combined}${
//               combined.length >= 5000 ? "\n...(truncated)" : ""
//             }`,
//           });
//         }

//         finalMessages.push({ role: "user", content: transcript });

//         let aiResponse = "";
//         try {
//           const aiOptions = {
//             model:
//               process.env.USE_OPENAI === "true" ? "gpt-4" : "deepseek-chat",
//             messages: finalMessages,
//             temperature: 0.7,
//             max_tokens: 1500,
//           };

//           const aiProvider =
//             process.env.USE_OPENAI === "true" ? openai : deepseek;
//           const aiResult = await aiProvider.chat.completions.create(aiOptions);
//           aiResponse =
//             aiResult.choices?.[0]?.message?.content ||
//             "🤖 I couldn't generate a response.";
//         } catch (err) {
//           console.error("AI error:", err.message);
//           aiResponse =
//             "⚠️ I'm having trouble processing your voice. Try again.";
//         }

//         let audioUrl = null;
//         if (sessionAudioBuffer.length > 0) {
//           try {
//             const fileName = `session_${uuidv4()}.webm`;
//             const ftpPath = "/fileuploads/audio";
//             audioUrl = await uploadToFTP(
//               sessionAudioBuffer,
//               `${ftpPath}/${fileName}`
//             );
//             console.log("✅ Audio uploaded to FTP:", audioUrl);
//             sessionAudioBuffer = Buffer.alloc(0);
//           } catch (ftpError) {
//             console.error("Failed to upload audio to FTP:", ftpError);
//           }
//         }

//         await query(
//           "INSERT INTO chat_history (conversation_id, user_message, response, audio_url, created_at) VALUES (?, ?, ?, ?, NOW())",
//           [conversation_id, transcript, aiResponse, audioUrl]
//         );

//         ws.send(
//           JSON.stringify({
//             type: "userMessage",
//             message: transcript,
//             audioUrl,
//             conversation_id,
//           })
//         );

//         ws.send(
//           JSON.stringify({
//             type: "aiMessage",
//             message: aiResponse,
//             conversation_id,
//           })
//         );

//         currentTranscript = "";
//         isProcessing = false;
//       } catch (dbError) {
//         console.error("Database error:", dbError);
//         ws.send(
//           JSON.stringify({
//             type: "error",
//             error: "Failed to process transcript and generate response",
//           })
//         );
//         isProcessing = false;
//       }
//     };

//     // Handle incoming WebSocket messages (audio data)
//     ws.on("message", (message, isBinary) => {
//       if (isBinary) {
//         sessionAudioBuffer = Buffer.concat([sessionAudioBuffer, message]);
//         if (isRecording) {
//           deepgramLiveSocket.send(message);
//         }
//       } else {
//         try {
//           const controlMsg = JSON.parse(message.toString());

//           if (controlMsg.conversation_id) {
//             conversation_id = controlMsg.conversation_id;
//             console.log("📨 Using conversation ID:", conversation_id);
//           }

//           if (controlMsg.type === "control") {
//             if (controlMsg.action === "stop") {
//               isRecording = false;
//               if (currentTranscript.trim().length > 0) {
//                 clearTimeout(silenceTimer);
//                 processTranscript(currentTranscript);
//               }
//               deepgramLiveSocket.finish();
//               ws.send(JSON.stringify({ type: "status", status: "stopped" }));
//             } else if (controlMsg.action === "start") {
//               isRecording = true;
//               ws.send(JSON.stringify({ type: "status", status: "recording" }));
//             } else if (controlMsg.action === "pause") {
//               if (currentTranscript.trim().length > 0) {
//                 clearTimeout(silenceTimer);
//                 processTranscript(currentTranscript);
//               }
//             }
//           }
//         } catch (e) {
//           console.log("Received non-binary message:", message.toString());
//         }
//       }
//     });

//     // Handle WebSocket closure
//     ws.on("close", () => {
//       console.log("🔌 Voice socket closed for user:", user_id);
//       try {
//         deepgramLiveSocket?.finish();
//       } catch (e) {
//         console.error("Error finishing Deepgram socket:", e);
//       }
//     });
//   } catch (error) {
//     console.error("Error initializing voice message handler:", error);
//     ws.send(
//       JSON.stringify({
//         type: "error",
//         error: "Failed to initialize voice message handler",
//       })
//     );
//   }
// };

// test
// const handleLiveVoiceMessage = async (ws, user_id) => {
//   console.log("🔵 New live voice WebSocket connection for user:", user_id);

//   let dgSocket = null;
//   let conversation_id = null;
//   let sessionAudioBuffer = Buffer.alloc(0);
//   let pendingAudioChunks = [];
//   let deepgramReady = false;
//   let currentTranscript = '';
//   let heartbeatInterval = null;
//   let reconnectAttempts = 0;
//   const MAX_RECONNECT_ATTEMPTS = 3;

//   // Function to process final transcript and generate AI response
//   const processFinalTranscript = async (transcript) => {
//     if (!transcript || transcript.trim() === '') return;

//     console.log("📝 Processing final transcript:", transcript);
//     ws.send(JSON.stringify({ type: "processing", status: "started" }));

//     try {
//       // Create conversation if needed
//       if (!conversation_id) {
//         const title = transcript.length > 50
//           ? transcript.substring(0, 47) + "..."
//           : transcript;

//         const [result] = await db.query(
//           "INSERT INTO conversations (user_id, name) VALUES (?, ?)",
//           [user_id, title]
//         );
//         conversation_id = result.insertId;
//         console.log("🆕 Created new conversation:", conversation_id);

//         ws.send(JSON.stringify({
//           type: "conversation_created",
//           conversation_id
//         }));
//       }

//       // Get chat history
//       const [historyResults] = await db.query(
//         "SELECT user_message, response, extracted_text FROM chat_history WHERE conversation_id = ? ORDER BY created_at ASC",
//         [conversation_id]
//       );

//       // Prepare chat context
//       const chatHistory = [];
//       const documentContext = [];

//       for (const item of historyResults) {
//         if (item.user_message) chatHistory.push({ role: "user", content: item.user_message });
//         if (item.response) chatHistory.push({ role: "assistant", content: item.response });
//         if (item.extracted_text) documentContext.push(item.extracted_text);
//       }

//       // Create AI prompt
//       const systemPrompt = {
//         role: "system",
//         content: `You are Quantumhash AI. Today's date is ${new Date().toLocaleDateString()}.`
//       };

//       const finalMessages = [systemPrompt, ...chatHistory.slice(-10)];

//       if (documentContext.length > 0) {
//         finalMessages.push({
//           role: "system",
//           content: `DOCUMENT CONTEXT:\n${documentContext.join("\n---\n").slice(0, 5000)}`
//         });
//       }

//       finalMessages.push({ role: "user", content: transcript });

//       // Generate AI response
//       const aiProvider = process.env.USE_OPENAI === "true" ? openai : deepseek;
//       const model = process.env.USE_OPENAI === "true" ? "gpt-4" : "deepseek-chat";

//       let aiResponse = "";
//       try {
//         const aiResult = await aiProvider.chat.completions.create({
//           model,
//           messages: finalMessages,
//           temperature: 0.7,
//           max_tokens: 1500
//         });

//         aiResponse = aiResult.choices?.[0]?.message?.content || "I couldn't generate a response.";
//       } catch (err) {
//         console.error("❌ AI generation error:", err);
//         aiResponse = "I'm having trouble processing your request right now.";
//       }

//       // Save audio to FTP if available
//       let audioUrl = null;
//       if (sessionAudioBuffer.length > 0) {
//         try {
//           const fileName = `voice_${uuidv4()}.webm`;
//           audioUrl = await uploadToFTP(
//             sessionAudioBuffer,
//             `/fileuploads/audio/${fileName}`
//           );
//           console.log("✅ Audio uploaded to FTP:", audioUrl);

//           // Reset buffer after successful upload
//           sessionAudioBuffer = Buffer.alloc(0);
//         } catch (ftpError) {
//           console.error("❌ Failed to upload audio:", ftpError);
//         }
//       }

//       // Save to database
//       await db.query(
//         "INSERT INTO chat_history (conversation_id, user_message, response, audio_url, created_at) VALUES (?, ?, ?, ?, NOW())",
//         [conversation_id, transcript, aiResponse, audioUrl]
//       );

//       // Send responses to client
//       ws.send(JSON.stringify({
//         type: "userMessage",
//         message: transcript,
//         audioUrl,
//         conversation_id
//       }));

//       ws.send(JSON.stringify({
//         type: "aiMessage",
//         message: aiResponse,
//         conversation_id
//       }));

//       currentTranscript = '';
//     } catch (error) {
//       console.error("❌ Error processing transcript:", error);
//       ws.send(JSON.stringify({
//         type: "error",
//         error: "Failed to process your message"
//       }));
//     }
//   };

//   // Function to connect to Deepgram
//   const connectToDeepgram = () => {
//     try {
//       if (dgSocket) {
//         try {
//           dgSocket.terminate();
//         } catch (e) {
//           console.error("Error terminating existing Deepgram socket:", e);
//         }
//       }

//       console.log("🔄 Connecting to Deepgram...");

//       // Configure Deepgram parameters
//       const params = new URLSearchParams({
//         encoding: "opus",
//         sample_rate: "48000",
//         channels: "1",
//         model: "nova-3",
//         language: "en-US",
//         punctuate: "true",
//         interim_results: "true",
//         smart_format: "true"
//       });

//       // Create WebSocket connection to Deepgram
//       dgSocket = new WebSocket(`${DEEPGRAM_URL}?${params.toString()}`, {
//         headers: {
//           "Authorization": `Token ${process.env.DEEPGRAM_API_KEY}`,
//           "Content-Type": "audio/webm;codecs=opus"
//         }
//       });

//       // Set up heartbeat to keep Deepgram connection alive
//       if (heartbeatInterval) {
//         clearInterval(heartbeatInterval);
//       }

//       heartbeatInterval = setInterval(() => {
//         if (dgSocket && dgSocket.readyState === WebSocket.OPEN) {
//           console.log("💓 Sent heartbeat to keep Deepgram alive");
//           dgSocket.ping();
//         }
//       }, 20000);

//       // Handle Deepgram connection open
//       dgSocket.on("open", () => {
//         console.log("✅ Connected to Deepgram");
//         deepgramReady = true;
//         reconnectAttempts = 0;

//         ws.send(JSON.stringify({
//           type: "ready",
//           status: "connected"
//         }));

//         // Send any buffered audio chunks
//         if (pendingAudioChunks.length > 0) {
//           console.log(`🚀 Sending ${pendingAudioChunks.length} buffered audio chunks`);

//           for (const chunk of pendingAudioChunks) {
//             if (dgSocket.readyState === WebSocket.OPEN) {
//               dgSocket.send(chunk);
//             }
//           }

//           pendingAudioChunks = [];
//         }
//       });

//       // Handle incoming messages from Deepgram
//       dgSocket.on("message", (data) => {
//         console.log("data", data);
//         try {
//           const response = JSON.parse(data.toString());

//           // Check for transcript in response
//           if (response.channel?.alternatives?.[0]) {
//             const transcript = response.channel.alternatives[0].transcript?.trim();
//             const isFinal = !!response.is_final;

//             if (transcript) {
//               console.log(`📝 Transcript [final=${isFinal}]:`, transcript);
//               currentTranscript = transcript;

//               // Send to client
//               ws.send(JSON.stringify({
//                 type: "interim",
//                 transcript,
//                 is_final: isFinal
//               }));

//               // Process final transcripts
//               if (isFinal && transcript.length > 3) {
//                 processFinalTranscript(transcript);
//               }
//             }
//           }
//         } catch (error) {
//           console.error("❌ Error parsing Deepgram response:", error);
//         }
//       });

//       // Handle Deepgram connection close
//       dgSocket.on("close", (code, reason) => {
//         console.log(`❌ Deepgram socket closed: ${code} - ${reason}`);
//         deepgramReady = false;

//         // Process any final transcript we have
//         if (currentTranscript && currentTranscript.trim().length > 0) {
//           processFinalTranscript(currentTranscript);
//         }

//         // Attempt to reconnect if not a normal closure
//         if (code !== 1000 && reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
//           reconnectAttempts++;
//           console.log(`🔄 Attempting to reconnect (${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})...`);
//           setTimeout(connectToDeepgram, 2000);
//         }
//       });

//       // Handle Deepgram errors
//       dgSocket.on("error", (error) => {
//         console.error("❌ Deepgram socket error:", error);
//         ws.send(JSON.stringify({
//           type: "error",
//           error: "Speech recognition error"
//         }));
//       });

//     } catch (error) {
//       console.error("❌ Failed to connect to Deepgram:", error);
//       ws.send(JSON.stringify({
//         type: "error",
//         error: "Failed to connect to speech recognition service"
//       }));
//     }
//   };

//   // Initialize connection to Deepgram
//   connectToDeepgram();

//   // Handle messages from client
//   ws.on("message", (message, isBinary) => {
//     if (isBinary) {
//       // Handle binary audio data
//       console.log("📦 Received audio chunk of size:", message.length);

//       // Store audio for later saving
//       sessionAudioBuffer = Buffer.concat([sessionAudioBuffer, message]);

//       // Send to Deepgram if ready, otherwise buffer
//       if (deepgramReady && dgSocket && dgSocket.readyState === WebSocket.OPEN) {
//         dgSocket.send(message);
//       } else {
//         pendingAudioChunks.push(message);
//         console.warn("⚠️ Deepgram socket not open yet, buffering audio.");
//       }
//     } else {
//       // Handle control messages
//       try {
//         const control = JSON.parse(message.toString());
//         console.log("🎮 Control message:", control);

//         if (control.conversation_id) {
//           conversation_id = control.conversation_id;
//           console.log("📝 Using existing conversation:", conversation_id);
//         }

//         if (control.type === "control") {
//           if (control.action === "stop") {
//             console.log("🛑 Stop recording requested");

//             // Process any final transcript
//             if (currentTranscript && currentTranscript.trim().length > 0) {
//               processFinalTranscript(currentTranscript);
//             }

//             // Close Deepgram connection
//             if (dgSocket && dgSocket.readyState === WebSocket.OPEN) {
//               dgSocket.close(1000, "User stopped recording");
//             }
//           } else if (control.action === "start") {
//             console.log("▶️ Start recording requested");

//             // Reconnect if needed
//             if (!deepgramReady) {
//               connectToDeepgram();
//             }
//           }
//         }
//       } catch (error) {
//         console.error("❌ Error parsing control message:", error);
//       }
//     }
//   });

//   // Handle client disconnection
//   ws.on("close", () => {
//     console.log("🔌 Client disconnected");

//     // Clean up resources
//     if (heartbeatInterval) {
//       clearInterval(heartbeatInterval);
//     }

//     // Close Deepgram connection
//     if (dgSocket) {
//       try {
//         dgSocket.close(1000, "Client disconnected");
//       } catch (error) {
//         console.error("❌ Error closing Deepgram socket:", error);
//       }
//     }
//   });
// };

const handleLiveVoiceMessage = async (ws, user_id) => {
  console.log("🔵 New live voice WebSocket connection for user:", user_id);

  const deepgramApiKey = process.env.DEEPGRAM_API_KEY;
  const deepgram = createClient(deepgramApiKey);
  let conversation_id = null;
  let sessionAudioBuffer = Buffer.alloc(0);
  let currentTranscript = "";
  let connection = null;
  let pendingAudioChunks = [];

  // Helper function to process final transcript
  const processFinalTranscript = async (transcript) => {
    if (!transcript || transcript.trim() === "") return;
    console.log("📝 Processing final transcript:", transcript);

    ws.send(JSON.stringify({ type: "processing", status: "started" }));

    try {
      if (!conversation_id) {
        const title =
          transcript.length > 50
            ? transcript.substring(0, 47) + "..."
            : transcript;
        const [result] = await db.query(
          "INSERT INTO conversations (user_id, name) VALUES (?, ?)",
          [user_id, title]
        );
        conversation_id = result.insertId;
        console.log("🆕 Created new conversation:", conversation_id);

        ws.send(
          JSON.stringify({
            type: "conversation_created",
            conversation_id,
          })
        );
      }

      const [historyResults] = await db.query(
        "SELECT user_message, response, extracted_text FROM chat_history WHERE conversation_id = ? ORDER BY created_at ASC",
        [conversation_id]
      );

      const chatHistory = [];
      const documentContext = [];

      for (const item of historyResults) {
        if (item.user_message)
          chatHistory.push({ role: "user", content: item.user_message });
        if (item.response)
          chatHistory.push({ role: "assistant", content: item.response });
        if (item.extracted_text) documentContext.push(item.extracted_text);
      }

      const systemPrompt = {
        role: "system",
        content: `You are Quantumhash AI. Today's date is ${new Date().toLocaleDateString()}.`,
      };

      const finalMessages = [systemPrompt, ...chatHistory.slice(-10)];

      if (documentContext.length > 0) {
        finalMessages.push({
          role: "system",
          content: `DOCUMENT CONTEXT:\n${documentContext
            .join("\n---\n")
            .slice(0, 5000)}`,
        });
      }

      finalMessages.push({ role: "user", content: transcript });

      const aiProvider = process.env.USE_OPENAI === "true" ? openai : deepseek;
      const model =
        process.env.USE_OPENAI === "true" ? "gpt-4" : "deepseek-chat";

      let aiResponse = "";
      try {
        const aiResult = await aiProvider.chat.completions.create({
          model,
          messages: finalMessages,
          temperature: 0.7,
          max_tokens: 1500,
        });

        aiResponse =
          aiResult.choices?.[0]?.message?.content ||
          "I couldn't generate a response.";
      } catch (err) {
        console.error("❌ AI generation error:", err);
        aiResponse = "I'm having trouble processing your request right now.";
      }

      let audioUrl = null;
      if (sessionAudioBuffer.length > 0) {
        try {
          const fileName = `voice_${uuidv4()}.webm`;
          audioUrl = await uploadToFTP(
            sessionAudioBuffer,
            `/fileuploads/audio/${fileName}`
          );
          console.log("✅ Audio uploaded to FTP:", audioUrl);
          sessionAudioBuffer = Buffer.alloc(0);
        } catch (ftpError) {
          console.error("❌ FTP upload error:", ftpError);
        }
      }

      await db.query(
        "INSERT INTO chat_history (conversation_id, user_message, response, audio_url, created_at) VALUES (?, ?, ?, ?, NOW())",
        [conversation_id, transcript, aiResponse, audioUrl]
      );

      ws.send(
        JSON.stringify({
          type: "userMessage",
          message: transcript,
          audioUrl,
          conversation_id,
        })
      );

      ws.send(
        JSON.stringify({
          type: "aiMessage",
          message: aiResponse,
          conversation_id,
        })
      );

      currentTranscript = "";
    } catch (error) {
      console.error("❌ Error processing transcript:", error);
      ws.send(
        JSON.stringify({
          type: "error",
          error: "Failed to process your message",
        })
      );
    }
  };

  // Create Deepgram connection
  const startDeepgramConnection = () => {
    console.log("🔄 Connecting to Deepgram via SDK...");

    connection = deepgram.listen.live({
      encoding: "opus",          // <<<< IMPORTANT
      sample_rate: 48000,    
      smart_format: true,
      model: "nova-3",
      language: "en-US",
      punctuate: true,
      interim_results: true,
    });

    connection.on(LiveTranscriptionEvents.Open, () => {
      console.log("✅ Deepgram SDK connection opened.");
      // Flush pending audio
      if (pendingAudioChunks.length > 0) {
        for (const chunk of pendingAudioChunks) {
          connection.send(chunk);
        }
        pendingAudioChunks = [];
      }
      ws.send(JSON.stringify({ type: "ready", status: "connected" }));
    });

    connection.on(LiveTranscriptionEvents.Transcript, (data) => {
      try {
        const transcript = data.channel.alternatives[0]?.transcript?.trim();
        const isFinal = data.is_final;

        if (transcript) {
          console.log(`📝 Transcript [final=${isFinal}]:`, transcript);
          currentTranscript = transcript;

          ws.send(
            JSON.stringify({
              type: "interim",
              transcript,
              is_final: isFinal,
            })
          );

          if (isFinal && transcript.length > 3) {
            processFinalTranscript(transcript);
          }
        }
      } catch (error) {
        console.error("❌ Error handling Deepgram transcript:", error);
      }
    });

    connection.on(LiveTranscriptionEvents.Close, () => {
      console.log("🔌 Deepgram SDK connection closed.");
    });

    connection.on(LiveTranscriptionEvents.Error, (error) => {
      console.error("❌ Deepgram SDK error:", error);
      ws.send(
        JSON.stringify({ type: "error", error: "Speech recognition error" })
      );
    });
  };

  // Start Deepgram
  startDeepgramConnection();

  ws.on("message", (message, isBinary) => {
    if (isBinary) {
      console.log("📦 Received audio chunk:", message.length);

      sessionAudioBuffer = Buffer.concat([sessionAudioBuffer, message]);

      if (connection) {
        connection.send(message);
      } else {
        pendingAudioChunks.push(message);
      }
    } else {
      try {
        const control = JSON.parse(message.toString());
        console.log("🎮 Control message:", control);

        if (control.conversation_id) {
          conversation_id = control.conversation_id;
          console.log("📝 Using existing conversation:", conversation_id);
        }

        if (control.type === "control") {
          if (control.action === "stop") {
            console.log("🛑 Stop recording requested");

            if (currentTranscript && currentTranscript.trim().length > 0) {
              processFinalTranscript(currentTranscript);
            }

            if (connection) {
              connection.finish();
            }
          } else if (control.action === "start") {
            console.log("▶️ Start recording requested");

            if (!connection) {
              startDeepgramConnection();
            }
          }
        }
      } catch (error) {
        console.error("❌ Error parsing control message:", error);
      }
    }
  });

  ws.on("close", () => {
    console.log("🔌 Client disconnected");
    if (connection) {
      connection.finish();
    }
  });
};

module.exports = {
  handleFinalUpload,
  handleLiveVoiceMessage,
};
