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

// const fetch = require('node-fetch'); // Required if you're using fetch in Node <18

const generateTTS = async (text, voice = 'af_heart', speed = 1.0) => {
  try {
    const response = await fetch('https://composed-singular-seagull.ngrok-free.app/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, voice, speed }),
    });

    if (!response.ok) throw new Error(`TTS failed: ${response.status}`);

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    return buffer;
  } catch (err) {
    console.error("❌ TTS generation failed:", err.message);
    return null;
  }
};



// working 
// const handleFinalUpload = (req, res) => {
//   upload(req, res, async (err) => {
//     if (err) {
//       console.error("❌ Upload error:", err);
//       return res.status(500).json({ error: "Upload failed" });
//     }

//     const buffer = req.file.buffer;
//     const fileName = `${uuidv4()}_${req.file.originalname}`;
//     const ftpPath = "/fileuploads/audio";

//     try {
//       // Upload audio to FTP
//       const publicUrl = await uploadToFTP(buffer, `${ftpPath}/${fileName}`);
//       console.log("✅ File uploaded to FTP:", publicUrl);

//       // Transcribe uploaded audio
//       const response = await deepgram.listen.prerecorded.transcribeFile(
//         buffer,
//         {
//           model: "nova-3",
//           language: "en-US",
//           smart_format: true,
//           punctuate: true,
//         }
//       );

//       const data = response;
//       const transcript =
//         data.result?.results?.channels?.[0]?.alternatives?.[0]?.transcript;

//       if (!transcript) {
//         console.error(
//           "❌ Deepgram transcription failed: No transcript found",
//           data
//         );
//         return res.status(500).json({ error: "Transcription failed" });
//       }

//       // For file upload, just return transcript and audio URL without DB storage
//       console.log("📄 Final transcript:", transcript);
//       return res.json({
//         transcript,
//         audio_url: publicUrl,
//       });
//     } catch (err) {
//       console.error("❌ Deepgram transcription failed:", err.message);
//       return res.status(500).json({ error: "Transcription failed" });
//     }
//   });
// };

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

// live voice deepgram
// const handleLiveVoiceMessage = async (ws, user_id) => {
//   console.log("🔵 New live voice WebSocket connection for user:", user_id);

//   const deepgramApiKey = process.env.DEEPGRAM_API_KEY;
//   const deepgram = createClient(deepgramApiKey);
//   let conversation_id = null;
//   let sessionAudioBuffer = Buffer.alloc(0);
//   let currentTranscript = "";
//   let connection = null;
//   let pendingAudioChunks = [];

//   // Helper function to process final transcript
//   const processFinalTranscript = async (transcript) => {
//     if (!transcript || transcript.trim() === "") return;
//     console.log("📝 Processing final transcript:", transcript);

//     ws.send(JSON.stringify({ type: "processing", status: "started" }));

//     try {
//       if (!conversation_id) {
//         const title =
//           transcript.length > 50
//             ? transcript.substring(0, 47) + "..."
//             : transcript;
//         const [result] = await db.query(
//           "INSERT INTO conversations (user_id, name) VALUES (?, ?)",
//           [user_id, title]
//         );
//         conversation_id = result.insertId;
//         console.log("🆕 Created new conversation:", conversation_id);

//         ws.send(
//           JSON.stringify({
//             type: "conversation_created",
//             conversation_id,
//           })
//         );
//       }

//       const [historyResults] = await db.query(
//         "SELECT user_message, response, extracted_text FROM chat_history WHERE conversation_id = ? ORDER BY created_at ASC",
//         [conversation_id]
//       );

//       const chatHistory = [];
//       const documentContext = [];

//       for (const item of historyResults) {
//         if (item.user_message)
//           chatHistory.push({ role: "user", content: item.user_message });
//         if (item.response)
//           chatHistory.push({ role: "assistant", content: item.response });
//         if (item.extracted_text) documentContext.push(item.extracted_text);
//       }

//       const systemPrompt = {
//         role: "system",
//         content: `You are Quantumhash AI. Today's date is ${new Date().toLocaleDateString()}.`,
//       };

//       const finalMessages = [systemPrompt, ...chatHistory.slice(-10)];

//       if (documentContext.length > 0) {
//         finalMessages.push({
//           role: "system",
//           content: `DOCUMENT CONTEXT:\n${documentContext
//             .join("\n---\n")
//             .slice(0, 5000)}`,
//         });
//       }

//       finalMessages.push({ role: "user", content: transcript });

//       const aiProvider = process.env.USE_OPENAI === "true" ? openai : deepseek;
//       const model =
//         process.env.USE_OPENAI === "true" ? "gpt-4" : "deepseek-chat";

//       let aiResponse = "";
//       try {
//         const aiResult = await aiProvider.chat.completions.create({
//           model,
//           messages: finalMessages,
//           temperature: 0.7,
//           max_tokens: 1500,
//         });

