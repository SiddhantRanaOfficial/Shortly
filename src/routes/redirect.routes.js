import { Router } from "express";
import {
  handleRedirect,
  handlePasswordSubmit,
  renderPasswordView
} from "../controllers/redirect.controller.js";

const router = Router();

// Password Challenge routes
router.route("/p/:code").get(renderPasswordView);
router.route("/p/:code").post(handlePasswordSubmit);

// High-Throughput Redirection root route (Must be attached last)
router.route("/:code").get(handleRedirect);

export default router;
