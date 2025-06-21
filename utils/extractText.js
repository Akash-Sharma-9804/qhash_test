
 
// const mammoth = require("mammoth");
// const xlsx = require("xlsx");
// const convertImageToPDF = require("./imageToPDF");
// const uploadToFTP = require("./ftpUploader");

// const extractText = async (buffer, mimeType, ftpUrl, originalFileName) => {
//   console.log("🔄 ftpurl", ftpUrl);
//   try {
//     // ✅ If image, convert to PDF and re-upload
//     if (mimeType.startsWith("image/")) {
//       const pdfBuffer = await convertImageToPDF(buffer);
//       const pdfFileName = `${Date.now()}-${originalFileName}.pdf`;
//       const newFtpUrl = await uploadToFTP(pdfBuffer, pdfFileName);
//       ftpUrl = newFtpUrl;
//       mimeType = "application/pdf";
//     }

//     // ✅ OCR for PDFs using public URL
//     if (mimeType === "application/pdf") {
//       const documentUrl = `https://qhashai.com${ftpUrl}`;
//       console.log("🔗 Document URL:", documentUrl);

//       try {
//         const response = await fetch("https://api.mistral.ai/v1/ocr", {
//           method: "POST",
//           headers: {
//             "Content-Type": "application/json",
//             Authorization: `Bearer ${process.env.MISTRAL_API_KEY}`,
//           },
//           body: JSON.stringify({
//             model: "mistral-ocr-latest",
//             document: {
//               type: "document_url",
//               document_url: documentUrl, // ⚠️ Snake_case required
//             },
//             include_image_base64: false,
//           }),
//         });

//         if (!response.ok) {
//           const errText = await response.text();
//           throw new Error(`Mistral API error: ${response.status} ${errText}`);
//         }

//         const data = await response.json();
//         console.log("📥 Full OCR response:", JSON.stringify(data, null, 2));

//         // 🔁 Merge all markdown text from pages
//         if (data?.pages?.length > 0) {
//           let fullText = "";
//           data.pages.forEach((page, index) => {
//             const markdown = page?.markdown?.trim();
//             if (markdown) {
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

//     // ✅ Plain text (.txt)
//     if (mimeType === "text/plain") {
//       return buffer.toString("utf-8").trim();
//     }

//     // ✅ DOCX (.docx)
//     if (
//       mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
//     ) {
//       const result = await mammoth.extractRawText({ buffer });
//       return result.value.trim();
//     }

//     // ✅ Excel files
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

//     return "[Unsupported file type]";
//   } catch (err) {
//     console.error("❌ extractText error:", err.message);
//     return "[Error extracting text]";
//   }
// };

// module.exports = extractText;

// working 

// const mammoth = require("mammoth");
// const xlsx = require("xlsx");
// const convertImageToPDF = require("./imageToPDF");
// const uploadToFTP = require("./ftpUploader");
// const cheerio = require("cheerio");

// const extractText = async (buffer, mimeType, ftpUrl, originalFileName) => {
//   console.log("🔄 ftpurl", ftpUrl);
//   try {
//     // ✅ If image, convert to PDF and re-upload
//     if (mimeType.startsWith("image/")) {
//       const pdfBuffer = await convertImageToPDF(buffer);
//       const pdfFileName = `${Date.now()}-${originalFileName}.pdf`;
//       const newFtpUrl = await uploadToFTP(pdfBuffer, pdfFileName);
//       ftpUrl = newFtpUrl;
//       mimeType = "application/pdf";
//     }

//     // ✅ OCR for PDFs using public URL
//     if (mimeType === "application/pdf") {
//       const documentUrl = `https://qhashai.com${ftpUrl}`;
//       console.log("🔗 Document URL:", documentUrl);

