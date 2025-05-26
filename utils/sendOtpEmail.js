//   const nodemailer = require("nodemailer");
//   require("dotenv").config();

//   const transporter = nodemailer.createTransport({
//     host: process.env.MAILTRAP_HOST,
//     port: parseInt(process.env.MAILTRAP_PORT),
//     secure: true, // STARTTLS
//     auth: {
//       user: process.env.MAILTRAP_USER,
//       pass: process.env.MAILTRAP_PASS
//     }
//   });

//   exports.sendOtpEmail = async (to, otp) => {
//     const info = await transporter.sendMail({
//       from: `"no_reply-QhashAi" ${process.env.MAILTRAP_USER}`,
//       to,
//       subject: "Your OTP Code",
//       text: `Your OTP code is ${otp}. It will expire in 5 minutes.`,
//       html: `<div style="background-color: #f4f5f7; padding: 40px 0; font-family: 'Segoe UI', Roboto, sans-serif; color: #333333;">
//   <div style="max-width: 520px; margin: auto; background: #ffffff; border-radius: 12px; box-shadow: 0 6px 20px rgba(0,0,0,0.05); overflow: hidden;">

//     <!-- Header -->
//     <div style="background: linear-gradient(135deg, #2f80ed, #eb5757); padding: 30px 20px; text-align: center;">
//       <img src="https://qhashai.com/logo.png" alt="Quantum AI Logo" width="60" style="margin-bottom: 12px;" />
//       <h1 style="margin: 0; font-size: 22px; color: #ffffff;">
//         Quantum AI Verification Code
//       </h1>
//       <p style="margin-top: 8px; font-size: 14px; color: #f0f0f0;">
//         Secure sign-up powered by cutting-edge AI
//       </p>
//     </div>

//     <!-- OTP Box -->
//     <div style="text-align: center; margin: 30px 0;">
//       <p style="font-size: 15px; color: #333;">
//         Enter the verification code below:
//       </p>
//       <p style="font-size: 26px; font-weight: bold; color: #2f80ed; font-family: 'Courier New', monospace; letter-spacing: 6px;">
//         ${otp}
//       </p>
//       <p style="font-size: 13px; color: #888; margin-top: 16px;">
//         This code is valid for 5 minutes.
//       </p>
//     </div>

//     <!-- Info Section -->
//     <div style="padding: 20px 30px; background-color: #f8f9fb;">
//       <h3 style="color: #2f80ed; font-size: 16px; font-weight: 600; margin-bottom: 10px;">
//         🔗 Powered by QuantumHash
//       </h3>
//       <p style="font-size: 14px; color: #444; line-height: 1.6;">
//         Building smarter AI experiences — from intelligent chat to next-gen education and voice tech.
//       </p>
//       <a href="https://quantumhash.me" style="
//         display: inline-block;
//         margin-top: 12px;
//         padding: 10px 16px;
//         background: linear-gradient(135deg, #2f80ed, #eb5757);
//         color: #ffffff;
//         text-decoration: none;
//         border-radius: 6px;
//         font-size: 14px;
//       ">
//         Learn more →
//       </a>
//     </div>

//     <!-- Footer -->
//     <div style="background-color: #f1f1f1; padding: 16px; font-size: 12px; color: #777; text-align: center;">
//       If you didn’t request this code, you can safely ignore this email.<br/>
//       Need help? Contact us at <a href="mailto:support@quantumhash.me" style="color: #3e8ef7;">support@quantumhash.me</a>
//     </div>
//   </div>
// </div>
// `

//     });

//     console.log("📨 OTP email sent:", info.messageId);
//   };

const nodemailer = require("nodemailer");
require("dotenv").config();

const transporter = nodemailer.createTransport({
  host: process.env.MAILTRAP_HOST,
  port: parseInt(process.env.MAILTRAP_PORT),
  secure: true,
  auth: {
    user: process.env.MAILTRAP_USER,
    pass: process.env.MAILTRAP_PASS
  }
});

