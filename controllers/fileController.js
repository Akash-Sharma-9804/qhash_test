// const multer = require("multer");
// const pdfParse = require("pdf-parse");
// const mammoth = require("mammoth");
// const Tesseract = require("tesseract.js");
// const fs = require("fs");
// const db = require("../config/db");

// // Multer Storage
// const storage = multer.diskStorage({
//     destination: (req, file, cb) => cb(null, "uploads/"),
//     filename: (req, file, cb) => cb(null, Date.now() + "-" + file.originalname),
// });
// const upload = multer({ storage });

// // Extract Text
// const extractText = async (filePath, fileType) => {
//     try {
//         if (fileType === "pdf") {
//             const dataBuffer = fs.readFileSync(filePath);
//             return (await pdfParse(dataBuffer)).text;
//         } else if (fileType === "txt") {
//             return fs.readFileSync(filePath, "utf8");
//         } else if (fileType === "docx") {
//             return (await mammoth.extractRawText({ path: filePath })).value;
//         } else if (fileType.startsWith("image")) {
//             return (await Tesseract.recognize(filePath, "eng")).data.text;
//         } else {
//             return "Unsupported file type";
//         }
//     } catch (error) {
//         console.error("Error extracting text:", error);
//         return null;
//     }
// };

// // Upload File Route
// // exports.uploadFile = async (req, res) => {
// //     if (!req.file) return res.status(400).json({ error: "No file uploaded" });

// //     const filePath = req.file.path;
// //     const fileType = req.file.mimetype;
// //     const user_id = req.user.user_id;

// //     const extractedText = await extractText(filePath, fileType);
// //     if (!extractedText) return res.status(500).json({ error: "Text extraction failed" });

// //     const sql = "INSERT INTO uploaded_files (user_id, file_path, extracted_text) VALUES (?, ?, ?)";
// //     db.query(sql, [user_id, filePath, extractedText], (err) => {
// //         if (err) return res.status(500).json({ error: err.message });
// //     });

// //     res.json({ message: "File uploaded successfully", extractedText });
// // };
// exports.uploadFile = async (req, res) => {
//     if (!req.file) return res.status(400).json({ error: "No file uploaded" });

//     const filePath = req.file.path;
//     const fileType = req.file.mimetype;
//     const user_id = req.user.user_id;

//     const extractedText = await extractText(filePath, fileType);
//     if (!extractedText) return res.status(500).json({ error: "Text extraction failed" });

//     const sql = "INSERT INTO uploaded_files (user_id, file_path, extracted_text) VALUES (?, ?, ?)";
//     db.query(sql, [user_id, filePath, extractedText], (err, result) => {
//         if (err) return res.status(500).json({ error: err.message });

//         // Send the file ID so the frontend can attach it to messages
//         res.json({ message: "File uploaded successfully", file_id: result.insertId });
//     });
// };

// exports.uploadMiddleware = upload.single("file");



const multer = require("multer");
const pdfParse = require("pdf-parse");
const mammoth = require("mammoth");
const Tesseract = require("tesseract.js");
const fs = require("fs");
const db = require("../config/db");

// Multer Storage
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, "uploads/"),
    filename: (req, file, cb) => cb(null, Date.now() + "-" + file.originalname),
});
const upload = multer({ storage });

// Extract Text
const extractText = async (filePath, fileType) => {
    try {
        if (fileType === "pdf") {
            const dataBuffer = fs.readFileSync(filePath);
            return (await pdfParse(dataBuffer)).text;
        } else if (fileType === "txt") {
            return fs.readFileSync(filePath, "utf8");
        } else if (fileType === "docx") {
            return (await mammoth.extractRawText({ path: filePath })).value;
        } else if (fileType.startsWith("image")) {
            return (await Tesseract.recognize(filePath, "eng")).data.text;
        } else {
            return "Unsupported file type";
        }
    } catch (error) {
        console.error("Error extracting text:", error);
        return null;
    }
};

// Upload Multiple Files
// exports.uploadFiles = async (req, res) => {
//     try {
//         console.log("✅ Received file upload request:", req.body);

