require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { authenticateUser } = require('./middleware/auth');

const app = express();

// Middleware
app.use(cors({
  origin: 'http://localhost:5173', // Your frontend URL
  credentials: true
}));
app.use(express.json());

// Public routes (no auth required)
app.get("/", (req, res) => {
  res.send("Budget Tracker API 🚀");
});

// Protected routes (auth required)
app.use("/api/income", authenticateUser, require('./routes/incomeRoutes'));
app.use("/api/transactions", authenticateUser, require('./routes/transactionRoutes'));

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});