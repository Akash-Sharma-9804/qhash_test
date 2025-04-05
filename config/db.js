// const mysql = require("mysql2/promise");
// require("dotenv").config();

// const db = mysql.createConnection({
//     host: process.env.DB_HOST,
//     user: process.env.DB_USER,
//     password: process.env.DB_PASSWORD,
//     database: process.env.DB_NAME,
//     port: process.env.DB_PORT || 3306, // Default to 3306 if not specified
// });

// db.connect((err) => {
//     if (err) console.error("❌ Database connection failed:", err);
//     else console.log("✅ Connected to MySQL Database");
// });

// module.exports = db;
// const mysql = require("mysql2/promise");
// require("dotenv").config();

// // ✅ Create a MySQL connection pool
// const db = mysql.createPool({
//     host: process.env.DB_HOST,
//     user: process.env.DB_USER,
//     password: process.env.DB_PASSWORD,
//     database: process.env.DB_NAME,
//     port: process.env.DB_PORT || 3306,
//     waitForConnections: true,
//     connectionLimit: 10,
//     queueLimit: 0,
// });

// // ✅ Test database connection inside an async function
// const testDBConnection = async () => {
//     try {
//         const connection = await db.getConnection();
//         console.log("✅ Connected to MySQL Database");

//         // 🛠 STEP 2: TEST QUERY EXECUTION (✅ FIXED)
//         const [testResult] = await connection.query("SELECT 1+1 AS result");
//         console.log("🔍 DB Connection Test Result:", testResult);

//         connection.release(); // Release the connection back to the pool
//     } catch (err) {
//         console.error("❌ Database connection failed:", err);
//     }
// };

// // ✅ Run the test function
// testDBConnection();

// module.exports = { db };

const mysql = require("mysql2/promise");
require("dotenv").config();

// ✅ Create MySQL Connection Pool
const db = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT || 3306,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
});

// ✅ Helper function to run queries
const query = async (sql, params) => {
    try {
        const [rows] = await db.execute(sql, params);
        return rows;
    } catch (error) {
        console.error("❌ Database query error:", error);
        throw error;
    }
};

// ✅ Test Database Connection
(async () => {
    try {
        const connection = await db.getConnection();
        console.log("✅ Connected to MySQL Database");
        connection.release();
    } catch (error) {
        console.error("❌ Database connection failed:", error);
    }
})();

module.exports = { db, query };
