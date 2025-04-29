

// const express = require("express");
// const {
//   handleFinalUpload,
//   handleLiveVoiceMessage,
// } = require("../controllers/voiceController");
// const verifyToken = require("../middleware/authMiddleware");

// const router = express.Router();

// // Test route
// router.get("/", verifyToken, (req, res) => {
//   res.send("🎙️ Voice route active.");
// });

// // Final audio file upload + accurate transcription
// router.post("/upload", verifyToken, handleFinalUpload);

// // Live transcript + AI chat response
// router.post("/live", verifyToken, handleLiveVoiceMessage);

// module.exports = router;

const express = require("express");
const {
  handleFinalUpload,
  handleLiveVoiceMessage,
} = require("../controllers/voiceController");
const verifyToken = require("../middleware/authMiddleware");

const router = express.Router();

// Test route
router.get("/", verifyToken, (req, res) => {
  res.send("🎙️ Voice route active.");
});

// Final audio file upload + accurate transcription
router.post("/upload", verifyToken, handleFinalUpload);

// Informational endpoint for WebSocket connection
router.post("/live", verifyToken, handleLiveVoiceMessage);

module.exports = router;