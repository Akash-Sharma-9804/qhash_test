

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
//             const fileResult = await db.query(
//               "INSERT INTO uploaded_files (user_id, file_path, extracted_text, conversation_id) VALUES (?, ?, ?, ?)",
//               [user_id, ftpPath, extractedText || "", finalConversationId]
//           );
          
//           // Log the result to check the output from the database query
//           console.log("Database Insert Result:", fileResult);
          
//           // Check if the result is an array (which is expected)
//           if (Array.isArray(fileResult) && fileResult.length > 0) {
//               // If it's an array and has results, push to results
//               results.push({
//                   file_name: originalName, // ONLY filename sent
//               });
//           } else {
//               // If it's not an array or empty, log an error
//               console.error("❌ Unexpected result format from DB:", fileResult);
//           }
          
          
              
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


const db = require("../config/db");
const uploadToFTP = require("../utils/ftpUploader");
const { spawn } = require("child_process");

const extractText = async (buffer, mimeType) => {
  return new Promise((resolve, reject) => {
    const pythonProcess = spawn("python3", ["python_text_extractor/extract_text.py"]);

    const input = JSON.stringify({
      buffer: buffer.toString("base64"),
      mimeType,
    });

    let result = "";
    let error = "";

    pythonProcess.stdin.write(input);
    pythonProcess.stdin.end();

    pythonProcess.stdout.on("data", (data) => {
      result += data.toString();
    });

    pythonProcess.stderr.on("data", (data) => {
      error += data.toString();
    });

    pythonProcess.on("close", (code) => {
      if (code !== 0) {
        console.error("❌ Python process exited with code", code);
        return reject(new Error(error || "Python script failed"));
      }

      try {
        const output = JSON.parse(result);
        if (output.error) {
          return reject(new Error(output.error));
        }
        resolve(output.text);
      } catch (err) {
        reject(new Error("Invalid JSON from Python: " + err.message));
      }
    });
  });
};







// 📥 File upload handler
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
                console.log("🧾 Final extracted text preview:\n", extractedText?.slice(0, 500));
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
                    results.push({ file_name: originalName });
                } catch (err) {
                    console.error("❌ DB insert failed:", err.message);
                }
            }

            if (extractedText) {
                allText += `\n---\n${extractedText}`;
            }
        }

        const response = {
            success: true,
            conversation_id: finalConversationId,
            files: results,
            extracted_summary: allText
                ? `Here's what I understood from your files:\n${allText.slice(0, 1000)}${allText.length > 1000 ? "..." : ""}`
                : "I received your files, but couldn't extract readable text from them.",
            extracted_summary_raw: allText,
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
