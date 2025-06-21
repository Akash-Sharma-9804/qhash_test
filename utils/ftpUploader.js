


// const ftp = require("basic-ftp");
// const { Readable } = require("stream");

// const uploadToFTP = async (buffer, remoteFileName) => {
//   const client = new ftp.Client();
  
//   // Set timeout to 60 seconds (default is 30)
//   client.ftp.timeout = 60000;
//   client.ftp.verbose = true;

//   try {
//     console.log("🔄 Connecting to FTP server...");
    
//     // Connect to the FTP server with extended timeout
//     await client.access({
//       host: process.env.FTP_HOST,
//       user: process.env.FTP_USER,
//       password: process.env.FTP_PASS,
//       secure: false,
//       // Add connection timeout settings
//       connTimeout: 30000, // 30 seconds for connection
//       pasvTimeout: 30000, // 30 seconds for passive mode
//       keepalive: 10000,   // Send keepalive every 10 seconds
//     });

//     console.log("✅ Connected to FTP server");

//     // Define and navigate to the target directory
//     const remoteDir = process.env.FTP_REMOTE_DIR || "/fileuploads/files";
    
//     console.log(`🔄 Ensuring directory exists: ${remoteDir}`);
//     await client.ensureDir(remoteDir);
    
//     console.log(`🔄 Navigating to directory: ${remoteDir}`);
//     await client.cd(remoteDir);

//     // Check buffer size and log it
//     console.log(`📊 File size: ${(buffer.length / 1024 / 1024).toFixed(2)} MB`);

//     // For larger files, consider chunked upload
//     if (buffer.length > 10 * 1024 * 1024) { // 10MB
//       console.log("⚠️ Large file detected, using chunked upload...");
      
//       // Create a readable stream with highWaterMark for better performance
//       const stream = new Readable({
//         highWaterMark: 64 * 1024, // 64KB chunks
//         read() {
//           // This will be handled automatically
//         }
//       });
      
//       // Push data in chunks
//       let offset = 0;
//       const chunkSize = 64 * 1024; // 64KB chunks
      
//       const pushChunk = () => {
//         if (offset >= buffer.length) {
//           stream.push(null); // End of stream
//           return;
//         }
        
//         const chunk = buffer.slice(offset, offset + chunkSize);
//         offset += chunkSize;
//         stream.push(chunk);
        
//         // Use setImmediate to avoid blocking
//         setImmediate(pushChunk);
//       };
      
//       pushChunk();
      
//       // Upload with progress tracking
//       await client.uploadFrom(stream, remoteFileName);
//     } else {
//       // For smaller files, use direct stream
//       console.log("🔄 Uploading file...");
//       const stream = Readable.from(buffer);
//       await client.uploadFrom(stream, remoteFileName);
//     }

//     console.log("✅ File uploaded to FTP:", `${remoteDir}/${remoteFileName}`);

//     // Verify the upload
//     try {
//       const fileList = await client.list();
//       const uploadedFile = fileList.find(file => file.name === remoteFileName);
//       if (uploadedFile) {
//         console.log(`✅ Upload verified. File size: ${uploadedFile.size} bytes`);
//       } else {
//         console.log("⚠️ File uploaded but not found in directory listing");
//       }
//     } catch (listError) {
//       console.log("⚠️ Could not verify upload:", listError.message);
//     }

//     // Return the public-facing URL of the uploaded file
//     return `/fileuploads/files/${remoteFileName}`;
    
//   } catch (err) {
//     console.error("❌ FTP Upload Error:", err);
    
//     // Provide more specific error messages
//     if (err.message.includes('Timeout')) {
//       throw new Error('FTP upload timeout - file may be too large or connection is slow');
//     } else if (err.message.includes('ECONNREFUSED')) {
//       throw new Error('FTP server connection refused - check host and port');
//     } else if (err.message.includes('530')) {
//       throw new Error('FTP authentication failed - check username and password');
//     } else {
//       throw err;
//     }
//   } finally {
//     try {
//       // Always close the client connection
//       client.close();
//       console.log("🔌 FTP connection closed");
//     } catch (closeError) {
//       console.error("⚠️ Error closing FTP connection:", closeError.message);
//     }
//   }
// };

// module.exports = uploadToFTP;


