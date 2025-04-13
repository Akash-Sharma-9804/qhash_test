const fs = require("fs");
const path = require("path");
const mammoth = require("mammoth");
const xlsx = require("xlsx");
const { basic_ftp } = require("basic-ftp");
const { mistral } = require("@mistralai/mistralai");

const extractText = async (buffer, mimeType, ftpUrl) => {
  try {
    // ✅ OCR for PDFs and images using public URL
    if (mimeType === "application/pdf" || mimeType.startsWith("image/")) {
      const documentUrl = `https://quantumhash.me${ftpUrl}`;
      console.log("🔗 Document URL:", documentUrl);

      try {
        const response = await mistral.ocr.process({
          model: "mistral-ocr-latest",
          document: {
            type: "document_url",
            documentUrl: documentUrl,
          },
          includeImageBase64: false,
        });

        console.log("📥 Mistral OCR full response:", response);

        // Extract text from each page in the response
        let extractedText = "";
        if (response.pages && Array.isArray(response.pages)) {
          response.pages.forEach((page) => {
            if (page.markdown) {
              extractedText += page.markdown.trim() + "\n\n"; // Concatenate text from each page
            }
          });
        }

        // Clean up any unwanted parts (like image tags) if necessary
        extractedText = extractedText.replace(/!\[.*?\]\(.*?\)/g, ""); // Remove image tags

        // Return the extracted text
        return extractedText.length > 0 ? extractedText : "[No text extracted]";
      } catch (ocrError) {
        console.error("❌ Mistral OCR error:", ocrError.message);
        return "[Error with OCR extraction]";
      }
    }

    // ✅ Handle TXT files
    if (mimeType === "text/plain") {
      return buffer.toString("utf-8").trim();
    }

    // ✅ Handle DOCX files
    if (mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
      const result = await mammoth.extractRawText({ buffer });
      return result.value.trim();
    }

    // ✅ Handle Excel XLSX
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

