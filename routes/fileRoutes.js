const express = require("express");
const { uploadFiles } = require("../controllers/fileController");
const { uploadMiddleware } = require("../middleware/uploadMiddleware");

const router = express.Router();

router.post("/upload-files", uploadMiddleware, uploadFiles);

module.exports = router;
