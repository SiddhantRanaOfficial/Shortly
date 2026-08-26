import { ClickAnalytics } from "../models/analytics.model.js";
import { logger } from "../utils/logger.js";

const FLUSH_INTERVAL_MS = 3000; // Flush queue every 3 seconds
const BATCH_SIZE_THRESHOLD = 50; // Flush immediately if queue reaches 50 events

class AnalyticsQueueService {
  constructor() {
    this.queue = [];
    this.timer = null;
    this.isFlushing = false;
    this.startAutoFlush();
  }

  /**
   * Push click event into in-memory buffer without blocking execution
   * @param {object} clickData 
   */
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

  /**
   * Start periodic timer for automatic batch insertion
   */
  startAutoFlush() {
    if (this.timer) return;
    this.timer = setInterval(() => {
      this.flush();
    }, FLUSH_INTERVAL_MS);

    // Ensure timer doesn't prevent Node process exit
    if (this.timer.unref) {
      this.timer.unref();
    }
  }

  /**
   * Batch insert queued analytics events into MongoDB
   */
  async flush() {
    if (this.queue.length === 0 || this.isFlushing) return;

    this.isFlushing = true;
    const batch = [...this.queue];
    this.queue = [];

    try {
      await ClickAnalytics.insertMany(batch, { ordered: false });
    } catch (error) {
      logger.error("Failed to flush analytics batch to database:", error.message);
      // Re-queue failed events (up to a limit)
      if (batch.length < 500) {
        this.queue.unshift(...batch);
      }
    } finally {
      this.isFlushing = false;
    }
  }
}

// Export singleton instance
const analyticsQueue = new AnalyticsQueueService();
export default analyticsQueue;
