 

// const db = require("../config/db");
// const uploadToFTP = require("../utils/ftpUploader");
// const extractText = require("../utils/extractText");
// const sanitizeFilename = require("../utils/sanitizeFilename");

// //  test 

// exports.uploadFiles = async (req, res) => {
//   try {
//     const user_id = req.user?.user_id || req.body.user_id;
//     if (!user_id) return res.status(400).json({ error: "Missing user_id." });

//     const files = req.files || [];
//     const userMessage = req.body.message?.trim();
//     let { conversation_id } = req.body;
//     let finalConversationId = conversation_id;

//     if (!conversation_id) {
//       const [convResult] = await db.query(
//         "INSERT INTO conversations (user_id, name) VALUES (?, ?)",
//         [user_id, userMessage?.slice(0, 20) || "New Conversation"]
//       );
//       finalConversationId = convResult.insertId;
//     }

//     const results = [];
//     const fileNamesForAI = [];
//     const allExtractedSummaries = [];

//     // ✅ Process files in parallel
//     await Promise.all(files.map(async (file) => {
//       const buffer = file.buffer;
//        const originalName = sanitizeFilename(file.originalname); // ✅ Sanitize here
//       const fileName = `${Date.now()}-${originalName}`;

//       console.log(`📄 Processing: ${originalName} | Type: ${file.mimetype}`);

//       let ftpPath = "";
//       let extractedText = "";

//       try {
//         ftpPath = await uploadToFTP(buffer, fileName);
//         extractedText = await extractText(buffer, file.mimetype, ftpPath);
//         console.log("🧾 Pages Extracted:\n", extractedText.split("\n--- Page").length - 1);
//       } catch (err) {
//         console.error("❌ File processing failed:", err.message);
//       }

//       if (ftpPath) {
//         try {
//           await db.query(
//             "INSERT INTO uploaded_files (user_id, file_path, extracted_text, conversation_id) VALUES (?, ?, ?, ?)",
//             [user_id, ftpPath,extractedText || "", finalConversationId]
//           );

//           results.push({ file_name: sanitizeFilename(originalName), file_path: ftpPath });
//           fileNamesForAI.push(`📎 ${originalName}`);

//           if (extractedText) {
//             allExtractedSummaries.push(`📎 ${originalName}\n${extractedText}`);
//           }

//         } catch (err) {
//           console.error("❌ DB insert failed:", err.message);
//         }
//       }
//     }));

//     const allText = allExtractedSummaries.join("\n\n");

//     const response = {
//       success: true,
//       conversation_id: finalConversationId,
//       files: results,
//       extracted_summary: allText
//         ? `Here's what I understood from your files:\n${allText.slice(0, 1000)}${allText.length > 1000 ? "..." : ""}`
//         : "I received your files, but couldn't extract readable text from them.",
//       extracted_summary_raw: allText,
//     };

//     return res.status(201).json(response);

//   } catch (err) {
//     console.error("❌ uploadFiles crashed:", err);
//     return res.status(500).json({ error: "Failed to upload files", details: err.message });
//   }
// };

// ✅ FIXED IMPORT - Use default import for backward compatibility
const db = require("../config/db");
const {uploadToFTP} = require("../utils/ftpUploader");
const { uploadMultipleToFTP } = require("../utils/ftpUploader");
const extractText = require("../utils/extractText");

const { sanitizeDisplayName } = require("../utils/FilenameGenerator");
// ✅ STANDARDIZED DATABASE QUERY WRAPPER
const executeQuery = async (sql, params = []) => {
  try {
    const result = await db.query(sql, params);
    if (Array.isArray(result) && Array.isArray(result[0])) {
      return result[0];
    }
    return result;
  } catch (error) {
    console.error("❌ Database query error:", error);
    throw error;
  }
};

// exports.uploadFiles = async (req, res) => {
//   const startTime = Date.now();
  
//   try {
//     const user_id = req.user?.user_id || req.body.user_id;
//     let { conversation_id } = req.body;
//     const userMessage = req.body.message?.trim();

//     if (!user_id) {
//       return res.status(400).json({ error: "Missing user_id. Please login first." });
//     }

//     // ✅ HANDLE CASE WHERE NO FILES ARE UPLOADED
//     if (!req.files || req.files.length === 0) {
//       console.log("⚠️ No files uploaded, but continuing with conversation creation");
      
