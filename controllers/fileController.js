 

const db = require("../config/db");
const uploadToFTP = require("../utils/ftpUploader");
const extractText = require("../utils/extractText");


 


exports.uploadFiles = async (req, res) => {
  try {
    const user_id = req.user?.user_id || req.body.user_id;
    if (!user_id) return res.status(400).json({ error: "Missing user_id." });

    const files = req.files || [];
    const userMessage = req.body.message?.trim();
    let { conversation_id } = req.body;
    let finalConversationId = conversation_id;

    if (!conversation_id) {
      const [convResult] = await db.query(
        "INSERT INTO conversations (user_id, name) VALUES (?, ?)",
        [user_id, userMessage?.slice(0, 20) || "New Conversation"]
      );
      finalConversationId = convResult.insertId;
    }

    const results = [];
    let allText = "";
    const fileNamesForAI = [];

    for (const file of files) {
      const buffer = file.buffer;
      const originalName = file.originalname;
      const fileName = `${Date.now()}-${originalName}`;

      console.log(`📄 Processing: ${originalName} | Type: ${file.mimetype}`);

      let extractedText = "";
      let ftpPath = "";

      try {
        ftpPath = await uploadToFTP(buffer, fileName);
extractedText = await extractText(buffer, file.mimetype, ftpPath);

        console.log("🧾 Pages Extracted:\n", extractedText.split("\n--- Page").length - 1);


      } catch (err) {
        console.error("❌ Text extraction failed:", err.message);
      }

      try {
        ftpPath = await uploadToFTP(buffer, fileName);
      } catch (err) {
        console.error("❌ FTP upload failed:", err.message);
      }

      if (ftpPath) {
        try {
          await db.query(
            "INSERT INTO uploaded_files (user_id, file_path, extracted_text, conversation_id) VALUES (?, ?, ?, ?)",
            [user_id, ftpPath, extractedText || "", finalConversationId]
          );
          results.push({ file_name: originalName, file_path: ftpPath });
          fileNamesForAI.push(`📎 ${originalName}`);
        } catch (err) {
          console.error("❌ DB insert failed:", err.message);
        }
      }

      if (extractedText) {
        allText += `\n\n📎 ${originalName}\n${extractedText}`;
      }
    }

    // const response = {
    //   success: true,
    //   conversation_id: finalConversationId,
    //   files: results,
    //   extracted_summary: allText
    //     ? `Here's what I understood from your files:\n${allText.slice(0, 1000)}${allText.length > 1000 ? "..." : ""}`
    //     : "I received your files, but couldn't extract readable text from them.",
    //     extracted_summary_raw: allText, 
    // };

    const response = {
      success: true,
      conversation_id: finalConversationId,
      files: results,
      extracted_summary: allText
        ? `Here's what I understood from your files:\n${allText.slice(0, 1000)}${allText.length > 1000 ? "..." : ""}`
        : "I received your files, but couldn't extract readable text from them.",
      extracted_summary_raw: allText, // ✅ Send full text
    };
    

    return res.status(201).json(response);

  } catch (err) {
    console.error("❌ uploadFiles crashed:", err);
    return res.status(500).json({
      error: "Failed to upload files",
      details: err.message,
    });
  }
};

 