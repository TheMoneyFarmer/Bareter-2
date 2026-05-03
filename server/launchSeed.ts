import { db } from "./db";
import { users, listings } from "@shared/schema";
import { eq, and, inArray } from "drizzle-orm";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";

/**
 * One-shot, idempotent "launch seed" — populates production with a curated
 * set of realistic UAE listings spanning multiple categories and emirates so
 * the live homepage's Trending / Just-listed / Big-ticket rows are full from
 * day one.
 *
 * Two safety properties:
 *   1. Idempotent: every editorial user has a stable email and every editorial
 *      listing is keyed by a stable (userEmail, title) pair. Re-running the
 *      script never duplicates rows; it only inserts what is missing.
 *   2. Clearly labelled: every editorial listing has the `editorial` tag and
 *      a "Curated launch listing" line in the description so we never mislead
 *      a real trade partner.
 *
 * Run via `scripts/seed-launch.ts`, which gates execution behind explicit
 * env-var confirmation. Do NOT auto-invoke this from server boot.
 */

type SeedUser = {
  email: string;
  fullName: string;
  businessName: string;
  bio: string;
  city: string;
  avatarUrl: string;
  whatIOffer: { name: string; value: number }[];
  whatINeed: { name: string; value: number }[];
};

type SeedListing = {
  ownerEmail: string;
  type: "offer" | "request";
  title: string;
  description: string;
  categories: string[];
  retailValue: string;
  city: string;
  tags: string[];
  images: string[];
};

const EDITORIAL_PASSWORD_PLACEHOLDER = "Bareter-Editorial-Locked-2026!";

const SEED_USERS: SeedUser[] = [
  {
    email: "editorial@bareter.com",
    fullName: "Bareter Editorial",
    businessName: "Bareter Editorial Desk",
    bio: "Curated launch listings hand-picked by the Bareter team. Each listing represents a real category we expect to see active trades in. Reach out via support to claim or replace any listing posted under this account.",
    city: "Dubai",
    avatarUrl: "/images/seed/avatar-sarah.jpg",
    whatIOffer: [{ name: "Editorial Curation", value: 0 }],
    whatINeed: [{ name: "Real Listings From Verified Businesses", value: 0 }],
  },
  {
    email: "editorial.cars@bareter.com",
    fullName: "Editorial: Automotive",
    businessName: "Bareter Editorial — Automotive",
    bio: "Editorial listings showcasing the kind of automotive barters Bareter is built for. All listings under this account are curated by the Bareter team for launch.",
    city: "Dubai",
    avatarUrl: "/images/seed/avatar-rashid.jpg",
    whatIOffer: [{ name: "Curated Vehicle Showcases", value: 0 }],
    whatINeed: [{ name: "Verified Dealer Partners", value: 0 }],
  },
  {
    email: "editorial.realestate@bareter.com",
    fullName: "Editorial: Real Estate",
    businessName: "Bareter Editorial — Real Estate",
    bio: "Editorial real-estate listings curated by the Bareter team for launch. Replace with verified broker listings as the marketplace grows.",
    city: "Dubai",
    avatarUrl: "/images/seed/avatar-layla.jpg",
    whatIOffer: [{ name: "Curated Property Showcases", value: 0 }],
    whatINeed: [{ name: "Verified Broker Partners", value: 0 }],
  },
  {
    email: "editorial.hospitality@bareter.com",
    fullName: "Editorial: Hospitality",
    businessName: "Bareter Editorial — Hospitality",
    bio: "Editorial hospitality and F&B listings curated by the Bareter team for launch.",
    city: "Abu Dhabi",
    avatarUrl: "/images/seed/avatar-khalid.jpg",
    whatIOffer: [{ name: "Curated Hospitality Showcases", value: 0 }],
    whatINeed: [{ name: "Verified Hotel & Venue Partners", value: 0 }],
  },
  {
    email: "editorial.services@bareter.com",
    fullName: "Editorial: Services & Tech",
    businessName: "Bareter Editorial — Services",
    bio: "Editorial services and technology listings curated by the Bareter team for launch.",
    city: "Sharjah",
    avatarUrl: "/images/seed/avatar-omar.jpg",
    whatIOffer: [{ name: "Curated Services Showcases", value: 0 }],
    whatINeed: [{ name: "Verified Agency & SaaS Partners", value: 0 }],
  },
];

