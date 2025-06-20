 



// const ftp = require("basic-ftp");
// const { Readable } = require("stream");

// const uploadToFTP = async (buffer, remoteFileName) => {
//   const client = new ftp.Client();
//   client.ftp.verbose = true;

//   try {
//     // Connect to the FTP server
//     await client.access({
//       host: process.env.FTP_HOST,
//       user: process.env.FTP_USER,
//       password: process.env.FTP_PASS,
//       secure: false,
//     });

//     // Define and navigate to the target directory

//     const remoteDir = process.env.FTP_REMOTE_DIR  || "/public_html/fileuploads/files";
//     await client.ensureDir(remoteDir); // Create the folder if it doesn't exist
//     await client.cd(remoteDir);        // Navigate to the target folder

//     // Convert the buffer to a readable stream and upload it
//     const stream = Readable.from(buffer);
//     await client.uploadFrom(stream, remoteFileName);

//     console.log("✅ File uploaded to FTP:", `${remoteDir}/${remoteFileName}`);

//     // Return the public-facing URL of the uploaded file
//     // Ensure public access for the uploaded file via FTP
//     // return `/ai/uploads/fileuploads/files/${remoteFileName}`;
//     return `/fileuploads/files/${remoteFileName}`; 
//   } catch (err) {
//     console.error("❌ FTP Upload Error:", err);
//     throw err;
//   } finally {
//     client.close(); // Always close the client connection
//   }
// };

// module.exports = uploadToFTP;


const ftp = require("basic-ftp");
const { Readable } = require("stream");

const uploadToFTP = async (buffer, remoteFileName) => {
  const client = new ftp.Client();
  
  // Set timeout to 60 seconds (default is 30)
  client.ftp.timeout = 60000;
  client.ftp.verbose = true;

  try {
    console.log("🔄 Connecting to FTP server...");
    
    // Connect to the FTP server with extended timeout
    await client.access({
      host: process.env.FTP_HOST,
      user: process.env.FTP_USER,
      password: process.env.FTP_PASS,
      secure: false,
      // Add connection timeout settings
      connTimeout: 30000, // 30 seconds for connection
      pasvTimeout: 30000, // 30 seconds for passive mode
      keepalive: 10000,   // Send keepalive every 10 seconds
    });

    console.log("✅ Connected to FTP server");

    // Define and navigate to the target directory
    const remoteDir = process.env.FTP_REMOTE_DIR || "/fileuploads/files";
    
    console.log(`🔄 Ensuring directory exists: ${remoteDir}`);
    await client.ensureDir(remoteDir);
    
    console.log(`🔄 Navigating to directory: ${remoteDir}`);
    await client.cd(remoteDir);

    // Check buffer size and log it
    console.log(`📊 File size: ${(buffer.length / 1024 / 1024).toFixed(2)} MB`);

    // For larger files, consider chunked upload
    if (buffer.length > 10 * 1024 * 1024) { // 10MB
      console.log("⚠️ Large file detected, using chunked upload...");
      
      // Create a readable stream with highWaterMark for better performance
      const stream = new Readable({
        highWaterMark: 64 * 1024, // 64KB chunks
        read() {
          // This will be handled automatically
        }
      });
      
      // Push data in chunks
      let offset = 0;
      const chunkSize = 64 * 1024; // 64KB chunks
      
      const pushChunk = () => {
        if (offset >= buffer.length) {
          stream.push(null); // End of stream
          return;
        }
        
        const chunk = buffer.slice(offset, offset + chunkSize);
        offset += chunkSize;
        stream.push(chunk);
        
        // Use setImmediate to avoid blocking
        setImmediate(pushChunk);
      };
      
      pushChunk();
      
      // Upload with progress tracking
      await client.uploadFrom(stream, remoteFileName);
    } else {
      // For smaller files, use direct stream
      console.log("🔄 Uploading file...");
      const stream = Readable.from(buffer);
      await client.uploadFrom(stream, remoteFileName);
    }

    console.log("✅ File uploaded to FTP:", `${remoteDir}/${remoteFileName}`);

    // Verify the upload
    try {
      const fileList = await client.list();
      const uploadedFile = fileList.find(file => file.name === remoteFileName);
      if (uploadedFile) {
        console.log(`✅ Upload verified. File size: ${uploadedFile.size} bytes`);
      } else {
        console.log("⚠️ File uploaded but not found in directory listing");
      }
    } catch (listError) {
      console.log("⚠️ Could not verify upload:", listError.message);
    }

    // Return the public-facing URL of the uploaded file
    return `/fileuploads/files/${remoteFileName}`;
    
  } catch (err) {
    console.error("❌ FTP Upload Error:", err);
    
    // Provide more specific error messages
    if (err.message.includes('Timeout')) {
      throw new Error('FTP upload timeout - file may be too large or connection is slow');
    } else if (err.message.includes('ECONNREFUSED')) {
      throw new Error('FTP server connection refused - check host and port');
    } else if (err.message.includes('530')) {
      throw new Error('FTP authentication failed - check username and password');
    } else {
      throw err;
    }
  } finally {
    try {
      // Always close the client connection
      client.close();
      console.log("🔌 FTP connection closed");
    } catch (closeError) {
      console.error("⚠️ Error closing FTP connection:", closeError.message);
    }
  }
};

module.exports = uploadToFTP;
