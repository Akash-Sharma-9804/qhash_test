const { db, query } = require("../config/db"); 
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
require("dotenv").config(); // Ensure dotenv is loaded
const { sendOtpEmail } = require("../utils/sendOtpEmail");
const otpStore = new Map(); // email -> { otp, expiresAt }
 


async function ensureUserInHistory(connection, user_id, username, email) {
    try {
        const [existingUser] = await connection.query(
            "SELECT id FROM user_history WHERE id = ?",
            [user_id]
        );
        

        if (existingUser.length === 0) {
            await connection.query(
                "INSERT INTO user_history (id, username, email) VALUES (?, ?, ?)",
                [user_id, username, email]
            );
            console.log(`✅ User ${user_id} added to user_history`);
        }
    } catch (error) {
        console.error("❌ Error ensuring user in user_history:", error.message);
    }
};

exports.cleanupOtps = async () => {
  try {
    const [result] = await db.query(
      "DELETE FROM otp_codes WHERE used = TRUE OR expires_at < NOW()"
    );
    console.log(`✅ OTP Cleanup: ${result.affectedRows} rows deleted`);
  } catch (err) {
    console.error("❌ OTP Cleanup Error:", err.message);
  }
};





// working 15-05-25
// exports.signup = async (req, res) => {
//     const { username, email, password } = req.body;
//     console.log("✅ Cleaned email:", JSON.stringify(email));

//     if (!username || !email || !password) {
//         return res.status(400).json({ error: "All fields are required" });
//     }

//     let connection;

//     try {
//         connection = await db.getConnection(); // Get a dedicated connection
//         await connection.beginTransaction(); // ✅ Start transaction

//         // Hash the password
//         const hashedPassword = await bcrypt.hash(password, 10);

//         // Insert user
//         const [userResult] = await connection.query(
//             "INSERT INTO users (username, email, password) VALUES (?, ?, ?)",
//             [username, email, hashedPassword]
//         );

//         const user_id = userResult.insertId;

//         // Ensure user is added to user_history
//         const [existingUser] = await connection.query(
//             "SELECT id FROM user_history WHERE id = ?",
//             [user_id]
//         );

//         if (existingUser.length === 0) {
//             await connection.query(
//                 "INSERT INTO user_history (id, username, email) VALUES (?, ?, ?)",
//                 [user_id, username, email]
//             );
//             console.log(`✅ User ${user_id} added to user_history`);
//         }

//         // Create initial conversation
//         const [conversationResult] = await connection.query(
//             "INSERT INTO conversations (user_id, name) VALUES (?, ?)",
//             [user_id, "New Conversation"]
//         );

//         const conversation_id = conversationResult.insertId;

//         // Generate JWT
//         const token = jwt.sign({ user_id }, process.env.JWT_SECRET, { expiresIn: "7d" });

//         await connection.commit(); // ✅ Commit if all succeeded

//         res.status(201).json({
//             success: true,
//             token,
//             user: { user_id, username, email },
//             conversation_id
//         });

//     } catch (error) {
//         // ✅ Safe rollback
//         if (connection && connection.rollback) {
//             try {
//                 await connection.rollback();
//             } catch (rollbackError) {
//                 console.error("❌ Rollback failed:", rollbackError.message);
//             }
//         }

//         // Handle specific errors
//         if (error.code === "ER_DUP_ENTRY") {
//             return res.status(400).json({ error: "Email already exists" });
//         }

//         console.error("❌ Signup failed:", error.message);
//         return res.status(500).json({ error: "Signup failed", details: error.message });

//     } finally {
//         // ✅ Safe release
//         if (connection && connection.release) {
//             try {
//                 connection.release();
//             } catch (releaseError) {
//                 console.error("❌ Connection release failed:", releaseError.message);
//             }
//         }
//     }
// };

// test 
// Send OTP Handler

// working 16-05-25 
// exports.signup = async (req, res) => {
//   const { username, email } = req.body;

//   if (!username || !email) {
//     return res.status(400).json({ error: "Username and email are required." });
//   }

//   try {
//     const [existing] = await db.query("SELECT * FROM users WHERE email = ?", [email]);
//     if (existing.length > 0) {
//       return res.status(400).json({ error: "Email already exists." });
//     }
//   } catch (err) {
//     return res.status(500).json({ error: "Database error", details: err.message });
//   }

//   const otp = Math.floor(100000 + Math.random() * 900000).toString();
//   const expiresAt = Date.now() + 5 * 60 * 1000;

//   otpStore.set(email, { otp, expiresAt });