//       let finalConversationId = conversation_id;
//       if (!conversation_id) {
//         try {
//           const convResult = await executeQuery(
//             "INSERT INTO conversations (user_id, name) VALUES (?, ?)",
//             [user_id, userMessage?.slice(0, 20) || "New Conversation"]
//           );
//           finalConversationId = convResult.insertId;
//           console.log(`✅ Created new conversation without files: ${finalConversationId}`);
//         } catch (convError) {
//           console.error("❌ Failed to create conversation:", convError);
//           return res.status(500).json({ error: "Failed to create conversation" });
//         }
//       }

//       return res.status(200).json({
//         success: true,
//         conversation_id: finalConversationId,
//         message: "No files uploaded, but conversation is ready",
//         files: [],
//         extracted_summary: "No files were uploaded.",
//         extracted_summary_raw: "",
//         summary: {
//           total: 0,
//           successful: 0,
//           failed: 0,
//           upload_time: "0.00",
//           total_time: "0.00"
//         }
//       });
//     }

//     console.log(`🚀 Processing ${req.files.length} files for user: ${user_id}`);

//     // ✅ CREATE CONVERSATION IF NOT PROVIDED
//     let finalConversationId = conversation_id;
//     if (!conversation_id) {
//       try {
//         const convResult = await executeQuery(
//           "INSERT INTO conversations (user_id, name) VALUES (?, ?)",
//           [user_id, userMessage?.slice(0, 20) || "File Upload"]
//         );
//         finalConversationId = convResult.insertId;
//         console.log(`✅ Created new conversation: ${finalConversationId}`);
//       } catch (convError) {
//         console.error("❌ Failed to create conversation:", convError);
//         return res.status(500).json({ error: "Failed to create conversation" });
//       }
//     }

//     // ✅ PREPARE FILE DATA WITH ORIGINAL FILENAMES
//     const fileDataArray = req.files.map(file => ({
//       buffer: file.buffer,
//       fileName: sanitizeDisplayName(file.originalname), // For display only
//       originalFilename: file.originalname, // Keep original for unique generation
//       originalFile: file
//     }));

//     // 🚀 PARALLEL UPLOAD WITH UNIQUE FILENAMES
//     const uploadStartTime = Date.now();
//     const uploadResults = await uploadMultipleToFTP(fileDataArray);
//     const uploadTime = ((Date.now() - uploadStartTime) / 1000).toFixed(2);
    
//     console.log(`⚡ Parallel upload completed in ${uploadTime}s`);

//     // 🧾 PARALLEL TEXT EXTRACTION AND DATABASE SAVE
//     const textExtractionPromises = uploadResults.map(async (uploadResult, index) => {
//       const originalFile = req.files[index];
      
//       if (uploadResult.success) {
//         try {
//           console.log(`📄 Processing: ${uploadResult.originalFilename} | Type: ${originalFile.mimetype}`);
          
//           const extractedText = await extractText(
//             originalFile.buffer, 
//             originalFile.mimetype, 
//             uploadResult.filePath,
//             uploadResult.originalFilename
//           );
          
//           // ✅ SAVE TO DATABASE WITH COMPLETE METADATA
//           try {
//             const fullExtractedText = extractedText && extractedText.length > 0 
//               ? extractedText 
//               : "No readable content extracted";

//             // ✅ COMPREHENSIVE FILE METADATA
//             const fileMetadata = {
//               original_filename: uploadResult.originalFilename,
//               display_filename: sanitizeDisplayName(uploadResult.originalFilename),
//               unique_filename: uploadResult.uniqueFilename,
//               file_size: originalFile.size,
//               mime_type: originalFile.mimetype,
//               upload_timestamp: new Date().toISOString(),
//               extraction_status: extractedText ? 'success' : 'failed'
//             };

//             await executeQuery(
//               "INSERT INTO uploaded_files (user_id, file_path, extracted_text, conversation_id, file_metadata, created_at) VALUES (?, ?, ?, ?, ?, NOW())",
//               [user_id, uploadResult.filePath, fullExtractedText, finalConversationId, JSON.stringify(fileMetadata)]
//             );
            
//             console.log(`✅ Saved to database: ${uploadResult.originalFilename} (${fullExtractedText.length} characters)`);
//           } catch (dbError) {
//             console.error(`❌ Database save failed for ${uploadResult.originalFilename}:`, dbError);
//           }
          
