// const ftp = require("basic-ftp");
// const { Readable } = require("stream");

// const uploadToFTP = async (buffer, remoteFileName) => {
//   const client = new ftp.Client();
//   client.ftp.verbose = true;

//   try {
//     // Connect to FTP server
//     await client.access({
//       host: process.env.FTP_HOST,
//       user: process.env.FTP_USER,
//       password: process.env.FTP_PASS,
//       secure: false,
//     });

//     // Ensure the directory exists on the FTP server
//     const remoteDir = process.env.FTP_REMOTE_DIR || "/public_html/Quantum_AI/uploads";
//     await client.ensureDir(remoteDir);

//     // Remote file path
//     const remotePath = `${remoteDir}/${remoteFileName}`;

//     // Upload the file buffer directly
  
//     const stream = Readable.from(buffer);
//     await client.uploadFrom(stream, remotePath);
    

//     console.log("✅ File uploaded to FTP:", remotePath);

//     // Return the public URL path of the uploaded file
//     return `/Quantum_AI/uploads/${remoteFileName}`;
//   } catch (err) {
//     console.error("❌ FTP Upload Error:", err);
//     throw err;
//   } finally {
//     // Close FTP client connection
//     client.close();
//   }
// };

// module.exports = uploadToFTP;
const ftp = require("basic-ftp");
const { Readable } = require("stream");

const uploadToFTP = async (buffer, remoteFileName) => {
  const client = new ftp.Client();
  client.ftp.verbose = true;

  try {
    // Connect to the FTP server
    await client.access({
      host: process.env.FTP_HOST,
      user: process.env.FTP_USER,
      password: process.env.FTP_PASS,
      secure: false,
    });

    // Define and navigate to the target directory
    const remoteDir = process.env.FTP_REMOTE_DIR || "/fileuploads/files";
    await client.ensureDir(remoteDir); // Creates the folder if it doesn't exist
    await client.cd(remoteDir);        // Changes into the target folder

    // Convert the buffer to a readable stream and upload it
    const stream = Readable.from(buffer);
    await client.uploadFrom(stream, remoteFileName);

    console.log("✅ File uploaded to FTP:", `${remoteDir}/${remoteFileName}`);

    // Return the public-facing URL of the uploaded file
    return `/Quantum_AI/uploads/fileuploads/files/${remoteFileName}`;
  } catch (err) {
    console.error("❌ FTP Upload Error:", err);
    throw err;
  } finally {
    client.close(); // Always close the client connection
  }
};

module.exports = uploadToFTP;
