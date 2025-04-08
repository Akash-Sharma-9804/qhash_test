const multer = require("multer");

const storage = multer.memoryStorage(); // Use memory instead of disk

exports.uploadMiddleware = multer({ storage }).array("files", 10);
