
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
const { getAccountValidityDates } = require("../utils/dateUtils");
// const db = require("./db");
const { db, query } = require("../config/db"); 
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
const lastName = profile.name?.familyName || null;
  const { created_on, valid_till } = getAccountValidityDates();
    console.log("🔍 Checking if user exists in DB...");

    // STEP 1: Check if user already exists
    const result = await db.query("SELECT * FROM users WHERE email = ?",  [email]);
    const existingUsers = Array.isArray(result[0]) ? result[0] : result;

    if (existingUsers.length > 0) {
      const existingUser = existingUsers[0];

       const now = new Date();
      const validTill = new Date(existingUser.valid_till);

      if (existingUser.is_active !== 1 || validTill <= now) {
        console.log("⛔ User is inactive or account validity expired.");
        return done(
          new Error("Account is either inactive or expired. Please contact support."),
          null
        );
      }

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
 
     



// STEP 3: Check if profile exists
      const [profiles] = await db.query("SELECT * FROM users_profile WHERE user_id = ?", [existingUser.id]);

      if (profiles.length === 0) {
        await db.query(
          `INSERT INTO users_profile 
          (user_id, first_name, last_name, email, img_path)
          VALUES (?, ?, ?, ?, ?)`,
          [
            existingUser.id,
            firstName,
            lastName,
            email,
            userImg,
            
          ]
        );
        console.log("✅ users_profile inserted for existing user.");
      } else {
        console.log("ℹ️ users_profile already exists.");
      }

      return done(null, { ...existingUser, ...updatedUser });
     
    } else {
      console.log("🆕 User does not exist. Proceeding to insert.");

     

 const connection = await db.getConnection();
      try {
        await connection.beginTransaction();

        // STEP 3: Insert user into `users`
        const [insertResult] = await connection.query(
          `INSERT INTO users (username, email, user_img, first_name, sign_type_id, created_on, valid_till, is_active, role_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [username, email, userImg, firstName, 2, created_on, valid_till, 1, 1]
        );

        const insertedUserId = insertResult.insertId;
        console.log("✅ New user inserted with ID:", insertedUserId);

        // STEP 4: Insert user profile into `users_profile`
        await connection.query(
          `INSERT INTO users_profile 
           (user_id, first_name, last_name, email, img_path)
           VALUES (?, ?, ?, ?, ?)`,
          [
            insertedUserId,
            firstName,
            lastName,
            email,
            userImg,
          ]
        );
        console.log("✅ User profile created in users_profile table.");

        await connection.commit();
        connection.release();

       // STEP 5: Fetch newly inserted user
        const [newUserRows] = await db.query("SELECT * FROM users WHERE id = ?", [insertedUserId]);
        return done(null, newUserRows[0]);

      } catch (err) {
        await connection.rollback();
        connection.release();
        console.error("❌ Transaction failed:", err);
        return done(new Error("Transaction failed while creating new user."), null);
      }
    }


  } catch (error) {
    console.error("❌ Error in Google Strategy:", error);
     return done(new Error("Unhandled error in Google strategy."), null);
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
   done(new Error("Error deserializing user."), null);
  }
});
