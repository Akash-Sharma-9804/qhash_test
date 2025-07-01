const express = require("express");
const { uploadFiles, generateFile, downloadGeneratedFile, regenerateFile } = require("../controllers/fileController");
const { uploadMiddleware } = require("../middleware/uploadMiddleware");
const verifyToken = require("../middleware/authMiddleware"); // 👈
// ✅ ADD THESE IMPORTS AT THE TOP
const https = require('https');
const http = require('http');

const router = express.Router();

router.post("/upload-files",verifyToken, uploadMiddleware, uploadFiles);
router.post("/generate", verifyToken, generateFile); // 👈 New route
// ✅ NEW ROUTES FOR GENERATED FILES
router.get("/download/:conversation_id/:filename", verifyToken, downloadGeneratedFile);
router.post("/regenerate", verifyToken, regenerateFile);


// ✅ ADD THESE NEW ROUTES HERE (after existing routes)
router.get("/download-ai/:filename", verifyToken, async (req, res) => {
  try {
    const { filename } = req.params;
    const user_id = req.user?.user_id;
    
    console.log(`🔗 Download request for: ${filename} by user: ${user_id}`);
    
    const directUrl = `https://qhashai.com/fileuploads/files/${filename}`;
    console.log(`🔗 Trying direct URL: ${directUrl}`);
    
    // Make request to FTP server
    https.get(directUrl, (ftpResponse) => {
      if (ftpResponse.statusCode === 200) {
        console.log(`✅ File found, streaming to user`);
        
        res.setHeader('Content-Type', ftpResponse.headers['content-type'] || 'application/octet-stream');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.setHeader('Content-Length', ftpResponse.headers['content-length']);
        
        ftpResponse.pipe(res);
      } else {
        console.log(`❌ File not found at: ${directUrl} (Status: ${ftpResponse.statusCode})`);
        res.status(404).json({ 
          error: "File not found",
          tried_url: directUrl,
          status: ftpResponse.statusCode
        });
      }
    }).on('error', (error) => {
      console.error(`❌ Download error:`, error);
      res.status(500).json({ error: "Download failed", details: error.message });
    });
    
  } catch (error) {
    console.error("❌ Download route error:", error);
    res.status(500).json({ error: "Download failed" });
  }
});

router.get("/smart-download/:originalname", verifyToken, async (req, res) => {
  try {
    const { originalname } = req.params;
    const user_id = req.user?.user_id;
    
    console.log(`🔍 Smart download for: ${originalname}`);
    
    // Try the original filename first
    const directUrl = `https://qhashai.com/fileuploads/files/${originalname}`;
    
    console.log(`🔍 Trying: ${directUrl}`);
    
    https.get(directUrl, (ftpResponse) => {
      if (ftpResponse.statusCode === 200) {
        console.log(`✅ Found file at: ${directUrl}`);
        
        res.setHeader('Content-Type', ftpResponse.headers['content-type'] || 'application/octet-stream');
        res.setHeader('Content-Disposition', `attachment; filename="${originalname}"`);
        res.setHeader('Content-Length', ftpResponse.headers['content-length']);
        
        ftpResponse.pipe(res);
      } else {
        console.log(`❌ File not found: ${directUrl}`);
        res.status(404).json({ 
          error: "File not found", 
          tried_url: directUrl,
          original: originalname
        });
      }
    }).on('error', (error) => {
      console.error(`❌ Smart download error:`, error);
      res.status(500).json({ error: "Download failed", details: error.message });
    });
    
  } catch (error) {
    console.error("❌ Smart download error:", error);
    res.status(500).json({ error: "Download failed" });
  }
});

module.exports = router;