//       try {
//         const response = await fetch("https://api.mistral.ai/v1/ocr", {
//           method: "POST",
//           headers: {
//             "Content-Type": "application/json",
//             Authorization: `Bearer ${process.env.MISTRAL_API_KEY}`,
//           },
//           body: JSON.stringify({
//             model: "mistral-ocr-latest",
//             document: {
//               type: "document_url",
//               document_url: documentUrl,
//             },
//             include_image_base64: false,
//           }),
//         });

//         if (!response.ok) {
//           const errText = await response.text();
//           throw new Error(`Mistral API error: ${response.status} ${errText}`);
//         }

//         const data = await response.json();
//         console.log("📥 Full OCR response:", JSON.stringify(data, null, 2));

//         if (data?.pages?.length > 0) {
//           let fullText = "";
//           data.pages.forEach((page, index) => {
//             const markdown = page?.markdown?.trim();
//             if (markdown) {
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

//     // ✅ Plain text (.txt)
//     if (mimeType === "text/plain") {
//       return buffer.toString("utf-8").trim();
//     }

//     // ✅ Check if it's a DOC file (older format)
//     const isDocFile = originalFileName?.toLowerCase().endsWith('.doc') && 
//                      !originalFileName?.toLowerCase().endsWith('.docx');
    
//     // ✅ Check if it's a DOCX file
//     const isDocxFile = mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
//                        originalFileName?.toLowerCase().endsWith('.docx');

//     // ✅ Handle DOC files (older format) - IMPROVED APPROACH
//     if (isDocFile) {
//       console.log("📄 Detected DOC file, attempting multiple extraction methods...");
      
//       try {
//         // Method 1: Try mammoth first (sometimes works with DOC files)
//         try {
//           console.log("🔧 Attempting mammoth extraction on DOC file...");
//           const result = await mammoth.extractRawText({ buffer });
//           if (result.value && result.value.trim().length > 50) {
//             console.log("✅ Mammoth successfully extracted DOC content");
//             return result.value.trim();
//           }
//         } catch (mammothError) {
//           console.log("⚠️ Mammoth failed on DOC file, trying other methods...");
//         }

//         // Method 2: Check if it contains HTML content (some DOC files are HTML-based)
//         const rawText = buffer.toString('utf-8');
//         console.log("📄 Raw text length:", rawText.length);
        
//         const containsHTML = rawText.includes('<html') || rawText.includes('<HTML') || 
//                            rawText.includes('<body') || rawText.includes('<BODY') ||
//                            rawText.includes('<p>') || rawText.includes('<P>') ||
//                            rawText.includes('<div') || rawText.includes('<DIV');
        
//         if (containsHTML) {
//           console.log("🌐 Detected HTML content in DOC file");
//           const extractedText = await extractHTMLFromDoc(rawText);
//           if (extractedText && extractedText.length > 50 && !extractedText.includes('[Error')) {
//             return extractedText;
//           }
//         }
        
//         // Method 3: Check if it contains Word XML schema
//         const containsWordXML = rawText.includes('w:document') || rawText.includes('w:body') ||
//                                rawText.includes('xmlns:w=') || rawText.includes('wordDocument');
        
//         if (containsWordXML) {
//           console.log("📄 Detected Word XML schema in DOC file");
//           const extractedText = await extractTextFromWordXML(rawText);
//           if (extractedText && extractedText.length > 50 && !extractedText.includes('[Error')) {
//             return extractedText;
//           }
//         }
        
//         // Method 4: Basic text extraction with better encoding handling
//         console.log("🔧 Attempting basic text extraction...");
//         const basicText = extractBasicTextFromBuffer(buffer);
//         if (basicText && basicText.length > 50 && !basicText.includes('[Error') && !basicText.includes('[Could not')) {
//           return basicText;
//         }
        