//           return {
//             file_name: uploadResult.originalFilename, // ✅ Return original name for display
//             display_name: sanitizeDisplayName(uploadResult.originalFilename),
//             unique_filename: uploadResult.uniqueFilename,
//             file_path: uploadResult.filePath,
//             file_type: originalFile.mimetype,
//             file_size: originalFile.size,
//             extracted_text: extractedText || "No readable content",
//             upload_success: true,
//             database_saved: true
//           };
          
//         } catch (extractError) {
//           console.error(`❌ Text extraction failed for ${uploadResult.originalFilename}:`, extractError);
          
//           // ✅ SAVE TO DATABASE EVEN IF EXTRACTION FAILS
//           try {
//             const fileMetadata = {
//               original_filename: uploadResult.originalFilename,
//               display_filename: sanitizeDisplayName(uploadResult.originalFilename),
//               unique_filename: uploadResult.uniqueFilename,
//               file_size: originalFile.size,
//               mime_type: originalFile.mimetype,
//               upload_timestamp: new Date().toISOString(),
//               extraction_status: 'failed',
//               extraction_error: extractError.message
//             };
// await executeQuery(
//               "INSERT INTO uploaded_files (user_id, file_path, extracted_text, conversation_id, file_metadata, created_at) VALUES (?, ?, ?, ?, ?, NOW())",
//               [user_id, uploadResult.filePath, "Text extraction failed", finalConversationId, JSON.stringify(fileMetadata)]
//             );
//             console.log(`✅ Saved to database (extraction failed): ${uploadResult.originalFilename}`);
//           } catch (dbError) {
//             console.error(`❌ Database save failed for ${uploadResult.originalFilename}:`, dbError);
//           }
          
//           return {
//             file_name: uploadResult.originalFilename,
//             display_name: sanitizeDisplayName(uploadResult.originalFilename),
//             unique_filename: uploadResult.uniqueFilename,
//             file_path: uploadResult.filePath,
//             file_type: originalFile.mimetype,
//             file_size: originalFile.size,
//             extracted_text: "Text extraction failed",
//             upload_success: true,
//             extraction_error: extractError.message,
//             database_saved: true
//           };
//         }
//       } else {
//         console.error(`❌ File upload failed: ${uploadResult.error}`);
        
//         return {
//           file_name: uploadResult.originalFilename,
//           display_name: sanitizeDisplayName(uploadResult.originalFilename),
//           file_type: originalFile.mimetype,
//           file_size: originalFile.size,
//           upload_success: false,
//           error: uploadResult.error,
//           database_saved: false
//         };
//       }
//     });

//     // Wait for all text extractions and database saves to complete
//     const processedFiles = await Promise.all(textExtractionPromises);

//     const successfulUploads = processedFiles.filter(f => f.upload_success);
//     const failedUploads = processedFiles.filter(f => !f.upload_success);
//     const totalTime = ((Date.now() - startTime) / 1000).toFixed(2);

//     console.log(`🎉 Complete processing finished in ${totalTime}s: ${successfulUploads.length} successful, ${failedUploads.length} failed`);

//     // ✅ PREPARE RESPONSE WITH ORIGINAL FILENAMES FOR DISPLAY
//     const allExtractedSummaries = successfulUploads
//       .filter(file => file.extracted_text && file.extracted_text !== "No readable content" && file.extracted_text !== "Text extraction failed")
//       .map(file => `📎 ${file.file_name}\n${file.extracted_text}`);

//     const allText = allExtractedSummaries.join("\n\n");

//     // ✅ RETURN RESPONSE WITH ORIGINAL NAMES FOR USER DISPLAY
//     const response = {
//       success: true,
//       conversation_id: finalConversationId,
//       message: `Processed ${req.files.length} files in ${totalTime}s`,
//       files: successfulUploads.map(file => ({
//         file_name: file.file_name, // Original filename for display
//         display_name: file.display_name, // Sanitized for display
//         file_path: file.file_path, // Unique path for access
//         unique_filename: file.unique_filename, // For debugging
//         file_size: file.file_size,
//         file_type: file.file_type
//       })),
//       extracted_summary: allText
//         ? `Here's what I understood from your files:\n${allText.slice(0, 1000)}${allText.length > 1000 ? "..." : ""}`
//         : "I received your files, but couldn't extract readable text from them.",
//       extracted_summary_raw: allText,
//       summary: {
//         total: req.files.length,
//         successful: successfulUploads.length,
//         failed: failedUploads.length,
//         upload_time: uploadTime,
//         total_time: totalTime
//       }
//     };

