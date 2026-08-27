import request from "supertest";
import mongoose from "mongoose";
import { app } from "../src/app.js";
import { User } from "../src/models/user.model.js";
import { Url } from "../src/models/url.model.js";

describe("Stage 5B: URL Safety & Smart Routing Integration Tests", () => {
  let authToken = "";

  beforeAll(async () => {
    const mongoUri = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017";
    await mongoose.connect(`${mongoUri}/shortly_test_smart_routing_db`);
    await User.deleteMany({});
    await Url.deleteMany({});

    // Register & Login User
    await request(app).post("/api/v1/auth/register").send({
      username: "smarttester",
      email: "smarttester@example.com",
      password: "Password123!"
    });

    const loginRes = await request(app).post("/api/v1/auth/login").send({
      email: "smarttester@example.com",
      password: "Password123!"
    });

    authToken = loginRes.body.data.accessToken;
  });

  afterAll(async () => {
    await User.deleteMany({});
    await Url.deleteMany({});
    await mongoose.connection.close();
  });

  describe("URL Safety & Loopback Protection", () => {
    it("should reject creation of localhost target URLs (400)", async () => {
      const res = await request(app)
        .post("/api/v1/urls")
        .set("Authorization", `Bearer ${authToken}`)
        .send({
          originalUrl: "http://localhost:8000/infinite-loop"
        });

      expect(res.statusCode).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain("Safety Check Failed");
    });

    it("should reject creation of 127.0.0.1 loopback target URLs (400)", async () => {
      const res = await request(app)
        .post("/api/v1/urls")
        .set("Authorization", `Bearer ${authToken}`)
        .send({
          originalUrl: "http://127.0.0.1/admin-panel"
        });

      expect(res.statusCode).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain("Safety Check Failed");
    });
  });

  describe("Smart Device & Geo-Targeted Routing", () => {
    it("should route Mobile visitor to device-targeted URL (302)", async () => {
      const createRes = await request(app)
        .post("/api/v1/urls")
        .set("Authorization", `Bearer ${authToken}`)
        .send({
          originalUrl: "https://example.com/default-desktop",
          customSlug: "smart-app-link",
          targetRules: [
            {
              type: "device",
              value: "Mobile",
              targetUrl: "https://example.com/mobile-app-store"
            }
          ]
        });

      expect(createRes.statusCode).toBe(201);

      // Desktop request -> Default URL
      const desktopRes = await request(app)
        .get("/smart-app-link")
        .set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64)");

      expect(desktopRes.statusCode).toBe(302);
      expect(desktopRes.headers.location).toBe("https://example.com/default-desktop");

      // Mobile request -> Device targeted URL
      const mobileRes = await request(app)
        .get("/smart-app-link")
        .set("User-Agent", "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) Mobile/15E148");

      expect(mobileRes.statusCode).toBe(302);
      expect(mobileRes.headers.location).toBe("https://example.com/mobile-app-store");
    });
  });
});
