/**
 * URL Safety and Anti-Loopback Validation Utility
 */
export const validateUrlSafety = (urlString) => {
  if (!urlString || typeof urlString !== "string") {
    return { isSafe: false, reason: "URL string is required" };
  }

  try {
    const parsedUrl = new URL(urlString.trim());

    // 1. Enforce HTTP / HTTPS protocol
    if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
      return { isSafe: false, reason: "Only http:// and https:// protocols are permitted" };
    }

    const hostname = parsedUrl.hostname.toLowerCase();

    // 2. Block Localhost & Internal Loopback Addresses
    const loopbackHosts = ["localhost", "127.0.0.1", "0.0.0.0", "::1"];
    if (loopbackHosts.includes(hostname) || hostname.endsWith(".local") || hostname.endsWith(".internal")) {
      return { isSafe: false, reason: "Localhost and loopback target URLs are prohibited" };
    }

    // Block private IP ranges (192.168.x.x, 10.x.x.x, 172.16-31.x.x)
    if (/^192\.168\./.test(hostname) || /^10\./.test(hostname) || /^172\.(1[6-9]|2[0-9]|3[01])\./.test(hostname)) {
      return { isSafe: false, reason: "Private network IP target URLs are prohibited" };
    }

    // 3. Prevent Infinite Self-Referencing Shortener Loops
    const baseUrl = process.env.BASE_URL || "http://localhost:8000";
    try {
      const parsedBaseUrl = new URL(baseUrl);
      if (hostname === parsedBaseUrl.hostname.toLowerCase()) {
        return { isSafe: false, reason: "Cannot shorten a link pointing to Shortly domain (infinite loop prevention)" };
      }
    } catch (_) {}

    return { isSafe: true };
  } catch (err) {
    return { isSafe: false, reason: "Invalid URL syntax" };
  }
};