//   try {
//     await sendOtpEmail(email, otp);
//     return res.status(200).json({ success: true, message: "OTP sent to your email." });
//   } catch (err) {
//     return res.status(500).json({ error: "Failed to send OTP", details: err.message });
//   }
// };

// Verify OTP and Signup Handler

exports.signup = async (req, res) => {
  const { username, email } = req.body;

  if (!username || !email) {
    return res.status(400).json({ error: "Username and email are required." });
  }

  try {
    const [existing] = await db.query("SELECT * FROM users WHERE email = ?", [email]);
    if (existing.length > 0) {
      return res.status(400).json({ error: "Email already exists." });
    }
  } catch (err) {
    return res.status(500).json({ error: "Database error", details: err.message });
  }

  const otp = Math.floor(100000 + Math.random() * 900000).toString();
 const createdAt = new Date().toISOString().slice(0, 19).replace('T', ' ');
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString().slice(0, 19).replace('T', ' ');


 let connection;
  try {
    connection = await db.getConnection();
    await connection.query("SET time_zone = '+00:00'"); // 🕒 Set session timezone to UTC

    await connection.query(
      "INSERT INTO otp_codes (email, otp, created_at, expires_at) VALUES (?, ?, ?, ?)",
      [email, otp, createdAt, expiresAt]
    );

    await sendOtpEmail(email, otp);

    return res.status(200).json({ success: true, message: "OTP sent to your email." });
  } catch (err) {
    return res.status(500).json({ error: "Failed to send OTP", details: err.message });
  }
};
exports.verifyOtp = async (req, res) => {
  const { email, otp, username, password } = req.body;

  if (!email || !otp || !username || !password) {
    return res.status(400).json({ error: "All fields are required." });
  }

  let connection;
  try {
    connection = await db.getConnection();
    await connection.query("SET time_zone = '+00:00'");

    const [rows] = await connection.query(
      `SELECT * FROM otp_codes 
       WHERE email = ? AND used = FALSE AND otp = ? AND expires_at > UTC_TIMESTAMP() 
       ORDER BY created_at DESC LIMIT 1`,
      [email, otp]
    );

    if (!rows.length) {
      return res.status(400).json({ error: "Invalid or expired OTP." });
    }

    const record = rows[0];

    await connection.query("UPDATE otp_codes SET used = TRUE WHERE id = ?", [record.id]);

    await connection.beginTransaction();

    const hashedPassword = await bcrypt.hash(password, 10);

    const [userResult] = await connection.query(
      "INSERT INTO users (username, email, password) VALUES (?, ?, ?)",
      [username, email, hashedPassword]
    );
    const user_id = userResult.insertId;

    await ensureUserInHistory(connection, user_id, username, email);

    const [conversationResult] = await connection.query(
      "INSERT INTO conversations (user_id, name) VALUES (?, ?)",
      [user_id, "New Conversation"]
    );

    const token = jwt.sign({ user_id }, process.env.JWT_SECRET, { expiresIn: "7d" });

    await connection.commit();

    return res.status(201).json({
      success: true,
      token,
      user: { user_id, username, email },
      conversation_id: conversationResult.insertId,
    });
  } catch (err) {
    if (connection) await connection.rollback();
    console.error("❌ Verify OTP Error:", err.message);
    return res.status(500).json({ error: "Verification failed", details: err.message });
  } finally {
    if (connection) connection.release();
  }
};


// exports.verifyOtp = async (req, res) => {
//   const { email, otp, username, password } = req.body;

//   if (!email || !otp || !username || !password) {
//     return res.status(400).json({ error: "All fields are required." });
//   }

//   try {
//     const [rows] = await db.query(
//       "SELECT * FROM otp_codes WHERE email = ? AND used = FALSE ORDER BY created_at DESC LIMIT 1",
//       [email]
//     );

//     if (!rows.length) {
//       return res.status(400).json({ error: "OTP not found or already used." });
//     }

//     const record = rows[0];
//     const currentTime = new Date();

//     if (record.otp !== otp || currentTime > new Date(record.expires_at)) {
//       return res.status(400).json({ error: "Invalid or expired OTP." });
//     }

//     // Mark OTP as used
//     await db.query("UPDATE otp_codes SET used = TRUE WHERE id = ?", [record.id]);

//     // Proceed with user creation
//     let connection = await db.getConnection();
//     try {
//       await connection.beginTransaction();

//       const hashedPassword = await bcrypt.hash(password, 10);

//       const [userResult] = await connection.query(
//         "INSERT INTO users (username, email, password) VALUES (?, ?, ?)",
//         [username, email, hashedPassword]
//       );
//       const user_id = userResult.insertId;

//       await ensureUserInHistory(connection, user_id, username, email);