//         aiResponse =
//           aiResult.choices?.[0]?.message?.content ||
//           "I couldn't generate a response.";
//       } catch (err) {
//         console.error("❌ AI generation error:", err);
//         aiResponse = "I'm having trouble processing your request right now.";
//       }

//       let audioUrl = null;
//       if (sessionAudioBuffer.length > 0) {
//         try {
//           const fileName = `voice_${uuidv4()}.webm`;
//           audioUrl = await uploadToFTP(
//             sessionAudioBuffer,
//             `/fileuploads/audio/${fileName}`
//           );
//           console.log("✅ Audio uploaded to FTP:", audioUrl);
//           sessionAudioBuffer = Buffer.alloc(0);
//         } catch (ftpError) {
//           console.error("❌ FTP upload error:", ftpError);
//         }
//       }

//       await db.query(
//         "INSERT INTO chat_history (conversation_id, user_message, response, audio_url, created_at) VALUES (?, ?, ?, ?, NOW())",
//         [conversation_id, transcript, aiResponse, audioUrl]
//       );

//       ws.send(
//         JSON.stringify({
//           type: "userMessage",
//           message: transcript,
//           audioUrl,
//           conversation_id,
//         })
//       );

//       ws.send(
//         JSON.stringify({
//           type: "aiMessage",
//           message: aiResponse,
//           conversation_id,
//         })
//       );

//       currentTranscript = "";
//     } catch (error) {
//       console.error("❌ Error processing transcript:", error);
//       ws.send(
//         JSON.stringify({
//           type: "error",
//           error: "Failed to process your message",
//         })
//       );
//     }
//   };

//   // Create Deepgram connection
//   const startDeepgramConnection = () => {
//     console.log("🔄 Connecting to Deepgram via SDK...");

//     connection = deepgram.listen.live({
//       encoding: "opus",          // <<<< IMPORTANT
//       sample_rate: 48000,    
//       smart_format: true,
//       model: "nova-3",
//       language: "en-US",
//       punctuate: true,
//       interim_results: true,
//     });

//     connection.on(LiveTranscriptionEvents.Open, () => {
//       console.log("✅ Deepgram SDK connection opened.");
//       // Flush pending audio
//       if (pendingAudioChunks.length > 0) {
//         for (const chunk of pendingAudioChunks) {
//           connection.send(chunk);
//         }
//         pendingAudioChunks = [];
//       }
//       ws.send(JSON.stringify({ type: "ready", status: "connected" }));
//     });

//     connection.on(LiveTranscriptionEvents.Transcript, (data) => {
//       try {
//         const transcript = data.channel.alternatives[0]?.transcript?.trim();
//         const isFinal = data.is_final;

//         if (transcript) {
//           console.log(`📝 Transcript [final=${isFinal}]:`, transcript);
//           currentTranscript = transcript;

//           ws.send(
//             JSON.stringify({
//               type: "interim",
//               transcript,
//               is_final: isFinal,
//             })
//           );

//           if (isFinal && transcript.length > 3) {
//             processFinalTranscript(transcript);
//           }
//         }
//       } catch (error) {
//         console.error("❌ Error handling Deepgram transcript:", error);
//       }
//     });

//     connection.on(LiveTranscriptionEvents.Close, () => {
//       console.log("🔌 Deepgram SDK connection closed.");
//     });

//     connection.on(LiveTranscriptionEvents.Error, (error) => {
//       console.error("❌ Deepgram SDK error:", error);
//       ws.send(
//         JSON.stringify({ type: "error", error: "Speech recognition error" })
//       );
//     });
//   };

//   // Start Deepgram
//   startDeepgramConnection();

//   ws.on("message", (message, isBinary) => {
//     if (isBinary) {
//       console.log("📦 Received audio chunk:", message.length);

//       sessionAudioBuffer = Buffer.concat([sessionAudioBuffer, message]);

//       if (connection) {
//         connection.send(message);
//       } else {
//         pendingAudioChunks.push(message);
//       }
//     } else {
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

//             if (currentTranscript && currentTranscript.trim().length > 0) {
//               processFinalTranscript(currentTranscript);
//             }

//             if (connection) {
//               connection.finish();
//             }
//           } else if (control.action === "start") {
//             console.log("▶️ Start recording requested");

//             if (!connection) {
//               startDeepgramConnection();
//             }
//           }
//         }
//       } catch (error) {
//         console.error("❌ Error parsing control message:", error);
//       }
//     }
//   });

//   ws.on("close", () => {
//     console.log("🔌 Client disconnected");
//     if (connection) {
//       connection.finish();
//     }
//   });
// };

// const { createClient, LiveTranscriptionEvents } = require("@deepgram/sdk");
// const { v4: uuidv4 } = require("uuid");
// const db = require("../db");
// const { uploadToFTP } = require("../utils/ftp");
// const { openai, deepseek } = require("../utils/aiClients");

