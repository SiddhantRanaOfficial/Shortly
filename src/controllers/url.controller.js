import QRCode from "qrcode";
import { Url } from "../models/url.model.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { generateShortCode, isValidSlug, isValidUrl } from "../utils/base62.js";

/**
 * Create a new short URL
 * POST /api/v1/urls
 */
const createShortUrl = asyncHandler(async (req, res) => {
  const {
    originalUrl,
    customSlug,
    expiresAt,
    maxClicks,
    password,
    utmSource,
    utmMedium,
    utmCampaign,
    utmTerm,
    utmContent
  } = req.body;

  if (!originalUrl || !isValidUrl(originalUrl)) {
    throw new ApiError(400, "Valid originalUrl is required (must start with http:// or https://)");
  }

  let code = "";

  if (customSlug) {
    if (!isValidSlug(customSlug)) {
      throw new ApiError(
        400,
        "Custom slug must be 3-30 characters long and contain only letters, numbers, hyphens, or underscores"
      );
    }

    const existingUrl = await Url.findOne({
      $or: [{ shortCode: customSlug }, { customSlug }]
    });

    if (existingUrl) {
      throw new ApiError(409, `Custom slug '${customSlug}' is already taken`);
    }

    code = customSlug;
  } else {
    // Generate unique Base62 short code
    let isUnique = false;
    let attempts = 0;
    while (!isUnique && attempts < 10) {
      code = generateShortCode(7);
      const existing = await Url.findOne({
        $or: [{ shortCode: code }, { customSlug: code }]
      });
      if (!existing) isUnique = true;
      attempts++;
    }

    if (!isUnique) {
      throw new ApiError(500, "Failed to generate a unique short code. Please try again.");
    }
  }

  // Construct UTM parameters object
  const utmParams = {
    source: utmSource || "",
    medium: utmMedium || "",
    campaign: utmCampaign || "",
    term: utmTerm || "",
    content: utmContent || ""
  };

  const newUrl = await Url.create({
    originalUrl: originalUrl.trim(),
    shortCode: code,
    customSlug: customSlug || null,
    createdBy: req.user?._id || null,
    expiresAt: expiresAt ? new Date(expiresAt) : null,
    maxClicks: maxClicks ? parseInt(maxClicks, 10) : 0,
    password: password || null,
    utmParams
  });

  const baseUrl = process.env.BASE_URL || `http://localhost:${process.env.PORT || 8000}`;
  const shortUrl = `${baseUrl}/${code}`;

  // Generate QR Code Data URL
  const qrCodeDataUrl = await QRCode.toDataURL(shortUrl, {
    errorCorrectionLevel: "H",
    margin: 2,
    color: {
      dark: "#6366f1",
      light: "#ffffff"
    }
  });

  const responseData = {
    ...newUrl.toObject(),
    shortUrl,
    qrCode: qrCodeDataUrl,
    hasPassword: Boolean(password)
  };
  delete responseData.password; // Do not leak password hash in response

  return res.status(201).json(
    new ApiResponse(201, responseData, "Short URL created successfully")
  );
});

/**
 * Get all URLs created by current user (Paginated)
 * GET /api/v1/urls
 */
const getUserUrls = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page || "1", 10);
  const limit = parseInt(req.query.limit || "10", 10);
  const search = req.query.search || "";

  const skip = (page - 1) * limit;

  const filter = {
    createdBy: req.user._id
  };

  if (search) {
    filter.$or = [
      { originalUrl: { $regex: search, $options: "i" } },
      { shortCode: { $regex: search, $options: "i" } },
      { customSlug: { $regex: search, $options: "i" } }
    ];
  }

  const urls = await Url.find(filter)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .select("-password");

  const totalUrls = await Url.countDocuments(filter);

  const baseUrl = process.env.BASE_URL || `http://localhost:${process.env.PORT || 8000}`;
  const formattedUrls = urls.map((url) => ({
    ...url.toObject(),
    shortUrl: `${baseUrl}/${url.shortCode}`
  }));

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        urls: formattedUrls,
        pagination: {
          page,
          limit,
          totalUrls,
          totalPages: Math.ceil(totalUrls / limit)
        }
      },
      "User URLs retrieved successfully"
    )
  );
});

/**
 * Get single URL details by shortCode
 * GET /api/v1/urls/:shortCode
 */
const getUrlDetails = asyncHandler(async (req, res) => {
  const { shortCode } = req.params;

  const url = await Url.findOne({
    $or: [{ shortCode }, { customSlug: shortCode }]
  }).select("-password");

  if (!url) {
    throw new ApiError(404, "Short URL not found");
  }

  const baseUrl = process.env.BASE_URL || `http://localhost:${process.env.PORT || 8000}`;
  const responseData = {
    ...url.toObject(),
    shortUrl: `${baseUrl}/${url.shortCode}`
  };

  return res.status(200).json(
    new ApiResponse(200, responseData, "URL details retrieved successfully")
  );
});