//         // Method 5: Last resort - convert to PDF and use OCR
//         console.log("🔄 Last resort: Converting DOC to PDF for OCR...");
//         try {
//           // Convert DOC buffer to PDF using your existing conversion logic
//           const pdfBuffer = await convertDocToPDF(buffer, originalFileName);
//           if (pdfBuffer) {
//             // Upload PDF and use OCR
//             const pdfFileName = `${Date.now()}-converted-${originalFileName}.pdf`;
//             const pdfFtpUrl = await uploadToFTP(pdfBuffer, pdfFileName);
//             const documentUrl = `https://qhashai.com${pdfFtpUrl}`;
            
//             const response = await fetch("https://api.mistral.ai/v1/ocr", {
//               method: "POST",
//               headers: {
//                 "Content-Type": "application/json",
//                 Authorization: `Bearer ${process.env.MISTRAL_API_KEY}`,
//               },
//               body: JSON.stringify({
//                 model: "mistral-ocr-latest",
//                 document: {
//                   type: "document_url",
//                   document_url: documentUrl,
//                 },
//                 include_image_base64: false,
//               }),
//             });

//             if (response.ok) {
//               const data = await response.json();
//               if (data?.pages?.length > 0) {
//                 let fullText = "";
//                 data.pages.forEach((page, index) => {
//                   const markdown = page?.markdown?.trim();
//                   if (markdown) {
//                     fullText += `\n\n--- Page ${index + 1} ---\n${markdown}`;
//                   }
//                 });
//                 if (fullText.length > 0) {
//                   return fullText.trim();
//                 }
//               }
//             }
//           }
//         } catch (conversionError) {
//           console.error("❌ DOC to PDF conversion failed:", conversionError.message);
//         }
        
//         return "[DOC file detected but content extraction failed. Please convert to DOCX or PDF format for better results.]";
        
//       } catch (docError) {
//         console.error("❌ DOC processing error:", docError.message);
//         return "[Error processing DOC file. Please try converting to DOCX or PDF format.]";
//       }
//     }

//     // Handle DOCX files with mammoth
//     if (isDocxFile) {
//       console.log("📄 Processing DOCX file with mammoth...");
//       try {
//         const result = await mammoth.extractRawText({ buffer });
//         return result.value.trim();
//       } catch (docxError) {
//         console.error("❌ Error extracting DOCX:", docxError.message);
//         return "[Error extracting DOCX file]";
//       }
//     }

//     // ✅ Excel files (.xls and .xlsx)
//     if (
//       mimeType.includes("spreadsheet") ||
//       mimeType.includes("excel") ||
//       mimeType === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
//       mimeType === "application/vnd.ms-excel" ||
//       originalFileName?.toLowerCase().endsWith('.xls') ||
//       originalFileName?.toLowerCase().endsWith('.xlsx')
//     ) {
//       try {
//         const workbook = xlsx.read(buffer, { type: "buffer" });
//         let output = "";

//         workbook.SheetNames.forEach((sheetName) => {
//           const sheet = workbook.Sheets[sheetName];
//           const text = xlsx.utils.sheet_to_txt(sheet);
//           output += `\n--- Sheet: ${sheetName} ---\n${text}`;
//         });

//         return output.trim();
//       } catch (excelError) {
//         console.error("❌ Error extracting Excel file:", excelError.message);
//         return "[Error extracting Excel file]";
//       }
//     }

//     return "[Unsupported file type]";
//   } catch (err) {
//     console.error("❌ extractText error:", err.message);
//     return "[Error extracting text]";
//   }
// };

// // Helper function to extract HTML content from DOC files
// const extractHTMLFromDoc = async (rawText) => {
//   try {
//     console.log("🌐 Extracting HTML content...");
    
//     let htmlContent = '';
    
//     // Try to find HTML tags and extract content between them
//     const htmlMatches = rawText.match(/<html[\s\S]*?<\/html>/gi) || 
//                        rawText.match(/<body[\s\S]*?<\/body>/gi) ||
//                        rawText.match(/<div[\s\S]*?<\/div>/gi);
    
