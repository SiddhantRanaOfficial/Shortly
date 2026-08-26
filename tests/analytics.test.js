import request from "supertest";
import mongoose from "mongoose";
import { app } from "../src/app.js";
import { User } from "../src/models/user.model.js";
import { Url } from "../src/models/url.model.js";
import { ClickAnalytics } from "../src/models/analytics.model.js";
import analyticsQueue from "../src/services/analyticsQueue.service.js";

describe("Stage 5: Non-Blocking Analytics Pipeline Tests", () => {
  let authToken = "";
  let testShortCode = "analytics01";

  beforeAll(async () => {
    const mongoUri = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017";
    await mongoose.connect(`${mongoUri}/shortly_test_analytics_db`);
    await User.deleteMany({});
    await Url.deleteMany({});
    await ClickAnalytics.deleteMany({});

    // Register & Login user
    await request(app).post("/api/v1/auth/register").send({
      username: "analyticstester",
      email: "analyticstester@example.com",
      password: "Password123!"
    });

    const loginRes = await request(app).post("/api/v1/auth/login").send({
      email: "analyticstester@example.com",
      password: "Password123!"
    });

    authToken = loginRes.body.data.accessToken;

    // Create test short link owned by user
    await request(app)
      .post("/api/v1/urls")
      .set("Authorization", `Bearer ${authToken}`)
      .send({
        originalUrl: "https://example.com/analytics-target",
        customSlug: testShortCode
      });
  });

  afterAll(async () => {
    await User.deleteMany({});
    await Url.deleteMany({});
    await ClickAnalytics.deleteMany({});
    await mongoose.connection.close();
  });

  it("should record visitor clicks and push events to AnalyticsQueue (302)", async () => {
    const res1 = await request(app)
      .get(`/${testShortCode}`)
      .set("User-Agent", "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1")
      .set("Referer", "https://twitter.com/hitesh");

    expect(res1.statusCode).toBe(302);

    const res2 = await request(app)
      .get(`/${testShortCode}`)
      .set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36")
      .set("Referer", "https://google.com");

    expect(res2.statusCode).toBe(302);

    // Flush in-memory queue to DB manually for assertions
    await analyticsQueue.flush();

    const count = await ClickAnalytics.countDocuments({ shortCode: testShortCode });
    expect(count).toBe(2);
  });

  it("should fetch overall dashboard analytics overview (200)", async () => {
    const res = await request(app)
      .get("/api/v1/analytics/overview")
      .set("Authorization", `Bearer ${authToken}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.totalUrls).toBe(1);
    expect(res.body.data.totalClicks).toBeGreaterThanOrEqual(2);
  });

  it("should fetch detailed URL analytics breakdown (200)", async () => {
    const res = await request(app)
      .get(`/api/v1/analytics/${testShortCode}`)
      .set("Authorization", `Bearer ${authToken}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.url.shortCode).toBe(testShortCode);
    expect(res.body.data.devices.length).toBeGreaterThan(0);
    expect(res.body.data.referrers.length).toBeGreaterThan(0);
  });
});
