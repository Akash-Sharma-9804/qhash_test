

// require("dotenv").config();
// const express = require("express");
// const cors = require("cors");
// const cookieParser = require("cookie-parser");

// const authRoutes = require("./routes/authRoutes");
// const fileRoutes = require("./routes/fileRoutes");
// const chatRoutes = require("./routes/chatRoutes");

// const app = express();
// const PORT = process.env.PORT || 5001;

// // ✅ Allowed origins for both local & production
// const allowedOrigins = [
//   "http://localhost:5173",     // Local dev
//   "https://quantumhash.me"     // Production domain
// ];

// // ✅ CORS middleware (basic setup)
// const corsOptions = {
//   origin: allowedOrigins,
//   credentials: true,
//   methods: ["GET", "POST", "PUT",'PATCH', "DELETE", "OPTIONS"],
//   allowedHeaders: ["Content-Type", "Authorization", "Accept", "Origin"], // Ensure 'Origin' is included
// };

// // ✅ Apply CORS to all routes
// app.use(cors(corsOptions));

// // ✅ Manually handle preflight (OPTIONS) requests — crucial for Render
// app.options("*", cors(corsOptions));

// // ✅ Middleware
// app.use(express.json());
// app.use(cookieParser());

// // ✅ Routes
// app.use("/api/auth", authRoutes);
// app.use("/api/files", fileRoutes);
// app.use("/api/chat", chatRoutes);

// // ✅ Base route
// app.get("/", (req, res) => res.send("🚀 Server is running..."));

// // ✅ Global Error Handler
// app.use((err, req, res, next) => {
//   console.error("Server Error:", err);
//   res.status(500).json({ message: "Internal Server Error" });
// });

// // ✅ Start Server
// app.listen(PORT, () => {
//   console.log(`🚀 Server running on http://localhost:${PORT}`);
// });

// test 
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const http = require("http");
const { WebSocketServer } = require("ws");
const jwt = require("jsonwebtoken");

const authRoutes = require("./routes/authRoutes");
const fileRoutes = require("./routes/fileRoutes");
const chatRoutes = require("./routes/chatRoutes");
const voiceRoutes = require("./routes/voiceRoutes");
const { handleVoiceStream } = require("./controllers/voiceController");

const app = express();
const PORT = process.env.PORT || 5001;

// ✅ Allowed origins for both local & production
const allowedOrigins = [
  "http://localhost:5173",          // Local dev
  "https://yourfrontenddomain.com"  // Your production frontend domain
];

// ✅ CORS middleware (basic setup)
const corsOptions = {
  origin: allowedOrigins,
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "Accept", "Origin"],
};

app.use(cors(corsOptions));
app.options("*", cors(corsOptions));

// ✅ Middleware
app.use(express.json());
app.use(cookieParser());

// ✅ Routes
app.use("/api/auth", authRoutes);
app.use("/api/files", fileRoutes);
app.use("/api/chat", chatRoutes);
app.use("/api/voice", voiceRoutes); // ⬅️ Added voice route

// ✅ Base route
app.get("/", (req, res) => res.send("🚀 Server is running..."));

// ✅ Global Error Handler
app.use((err, req, res, next) => {
  console.error("Server Error:", err);
  res.status(500).json({ message: "Internal Server Error" });
});

// ✅ Create HTTP server for Express + WebSocket
const server = http.createServer(app);

// ✅ WebSocket for Deepgram voice streaming
const wss = new WebSocketServer({ server, path: "/api/voice/ws" });

wss.on("connection", async (ws, req) => {
  try {
    // Check if the token is passed through headers
    const url = new URL(req.url, `http://${req.headers.host}`);
    const token = url.searchParams.get("token");
    
    
    if (!token) {
      console.error("❌ No token provided");
      return ws.close(); // Close connection if no token
    }

    // Verify the token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const userId = decoded?.user_id;

    if (!userId) {
      console.error("❌ Invalid token, closing connection");
      return ws.close(); // Close connection if token is invalid
    }

    // Proceed with handling the voice stream if the token is valid
    await handleVoiceStream(ws, userId);
  } catch (error) {
    console.error("❌ WebSocket Auth Error:", error.message);
    ws.close(); // Close connection if any error occurs
  }
});

// ✅ Graceful shutdown for WebSocket
process.on("SIGINT", () => {
  wss.close(() => {
    console.log("✅ WebSocket server closed gracefully");
    server.close(() => {
      console.log("✅ Server shut down gracefully");
      process.exit(0);
    });
  });
});

// ✅ Start server
server.listen(PORT, () => {
  console.log(`🚀 Server running on https://localhost:${PORT}`);
});