//     return res.status(201).json(response);

//   } catch (error) {
//     console.error("❌ File upload controller error:", error);
//     res.status(500).json({ 
//       error: "File processing failed", 
//       details: error.message 
//     });
//   }
// };

// exports.uploadFiles = async (req, res) => {
//   const startTime = Date.now();
  
//   try {
//     const user_id = req.user?.user_id || req.body.user_id;
//     let { conversation_id } = req.body;
//     const userMessage = req.body.message?.trim();

//     if (!user_id) {
//       return res.status(400).json({ error: "Missing user_id. Please login first." });
//     }

//     // ✅ CREATE CONVERSATION IF NOT PROVIDED
//     let finalConversationId = conversation_id;
//     if (!conversation_id) {
//       try {
//         const convResult = await executeQuery(
//           "INSERT INTO conversations (user_id, name) VALUES (?, ?)",
//           [user_id, userMessage?.slice(0, 20) || "File Upload"]
//         );
//         finalConversationId = convResult.insertId;
//         console.log(`✅ Created new conversation: ${finalConversationId}`);
//       } catch (convError) {
//         console.error("❌ Failed to create conversation:", convError);
//         return res.status(500).json({ error: "Failed to create conversation" });
//       }
//     }

//     // ✅ BETTER FILE VALIDATION
//     if (!req.files || !Array.isArray(req.files) || req.files.length === 0) {
//       console.log("⚠️ No files uploaded, but continuing with conversation creation");
      
//       return res.status(200).json({
//         success: true,
//         conversation_id: finalConversationId,
//         message: "No files uploaded, but conversation is ready",
//         files: [],
//         extracted_summary: "No files were uploaded.",
//         extracted_summary_raw: "",
//         summary: {
//           total: 0,
//           successful: 0,
//           failed: 0,
//           upload_time: "0.00",
//           total_time: "0.00"
//         }
//       });
//     }

//     console.log(`🚀 Processing ${req.files.length} files for user: ${user_id}, conversation: ${finalConversationId}`);

//     // ✅ VALIDATE FILE DATA BEFORE PROCESSING
//     const validFiles = req.files.filter(file => file && file.buffer && file.originalname);
//     if (validFiles.length === 0) {
//       return res.status(400).json({
//         success: false,
//         error: "No valid files found",
//         files: []
//       });
//     }

//     // ✅ PREPARE FILE DATA WITH VALIDATION
//     const fileDataArray = validFiles.map(file => {
//       try {
//         return {
//           buffer: file.buffer,
//           fileName: sanitizeDisplayName(file.originalname),
//           originalFilename: file.originalname,
//           originalFile: file
//         };
//       } catch (err) {
//         console.error(`❌ Error preparing file data for ${file.originalname}:`, err);
//         return null;
//       }
//     }).filter(Boolean); // Remove null entries

//     if (fileDataArray.length === 0) {
//       return res.status(400).json({
//         success: false,
//         error: "Failed to prepare file data",
//         files: []
//       });
//     }

//     // 🚀 PARALLEL UPLOAD WITH ERROR HANDLING
//     const uploadStartTime = Date.now();
//     let uploadResults = [];
    
//     try {
//       uploadResults = await uploadMultipleToFTP(fileDataArray);
//       if (!uploadResults || !Array.isArray(uploadResults)) {
//         throw new Error("Upload function returned invalid results");
//       }
//     } catch (uploadError) {
//       console.error("❌ Upload failed:", uploadError);
//       return res.status(500).json({
//         success: false,
//         error: "File upload failed",
//         details: uploadError.message,
//         files: []
//       });
//     }
    
//     const uploadTime = ((Date.now() - uploadStartTime) / 1000).toFixed(2);
//     console.log(`⚡ Parallel upload completed in ${uploadTime}s`);

//     // 🧾 PARALLEL TEXT EXTRACTION WITH BETTER ERROR HANDLING
//     const textExtractionPromises = uploadResults.map(async (uploadResult, index) => {
//       try {
//         const originalFile = validFiles[index];
        
//         if (!originalFile) {
//           throw new Error("Original file not found");
//         }
        