// const handleLiveVoiceMessage = async (ws, user_id) => {
//   console.log("🔵 New live voice WebSocket connection for user:", user_id);

//   const deepgramApiKey = process.env.DEEPGRAM_API_KEY;
//   const deepgram = createClient(deepgramApiKey);
//   let conversation_id = null;
//   let sessionAudioBuffer = Buffer.alloc(0);
//   let currentTranscript = "";
//   let connection = null;
//   let pendingAudioChunks = [];

//   // Helper function to process final transcript
//   const processFinalTranscript = async (transcript) => {
//     if (!transcript || transcript.trim() === "") return;
//     console.log("📝 Processing final transcript:", transcript);

//     ws.send(JSON.stringify({ type: "processing", status: "started" }));

//     try {
//       if (!conversation_id) {
//         const title =
//           transcript.length > 50
//             ? transcript.substring(0, 47) + "..."
//             : transcript;
//         const [result] = await db.query(
//           "INSERT INTO conversations (user_id, name) VALUES (?, ?)",
//           [user_id, title]
//         );
//         conversation_id = result.insertId;
//         console.log("🆕 Created new conversation:", conversation_id);

//         ws.send(
//           JSON.stringify({
//             type: "conversation_created",
//             conversation_id,
//           })
//         );
//       }

//       const [historyResults] = await db.query(
//         "SELECT user_message, response, extracted_text FROM chat_history WHERE conversation_id = ? ORDER BY created_at ASC",
//         [conversation_id]
//       );

//       const chatHistory = [];
//       const documentContext = [];

//       for (const item of historyResults) {
//         if (item.user_message)
//           chatHistory.push({ role: "user", content: item.user_message });
//         if (item.response)
//           chatHistory.push({ role: "assistant", content: item.response });
//         if (item.extracted_text) documentContext.push(item.extracted_text);
//       }

//       const systemPrompt = {
//         role: "system",
//         content: `You are Quantumhash AI. Today's date is ${new Date().toLocaleDateString()}.`,
//       };

//       const finalMessages = [systemPrompt, ...chatHistory.slice(-10)];

//       if (documentContext.length > 0) {
//         finalMessages.push({
//           role: "system",
//           content: `DOCUMENT CONTEXT:\n${documentContext
//             .join("\n---\n")
//             .slice(0, 5000)}`,
//         });
//       }

//       finalMessages.push({ role: "user", content: transcript });

//       const aiProvider = process.env.USE_OPENAI === "true" ? openai : deepseek;
//       const model =
//         process.env.USE_OPENAI === "true" ? "gpt-4" : "deepseek-chat";

//       let aiResponse = "";
//       try {
//         const aiResult = await aiProvider.chat.completions.create({
//           model,
//           messages: finalMessages,
//           temperature: 0.7,
//           max_tokens: 1500,
//         });

//         aiResponse =
//           aiResult.choices?.[0]?.message?.content ||
//           "I couldn't generate a response.";
//       } catch (err) {
//         console.error("❌ AI generation error:", err);
//         aiResponse = "I'm having trouble processing your request right now.";
//       }

//       let audioUrl = null;
//       if (sessionAudioBuffer.length > 0) {
//         try {
//           const fileName = `voice_${uuidv4()}.webm`;
//           audioUrl = await uploadToFTP(
//             sessionAudioBuffer,
//             `/fileuploads/audio/${fileName}`
//           );
//           console.log("✅ Audio uploaded to FTP:", audioUrl);
//           sessionAudioBuffer = Buffer.alloc(0);
//         } catch (ftpError) {
//           console.error("❌ FTP upload error:", ftpError);
//         }
//       }

//       await db.query(
//         "INSERT INTO chat_history (conversation_id, user_message, response, audio_url, created_at) VALUES (?, ?, ?, ?, NOW())",
//         [conversation_id, transcript, aiResponse, audioUrl]
//       );

//       ws.send(
//         JSON.stringify({
//           type: "userMessage",
//           message: transcript,
//           audioUrl,
//           conversation_id,
//         })
//       );

//       ws.send(
//         JSON.stringify({
//           type: "aiMessage",
//           message: aiResponse,
//           conversation_id,
//         })
//       );

//       currentTranscript = "";
//     } catch (error) {
//       console.error("❌ Error processing transcript:", error);
//       ws.send(
//         JSON.stringify({
//           type: "error",
//           error: "Failed to process your message",
//         })
//       );
//     }
//   };

//   // Create Deepgram connection
//   const startDeepgramConnection = () => {
//     console.log("🔄 Connecting to Deepgram via SDK...");

//     connection = deepgram.listen.live({
//       encoding: "opus",
//       sample_rate: 48000,
//       smart_format: true,
//       model: "nova-3",
//       language: "en-US",
//       punctuate: true,
//       interim_results: true,
//     });

