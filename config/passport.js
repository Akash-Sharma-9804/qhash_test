
// // // working 
// const passport = require("passport");
// const GoogleStrategy = require("passport-google-oauth20").Strategy;
// const db = require("./db");
// require("dotenv").config();

// passport.use(new GoogleStrategy({
//   clientID: process.env.GOOGLE_CLIENT_ID,
//   clientSecret: process.env.GOOGLE_CLIENT_SECRET,
//   callbackURL: process.env.GOOGLE_CALLBACK_URL,
// }, async (accessToken, refreshToken, profile, done) => {
//   console.log("🚀 Google profile",profile);
//   try {
//     const email = profile.emails[0].value;
//     const username = profile.displayName;
//     const userImg = profile.photos[0]?.value || null;

//     console.log("🔍 Checking if user exists in DB...");

//     // STEP 1: Check if user already exists
//     const result = await db.query("SELECT * FROM users WHERE email = ?", [email]);
//     const existingUsers = Array.isArray(result[0]) ? result[0] : result;

//     if (existingUsers.length > 0) {
      
//       return done(null, existingUsers[0]);
//     }

//     console.log("🆕 User does not exist. Proceeding to insert.");

//     // Break the async context to avoid stale/cached promise issues
//     await Promise.resolve();

//     // STEP 2: Insert user if not exists
//     const [insertResult] = await db.query(
//       "INSERT INTO users (username, email, user_img) VALUES (?, ?, ?)",
//       [username, email, userImg]
//     );

//     const insertedUserId = insertResult.insertId;

//     console.log("✅ New user inserted with ID:", insertedUserId);

//     // STEP 3: Fetch newly inserted user
//     const [newUserRows] = await db.query("SELECT * FROM users WHERE id = ?", [insertedUserId]);

//     return done(null, newUserRows[0]);

//   } catch (error) {
//     console.error("❌ Error in Google Strategy:", error);
//     return done(error, null);
//   }
// }));

// // SESSION HANDLERS
// passport.serializeUser((user, done) => done(null, user.id));

// passport.deserializeUser(async (id, done) => {
//   try {
//     const [rows] = await db.query("SELECT * FROM users WHERE id = ?", [id]);
//     console.log("📦 Deserialized user:", rows[0]); // <- check this!
//     done(null, rows[0]);
//   } catch (err) {
//     done(err, null);
//   }
// });


 
const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const db = require("./db");
require("dotenv").config();

passport.use(new GoogleStrategy({
  clientID: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  callbackURL: process.env.GOOGLE_CALLBACK_URL,
}, async (accessToken, refreshToken, profile, done) => {
  console.log("🚀 Google profile", profile);
  
  try {
    const email = profile.emails[0].value;
    const username = profile.displayName;
    const userImg = profile.photos[0]?.value || null;
    const firstName = profile.name?.givenName || null;  // Fetch given name for first name

    console.log("🔍 Checking if user exists in DB...");

    // STEP 1: Check if user already exists
    const result = await db.query("SELECT * FROM users WHERE email = ?", [email]);
    const existingUsers = Array.isArray(result[0]) ? result[0] : result;

    if (existingUsers.length > 0) {
      const existingUser = existingUsers[0];

      // STEP 2: If user exists, update missing fields (user_img, first_name)
      const updatedUser = {
        user_img: existingUser.user_img || userImg,  // Only update if missing
        first_name: existingUser.first_name || firstName,  // Only update if missing
      };

      // Only update if any of the fields are missing
      if (updatedUser.user_img !== existingUser.user_img || updatedUser.first_name !== existingUser.first_name) {
        await db.query(
          "UPDATE users SET user_img = ?, first_name = ? WHERE email = ?",
          [updatedUser.user_img, updatedUser.first_name, email]
        );
        console.log("✅ User image and/or first name updated.");
      }

      // Return the updated user
      return done(null, { ...existingUser, ...updatedUser });
    } else {
      console.log("🆕 User does not exist. Proceeding to insert.");

      // STEP 3: If the user doesn't exist, insert the user into the database
      await Promise.resolve();

      const [insertResult] = await db.query(
        "INSERT INTO users (username, email, user_img, first_name) VALUES (?, ?, ?, ?)",
        [username, email, userImg, firstName] // Use Google first_name
      );

      const insertedUserId = insertResult.insertId;
      console.log("✅ New user inserted with ID:", insertedUserId);

      // STEP 4: Fetch newly inserted user
      const [newUserRows] = await db.query("SELECT * FROM users WHERE id = ?", [insertedUserId]);

      return done(null, newUserRows[0]);
    }

  } catch (error) {
    console.error("❌ Error in Google Strategy:", error);
    return done(error, null);
  }
}));

// SESSION HANDLERS
passport.serializeUser((user, done) => done(null, user.id));

passport.deserializeUser(async (id, done) => {
  try {
    const [rows] = await db.query("SELECT * FROM users WHERE id = ?", [id]);
    console.log("📦 Deserialized user:", rows[0]); // <- check this!
    done(null, rows[0]);
  } catch (err) {
    done(err, null);
  }
});
