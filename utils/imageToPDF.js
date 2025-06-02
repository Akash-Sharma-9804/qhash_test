// utils/imageToPDF.js
const PDFDocument = require("pdfkit");

const convertImageToPDF = async (imageBuffer) => {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ autoFirstPage: false });
      const chunks = [];

      doc.on("data", (chunk) => chunks.push(chunk));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      doc.addPage();
      doc.image(imageBuffer, {
        fit: [500, 700],
        align: "center",
        valign: "center",
      });

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
};

module.exports = convertImageToPDF;