//     connection.on(LiveTranscriptionEvents.Open, () => {
//       console.log("✅ Deepgram SDK connection opened.");
//       if (pendingAudioChunks.length > 0) {
//         for (const chunk of pendingAudioChunks) {
//           connection.send(chunk);
//         }
//         pendingAudioChunks = [];
//       }
//       ws.send(JSON.stringify({ type: "ready", status: "connected" }));
//     });

//     connection.on(LiveTranscriptionEvents.Transcript, (data) => {
//       console.log("data" , data);
//       // console.dir(data, { depth: null }); // expanded view of full Deepgram result

//       try {
//         const transcript = data.channel.alternatives[0]?.transcript?.trim();
//         console.log("🔊 Deepgram transcript:", transcript);
//         // console.log(`📝 Transcript [final=${data.is_final}]: "${transcript}"`);
//         const isFinal = data.is_final;

//         if (transcript) {
//           console.log(`📝 Transcript [final=${isFinal}]:`, transcript);
//           currentTranscript = transcript;

//           ws.send(
//             JSON.stringify({
//               type: "interim",
//               transcript,
//               is_final: isFinal,
//             })
//           );

//           if (isFinal && transcript.length > 3) {
//             processFinalTranscript(transcript);
//           }
//         }
//       } catch (error) {
//         console.error("❌ Error handling Deepgram transcript:", error);
//       }
//     });

//     connection.on(LiveTranscriptionEvents.Close, () => {
//       console.log("🔌 Deepgram SDK connection closed.");
//     });

//     connection.on(LiveTranscriptionEvents.Error, (error) => {
//       console.error("❌ Deepgram SDK error:", error);
//       ws.send(
//         JSON.stringify({ type: "error", error: "Speech recognition error" })
//       );
//     });
//   };

//   // Start Deepgram
//   startDeepgramConnection();

//   ws.on("message", (message, isBinary) => {
//     if (isBinary) {
//       console.log("📦 Received audio chunk:", message.length);
//       sessionAudioBuffer = Buffer.concat([sessionAudioBuffer, message]);

//       if (connection) {
//         connection.send(message);
//       } else {
//         pendingAudioChunks.push(message);
//       }
//     } else {
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
//             if (currentTranscript && currentTranscript.trim().length > 0) {
//               processFinalTranscript(currentTranscript);
//             }
//             if (connection) {
//               connection.finish();
//             }
//           } else if (control.action === "start") {
//             console.log("▶️ Start recording requested");
//             if (!connection) {
//               startDeepgramConnection();
//             }
//           }
//         }

//         // ✅ NEW: Handle transcribe messages with base64 audio
//         if (control.type === "transcribe" && control.audio_data) {
//           try {
//             const audioBuffer = Buffer.from(control.audio_data, "base64");
//             sessionAudioBuffer = Buffer.concat([
//               sessionAudioBuffer,
//               audioBuffer,
//             ]);

//             if (connection) {
//               connection.send(audioBuffer);
//             } else {
//               pendingAudioChunks.push(audioBuffer);
//             }
//           } catch (err) {
//             console.error("❌ Error decoding audio_data:", err);
//           }
//         }
//       } catch (error) {
//         console.error("❌ Error parsing control message:", error);
//       }
//     }
//   });

//   ws.on("close", () => {
//     console.log("🔌 Client disconnected");
//     if (connection) {
//       connection.finish();
//     }
//   });
// };

 


// const axios = require("axios");
// // const { v4: uuidv4 } = require("uuid");
// const fs = require("fs");
// const FormData = require("form-data");

// own server for voice



// const handleLiveVoiceMessage = async (ws, user_id) => {
//   console.log("🔵 New live voice WebSocket connection for user:", user_id);

//   let conversation_id = null;

//   const processFinalTranscript = async (transcript, audioBuffer) => {
//     if (!transcript || transcript.trim() === "") return;

//     console.log("📝 Processing final transcript:", transcript);
//     ws.send(JSON.stringify({ type: "processing", status: "started" }));

//     try {
//       // Create new conversation if one doesn't exist
//       if (!conversation_id) {
//         const title = transcript.length > 50 ? transcript.substring(0, 47) + "..." : transcript;
//         const [result] = await db.query(
//           "INSERT INTO conversations (user_id, name) VALUES (?, ?)",
//           [user_id, title]
//         );
//         conversation_id = result.insertId;

//         ws.send(JSON.stringify({
//           type: "conversation_created",
//           conversation_id,
//         }));
//       }

//       // Load recent chat history and document context
//       const [historyResults] = await db.query(
//         `SELECT user_message, response, extracted_text
//          FROM chat_history
//          WHERE conversation_id = ?
//          ORDER BY created_at ASC`,
//         [conversation_id]
//       );

//       const chatHistory = [];
//       const documentContext = [];

