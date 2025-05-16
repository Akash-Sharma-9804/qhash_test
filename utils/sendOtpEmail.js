  const nodemailer = require("nodemailer");
  require("dotenv").config();

  const transporter = nodemailer.createTransport({
    host: process.env.MAILTRAP_HOST,
    port: parseInt(process.env.MAILTRAP_PORT),
    secure: false, // STARTTLS
    auth: {
      user: process.env.MAILTRAP_USER,
      pass: process.env.MAILTRAP_PASS
    }
  });

  exports.sendOtpEmail = async (to, otp) => {
    const info = await transporter.sendMail({
      from: '"Quantum AI" ${process.env.MAILTRAP_USER}',
      to,
      subject: "Your OTP Code",
      text: `Your OTP code is ${otp}. It will expire in 5 minutes.`,
      html: ` <div style="background-color: #f2f2f2; padding: 40px 0; font-family: Arial, sans-serif;">
          <div style="max-width: 480px; margin: 0 auto; background: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.05); text-align: center;">
            
            <div style="background-color: #e0e0e0; padding: 30px 20px;">
              <img src="https://qhashai.com/ai/logo.png" alt="Logo" width="50" style="margin-bottom: 10px;" />
              <h2 style="margin: 0; font-size: 22px; color: #333;">Sign-in Code</h2>
            </div>
            
            <div style="padding: 30px 20px;">
              <p style="font-size: 14px; color: #666; margin-bottom: 20px;">Here's your sign-in code:</p>
              <p style="font-size: 36px; letter-spacing: 12px; color: #000; font-weight: bold; margin: 0 0 20px 0;">${otp}</p>
              <p style="font-size: 14px; color: #999;">This code will expire in 5 minutes.</p>
            </div>
            
            <div style="padding: 15px 20px; font-size: 12px; color: #999; border-top: 1px solid #eee;">
              Visit <a href="https://quantumhash.me/" style="color: #c0392b; text-decoration: none;">QuantumHash.me</a> to un-enroll any authentication method.
            </div>
          </div>
        </div>`
    });

    console.log("📨 OTP email sent:", info.messageId);
  };
