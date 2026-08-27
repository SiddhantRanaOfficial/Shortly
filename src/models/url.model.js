import mongoose, { Schema } from "mongoose";
import bcrypt from "bcryptjs";

const urlSchema = new Schema(
  {
    originalUrl: {
      type: String,
      required: [true, "Original URL is required"],
      trim: true
    },
    shortCode: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true
    },
    customSlug: {
      type: String,
      unique: true,
      sparse: true,
      trim: true,
      index: true
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true
    },
    expiresAt: {
      type: Date,
      default: null,
      index: true
    },
    maxClicks: {
      type: Number,
      default: 0 // 0 indicates unlimited clicks
    },
    currentClicks: {
      type: Number,
      default: 0
    },
    password: {
      type: String,
      default: null
    },
    isActive: {
      type: Boolean,
      default: true
    },
    utmParams: {
      source: { type: String, default: "" },
      medium: { type: String, default: "" },
      campaign: { type: String, default: "" },
      term: { type: String, default: "" },
      content: { type: String, default: "" }
    },
    targetRules: [
      {
        type: {
          type: String,
          enum: ["country", "device"],
          required: true
        },
        value: {
          type: String,
          required: true,
          trim: true
        },
        targetUrl: {
          type: String,
          required: true,
          trim: true
        }
      }
    ]
  },
  {
    timestamps: true
  }
);

// Hash password before saving if password is set/modified
urlSchema.pre("save", async function (next) {
  if (!this.isModified("password") || !this.password) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

// Compare password method
urlSchema.methods.isPasswordValid = async function (candidatePassword) {
  if (!this.password) return true;
  return await bcrypt.compare(candidatePassword, this.password);
};

// Check if link is expired
urlSchema.methods.isExpired = function () {
  if (!this.expiresAt) return false;
  return new Date() > new Date(this.expiresAt);
};

// Check if max click limit reached
urlSchema.methods.isClickLimitReached = function () {
  if (this.maxClicks <= 0) return false;
  return this.currentClicks >= this.maxClicks;
};

export const Url = mongoose.model("Url", urlSchema);
