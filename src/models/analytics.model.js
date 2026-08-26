import mongoose, { Schema } from "mongoose";

const clickAnalyticsSchema = new Schema(
  {
    urlId: {
      type: Schema.Types.ObjectId,
      ref: "Url",
      required: true,
      index: true
    },
    shortCode: {
      type: String,
      required: true,
      index: true
    },
    ip: {
      type: String,
      default: "127.0.0.1"
    },
    userAgent: {
      type: String,
      default: ""
    },
    device: {
      type: String,
      enum: ["Desktop", "Mobile", "Tablet", "Bot", "Other"],
      default: "Desktop"
    },
    browser: {
      type: String,
      default: "Unknown"
    },
    os: {
      type: String,
      default: "Unknown"
    },
    country: {
      type: String,
      default: "Unknown"
    },
    city: {
      type: String,
      default: "Unknown"
    },
    referrer: {
      type: String,
      default: "Direct"
    },
    timestamp: {
      type: Date,
      default: Date.now,
      index: true
    }
  },
  {
    timestamps: true
  }
);

// Compound indexes for fast aggregated analytics queries
clickAnalyticsSchema.index({ urlId: 1, timestamp: -1 });
clickAnalyticsSchema.index({ shortCode: 1, timestamp: -1 });

export const ClickAnalytics = mongoose.model("ClickAnalytics", clickAnalyticsSchema);