//       const [conversationResult] = await connection.query(
//         "INSERT INTO conversations (user_id, name) VALUES (?, ?)",
//         [user_id, "New Conversation"]
//       );

//       const token = jwt.sign({ user_id }, process.env.JWT_SECRET, {
//         expiresIn: "7d",
//       });

//       await connection.commit();

//       return res.status(201).json({
//         success: true,
//         token,
//         user: { user_id, username, email },
//         conversation_id: conversationResult.insertId,
//       });
//     } catch (err) {
//       await connection.rollback();
//       console.error("❌ Verify OTP Error (Transaction):", err.message);
//       return res.status(500).json({ error: "Signup failed", details: err.message });
//     } finally {
//       connection.release();
//     }
//   } catch (err) {
//     console.error("❌ Verify OTP Error (DB):", err.message);
//     return res.status(500).json({ error: "Verification failed", details: err.message });
//   }
// };


// working 16-05-25 
// exports.verifyOtp = async (req, res) => {
//   const { email, otp, username, password } = req.body;

//   if (!email || !otp || !username || !password) {
//     return res.status(400).json({ error: "All fields are required." });
//   }

//   const stored = otpStore.get(email);
//   if (!stored || stored.otp !== otp || Date.now() > stored.expiresAt) {
//     return res.status(400).json({ error: "Invalid or expired OTP." });
//   }

//   otpStore.delete(email);

//   let connection;
//   try {
//     connection = await db.getConnection();
//     await connection.beginTransaction();

//     const hashedPassword = await bcrypt.hash(password, 10);

//     const [userResult] = await connection.query(
//       "INSERT INTO users (username, email, password) VALUES (?, ?, ?)",
//       [username, email, hashedPassword]
//     );
//     const user_id = userResult.insertId;

//     await ensureUserInHistory(connection, user_id, username, email);

//     const [conversationResult] = await connection.query(
//       "INSERT INTO conversations (user_id, name) VALUES (?, ?)",
//       [user_id, "New Conversation"]
//     );

//     const token = jwt.sign({ user_id }, process.env.JWT_SECRET, { expiresIn: "7d" });

//     await connection.commit();

//     res.status(201).json({
//       success: true,
//       token,
//       user: { user_id, username, email },
//       conversation_id: conversationResult.insertId,
//     });
//   } catch (err) {
//     if (connection) await connection.rollback();
//     console.error("❌ Verify OTP Error:", err.message);
//     res.status(500).json({ error: "Verification failed", details: err.message });
//   } finally {
//     if (connection) connection.release();
//   }
// };


exports.login = async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ error: "All fields are required" });
    }

    let connection;

    try {
        connection = await db.getConnection(); // ✅ Get a connection
        console.log("🔍 Logging in with email:", email);

        const [users] = await connection.query("SELECT * FROM users WHERE email = ?", [email]);
        console.log("🛠 Query Result:", users);

        const user = Array.isArray(users) ? users[0] : users;

        if (!user || Object.keys(user).length === 0) {
            console.log("❌ No user found for email:", email);
            return res.status(404).json({ error: "Invalid Email or password" });
        }

        console.log("✅ User found:", user);

        if (!user.password) {
            console.error("❌ ERROR: user.password is undefined!");
            return res.status(500).json({ error: "Server error: Password is missing" });
        }

        const passwordMatch = await bcrypt.compare(password, user.password);
        if (!passwordMatch) {
            return res.status(401).json({ error: "Invalid Email or password" });
        }

        console.log("🔹 User logged in:", user.id);

        await ensureUserInHistory(connection, user.id, user.username, user.email);

        const token = jwt.sign({ user_id: user.id }, process.env.JWT_SECRET, { expiresIn: "15d" });
        console.log("🛠 Generated Token:", token);

        let conversation_id = null;
        try {
            const [newConversation] = await connection.query(
                "INSERT INTO conversations (user_id, name) VALUES (?, ?)",
                [user.id, "New Conversation"]
            );

            if (!newConversation || !newConversation.insertId) {
                console.error("❌ Error: Failed to create a new conversation");
                throw new Error("Failed to create a conversation");
            }

            conversation_id = newConversation.insertId;
            console.log("✅ New Conversation Created with ID:", conversation_id);
        } catch (error) {
            console.error("❌ Error creating conversation:", error.message);
            return res.status(500).json({ error: "Database error", details: error.message });
        }

        return res.json({
            success: true,
            token,
            user: {
                user_id: user.id,
                username: user.username,
                email: user.email
            },
            conversation_id
        });

    } catch (error) {
        console.error("❌ Error logging in:", error.message);
        return res.status(500).json({ error: "Login failed", details: error.message });
    } finally {
        if (connection && connection.release) {
            try {
                connection.release();
            } catch (releaseError) {
                console.error("❌ Connection release failed:", releaseError.message);
            }
        }
    }
};



