// const jwt = require("jsonwebtoken");

// const verifyToken = (req, res, next) => {
//     // Retrieve the Authorization header from the request
//     const authHeader = req.header("Authorization");
//     console.log("🔍 Received Auth Header:", authHeader); // Debug log

//     // If no Authorization header is present, deny access
//     if (!authHeader) return res.status(401).json({ error: "Access denied" });

//     // Extract token from "Bearer token" format
//     const token = authHeader.split(" ")[1]; 
//     console.log("🔍 Extracted Token:", token); // Debug log

//     // If token is not found, deny access
//     if (!token) return res.status(401).json({ error: "Access denied" });

//     try {
//         // Verify the token using JWT_SECRET from environment variables
//         const verified = jwt.verify(token, process.env.JWT_SECRET);
//         console.log("✅ Verified User:", verified); // Debug log

//         // Attach the verified user info to the request object
//         req.user = verified;

//         // Proceed to the next middleware or route handler
//         next();
//     } catch (err) {
//         console.error("❌ Token verification failed:", err); // Debug log
//         // Send a response indicating the token is invalid
//         res.status(400).json({ error: "Invalid token" });
//     }
// };

// module.exports = verifyToken;


const jwt = require("jsonwebtoken");

const verifyToken = (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;

        console.log("🔍 Received Auth Header:", authHeader);

        if (!authHeader || !authHeader.startsWith("Bearer ")) {
            return res.status(401).json({ error: "Unauthorized: No token provided" });
        }

        // Extract the token
        const token = authHeader.split(" ")[1];
        console.log("🔍 Extracted Token:", token);

        if (!token) {
            return res.status(401).json({ error: "Unauthorized: Token missing" });
        }

        // Verify the token
        jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
            if (err) {
                console.error("❌ Token verification failed:", err.message);
                return res.status(401).json({ error: "Unauthorized: Invalid token" });
            }

            console.log("✅ Verified User:", decoded);
            req.user = decoded; // Store decoded user info in `req.user`
            console.log("🧩 Decoded JWT user:", decoded); // Add this for verification
            next();
        });
    } catch (error) {
        console.error("❌ Error in auth middleware:", error.message);
        return res.status(500).json({ error: "Internal Server Error" });
    }
};

module.exports = verifyToken;