//       for (const item of historyResults) {
//         if (item.user_message)
//           chatHistory.push({ role: "user", content: item.user_message });
//         if (item.response)
//           chatHistory.push({ role: "assistant", content: item.response });
//         if (item.extracted_text)
//           documentContext.push(item.extracted_text);
//       }

//       const finalMessages = [
//         {
//           role: "system",
//           content: `You are Quantumhash AI. Today's date is ${new Date().toLocaleDateString()}.`
//         },
//         ...chatHistory.slice(-10)
//       ];

//       if (documentContext.length > 0) {
//         finalMessages.push({
//           role: "system",
//           content: `DOCUMENT CONTEXT:\n${documentContext.join("\n---\n").slice(0, 5000)}`
//         });
//       }

//       finalMessages.push({ role: "user", content: transcript });

//       // AI response generation
//       const aiProvider = process.env.USE_OPENAI === "true" ? openai : deepseek;
//       const model = process.env.USE_OPENAI === "true" ? "gpt-4" : "deepseek-chat";

//       let aiResponse = "";
//       try {
//         const aiResult = await aiProvider.chat.completions.create({
//           model,
//           messages: finalMessages,
//           temperature: 0.7,
//           max_tokens: 1500,
//         });

//         aiResponse = aiResult.choices?.[0]?.message?.content || "I couldn't generate a response.";
//       } catch (err) {
//         console.error("❌ AI generation error:", err);
//         aiResponse = "I'm having trouble processing your request right now.";
//       }

//       // Upload audio to FTP
//       let audioUrl = null;
//       if (audioBuffer && audioBuffer.length > 0) {
//         console.log("🔊 Sending transcription request with size:", audioBuffer.length);

//         try {
//           const fileName = `voice_${uuidv4()}.webm`;
//           audioUrl = await uploadToFTP(audioBuffer, `/fileuploads/audio/${fileName}`);
//           console.log("✅ Audio uploaded to FTP:", audioUrl);
//         } catch (ftpError) {
//           console.error("❌ FTP upload error:", ftpError);
//         }
//       }

//       // Save full chat entry
//       await db.query(
//         `INSERT INTO chat_history (conversation_id, user_message, response, audio_url, created_at)
//          VALUES (?, ?, ?, ?, NOW())`,
//         [conversation_id, transcript, aiResponse, audioUrl]
//       );

//       // Send back to client
//       ws.send(JSON.stringify({
//         type: "userMessage",
//         message: transcript,
//         audioUrl,
//         conversation_id,
//       }));

//       ws.send(JSON.stringify({
//         type: "aiMessage",
//         message: aiResponse,
//         conversation_id,
//       }));

//     } catch (error) {
//       console.error("❌ Error processing transcript:", error);
//       ws.send(JSON.stringify({
//         type: "error",
//         error: "Failed to process your message"
//       }));
//     }
//   };

//   ws.on("message", async (message, isBinary) => {
//     try {
//       const raw = message.toString();
//       let data;

//       try {
//         data = JSON.parse(raw);
//       } catch (err) {
//         console.error("❌ Invalid JSON message:", raw);
//         ws.send(JSON.stringify({ type: "error", error: "Malformed JSON message." }));
//         return;
//       }

//       if (data.type === "transcribe") {
//         if (!data.audio_data || typeof data.audio_data !== "string") {
//           console.error("❌ Missing or invalid audio_data field.");
//           ws.send(JSON.stringify({ type: "error", error: "Missing or invalid audio_data." }));
//           return;
//         }

//         const audioBuffer = Buffer.from(data.audio_data, "base64");

//         try {
//           const response = await fetch("https://purely-darling-finch.ngrok-free.app/transcribe", {
//             method: "POST",
//             headers: { "Content-Type": "application/json" },
//             body: JSON.stringify({ audio_data: data.audio_data })
//           });
//           console.log("response",response);
//           if (!response.ok) {
//             throw new Error(`HTTP ${response.status} - ${response.statusText}`);
//           }

//           const result = await response.json();
//           const transcription = result.transcription;
//         console.log("🟢 Transcription:", transcription);
//           if (transcription && transcription.trim().length > 3) {
//             await processFinalTranscript(transcription, audioBuffer);
//           } else {
//             console.log("🟡 Transcription too short or empty, skipping.");
//           }
//         } catch (err) {
//           console.error("❌ Transcription server error:", err.message);
//           ws.send(JSON.stringify({ type: "error", error: "Transcription server error" }));
//         }