/**
 * Update URL properties
 * PATCH /api/v1/urls/:shortCode
 */
const updateUrl = asyncHandler(async (req, res) => {
  const { shortCode } = req.params;
  const { originalUrl, expiresAt, maxClicks, isActive, password } = req.body;

  const url = await Url.findOne({
    $or: [{ shortCode }, { customSlug: shortCode }]
  });

  if (!url) {
    throw new ApiError(404, "Short URL not found");
  }

  // Ensure request is made by URL owner
  if (url.createdBy && String(url.createdBy) !== String(req.user._id)) {
    throw new ApiError(403, "You do not have permission to update this URL");
  }

  if (originalUrl) {
    if (!isValidUrl(originalUrl)) {
      throw new ApiError(400, "Invalid originalUrl format");
    }
    url.originalUrl = originalUrl.trim();
  }

  if (expiresAt !== undefined) {
    url.expiresAt = expiresAt ? new Date(expiresAt) : null;
  }

  if (maxClicks !== undefined) {
    url.maxClicks = parseInt(maxClicks, 10);
  }

  if (isActive !== undefined) {
    url.isActive = Boolean(isActive);
  }

  if (password !== undefined) {
    url.password = password || null; // Will trigger pre-save bcrypt hook if string
  }

  await url.save();

  const baseUrl = process.env.BASE_URL || `http://localhost:${process.env.PORT || 8000}`;
  const responseData = {
    ...url.toObject(),
    shortUrl: `${baseUrl}/${url.shortCode}`
  };
  delete responseData.password;

  return res.status(200).json(
    new ApiResponse(200, responseData, "URL updated successfully")
  );
});

/**
 * Delete a short URL
 * DELETE /api/v1/urls/:shortCode
 */
const deleteUrl = asyncHandler(async (req, res) => {
  const { shortCode } = req.params;

  const url = await Url.findOne({
    $or: [{ shortCode }, { customSlug: shortCode }]
  });

  if (!url) {
    throw new ApiError(404, "Short URL not found");
  }

  if (url.createdBy && String(url.createdBy) !== String(req.user._id)) {
    throw new ApiError(403, "You do not have permission to delete this URL");
  }

  await Url.findByIdAndDelete(url._id);

  return res.status(200).json(
    new ApiResponse(200, {}, "Short URL deleted successfully")
  );
});

/**
 * Toggle active status of short URL
 * PATCH /api/v1/urls/:shortCode/status
 */
const toggleUrlStatus = asyncHandler(async (req, res) => {
  const { shortCode } = req.params;

  const url = await Url.findOne({
    $or: [{ shortCode }, { customSlug: shortCode }]
  });

  if (!url) {
    throw new ApiError(404, "Short URL not found");
  }

  if (url.createdBy && String(url.createdBy) !== String(req.user._id)) {
    throw new ApiError(403, "You do not have permission to modify this URL");
  }

  url.isActive = !url.isActive;
  await url.save();

  return res.status(200).json(
    new ApiResponse(
      200,
      { shortCode: url.shortCode, isActive: url.isActive },
      `Short URL ${url.isActive ? "activated" : "deactivated"} successfully`
    )
  );
});

/**
 * Generate QR code PNG or Data URL for short URL
 * GET /api/v1/urls/:shortCode/qr
 */
const generateQrCode = asyncHandler(async (req, res) => {
  const { shortCode } = req.params;

  const url = await Url.findOne({
    $or: [{ shortCode }, { customSlug: shortCode }]
  });

  if (!url) {
    throw new ApiError(404, "Short URL not found");
  }

  const baseUrl = process.env.BASE_URL || `http://localhost:${process.env.PORT || 8000}`;
  const shortUrl = `${baseUrl}/${url.shortCode}`;

  const format = req.query.format || "dataurl";

  if (format === "image") {
    res.setHeader("Content-Type", "image/png");
    return QRCode.toFileStream(res, shortUrl, {
      errorCorrectionLevel: "H",
      margin: 2
    });
  }

  const qrCodeDataUrl = await QRCode.toDataURL(shortUrl, {
    errorCorrectionLevel: "H",
    margin: 2,
    color: {
      dark: "#6366f1",
      light: "#ffffff"
    }
  });

  return res.status(200).json(
    new ApiResponse(200, { qrCode: qrCodeDataUrl }, "QR code generated successfully")
  );
});

export {
  createShortUrl,
  getUserUrls,
  getUrlDetails,
  updateUrl,
  deleteUrl,
  toggleUrlStatus,
  generateQrCode
};