const ftp = require("basic-ftp");
const { Readable } = require("stream");
const { generateUniqueFilename } = require("./FilenameGenerator");

class OptimizedFTPPool {
  constructor(maxConnections = 4) {
    this.maxConnections = maxConnections;
    this.activeConnections = 0;
    this.queue = [];
    this.stats = {
      totalUploads: 0,
      successfulUploads: 0,
      failedUploads: 0,
      totalBytes: 0
    };
  }

  async executeWithConnection(task, fileName, fileSize) {
    return new Promise((resolve, reject) => {
      this.queue.push({ task, resolve, reject, fileName, fileSize });
      this.processQueue();
    });
  }

  async createOptimizedConnection() {
    const client = new ftp.Client();
    
    // ⚡ OPTIMIZED SETTINGS FOR SPEED + RELIABILITY
    client.ftp.timeout = 300000; // 5 minutes (handles large files)
    client.ftp.verbose = false;  // Reduce overhead
    
    try {
      await client.access({
        host: process.env.FTP_HOST,
        user: process.env.FTP_USER,
        password: process.env.FTP_PASS,
        secure: false,
        // 🚀 SPEED OPTIMIZATIONS
        connTimeout: 45000,    // 45s connection timeout
        pasvTimeout: 45000,    // 45s passive timeout
        keepalive: 90000,      // 90s keepalive
        // 📊 LARGE FILE OPTIMIZATIONS
        encoding: "binary",
      });

      const remoteDir = process.env.FTP_REMOTE_DIR || "/fileuploads/files";
      await client.ensureDir(remoteDir);
      await client.cd(remoteDir);

      return client;
    } catch (error) {
      client.close();
      throw error;
    }
  }

  async processQueue() {
    if (this.activeConnections >= this.maxConnections || this.queue.length === 0) {
      return;
    }

    this.activeConnections++;
    const { task, resolve, reject, fileName, fileSize } = this.queue.shift();

    let client = null;
    const startTime = Date.now();

    try {
      const fileSizeMB = (fileSize / 1024 / 1024).toFixed(2);
      console.log(`🚀 [${fileName}] Starting upload (${fileSizeMB}MB) - ${this.activeConnections}/${this.maxConnections} active`);
      
      client = await this.createOptimizedConnection();
      const result = await task(client, fileName, fileSize);
      
      // 📊 SUCCESS METRICS
      const uploadTime = ((Date.now() - startTime) / 1000).toFixed(2);
      const speedMBps = (fileSize / 1024 / 1024 / (Date.now() - startTime) * 1000).toFixed(2);
      
      this.stats.successfulUploads++;
      this.stats.totalBytes += fileSize;
      
      console.log(`✅ [${fileName}] Completed in ${uploadTime}s (${speedMBps} MB/s)`);
      resolve(result);
      
    } catch (error) {
      // 🛡️ ADVANCED ERROR HANDLING
      this.stats.failedUploads++;
      const uploadTime = ((Date.now() - startTime) / 1000).toFixed(2);
      
      let errorMessage = error.message;
      
      // 🔍 SPECIFIC ERROR HANDLING
      if (error.message.includes('Timeout')) {
        errorMessage = `Upload timeout after ${uploadTime}s - file may be too large or connection is slow`;
      } else if (error.message.includes('ECONNREFUSED')) {
        errorMessage = 'FTP server connection refused - server may be down';
      } else if (error.message.includes('530')) {
        errorMessage = 'FTP authentication failed - check credentials';
      } else if (error.message.includes('550')) {
        errorMessage = 'FTP permission denied - check folder permissions';
      }
      
      console.error(`❌ [${fileName}] Failed after ${uploadTime}s: ${errorMessage}`);
      reject(new Error(errorMessage));
      
    } finally {
      if (client) {
        try {
          client.close();
        } catch (closeError) {
          console.error(`⚠️ [${fileName}] Connection close error:`, closeError.message);
        }
      }
      
      this.activeConnections--;
      this.stats.totalUploads++;
      
      // 🔄 PROCESS NEXT WITH SMART DELAY
      const delay = this.queue.length > 10 ? 100 : 300; // Faster processing for large queues
      setTimeout(() => this.processQueue(), delay);
    }
  }

