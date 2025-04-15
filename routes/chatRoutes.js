const express = require("express");
const {
    askChatbot,
    getChatHistory,
    createConversation,
    getConversations,
    getConversationHistory,
    updateConversationName
} = require("../controllers/chatController");
const authMiddleware = require("../middleware/authMiddleware");

const router = express.Router();

// ✅ Create a new conversation
router.post("/create-conversation", authMiddleware, createConversation);

// ✅ Get all conversations for the authenticated user
router.get("/conversations", authMiddleware, getConversations);

// ✅ Fetch chat history for a specific conversation
router.get("/conversations/:conversation_id", authMiddleware, getConversationHistory);

// ✅ Handle chatbot interaction (POST request)
router.post("/", authMiddleware, askChatbot); 

// ✅ Fetch general chat history for the authenticated user
router.get("/history", authMiddleware, getChatHistory);

// ✅ rename conversation name
router.put('/rename/:conversationId', authMiddleware, updateConversationName);


module.exports = router;