//     if (htmlMatches && htmlMatches.length > 0) {
//       htmlContent = htmlMatches.join('\n');
//     } else {
//       htmlContent = rawText;
//     }
    
//     // Use cheerio to parse and extract text from HTML
//     const $ = cheerio.load(htmlContent, { 
//       decodeEntities: true,
//       normalizeWhitespace: true 
//     });
    
//     // Remove script and style elements
//     $('script, style, meta, link').remove();
    
//     // Extract text content
//     let extractedText = $('body').text() || $.text();
    
//     // Clean up the text
//     extractedText = extractedText
//       .replace(/\s+/g, ' ')
//       .replace(/\n\s*\n/g, '\n')
//       .trim();
    
//     console.log("✅ HTML extraction completed, text length:", extractedText.length);
//     return extractedText.length > 0 ? extractedText : "[No readable text found in HTML content]";
    
//   } catch (htmlError) {
//     console.error("❌ HTML extraction error:", htmlError.message);
//     return "[Error extracting HTML content from DOC file]";
//   }
// };

// // Helper function to extract text from Word XML schema
// const extractTextFromWordXML = async (rawText) => {
//   try {
//     console.log("📄 Extracting text from Word XML...");
    
//     let cleanText = rawText
//       .replace(/<[^>]*>/g, ' ')
//       .replace(/&lt;/g, '<')
//       .replace(/&gt;/g, '>')
//       .replace(/&amp;/g, '&')
//       .replace(/&quot;/g, '"')
//       .replace(/&#39;/g, "'")
//       .replace(/&nbsp;/g, ' ')
//       .replace(/\s+/g, ' ')
//       .replace(/\n\s*\n/g, '\n')
//       .trim();
    
//     console.log("✅ Word XML extraction completed, text length:", cleanText.length);
//     return cleanText.length > 0 ? cleanText : "[No readable text found in Word XML]";
    
//   } catch (xmlError) {
//     console.error("❌ Word XML extraction error:", xmlError.message);
//     return "[Error extracting text from Word XML]";
//   }
// };

// // Helper function for basic text extraction with better encoding
// const extractBasicTextFromBuffer = (buffer) => {
//   try {
//     const encodings = ['utf-8', 'latin1', 'ascii', 'utf16le'];
    
//     for (const encoding of encodings) {
//       try {
//         const text = buffer.toString(encoding);
//         // Filter out non-printable characters but keep basic punctuation
//         const cleanText = text
//           .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/g, ' ')
//           .replace(/\s+/g, ' ')
//           .trim();
        
//         // Check if we got meaningful text (not just garbage)
//         const meaningfulWords = cleanText.split(' ').filter(word => 
//           word.length > 2 && /[a-zA-Z]/.test(word)
//         ).length;
        
//         if (cleanText.length > 100 && meaningfulWords > 10) {
//           console.log(`✅ Basic extraction successful with ${encoding} encoding`);
//           return cleanText;
//         }
//       } catch (encodingError) {
//         continue;
//       }
//     }
    
//     return "[Could not extract readable text from file]";
//   } catch (error) {
//     console.error("❌ Basic text extraction error:", error.message);
//     return "[Error in basic text extraction]";
//   }
// };

// module.exports = extractText;

const mammoth = require("mammoth");
const xlsx = require("xlsx");
const convertImageToPDF = require("./imageToPDF");
const uploadToFTP = require("./ftpUploader");
const cheerio = require("cheerio");
const { sanitizeDisplayName } = require("./FilenameGenerator");
// Add this helper function at the top
const cleanExtractedText = (text) => {
  if (!text || typeof text !== 'string') return "";
  
  return text
    .replace(/\r\n/g, '\n')  // Normalize line endings
    .replace(/\n{3,}/g, '\n\n')  // Remove excessive line breaks
    .replace(/\s{2,}/g, ' ')  // Remove excessive spaces
    .replace(/[^\x20-\x7E\n\t\u00A0-\uFFFF]/g, '')  // Remove non-printable characters but keep Unicode
    .trim();
};

