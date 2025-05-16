// const express = require("express");
// const { signup, login } = require("../controllers/authController");

// const router = express.Router();

// router.post("/signup", signup);
// router.post("/login", login);

// module.exports = router;

const express = require("express");
const { signup, login, verifyOtp,forgotPassword,resetPassword,verifyResetOtp } = require("../controllers/authController");

const router = express.Router();

router.post("/signup", signup);      // sends OTP
router.post("/verify-otp", verifyOtp); // verifies OTP & creates user
router.post("/login", login);
router.post("/forgot-password", forgotPassword); // 🔹 user submits email
router.post("/reset-password", resetPassword);   // 🔹 user submits otp + new password
router.post("/verify-reset-otp",verifyResetOtp);

module.exports = router;