const EDITORIAL_NOTE =
  "\n\n— Curated launch listing posted by the Bareter editorial team. Contact support to claim or list a similar barter under your verified business account.";

const SEED_LISTINGS: SeedListing[] = [
  // ============== AUTOMOTIVE (Dubai) ==============
  {
    ownerEmail: "editorial.cars@bareter.com",
    type: "offer",
    title: "2023 Mercedes-AMG G63 — Trade for Property or Yacht Time",
    description:
      "Pristine 2023 G63 in Obsidian Black, 12,400 km, full service history at EMC. Open to barter against Dubai property, yacht charter packages, or a curated mix of luxury services.",
    categories: ["Automotive"],
    retailValue: "1150000.00",
    city: "Dubai",
    tags: ["editorial", "luxury", "suv", "amg", "mercedes"],
    images: ["/images/seed/car-mercedes-g63.jpg", "/images/seed/car-range-rover.jpg", "/images/seed/car-porsche-911.jpg"],
  },
  {
    ownerEmail: "editorial.cars@bareter.com",
    type: "offer",
    title: "Porsche 911 Carrera S — Open to Multi-Item Barter",
    description:
      "2022 Porsche 911 Carrera S, 18,000 km, GCC spec, immaculate condition. Looking for marina apartment, watch collection, or a combination of business services.",
    categories: ["Automotive"],
    retailValue: "620000.00",
    city: "Dubai",
    tags: ["editorial", "sports-car", "porsche", "911"],
    images: ["/images/seed/car-porsche-911.jpg", "/images/seed/car-mercedes-g63.jpg"],
  },
  {
    ownerEmail: "editorial.cars@bareter.com",
    type: "offer",
    title: "Range Rover Autobiography 2024 — Family SUV Barter",
    description:
      "2024 Range Rover Autobiography LWB, 8,000 km, fully loaded, GCC warranty. Will consider villa rental contracts, retail fit-out work, or premium tech equipment.",
    categories: ["Automotive"],
    retailValue: "950000.00",
    city: "Abu Dhabi",
    tags: ["editorial", "suv", "range-rover", "family"],
    images: ["/images/seed/car-range-rover.jpg", "/images/seed/car-mercedes-g63.jpg"],
  },
  {
    ownerEmail: "editorial.cars@bareter.com",
    type: "request",
    title: "Wanted: Toyota Land Cruiser 300 Series for Fleet Use",
    description:
      "Looking to acquire 2x Land Cruiser 300 GR Sport for our project fleet. Can offer construction project management, retail fit-out, or marketing services in exchange.",
    categories: ["Automotive"],
    retailValue: "750000.00",
    city: "Dubai",
    tags: ["editorial", "request", "land-cruiser", "fleet"],
    images: ["/images/seed/car-range-rover.jpg"],
  },

  // ============== REAL ESTATE (Dubai / Abu Dhabi / Sharjah) ==============
  {
    ownerEmail: "editorial.realestate@bareter.com",
    type: "offer",
    title: "Palm Jumeirah 4-Bedroom Villa — Open to Multi-Asset Barter",
    description:
      "Beachfront villa on the Palm, 650 sqm, fully furnished, private pool, direct beach access. Open to a barter package of luxury vehicles, yacht time, art, or commercial property.",
    categories: ["Real Estate"],
    retailValue: "12500000.00",
    city: "Dubai",
    tags: ["editorial", "villa", "palm-jumeirah", "beachfront"],
    images: ["/images/seed/villa-palm.jpg", "/images/seed/penthouse-saadiyat.jpg", "/images/seed/apartment-downtown.jpg"],
  },
  {
    ownerEmail: "editorial.realestate@bareter.com",
    type: "offer",
    title: "Downtown Dubai 2-Bed Apartment — Burj Khalifa View",
    description:
      "High-floor 2-bed apartment in the Burj Khalifa district, premium finishes, world-class amenities. Open to enterprise software work, technology consulting, or luxury vehicle barter.",
    categories: ["Real Estate"],
    retailValue: "3200000.00",
    city: "Dubai",
    tags: ["editorial", "apartment", "downtown", "burj-khalifa"],
    images: ["/images/seed/apartment-downtown.jpg", "/images/seed/villa-palm.jpg"],
  },
  {
    ownerEmail: "editorial.realestate@bareter.com",
    type: "offer",
    title: "Saadiyat Island Penthouse — Sea View, 3 Bedrooms",
    description:
      "Brand-new 3-bed penthouse on Saadiyat Island with full sea view, private terrace and pool access. Looking for yacht ownership, supercar, or a curated mix of services.",
    categories: ["Real Estate"],
    retailValue: "8500000.00",
    city: "Abu Dhabi",
    tags: ["editorial", "penthouse", "saadiyat", "sea-view"],
    images: ["/images/seed/penthouse-saadiyat.jpg", "/images/seed/villa-palm.jpg"],
  },
  {
    ownerEmail: "editorial.realestate@bareter.com",
    type: "offer",
    title: "Premium Office Floor in DIFC — 1-Year Lease Tradeable",
    description:
      "Furnished 450 sqm office floor in DIFC available on 1-year lease. Will trade against marketing campaigns, IT services, or hospitality packages of equivalent value.",
    categories: ["Real Estate", "Services"],
    retailValue: "850000.00",
    city: "Dubai",
    tags: ["editorial", "office", "difc", "commercial"],
    images: ["/images/seed/office-commercial.jpg", "/images/seed/coworking-space.jpg"],
  },
  {
    ownerEmail: "editorial.realestate@bareter.com",
    type: "offer",
    title: "Sharjah Al Majaz 3-Bed Apartment — Long-Term Lease Trade",
    description:
      "Modern 3-bed apartment in Al Majaz with corniche views. Owner is open to a 12-month lease in exchange for a mix of business services or premium retail merchandise.",
    categories: ["Real Estate"],
    retailValue: "180000.00",
    city: "Sharjah",
    tags: ["editorial", "apartment", "sharjah", "lease"],
    images: ["/images/seed/apartment-downtown.jpg"],
  },
  {
    ownerEmail: "editorial.realestate@bareter.com",
    type: "request",
    title: "Wanted: Warehouse Space in Jebel Ali for 6 Months",
    description:
      "Logistics company looking for 1,500 sqm warehouse in JAFZA for 6 months. Can offer freight services, last-mile delivery, or fleet leasing in exchange.",
    categories: ["Real Estate", "Services"],
    retailValue: "300000.00",
    city: "Dubai",
    tags: ["editorial", "request", "warehouse", "jebel-ali"],
    images: ["/images/seed/office-commercial.jpg"],
  },

  // ============== SERVICES (Marketing, Design, Events) ==============
  {
    ownerEmail: "editorial.services@bareter.com",
    type: "offer",
    title: "Full Brand Identity & Website Design Package",
    description:
      "Award-winning agency offering brand strategy, logo, full identity system, and a 10-page marketing site. Open to barter for hospitality stays, vehicle leases, or premium retail.",
    categories: ["Services"],
    retailValue: "85000.00",
    city: "Dubai",
    tags: ["editorial", "branding", "design", "agency"],
    images: ["/images/seed/service-tech.jpg", "/images/seed/listing-saas.jpg"],
  },
  {
    ownerEmail: "editorial.services@bareter.com",
    type: "offer",
    title: "Corporate Event Production for Up to 200 Guests",
    description:
      "Turnkey corporate event package: venue sourcing, AV, F&B coordination, on-site management. Suitable for product launches or annual conferences. Open to F&B, retail, or travel barters.",
    categories: ["Services", "Events"],
    retailValue: "120000.00",
    city: "Dubai",
    tags: ["editorial", "events", "corporate", "production"],
    images: ["/images/seed/listing-event-venue.jpg", "/images/seed/service-events.jpg"],
  },
  {
    ownerEmail: "editorial.services@bareter.com",
    type: "offer",
    title: "Luxury Brand Photography — 3-Day Production",
    description:
      "Full-service photography production for luxury brands: studio + outdoor, art direction, retouching, delivery within 14 days. Will barter for travel, hospitality, or fashion.",
    categories: ["Services"],
    retailValue: "45000.00",
    city: "Dubai",
    tags: ["editorial", "photography", "luxury", "creative"],
    images: ["/images/seed/listing-photography.jpg", "/images/seed/service-fashion.jpg"],
  },
  {
    ownerEmail: "editorial.services@bareter.com",
    type: "offer",
    title: "Interior Design — Restaurant or Boutique Fit-Out",
    description:
      "Concept-to-handover interior design for F&B or retail venues up to 350 sqm. Includes 3D visuals, materials sourcing, contractor coordination. Open to F&B credits, retail, or vehicles.",
    categories: ["Services", "Home"],
    retailValue: "180000.00",
    city: "Abu Dhabi",
    tags: ["editorial", "interior-design", "fit-out", "commercial"],
    images: ["/images/seed/showroom-fashion.jpg", "/images/seed/dining-private.jpg"],
  },
  {
    ownerEmail: "editorial.services@bareter.com",
    type: "request",
    title: "Wanted: Arabic + English Legal Translation, 200 Pages",
    description:
      "Need certified bilingual legal translation for ~200 pages of contracts and corporate documents. Can offer marketing services, design work, or web development in return.",
    categories: ["Services"],
    retailValue: "25000.00",
    city: "Sharjah",
    tags: ["editorial", "request", "translation", "legal"],
    images: ["/images/seed/service-tech.jpg"],
  },

  // ============== TECHNOLOGY / ELECTRONICS ==============
  {
    ownerEmail: "editorial.services@bareter.com",
    type: "offer",
    title: "1-Year Enterprise SaaS License — CRM + Workflow Suite",
    description:
      "Full enterprise license for our integrated CRM + workflow platform. Unlimited users, premium support, custom integrations included. Open to office space, hospitality, or marketing barters.",
    categories: ["Technology", "Services"],
    retailValue: "120000.00",
    city: "Sharjah",
    tags: ["editorial", "saas", "crm", "enterprise"],
    images: ["/images/seed/listing-saas.jpg", "/images/seed/service-tech.jpg"],
  },
  {
    ownerEmail: "editorial.services@bareter.com",
    type: "offer",
    title: "Bulk: 50× Apple MacBook Pro M3 (14-inch, 16GB/512GB)",
    description:
      "Authorised reseller offering a fleet bundle of 50 brand-new MacBook Pro M3 14-inch units, sealed boxes, full warranty. Open to commercial property, marketing services, or vehicle fleet.",
    categories: ["Technology"],
    retailValue: "475000.00",
    city: "Dubai",
    tags: ["editorial", "electronics", "apple", "macbook", "bulk"],
    images: ["/images/seed/service-tech.jpg", "/images/seed/listing-saas.jpg"],
  },
  {
    ownerEmail: "editorial.services@bareter.com",
    type: "offer",
    title: "AI Chatbot Implementation for Mid-Size Businesses",
    description:
      "Custom GPT-powered chatbot for customer support and lead qualification. Includes integration with WhatsApp, website, and CRM. Open to retail credits, F&B, or hospitality barters.",
    categories: ["Technology", "Services"],
    retailValue: "65000.00",
    city: "Dubai",
    tags: ["editorial", "ai", "chatbot", "automation"],
    images: ["/images/seed/ai-chatbot.jpg", "/images/seed/service-tech.jpg"],
  },

  // ============== HOSPITALITY ==============
  {
    ownerEmail: "editorial.hospitality@bareter.com",
    type: "offer",
    title: "5 Nights in a Marina Bay Luxury Suite (Dubai)",
    description:
      "5-star luxury suite stay in Dubai Marina, including breakfast, spa access, and airport transfers. Perfect for hosting VIP clients. Open to creative services, technology, or retail barters.",
    categories: ["Hospitality"],
    retailValue: "28000.00",
    city: "Dubai",
    tags: ["editorial", "hotel", "luxury", "marina"],
    images: ["/images/seed/listing-hotel.jpg", "/images/seed/hotel-suite.jpg"],
  },
  {
    ownerEmail: "editorial.hospitality@bareter.com",
    type: "offer",
    title: "Private Dining Experience for 12 — DIFC Restaurant",
    description:
      "Chef's table experience for 12 guests at our award-winning DIFC restaurant: 9-course tasting menu with paired beverages. Will barter for marketing, photography, or interior services.",
    categories: ["Hospitality"],
    retailValue: "18000.00",
    city: "Dubai",
    tags: ["editorial", "dining", "private", "chef"],
    images: ["/images/seed/dining-private.jpg", "/images/seed/catering-event.jpg"],
  },
  {
    ownerEmail: "editorial.hospitality@bareter.com",
    type: "offer",
    title: "Corporate Catering Credit — 3 Events, ~250 Guests",
    description:
      "Catering package covering up to 3 corporate events for ~250 guests total. Multi-cuisine menu, full service staff, on-site management. Open to design, technology, or fleet barters.",
    categories: ["Hospitality", "Services"],
    retailValue: "75000.00",
    city: "Abu Dhabi",
    tags: ["editorial", "catering", "corporate"],
    images: ["/images/seed/catering-event.jpg", "/images/seed/dining-private.jpg"],
  },
  {
    ownerEmail: "editorial.hospitality@bareter.com",
    type: "offer",
    title: "Ballroom Venue for Wedding or Conference (Sharjah)",
    description:
      "5-star ballroom venue in Sharjah for up to 300 guests. Includes setup, AV, and event coordination. Will barter for premium furniture, F&B supply contracts, or marketing services.",
    categories: ["Hospitality", "Events"],
    retailValue: "60000.00",
    city: "Sharjah",
    tags: ["editorial", "venue", "ballroom", "wedding"],
    images: ["/images/seed/listing-event-venue.jpg", "/images/seed/hotel-suite.jpg"],
  },

  // ============== YACHTS ==============
  {
    ownerEmail: "editorial.realestate@bareter.com",
    type: "offer",
    title: "Sunseeker 86 Yacht — 7-Day Charter, Fully Crewed",
    description:
      "Luxury 86ft Sunseeker available for a 7-day fully crewed charter from Dubai Marina. Includes crew, fuel allowance, and provisioning. Open to property, vehicle, or commercial-services barters.",
    categories: ["Yachts"],
    retailValue: "320000.00",
    city: "Dubai",
    tags: ["editorial", "yacht", "charter", "sunseeker"],
    images: ["/images/seed/yacht-sunseeker.jpg", "/images/seed/yacht-azimut.jpg"],
  },
  {
    ownerEmail: "editorial.realestate@bareter.com",
    type: "offer",
    title: "Azimut 60 — 12-Month Fractional Yacht Share",
    description:
      "12-month fractional ownership in our Azimut 60, including 30 charter days, full maintenance, and crew. Will barter for property, supercar, or premium services.",
    categories: ["Yachts"],
    retailValue: "850000.00",
    city: "Abu Dhabi",
    tags: ["editorial", "yacht", "fractional", "azimut"],
    images: ["/images/seed/yacht-azimut.jpg", "/images/seed/yacht-sunseeker.jpg"],
  },

  // ============== FASHION / RETAIL ==============
  {
    ownerEmail: "editorial.services@bareter.com",
    type: "offer",
    title: "Designer Abaya Capsule Collection — 10 Couture Pieces",
    description:
      "Hand-crafted couture abaya capsule collection (10 pieces) in premium Italian and Japanese fabrics. Suitable for boutique resale or VIP gifting. Open to photography, marketing, or hospitality barters.",
    categories: ["Services", "Home"],
    retailValue: "95000.00",
    city: "Sharjah",
    tags: ["editorial", "fashion", "abaya", "couture"],
    images: ["/images/seed/abaya-collection.jpg", "/images/seed/showroom-fashion.jpg"],
  },

  // ============== HEALTH & WELLNESS / WATCHES ==============
  {
    ownerEmail: "editorial.cars@bareter.com",
    type: "offer",
    title: "Patek Philippe Nautilus 5711 — Trade for Property or Cars",
    description:
      "Patek Philippe Nautilus 5711, full set, papers and original box, mint condition. Will trade against Dubai apartment, supercar, or a curated mix of business assets.",
    categories: ["Home"],
    retailValue: "650000.00",
    city: "Dubai",
    tags: ["editorial", "watch", "patek", "luxury"],
    images: ["/images/seed/watch-patek.jpg"],
  },
];