exports.sendOtpEmail = async (to, otp, purpose = "signup", sign_type_id = 1) => {
  const isReset = purpose === "forgotPassword";

  const subject = isReset ? "Reset Your Password - Quantum AI" : "Your OTP Code - Quantum AI";
  const heading = isReset ? "Reset Password Verification Code" : "Quantum AI Verification Code";
  const subheading = isReset
    ? "Verify to reset your password"
    : "Secure sign-up powered by cutting-edge AI";
  const actionMessage = isReset
    ? "Enter the code below to reset your password:"
    : "Enter the verification code below to sign-up:";

  let html = `
    <div style="background-color: #f4f5f7; padding: 40px 0; font-family: 'Segoe UI', Roboto, sans-serif; color: #333333;">
      <div style="max-width: 520px; margin: auto; background: #ffffff; border-radius: 12px; box-shadow: 0 6px 20px rgba(0,0,0,0.05); overflow: hidden;">

        <!-- Header -->
        <div style="background: linear-gradient(135deg, #2f80ed, #eb5757); padding: 30px 20px; text-align: center;">
          <img src="https://qhashai.com/logo.png" alt="Quantum AI Logo" width="60" style="margin-bottom: 12px;" />
          <h1 style="margin: 0; font-size: 22px; color: #ffffff;">${heading}</h1>
          <p style="margin-top: 8px; font-size: 14px; color: #f0f0f0;">
            ${subheading}
          </p>
        </div>

        <!-- OTP Box -->
        <div style="text-align: center; margin: 30px 0;">
          <p style="font-size: 15px; color: #333;">${actionMessage}</p>
          <p style="font-size: 26px; font-weight: bold; color: #2f80ed; font-family: 'Courier New', monospace; letter-spacing: 6px;">
            ${otp}
          </p>
          <p style="font-size: 13px; color: #888; margin-top: 16px;">
            This code is valid for 5 minutes.
          </p>`;

  // if (sign_type_id !== 1) {
  //   html += `<p style="margin-top:10px;color:#555;">Note: You signed in with Google/Facebook. After resetting your password, your account will switch to email login. You can also change it anytime in your profile settings.</p>`;
  // }

 // Append social sign-in note for forgotPassword
  if (isReset) {
    if (sign_type_id === 2) {
      html += `<p style="margin-top:10px;color:#555;">Note: You previously signed in using <strong>Google</strong>. After resetting your password, you can log in using email and password. You can also manage passwor options in your profile settings.</p>`;
    } else if (sign_type_id === 3) {
      html += `<p style="margin-top:10px;color:#555;">Note: You previously signed in using <strong>Facebook</strong>. After resetting your password, you can log in using email and password. You can also manage passwor options in your profile settings.</p>`;
    }
  }

  html += `</div>

        <!-- Info Section -->
        <div style="padding: 20px 30px; background-color: #f8f9fb;">
          <h3 style="color: #2f80ed; font-size: 16px; font-weight: 600; margin-bottom: 10px;">
            🔗 Powered by QuantumHash
          </h3>
          <p style="font-size: 14px; color: #444; line-height: 1.6;">
            Building smarter AI experiences — from intelligent chat to next-gen education and voice tech.
          </p>
          <a href="https://quantumhash.me" style="
            display: inline-block;
            margin-top: 12px;
            padding: 10px 16px;
            background: linear-gradient(135deg, #2f80ed, #eb5757);
            color: #ffffff;
            text-decoration: none;
            border-radius: 6px;
            font-size: 14px;
          ">
            Learn more →
          </a>
        </div>

        <!-- Footer -->
        <div style="background-color: #f1f1f1; padding: 16px; font-size: 12px; color: #777; text-align: center;">
          If you didn’t request this code, you can safely ignore this email.<br/>
          Need help? Contact us at <a href="mailto:support@quantumhash.me" style="color: #3e8ef7;">support@quantumhash.me</a>
        </div>
      </div>
    </div>`;

  const info = await transporter.sendMail({
    from: `"no_reply-QhashAi" <${process.env.MAILTRAP_USER}>`,
    to,
    subject,
    text: `Your OTP code is ${otp}. It will expire in 5 minutes.`,
    html
  });

  console.log("📨 OTP email sent:", info.messageId, "| sign_type_id:", sign_type_id);
};
