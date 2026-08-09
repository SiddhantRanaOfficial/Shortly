import request from "supertest";
import mongoose from "mongoose";
import { app } from "../src/app.js";
import { User } from "../src/models/user.model.js";
import { Url } from "../src/models/url.model.js";

describe("Stage 3: URL Lifecycle Integration Tests", () => {
  let authToken = "";
  let testUserId = "";

  beforeAll(async () => {
    const mongoUri = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017";
    await mongoose.connect(`${mongoUri}/shortly_test_url_db`);
    await User.deleteMany({});
    await Url.deleteMany({});

    // Create test user and obtain auth token
    const userRes = await request(app).post("/api/v1/auth/register").send({
      username: "urltester",
      email: "urltester@example.com",
      password: "Password123!"
    });

    testUserId = userRes.body.data._id;

    const loginRes = await request(app).post("/api/v1/auth/login").send({
      email: "urltester@example.com",
      password: "Password123!"
    });

    authToken = loginRes.body.data.accessToken;
  });

  afterAll(async () => {
    await User.deleteMany({});
    await Url.deleteMany({});
    await mongoose.connection.close();
  });

  let createdShortCode = "";

  it("should create a standard short URL (201)", async () => {
    const res = await request(app)
      .post("/api/v1/urls")
      .set("Authorization", `Bearer ${authToken}`)
      .send({
        originalUrl: "https://github.com/hiteshchoudhary/chai-backend"
      });

    expect(res.statusCode).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.shortCode).toBeDefined();
    expect(res.body.data.qrCode).toBeDefined();
    expect(res.body.data.originalUrl).toBe("https://github.com/hiteshchoudhary/chai-backend");

    createdShortCode = res.body.data.shortCode;
  });

  it("should create a URL with custom slug, expiration, and password (201)", async () => {
    const res = await request(app)
      .post("/api/v1/urls")
      .set("Authorization", `Bearer ${authToken}`)
      .send({
        originalUrl: "https://nodejs.org",
        customSlug: "my-custom-link",
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
        maxClicks: 50,
        password: "SecretPassword123!"
      });

    expect(res.statusCode).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.shortCode).toBe("my-custom-link");
    expect(res.body.data.hasPassword).toBe(true);
  });

  it("should reject duplicate custom slug (409)", async () => {
    const res = await request(app)
      .post("/api/v1/urls")
      .set("Authorization", `Bearer ${authToken}`)
      .send({
        originalUrl: "https://expressjs.com",
        customSlug: "my-custom-link"
      });

    expect(res.statusCode).toBe(409);
    expect(res.body.success).toBe(false);
  });

  it("should get user URLs with pagination (200)", async () => {
    const res = await request(app)
      .get("/api/v1/urls")
      .set("Authorization", `Bearer ${authToken}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.urls.length).toBe(2);
  });

  it("should update URL properties (200)", async () => {
    const res = await request(app)
      .patch(`/api/v1/urls/${createdShortCode}`)
      .set("Authorization", `Bearer ${authToken}`)
      .send({
        maxClicks: 100,
        isActive: false
      });

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.maxClicks).toBe(100);
    expect(res.body.data.isActive).toBe(false);
  });

  it("should generate QR code Data URL (200)", async () => {
    const res = await request(app).get(`/api/v1/urls/${createdShortCode}/qr`);

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.qrCode).toContain("data:image/png;base64");
  });

  it("should delete short URL (200)", async () => {
    const res = await request(app)
      .delete(`/api/v1/urls/${createdShortCode}`)
      .set("Authorization", `Bearer ${authToken}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
  });
});
