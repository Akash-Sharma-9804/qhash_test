



// const { Mistral } = require("@mistralai/mistralai");
// const mammoth = require("mammoth");
// const xlsx = require("xlsx");
// const convertImageToPDF = require("./imageToPDF");
// const mistral = new Mistral({ apiKey: process.env.MISTRAL_API_KEY });
// const  uploadToFTP = require("./ftpUploader");

// const extractText = async (buffer, mimeType, ftpUrl, originalFileName) => {
//   console.log("🔄 ftpurl",ftpUrl);
//  try {
//     // ✅ If image, convert to PDF and re-upload
//     if (mimeType.startsWith("image/")) {
//       const pdfBuffer = await convertImageToPDF(buffer);
//       const pdfFileName = `${Date.now()}-${originalFileName}.pdf`;
//       const newFtpUrl = await uploadToFTP(pdfBuffer, pdfFileName); // reuse your uploadToFTP
//       ftpUrl = newFtpUrl;
//       mimeType = "application/pdf";
//     }

//     // ✅ OCR for PDFs using public URL
//     if (mimeType === "application/pdf") {
//       const documentUrl = `https://qhashai.com${ftpUrl}`;
//       console.log("🔗 Document URL:", documentUrl);

//       try {
//         const response = await mistral.ocr.process({
//           model: "mistral-ocr-latest",
//           document: {
//             type: "document_url",
//             documentUrl: documentUrl,
//           },
//           includeImageBase64: false,
//         });

//         console.log("📥 Full OCR response:", JSON.stringify(response, null, 2));

//         // 🔁 Loop through all pages and merge markdown text
//         if (response?.pages && response.pages.length > 0) {
//           let fullText = "";
//           response.pages.forEach((page, index) => {
//             const markdown = page?.markdown?.trim();
//             if (markdown && markdown.length > 0) {
//               fullText += `\n\n--- Page ${index + 1} ---\n${markdown}`;
//             }
//           });

//           return fullText.length > 0 ? fullText.trim() : "[No text extracted from OCR]";
//         }

//         return "[No pages or markdown found in OCR result]";
//       } catch (ocrError) {
//         console.error("❌ Mistral OCR error:", ocrError.message);
//         return "[Error with OCR extraction]";
//       }
//     }

//     // ✅ Handle plain text files (.txt)
//     if (mimeType === "text/plain") {
//       return buffer.toString("utf-8").trim();
//     }

//     // ✅ Handle DOCX files (.docx)
//     if (mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
//       const result = await mammoth.extractRawText({ buffer });
//       return result.value.trim();
//     }

//     // ✅ Handle Excel XLSX files
//     if (
//       mimeType.includes("spreadsheet") ||
//       mimeType.includes("excel") ||
//       mimeType === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
//     ) {
//       const workbook = xlsx.read(buffer, { type: "buffer" });
//       let output = "";

//       workbook.SheetNames.forEach((sheetName) => {
//         const sheet = workbook.Sheets[sheetName];
//         const text = xlsx.utils.sheet_to_txt(sheet);
//         output += `\n--- Sheet: ${sheetName} ---\n${text}`;
//       });

//       return output.trim();
//     }

//     // ❌ Unsupported file type
//     return "[Unsupported file type]";
//   } catch (err) {
//     console.error("❌ extractText error:", err.message);
//     return "[Error extracting text]";
//   }
// };

// module.exports = extractText;


// const { Mistral } = require("@mistralai/mistralai");
// const mammoth = require("mammoth");
// const xlsx = require("xlsx");
// const convertImageToPDF = require("./imageToPDF");
// const uploadToFTP = require("./ftpUploader");
// const mistral = new Mistral({ apiKey: process.env.MISTRAL_API_KEY });
// const { Blob } = require("fetch-blob");

// const extractText = async (buffer, mimeType, ftpUrl, originalFileName) => {
//   console.log("🔄 ftpurl", ftpUrl);

//   try {
//     // Convert image to PDF before proceeding
//     if (mimeType.startsWith("image/")) {
//       const pdfBuffer = await convertImageToPDF(buffer);
//       const pdfFileName = `${Date.now()}-${originalFileName}.pdf`;
//       const newFtpUrl = await uploadToFTP(pdfBuffer, pdfFileName);
//       ftpUrl = newFtpUrl;
//       mimeType = "application/pdf";
//       buffer = pdfBuffer; // now use this for Mistral upload too
//     }

//     // Use files.upload() + documentId for PDF OCR
//     if (mimeType === "application/pdf") {
//       console.log("📤 Uploading PDF to Mistral OCR API...");

     
// const blob = new Blob([buffer], { type: mimeType });
// blob.fileName = originalFileName; // add this property manually

// const uploadResponse = await mistral.files.upload({
//   file: blob,   // just pass the blob object directly
//   purpose: "ocr",
// });

//       console.log("✅ Mistral upload complete:", uploadResponse);

