 



// // ✅ FIXED IMPORT - Use default import for backward compatibility
// const db = require("../config/db");
// const {uploadToFTP} = require("../utils/ftpUploader");
// const { uploadMultipleToFTP } = require("../utils/ftpUploader");
// const extractText = require("../utils/extractText");
// const FileGenerator = require('../utils/fileGenerator');
// const { sanitizeDisplayName } = require("../utils/FilenameGenerator");
// // ✅ STANDARDIZED DATABASE QUERY WRAPPER
// const executeQuery = async (sql, params = []) => {
//   try {
//     const result = await db.query(sql, params);
//     if (Array.isArray(result) && Array.isArray(result[0])) {
//       return result[0];
//     }
//     return result;
//   } catch (error) {
//     console.error("❌ Database query error:", error);
//     throw error;
//   }
// };




// exports.uploadFiles = async (req, res) => {
//   const startTime = Date.now();
//   let uploadedFileIds = []; // ✅ Track uploaded file IDs for rollback
  
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
//           [user_id, userMessage?.slice(0, 20) || "New Conversation"]
//         );
//         finalConversationId = convResult.insertId;
//         console.log(`✅ Created new conversation without files: ${finalConversationId}`);
//       } catch (convError) {
//         console.error("❌ Failed to create conversation:", convError);
//         return res.status(500).json({ error: "Failed to create conversation" });
//       }
//     }

//     // ✅ HANDLE CASE WHERE NO FILES ARE UPLOADED
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
//     }).filter(Boolean);

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
//      const textExtractionPromises = uploadResults.map(async (uploadResult, index) => {
//       let dbResult = null; // ✅ DECLARE AT TOP LEVEL
      
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
            
//             // ✅ SAVE TO DATABASE WITH PENDING STATUS
//             const fullExtractedText = extractedText && extractedText.length > 0 
//               ? extractedText 
//               : "No readable content extracted";

//             const fileMetadata = {
//               original_filename: uploadResult.originalFilename,
//               display_filename: sanitizeDisplayName(uploadResult.originalFilename),
//               unique_filename: uploadResult.uniqueFilename,
//               file_size: originalFile.size,
//               mime_type: originalFile.mimetype,
//               upload_timestamp: new Date().toISOString(),
//               extraction_status: extractedText ? 'success' : 'failed',
//               status: 'pending_response'
//             };

//             dbResult = await executeQuery(
//               "INSERT INTO uploaded_files (user_id, file_path, extracted_text, conversation_id, file_metadata, status, created_at) VALUES (?, ?, ?, ?, ?, 'pending_response', NOW())",
//               [user_id, uploadResult.filePath, fullExtractedText, finalConversationId, JSON.stringify(fileMetadata)]
//             );
            
//             // ✅ TRACK FILE ID FOR POTENTIAL ROLLBACK
//             uploadedFileIds.push(dbResult.insertId);
            
//             console.log(`✅ Saved to database with pending status: ${uploadResult.originalFilename}`);
            
//           } catch (extractError) {
//             console.error(`❌ Text extraction failed for ${uploadResult.originalFilename}:`, extractError);
            
//             // ✅ SAVE TO DATABASE EVEN IF EXTRACTION FAILS
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

//             dbResult = await executeQuery(
//               "INSERT INTO uploaded_files (user_id, file_path, extracted_text, conversation_id, file_metadata, status, created_at) VALUES (?, ?, ?, ?, ?, 'pending_response', NOW())",
//               [user_id, uploadResult.filePath, "Text extraction failed", finalConversationId, JSON.stringify(fileMetadata)]
//             );
            
//             uploadedFileIds.push(dbResult.insertId);
//             console.log(`✅ Saved to database (extraction failed): ${uploadResult.originalFilename}`);
//           }
          
//           return {
//             file_id: dbResult?.insertId || null,
//             file_name: uploadResult.originalFilename,
//             original_filename: uploadResult.originalFilename,
//             display_name: sanitizeDisplayName(uploadResult.originalFilename),
//             unique_filename: uploadResult.uniqueFilename,
//             file_path: uploadResult.filePath,
//             file_type: originalFile.mimetype,
//             file_size: originalFile.size,
//             extracted_text: dbResult ? "Success" : "Text extraction failed",
//             upload_success: true,
//             database_saved: true,
//             error: null
//           };
          
//         } else {
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