//         // ✅ HANDLE UPLOAD SUCCESS
//         if (uploadResult && uploadResult.success) {
//           try {
//             console.log(`📄 Processing: ${uploadResult.originalFilename} | Type: ${originalFile.mimetype}`);
            
//             const extractedText = await extractText(
//               originalFile.buffer, 
//               originalFile.mimetype, 
//               uploadResult.filePath,
//               uploadResult.originalFilename
//             );
            
//             // ✅ SAVE TO DATABASE WITH COMPLETE METADATA
//             try {
//               const fullExtractedText = extractedText && extractedText.length > 0 
//                 ? extractedText 
//                 : "No readable content extracted";

//               const fileMetadata = {
//                 original_filename: uploadResult.originalFilename,
//                 display_filename: sanitizeDisplayName(uploadResult.originalFilename),
//                 unique_filename: uploadResult.uniqueFilename,
//                 file_size: originalFile.size,
//                 mime_type: originalFile.mimetype,
//                 upload_timestamp: new Date().toISOString(),
//                 extraction_status: extractedText ? 'success' : 'failed'
//               };

//               await executeQuery(
//                 "INSERT INTO uploaded_files (user_id, file_path, extracted_text, conversation_id, file_metadata, created_at) VALUES (?, ?, ?, ?, ?, NOW())",
//                 [user_id, uploadResult.filePath, fullExtractedText, finalConversationId, JSON.stringify(fileMetadata)]
//               );
              
//               console.log(`✅ Saved to database: ${uploadResult.originalFilename}`);
//             } catch (dbError) {
//               console.error(`❌ Database save failed for ${uploadResult.originalFilename}:`, dbError);
//             }
            
//             return {
//               file_name: uploadResult.originalFilename,
//               original_filename: uploadResult.originalFilename,
//               display_name: sanitizeDisplayName(uploadResult.originalFilename),
//               unique_filename: uploadResult.uniqueFilename,
//               file_path: uploadResult.filePath,
//               file_type: originalFile.mimetype,
//               file_size: originalFile.size,
//               extracted_text: extractedText || "No readable content",
//               upload_success: true,
//               database_saved: true,
//               error: null
//             };
            
//           } catch (extractError) {
//             console.error(`❌ Text extraction failed for ${uploadResult.originalFilename}:`, extractError);
            
//             return {
//               file_name: uploadResult.originalFilename,
//               original_filename: uploadResult.originalFilename,
//               display_name: sanitizeDisplayName(uploadResult.originalFilename),
//               unique_filename: uploadResult.uniqueFilename,
//               file_path: uploadResult.filePath,
//               file_type: originalFile.mimetype,
//               file_size: originalFile.size,
//               extracted_text: "Text extraction failed",
//               upload_success: true,
//               extraction_error: extractError.message,
//               database_saved: false,
//               error: `Text extraction failed: ${extractError.message}`
//             };
//           }
//         } else {
//           // ✅ HANDLE UPLOAD FAILURE
//           console.error(`❌ File upload failed: ${uploadResult?.error || 'Unknown error'}`);
          
//           return {
//             file_name: uploadResult?.originalFilename || originalFile.originalname,
//             original_filename: uploadResult?.originalFilename || originalFile.originalname,
//             display_name: sanitizeDisplayName(uploadResult?.originalFilename || originalFile.originalname),
//             unique_filename: null,
//             file_path: null,
//             file_type: originalFile.mimetype,
//             file_size: originalFile.size,
//             extracted_text: null,
//             upload_success: false,
//             database_saved: false,
//             error: uploadResult?.error || "Upload failed"
//           };
//         }
//       } catch (processingError) {
//         console.error(`❌ File processing error:`, processingError);
        
//         return {
//           file_name: "Unknown file",
//           original_filename: "Unknown file",
//           display_name: "Unknown file",
//           unique_filename: null,
//           file_path: null,
//           file_type: "unknown",
//           file_size: 0,
//           extracted_text: null,
//           upload_success: false,
//           database_saved: false,
//           error: `Processing failed: ${processingError.message}`
//         };
//       }
//     });

//     // Wait for all processing to complete
//     const processedFiles = await Promise.all(textExtractionPromises);

//     const successfulUploads = processedFiles.filter(f => f && f.upload_success);
//     const failedUploads = processedFiles.filter(f => f && !f.upload_success);
//     const totalTime = ((Date.now() - startTime) / 1000).toFixed(2);

