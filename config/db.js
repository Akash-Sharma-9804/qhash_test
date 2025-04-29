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

// const mysql = require("mysql2/promise");
// require("dotenv").config();

// // ✅ Create MySQL Connection Pool
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

// // ✅ Helper function to run queries
// const query = async (sql, params) => {
//     try {
//         const [rows] = await db.execute(sql, params);
//         return rows;
//     } catch (error) {
//         console.error("❌ Database query error:", error);
//         throw error;
//     }
// };

// // ✅ Test Database Connection
// (async () => {
//     try {
//         const connection = await db.getConnection();
//         console.log("✅ Connected to MySQL Database");
//         connection.release();
//     } catch (error) {
//         console.error("❌ Database connection failed:", error);
//     }
// })();

// module.exports = { db, query };


// const mysql = require("mysql2/promise");
// require("dotenv").config();

// // ✅ Create MySQL Connection Pool
// const db = mysql.createPool({
//     host: process.env.DB_HOST,
//     user: process.env.DB_USER,
//     password: process.env.DB_PASSWORD,
//     database: process.env.DB_NAME,
//     port: process.env.DB_PORT || 3306,
//     waitForConnections: true,
//     connectionLimit: 10,
//     queueLimit: 0,
//     connectTimeout: 10000, // 10 seconds for connection timeout
//     acquireTimeout: 10000, // 10 seconds for acquiring a connection
// });

// // ✅ Retry logic for database queries
// const MAX_RETRIES = 3; // Max number of retries

// // Function to execute a query with retry logic
// const executeQueryWithRetry = async (sql, params) => {
//     let retries = 0;
//     while (retries < MAX_RETRIES) {
//         try {
//             const [rows] = await db.execute(sql, params);
//             retries = 0; // Reset retry count on success
//             return rows;
//         } catch (error) {
//             if (error.code === "ECONNRESET" && retries < MAX_RETRIES) {
//                 retries++;
//                 console.log(`❌ Connection reset. Retrying... (${retries}/${MAX_RETRIES})`);
//                 await new Promise((resolve) => setTimeout(resolve, 1000)); // Wait 1 second before retrying
//             } else {
//                 console.error("❌ Database query error:", error);
//                 throw error; // If max retries exceeded or a different error, throw the error
//             }
//         }
//     }
// };

// // ✅ Helper function to run queries with retry
// const query = async (sql, params) => {
//     return executeQueryWithRetry(sql, params);
// };

// // ✅ Test Database Connection
// (async () => {
//     try {
//         const connection = await db.getConnection();
//         console.log("✅ Connected to MySQL Database");
//         connection.release();
//     } catch (error) {
//         console.error("❌ Database connection failed:", error);
//     }
// })();

// module.exports = { db, query };


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
    connectionLimit: 10,  // increased for scalability
    queueLimit: 0,
    connectTimeout: 10000, // 10 seconds for connection timeout
    acquireTimeout: 10000, // 10 seconds for acquiring a connection
});

// ✅ Retry logic for database queries
const MAX_RETRIES = 3;

const executeQueryWithRetry = async (sql, params) => {
    let retries = 0;

    while (retries < MAX_RETRIES) {
        try {
            const [rows] = await db.execute(sql, params);
            return rows; // ✅ success
        } catch (error) {
            if ((error.code === "ECONNRESET" || error.code === "PROTOCOL_CONNECTION_LOST") && retries < MAX_RETRIES) {
                retries++;
                console.warn(`⚠️ DB retry (${retries}/${MAX_RETRIES}) due to: ${error.code}`);
                await new Promise((resolve) => setTimeout(resolve, 1000)); // Retry after 1 second
            } else {
                console.error("❌ Database query error:", error);
                throw error; // throw error if retry attempts exceeded
            }
        }
    }
};

// ✅ Helper function to run queries
const query = async (sql, params) => {
    return executeQueryWithRetry(sql, params);
};

// ✅ Test Database Connection (runs once)
(async () => {
    let connection;
    try {
        connection = await db.getConnection();
        console.log("✅ Connected to MySQL Database");
    } catch (error) {
        console.error("❌ Database connection failed:", error);
    } finally {
        if (connection) connection.release(); // ✅ Only release if it was defined
    }
})();

module.exports = { db, query };

