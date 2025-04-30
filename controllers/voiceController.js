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