//         // ✅ Extract user_id safely
//         const user_id = req.user?.user_id;
//         if (!user_id) {
//             console.log("❌ User ID is missing from the request.");
//             return res.status(401).json({ error: "Unauthorized: User ID is required." });
//         }

//         let { file_path, extracted_text, conversation_id } = req.body;

//         if (!file_path) {
//             return res.status(400).json({ error: "File path is required." });
//         }

//         if (!extracted_text) {
//             extracted_text = ""; // Ensure extracted_text is never undefined
//         }

//         let finalConversationId = conversation_id;

//         // ✅ Create a new conversation if one is not provided
//         if (!conversation_id) {
//             console.log("⚠ No conversation ID provided. Creating a new conversation...");

//             const [convResult] = await db.query(
//                 "INSERT INTO conversations (user_id, name) VALUES (?, ?)",
//                 [user_id, "New Conversation"]
//             );

//             if (!convResult.insertId) {
//                 throw new Error("Database error: Failed to create a conversation.");
//             }

//             finalConversationId = convResult.insertId;
//             console.log("✅ New conversation created with ID:", finalConversationId);
//         }

//         // ✅ Insert uploaded file details
//         const [fileResult] = await db.query(
//             "INSERT INTO uploaded_files (user_id, file_path, extracted_text, conversation_id) VALUES (?, ?, ?, ?)",
//             [user_id, file_path, extracted_text, finalConversationId]
//         );

//         if (!fileResult.insertId) {
//             throw new Error("Database error: Failed to insert file details.");
//         }

//         console.log("✅ File uploaded successfully with ID:", fileResult.insertId);
//         return res.status(201).json({ 
//             success: true, 
//             file_id: fileResult.insertId, 
//             conversation_id: finalConversationId 
//         });

//     } catch (error) {
//         console.error("❌ Error in uploadFiles:", error);
//         return res.status(500).json({ error: "Failed to upload file", details: error.message });
//     }
// };
exports.uploadFiles = async (req, res) => {
    try {
        console.log("✅ Received file upload request:", req.body);

        // ✅ Extract user_id from authentication
        const user_id = req.user?.user_id;
        if (!user_id) {
            console.log("❌ User ID is missing from the request.");
            return res.status(401).json({ error: "Unauthorized: User ID is required." });
        }

        let { file_path, extracted_text = "", conversation_id } = req.body; // ✅ Default value for extracted_text

        // ✅ Validate required fields
        if (!file_path) {
            return res.status(400).json({ error: "File path is required." });
        }

        let finalConversationId = conversation_id;

        // ✅ Create a new conversation if one is not provided
        if (!conversation_id) {
            console.log("⚠ No conversation ID provided. Creating a new conversation...");

            const [convResult] = await db.query(
                "INSERT INTO conversations (user_id, name) VALUES (?, ?)",
                [user_id, "New Conversation"]
            );

            if (!convResult.insertId) {
                console.error("❌ Database error: Failed to create a conversation.");
                return res.status(500).json({ error: "Failed to create a new conversation." });
            }

            finalConversationId = convResult.insertId;
            console.log("✅ New conversation created with ID:", finalConversationId);
        }

        // ✅ Insert uploaded file details into the database
        const [fileResult] = await db.query(
            "INSERT INTO uploaded_files (user_id, file_path, extracted_text, conversation_id) VALUES (?, ?, ?, ?)",
            [user_id, file_path, extracted_text, finalConversationId]
        );

        if (!fileResult.insertId) {
            console.error("❌ Database error: Failed to insert file details.");
            return res.status(500).json({ error: "Failed to save file details." });
        }

        console.log("✅ File uploaded successfully with ID:", fileResult.insertId);
        return res.status(201).json({ 
            success: true, 
            file_id: fileResult.insertId, 
            conversation_id: finalConversationId 
        });

    } catch (error) {
        console.error("❌ Error in uploadFiles:", error);
        return res.status(500).json({ error: "Failed to upload file", details: error.message });
    }
};



// Multer Middleware for multiple files
exports.uploadMiddleware = upload.array("files", 10);