// 🔹 Forgot Password - send OTP to email
exports.forgotPassword = async (req, res) => {
    const { email } = req.body;

    if (!email) return res.status(400).json({ error: "Email is required" });

    let connection;

    try {
        connection = await db.getConnection();
await connection.query("SET time_zone = '+00:00'");

        const [users] = await connection.query("SELECT * FROM users WHERE email = ?", [email]);
        if (!users || users.length === 0) return res.status(404).json({ error: "Email not found" });

        const otp = Math.floor(100000 + Math.random() * 900000); // 🔢 6-digit OTP
        // const createdAt = new Date(); // Define createdAt first
        // const expiry = new Date(Date.now() + 5 * 60 * 1000); // 5 mins
const createdAt = new Date().toISOString().slice(0, 19).replace('T', ' '); // 'YYYY-MM-DD HH:mm:ss' UTC
const expiry = new Date(Date.now() + 5 * 60 * 1000).toISOString().slice(0, 19).replace('T', ' ');

        await connection.query(
  "INSERT INTO otp_codes (email, otp, created_at, expires_at) VALUES (?, ?, ?, ?)",
  [email, otp, createdAt, expiry]
);

       
  //  if (users && users.length > 0){
     await sendOtpEmail(email, otp);
  //  }
        return res.json({ success: true, message: "OTP sent to your email" });

    } catch (error) {
        console.error("❌ Forgot Password Error:", error.message);
        return res.status(500).json({ error: "Internal server error" });
    } finally {
        if (connection) connection.release();
    }
};

// 🔹 Reset Password - verify OTP and update password
exports.resetPassword = async (req, res) => {
    const { email, otp, newPassword, confirmPassword } = req.body;

    if (!email || !otp || !newPassword || !confirmPassword) {
        return res.status(400).json({ error: "All fields are required" });
    }

    if (newPassword !== confirmPassword) {
        return res.status(400).json({ error: "Passwords do not match" });
    }

    if (newPassword.length < 6) {
        return res.status(400).json({ error: "Password must be at least 6 characters long" });
    }

    let connection;
    try {
        connection = await db.getConnection();
      await connection.query("SET time_zone = '+00:00'");

        const [results] = await connection.query(
            "SELECT * FROM otp_codes WHERE email = ? AND otp = ?",
            [email, otp]
        );

        if (results.length === 0) {
            return res.status(400).json({ error: "Invalid or expired OTP" });
        }

        const storedOtp = results[0];
        // const now = new Date();
        // const expiresAt = new Date(storedOtp.expires_at);

        // if (now > expiresAt) {
        //     return res.status(400).json({ error: "OTP has expired" });
        // }

        const nowUTC = new Date(new Date().toISOString());
const expiresAt = new Date(storedOtp.expires_at + 'Z');

if (nowUTC > expiresAt) {
  return res.status(400).json({ error: "OTP has expired" });
}

        const hashedPassword = await bcrypt.hash(newPassword, 10);

        await connection.query("UPDATE users SET password = ? WHERE email = ?", [hashedPassword, email]);

        // Optional: update the OTP after successful reset
       await connection.query("UPDATE otp_codes SET used = TRUE WHERE email = ?", [email]);


        return res.json({ success: true, message: "Password reset successfully" });

    } catch (error) {
        console.error("❌ Error resetting password:", error.message);
        return res.status(500).json({ error: "Server error", details: error.message });
    } finally {
        if (connection) connection.release();
    }
};

exports.verifyResetOtp = async (req, res) => {
  const { email, otp } = req.body;
  if (!email || !otp) {
    return res.status(400).json({ error: "Email and OTP are required." });
  }

  try {
    // const [rows] = await db.query(
    //   "SELECT * FROM otp_codes WHERE email = ? AND otp = ? AND used = FALSE AND expires_at > NOW()",
    //   [email, otp]
    // );
    const [rows] = await db.query(
  "SELECT * FROM otp_codes WHERE email = ? AND otp = ? AND used = FALSE AND expires_at > UTC_TIMESTAMP()",
  [email, otp]
);

    if (!rows.length) {
      return res.status(400).json({ error: "Invalid or expired OTP." });
    }
    // optionally mark used here or let reset‐password do it
    return res.json({ success: true, message: "OTP verified." });
  } catch (err) {
    console.error("❌ verifyResetOtp error:", err.message);
    return res.status(500).json({ error: "Internal server error" });
  }
};