//       } 
//       // else if (data.type === "control" && data.conversation_id) {
//       //   conversation_id = data.conversation_id;
//       //   console.log("🔁 Set conversation_id to:", conversation_id);
//       // } else {
//       //   console.warn("⚠️ Unrecognized message type:", data.type);
//       //   ws.send(JSON.stringify({ type: "error", error: "Unsupported message type." }));
//       // }
//       else if (data.type === "control") {
//         if (data.action === "stop") {
//           console.log("🛑 Received stop signal from client.");
//           // Optionally handle stopping transcription/recording logic
//         } else if (data.conversation_id) {
//           conversation_id = data.conversation_id;
//           console.log("🔁 Set conversation_id to:", conversation_id);
//         } else {
//           console.warn("⚠️ 'control' message received with unknown payload:", data);
//         }
//       }
      
//     } catch (error) {
//       console.error("❌ WebSocket message error:", error);
//       ws.send(JSON.stringify({ type: "error", error: "Invalid or failed message processing." }));
//     }
//   });

//   ws.on("close", () => {
//     console.log("🔌 Client disconnected");
//   });
// };


// working 08/05/2025 
// const handleLiveVoiceMessage = async (ws, user_id) => {
//   console.log("🔵 New live voice WebSocket connection for user:", user_id);

//   let conversation_id = null;

//   // Function to process the final transcript
//   const processFinalTranscript = async (transcript, audioBuffer) => {
//     if (!transcript || transcript.trim() === "") return;

//     console.log("📝 Processing final transcript:", transcript);
//     ws.send(JSON.stringify({ type: "processing", status: "started" }));

//     try {
//       // Create new conversation if one doesn't exist
//       if (!conversation_id) {
//         const title = transcript.length > 50 ? transcript.substring(0, 47) + "..." : transcript;
//         const [result] = await db.query(
//           "INSERT INTO conversations (user_id, name) VALUES (?, ?)",
//           [user_id, title]
//         );
//         conversation_id = result.insertId;

//         ws.send(JSON.stringify({
//           type: "conversation_created",
//           conversation_id,
//         }));
//       }

//       // Load recent chat history and document context
//       const queryResult = await db.query(
//         `SELECT user_message, response, extracted_text
//          FROM chat_history
//          WHERE conversation_id = ?
//          ORDER BY created_at ASC`,
//         [conversation_id]
//       );
//       const historyResults = Array.isArray(queryResult[0]) ? queryResult[0] : [];
//       const chatHistory = [];
//       const documentContext = [];

//       for (const item of historyResults) {
//         if (item.user_message)
//           chatHistory.push({ role: "user", content: item.user_message });
//         if (item.response)
//           chatHistory.push({ role: "assistant", content: item.response });
//         if (item.extracted_text)
//           documentContext.push(item.extracted_text);
//       }

//       const finalMessages = [
//         {
//           role: "system",
//           content: `You are Quantumhash AI. Today's date is ${new Date().toLocaleDateString()}.`
//         },
//         ...chatHistory.slice(-10)
//       ];

//       if (documentContext.length > 0) {
//         finalMessages.push({
//           role: "system",
//           content: `DOCUMENT CONTEXT:\n${documentContext.join("\n---\n").slice(0, 5000)}`
//         });
//       }

//       finalMessages.push({ role: "user", content: transcript });

//       // AI response generation
//       const aiProvider = process.env.USE_OPENAI === "true" ? openai : deepseek;
//       const model = process.env.USE_OPENAI === "true" ? "gpt-4" : "deepseek-chat";

//       let aiResponse = "";
//       try {
//         const aiResult = await aiProvider.chat.completions.create({
//           model,
//           messages: finalMessages,
//           temperature: 0.7,
//           max_tokens: 1500,
//         });
//         console.log("🔊 AI response:", aiResponse);
//         aiResponse = aiResult.choices?.[0]?.message?.content || "I couldn't generate a response.";
//       } catch (err) {
//         console.error("❌ AI generation error:", err);
//         aiResponse = "I'm having trouble processing your request right now.";
//       }

//       // Upload audio to FTP
//       let audioUrl = null;
//       if (audioBuffer && audioBuffer.length > 0) {
//         console.log("🔊 Sending transcription request with size:", audioBuffer.length);

//         try {
//           const fileName = `voice_${uuidv4()}.webm`;
//           audioUrl = await uploadToFTP(audioBuffer, `/fileuploads/audio/${fileName}`);
//           console.log("✅ Audio uploaded to FTP:", audioUrl);
//         } catch (ftpError) {
//           console.error("❌ FTP upload error:", ftpError);
//         }
//       }

//       // Save full chat entry
//       await db.query(
//         `INSERT INTO chat_history (conversation_id, user_message, response, audio_url, created_at)
//          VALUES (?, ?, ?, ?, NOW())`,
//         [conversation_id, transcript, aiResponse, audioUrl]
//       );

//       // Send back to client
//       ws.send(JSON.stringify({
//         type: "userMessage",
//         message: transcript,
//         audioUrl,
//         conversation_id,
//       }));

//       ws.send(JSON.stringify({
//         type: "aiMessage",
//         message: aiResponse,
//         conversation_id,
//       }));

