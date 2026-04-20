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

export function getClientIp(req: any): string | null {
  const forwarded = req.headers?.["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.length > 0) {
    return forwarded.split(",")[0].trim();
  }
  const real = req.headers?.["x-real-ip"];
  if (typeof real === "string") return real;
  return req.ip || req.socket?.remoteAddress || null;
}

function isPrivateIp(ip: string): boolean {
  return (
    ip === "::1" ||
    ip === "127.0.0.1" ||
    ip.startsWith("10.") ||
    ip.startsWith("192.168.") ||
    ip.startsWith("172.") ||
    ip.startsWith("::ffff:")
  );
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
