

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
const { PDFDocument } = require("pdf-lib");
const db = require("../config/db");
const uploadToFTP = require("../utils/ftpUploader");

// 🧠 Full enhanced extractor
const extractText = async (buffer, mimeType) => {
  try {
      if (mimeType === "application/pdf") {
          const parsed = await pdf(buffer);
          const initialText = parsed.text?.trim() || "";
          console.log("📄 Parsed PDF content length:", initialText.length);

          const pdfDoc = await PDFDocument.load(buffer);
          const totalPages = pdfDoc.getPageCount();
          console.log("📚 Total PDF pages:", totalPages);

          const fullTextByPage = [];
          const useOCR = !initialText || initialText.length < 100;

          if (useOCR) {
              console.log("🔁 Falling back to OCR for all pages...");
              const tmpFile = await tmp.file({ postfix: ".pdf" });
              await fs.writeFile(tmpFile.path, buffer);

              const converter = fromPath(tmpFile.path, {
                  density: 150,
                  format: "png",
                  width: 1200,
                  height: 1600,
                  savePath: "/tmp",
              });

              for (let i = 1; i <= totalPages; i++) {
                  try {
                      const pageImage = await converter(i);
                      const { data } = await Tesseract.recognize(pageImage.path, "eng", {
                          logger: m => console.log(`📄 OCR Progress (Page ${i}):`, m.progress),
                      });
                      const text = data.text?.trim() || "[No text found]";
                      fullTextByPage.push(`\n--- Page ${i} ---\n${text}`);
                  } catch (err) {
                      console.error(`❌ OCR failed on page ${i}:`, err.message);
                      fullTextByPage.push(`\n--- Page ${i} ---\n[OCR failed: ${err.message}]`);
                  }
              }

              await tmpFile.cleanup?.();
          } else {
              console.log("⚡ Extracting all pages using pdf-lib + pdf-parse...");

              const copiedPages = await pdfDoc.copyPages(pdfDoc, [...Array(totalPages).keys()]);
              for (let i = 0; i < totalPages; i++) {
                  try {
                      const newPdf = await PDFDocument.create();
                      newPdf.addPage(copiedPages[i]);
                      const singlePageBuffer = await newPdf.save();
                      const singlePageParsed = await pdf(singlePageBuffer);
                      const text = singlePageParsed.text?.trim() || "[No text found]";
                      fullTextByPage.push(`\n--- Page ${i + 1} ---\n${text}`);
                  } catch (err) {
                      console.error(`❌ Failed to parse page ${i + 1}:`, err.message);
                      fullTextByPage.push(`\n--- Page ${i + 1} ---\n[Parsing failed: ${err.message}]`);
                  }
              }
          }

          const fullText = fullTextByPage.join("\n").trim();
          console.log("✅ Final PDF text length:", fullText.length);
          return fullText;
      }

      if (mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
          const result = await mammoth.extractRawText({ buffer });
          return result.value.trim();
      }

      if (mimeType === "text/plain") {
          return buffer.toString("utf8").trim();
      }

      if (mimeType.startsWith("image")) {
          const { data } = await Tesseract.recognize(buffer, "eng", {
              logger: m => console.log("🖼️ OCR progress:", m.progress),
          });
          return data.text?.trim() || "[No text extracted from image]";
      }

      return "Unsupported file type.";
  } catch (err) {
      console.error("❌ extractText crashed:", err.message);
      return "[Extraction failed]";
  }
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
