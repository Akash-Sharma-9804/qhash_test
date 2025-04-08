
const multer = require("multer");
const pdfParse = require("pdf-parse");
const mammoth = require("mammoth");
const Tesseract = require("tesseract.js");
const fs = require("fs");
const path = require("path");
const db = require("../config/db");
const uploadToFTP = require("../utils/uploadToFTP"); // Make sure this path is correct

// Multer Storage
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, "uploads/"),
    filename: (req, file, cb) => cb(null, Date.now() + "-" + file.originalname),
});
const upload = multer({ storage });

// Text Extraction
const extractText = async (filePath, mimeType) => {
    try {
        if (mimeType === "application/pdf") {
            const dataBuffer = fs.readFileSync(filePath);
            return (await pdfParse(dataBuffer)).text;
        } else if (mimeType === "text/plain") {
            return fs.readFileSync(filePath, "utf8");
        } else if (mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
            return (await mammoth.extractRawText({ path: filePath })).value;
        } else if (mimeType.startsWith("image")) {
            return (await Tesseract.recognize(filePath, "eng")).data.text;
        } else {
            return "Unsupported file type";
        }
    } catch (err) {
        console.error("❌ Text extraction error:", err);
        return null;
    }
};

// File Upload Handler
// exports.uploadFiles = async (req, res) => {
//     try {
//         const user_id = req.user?.user_id;
//         if (!user_id) {
//             return res.status(401).json({ error: "Unauthorized: User ID is required." });
//         }

//         const files = req.files;
//         if (!files || files.length === 0) {
//             return res.status(400).json({ error: "No files provided." });
//         }

//         let { conversation_id } = req.body;
//         let finalConversationId = conversation_id;

//         // Create new conversation if not provided
//         if (!conversation_id) {
//             const [convResult] = await db.query(
//                 "INSERT INTO conversations (user_id, name) VALUES (?, ?)",
//                 [user_id, "New Conversation"]
//             );
//             finalConversationId = convResult.insertId;
//         }

//         const results = [];

//         for (const file of files) {
//             const localPath = file.path;
//             const fileName = path.basename(file.filename);

//             const extractedText = await extractText(localPath, file.mimetype);
//             const ftpPath = await uploadToFTP(localPath, fileName);

//             // Insert into DB
//             const [fileResult] = await db.query(
//                 "INSERT INTO uploaded_files (user_id, file_path, extracted_text, conversation_id) VALUES (?, ?, ?, ?)",
//                 [user_id, ftpPath, extractedText, finalConversationId]
//             );

//             results.push({
//                 file_id: fileResult.insertId,
//                 file_name: file.originalname,
//                 file_url: ftpPath,
//                 extracted_text: extractedText,
//             });

//             // Optionally delete local file after upload
//             fs.unlinkSync(localPath);
//         }

//         return res.status(201).json({
//             success: true,
//             conversation_id: finalConversationId,
//             files: results,
//         });

//     } catch (err) {
//         console.error("❌ Error in uploadFiles:", err);
//         return res.status(500).json({ error: "Failed to upload files", details: err.message });
//     }
// };

// File Upload Handler
exports.uploadFiles = async (req, res) => {
    try {
        const user_id = req.user?.user_id;
        if (!user_id) {
            return res.status(401).json({ error: "Unauthorized: User ID is required." });
        }

        const files = req.files;
        if (!files || files.length === 0) {
            return res.status(400).json({ error: "No files provided." });
        }

        let { conversation_id } = req.body;
        let finalConversationId = conversation_id;

        // Create new conversation if not provided
        if (!conversation_id) {
            const [convResult] = await db.query(
                "INSERT INTO conversations (user_id, name) VALUES (?, ?)",
                [user_id, "New Conversation"]
            );
            finalConversationId = convResult.insertId;
        }

        const results = [];
        let allText = ""; // ✅ Collect extracted text for AI response

        for (const file of files) {
            const localPath = file.path;
            const fileName = path.basename(file.filename);

            const extractedText = await extractText(localPath, file.mimetype);
            const ftpPath = await uploadToFTP(localPath, fileName);

            // Save to DB
            const [fileResult] = await db.query(
                "INSERT INTO uploaded_files (user_id, file_path, extracted_text, conversation_id) VALUES (?, ?, ?, ?)",
                [user_id, ftpPath, extractedText, finalConversationId]
            );

            results.push({
                file_id: fileResult.insertId,
                file_name: file.originalname,
                file_url: ftpPath,
                extracted_text: extractedText,
            });

            // ✅ Append to combined extracted text
            if (extractedText) {
                allText += `\n---\n${extractedText}`;
            }

            // ✅ Optionally delete local file
            fs.unlinkSync(localPath);
        }

        // ✅ Generate basic bot response from text
        const botResponse = allText
            ? `Here's what I understood from your files:\n${allText.slice(0, 1000)}${allText.length > 1000 ? '...' : ''}`
            : "I received your files, but couldn't extract readable text.";

        return res.status(201).json({
            success: true,
            conversation_id: finalConversationId,
            files: results,
            response: botResponse, // ✅ Added AI-style response
        });

    } catch (err) {
        console.error("❌ Error in uploadFiles:", err);
        return res.status(500).json({ error: "Failed to upload files", details: err.message });
    }
};



// Multer Middleware
exports.uploadMiddleware = upload.array("files", 10);
