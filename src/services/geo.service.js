import useragent from "useragent";
import geoip from "geoip-lite";

class GeoService {
  /**
   * Extract visitor IP address from request headers or connection socket
   * @param {object} req 
   */
  static getClientIp(req) {
    const forwarded = req.headers["x-forwarded-for"];
    if (forwarded) {
      const ips = forwarded.split(",").map((ip) => ip.trim());
      return ips[0];
    }
    return req.ip || req.socket?.remoteAddress || "127.0.0.1";
  }

  /**
   * Parse User-Agent string to extract device category, browser, and OS
   * @param {string} userAgentString 
   */
  static parseUserAgent(userAgentString = "") {
    const agent = useragent.parse(userAgentString);

    let device = "Desktop";
    const uaLower = userAgentString.toLowerCase();

    if (/bot|crawler|spider|googlebot|bingbot/i.test(uaLower)) {
      device = "Bot";
    } else if (/ipad|tablet|playbook|silk/i.test(uaLower)) {
      device = "Tablet";
    } else if (/mobile|iphone|android|touch|webos|hpwos/i.test(uaLower)) {
      device = "Mobile";
    }

    return {
      device,
      browser: agent.family || "Unknown",
      os: agent.os.family || "Unknown"
    };
  }

  /**
   * Perform GeoIP lookup to find country and city
   * @param {string} ip 
   */
  static lookupGeo(ip) {
    // Handle localhost and private IPs
    if (!ip || ip === "127.0.0.1" || ip === "::1" || ip.startsWith("192.168.") || ip.startsWith("10.")) {
      return { country: "Localhost", city: "Internal" };
    }

    const geo = geoip.lookup(ip);
    if (!geo) {
      return { country: "Unknown", city: "Unknown" };
    }

    return {
      country: geo.country || "Unknown",
      city: geo.city || "Unknown"
    };
  }

  /**
   * Normalize Referrer header into human-readable source
   * @param {string} referrerHeader 
   */
  static parseReferrer(referrerHeader = "") {
    if (!referrerHeader || referrerHeader.trim() === "") {
      return "Direct";
    }

    try {
      const url = new URL(referrerHeader);
      const host = url.hostname.toLowerCase().replace(/^www\./, "");

      if (host.includes("google")) return "Google";
      if (host.includes("twitter") || host.includes("t.co") || host.includes("x.com")) return "Twitter / X";
      if (host.includes("linkedin")) return "LinkedIn";
      if (host.includes("github")) return "GitHub";
      if (host.includes("facebook") || host.includes("fb.com")) return "Facebook";
      if (host.includes("youtube")) return "YouTube";
      if (host.includes("reddit")) return "Reddit";

      return host;
    } catch (_) {
      return "Direct";
    }
  }

  /**
   * Aggregate visitor payload from Express request object
   * @param {object} req 
   */
  static extractVisitorMetadata(req) {
    const ip = this.getClientIp(req);
    const userAgentHeader = req.headers["user-agent"] || "";
    const referrerHeader = req.headers["referer"] || req.headers["referrer"] || "";

    const { device, browser, os } = this.parseUserAgent(userAgentHeader);
    const { country, city } = this.lookupGeo(ip);
    const referrer = this.parseReferrer(referrerHeader);

    return {
      ip,
      userAgent: userAgentHeader,
      device,
      browser,
      os,
      country,
      city,
      referrer
    };
  }
}

export default GeoService;
