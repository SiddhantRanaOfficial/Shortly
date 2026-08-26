import { Router } from "express";
import {
  getOverallAnalytics,
  getUrlAnalytics
} from "../controllers/analytics.controller.js";
import { verifyJWT } from "../middlewares/auth.middleware.js";

const router = Router();

// All analytics endpoints require authentication
router.use(verifyJWT);

router.route("/overview").get(getOverallAnalytics);
router.route("/:shortCode").get(getUrlAnalytics);

export default router;
