const express = require("express");
const { handleFinalUpload } = require("../controllers/voiceController");
const verifyToken = require("../middleware/authMiddleware");

const router = express.Router();

router.get("/", verifyToken, (req, res) => {
  res.send("🎙️ Voice route active.");
});

// REST endpoint for audio file upload
router.post("/upload", verifyToken, handleFinalUpload);

module.exports = router;