const extractText = async (buffer, mimeType, ftpUrl, originalFileName) => {
  console.log("🔄 Processing file:", originalFileName, "| FTP URL:", ftpUrl);
  
  try {
    // ✅ SANITIZE ORIGINAL FILENAME FOR LOGGING
    const safeFileName = sanitizeDisplayName(originalFileName || "unknown_file");
    console.log("📄 Safe filename for processing:", safeFileName);

    // ✅ If image, convert to PDF and re-upload
    if (mimeType.startsWith("image/")) {
      console.log(`🖼️ Converting image to PDF: ${safeFileName}`);
      const pdfBuffer = await convertImageToPDF(buffer);
      const pdfFileName = `converted_${Date.now()}_${safeFileName}.pdf`;
      const newFtpUrl = await uploadToFTP(pdfBuffer, pdfFileName);
      ftpUrl = newFtpUrl;
      mimeType = "application/pdf";
      console.log(`✅ Image converted to PDF: ${newFtpUrl}`);
    }

    // ✅ OCR for PDFs using public URL
    if (mimeType === "application/pdf") {
      const documentUrl = `https://qhashai.com${ftpUrl}`;
      console.log("🔗 Document URL for OCR:", documentUrl);

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
              document_url: documentUrl,
            },
            include_image_base64: false,
          }),
        });

        if (!response.ok) {
          const errText = await response.text();
          throw new Error(`Mistral API error: ${response.status} ${errText}`);
        }

        const data = await response.json();
        console.log(`📥 OCR response received for: ${safeFileName}`);

        if (data?.pages?.length > 0) {
          let fullText = "";
          data.pages.forEach((page, index) => {
            const markdown = page?.markdown?.trim();
            if (markdown) {
              fullText += `\n\n--- Page ${index + 1} ---\n${markdown}`;
            }
          });

          console.log(`✅ OCR extraction successful: ${fullText.length} characters from ${safeFileName}`);
          return fullText.length > 0 ? fullText.trim() : "[No text extracted from OCR]";
        }

        return "[No pages or markdown found in OCR result]";
      } catch (ocrError) {
        console.error(`❌ Mistral OCR error for ${safeFileName}:`, ocrError.message);
        return "[Error with OCR extraction]";
      }
    }

    // ✅ Plain text (.txt)
    if (mimeType === "text/plain") {
      console.log(`📄 Processing plain text file: ${safeFileName}`);
      const textContent = buffer.toString("utf-8").trim();
      console.log(`✅ Plain text extracted: ${textContent.length} characters from ${safeFileName}`);
      return textContent;
    }

    // ✅ Check if it's a DOC file (older format)
    const isDocFile = originalFileName?.toLowerCase().endsWith('.doc') && 
                     !originalFileName?.toLowerCase().endsWith('.docx');
    
    // ✅ Check if it's a DOCX file
    const isDocxFile = mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
                       originalFileName?.toLowerCase().endsWith('.docx');

    // ✅ Handle DOC files (older format) - IMPROVED APPROACH
    if (isDocFile) {
      console.log(`📄 Detected DOC file: ${safeFileName}, attempting multiple extraction methods...`);
      
      try {
        // Method 1: Try mammoth first (sometimes works with DOC files)
        try {
          console.log(`🔧 Attempting mammoth extraction on DOC file: ${safeFileName}`);
          const result = await mammoth.extractRawText({ buffer });
          if (result.value && result.value.trim().length > 50) {
            console.log(`✅ Mammoth successfully extracted DOC content from ${safeFileName}: ${result.value.length} characters`);
            return result.value.trim();
          }
        } catch (mammothError) {
          console.log(`⚠️ Mammoth failed on DOC file ${safeFileName}, trying other methods...`);
        }

        // Method 2: Check if it contains HTML content (some DOC files are HTML-based)
        const rawText = buffer.toString('utf-8');
        console.log(`📄 Raw text length for ${safeFileName}:`, rawText.length);
        
        const containsHTML = rawText.includes('<html') || rawText.includes('<HTML') || 
                           rawText.includes('<body') || rawText.includes('<BODY') ||
                           rawText.includes('<p>') || rawText.includes('<P>') ||
                           rawText.includes('<div') || rawText.includes('<DIV');
        
        if (containsHTML) {
          console.log(`🌐 Detected HTML content in DOC file: ${safeFileName}`);
          const extractedText = await extractHTMLFromDoc(rawText);
          if (extractedText && extractedText.length > 50 && !extractedText.includes('[Error')) {
            console.log(`✅ HTML extraction successful from ${safeFileName}: ${extractedText.length} characters`);
            return extractedText;
          }
        }
        
        // Method 3: Check if it contains Word XML schema
        const containsWordXML = rawText.includes('w:document') || rawText.includes('w:body') ||
                               rawText.includes('xmlns:w=') || rawText.includes('wordDocument');
        
        if (containsWordXML) {
          console.log(`📄 Detected Word XML schema in DOC file: ${safeFileName}`);
          const extractedText = await extractTextFromWordXML(rawText);
          if (extractedText && extractedText.length > 50 && !extractedText.includes('[Error')) {
            console.log(`✅ Word XML extraction successful from ${safeFileName}: ${extractedText.length} characters`);
            return extractedText;
          }
        }
        
        // Method 4: Basic text extraction with better encoding handling
        console.log(`🔧 Attempting basic text extraction for ${safeFileName}...`);
        const basicText = extractBasicTextFromBuffer(buffer);
        if (basicText && basicText.length > 50 && !basicText.includes('[Error') && !basicText.includes('[Could not')) {
          console.log(`✅ Basic text extraction successful from ${safeFileName}: ${basicText.length} characters`);
          return basicText;
        }
        
        console.log(`❌ All extraction methods failed for DOC file: ${safeFileName}`);
        return `[DOC file detected: "${safeFileName}" but content extraction failed. Please convert to DOCX or PDF format for better results.]`;
        
      } catch (docError) {
        console.error(`❌ DOC processing error for ${safeFileName}:`, docError.message);
        return `[Error processing DOC file: "${safeFileName}". Please try converting to DOCX or PDF format.]`;
      }
    }

    // Handle DOCX files with mammoth
    if (isDocxFile) {
      console.log(`📄 Processing DOCX file with mammoth: ${safeFileName}`);
      try {
        const result = await mammoth.extractRawText({ buffer });
        console.log(`✅ DOCX extraction successful from ${safeFileName}: ${result.value.length} characters`);
        return result.value.trim();
      } catch (docxError) {
        console.error(`❌ Error extracting DOCX ${safeFileName}:`, docxError.message);
        return `[Error extracting DOCX file: "${safeFileName}"]`;
      }
    }

    // ✅ Excel files (.xls and .xlsx)
    if (
      mimeType.includes("spreadsheet") ||
      mimeType.includes("excel") ||
      mimeType === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
      mimeType === "application/vnd.ms-excel" ||
      originalFileName?.toLowerCase().endsWith('.xls') ||
      originalFileName?.toLowerCase().endsWith('.xlsx')
    ) {
      console.log(`📊 Processing Excel file: ${safeFileName}`);
      try {
        const workbook = xlsx.read(buffer, { type: "buffer" });
        let output = "";

        workbook.SheetNames.forEach((sheetName) => {
          const sheet = workbook.Sheets[sheetName];
          const text = xlsx.utils.sheet_to_txt(sheet);
          output += `\n--- Sheet: ${sheetName} ---\n${text}`;
        });

        console.log(`✅ Excel extraction successful from ${safeFileName}: ${output.length} characters from ${workbook.SheetNames.length} sheets`);
        return output.trim();
      } catch (excelError) {
        console.error(`❌ Error extracting Excel file ${safeFileName}:`, excelError.message);
        return `[Error extracting Excel file: "${safeFileName}"]`;
      }
    }

    console.log(`⚠️ Unsupported file type for ${safeFileName}: ${mimeType}`);
    return `[Unsupported file type: "${safeFileName}" (${mimeType})]`;
  } catch (err) {
    console.error(`❌ extractText error for ${originalFileName}:`, err.message);
    return `[Error extracting text from: "${originalFileName}"]`;
  }
};

