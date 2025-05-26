// const express = require("express");
// const { signup, login } = require("../controllers/authController");

// const router = express.Router();

// router.post("/signup", signup);
// router.post("/login", login);

// module.exports = router;

const express = require("express");
const { signup, login, verifyOtp,forgotPassword,resetPassword,verifyResetOtp,googleCallback, userDetails } = require("../controllers/authController");
const passport = require("passport");
const verifyToken = require("../middleware/authMiddleware");

const router = express.Router();

router.post("/signup", signup);      // sends OTP
router.post("/verify-otp", verifyOtp); // verifies OTP & creates user
router.post("/login", login);
// router.post("/auth0",auth0Login);
router.post("/forgot-password", forgotPassword); // 🔹 user submits email
router.post("/reset-password", resetPassword);   // 🔹 user submits otp + new password
router.post("/verify-reset-otp",verifyResetOtp);
// Redirect to Google
router.get("/google", passport.authenticate("google", { scope: ["profile", "email"] }));

// Google Callback
 
// router.get("/google/callback",
//   passport.authenticate("google", {
//     failureRedirect: "/login", // or /oauth-failure
//     session: false
//   }),
//  googleCallback
// );
router.get("/google/callback", (req, res, next) => {
  passport.authenticate("google", { session: false }, async (err, user, info) => {
    if (err || !user) {
      console.error("❌ Authentication failed:", err || "No user returned");
      const errorMessage = encodeURIComponent( err?.message || "Google authentication failed. Please try again.");
      return res.redirect(`${process.env.CLIENT_URL}/login?error=${errorMessage}`);
    }

    req.user = user;
    return googleCallback(req, res);
  })(req, res, next);
});

router.get("/facebook/callback", (req, res, next) => {
  passport.authenticate("google", { session: false }, async (err, user, info) => {
    if (err || !user) {
      console.error("❌ Authentication failed:", err || "No user returned");
      return res.redirect(`${process.env.CLIENT_URL}/login`);
    }

    req.user = user;
    return googleCallback(req, res);
  })(req, res, next);
});


// Secure route to fetch user + conversation
router.get("/userDetails", userDetails);

module.exports = router;
