  const nodemailer = require("nodemailer");
  require("dotenv").config();

  const transporter = nodemailer.createTransport({
    host: process.env.MAILTRAP_HOST,
    port: parseInt(process.env.MAILTRAP_PORT),
    secure: true, // STARTTLS
    auth: {
      user: process.env.MAILTRAP_USER,
      pass: process.env.MAILTRAP_PASS
    }
  });

  exports.sendOtpEmail = async (to, otp) => {
    const info = await transporter.sendMail({
      from: `"no-reply_quantumAi" ${process.env.MAILTRAP_USER}`,
      to,
      subject: "Your OTP Code",
      text: `Your OTP code is ${otp}. It will expire in 5 minutes.`,
      html: ` <div style="background-color: #f2f4f8; padding: 40px 0; font-family: 'Segoe UI', Roboto, sans-serif;">
      <div style="max-width: 520px; margin: auto; background: #fff; border-radius: 12px; box-shadow: 0 6px 20px rgba(0,0,0,0.1); overflow: hidden;">
        
       <!-- Header -->
<div style="background: linear-gradient(135deg, #2f80ed, #eb5757); padding: 35px 20px; text-align: center;">
  <img src="https://qhashai.com/logo.png" alt="Quantum AI Logo" width="60" style="margin-bottom: 15px;" />
  <h1 style="margin: 0; font-size: 26px; color: #ffffff; font-weight: bold; font-family: 'Segoe UI', sans-serif;">
    Quantum AI Verification Code
  </h1>
  <p style="margin-top: 8px; font-size: 15px; color: #eaf2ff;">
    Secure sign-in powered by cutting-edge AI
  </p>
</div>


      <!-- OTP Centered Box Layout -->
<div style="text-align: center; margin: 30px 0;">
  <p style="font-size: 16px; color: #444; margin-bottom: 20px;">
    Enter the verification code below:
  </p>

 <p style="
  font-size: 28px;
  font-weight: bold;
  color: #2f80ed;
  font-family: 'Courier New', monospace;
  text-align: center;
  letter-spacing: 8px;
">
  ${otp}
</p>


  <p style="font-size: 14px; color: #999; margin-top: 20px;">
    This code is valid for 5 minutes.
  </p>
</div>






         <!-- About QuantumHash -->
<div style="padding: 25px 30px; background-color: #f5f8fc;">
  <h3 style="color: #2f80ed; font-size: 18px; font-weight: 600; margin-bottom: 12px;">
    🔗 Powered by QuantumHash
  </h3>
  <p style="font-size: 14px; color: #1f2937; line-height: 1.6; margin-bottom: 16px;">
    Building smarter AI experiences — from intelligent chat to next-gen education and voice tech.
  </p>
  <a href="https://quantumhash.me" style="
    display: inline-block;
    padding: 10px 18px;
    background: linear-gradient(135deg, #2f80ed, #eb5757);
    color: #ffffff;
    text-decoration: none;
    border-radius: 8px;
    font-weight: 500;
    font-size: 14px;
    transition: background 0.3s ease;
  ">
    Want to know more? Click here →
  </a>
</div>



        <!-- Footer -->
        <div style="background-color: #f1f1f1; padding: 20px; font-size: 12px; color: #888; text-align: center;">
          If you didn’t request this code, you can safely ignore this email.<br/>
          Need help? Contact us at <a href="mailto:support@quantumhash.me" style="color: #3e8ef7;">support@quantumhash.me</a>
        </div>
      </div>
    </div> `
    });

    console.log("📨 OTP email sent:", info.messageId);
  };
