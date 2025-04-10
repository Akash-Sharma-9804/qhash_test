

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


const pdf = require("pdf-parse");
const mammoth = require("mammoth");
const Tesseract = require("tesseract.js");
const { fromPath } = require("pdf2pic");
const tmp = require("tmp-promise");
const fs = require("fs").promises;
const path = require("path");
const { PDFDocument } = require("pdf-lib"); // ✅ For page count
const db = require("../config/db");
const uploadToFTP = require("../utils/ftpUploader");

// 🧠 Full enhanced extraction
const extractText = async (buffer, mimeType) => {
  try {
      if (mimeType === "application/pdf") {
          const parsed = await pdf(buffer);
          let textContent = parsed.text.trim();

          console.log("🧪 Parsed PDF content length:", textContent.length);
          console.log("📄 Total pages (from pdf-parse):", parsed.numpages);

          // Fallback to OCR if too short or only 1 page
          if (!textContent || parsed.numpages <= 1 || textContent.length < 100) {
              console.log("🔁 Using full OCR fallback for better accuracy...");

              const tmpFile = await tmp.file({ postfix: ".pdf" });
              await fs.writeFile(tmpFile.path, buffer);

              const pdfDoc = await PDFDocument.load(buffer);
              const totalPages = pdfDoc.getPageCount();

              const pdf2picConverter = fromPath(tmpFile.path, {
                  density: 150,
                  format: "png",
                  width: 1200,
                  height: 1600,
                  saveFilename: "ocr_page",
                  savePath: "/tmp",
              });

              let ocrText = "";

              for (let i = 1; i <= totalPages; i++) {
                  try {
                      const pageImage = await pdf2picConverter(i);
                      const { data } = await Tesseract.recognize(pageImage.path, "eng", {
                          logger: m => console.log(`📄 Page ${i} OCR progress:`, m.progress),
                      });

                      ocrText += `\n--- Page ${i} ---\n${data.text.trim()}`;
                  } catch (err) {
                      console.error(`❌ OCR failed for page ${i}:`, err.message);
                  }
              }

              return ocrText.trim();
          }

          // 🧠 Still split text by page numbers to make it professional
          const pdfDoc = await PDFDocument.load(buffer);
          const totalPages = pdfDoc.getPageCount();
          let fullPageText = "";

          for (let i = 0; i < totalPages; i++) {
              const singlePagePdf = await PDFDocument.create();
              const [copiedPage] = await singlePagePdf.copyPages(pdfDoc, [i]);
              singlePagePdf.addPage(copiedPage);
              const singlePageBytes = await singlePagePdf.save();
              const pageParsed = await pdf(singlePageBytes);

              fullPageText += `\n--- Page ${i + 1} ---\n${pageParsed.text.trim()}`;
          }

          return fullPageText.trim();

      } else if (mimeType === "text/plain") {
          return buffer.toString("utf8");

      } else if (mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
          const result = await mammoth.extractRawText({ buffer });
          return result.value.trim();

      } else if (mimeType.startsWith("image")) {
          const { data } = await Tesseract.recognize(buffer, "eng", {
              logger: m => console.log("🖼️ OCR progress:", m.progress),
          });
          return data.text.trim();

      } else {
          return "Unsupported file type.";
      }
  } catch (err) {
      console.error("❌ Text extraction error:", err.message);
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

                console.log("Database Insert Result:", fileResult);

                if (Array.isArray(fileResult) && fileResult.length > 0) {
                    results.push({
                        file_name: originalName,
                    });
                } else {
                    console.error("❌ Unexpected result format from DB:", fileResult);
                }
            }

            if (extractedText) {
                allText += `\n---\n${extractedText}`;
            }
        }

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
