const { Mistral } = require("@mistralai/mistralai");
 
const mammoth = require("mammoth");
const xlsx = require("xlsx");

const mistral = new Mistral({ apiKey: process.env.MISTRAL_API_KEY });

const extractText = async (buffer, mimeType, ftpUrl) => {
  try {
    if (mimeType === "application/pdf" || mimeType.startsWith("image/")) {
      // OCR using mistral on FTP public URL
      const ocrResponse = await mistral.ocr.process({
        model: "mistral-ocr-latest",
        document: {
          type: "document_url",
          documentUrl: `https://quantumhash.me${ftpUrl}`, // 🔁 Adjust domain
        },
        includeImageBase64: false,
      });

      return ocrResponse?.text || "[No text extracted]";
    }

    if (mimeType === "text/plain") {
      return buffer.toString("utf-8").trim();
    }

    if (mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
      const result = await mammoth.extractRawText({ buffer });
      return result.value.trim();
    }

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
