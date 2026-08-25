import getRedisClient from "../redis/index.js";
import { logger } from "../utils/logger.js";

const CACHE_PREFIX = "shortly:url:";
const DEFAULT_TTL_SECONDS = 3600; // 1 hour default TTL

class CacheService {
  /**
   * Retrieve cached URL object by shortcode/slug
   * @param {string} code 
   */
  static async getUrl(code) {
    try {
      const redis = getRedisClient();
      const cachedData = await redis.get(`${CACHE_PREFIX}${code}`);
      if (cachedData) {
        return JSON.parse(cachedData);
      }
      return null;
    } catch (error) {
      logger.warn(`Redis getUrl error for code '${code}':`, error.message);
      return null; // Graceful degradation to DB lookup
    }
  }

  /**
   * Store URL object in Redis cache with TTL
   * @param {string} code 
   * @param {object} urlData 
   * @param {number} ttlInSeconds 
   */
  static async setUrl(code, urlData, ttlInSeconds = DEFAULT_TTL_SECONDS) {
    try {
      const redis = getRedisClient();
      const payload = JSON.stringify(urlData);
      await redis.setex(`${CACHE_PREFIX}${code}`, ttlInSeconds, payload);
    } catch (error) {
      logger.warn(`Redis setUrl error for code '${code}':`, error.message);
    }
  }

  /**
   * Remove cached URL object from Redis
   * @param {string} code 
   */
  static async invalidate(code) {
    try {
      const redis = getRedisClient();
      await redis.del(`${CACHE_PREFIX}${code}`);
    } catch (error) {
      logger.warn(`Redis invalidate error for code '${code}':`, error.message);
    }
  }
}

export default CacheService;
