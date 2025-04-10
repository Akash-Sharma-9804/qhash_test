// const pdfParse = require("pdf-parse");
// const mammoth = require("mammoth");
// const Tesseract = require("tesseract.js");
// const db = require("../config/db");
// const uploadToFTP = require("../utils/ftpUploader");


// // 🧠 Extract text from buffer
// const extractText = async (buffer, mimeType) => {
//   try {
//     if (mimeType === "application/pdf") {
//       return (await pdfParse(buffer)).text;
//     } else if (mimeType === "text/plain") {
//       return buffer.toString("utf8");
//     } else if (
//       mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
//     ) {
//       return (await mammoth.extractRawText({ buffer })).value;
//     } else if (mimeType.startsWith("image")) {
//       return (await Tesseract.recognize(buffer, "eng")).data.text;
//     } else {
//       return "Unsupported file type";
//     }
//   } catch (err) {
//     console.error("❌ Text extraction error:", err);
//     return null;
//   }
// };

 
  
// uploadFiles controller
// exports.uploadFiles = async (req, res) => {
//   try {
//       const user_id = req.user?.user_id || req.body.user_id;
//       if (!user_id) {
//           return res.status(400).json({ error: "Missing user_id." });
//       }

//       const files = req.files || [];
//       const userMessage = req.body.message?.trim();
//       let { conversation_id } = req.body;
//       let finalConversationId = conversation_id;

//       // Create new conversation if not given
//       if (!conversation_id) {
//           const [convResult] = await db.query(
//               "INSERT INTO conversations (user_id, name) VALUES (?, ?)",
//               [user_id, userMessage?.slice(0, 20) || "New Conversation"]
//           );
//           finalConversationId = convResult.insertId;
//       }

//       const results = [];
//       let allText = "";

//       for (const file of files) {
//           const buffer = file.buffer;
//           const originalName = file.originalname;
//           const fileName = Date.now() + "-" + originalName;

//           console.log(`📄 Processing: ${originalName} | Type: ${file.mimetype}`);

//           let extractedText = "";
//           let ftpPath = "";

//           try {
//               extractedText = await extractText(buffer, file.mimetype);
//           } catch (err) {
//               console.error("❌ Failed to extract text:", err.message);
//           }

//           try {
//               ftpPath = await uploadToFTP(buffer, fileName);
//           } catch (err) {
//               console.error("❌ FTP upload failed:", err.message);
//           }

//           if (ftpPath) {
//               const [fileResult] = await db.query(
//                   "INSERT INTO uploaded_files (user_id, file_path, extracted_text, conversation_id) VALUES (?, ?, ?, ?)",
//                   [user_id, ftpPath, extractedText || "", finalConversationId]
//               );

//               results.push({
//                   file_name: originalName, // ONLY filename sent
//               });
//           }

//           if (extractedText) {
//               allText += `\n---\n${extractedText}`;
//           }
//       }

//       // Prepare response
//       const response = {
//           success: true,
//           conversation_id: finalConversationId,
//       };

//       if (files.length > 0) {
//           response.files = results;
//           response.extracted_summary = allText
//               ? `Here's what I understood from your files:\n${allText.slice(0, 1000)}${allText.length > 1000 ? "..." : ""}`
//               : "I received your files, but couldn't extract readable text from them.";
//       }

//       return res.status(201).json(response);

//   } catch (err) {
//       console.error("❌ uploadFiles crashed:", err);
//       return res.status(500).json({
//           error: "Failed to upload files",
//           details: err.message,
//       });
//   }
// };

const pdfParse = require("pdf-parse");
const mammoth = require("mammoth");
const Tesseract = require("tesseract.js");
const db = require("../config/db");
const uploadToFTP = require("../utils/ftpUploader");

// 🧠 Extract text from buffer
const extractText = async (buffer, mimeType) => {
  try {
    if (mimeType === "application/pdf") {
      return (await pdfParse(buffer)).text;
    } else if (mimeType === "text/plain") {
      return buffer.toString("utf8");
    } else if (
      mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    ) {
      return (await mammoth.extractRawText({ buffer })).value;
    } else if (mimeType.startsWith("image")) {
      return (await Tesseract.recognize(buffer, "eng")).data.text;
    } else {
      return "Unsupported file type";
    }
  } catch (err) {
    console.error("❌ Text extraction error:", err);
    return null;
  }
};

exports.uploadFiles = async (req, res) => {
  try {
      const user_id = req.user?.user_id || req.body.user_id;
      if (!user_id) {
          return res.status(400).json({ error: "Missing user_id." });
      }

      const files = req.files || [];
      const userMessage = req.body.message?.trim();
      let { conversation_id } = req.body;
      let finalConversationId = conversation_id;

      // Create new conversation if not given
      if (!conversation_id) {
          const [convResult] = await db.query(
              "INSERT INTO conversations (user_id, name) VALUES (?, ?)",
              [user_id, userMessage?.slice(0, 20) || "New Conversation"]
          );
          finalConversationId = convResult.insertId;
      }

      const results = [];
      let allText = "";

      for (const file of files) {
          const buffer = file.buffer;
          const originalName = file.originalname;
          const fileName = Date.now() + "-" + originalName;

          console.log(`📄 Processing: ${originalName} | Type: ${file.mimetype}`);

          let extractedText = "";
          let ftpPath = "";

          try {
              extractedText = await extractText(buffer, file.mimetype);
          } catch (err) {
              console.error("❌ Failed to extract text:", err.message);
          }

          try {
              ftpPath = await uploadToFTP(buffer, fileName);
          } catch (err) {
              console.error("❌ FTP upload failed:", err.message);
          }

          if (ftpPath) {
            const fileResult = await db.query(
              "INSERT INTO uploaded_files (user_id, file_path, extracted_text, conversation_id) VALUES (?, ?, ?, ?)",
              [user_id, ftpPath, extractedText || "", finalConversationId]
          );
          
          // Log the result to check the output from the database query
          console.log("Database Insert Result:", fileResult);
          
          // Check if the result is an array (which is expected)
          if (Array.isArray(fileResult) && fileResult.length > 0) {
              // If it's an array and has results, push to results
              results.push({
                  file_name: originalName, // ONLY filename sent
              });
          } else {
              // If it's not an array or empty, log an error
              console.error("❌ Unexpected result format from DB:", fileResult);
          }
          
          
              
          }

          if (extractedText) {
              allText += `\n---\n${extractedText}`;
          }
      }

      // Prepare response
      const response = {
          success: true,
          conversation_id: finalConversationId,
      };

      if (files.length > 0) {
          response.files = results;
          response.extracted_summary = allText
              ? `Here's what I understood from your files:\n${allText.slice(0, 1000)}${allText.length > 1000 ? "..." : ""}`
              : "I received your files, but couldn't extract readable text from them.";
      }

      return res.status(201).json(response);

  } catch (err) {
      console.error("❌ uploadFiles crashed:", err);
      return res.status(500).json({
          error: "Failed to upload files",
          details: err.message,
      });
  }
};


 
