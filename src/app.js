import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { errorHandler } from "./middlewares/error.middleware.js";
import { ApiResponse } from "./utils/ApiResponse.js";

const app = express();

// Configure CORS
app.use(
  cors({
    origin: process.env.CORS_ORIGIN || "*",
    credentials: true
  })
);

// Standard Request Parsers
app.use(express.json({ limit: "16kb" }));
app.use(express.urlencoded({ extended: true, limit: "16kb" }));
app.use(express.static("public"));
app.use(cookieParser());

// Import Routes
import authRouter from "./routes/auth.routes.js";
import urlRouter from "./routes/url.routes.js";

// Health Check Route
app.get("/health", (req, res) => {
  return res.status(200).json(
    new ApiResponse(
      200,
      {
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
        status: "OK",
        service: "Shortly Engine"
      },
      "Shortly API service is healthy and operational"
    )
  );
});

// Routes Declaration
app.use("/api/v1/auth", authRouter);
app.use("/api/v1/urls", urlRouter);

// Central Error Handler Middleware (Must be attached last)
app.use(errorHandler);

export { app };
