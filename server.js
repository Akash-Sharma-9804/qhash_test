// require("dotenv").config();
// const express = require("express");
// const cors = require("cors");
// const cookieParser = require("cookie-parser"); // ✅ Ensure cookie support
// const authRoutes = require("./routes/authRoutes");
// const fileRoutes = require("./routes/fileRoutes");
// const chatRoutes = require("./routes/chatRoutes");

// const app = express();
// const PORT = process.env.PORT || 5001;

// // ✅ Fix CORS issue
// app.use(
//   cors({
//     origin: function (origin, callback) {
//       // Normalize the origin by removing the trailing slash
//       const normalizedOrigin = origin ? origin.replace(/\/$/, "") : origin;

//       // Allow both with and without the trailing slash
//       const allowedOrigins = [
//         "http://localhost:5173",         // Without trailing slash
//         "http://localhost:5173/",        // With trailing slash
//       ];

//       if (allowedOrigins.includes(normalizedOrigin)) {
//         callback(null, true);
//       } else {
//         callback(new Error("Not allowed by CORS"));
//       }
//     },
//     credentials: true, // ✅ Allow cookies & auth headers
//     methods: "GET,POST,PUT,DELETE",
//     allowedHeaders: "Content-Type,Authorization",
//   })
// );

// // Middleware
// app.use(express.json());
// app.use(cookieParser()); // ✅ Parse cookies

// // Routes
// app.use("/api/auth", authRoutes);
// app.use("/api/files", fileRoutes);
// app.use("/api/chat", chatRoutes); // ✅ Ensure chat routes are correctly used

// app.get("/", (req, res) => res.send("🚀 Server is running..."));

// // Global Error Handling Middleware
// app.use((err, req, res, next) => {
//   console.error("Server Error:", err);
//   res.status(500).json({ message: "Internal Server Error" });
// });

// // Start Server
// app.listen(PORT, () => console.log(`🚀 Server running on http://localhost:${PORT}`));
// console.log("Backend running...");

require("dotenv").config();
const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser"); // ✅ Ensure cookie support
const authRoutes = require("./routes/authRoutes");
const fileRoutes = require("./routes/fileRoutes");
const chatRoutes = require("./routes/chatRoutes");

const app = express();
const PORT = process.env.PORT || 5001;

// ✅ Fix CORS issue (Include production domains)
const allowedOrigins = [
  "http://localhost:5173",        // Development (Vite)
  "http://localhost:5173/",       // With trailing slash
  "https://quantumhash.me/Quantum_AI/",  // Example Production (Vercel)
  
];

app.use(
  cors({
    origin: function (origin, callback) {
      // Normalize the origin by removing the trailing slash
      const normalizedOrigin = origin ? origin.replace(/\/$/, "") : origin;

      if (!origin || allowedOrigins.includes(normalizedOrigin)) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true, // ✅ Allow cookies & auth headers
    methods: "GET,POST,PUT,DELETE",
    allowedHeaders: "Content-Type,Authorization",
  })
);

// Middleware
app.use(express.json());
app.use(cookieParser()); // ✅ Parse cookies

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/files", fileRoutes);
app.use("/api/chat", chatRoutes); // ✅ Ensure chat routes are correctly used

app.get("/", (req, res) => res.send("🚀 Server is running..."));

// Global Error Handling Middleware
app.use((err, req, res, next) => {
  console.error("Server Error:", err);
  res.status(500).json({ message: "Internal Server Error" });
});

// Start Server
app.listen(PORT, () => console.log(`🚀 Server running on http://localhost:${PORT}`));
console.log("Backend running...");
