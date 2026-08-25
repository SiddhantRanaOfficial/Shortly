import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { Url } from "../models/url.model.js";
import CacheService from "../services/cache.service.js";
import { ApiError } from "../utils/ApiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PASSWORD_VIEW_PATH = path.join(__dirname, "../views/password.html");

/**
 * High-Throughput HTTP Redirect Handler
 * GET /:code
 */
const handleRedirect = asyncHandler(async (req, res) => {
  const { code } = req.params;

  if (!code) {
    throw new ApiError(400, "Short code is required");
  }

  let urlData = await CacheService.getUrl(code);
  let urlDoc = null;

  if (urlData) {
    // Cache Hit (< 5ms response path)
    if (!urlData.isActive) {
      throw new ApiError(410, "This short URL has been deactivated by its owner");
    }

    if (urlData.expiresAt && new Date() > new Date(urlData.expiresAt)) {
      throw new ApiError(410, "This short URL has expired");
    }

    if (urlData.maxClicks > 0 && urlData.currentClicks >= urlData.maxClicks) {
      throw new ApiError(410, "This short URL has reached its maximum click limit");
    }

    // Password Challenge Check
    if (urlData.password) {
      const candidatePassword = req.query.p || req.headers["x-link-password"];
      if (!candidatePassword) {
        if (req.accepts("html")) {
          let html = fs.readFileSync(PASSWORD_VIEW_PATH, "utf8");
          html = html.replace("{{CODE}}", code);
          return res.status(200).send(html);
        }
        throw new ApiError(401, "Password required for this short URL", ["password_required"]);
      }

      // Fetch DB document to verify bcrypt password
      urlDoc = await Url.findById(urlData._id);
      const isPasswordCorrect = await urlDoc.isPasswordValid(candidatePassword);
      if (!isPasswordCorrect) {
        throw new ApiError(401, "Incorrect password for this short URL");
      }
    }
  } else {
    // Cache Miss Path: Query MongoDB & Populate Cache
    urlDoc = await Url.findOne({
      $or: [{ shortCode: code }, { customSlug: code }]
    });

    if (!urlDoc) {
      throw new ApiError(404, "Short URL not found");
    }

    if (!urlDoc.isActive) {
      throw new ApiError(410, "This short URL has been deactivated by its owner");
    }

    if (urlDoc.isExpired()) {
      throw new ApiError(410, "This short URL has expired");
    }

    if (urlDoc.isClickLimitReached()) {
      throw new ApiError(410, "This short URL has reached its maximum click limit");
    }

    if (urlDoc.password) {
      const candidatePassword = req.query.p || req.headers["x-link-password"];
      if (!candidatePassword) {
        if (req.accepts("html")) {
          let html = fs.readFileSync(PASSWORD_VIEW_PATH, "utf8");
          html = html.replace("{{CODE}}", code);
          return res.status(200).send(html);
        }
        throw new ApiError(401, "Password required for this short URL", ["password_required"]);
      }

      const isPasswordCorrect = await urlDoc.isPasswordValid(candidatePassword);
      if (!isPasswordCorrect) {
        throw new ApiError(401, "Incorrect password for this short URL");
      }
    }

    // Cache object payload
    urlData = {
      _id: String(urlDoc._id),
      originalUrl: urlDoc.originalUrl,
      shortCode: urlDoc.shortCode,
      customSlug: urlDoc.customSlug,
      expiresAt: urlDoc.expiresAt,
      maxClicks: urlDoc.maxClicks,
      currentClicks: urlDoc.currentClicks,
      isActive: urlDoc.isActive,
      password: urlDoc.password
    };

    // Populate Redis Cache
    await CacheService.setUrl(code, urlData, 3600);
  }

  // Increment click count asynchronously in MongoDB
  Url.findByIdAndUpdate(urlData._id, { $inc: { currentClicks: 1 } }).catch(() => {});

  // Append UTM parameters if present
  let destinationUrl = urlData.originalUrl;

  // Set low latency redirect headers
  res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
  return res.redirect(302, destinationUrl);
});

/**
 * Handle POST password challenge submission
 * POST /p/:code
 */
const handlePasswordSubmit = asyncHandler(async (req, res) => {
  const { code } = req.params;
  const { password } = req.body;

  if (!code || !password) {
    throw new ApiError(400, "Short code and password are required");
  }

  const urlDoc = await Url.findOne({
    $or: [{ shortCode: code }, { customSlug: code }]
  });

  if (!urlDoc) {
    throw new ApiError(404, "Short URL not found");
  }

  const isValid = await urlDoc.isPasswordValid(password);

  if (!isValid) {
    if (req.accepts("html")) {
      return res.redirect(`/p/${code}?error=1`);
    }
    throw new ApiError(401, "Incorrect password");
  }

  return res.redirect(302, urlDoc.originalUrl);
});

/**
 * Render password prompt page GET /p/:code
 */
const renderPasswordView = asyncHandler(async (req, res) => {
  const { code } = req.params;
  let html = fs.readFileSync(PASSWORD_VIEW_PATH, "utf8");
  html = html.replace("{{CODE}}", code);
  return res.status(200).send(html);
});

export { handleRedirect, handlePasswordSubmit, renderPasswordView };
