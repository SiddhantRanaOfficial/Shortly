import jwt from "jsonwebtoken";
import { User } from "../models/user.model.js";
import { ApiError } from "../utils/ApiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";

/**
 * Middleware to verify JWT Access Token in incoming request cookies or Authorization header
 */
export const verifyJWT = asyncHandler(async (req, _, next) => {
  try {
    const token =
      req.cookies?.accessToken ||
      req.header("Authorization")?.replace("Bearer ", "");

    if (!token) {
      throw new ApiError(401, "Unauthorized request: Token is missing");
    }

    const secret = process.env.ACCESS_TOKEN_SECRET || "shortly_access_token_secret_key_production_grade_998877!";
    const decodedToken = jwt.verify(token, secret);

    const user = await User.findById(decodedToken?._id).select(
      "-password -refreshToken"
    );

    if (!user) {
      throw new ApiError(401, "Invalid Access Token: User not found");
    }

    req.user = user;
    next();
  } catch (error) {
    throw new ApiError(401, error?.message || "Invalid or expired access token");
  }
});

/**
 * Middleware to optionally populate req.user if a valid JWT is provided, without throwing an error if missing
 */
export const optionalAuth = asyncHandler(async (req, _, next) => {
  try {
    const token =
      req.cookies?.accessToken ||
      req.header("Authorization")?.replace("Bearer ", "");

    if (token) {
      const secret = process.env.ACCESS_TOKEN_SECRET || "shortly_access_token_secret_key_production_grade_998877!";
      const decodedToken = jwt.verify(token, secret);
      const user = await User.findById(decodedToken?._id).select(
        "-password -refreshToken"
      );
      if (user) req.user = user;
    }
  } catch (_) {
    // Ignore invalid tokens for optional auth
  }
  next();
});
