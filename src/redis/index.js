import Redis from "ioredis";
import { logger } from "../utils/logger.js";

/**
 * In-Memory Fallback Redis Mock for standalone development without Redis service
 */
class MemoryRedisMock {
  constructor() {
    this.store = new Map();
    this.ttls = new Map();
    this.isMock = true;
  }

  async get(key) {
    this._checkExpiry(key);
    return this.store.has(key) ? this.store.get(key) : null;
  }

  async set(key, value) {
    this.store.set(key, String(value));
    return "OK";
  }

  async setex(key, seconds, value) {
    this.store.set(key, String(value));
    this.ttls.set(key, Date.now() + seconds * 1000);
    return "OK";
  }

  async del(...keys) {
    let count = 0;
    for (const key of keys) {
      if (this.store.delete(key)) count++;
      this.ttls.delete(key);
    }
    return count;
  }

  async incr(key) {
    this._checkExpiry(key);
    const current = parseInt(this.store.get(key) || "0", 10);
    const next = current + 1;
    this.store.set(key, String(next));
    return next;
  }

  async expire(key, seconds) {
    if (this.store.has(key)) {
      this.ttls.set(key, Date.now() + seconds * 1000);
      return 1;
    }
    return 0;
  }

  async eval(script, numKeys, ...args) {
    // Sliding window script emulation
    const key = args[0];
    const now = parseInt(args[1], 10);
    const windowStart = parseInt(args[2], 10);
    const limit = parseInt(args[3], 10);
    const ttlSeconds = parseInt(args[4], 10);

    let logs = JSON.parse(this.store.get(key) || "[]");
    logs = logs.filter((ts) => ts > windowStart);

    if (logs.length >= limit) {
      return [0, limit - logs.length]; // Blocked
    }

    logs.push(now);
    this.store.set(key, JSON.stringify(logs));
    this.ttls.set(key, Date.now() + ttlSeconds * 1000);
    return [1, limit - logs.length]; // Allowed
  }

  _checkExpiry(key) {
    if (this.ttls.has(key) && Date.now() > this.ttls.get(key)) {
      this.store.delete(key);
      this.ttls.delete(key);
    }
  }

  on() {
    return this;
  }
}

let redisClient;

const initRedis = () => {
  const redisUri = process.env.REDIS_URI || "redis://127.0.0.1:6379";

  try {
    const client = new Redis(redisUri, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      retryStrategy(times) {
        if (times > 2) return null; // Stop retrying quickly to trigger fallback
        return Math.min(times * 100, 500);
      }
    });

    client.on("connect", () => {
      logger.success("Redis client connected successfully!");
    });

    client.on("error", (err) => {
      if (!redisClient || redisClient.isMock) return;
      logger.warn("Redis service not available. Switching to internal In-Memory Cache engine.");
      redisClient = new MemoryRedisMock();
    });

    // Attempt initial connection asynchronously
    client.connect().catch(() => {
      logger.warn("Redis connection failed. Utilizing In-Memory Fallback Engine.");
      redisClient = new MemoryRedisMock();
    });

    redisClient = client;
  } catch (err) {
    logger.warn("Error initializing Redis. Utilizing In-Memory Fallback Engine.");
    redisClient = new MemoryRedisMock();
  }

  return redisClient;
};

export const getRedisClient = () => {
  if (!redisClient) {
    redisClient = initRedis();
  }
  return redisClient;
};

export default getRedisClient;
