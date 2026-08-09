import mongoose from "mongoose";
import { DB_NAME } from "../constants.js";
import { logger } from "../utils/logger.js";

/**
 * Connects to MongoDB database using Mongoose
 */
const connectDB = async () => {
  try {
    const connectionInstance = await mongoose.connect(
      `${process.env.MONGODB_URI}/${DB_NAME}`
    );
    logger.success(
      `MongoDB connected successfully! DB HOST: ${connectionInstance.connection.host}`
    );
    return connectionInstance;
  } catch (error) {
    logger.error("MongoDB connection FAILED: ", error.message);
    logger.warn("Continuing server startup... (Make sure local MongoDB service or MONGODB_URI is active)");
  }
};

export default connectDB;