//       const response = await mistral.ocr.process({
//         model: "mistral-ocr-latest",
//         document: {
//           type: "document_id",
//           documentId: uploadResponse.id,
//         },
//         includeImageBase64: false,
//       });

//       console.log("📥 Full OCR response:", JSON.stringify(response, null, 2));

//       if (response?.pages && response.pages.length > 0) {
//         let fullText = "";
//         response.pages.forEach((page, index) => {
//           const markdown = page?.markdown?.trim();
//           if (markdown && markdown.length > 0) {
//             fullText += `\n\n--- Page ${index + 1} ---\n${markdown}`;
//           }
//         });

//         return fullText.length > 0 ? fullText.trim() : "[No text extracted from OCR]";
//       }

//       return "[No pages or markdown found in OCR result]";
//     }

//     // Plain text
//     if (mimeType === "text/plain") {
//       return buffer.toString("utf-8").trim();
//     }

//     // DOCX
//     if (
//       mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
//     ) {
//       const result = await mammoth.extractRawText({ buffer });
//       return result.value.trim();
//     }

//     // XLSX
//     if (
//       mimeType.includes("spreadsheet") ||
//       mimeType.includes("excel") ||
//       mimeType === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
//     ) {
//       const workbook = xlsx.read(buffer, { type: "buffer" });
//       let output = "";

//       workbook.SheetNames.forEach((sheetName) => {
//         const sheet = workbook.Sheets[sheetName];
//         const text = xlsx.utils.sheet_to_txt(sheet);
//         output += `\n--- Sheet: ${sheetName} ---\n${text}`;
//       });

//       return output.trim();
//     }

//     // Unsupported file type
//     return "[Unsupported file type]";
//   } catch (err) {
//     console.error("❌ extractText error:", err.message);
//     return "[Error extracting text]";
//   }
// };

// module.exports = extractText;


 
const mammoth = require("mammoth");
const xlsx = require("xlsx");
const convertImageToPDF = require("./imageToPDF");
const uploadToFTP = require("./ftpUploader");

const extractText = async (buffer, mimeType, ftpUrl, originalFileName) => {
  console.log("🔄 ftpurl", ftpUrl);
  try {
    // ✅ If image, convert to PDF and re-upload
    if (mimeType.startsWith("image/")) {
      const pdfBuffer = await convertImageToPDF(buffer);
      const pdfFileName = `${Date.now()}-${originalFileName}.pdf`;
      const newFtpUrl = await uploadToFTP(pdfBuffer, pdfFileName);
      ftpUrl = newFtpUrl;
      mimeType = "application/pdf";
    }

    // ✅ OCR for PDFs using public URL
    if (mimeType === "application/pdf") {
      const documentUrl = `https://qhashai.com${ftpUrl}`;
      console.log("🔗 Document URL:", documentUrl);

      try {
        const response = await fetch("https://api.mistral.ai/v1/ocr", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${process.env.MISTRAL_API_KEY}`,
          },
          body: JSON.stringify({
            model: "mistral-ocr-latest",
            document: {
              type: "document_url",
              document_url: documentUrl, // ⚠️ Snake_case required
            },
            include_image_base64: false,
          }),
        });

        if (!response.ok) {
          const errText = await response.text();
          throw new Error(`Mistral API error: ${response.status} ${errText}`);
        }

        const data = await response.json();
        console.log("📥 Full OCR response:", JSON.stringify(data, null, 2));

        // 🔁 Merge all markdown text from pages
        if (data?.pages?.length > 0) {
          let fullText = "";
          data.pages.forEach((page, index) => {
            const markdown = page?.markdown?.trim();
            if (markdown) {
              fullText += `\n\n--- Page ${index + 1} ---\n${markdown}`;
            }
          });

          return fullText.length > 0 ? fullText.trim() : "[No text extracted from OCR]";
        }

        return "[No pages or markdown found in OCR result]";
      } catch (ocrError) {
        console.error("❌ Mistral OCR error:", ocrError.message);
        return "[Error with OCR extraction]";
      }
    }

    // ✅ Plain text (.txt)
    if (mimeType === "text/plain") {
      return buffer.toString("utf-8").trim();
    }

    // ✅ DOCX (.docx)
    if (
      mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    ) {
      const result = await mammoth.extractRawText({ buffer });
      return result.value.trim();
    }

    // ✅ Excel files
    if (
      mimeType.includes("spreadsheet") ||
      mimeType.includes("excel") ||
      mimeType === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    ) {
      const workbook = xlsx.read(buffer, { type: "buffer" });
      let output = "";

      workbook.SheetNames.forEach((sheetName) => {
        const sheet = workbook.Sheets[sheetName];
        const text = xlsx.utils.sheet_to_txt(sheet);
        output += `\n--- Sheet: ${sheetName} ---\n${text}`;
      });

      return output.trim();
    }

    return "[Unsupported file type]";
  } catch (err) {
    console.error("❌ extractText error:", err.message);
    return "[Error extracting text]";
  }
};

module.exports = extractText;
