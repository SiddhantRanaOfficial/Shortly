import dotenv from "dotenv";
import connectDB from "./db/index.js";
import getRedisClient from "./redis/index.js";
import { app } from "./app.js";
import { logger } from "./utils/logger.js";

dotenv.config({
  path: "./.env"
});

const PORT = process.env.PORT || 8000;

// Initialize Redis Client
getRedisClient();

// Connect to Database & Start Server
connectDB()
  .then(() => {
    app.listen(PORT, () => {
      logger.success(`⚙️ Server is running on port: ${PORT}`);
      logger.info(`🔗 Base URL: ${process.env.BASE_URL || `http://localhost:${PORT}`}`);
      logger.info(`🏥 Health Check: http://localhost:${PORT}/health`);
    });
  })
  .catch((err) => {
    logger.error("MongoDB connection failed in index.js: ", err);
  });