type LaunchSeedReport = {
  alreadySeeded: boolean;
  usersInserted: number;
  listingsInserted: number;
  listingsSkipped: number;
};

/**
 * Idempotently insert curated launch users + listings. Safe to re-run; only
 * inserts what is missing. Returns a structured report for the CLI to print.
 */
export async function runLaunchSeed(): Promise<LaunchSeedReport> {
  const seedEmails = SEED_USERS.map((u) => u.email);
  const existingUsers = await db
    .select()
    .from(users)
    .where(inArray(users.email, seedEmails));
  const existingByEmail = new Map(existingUsers.map((u) => [u.email, u]));

  const alreadySeeded = existingUsers.length === SEED_USERS.length;

  // 1. Insert any missing editorial users with a long random password (the
  //    accounts exist for ownership of listings — they are NOT meant to be
  //    logged into).
  let usersInserted = 0;
  for (const su of SEED_USERS) {
    if (existingByEmail.has(su.email)) continue;
    const randomPwd = `${EDITORIAL_PASSWORD_PLACEHOLDER}-${crypto
      .randomBytes(16)
      .toString("hex")}`;
    const passwordHash = await bcrypt.hash(randomPwd, 10);
    const [created] = await db
      .insert(users)
      .values({
        email: su.email,
        password: passwordHash,
        fullName: su.fullName,
        businessName: su.businessName,
        bio: su.bio,
        location: su.city,
        city: su.city,
        country: "AE",
        avatarUrl: su.avatarUrl,
        accountType: "business",
        whatIOffer: su.whatIOffer,
        whatINeed: su.whatINeed,
        profileCompleted: true,
        isVerified: true, // editorial accounts present as verified showcases
      })
      .returning();
    existingByEmail.set(created.email, created);
    usersInserted += 1;
  }

  // 2. For each curated listing, insert only if (ownerEmail, exact title) is
  //    not already present.
  let listingsInserted = 0;
  let listingsSkipped = 0;
  for (const sl of SEED_LISTINGS) {
    const owner = existingByEmail.get(sl.ownerEmail);
    if (!owner) {
      throw new Error(
        `Editorial owner ${sl.ownerEmail} missing — refusing to insert orphan listing "${sl.title}".`,
      );
    }
    const already = await db
      .select({ id: listings.id })
      .from(listings)
      .where(and(eq(listings.userId, owner.id), eq(listings.title, sl.title)))
      .limit(1);
    if (already.length > 0) {
      listingsSkipped += 1;
      continue;
    }
    await db.insert(listings).values({
      userId: owner.id,
      type: sl.type,
      title: sl.title,
      description: sl.description + EDITORIAL_NOTE,
      categories: sl.categories,
      retailValue: sl.retailValue,
      images: sl.images,
      location: sl.city,
      city: sl.city,
      country: "AE",
      tags: sl.tags,
      isActive: true,
      moderationStatus: "approved",
    });
    listingsInserted += 1;
  }

  return { alreadySeeded, usersInserted, listingsInserted, listingsSkipped };
}

export const __launchSeedStats = {
  totalUsers: SEED_USERS.length,
  totalListings: SEED_LISTINGS.length,
};
