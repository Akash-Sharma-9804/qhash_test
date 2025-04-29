const { db, query } = require("../config/db"); 
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
require("dotenv").config(); // Ensure dotenv is loaded

// ✅ Ensure user exists in user_history before creating a conversation
// async function ensureUserInHistory(user_id, username, email) {
//     try {
//         const [existingUser] = await db.query(
//             "SELECT id FROM user_history WHERE id = ?",
//             [user_id]
//         );

//         if (existingUser.length === 0) {
//             await db.query(
//                 "INSERT INTO user_history (id, username, email) VALUES (?, ?, ?)",
//                 [user_id, username, email]
//             );
//             console.log(`✅ User ${user_id} added to user_history`);
//         }
//     } catch (error) {
//         console.error("❌ Error ensuring user in user_history:", error.message);
//     }
// }

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
}


// User Signup
// exports.signup = async (req, res) => {
//     const { username, email, password } = req.body;

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
exports.signup = async (req, res) => {
    const { username, email, password } = req.body;

    if (!username || !email || !password) {
        return res.status(400).json({ error: "All fields are required" });
    }

    let connection;

    try {
        connection = await db.getConnection(); // Get a dedicated connection
        await connection.beginTransaction(); // ✅ Start transaction

        // Hash the password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Insert user
        const [userResult] = await connection.query(
            "INSERT INTO users (username, email, password) VALUES (?, ?, ?)",
            [username, email, hashedPassword]
        );

        const user_id = userResult.insertId;

        // Ensure user is added to user_history
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

        // Create initial conversation
        const [conversationResult] = await connection.query(
            "INSERT INTO conversations (user_id, name) VALUES (?, ?)",
            [user_id, "New Conversation"]
        );

        const conversation_id = conversationResult.insertId;

        // Generate JWT
        const token = jwt.sign({ user_id }, process.env.JWT_SECRET, { expiresIn: "7d" });

        await connection.commit(); // ✅ Commit if all succeeded

        res.status(201).json({
            success: true,
            token,
            user: { user_id, username, email },
            conversation_id
        });

    } catch (error) {
        // ✅ Safe rollback
        if (connection && connection.rollback) {
            try {
                await connection.rollback();
            } catch (rollbackError) {
                console.error("❌ Rollback failed:", rollbackError.message);
            }
        }

        // Handle specific errors
        if (error.code === "ER_DUP_ENTRY") {
            return res.status(400).json({ error: "Email already exists" });
        }

        console.error("❌ Signup failed:", error.message);
        return res.status(500).json({ error: "Signup failed", details: error.message });

    } finally {
        // ✅ Safe release
        if (connection && connection.release) {
            try {
                connection.release();
            } catch (releaseError) {
                console.error("❌ Connection release failed:", releaseError.message);
            }
        }
    }
};

exports.login = async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ error: "All fields are required" });
    }

    try {
        console.log("🔍 Logging in with email:", email);

        const [users] = await db.query("SELECT * FROM users WHERE email = ?", [email]);
        console.log("🛠 Query Result:", users);

        const user = Array.isArray(users) ? users[0] : users;

        if (!user || Object.keys(user).length === 0) {
            console.log("❌ No user found for email:", email);
            return res.status(404).json({ error: "User not found" });
        }

        console.log("✅ User found:", user);

        if (!user.password) {
            console.error("❌ ERROR: user.password is undefined!");
            return res.status(500).json({ error: "Server error: Password is missing" });
        }

        const passwordMatch = await bcrypt.compare(password, user.password);
        if (!passwordMatch) {
            return res.status(401).json({ error: "Invalid credentials" });
        }

        console.log("🔹 User logged in:", user.id);

        await ensureUserInHistory(connection,user.id, user.username, user.email);

        const token = jwt.sign({ user_id: user.id }, process.env.JWT_SECRET, { expiresIn: "15d" });
        console.log("🛠 Generated Token:", token);

        // 🔄 Always create a new conversation on login
        let conversation_id = null;
        try {
            const [newConversation] = await db.query(
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
    }
};




// 




