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
import analyticsRouter from "./routes/analytics.routes.js";
import redirectRouter from "./routes/redirect.routes.js";

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
app.use("/api/v1/analytics", analyticsRouter);

// Root Level Redirection Router (must be attached after API routes)
app.use("/", redirectRouter);

// Central Error Handler Middleware (Must be attached last)
app.use(errorHandler);

export { app };
