const express = require("express");
const { uploadFiles } = require("../controllers/fileController");
const { uploadMiddleware } = require("../middleware/uploadMiddleware");
const verifyToken = require("../middleware/verifyToken"); // 👈

const router = express.Router();

router.post("/upload-files",verifyToken, uploadMiddleware, uploadFiles);

module.exports = router;
