import request from "supertest";
import mongoose from "mongoose";
import { app } from "../src/app.js";
import { Url } from "../src/models/url.model.js";

describe("Stage 4: Redirection Engine & Redis Caching Tests", () => {
  beforeAll(async () => {
    const mongoUri = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017";
    await mongoose.connect(`${mongoUri}/shortly_test_redirect_db`);
    await Url.deleteMany({});
  });

  afterAll(async () => {
    await Url.deleteMany({});
    await mongoose.connection.close();
  });

  it("should perform HTTP 302 redirect for valid active short link (302)", async () => {
    const url = await Url.create({
      originalUrl: "https://example.com/target-page",
      shortCode: "red001",
      isActive: true
    });

    // First request: Cache Miss -> Populates Cache
    const res1 = await request(app).get("/red001");
    expect(res1.statusCode).toBe(302);
    expect(res1.headers.location).toBe("https://example.com/target-page");

    // Second request: Cache Hit (< 5ms performance path)
    const startTime = Date.now();
    const res2 = await request(app).get("/red001");
    const latency = Date.now() - startTime;

    expect(res2.statusCode).toBe(302);
    expect(res2.headers.location).toBe("https://example.com/target-page");
    expect(latency).toBeLessThan(50); // Under supertest test runner overhead
  });

  it("should reject redirection for inactive link (410)", async () => {
    await Url.create({
      originalUrl: "https://example.com/deactivated",
      shortCode: "inactive01",
      isActive: false
    });

    const res = await request(app).get("/inactive01");
    expect(res.statusCode).toBe(410);
    expect(res.body.message).toContain("deactivated");
  });

  it("should reject redirection for expired link (410)", async () => {
    await Url.create({
      originalUrl: "https://example.com/expired",
      shortCode: "expired01",
      expiresAt: new Date(Date.now() - 10000), // Expired 10 seconds ago
      isActive: true
    });

    const res = await request(app).get("/expired01");
    expect(res.statusCode).toBe(410);
    expect(res.body.message).toContain("expired");
  });

  it("should reject redirection when max clicks reached (410)", async () => {
    await Url.create({
      originalUrl: "https://example.com/max-clicks",
      shortCode: "maxclick01",
      maxClicks: 5,
      currentClicks: 5,
      isActive: true
    });

    const res = await request(app).get("/maxclick01");
    expect(res.statusCode).toBe(410);
    expect(res.body.message).toContain("maximum click limit");
  });

  it("should prompt for password on protected link without password (401)", async () => {
    await Url.create({
      originalUrl: "https://example.com/protected-page",
      shortCode: "secret01",
      password: "SuperSecretPassword123!",
      isActive: true
    });

    const res = await request(app)
      .get("/secret01")
      .set("Accept", "application/json");

    expect(res.statusCode).toBe(401);
    expect(res.body.message).toContain("Password required");
  });

  it("should redirect successfully when password query param is correct (302)", async () => {
    const res = await request(app).get("/secret01?p=SuperSecretPassword123!");
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe("https://example.com/protected-page");
  });
});