//     // ✅ PREPARE RESPONSE WITH ROLLBACK INFO
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
//       })) : null,
//       // ✅ ADD ROLLBACK INFO FOR CHAT CONTROLLER
//       _internal: {
//         uploaded_file_ids: uploadedFileIds.filter(id => id !== null && id !== undefined), // ✅ Filter out null/undefined IDs
//         needs_confirmation: successfulUploads.length > 0
//       }
//     };

//     return res.status(failedUploads.length === validFiles.length ? 400 : 201).json(response);

//   } catch (error) {
//     console.error("❌ File upload controller error:", error);
    
//     // ✅ ROLLBACK ON CRITICAL ERROR
//     if (uploadedFileIds.length > 0) {
//       try {
//         const validIds = uploadedFileIds.filter(id => id !== null && id !== undefined);
//         if (validIds.length > 0) {
//           await executeQuery(
//             `DELETE FROM uploaded_files WHERE id IN (${validIds.map(() => '?').join(',')})`,
//             validIds
//           );
//           console.log(`🔄 Rolled back ${validIds.length} files due to critical error`);
//         }
//       } catch (rollbackError) {
//         console.error("❌ Rollback failed:", rollbackError);
//       }
//     }
    
//     res.status(500).json({ 
//       success: false,
//       error: "File processing failed", 
//       details: error.message,
//       files: []
//     });
//   }
// };

// // Add this function to your existing fileController.js
// // ✅ NEW: Generate file on demand (AI-triggered)
// exports.generateFile = async (req, res) => {
//   try {
//     const user_id = req.user?.user_id;
//     const { fileType, content, filename, conversation_id } = req.body;

//     if (!user_id || !fileType || !content || !filename) {
//       return res.status(400).json({ 
//         error: "Missing required fields: fileType, content, filename" 
//       });
//     }

//     console.log(`🤖 Manual file generation request: ${fileType} - ${filename}`);

//     // Generate the file
//     const result = await FileGenerator.generateFileFromAIDecision(
//       fileType,
//       content,
//       filename,
//       conversation_id,
//       user_id
//     );

//     if (result.success) {
//       res.json({
//         success: true,
//         filename: result.filename,
//         download_url: result.downloadUrl,
//         file_size: result.size,
//         file_type: fileType,
//         message: "File generated successfully"
//       });
//     } else {
//       res.status(500).json({
//         error: "File generation failed",
//         details: result.error
//       });
//     }
//   } catch (error) {
//     console.error("❌ Manual file generation failed:", error);
//     res.status(500).json({
//       error: "File generation failed",
//       details: error.message
//     });
//   }
// };

// // ✅ NEW: Download generated file
// exports.downloadGeneratedFile = async (req, res) => {
//   try {
//     const user_id = req.user?.user_id;
//     const { conversation_id, filename } = req.params;

//     if (!user_id || !conversation_id || !filename) {
//       return res.status(400).json({ error: "Missing required parameters" });
//     }

//     // Verify ownership and get file data
//     const fileData = await executeQuery(
//       `SELECT gf.*, c.user_id 
//        FROM generated_files gf
//        JOIN conversations c ON gf.conversation_id = c.id
//        WHERE gf.conversation_id = ? AND gf.filename = ? AND c.user_id = ?`,
//       [conversation_id, filename, user_id]
//     );

//     if (!fileData || fileData.length === 0) {
//       return res.status(404).json({ error: "File not found or unauthorized" });
//     }

//     const file = fileData[0];

//     // If file has download URL, redirect to it
//     if (file.download_url) {
//       return res.redirect(file.download_url);
//     }

//     // If file has base64 data, serve it directly
//     if (file.file_data) {
//       const buffer = Buffer.from(file.file_data, 'base64');
      
//       res.setHeader('Content-Type', file.mime_type);
//       res.setHeader('Content-Disposition', `attachment; filename="${file.filename}"`);
//       res.setHeader('Content-Length', buffer.length);
      
//       return res.send(buffer);
//     }

//     return res.status(404).json({ error: "File data not available" });

//   } catch (error) {
//     console.error("❌ File download failed:", error);
//     res.status(500).json({
//       error: "File download failed",
//       details: error.message
//     });
//   }
// };

// // ✅ NEW: Regenerate file
// exports.regenerateFile = async (req, res) => {
//   try {
//     const user_id = req.user?.user_id;
//     const { conversation_id, filename, fileType, content } = req.body;