//     console.log(`🎉 Complete processing finished in ${totalTime}s: ${successfulUploads.length} successful, ${failedUploads.length} failed`);

//     // ✅ PREPARE RESPONSE
//     const allExtractedSummaries = successfulUploads
//       .filter(file => file.extracted_text && file.extracted_text !== "No readable content" && file.extracted_text !== "Text extraction failed")
//       .map(file => `📎 ${file.file_name}\n${file.extracted_text}`);

//     const allText = allExtractedSummaries.join("\n\n");

//     const response = {
//       success: successfulUploads.length > 0,
//       conversation_id: finalConversationId,
//       message: failedUploads.length > 0 
//         ? `Processed ${validFiles.length} files: ${successfulUploads.length} successful, ${failedUploads.length} failed`
//         : `Successfully processed ${successfulUploads.length} files in ${totalTime}s`,
//       files: processedFiles,
//       extracted_summary: allText
//         ? `Here's what I understood from your files:\n${allText.slice(0, 1000)}${allText.length > 1000 ? "..." : ""}`
//         : successfulUploads.length > 0 
//           ? "I received your files, but couldn't extract readable text from them."
//           : "File upload failed.",
//       extracted_summary_raw: allText,
//       summary: {
//         total: validFiles.length,
//         successful: successfulUploads.length,
//         failed: failedUploads.length,
//         upload_time: uploadTime,
//         total_time: totalTime
//       },
//       errors: failedUploads.length > 0 ? failedUploads.map(f => ({
//         file_name: f.file_name,
//         error: f.error
//       })) : null
//     };

//     return res.status(failedUploads.length === validFiles.length ? 400 : 201).json(response);

//   } catch (error) {
//     console.error("❌ File upload controller error:", error);
//     res.status(500).json({ 
//       success: false,
//       error: "File processing failed", 
//       details: error.message,
//       files: []
//     });
//   }
// };



