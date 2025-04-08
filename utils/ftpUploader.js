const ftp = require("basic-ftp");

const uploadToFTP = async (buffer, remoteFileName) => {
  const client = new ftp.Client();
  client.ftp.verbose = true;

  try {
    await client.access({
      host: process.env.FTP_HOST,
      user: process.env.FTP_USER,
      password: process.env.FTP_PASS,
      secure: false,
    });

    const remoteDir = process.env.FTP_REMOTE_DIR || "/public_html/Quantum_AI/uploads";
    await client.ensureDir(remoteDir);

    const remotePath = `${remoteDir}/${remoteFileName}`;
    await client.uploadFrom(Buffer.from(buffer), remotePath);

    console.log("✅ File uploaded to FTP:", remotePath);
    return `/Quantum_AI/uploads/${remoteFileName}`; // Return public path
  } catch (err) {
    console.error("❌ FTP Upload Error:", err);
    throw err;
  } finally {
    client.close();
  }
};

module.exports = uploadToFTP;
