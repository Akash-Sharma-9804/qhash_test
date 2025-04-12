const { Mistral } = require("@mistralai/mistralai");
const mammoth = require("mammoth");
const xlsx = require("xlsx");
const fs = require("fs");
const path = require("path");
const { fromPath } = require("pdf2pic");
const os = require("os");
const sharp = require("sharp"); // To optimize image before uploading
const { uploadToFTP } = require("./ftpUploader"); // Ensure FTP uploader is implemented

const mistral = new Mistral({ apiKey: process.env.MISTRAL_API_KEY });

const extractText = async (buffer, mimeType, ftpUrl) => {
  try {
    // ✅ TEXT-BASED PDFs OR IMAGES DIRECTLY FROM FTP URL
    if (mimeType === "application/pdf" || mimeType.startsWith("image/")) {
      // Try direct OCR via Mistral first
      try {
        const directResponse = await mistral.ocr.process({
          model: "mistral-ocr-latest",
          document: {
            type: "document_url",
            documentUrl: `https://quantumhash.me${ftpUrl}`,
          },
          includeImageBase64: false,
        });

        const text = directResponse?.text?.trim();
        if (text && text.length > 30) {
          return text; // Return early if OCR successful
        }
      } catch (err) {
        console.warn("📎 Fallback to OCR from images due to Mistral URL OCR failure.");
      }

      // ✅ FALLBACK: CONVERT PDF PAGES TO IMAGES, UPLOAD TO FTP, OCR EACH PAGE
      if (mimeType === "application/pdf") {
        const tempPdfPath = path.join(os.tmpdir(), `input-${Date.now()}.pdf`);
        fs.writeFileSync(tempPdfPath, buffer);

        // Correct conversion options for pdf2pic
        const convert = fromPath(tempPdfPath, {
          density: 300, // Higher resolution for OCR accuracy
          saveFilename: "ocr-page",
          savePath: os.tmpdir(),
          format: "png",
          width: 1500, // Larger width for better clarity
          quality: 100, // Max quality for better OCR results
        });

        // Get the total pages count
        const pageInfo = await convert(1, true); // First page for checking total
        const totalPages = pageInfo.length || 1;  // Default to 1 page if none is detected

        const imagePaths = [];
        for (let i = 1; i <= totalPages; i++) {
          const result = await convert(i); // Convert each page to image
          imagePaths.push(result.path); // Store the image paths
        }

        const ocrTexts = await Promise.all(
          imagePaths.map(async (imgPath) => {
            // Preprocess image before OCR
            const imgBuffer = await sharp(imgPath)
              .resize(1500, 1500)  // Improve resolution
              .grayscale() // Convert to grayscale for clarity
              .normalize() // Normalize for better contrast
              .toBuffer();

            // Upload image to FTP and OCR using Mistral
            const ftpImagePath = await uploadToFTP(imgBuffer, `ocr-img-${Date.now()}-${path.basename(imgPath)}`);
            const imgUrl = `https://quantumhash.me${ftpImagePath}`;

            const ocrRes = await mistral.ocr.process({
              model: "mistral-ocr-latest",
              document: {
                type: "document_url",
                documentUrl: imgUrl,
              },
              includeImageBase64: false,
            });

            return ocrRes?.text || ""; // Return OCR result for each image
          })
        );

        // Combine the OCR results from all pages
        return ocrTexts.join("\n--- Page Break ---\n").trim();
      }
    }

    // ✅ PLAIN TEXT
    if (mimeType === "text/plain") {
      return buffer.toString("utf-8").trim();
    }

    // ✅ WORD DOCX
    if (mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
      const result = await mammoth.extractRawText({ buffer });
      return result.value.trim();
    }

    // ✅ EXCEL
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