//     } catch (error) {
//       console.error("❌ Error processing transcript:", error);
//       ws.send(JSON.stringify({
//         type: "error",
//         error: "Failed to process your message"
//       }));
//     }
//   };

//   ws.on("message", async (message, isBinary) => {
//     try {
//       const raw = message.toString();
//       let data;

//       try {
//         data = JSON.parse(raw);
//       } catch (err) {
//         console.error("❌ Invalid JSON message:", raw);
//         ws.send(JSON.stringify({ type: "error", error: "Malformed JSON message." }));
//         return;
//       }

//       if (data.type === "transcribe") {
//         if (!data.audio_data || typeof data.audio_data !== "string") {
//           console.error("❌ Missing or invalid audio_data field.");
//           ws.send(JSON.stringify({ type: "error", error: "Missing or invalid audio_data." }));
//           return;
//         }

//         const audioBuffer = Buffer.from(data.audio_data, "base64");

//         try {
//           const response = await fetch("https://purely-darling-finch.ngrok-free.app/transcribe", {
//             method: "POST",
//             headers: { "Content-Type": "application/json" },
//             body: JSON.stringify({ audio_data: data.audio_data })
//           });
//           console.log("response",response);
//           if (!response.ok) {
//             throw new Error(`HTTP ${response.status} - ${response.statusText}`);
//           }

//           const result = await response.json();
//           const transcription = result.transcription;
//           console.log("🟢 Transcription:", transcription);

//           if (transcription && transcription.trim().length > 3) {
//             await processFinalTranscript(transcription, audioBuffer);
//           } else {
//             console.log("🟡 Transcription too short or empty, skipping.");
//           }
//         } catch (err) {
//           console.error("❌ Transcription server error:", err.message);
//           ws.send(JSON.stringify({ type: "error", error: "Transcription server error" }));
//         }

//       } else if (data.type === "control") {
//         if (data.action === "stop") {
//           console.log("🛑 Received stop signal from client.");
//           // Optionally handle stopping transcription/recording logic
//         } else if (data.conversation_id) {
//           conversation_id = data.conversation_id;
//           console.log("🔁 Set conversation_id to:", conversation_id);
//         } else {
//           console.warn("⚠️ 'control' message received with unknown payload:", data);
//         }
//       }

//     } catch (error) {
//       console.error("❌ WebSocket message error:", error);
//       ws.send(JSON.stringify({ type: "error", error: "Invalid or failed message processing." }));
//     }
//   });

//   ws.on("close", () => {
//     console.log("🔌 Client disconnected");
//   });
// };

// test 