  getStats() {
    return {
      ...this.stats,
      successRate: this.stats.totalUploads > 0 
        ? ((this.stats.successfulUploads / this.stats.totalUploads) * 100).toFixed(1) + '%'
        : '0%',
      totalSizeGB: (this.stats.totalBytes / 1024 / 1024 / 1024).toFixed(2)
    };
  }
}

// 🎯 OPTIMIZED POOL INSTANCE
const ftpPool = new OptimizedFTPPool(4); // 4 parallel connections - sweet spot

const uploadToFTP = async (buffer, originalFilename) => {
  // ✅ GENERATE UNIQUE SAFE FILENAME
  const uniqueFilename = generateUniqueFilename(originalFilename);
  
  return ftpPool.executeWithConnection(async (client, fileName, fileSize) => {
    
    // 🚀 SMART STREAMING BASED ON FILE SIZE
    let stream;
    
    if (fileSize > 100 * 1024 * 1024) { // Files > 100MB
      console.log(`📊 [${originalFilename}] Large file detected - using chunked streaming`);
      
      stream = new Readable({
        highWaterMark: 512 * 1024, // 512KB chunks for large files
        read() {}
      });
      
      // Chunked streaming for large files
      let offset = 0;
      const chunkSize = 512 * 1024;
      
      const pushChunk = () => {
        if (offset >= buffer.length) {
          stream.push(null);
          return;
        }
        
        const chunk = buffer.slice(offset, Math.min(offset + chunkSize, buffer.length));
        offset += chunkSize;
        
        if (!stream.push(chunk)) {
          stream.once('drain', pushChunk);
        } else {
          setImmediate(pushChunk);
        }
      };
      
      pushChunk();
      
    } else {
      // Direct streaming for smaller files
      stream = Readable.from(buffer, {
        highWaterMark: 256 * 1024 // 256KB chunks
      });
    }

    await client.uploadFrom(stream, uniqueFilename); // ✅ Use unique filename
    return `/fileuploads/files/${uniqueFilename}`;
    
  }, uniqueFilename, buffer.length);
};

// 🎯 BATCH UPLOAD WITH UNIQUE FILENAMES
const uploadMultipleToFTP = async (fileDataArray) => {
  const startTime = Date.now();
  const totalSize = fileDataArray.reduce((sum, file) => sum + file.buffer.length, 0);
  const totalSizeMB = (totalSize / 1024 / 1024).toFixed(2);
  
  console.log(`🚀 Starting optimized parallel upload: ${fileDataArray.length} files (${totalSizeMB}MB total)`);

  try {
    // 🚀 PARALLEL UPLOAD ALL FILES WITH UNIQUE NAMES
    const uploadPromises = fileDataArray.map(async ({ buffer, fileName, originalFilename }) => {
      try {
        const filePath = await uploadToFTP(buffer, originalFilename || fileName);
        const uniqueFilename = filePath.split('/').pop(); // Extract unique filename from path
        
        return { 
          success: true, 
          originalFilename: originalFilename || fileName,
          uniqueFilename: uniqueFilename,
          filePath: filePath 
        };
      } catch (error) {
        return { 
          success: false, 
          originalFilename: originalFilename || fileName,
          error: error.message 
        };
      }
    });

    const results = await Promise.all(uploadPromises);
    
    // 📊 FINAL STATISTICS
    const successful = results.filter(r => r.success).length;
    const totalTime = ((Date.now() - startTime) / 1000).toFixed(2);
    const avgSpeedMBps = (totalSize / 1024 / 1024 / (Date.now() - startTime) * 1000).toFixed(2);
    const stats = ftpPool.getStats();
    
    console.log(`🎉 Optimized upload completed in ${totalTime}s:`);
    console.log(`   📈 Success: ${successful}/${results.length} files`);
    console.log(`   ⚡ Speed: ${avgSpeedMBps} MB/s average`);
    console.log(`   📊 Pool Stats: ${stats.successRate} success rate`);
    
    return results;
    
  } catch (error) {
    console.error("❌ Batch upload error:", error);
    throw error;
  }
};

// ✅ EXPORTS
module.exports = uploadToFTP;
module.exports.uploadToFTP = uploadToFTP;
module.exports.uploadMultipleToFTP = uploadMultipleToFTP;
module.exports.getPoolStats = () => ftpPool.getStats()
