require("dotenv").config();
const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser"); // ✅ Ensure cookie support
const authRoutes = require("./routes/authRoutes");
const fileRoutes = require("./routes/fileRoutes");
const chatRoutes = require("./routes/chatRoutes");

const app = express();
const PORT = process.env.PORT || 5001;

// ✅ Fix CORS issue (Include correct origin format)
const allowedOrigins = [
  "http://localhost:5173",       // Development
  "https://quantumhash.me"       // Production
];

app.use(
  cors({
    origin: allowedOrigins,
    credentials: true, // ✅ Allow cookies & auth headers
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
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