//     if (!user_id || !conversation_id || !filename || !fileType || !content) {
//       return res.status(400).json({ 
//         error: "Missing required fields" 
//       });
//     }

//     console.log(`🔄 Regenerating file: ${filename}`);

//     // Delete old file from FTP if exists
//     try {
//       const oldFileData = await executeQuery(
//         `SELECT ftp_path FROM generated_files 
//          WHERE conversation_id = ? AND filename = ? AND user_id = ?`,
//         [conversation_id, filename, user_id]
//       );

//       if (oldFileData && oldFileData.length > 0 && oldFileData[0].ftp_path) {
//         const { FTPUploader } = require("../utils/ftpUploader");
//         const ftpUploader = new FTPUploader();
//         await ftpUploader.deleteFile(oldFileData[0].ftp_path);
//       }
//     } catch (deleteError) {
//       console.log("⚠️ Could not delete old file:", deleteError.message);
//     }

//     // Generate new file
//     const result = await FileGenerator.generateFileFromAIDecision(
//       fileType,
//       content,
//       filename.replace(/\.[^/.]+$/, ""), // Remove extension
//       conversation_id,
//       user_id
//     );

//     if (result.success) {
//       // Update database record
//       await executeQuery(
//         `UPDATE generated_files 
//         SET file_data = ?, file_metadata = ?, file_size = ?, ftp_path = ?, download_url = ?, created_at = NOW()
//          WHERE conversation_id = ? AND filename = ? AND user_id = ?`,
//         [
//           result.buffer ? result.buffer.toString('base64') : null,
//           JSON.stringify({
//             original_filename: result.filename,
//             display_filename: result.filename,
//             file_size: result.size,
//             mime_type: result.mimeType,
//             regenerated_at: new Date().toISOString(),
//             is_ai_generated: true,
//           }),
//           result.size,
//           result.ftpPath,
//           result.downloadUrl,
//           conversation_id,
//           filename,
//           user_id
//         ]
//       );

//       res.json({
//         success: true,
//         filename: result.filename,
//         download_url: result.downloadUrl,
//         file_size: result.size,
//         file_type: fileType,
//         message: "File regenerated successfully"
//       });
//     } else {
//       res.status(500).json({
//         error: "File regeneration failed",
//         details: result.error
//       });
//     }
//   } catch (error) {
//     console.error("❌ File regeneration failed:", error);
//     res.status(500).json({
//       error: "File regeneration failed",
//       details: error.message
//     });
//   }
// };