// Helper function to extract HTML content from DOC files
const extractHTMLFromDoc = async (rawText) => {
  try {
    console.log("🌐 Extracting HTML content...");
    
    let htmlContent = '';
    
    // Try to find HTML tags and extract content between them
    const htmlMatches = rawText.match(/<html[\s\S]*?<\/html>/gi) || 
                       rawText.match(/<body[\s\S]*?<\/body>/gi) ||
                       rawText.match(/<div[\s\S]*?<\/div>/gi);
    
    if (htmlMatches && htmlMatches.length > 0) {
      htmlContent = htmlMatches.join('\n');
    } else {
      htmlContent = rawText;
    }
    
    // Use cheerio to parse and extract text from HTML
    const $ = cheerio.load(htmlContent, { 
      decodeEntities: true,
      normalizeWhitespace: true 
    });
    
    // Remove script and style elements
    $('script, style, meta, link').remove();
    
    // Extract text content
    let extractedText = $('body').text() || $.text();
    
    // Clean up the text
    extractedText = extractedText
      .replace(/\s+/g, ' ')
      .replace(/\n\s*\n/g, '\n')
      .trim();
    
    console.log("✅ HTML extraction completed, text length:", extractedText.length);
    return extractedText.length > 0 ? extractedText : "[No readable text found in HTML content]";
    
  } catch (htmlError) {
    console.error("❌ HTML extraction error:", htmlError.message);
    return "[Error extracting HTML content from DOC file]";
  }
};

