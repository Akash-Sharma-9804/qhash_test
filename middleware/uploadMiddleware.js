const multer = require("multer");

const storage = multer.memoryStorage(); // Use memory instead of disk

exports.uploadMiddleware = multer({
  storage,
  limits: {
    fieldSize: 20 * 1024 * 1024,  // 20MB field size (plenty for most text-based chatbot uses)
    fileSize: 500 * 1024 * 1024   // 500MB per file max, if you're supporting big file uploads
  }
}).array("files", 10);

