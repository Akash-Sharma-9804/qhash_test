// const { createClient, LiveTranscriptionEvents } = require("@deepgram/sdk");
// const { v4: uuidv4 } = require("uuid");
// const multer = require("multer");
// const uploadToFTP = require("../utils/ftpUploader");
// require("dotenv").config();

// const deepgram = createClient(process.env.DEEPGRAM_API_KEY);

// // --- LIVE TRANSCRIPTION VIA WEBSOCKET ---
// const handleVoiceStream = async (ws, userId) => {
//   console.log(`🎤 WebSocket connected for user: ${userId}`);

//   try {
//     const connection = deepgram.listen.live({
//       model: "nova-3",
//       language: "en-US",
//       smart_format: true,
//       interim_results: false,
//       endpointing: 500,
//     });

//     connection.on(LiveTranscriptionEvents.Open, () => {
//       console.log("🔗 Deepgram connection opened");
//     });

//     connection.on(LiveTranscriptionEvents.Transcript, (data) => {
//       const transcript = data.channel?.alternatives?.[0]?.transcript;
//       if (transcript?.length) {
//         console.log("📄 Transcript:", transcript);
//         ws.send(JSON.stringify({ type: "transcript", transcript }));
//       }
//     });

//     connection.on(LiveTranscriptionEvents.Error, (err) => {
//       console.error("💥 Deepgram error:", err);
//       ws.send(JSON.stringify({ type: "error", message: "Deepgram error" }));
//     });

//     ws.on("message", (data) => {
//       if (connection.getReadyState() === 1) {
//         connection.send(data);
//       }
//     });

//     ws.on("close", () => {
//       console.log(`❌ WebSocket closed (user: ${userId})`);
//       connection.finish();
//     });

//     ws.on("error", (err) => {
//       console.error("💥 WS Error:", err.message);
//       connection.finish();
//     });

//   } catch (err) {
//     console.error("❌ Deepgram initialization failed:", err.message);
//     ws.send(JSON.stringify({ type: "error", message: "Deepgram connection error" }));
//   }
// };

// // --- FINAL AUDIO UPLOAD + ACCURATE TRANSCRIPTION ---
// const storage = multer.memoryStorage(); // buffer to memory for FTP
// const upload = multer({ storage }).single("audio");

// const handleFinalUpload = (req, res) => {
//   upload(req, res, async (err) => {
//     if (err) {
//       console.error("❌ Upload error:", err);
//       return res.status(500).json({ error: "Upload failed" });
//     }

//     const buffer = req.file.buffer;
//     const fileName = `${uuidv4()}_${req.file.originalname}`;
//     const ftpPath = "/fileuploads/audio"; // target FTP directory

//     try {
//       // Upload audio to FTP
//       const publicUrl = await uploadToFTP(buffer, `${ftpPath}/${fileName}`);
//       console.log("✅ File uploaded to FTP:", publicUrl);

//       // Transcribe uploaded audio
//       const response = await deepgram.listen.prerecorded.transcribeFile(buffer, {
//         model: "nova-3",
//         language: "en-US",
//         smart_format: true,
//         punctuate: true,
//       });

//       const data = response; // ✅ Make sure data is assigned correctly

//       const transcript = data.result?.results?.channels?.[0]?.alternatives?.[0]?.transcript;

//       if (!transcript) {
//         console.error("❌ Deepgram transcription failed: No transcript found", data);
//         return res.status(500).json({ error: "Transcription failed" });
//       }

//       console.log("📄 Final transcript:", transcript);
//       return res.json({ transcript });

//     } catch (err) {
//       console.error("❌ Deepgram transcription failed:", err.message);
//       return res.status(500).json({ error: "Transcription failed" });
//     }
//   });
// };

// module.exports = {
//   handleVoiceStream,
//   handleFinalUpload,
// };


const { createClient } = require("@deepgram/sdk");
const { v4: uuidv4 } = require("uuid");
const multer = require("multer");
const uploadToFTP = require("../utils/ftpUploader");
require("dotenv").config();

const deepgram = createClient(process.env.DEEPGRAM_API_KEY);

// --- FINAL AUDIO UPLOAD + ACCURATE TRANSCRIPTION ---
const storage = multer.memoryStorage(); // buffer to memory for FTP
const upload = multer({ storage }).single("audio");

const handleFinalUpload = (req, res) => {
  upload(req, res, async (err) => {
    if (err) {
      console.error("❌ Upload error:", err);
      return res.status(500).json({ error: "Upload failed" });
    }

    const buffer = req.file.buffer;
    const fileName = `${uuidv4()}_${req.file.originalname}`;
    const ftpPath = "/fileuploads/audio"; // target FTP directory

    try {
      // Upload audio to FTP
      const publicUrl = await uploadToFTP(buffer, `${ftpPath}/${fileName}`);
      console.log("✅ File uploaded to FTP:", publicUrl);

      // Transcribe uploaded audio
      const response = await deepgram.listen.prerecorded.transcribeFile(buffer, {
        model: "nova-3",
        language: "en-US",
        smart_format: true,
        punctuate: true,
      });

      const data = response; // ✅ Make sure data is assigned correctly

      const transcript = data.result?.results?.channels?.[0]?.alternatives?.[0]?.transcript;

      if (!transcript) {
        console.error("❌ Deepgram transcription failed: No transcript found", data);
        return res.status(500).json({ error: "Transcription failed" });
      }

      console.log("📄 Final transcript:", transcript);
      return res.json({ transcript });

    } catch (err) {
      console.error("❌ Deepgram transcription failed:", err.message);
      return res.status(500).json({ error: "Transcription failed" });
    }
  });
};

module.exports = {
  handleFinalUpload,
};
