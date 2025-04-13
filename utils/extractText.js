const { Mistral } = require("@mistralai/mistralai");
const mammoth = require("mammoth");
const xlsx = require("xlsx");
const axios = require("axios");

const mistral = new Mistral({ apiKey: process.env.MISTRAL_API_KEY });

// Check if file URL is publicly accessible before processing
const checkFilePublic = async (url) => {
  try {
    const res = await axios.head(url); // Check headers only (no full download)
    return res.status === 200;
  } catch (err) {
    console.error("File is not publicly available yet:", err.message);
    return false;
  }
};

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const extractText = async (buffer, mimeType, ftpUrl) => {
  try {
    const documentUrl = `https://quantumhash.me${ftpUrl}`; // Full public path
    console.log("url", documentUrl);

    // Ensure the file is publicly accessible first
    let retries = 3;
    let isAccessible = false;
    while (retries > 0 && !isAccessible) {
      isAccessible = await checkFilePublic(documentUrl);
      if (!isAccessible) {
        console.log("Retrying in 3 seconds...");
        await delay(3000); // Wait 3 seconds before retrying
        retries--;
      }
    }

    if (!isAccessible) {
      throw new Error("File is not publicly accessible after retries.");
    }

    // ✅ Use Mistral OCR directly for PDFs and images via public FTP URL
    if (mimeType === "application/pdf" || mimeType.startsWith("image/")) {
      try {
        const response = await mistral.ocr.process({
          model: "mistral-ocr-latest",
          document: {
            type: "document_url",
            documentUrl: documentUrl,
          },
          includeImageBase64: false,
        });

        const text = response?.text?.trim();
        return text && text.length > 0 ? text : "[No text extracted]";
      } catch (ocrError) {
        console.error("❌ Mistral OCR error:", ocrError.message);
        return "[Error with OCR extraction]";
      }
    }

    // ✅ Handle plain text files (TXT)
    if (mimeType === "text/plain") {
      return buffer.toString("utf-8").trim();
    }

    // ✅ Handle Word DOCX files
    if (mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
      const result = await mammoth.extractRawText({ buffer });
      return result.value.trim();
    }

    // ✅ Handle Excel files (XLSX)
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