// working live voice 
const handleLiveVoiceMessage = async (ws, user_id) => {
  console.log("🔵 WebSocket connection started for user:", user_id);

  let conversation_id = null;
  let isStopped = false;
  let isProcessing = false; // 🚫 Prevent concurrent transcribes

  const processFinalTranscript = async (transcript, audioBuffer) => {
    if (!transcript || transcript.trim().length < 4) {
      console.log("⚠️ No valid transcription detected.");
      ws.send(JSON.stringify({ type: "aiMessage", message: "Sorry, I couldn’t hear that clearly. Please try again." }));
      return;
    }
// ✅ Send user message to frontend immediately
  ws.send(JSON.stringify({
    type: "userMessage",
    message: transcript,
    conversation_id,
  }));

  // ✅ Tell frontend we're processing response
    ws.send(JSON.stringify({ type: "processing", status: "started" }));

    try {
      // ✅ Create new conversation if needed
      // if (!conversation_id) {
      //   const title = transcript.length > 50 ? transcript.substring(0, 47) + "..." : transcript;
      //   const [result] = await db.query(
      //     "INSERT INTO conversations (user_id, name) VALUES (?, ?)",
      //     [user_id, title]
      //   );
      //   conversation_id = result.insertId;
      //   ws.send(JSON.stringify({
      //     type: "conversation_created",
      //     conversation_id,
      //   }));
      // }

      // 🔄 Load previous chat history
      const [rows] = await db.query(
        `SELECT user_message, response, extracted_text
         FROM chat_history
         WHERE conversation_id = ?
         ORDER BY created_at DESC
         LIMIT 10`,
        [conversation_id]
      );

      const historyResults = Array.isArray(rows) ? rows : [];
      const chatHistory = [];
      const documentContext = [];

      for (const item of historyResults.reverse()) {
        if (item.user_message) chatHistory.push({ role: "user", content: item.user_message });
        if (item.response) chatHistory.push({ role: "assistant", content: item.response });
        if (item.extracted_text) documentContext.push(item.extracted_text);
      }

      const finalMessages = [
        {
          role: "system",
          content: `You are Quantumhash AI. Today's date is ${new Date().toLocaleDateString()}.`
        },
        ...chatHistory
      ];

      if (documentContext.length > 0) {
        finalMessages.push({
          role: "system",
          content: `DOCUMENT CONTEXT:\n${documentContext.join("\n---\n").slice(0, 5000)}`
        });
      }

      finalMessages.push({ role: "user", content: transcript });

      const aiProvider = process.env.USE_OPENAI === "true" ? openai : deepseek;
      const model = process.env.USE_OPENAI === "true" ? "gpt-4" : "deepseek-chat";

      let aiResponse = "I'm having trouble generating a response.";
      try {
        const aiResult = await aiProvider.chat.completions.create({
          model,
          messages: finalMessages,
          temperature: 0.7,
          max_tokens: 6000,
        });
        aiResponse = aiResult.choices?.[0]?.message?.content || aiResponse;
               // 🔊 Generate TTS audio from AI response
      const ttsBuffer = await generateTTS(aiResponse);
      

            if (ttsBuffer) {
        ws.send(JSON.stringify({
          type: "ttsAudio",
          audio_data: ttsBuffer.toString("base64"),
          format: "audio/wav",
          conversation_id,
        }));

        // ⏳ Optional: Wait for audio to start playing before sending text (500ms delay)
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      // 💬 Send AI text response after a short delay
      ws.send(JSON.stringify({
        type: "aiMessage",
        message: aiResponse,
        conversation_id,
      }));
      } catch (err) {
        console.error("❌ AI error:", err.message);
      }

      

      // ✅ Save only if there is a valid transcript
      if (transcript.trim().length >= 4) {
        (async () => {
          try {
            let audioUrl = null;
            if (audioBuffer?.length > 0) {
              const fileName = `voice_${uuidv4()}.webm`;
              audioUrl = await uploadToFTP(audioBuffer, `/fileuploads/audio/${fileName}`);
              console.log("✅ Audio uploaded:", audioUrl);
            }

            await db.query(
              `INSERT INTO chat_history (conversation_id, user_message, response, audio_url, created_at)
               VALUES (?, ?, ?, ?, NOW())`,
              [conversation_id, transcript, aiResponse, audioUrl]
            );
            console.log("💾 Chat saved.");
          } catch (err) {
            console.error("❌ Error in DB/FTP saving:", err.message);
          }
        })();
      }

    } catch (error) {
      console.error("❌ Final transcript processing error:", error);
      ws.send(JSON.stringify({
        type: "error",
        error: "Something went wrong while processing your voice message.",
      }));
    } finally {
      isProcessing = false; // 🔓 Unlock for next message
    }
  };

  ws.on("message", async (message) => {
    try {
      const raw = message.toString();
      let data;

      try {
        data = JSON.parse(raw);
      } catch (err) {
        ws.send(JSON.stringify({ type: "error", error: "Invalid JSON format." }));
        return;
      }

      // 🎤 Handle incoming audio
      if (data.type === "transcribe") {
        if (isStopped) return;
        if (isProcessing) {
          console.log("⏳ Still processing previous audio...");
          return;
        }

        if (!data.audio_data || typeof data.audio_data !== "string") {
          ws.send(JSON.stringify({ type: "error", error: "Missing or invalid audio data." }));
          return;
        }

        const audioBuffer = Buffer.from(data.audio_data, "base64");
        isProcessing = true;

        try {
          const response = await fetch("https://clean-guided-gar.ngrok-free.app/transcribe", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ audio_data: data.audio_data })
          });

          if (!response.ok) throw new Error(`HTTP ${response.status}`);

          const result = await response.json();
          const transcription = result.transcription?.trim();
          console.log("🟢 Transcription:", transcription);

          if (!transcription || transcription.length < 4) {
            console.log("⚠️ Transcription too short. Waiting for next audio...");
            ws.send(JSON.stringify({
              type: "transcriptionTooShort",
              message: "Transcription too short. Waiting for next audio...",
            }));
            isProcessing = false; // Unlock for next message
            return;
          }
          
          

          await processFinalTranscript(transcription, audioBuffer);

        } catch (err) {
          console.error("❌ Transcription failed:", err.message);
          isProcessing = false;
          ws.send(JSON.stringify({ type: "aiMessage", message: "Sorry, I couldn’t get you. Can you please speak again." }));
        }

      } else if (data.type === "control") {
        if (data.action === "stop") {
          isStopped = true;
          console.log("🛑 Voice session stopped.");
        } else if (data.conversation_id) {
          conversation_id = data.conversation_id;
          console.log("🔁 Switched to conversation:", conversation_id);
        }
      }

    } catch (err) {
      console.error("❌ WebSocket error:", err.message);
      ws.send(JSON.stringify({ type: "error", error: "Server error occurred." }));
    }
  });

  ws.on("close", () => {
    isStopped = true;
    console.log("🔌 WebSocket connection closed.");
  });
};



module.exports = {
  handleFinalUpload,
  handleLiveVoiceMessage,
};
