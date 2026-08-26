import mongoose from "mongoose";
import { ClickAnalytics } from "../models/analytics.model.js";
import { Url } from "../models/url.model.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";

/**
 * Get overall dashboard analytics summary for authenticated user
 * GET /api/v1/analytics/overview
 */
const getOverallAnalytics = asyncHandler(async (req, res) => {
  const userId = req.user._id;

  // Find all URLs created by this user
  const userUrls = await Url.find({ createdBy: userId }).select("_id shortCode currentClicks");
  const urlIds = userUrls.map((u) => u._id);

  const totalUrls = userUrls.length;
  const totalClicks = userUrls.reduce((acc, curr) => acc + (curr.currentClicks || 0), 0);

  if (urlIds.length === 0) {
    return res.status(200).json(
      new ApiResponse(
        200,
        {
          totalUrls: 0,
          totalClicks: 0,
          topDevice: "None",
          topReferrer: "None",
          topCountry: "None",
          recentClicks: []
        },
        "User has no short URLs yet"
      )
    );
  }

  // Top Device aggregation
  const topDeviceAgg = await ClickAnalytics.aggregate([
    { $match: { urlId: { $in: urlIds } } },
    { $group: { _id: "$device", count: { $sum: 1 } } },
    { $sort: { count: -1 } },
    { $limit: 1 }
  ]);

  // Top Referrer aggregation
  const topReferrerAgg = await ClickAnalytics.aggregate([
    { $match: { urlId: { $in: urlIds } } },
    { $group: { _id: "$referrer", count: { $sum: 1 } } },
    { $sort: { count: -1 } },
    { $limit: 1 }
  ]);

  // Top Country aggregation
  const topCountryAgg = await ClickAnalytics.aggregate([
    { $match: { urlId: { $in: urlIds } } },
    { $group: { _id: "$country", count: { $sum: 1 } } },
    { $sort: { count: -1 } },
    { $limit: 1 }
  ]);

  // Recent 5 clicks
  const recentClicks = await ClickAnalytics.find({ urlId: { $in: urlIds } })
    .sort({ timestamp: -1 })
    .limit(5)
    .select("shortCode device browser country referrer timestamp");

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        totalUrls,
        totalClicks,
        topDevice: topDeviceAgg[0]?._id || "Desktop",
        topReferrer: topReferrerAgg[0]?._id || "Direct",
        topCountry: topCountryAgg[0]?._id || "Unknown",
        recentClicks
      },
      "Overall analytics overview retrieved successfully"
    )
  );
});

/**
 * Get detailed analytics breakdown for a specific shortCode
 * GET /api/v1/analytics/:shortCode
 */
const getUrlAnalytics = asyncHandler(async (req, res) => {
  const { shortCode } = req.params;

  const url = await Url.findOne({
    $or: [{ shortCode }, { customSlug: shortCode }]
  });

  if (!url) {
    throw new ApiError(404, "Short URL not found");
  }

  // Ensure request is made by link owner
  if (url.createdBy && String(url.createdBy) !== String(req.user._id)) {
    throw new ApiError(403, "You do not have permission to view analytics for this URL");
  }

  const urlId = url._id;

  // 1. Time-series click distribution (by Date: YYYY-MM-DD)
  const timeSeries = await ClickAnalytics.aggregate([
    { $match: { urlId: new mongoose.Types.ObjectId(urlId) } },
    {
      $group: {
        _id: { $dateToString: { format: "%Y-%m-%d", date: "$timestamp" } },
        clicks: { $sum: 1 }
      }
    },
    { $sort: { _id: 1 } }
  ]);

  // 2. Devices breakdown
  const devices = await ClickAnalytics.aggregate([
    { $match: { urlId: new mongoose.Types.ObjectId(urlId) } },
    { $group: { _id: "$device", count: { $sum: 1 } } },
    { $sort: { count: -1 } }
  ]);

  // 3. Browsers breakdown
  const browsers = await ClickAnalytics.aggregate([
    { $match: { urlId: new mongoose.Types.ObjectId(urlId) } },
    { $group: { _id: "$browser", count: { $sum: 1 } } },
    { $sort: { count: -1 } },
    { $limit: 10 }
  ]);

  // 4. Operating System breakdown
  const os = await ClickAnalytics.aggregate([
    { $match: { urlId: new mongoose.Types.ObjectId(urlId) } },
    { $group: { _id: "$os", count: { $sum: 1 } } },
    { $sort: { count: -1 } },
    { $limit: 10 }
  ]);

  // 5. Geographic Countries breakdown
  const countries = await ClickAnalytics.aggregate([
    { $match: { urlId: new mongoose.Types.ObjectId(urlId) } },
    { $group: { _id: "$country", count: { $sum: 1 } } },
    { $sort: { count: -1 } },
    { $limit: 15 }
  ]);

  // 6. Referrers breakdown
  const referrers = await ClickAnalytics.aggregate([
    { $match: { urlId: new mongoose.Types.ObjectId(urlId) } },
    { $group: { _id: "$referrer", count: { $sum: 1 } } },
    { $sort: { count: -1 } },
    { $limit: 10 }
  ]);

  // 7. Recent 10 click logs
  const recentLogs = await ClickAnalytics.find({ urlId })
    .sort({ timestamp: -1 })
    .limit(10)
    .select("ip device browser os country city referrer timestamp");

  const baseUrl = process.env.BASE_URL || `http://localhost:${process.env.PORT || 8000}`;

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        url: {
          _id: url._id,
          originalUrl: url.originalUrl,
          shortCode: url.shortCode,
          shortUrl: `${baseUrl}/${url.shortCode}`,
          currentClicks: url.currentClicks,
          maxClicks: url.maxClicks,
          isActive: url.isActive,
          createdAt: url.createdAt
        },
        timeSeries: timeSeries.map((t) => ({ date: t._id, clicks: t.clicks })),
        devices: devices.map((d) => ({ device: d._id, count: d.count })),
        browsers: browsers.map((b) => ({ browser: b._id, count: b.count })),
        os: os.map((o) => ({ os: o._id, count: o.count })),
        countries: countries.map((c) => ({ country: c._id, count: c.count })),
        referrers: referrers.map((r) => ({ referrer: r._id, count: r.count })),
        recentLogs
      },
      "Detailed URL analytics retrieved successfully"
    )
  );
});

export { getOverallAnalytics, getUrlAnalytics };