// ✅ FIXED IMPORT - Use default import for backward compatibility
const db = require("../config/db");
const {uploadToFTP} = require("../utils/ftpUploader");
const { uploadMultipleToFTP } = require("../utils/ftpUploader");
const extractText = require("../utils/extractText");
const FileGenerator = require('../utils/fileGenerator');
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
        
        // ✅ HANDLE UPLOAD SUCCESS - FIX THE filePath ISSUE
        if (uploadResult && uploadResult.success) {
          try {
            console.log(`📄 Processing: ${uploadResult.originalFilename} | Type: ${originalFile.mimetype}`);
            
            // ✅ FIX: Handle both string and object return types from uploadToFTP
            let filePath;
            let uniqueFilename;
            
            if (typeof uploadResult.filePath === 'string') {
              filePath = uploadResult.filePath;
              uniqueFilename = uploadResult.uniqueFilename || filePath.split('/').pop();
            } else if (uploadResult.filePath && typeof uploadResult.filePath === 'object') {
              filePath = uploadResult.filePath.ftpPath || uploadResult.filePath;
              uniqueFilename = uploadResult.filePath.actualFilename || uploadResult.uniqueFilename;
            } else {
              throw new Error("Invalid file path returned from upload");
            }
            
            const extractedText = await extractText(
              originalFile.buffer, 
              originalFile.mimetype, 
              filePath,
              uploadResult.originalFilename
            );
            
            // ✅ SAVE TO DATABASE WITH PENDING STATUS
            const fullExtractedText = extractedText && extractedText.length > 0 
              ? extractedText 
              : "No readable content extracted";

            const fileMetadata = {
              original_filename: uploadResult.originalFilename,
              display_filename: sanitizeDisplayName(uploadResult.originalFilename),
              unique_filename: uniqueFilename,
              file_size: originalFile.size,
              mime_type: originalFile.mimetype,
              upload_timestamp: new Date().toISOString(),
              extraction_status: extractedText ? 'success' : 'failed',
              status: 'pending_response'
            };

            dbResult = await executeQuery(
              "INSERT INTO uploaded_files (user_id, file_path, extracted_text, conversation_id, file_metadata, status, created_at) VALUES (?, ?, ?, ?, ?, 'pending_response', NOW())",
              [user_id, filePath, fullExtractedText, finalConversationId, JSON.stringify(fileMetadata)]
            );
            
            // ✅ TRACK FILE ID FOR POTENTIAL ROLLBACK
            uploadedFileIds.push(dbResult.insertId);
            
            console.log(`✅ Saved to database with pending status: ${uploadResult.originalFilename}`);
            
          } catch (extractError) {
            console.error(`❌ Text extraction failed for ${uploadResult.originalFilename}:`, extractError);
            
            // ✅ SAVE TO DATABASE EVEN IF EXTRACTION FAILS
            let filePath;
            let uniqueFilename;
            
            if (typeof uploadResult.filePath === 'string') {
              filePath = uploadResult.filePath;
              uniqueFilename = uploadResult.uniqueFilename || filePath.split('/').pop();
            } else if (uploadResult.filePath && typeof uploadResult.filePath === 'object') {
              filePath = uploadResult.filePath.ftpPath || uploadResult.filePath;
              uniqueFilename = uploadResult.filePath.actualFilename || uploadResult.uniqueFilename;
            } else {
              filePath = "/error/path";
              uniqueFilename = "error_file";
            }
            
            const fileMetadata = {
              original_filename: uploadResult.originalFilename,
              display_filename: sanitizeDisplayName(uploadResult.originalFilename),
              unique_filename: uniqueFilename,
              file_size: originalFile.size,
              mime_type: originalFile.mimetype,
              upload_timestamp: new Date().toISOString(),
              extraction_status: 'failed',
              extraction_error: extractError.message
            };

            dbResult = await executeQuery(
              "INSERT INTO uploaded_files (user_id, file_path, extracted_text, conversation_id, file_metadata, status, created_at) VALUES (?, ?, ?, ?, ?, 'pending_response', NOW())",
              [user_id, filePath, "Text extraction failed", finalConversationId, JSON.stringify(fileMetadata)]
            );
            
            uploadedFileIds.push(dbResult.insertId);
            console.log(`✅ Saved to database (extraction failed): ${uploadResult.originalFilename}`);
          }
          
          // ✅ FIX: Handle filePath properly in return
          let finalFilePath;
          let finalUniqueFilename;
          
          if (typeof uploadResult.filePath === 'string') {
            finalFilePath = uploadResult.filePath;
            finalUniqueFilename = uploadResult.uniqueFilename || finalFilePath.split('/').pop();
          } else if (uploadResult.filePath && typeof uploadResult.filePath === 'object') {
            finalFilePath = uploadResult.filePath.ftpPath || uploadResult.filePath;
            finalUniqueFilename = uploadResult.filePath.actualFilename || uploadResult.uniqueFilename;
          } else {
            finalFilePath = "/error/path";
            finalUniqueFilename = "error_file";
          }
          
          return {
            file_id: dbResult?.insertId || null,
            file_name: uploadResult.originalFilename,
            original_filename: uploadResult.originalFilename,
            display_name: sanitizeDisplayName(uploadResult.originalFilename),
            unique_filename: finalUniqueFilename,
            file_path: finalFilePath,
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

// Add this function to your existing fileController.js
// ✅ NEW: Generate file on demand (AI-triggered)
exports.generateFile = async (req, res) => {
  try {
    const user_id = req.user?.user_id;
    const { fileType, content, filename, conversation_id } = req.body;

    if (!user_id || !fileType || !content || !filename) {
      return res.status(400).json({ 
        error: "Missing required fields: fileType, content, filename" 
      });
    }

    console.log(`🤖 Manual file generation request: ${fileType} - ${filename}`);

    // Generate the file
    const result = await FileGenerator.generateFileFromAIDecision(
      fileType,
      content,
      filename,
      conversation_id,
      user_id
    );

    if (result.success) {
      res.json({
        success: true,
        filename: result.filename,
        download_url: result.downloadUrl,
        file_size: result.size,
        file_type: fileType,
        message: "File generated successfully"
      });
    } else {
      res.status(500).json({
        error: "File generation failed",
        details: result.error
      });
    }
  } catch (error) {
    console.error("❌ Manual file generation failed:", error);
    res.status(500).json({
      error: "File generation failed",
      details: error.message
    });
  }
};

// ✅ NEW: Download generated file
exports.downloadGeneratedFile = async (req, res) => {
  try {
    const user_id = req.user?.user_id;
    const { conversation_id, filename } = req.params;

    if (!user_id || !conversation_id || !filename) {
      return res.status(400).json({ error: "Missing required parameters" });
    }

    // Verify ownership and get file data
    const fileData = await executeQuery(
      `SELECT gf.*, c.user_id 
       FROM generated_files gf
       JOIN conversations c ON gf.conversation_id = c.id
       WHERE gf.conversation_id = ? AND gf.filename = ? AND c.user_id = ?`,
      [conversation_id, filename, user_id]
    );

    if (!fileData || fileData.length === 0) {
      return res.status(404).json({ error: "File not found or unauthorized" });
    }

    const file = fileData[0];

    // If file has download URL, redirect to it
    if (file.download_url) {
      return res.redirect(file.download_url);
    }

    // If file has base64 data, serve it directly
    if (file.file_data) {
      const buffer = Buffer.from(file.file_data, 'base64');
      
      res.setHeader('Content-Type', file.mime_type);
      res.setHeader('Content-Disposition', `attachment; filename="${file.filename}"`);
      res.setHeader('Content-Length', buffer.length);
      
      return res.send(buffer);
    }

    return res.status(404).json({ error: "File data not available" });

  } catch (error) {
    console.error("❌ File download failed:", error);
    res.status(500).json({
      error: "File download failed",
      details: error.message
    });
  }
};

// ✅ NEW: Regenerate file
exports.regenerateFile = async (req, res) => {
  try {
    const user_id = req.user?.user_id;
    const { conversation_id, filename, fileType, content } = req.body;

    if (!user_id || !conversation_id || !filename || !fileType || !content) {
      return res.status(400).json({ 
        error: "Missing required fields" 
      });
    }

    console.log(`🔄 Regenerating file: ${filename}`);

    // Delete old file from FTP if exists
    try {
      const oldFileData = await executeQuery(
        `SELECT ftp_path FROM generated_files 
         WHERE conversation_id = ? AND filename = ? AND user_id = ?`,
        [conversation_id, filename, user_id]
      );

      if (oldFileData && oldFileData.length > 0 && oldFileData[0].ftp_path) {
        const { FTPUploader } = require("../utils/ftpUploader");
        const ftpUploader = new FTPUploader();
        await ftpUploader.deleteFile(oldFileData[0].ftp_path);
      }
    } catch (deleteError) {
      console.log("⚠️ Could not delete old file:", deleteError.message);
    }

    // Generate new file
    const result = await FileGenerator.generateFileFromAIDecision(
      fileType,
      content,
      filename.replace(/\.[^/.]+$/, ""), // Remove extension
      conversation_id,
      user_id
    );

    if (result.success) {
      // Update database record
      await executeQuery(
        `UPDATE generated_files 
        SET file_data = ?, file_metadata = ?, file_size = ?, ftp_path = ?, download_url = ?, created_at = NOW()
         WHERE conversation_id = ? AND filename = ? AND user_id = ?`,
        [
          result.buffer ? result.buffer.toString('base64') : null,
          JSON.stringify({
            original_filename: result.filename,
            display_filename: result.filename,
            file_size: result.size,
            mime_type: result.mimeType,
            regenerated_at: new Date().toISOString(),
            is_ai_generated: true,
          }),
          result.size,
          result.ftpPath,
          result.downloadUrl,
          conversation_id,
          filename,
          user_id
        ]
      );

      res.json({
        success: true,
        filename: result.filename,
        download_url: result.downloadUrl,
        file_size: result.size,
        file_type: fileType,
        message: "File regenerated successfully"
      });
    } else {
      res.status(500).json({
        error: "File regeneration failed",
        details: result.error
      });
    }
  } catch (error) {
    console.error("❌ File regeneration failed:", error);
    res.status(500).json({
      error: "File regeneration failed",
      details: error.message
    });
  }
};

