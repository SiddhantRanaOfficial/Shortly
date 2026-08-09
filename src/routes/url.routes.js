import { Router } from "express";
import {
  createShortUrl,
  getUserUrls,
  getUrlDetails,
  updateUrl,
  deleteUrl,
  toggleUrlStatus,
  generateQrCode
} from "../controllers/url.controller.js";
import { verifyJWT, optionalAuth } from "../middlewares/auth.middleware.js";

const router = Router();

// Public & Optional Auth Routes
router.route("/").post(optionalAuth, createShortUrl);
router.route("/:shortCode/qr").get(generateQrCode);
router.route("/:shortCode").get(getUrlDetails);

// Secured Routes (require authentication)
router.route("/").get(verifyJWT, getUserUrls);
router.route("/:shortCode").patch(verifyJWT, updateUrl);
router.route("/:shortCode").delete(verifyJWT, deleteUrl);
router.route("/:shortCode/status").patch(verifyJWT, toggleUrlStatus);

export default router;
