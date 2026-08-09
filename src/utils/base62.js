import { customAlphabet } from "nanoid";

const BASE62_ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";

/**
 * Generate a collision-resistant random Base62 shortcode
 * @param {number} length - Desired code length (default: 7)
 */
export const generateShortCode = (length = 7) => {
  const nanoid = customAlphabet(BASE62_ALPHABET, length);
  return nanoid();
};

/**
 * Validate custom slug format (alphanumeric, hyphens, underscores, 3-30 chars)
 * @param {string} slug
 */
export const isValidSlug = (slug) => {
  const slugRegex = /^[a-zA-Z0-9_-]{3,30}$/;
  return slugRegex.test(slug);
};

/**
 * Validate standard URL format
 * @param {string} urlString
 */
export const isValidUrl = (urlString) => {
  try {
    const url = new URL(urlString);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch (_) {
    return false;
  }
};