exports.uploadFiles = async (req, res) => {
  const startTime = Date.now();
  let uploadedFileIds = []; // ✅ Track uploaded file IDs for rollback
  
  try {
    const user_id = req.user?.user_id || req.body.user_id;
    let { conversation_id } = req.body;
    const userMessage = req.body.message?.trim();

    if (!user_id) {
      return res.status(400).json({ error: "Missing user_id. Please login first." });
    }

    // ✅ CREATE CONVERSATION IF NOT PROVIDED
    let finalConversationId = conversation_id;
    if (!conversation_id) {
      try {
        const convResult = await executeQuery(
          "INSERT INTO conversations (user_id, name) VALUES (?, ?)",
          [user_id, userMessage?.slice(0, 20) || "New Conversation"]
        );
        finalConversationId = convResult.insertId;
        console.log(`✅ Created new conversation without files: ${finalConversationId}`);
      } catch (convError) {
        console.error("❌ Failed to create conversation:", convError);
        return res.status(500).json({ error: "Failed to create conversation" });
      }
    }

    // ✅ HANDLE CASE WHERE NO FILES ARE UPLOADED
    if (!req.files || !Array.isArray(req.files) || req.files.length === 0) {
      console.log("⚠️ No files uploaded, but continuing with conversation creation");
      
      return res.status(200).json({
        success: true,
        conversation_id: finalConversationId,
        message: "No files uploaded, but conversation is ready",
        files: [],
        extracted_summary: "No files were uploaded.",
        extracted_summary_raw: "",
        summary: {
          total: 0,
          successful: 0,
          failed: 0,
          upload_time: "0.00",
          total_time: "0.00"
        }
      });
    }

    // ✅ VALIDATE FILE DATA BEFORE PROCESSING
    const validFiles = req.files.filter(file => file && file.buffer && file.originalname);
    if (validFiles.length === 0) {
      return res.status(400).json({
        success: false,
        error: "No valid files found",
        files: []
      });
    }

    // ✅ PREPARE FILE DATA WITH VALIDATION
    const fileDataArray = validFiles.map(file => {
      try {
        return {
          buffer: file.buffer,
          fileName: sanitizeDisplayName(file.originalname),
          originalFilename: file.originalname,
          originalFile: file
        };
      } catch (err) {
        console.error(`❌ Error preparing file data for ${file.originalname}:`, err);
        return null;
      }
    }).filter(Boolean);

    if (fileDataArray.length === 0) {
      return res.status(400).json({
        success: false,
        error: "Failed to prepare file data",
        files: []
      });
    }

    // 🚀 PARALLEL UPLOAD WITH ERROR HANDLING
    const uploadStartTime = Date.now();
    let uploadResults = [];
    
    try {
      uploadResults = await uploadMultipleToFTP(fileDataArray);
      if (!uploadResults || !Array.isArray(uploadResults)) {
        throw new Error("Upload function returned invalid results");
      }
    } catch (uploadError) {
      console.error("❌ Upload failed:", uploadError);
      return res.status(500).json({
        success: false,
        error: "File upload failed",
        details: uploadError.message,
        files: []
      });
    }
    
    const uploadTime = ((Date.now() - uploadStartTime) / 1000).toFixed(2);
    console.log(`⚡ Parallel upload completed in ${uploadTime}s`);

    // 🧾 PARALLEL TEXT EXTRACTION WITH BETTER ERROR HANDLING
     const textExtractionPromises = uploadResults.map(async (uploadResult, index) => {
      let dbResult = null; // ✅ DECLARE AT TOP LEVEL
      
      try {
        const originalFile = validFiles[index];
        
        if (!originalFile) {
          throw new Error("Original file not found");
        }
        
        // ✅ HANDLE UPLOAD SUCCESS
        if (uploadResult && uploadResult.success) {
          try {
            console.log(`📄 Processing: ${uploadResult.originalFilename} | Type: ${originalFile.mimetype}`);
            
            const extractedText = await extractText(
              originalFile.buffer, 
              originalFile.mimetype, 
              uploadResult.filePath,
              uploadResult.originalFilename
            );
            
            // ✅ SAVE TO DATABASE WITH PENDING STATUS
            const fullExtractedText = extractedText && extractedText.length > 0 
              ? extractedText 
              : "No readable content extracted";

            const fileMetadata = {
              original_filename: uploadResult.originalFilename,
              display_filename: sanitizeDisplayName(uploadResult.originalFilename),
              unique_filename: uploadResult.uniqueFilename,
              file_size: originalFile.size,
              mime_type: originalFile.mimetype,
              upload_timestamp: new Date().toISOString(),
              extraction_status: extractedText ? 'success' : 'failed',
              status: 'pending_response'
            };

            dbResult = await executeQuery(
              "INSERT INTO uploaded_files (user_id, file_path, extracted_text, conversation_id, file_metadata, status, created_at) VALUES (?, ?, ?, ?, ?, 'pending_response', NOW())",
              [user_id, uploadResult.filePath, fullExtractedText, finalConversationId, JSON.stringify(fileMetadata)]
            );
            
            // ✅ TRACK FILE ID FOR POTENTIAL ROLLBACK
            uploadedFileIds.push(dbResult.insertId);
            
            console.log(`✅ Saved to database with pending status: ${uploadResult.originalFilename}`);
            
          } catch (extractError) {
            console.error(`❌ Text extraction failed for ${uploadResult.originalFilename}:`, extractError);
            
            // ✅ SAVE TO DATABASE EVEN IF EXTRACTION FAILS
            const fileMetadata = {
              original_filename: uploadResult.originalFilename,
              display_filename: sanitizeDisplayName(uploadResult.originalFilename),
              unique_filename: uploadResult.uniqueFilename,
              file_size: originalFile.size,
              mime_type: originalFile.mimetype,
              upload_timestamp: new Date().toISOString(),
              extraction_status: 'failed',
              extraction_error: extractError.message
            };

            dbResult = await executeQuery(
              "INSERT INTO uploaded_files (user_id, file_path, extracted_text, conversation_id, file_metadata, status, created_at) VALUES (?, ?, ?, ?, ?, 'pending_response', NOW())",
              [user_id, uploadResult.filePath, "Text extraction failed", finalConversationId, JSON.stringify(fileMetadata)]
            );
            
            uploadedFileIds.push(dbResult.insertId);
            console.log(`✅ Saved to database (extraction failed): ${uploadResult.originalFilename}`);
          }
          
          return {
            file_id: dbResult?.insertId || null,
            file_name: uploadResult.originalFilename,
            original_filename: uploadResult.originalFilename,
            display_name: sanitizeDisplayName(uploadResult.originalFilename),
            unique_filename: uploadResult.uniqueFilename,
            file_path: uploadResult.filePath,
            file_type: originalFile.mimetype,
            file_size: originalFile.size,
            extracted_text: dbResult ? "Success" : "Text extraction failed",
            upload_success: true,
            database_saved: true,
            error: null
          };
          
        } else {
          return {
            file_name: uploadResult?.originalFilename || originalFile.originalname,
            original_filename: uploadResult?.originalFilename || originalFile.originalname,
            display_name: sanitizeDisplayName(uploadResult?.originalFilename || originalFile.originalname),
            unique_filename: null,
            file_path: null,
            file_type: originalFile.mimetype,
            file_size: originalFile.size,
            extracted_text: null,
            upload_success: false,
            database_saved: false,
            error: uploadResult?.error || "Upload failed"
          };
        }
      } catch (processingError) {
        console.error(`❌ File processing error:`, processingError);
        
        return {
          file_name: "Unknown file",
          original_filename: "Unknown file",
          display_name: "Unknown file",
          unique_filename: null,
          file_path: null,
          file_type: "unknown",
          file_size: 0,
          extracted_text: null,
          upload_success: false,
          database_saved: false,
          error: `Processing failed: ${processingError.message}`
        };
      }
    });

    // Wait for all processing to complete
    const processedFiles = await Promise.all(textExtractionPromises);

    const successfulUploads = processedFiles.filter(f => f && f.upload_success);
    const failedUploads = processedFiles.filter(f => f && !f.upload_success);
    const totalTime = ((Date.now() - startTime) / 1000).toFixed(2);

    console.log(`🎉 Complete processing finished in ${totalTime}s: ${successfulUploads.length} successful, ${failedUploads.length} failed`);

    // ✅ PREPARE RESPONSE WITH ROLLBACK INFO
    const allExtractedSummaries = successfulUploads
      .filter(file => file.extracted_text && file.extracted_text !== "No readable content" && file.extracted_text !== "Text extraction failed")
      .map(file => `📎 ${file.file_name}\n${file.extracted_text}`);

    const allText = allExtractedSummaries.join("\n\n");

    const response = {
      success: successfulUploads.length > 0,
      conversation_id: finalConversationId,
      message: failedUploads.length > 0 
        ? `Processed ${validFiles.length} files: ${successfulUploads.length} successful, ${failedUploads.length} failed`
        : `Successfully processed ${successfulUploads.length} files in ${totalTime}s`,
      files: processedFiles,
      extracted_summary: allText
        ? `Here's what I understood from your files:\n${allText.slice(0, 1000)}${allText.length > 1000 ? "..." : ""}`
        : successfulUploads.length > 0 
          ? "I received your files, but couldn't extract readable text from them."
          : "File upload failed.",
      extracted_summary_raw: allText,
      summary: {
        total: validFiles.length,
        successful: successfulUploads.length,
        failed: failedUploads.length,
        upload_time: uploadTime,
        total_time: totalTime
      },
      errors: failedUploads.length > 0 ? failedUploads.map(f => ({
        file_name: f.file_name,
        error: f.error
      })) : null,
      // ✅ ADD ROLLBACK INFO FOR CHAT CONTROLLER
      _internal: {
        uploaded_file_ids: uploadedFileIds.filter(id => id !== null && id !== undefined), // ✅ Filter out null/undefined IDs
        needs_confirmation: successfulUploads.length > 0
      }
    };

    return res.status(failedUploads.length === validFiles.length ? 400 : 201).json(response);

  } catch (error) {
    console.error("❌ File upload controller error:", error);
    
    // ✅ ROLLBACK ON CRITICAL ERROR
    if (uploadedFileIds.length > 0) {
      try {
        const validIds = uploadedFileIds.filter(id => id !== null && id !== undefined);
        if (validIds.length > 0) {
          await executeQuery(
            `DELETE FROM uploaded_files WHERE id IN (${validIds.map(() => '?').join(',')})`,
            validIds
          );
          console.log(`🔄 Rolled back ${validIds.length} files due to critical error`);
        }
      } catch (rollbackError) {
        console.error("❌ Rollback failed:", rollbackError);
      }
    }
    
    res.status(500).json({ 
      success: false,
      error: "File processing failed", 
      details: error.message,
      files: []
    });
  }
};
