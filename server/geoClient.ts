import { COUNTRIES, getCountryByCode, DEFAULT_COUNTRY_CODE } from "@shared/schema";

export interface GeoLookupResult {
  country: string; // ISO-2 code
  countryName: string;
  city: string | null;
  source: "ip-api" | "ipapi" | "fallback" | "header";
}

function normalizeCountry(code: string | null | undefined): string {
  if (!code) return DEFAULT_COUNTRY_CODE;
  const upper = code.toUpperCase();
  return getCountryByCode(upper) ? upper : DEFAULT_COUNTRY_CODE;
}

function pickCity(country: string, city: string | null | undefined): string | null {
  if (!city) {
    const entry = getCountryByCode(country);
    return entry?.cities[0] || null;
  }
  return city;
}

function unwrapMappedIpv6(ip: string): string {
  // ::ffff:1.2.3.4  or  ::ffff:0102:0304  → 1.2.3.4
  if (ip.startsWith("::ffff:")) return ip.slice(7);
  return ip;
}

export function getClientIp(req: any): string | null {
  const forwarded = req.headers?.["x-forwarded-for"];
  let raw: string | null = null;
  if (typeof forwarded === "string" && forwarded.length > 0) {
    raw = forwarded.split(",")[0].trim();
  } else {
    const real = req.headers?.["x-real-ip"];
    if (typeof real === "string") raw = real;
    else raw = req.ip || req.socket?.remoteAddress || null;
  }
  return raw ? unwrapMappedIpv6(raw) : null;
}

function isPrivateIp(ip: string): boolean {
  if (ip === "::1" || ip === "127.0.0.1" || ip === "0.0.0.0") return true;
  // IPv4 ranges
  if (ip.startsWith("10.") || ip.startsWith("192.168.")) return true;
  // 172.16.0.0 - 172.31.255.255
  const m = /^172\.(\d+)\./.exec(ip);
  if (m) {
    const n = parseInt(m[1], 10);
    if (n >= 16 && n <= 31) return true;
  }
  // Link-local IPv4
  if (ip.startsWith("169.254.")) return true;
  // IPv6 private/link-local
  if (ip.startsWith("fc") || ip.startsWith("fd") || ip.startsWith("fe80:")) return true;
  return false;
}

async function fetchWithTimeout(url: string, ms: number): Promise<Response | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ms);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    return res.ok ? res : null;
  } catch {
    return null;
  }
}

export async function lookupGeo(req: any): Promise<GeoLookupResult> {
  // Header-based hint (Cloudflare, Replit, etc.)
  const headerCountry = req.headers?.["cf-ipcountry"] || req.headers?.["x-vercel-ip-country"];
  if (typeof headerCountry === "string" && headerCountry.length === 2) {
    const country = normalizeCountry(headerCountry);
    return {
      country,
      countryName: getCountryByCode(country)?.name || country,
      city: pickCity(country, null),
      source: "header",
    };
  }

  const ip = getClientIp(req);
  if (!ip || isPrivateIp(ip)) {
    return {
      country: DEFAULT_COUNTRY_CODE,
      countryName: getCountryByCode(DEFAULT_COUNTRY_CODE)?.name || DEFAULT_COUNTRY_CODE,
      city: pickCity(DEFAULT_COUNTRY_CODE, null),
      source: "fallback",
    };
  }

  // Try ip-api.com (free, no key)
  try {
    const res = await fetchWithTimeout(`http://ip-api.com/json/${ip}?fields=status,country,countryCode,city`, 2500);
    if (res) {
      const data: any = await res.json();
      if (data?.status === "success" && data?.countryCode) {
        const country = normalizeCountry(data.countryCode);
        return {
          country,
          countryName: data.country || getCountryByCode(country)?.name || country,
          city: pickCity(country, data.city),
          source: "ip-api",
        };
      }
    }
  } catch {
    // ignore
  }

  // Fallback ipapi.co
  try {
    const res = await fetchWithTimeout(`https://ipapi.co/${ip}/json/`, 2500);
    if (res) {
      const data: any = await res.json();
      if (data?.country_code) {
        const country = normalizeCountry(data.country_code);
        return {
          country,
          countryName: data.country_name || getCountryByCode(country)?.name || country,
          city: pickCity(country, data.city),
          source: "ipapi",
        };
      }
    }
  } catch {
    // ignore
  }

  return {
    country: DEFAULT_COUNTRY_CODE,
    countryName: getCountryByCode(DEFAULT_COUNTRY_CODE)?.name || DEFAULT_COUNTRY_CODE,
    city: pickCity(DEFAULT_COUNTRY_CODE, null),
    source: "fallback",
  };
}

export { COUNTRIES };
