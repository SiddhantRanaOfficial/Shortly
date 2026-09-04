import { Queue, Worker } from "bullmq";
import { ClickAnalytics } from "../models/analytics.model.js";
import getRedisClient from "../redis/index.js";
import { logger } from "../utils/logger.js";

/* -------------------------------------------------------------------------- */
/*  LEGACY IN-MEMORY QUEUE ARCHITECTURE (STAGE 5 PROTOTYPE)                  */
/* -------------------------------------------------------------------------- */
/*
// NOTE (Developer Learning Context):
// This was our original Stage 5 in-memory batch queue implementation using a local JavaScript array (this.queue = []).
// 
// WHY WE USED IT INITIALLY:
// - It allowed us to decouple HTTP redirect response latency from MongoDB disk writes.
// - It allowed pushing click data into RAM memory in 0.01ms (O(1) time complexity) so GET /:code redirects took < 5ms.
// - A 3-second setInterval timer flushed collected click records in bulk via ClickAnalytics.insertMany(batch).
//
// WHY WE UPGRADED FROM IN-MEMORY QUEUE TO BULLMQ:
// 1. Durability & Crash Safety: If the Node.js process crashes or restarts during deployments, any click events
//    sitting in RAM (this.queue = []) are lost forever. BullMQ persists jobs inside Redis data structures.
// 2. Horizontal Scalability: In-memory arrays are isolated per Node.js server instance. With 10 load-balanced web servers,
//    each server runs its own separate memory queue. BullMQ allows 10 web servers to push to 1 central Redis queue.
// 3. Worker Decoupling: Heavy database insertions can be offloaded to independent background worker processes.

const FLUSH_INTERVAL_MS = 3000; // Flush queue every 3 seconds
const BATCH_SIZE_THRESHOLD = 50; // Flush immediately if queue reaches 50 events

class LegacyInMemoryAnalyticsQueueService {
  constructor() {
    this.queue = [];
    this.timer = null;
    this.isFlushing = false;
    this.startAutoFlush();
  }

  push(clickData) {
    if (!clickData || !clickData.urlId || !clickData.shortCode) return;

    this.queue.push({
      ...clickData,
      timestamp: clickData.timestamp || new Date()
    });

    if (this.queue.length >= BATCH_SIZE_THRESHOLD) {
      this.flush();
    }
  }

  startAutoFlush() {
    if (this.timer) return;
    this.timer = setInterval(() => {
      this.flush();
    }, FLUSH_INTERVAL_MS);

    if (this.timer.unref) {
      this.timer.unref();
    }
  }

  async flush() {
    if (this.queue.length === 0 || this.isFlushing) return;

    this.isFlushing = true;
    const batch = [...this.queue];
    this.queue = [];

    try {
      await ClickAnalytics.insertMany(batch, { ordered: false });
    } catch (error) {
      logger.error("Failed to flush analytics batch to database:", error.message);
      if (batch.length < 500) {
        this.queue.unshift(...batch);
      }
    } finally {
      this.isFlushing = false;
    }
  }
}
*/

/* -------------------------------------------------------------------------- */
/*  ENTERPRISE BULLMQ REDIS-BACKED QUEUE PIPELINE                             */
/* -------------------------------------------------------------------------- */

const QUEUE_NAME = "analytics-click-queue";

const redisClient = getRedisClient();
const isMockRedis = Boolean(redisClient.isMock);

let clickQueue = null;
let clickWorker = null;
let fallbackBatch = [];

const redisConnectionOptions = {
  host: process.env.REDIS_URI ? new URL(process.env.REDIS_URI).hostname : "127.0.0.1",
  port: process.env.REDIS_URI ? parseInt(new URL(process.env.REDIS_URI).port || "6379", 10) : 6379,
  maxRetriesPerRequest: null,
  connectTimeout: 500
};

if (!isMockRedis) {
  try {
    // 1. Initialize BullMQ Job Queue (Producer side)
    clickQueue = new Queue(QUEUE_NAME, {
      connection: redisConnectionOptions,
      defaultJobOptions: {
        removeOnComplete: true,
        removeOnFail: 100,
        attempts: 3,
        backoff: { type: "exponential", delay: 1000 }
      }
    });

    // 2. Initialize BullMQ Worker (Consumer side)
    clickWorker = new Worker(
      QUEUE_NAME,
      async (job) => {
        const clickData = job.data;
        if (!clickData || !clickData.urlId || !clickData.shortCode) return;
        await ClickAnalytics.create(clickData);
      },
      {
        connection: redisConnectionOptions,
        concurrency: 5
      }
    );

    clickWorker.on("completed", (job) => {
      // Job processed successfully
    });

    clickWorker.on("failed", (job, err) => {
      logger.error(`BullMQ Analytics Job [${job?.id}] failed:`, err.message);
    });
  } catch (err) {
    logger.warn("Failed to initialize BullMQ worker. Operating in graceful fallback mode.");
  }
}

class BullMQAnalyticsService {
  /**
   * Push click data into BullMQ queue (or fallback buffer)
   * @param {object} clickData 
   */
  async push(clickData) {
    if (!clickData || !clickData.urlId || !clickData.shortCode) return;

    const payload = {
      ...clickData,
      urlId: String(clickData.urlId),
      timestamp: clickData.timestamp || new Date()
    };

    if (clickQueue && !isMockRedis) {
      try {
        await clickQueue.add("log-click", payload);
        return;
      } catch (err) {
        logger.warn("BullMQ queue push error, falling back to batch buffer:", err.message);
      }
    }

    // Fallback mode for environments running without live Redis
    fallbackBatch.push(payload);
    if (fallbackBatch.length >= 20) {
      await this.flush();
    }
  }

  /**
   * Flush pending analytics events (useful for tests or graceful shutdown)
   */
  async flush() {
    if (fallbackBatch.length === 0) return;
    const batch = [...fallbackBatch];
    fallbackBatch = [];

    try {
      await ClickAnalytics.insertMany(batch, { ordered: false });
    } catch (err) {
      logger.error("Error flushing fallback analytics batch:", err.message);
    }
  }
}

const analyticsQueue = new BullMQAnalyticsService();
export default analyticsQueue;