// Helper function to extract text from Word XML schema
// Helper function to extract text from Word XML schema
const extractTextFromWordXML = async (rawText) => {
  try {
    console.log("📄 Extracting text from Word XML...");
    
    let cleanText = rawText
      .replace(/<[^>]*>/g, ' ')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&nbsp;/g, ' ')
      .replace(/\s+/g, ' ')
      .replace(/\n\s*\n/g, '\n')
      .trim();
    
    console.log("✅ Word XML extraction completed, text length:", cleanText.length);
    return cleanText.length > 0 ? cleanText : "[No readable text found in Word XML]";
    
  } catch (xmlError) {
    console.error("❌ Word XML extraction error:", xmlError.message);
    return "[Error extracting text from Word XML]";
  }
};

// Helper function for basic text extraction with better encoding
const extractBasicTextFromBuffer = (buffer) => {
  try {
    const encodings = ['utf-8', 'latin1', 'ascii', 'utf16le'];
    
    for (const encoding of encodings) {
      try {
        const text = buffer.toString(encoding);
        // Filter out non-printable characters but keep basic punctuation
        const cleanText = text
          .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();
        
        // Check if we got meaningful text (not just garbage)
        const meaningfulWords = cleanText.split(' ').filter(word => 
          word.length > 2 && /[a-zA-Z]/.test(word)
        ).length;
        
        if (cleanText.length > 100 && meaningfulWords > 10) {
          console.log(`✅ Basic extraction successful with ${encoding} encoding`);
          return cleanText;
        }
      } catch (encodingError) {
        continue;
      }
    }
    
    return "[Could not extract readable text from file]";
  } catch (error) {
    console.error("❌ Basic text extraction error:", error.message);
    return "[Error in basic text extraction]";
  }
};

module.exports = extractText;