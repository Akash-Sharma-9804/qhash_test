const ftp = require("basic-ftp");

const uploadToFTP = async (buffer, remoteFileName) => {
  const client = new ftp.Client();
  client.ftp.verbose = true;

  try {
    // Connect to FTP server
    await client.access({
      host: process.env.FTP_HOST,
      user: process.env.FTP_USER,
      password: process.env.FTP_PASS,
      secure: false,
    });

    // Ensure the directory exists on the FTP server
    const remoteDir = process.env.FTP_REMOTE_DIR || "/public_html/Quantum_AI/uploads";
    await client.ensureDir(remoteDir);

    // Remote file path
    const remotePath = `${remoteDir}/${remoteFileName}`;

    // Upload the file buffer directly
    await client.uploadFrom(buffer, remotePath);

    console.log("✅ File uploaded to FTP:", remotePath);

    // Return the public URL path of the uploaded file
    return `/Quantum_AI/uploads/${remoteFileName}`;
  } catch (err) {
    console.error("❌ FTP Upload Error:", err);
    throw err;
  } finally {
    // Close FTP client connection
    client.close();
  }
};

module.exports = uploadToFTP;
