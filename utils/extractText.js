const { Mistral } = require("@mistralai/mistralai");
const mammoth = require("mammoth");
const xlsx = require("xlsx");

const mistral = new Mistral({ apiKey: process.env.MISTRAL_API_KEY });

const extractText = async (buffer, mimeType, ftpUrl) => {
  try {
    // ✅ Use Mistral OCR directly for PDFs and images via public FTP URL
    if (mimeType === "application/pdf" || mimeType.startsWith("image/")) {
      const documentUrl = `https://quantumhash.me${ftpUrl}`; // Full public URL

      console.log("🔗 Document URL:", documentUrl);

      try {
        const response = await mistral.chat({
          model: "mistral-small",
          messages: [
            {
              role: "user",
              content: `Extract the text from this document: ${documentUrl}`,
            },
          ],
        });

        console.log("📥 Mistral Chat Response:", response);

        const text = response?.choices?.[0]?.message?.content?.trim();
        return text || "[No text extracted]";
      } catch (ocrError) {
        console.error("❌ Mistral OCR error:", ocrError.message);
        return "[Error with OCR extraction]";
      }
    }

    // ✅ Handle plain text files
    if (mimeType === "text/plain") {
      return buffer.toString("utf-8").trim();
    }

    // ✅ Handle DOCX
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

module.exports = extractText;
