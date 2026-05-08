import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, boolean, timestamp, decimal, jsonb, json, uniqueIndex, serial, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import type { DeliverableItem } from "./deliverables";

// Categories for listings
export const CATEGORIES = [
  "Hospitality",
  "Fashion",
  "Modeling",
  "SaaS",
  "Photography",
  "Services",
  "Food",
  "Legal",
  "Events",
  "Real Estate",
  "Automotive",
  "Health & Wellness",
  "Education",
  "Marketing",
  "Technology",
  "Consulting",
  "Design",
  "Entertainment",
] as const;

// Feed category tabs for the home feed
export const FEED_CATEGORIES = [
  "All",
  "Services & Skills",
  "Space & Office",
  "Food & Hospitality",
  "Assets & Vehicles",
  "Big Ticket",
  "Other",
] as const;

// Signup types
export const SIGNUP_TYPES = ["creator", "brand"] as const;

// Social platform types
export type SocialProfile = {
  platform: string;
  username: string;
  url?: string;
  followerCount?: number;
  categories?: string[];
};

// Post media types
export const POST_MEDIA_TYPES = ["image", "video", "reel"] as const;

// Post category subtypes
export const POST_SUBTYPES = {
  "Real Estate": ["House", "Apartment", "Villa", "Office Space", "Commercial"],
  "Vehicles": ["Car", "Motorcycle", "Yacht/Boat", "Truck/Van"],
  "Luxury Goods": ["Watches", "Jewelry", "Art", "Electronics"],
  "Services & Skills": [],
  "Food & Hospitality": [],
  "Space & Office": [],
  "Assets & Vehicles": [],
  "Big Ticket": [],
  "Other": [],
} as const;

// Structured detail types for high-value posts
export type RealEstateDetails = {
  propertyType?: string;
  bedrooms?: number;
  bathrooms?: number;
  squareMeters?: number;
  yearBuilt?: number;
  area?: string;
  amenities?: string[];
  ownershipStatus?: string;
  floorNumber?: number;
  viewType?: string;
  furnished?: boolean;
  mapsLink?: string;
};

export type VehicleDetails = {
  make?: string;
  model?: string;
  year?: number;
  mileage?: number;
  doors?: number;
  engineType?: string;
  engineCapacity?: string;
  transmission?: string;
  condition?: string;
  features?: string[];
  color?: string;
  registrationExpiry?: string;
  insuranceExpiry?: string;
  fuelEfficiency?: string;
  cabins?: number;
  hoursUsed?: number;
};

export type LuxuryGoodsDetails = {
  brand?: string;
  model?: string;
  year?: number;
  condition?: string;
  material?: string;
  features?: string[];
  boxAndPapers?: boolean;
  serialNumber?: string;
};

export type PostCategoryDetails = RealEstateDetails & VehicleDetails & LuxuryGoodsDetails;

// Locations (legacy UAE/GCC list - kept for backward compatibility)
export const LOCATIONS = [
  "Dubai",
  "Abu Dhabi",
  "Sharjah",
  "Ajman",
  "Ras Al Khaimah",
  "Fujairah",
  "Umm Al Quwain",
  "Riyadh",
  "Jeddah",
  "Doha",
  "Kuwait City",
  "Manama",
  "Muscat",
] as const;

// Worldwide countries with major cities (Marketplace-style global coverage)
export type CountryEntry = {
  code: string; // ISO-2 code
  name: string;
  flag: string; // emoji is NOT allowed in UI; we keep code only — UI uses lucide icons
  cities: string[];
};

export const COUNTRIES: CountryEntry[] = [
  { code: "AE", name: "United Arab Emirates", flag: "AE", cities: ["Dubai", "Abu Dhabi", "Sharjah", "Ajman", "Ras Al Khaimah", "Fujairah", "Umm Al Quwain", "Al Ain"] },
  { code: "SA", name: "Saudi Arabia", flag: "SA", cities: ["Riyadh", "Jeddah", "Mecca", "Medina", "Dammam", "Khobar"] },
  { code: "QA", name: "Qatar", flag: "QA", cities: ["Doha", "Al Rayyan", "Al Wakrah"] },
  { code: "KW", name: "Kuwait", flag: "KW", cities: ["Kuwait City", "Hawalli", "Salmiya"] },
  { code: "BH", name: "Bahrain", flag: "BH", cities: ["Manama", "Muharraq", "Riffa"] },
  { code: "OM", name: "Oman", flag: "OM", cities: ["Muscat", "Salalah", "Sohar"] },
  { code: "EG", name: "Egypt", flag: "EG", cities: ["Cairo", "Alexandria", "Giza"] },
  { code: "JO", name: "Jordan", flag: "JO", cities: ["Amman", "Zarqa", "Irbid"] },
  { code: "LB", name: "Lebanon", flag: "LB", cities: ["Beirut", "Tripoli", "Sidon"] },
  { code: "TR", name: "Turkey", flag: "TR", cities: ["Istanbul", "Ankara", "Izmir", "Antalya"] },
  { code: "GB", name: "United Kingdom", flag: "GB", cities: ["London", "Manchester", "Birmingham", "Edinburgh", "Glasgow"] },
  { code: "US", name: "United States", flag: "US", cities: ["New York", "Los Angeles", "Chicago", "Houston", "Miami", "San Francisco", "Seattle", "Boston", "Austin", "Dallas"] },
  { code: "CA", name: "Canada", flag: "CA", cities: ["Toronto", "Vancouver", "Montreal", "Calgary", "Ottawa"] },
  { code: "AU", name: "Australia", flag: "AU", cities: ["Sydney", "Melbourne", "Brisbane", "Perth"] },
  { code: "DE", name: "Germany", flag: "DE", cities: ["Berlin", "Munich", "Hamburg", "Frankfurt", "Cologne"] },
  { code: "FR", name: "France", flag: "FR", cities: ["Paris", "Lyon", "Marseille", "Nice"] },
  { code: "ES", name: "Spain", flag: "ES", cities: ["Madrid", "Barcelona", "Valencia", "Seville"] },
  { code: "IT", name: "Italy", flag: "IT", cities: ["Rome", "Milan", "Naples", "Florence"] },
  { code: "NL", name: "Netherlands", flag: "NL", cities: ["Amsterdam", "Rotterdam", "The Hague"] },
  { code: "CH", name: "Switzerland", flag: "CH", cities: ["Zurich", "Geneva", "Basel", "Bern"] },
  { code: "SE", name: "Sweden", flag: "SE", cities: ["Stockholm", "Gothenburg", "Malmo"] },
  { code: "IN", name: "India", flag: "IN", cities: ["Mumbai", "Delhi", "Bangalore", "Hyderabad", "Chennai", "Kolkata", "Pune"] },
  { code: "PK", name: "Pakistan", flag: "PK", cities: ["Karachi", "Lahore", "Islamabad"] },
  { code: "SG", name: "Singapore", flag: "SG", cities: ["Singapore"] },
  { code: "MY", name: "Malaysia", flag: "MY", cities: ["Kuala Lumpur", "Penang", "Johor Bahru"] },
  { code: "ID", name: "Indonesia", flag: "ID", cities: ["Jakarta", "Surabaya", "Bandung", "Bali"] },
  { code: "TH", name: "Thailand", flag: "TH", cities: ["Bangkok", "Chiang Mai", "Phuket"] },
  { code: "PH", name: "Philippines", flag: "PH", cities: ["Manila", "Cebu", "Davao"] },
  { code: "VN", name: "Vietnam", flag: "VN", cities: ["Ho Chi Minh City", "Hanoi", "Da Nang"] },
  { code: "JP", name: "Japan", flag: "JP", cities: ["Tokyo", "Osaka", "Kyoto", "Yokohama"] },
  { code: "KR", name: "South Korea", flag: "KR", cities: ["Seoul", "Busan", "Incheon"] },
  { code: "CN", name: "China", flag: "CN", cities: ["Beijing", "Shanghai", "Guangzhou", "Shenzhen", "Hong Kong"] },
  { code: "ZA", name: "South Africa", flag: "ZA", cities: ["Johannesburg", "Cape Town", "Durban"] },
  { code: "NG", name: "Nigeria", flag: "NG", cities: ["Lagos", "Abuja", "Kano"] },
  { code: "KE", name: "Kenya", flag: "KE", cities: ["Nairobi", "Mombasa"] },
  { code: "MA", name: "Morocco", flag: "MA", cities: ["Casablanca", "Rabat", "Marrakech"] },
  { code: "BR", name: "Brazil", flag: "BR", cities: ["Sao Paulo", "Rio de Janeiro", "Brasilia"] },
  { code: "MX", name: "Mexico", flag: "MX", cities: ["Mexico City", "Guadalajara", "Monterrey"] },
  { code: "AR", name: "Argentina", flag: "AR", cities: ["Buenos Aires", "Cordoba", "Rosario"] },
];

export function getCountryByCode(code: string | null | undefined): CountryEntry | undefined {
  if (!code) return undefined;
  return COUNTRIES.find((c) => c.code === code.toUpperCase());
}

export function getCitiesForCountry(code: string | null | undefined): string[] {
  return getCountryByCode(code)?.cities || [];
}

export const DEFAULT_COUNTRY_CODE = "AE";

// Deal states
export const DEAL_STATES = [
  "draft",
  "proposed",
  "accepted",
  "in_progress",
  "delivery_proof",
  "completed",
  "cancelled",
] as const;

// Offer/Need item with value
export type OfferNeedItem = {
  name: string;
  value: number; // in AED
  description?: string;
};

// Verification status constants
export const VERIFICATION_STATUSES = [
  "NOT_STARTED",
  "IN_PROGRESS", 
  "APPROVED",
  "DECLINED",
  "IN_REVIEW",
  "EXPIRED",
  "ABANDONED",
] as const;

// Account type for verification
export const ACCOUNT_TYPES = ["individual", "business"] as const;

// User roles
export const USER_ROLES = ["user", "admin", "super_admin"] as const;

// Users table
export const users = pgTable("users", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  email: text("email").notNull().unique(),
  password: text("password").notNull(),
  fullName: text("full_name").notNull(),
  bio: text("bio"),
  location: text("location"),
  country: text("country").default("AE"), // ISO-2 country code
  city: text("city"),
  locationPrompted: boolean("location_prompted").default(false),
  avatarUrl: text("avatar_url"),
  isVerified: boolean("is_verified").default(false),
  isAdmin: boolean("is_admin").default(false),
  role: text("role").default("user"), // user, admin, super_admin
  isBanned: boolean("is_banned").default(false),
  bannedAt: timestamp("banned_at"),
  bannedReason: text("banned_reason"),
  isPaused: boolean("is_paused").default(false),
  businessName: text("business_name"),
  businessLicenseUrl: text("business_license_url"),
  verificationDocUrl: text("verification_doc_url"),
  verificationStatus: text("verification_status").default("pending"), // pending, submitted, verified, rejected
  profileCompleted: boolean("profile_completed").default(false),
  onboardingCompleted: boolean("onboarding_completed").default(false),
  onboardingStep: integer("onboarding_step").default(1), // 1-4
  emailVerified: boolean("email_verified").default(false),
  emailVerificationToken: text("email_verification_token"),
  emailVerificationExpires: timestamp("email_verification_expires"),
  passwordResetToken: text("password_reset_token"),
  passwordResetExpires: timestamp("password_reset_expires"),
  whatIOffer: jsonb("what_i_offer").$type<OfferNeedItem[]>().default([]),
  whatINeed: jsonb("what_i_need").$type<OfferNeedItem[]>().default([]),
  portfolioImages: jsonb("portfolio_images").$type<string[]>().default([]),
  language: text("language").default("en"), // en, ar
  accountType: text("account_type").default("individual"), // individual or business
  kycStatus: text("kyc_status").default("NOT_STARTED"), // Didit KYC status
  kybStatus: text("kyb_status").default("NOT_STARTED"), // Didit KYB status  
  diditSessionId: text("didit_session_id"), // Current Didit verification session
  diditVerifiedAt: timestamp("didit_verified_at"), // When Didit verification was completed
  diditVerificationData: jsonb("didit_verification_data"), // Verification data from Didit
  
  // Notification Settings
  emailNotifications: boolean("email_notifications").default(true),
  dealNotifications: boolean("deal_notifications").default(true),
  messageNotifications: boolean("message_notifications").default(true),
  marketingEmails: boolean("marketing_emails").default(false),
  
  // Privacy Settings
  profileVisibility: text("profile_visibility").default("public"), // public, verified_only, private
  showEmail: boolean("show_email").default(false),
  showPhone: boolean("show_phone").default(false),
  allowDirectMessages: boolean("allow_direct_messages").default(true),
  
  // Trading Preferences
  preferredCategories: jsonb("preferred_categories").$type<string[]>().default([]),
  tradingRadius: integer("trading_radius").default(0), // 0 = unlimited, in km
  minTradeValue: decimal("min_trade_value", { precision: 12, scale: 2 }).default("0"),
  maxTradeValue: decimal("max_trade_value", { precision: 12, scale: 2 }),
  autoMatchEnabled: boolean("auto_match_enabled").default(true),
  
  // Contact Info
  phone: text("phone"),
  website: text("website"),
  socialLinks: jsonb("social_links").$type<{linkedin?: string; instagram?: string; twitter?: string}>(),
  
  // Display Settings
  timezone: text("timezone").default("Asia/Dubai"),
  currency: text("currency").default("AED"),

  // Referral System
  referralCode: text("referral_code").unique(),
  referredBy: varchar("referred_by", { length: 36 }),

  // Signup & Social
  signupType: text("signup_type").default("creator"),
  socialProfiles: jsonb("social_profiles").$type<SocialProfile[]>().default([]),

  // Trust & Credibility
  avgResponseTime: integer("avg_response_time").default(0),
  completionRate: decimal("completion_rate", { precision: 5, scale: 2 }).default("0"),
  credibilityScore: integer("credibility_score").default(0),
  totalCompletedDeals: integer("total_completed_deals").default(0),
  lastActiveAt: timestamp("last_active_at"),

  // Founder Badge (granted at signup if email matches a waitlist entry)
  founderBadge: boolean("founder_badge").default(false),
  founderBadgeAt: timestamp("founder_badge_at"),

  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  // Index used by the Didit webhook to look up the user for a given
  // verification session in O(log n) instead of scanning every row.
  diditSessionIdx: index("users_didit_session_id_idx").on(table.diditSessionId),
}));

// Waitlist entries (pre-launch email collection)
export const waitlistEntries = pgTable("waitlist_entries", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name"),
  country: text("country"),
  city: text("city"),
  accountType: text("account_type"),
  businessName: text("business_name"),
  categoriesOfInterest: jsonb("categories_of_interest").$type<string[]>().default([]),
  source: text("source"),
  referralCode: varchar("referral_code", { length: 16 }).notNull().unique(),
  referredByCode: varchar("referred_by_code", { length: 16 }),
  referralCount: integer("referral_count").default(0),
  position: integer("position").notNull(),
  founderBadgeReserved: boolean("founder_badge_reserved").default(true),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  confirmedAt: timestamp("confirmed_at"),
  convertedUserId: varchar("converted_user_id", { length: 36 }),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  refCodeIdx: index("waitlist_referral_code_idx").on(table.referralCode),
  refByIdx: index("waitlist_referred_by_idx").on(table.referredByCode),
  positionUniqueIdx: uniqueIndex("waitlist_position_unique_idx").on(table.position),
}));

// Exchange preference item with optional priority
export type ExchangeItem = {
  name: string;
  isPriority: boolean;
};

// Service tier for Fiverr-style packages
export type ServiceTier = {
  name: string;
  description: string;
  value: number;
  deliverables: string[];
};

// Item condition options
export const ITEM_CONDITIONS = [
  "new",
  "like_new",
  "excellent",
  "good",
  "fair",
  "refurbished",
] as const;

// Saved search filters type
export type SavedSearchFilters = {
  query?: string;
  categories?: string[];
  location?: string;
  condition?: string;
  minValue?: number;
  maxValue?: number;
  type?: string;
};

// Listings table
export const listings = pgTable("listings", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id", { length: 36 }).notNull().references(() => users.id),
  type: text("type").notNull(), // "offer" or "request"
  title: text("title").notNull(),
  description: text("description").notNull(),
  categories: jsonb("categories").$type<string[]>().default([]),
  retailValue: decimal("retail_value", { precision: 12, scale: 2 }).notNull(),
  images: jsonb("images").$type<string[]>().default([]),
  location: text("location"),
  country: text("country"),
  city: text("city"),
  tags: jsonb("tags").$type<string[]>().default([]),
  isActive: boolean("is_active").default(true),
  viewCount: integer("view_count").default(0),
  // Exchange preferences - what the lister wants in return
  wantedCategories: jsonb("wanted_categories").$type<string[]>().default([]),
  exchangeItems: jsonb("exchange_items").$type<ExchangeItem[]>().default([]),
  openToOffers: boolean("open_to_offers").default(true),
  categoryDetails: jsonb("category_details").$type<Record<string, string | number>>(),
  condition: text("condition").default("like_new"),
  serviceTiers: jsonb("service_tiers").$type<ServiceTier[]>(),
  likeCount: integer("like_count").default(0),
  valueFlagged: boolean("value_flagged").default(false),
  imageFlagged: boolean("image_flagged").default(false),
  moderationStatus: text("moderation_status").default("pending"), // "pending", "approved", "flagged", "rejected"
  aiMatchScore: decimal("ai_match_score", { precision: 5, scale: 2 }),
  isFeatured: boolean("is_featured").default(false),
  featuredUntil: timestamp("featured_until"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Banned emails table - prevents re-registration of banned users
export const bannedEmails = pgTable("banned_emails", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  email: text("email").notNull().unique(),
  bannedBy: varchar("banned_by", { length: 36 }).references(() => users.id),
  reason: text("reason"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Deals table
export const deals = pgTable("deals", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  dealNumber: text("deal_number").notNull().unique(),
  seekerId: varchar("seeker_id", { length: 36 }).notNull().references(() => users.id),
  providerId: varchar("provider_id", { length: 36 }).notNull().references(() => users.id),
  seekerListingId: varchar("seeker_listing_id", { length: 36 }).references(() => listings.id),
  providerListingId: varchar("provider_listing_id", { length: 36 }).references(() => listings.id),
  seekerOffer: text("seeker_offer").notNull(),
  seekerValue: decimal("seeker_value", { precision: 12, scale: 2 }).notNull(),
  providerOffer: text("provider_offer").notNull(),
  providerValue: decimal("provider_value", { precision: 12, scale: 2 }).notNull(),
  state: text("state").notNull().default("draft"),
  timeline: text("timeline"),
  deliverables: jsonb("deliverables").$type<DeliverableItem[]>(),
  penalties: text("penalties"),
  seekerProofUrl: text("seeker_proof_url"),
  providerProofUrl: text("provider_proof_url"),
  seekerCompleted: boolean("seeker_completed").default(false),
  providerCompleted: boolean("provider_completed").default(false),
  contractPdfUrl: text("contract_pdf_url"),
  proposedAt: timestamp("proposed_at"),
  acceptedAt: timestamp("accepted_at"),
  completedAt: timestamp("completed_at"),
  cancelledAt: timestamp("cancelled_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Messages table for deal chat
export const messages = pgTable("messages", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  dealId: varchar("deal_id", { length: 36 }).notNull().references(() => deals.id),
  senderId: varchar("sender_id", { length: 36 }).notNull().references(() => users.id),
  content: text("content").notNull(),
  isRead: boolean("is_read").default(false),
  isOffPlatform: boolean("is_off_platform").default(false),
  warning: text("warning"), // "off_platform" | "cash_price" | null — set by server-side regex
  createdAt: timestamp("created_at").defaultNow(),
});

// Ratings table
export const ratings = pgTable("ratings", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  dealId: varchar("deal_id", { length: 36 }).notNull().references(() => deals.id),
  fromUserId: varchar("from_user_id", { length: 36 }).notNull().references(() => users.id),
  toUserId: varchar("to_user_id", { length: 36 }).notNull().references(() => users.id),
  score: integer("score").notNull(), // 1-5
  review: text("review"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Notifications table
export const notifications = pgTable("notifications", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id", { length: 36 }).notNull().references(() => users.id),
  type: text("type").notNull(), // "deal_update", "message", "rating", etc.
  title: text("title").notNull(),
  message: text("message").notNull(),
  relatedDealId: varchar("related_deal_id", { length: 36 }).references(() => deals.id),
  isRead: boolean("is_read").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

// Followers table for user following
export const followers = pgTable("followers", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  followerId: varchar("follower_id", { length: 36 }).notNull().references(() => users.id),
  followingId: varchar("following_id", { length: 36 }).notNull().references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
});

// Referrals table
export const referrals = pgTable("referrals", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  referrerId: varchar("referrer_id", { length: 36 }).notNull().references(() => users.id),
  referredId: varchar("referred_id", { length: 36 }).notNull().references(() => users.id),
  referrerFeeWaived: boolean("referrer_fee_waived").default(false),
  referredFeeWaived: boolean("referred_fee_waived").default(false),
  referrerDealId: varchar("referrer_deal_id", { length: 36 }).references(() => deals.id),
  referredDealId: varchar("referred_deal_id", { length: 36 }).references(() => deals.id),
  createdAt: timestamp("created_at").defaultNow(),
});

// Wishlists table
export const wishlists = pgTable("wishlists", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id", { length: 36 }).notNull().references(() => users.id),
  listingId: varchar("listing_id", { length: 36 }).notNull().references(() => listings.id),
  createdAt: timestamp("created_at").defaultNow(),
});

// Posts table for Instagram-style feed
export const posts = pgTable("posts", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id", { length: 36 }).notNull().references(() => users.id),
  title: text("title"),
  postType: text("post_type").default("offer"),
  caption: text("caption").notNull(),
  mediaUrls: jsonb("media_urls").$type<string[]>().default([]),
  mediaType: text("media_type").default("image"),
  offerItems: jsonb("offer_items").$type<OfferNeedItem[]>().default([]),
  wantItems: jsonb("want_items").$type<OfferNeedItem[]>().default([]),
  declaredValue: decimal("declared_value", { precision: 12, scale: 2 }),
  hashtags: jsonb("hashtags").$type<string[]>().default([]),
  feedCategory: text("feed_category").default("Other"),
  subCategory: text("sub_category"),
  categoryDetails: jsonb("category_details").$type<PostCategoryDetails>(),
  marketValuation: text("market_valuation"),
  location: text("location"),
  country: text("country"),
  city: text("city"),
  condition: text("condition"),
  videoUrl: text("video_url"),
  taggedUserIds: jsonb("tagged_user_ids").$type<string[]>().default([]),
  isFeatured: boolean("is_featured").default(false),
  featuredUntil: timestamp("featured_until"),
  isStory: boolean("is_story").default(false),
  expiresAt: timestamp("expires_at"),
  likeCount: integer("like_count").default(0),
  moderationStatus: text("moderation_status").default("pending"), // "pending", "approved", "flagged", "rejected"
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

// Post likes table
export const postLikes = pgTable("post_likes", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  postId: varchar("post_id", { length: 36 }).notNull().references(() => posts.id),
  userId: varchar("user_id", { length: 36 }).notNull().references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
});

// Post comments / barter proposals table
export const postComments = pgTable("post_comments", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  postId: varchar("post_id", { length: 36 }).notNull().references(() => posts.id),
  userId: varchar("user_id", { length: 36 }).notNull().references(() => users.id),
  content: text("content"),
  offerItemName: varchar("offer_item_name", { length: 255 }).notNull(),
  offerItemValue: decimal("offer_item_value", { precision: 12, scale: 2 }).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

// Post bookmarks/saves table
export const postBookmarks = pgTable("post_bookmarks", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  postId: varchar("post_id", { length: 36 }).notNull().references(() => posts.id),
  userId: varchar("user_id", { length: 36 }).notNull().references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
});

// Endorsements table - peer endorsements for skills/specialties
export const endorsements = pgTable("endorsements", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  fromUserId: varchar("from_user_id", { length: 36 }).notNull().references(() => users.id),
  toUserId: varchar("to_user_id", { length: 36 }).notNull().references(() => users.id),
  skill: text("skill").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

// Saved searches table
export const savedSearches = pgTable("saved_searches", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id", { length: 36 }).notNull().references(() => users.id),
  name: text("name").notNull(),
  filters: jsonb("filters").$type<SavedSearchFilters>().notNull(),
  notifyEnabled: boolean("notify_enabled").default(true),
  lastNotifiedAt: timestamp("last_notified_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Deal milestones table - Fiverr-style order milestones
export const dealMilestones = pgTable("deal_milestones", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  dealId: varchar("deal_id", { length: 36 }).notNull().references(() => deals.id),
  title: text("title").notNull(),
  description: text("description"),
  sortOrder: integer("sort_order").notNull().default(0),
  isCompleted: boolean("is_completed").default(false),
  completedAt: timestamp("completed_at"),
  completedBy: varchar("completed_by", { length: 36 }).references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
});

// Portfolio items table - showcase completed barters
export const portfolioItems = pgTable("portfolio_items", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id", { length: 36 }).notNull().references(() => users.id),
  title: text("title").notNull(),
  description: text("description"),
  images: jsonb("images").$type<string[]>().default([]),
  dealId: varchar("deal_id", { length: 36 }).references(() => deals.id),
  category: text("category"),
  barterValue: decimal("barter_value", { precision: 12, scale: 2 }),
  createdAt: timestamp("created_at").defaultNow(),
});

// Quick inquiries - "Is this still available?" messages
export const quickInquiries = pgTable("quick_inquiries", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  fromUserId: varchar("from_user_id", { length: 36 }).notNull().references(() => users.id),
  toUserId: varchar("to_user_id", { length: 36 }).notNull().references(() => users.id),
  listingId: varchar("listing_id", { length: 36 }).references(() => listings.id),
  postId: varchar("post_id", { length: 36 }).references(() => posts.id),
  message: text("message").notNull().default("Is this still available?"),
  reply: text("reply"),
  isRead: boolean("is_read").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

// Listing likes table
export const listingLikes = pgTable("listing_likes", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  listingId: varchar("listing_id", { length: 36 }).notNull().references(() => listings.id),
  userId: varchar("user_id", { length: 36 }).notNull().references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  uniqueIndex("listing_likes_unique").on(table.listingId, table.userId),
]);

// Listing comments / barter proposals table
export const listingComments = pgTable("listing_comments", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  listingId: varchar("listing_id", { length: 36 }).notNull().references(() => listings.id),
  userId: varchar("user_id", { length: 36 }).notNull().references(() => users.id),
  content: text("content"),
  offerItemName: varchar("offer_item_name", { length: 255 }).notNull(),
  offerItemValue: decimal("offer_item_value", { precision: 12, scale: 2 }).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

// Reports table (scam/abuse reports)
export const reports = pgTable("reports", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  reporterId: varchar("reporter_id", { length: 36 }).notNull().references(() => users.id),
  targetType: text("target_type").notNull(), // "listing", "post", "deal", "user"
  targetId: varchar("target_id", { length: 36 }).notNull(),
  reason: text("reason").notNull(), // "scam", "fake_item", "misleading_value", "spam", "other"
  notes: text("notes"),
  status: text("status").notNull().default("pending"), // "pending", "dismissed", "actioned"
  createdAt: timestamp("created_at").defaultNow(),
});

// Image scans table
export const imageScans = pgTable("image_scans", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  imageUrl: text("image_url").notNull(),
  listingId: varchar("listing_id", { length: 36 }).references(() => listings.id),
  flagged: boolean("flagged").default(false),
  reason: text("reason"),
  createdAt: timestamp("created_at").defaultNow(),
});

// AI Agent tables

// Moderation logs - tracks AI moderation decisions
export const moderationLogs = pgTable("moderation_logs", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  targetType: text("target_type").notNull(), // "listing", "post", "message"
  targetId: varchar("target_id", { length: 36 }).notNull(),
  action: text("action").notNull(), // "approved", "flagged", "rejected"
  reason: text("reason"),
  confidence: decimal("confidence", { precision: 5, scale: 2 }),
  rawResponse: jsonb("raw_response"),
  reviewedByAdmin: boolean("reviewed_by_admin").default(false),
  adminUserId: varchar("admin_user_id", { length: 36 }),
  createdAt: timestamp("created_at").defaultNow(),
});

// Agent interactions - tracks all AI agent conversations
export const agentInteractions = pgTable("agent_interactions", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id", { length: 36 }).references(() => users.id),
  agentType: text("agent_type").notNull(), // "moderation", "support", "matching", "valuation", "engagement", "admin"
  userMessage: text("user_message"),
  agentResponse: text("agent_response"),
  metadata: jsonb("metadata"),
  tokensUsed: integer("tokens_used").default(0),
  createdAt: timestamp("created_at").defaultNow(),
});

// connect-pg-simple session table — declared so `db:push --force` doesn't drop it.
// Generic key/value store for runtime-tunable application settings the
// admins can change without a code release (e.g. the public waitlist
// position offset). Keep this table small and intentional — it is not a
// dumping ground; each key has a typed accessor on the storage layer.
export const appSettings = pgTable("app_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  updatedBy: varchar("updated_by", { length: 36 }),
});
export type AppSetting = typeof appSettings.$inferSelect;

// Structured body of a legal page. Mirrors what `LegalDocPage` renders
// (h2/h3/p/ul). Stored as jsonb in `legal_pages.blocks` so we can keep a
// single typed shape across the DB, the API, and the React renderer.
export type LegalBlock =
  | { type: "h2"; text: string }
  | { type: "h3"; text: string }
  | { type: "p"; text: string }
  | { type: "ul"; items: string[] };

// Legal pages — admin-editable copies of the public-facing legal pack
// (Privacy, Terms, Barter Rules, etc.). One row per (slug, language) so the
// same document can carry an English and Arabic version side by side. The
// canonical structured body lives in `blocks` (the same LegalBlock[] shape
// the LegalDocPage already renders), and the admin UI bumps `version` /
// `effectiveDate` whenever a published copy changes.
export const legalPages = pgTable("legal_pages", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  slug: text("slug").notNull(),                      // 'privacy' | 'terms' | …
  language: text("language").notNull(),              // 'en' | 'ar'
  title: text("title").notNull(),
  subtitle: text("subtitle").notNull().default(""),
  blocks: jsonb("blocks").$type<LegalBlock[]>().notNull(),
  effectiveDate: text("effective_date").notNull(),   // human-readable, e.g. '3 May 2026'
  version: integer("version").notNull().default(1),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  updatedBy: varchar("updated_by", { length: 36 }),
}, (table) => ({
  slugLangUnique: uniqueIndex("legal_pages_slug_language_unique").on(
    table.slug, table.language,
  ),
}));
export type LegalPage = typeof legalPages.$inferSelect;
export const insertLegalPageSchema = createInsertSchema(legalPages).omit({
  id: true,
  updatedAt: true,
});
export type InsertLegalPage = z.infer<typeof insertLegalPageSchema>;

// Audit history for legal pages — every publish of a (slug, language) row
// snapshots the prior state here so admins/legal can see what changed and
// when. We keep this append-only; the live row in `legal_pages` is always
// the latest published version.
export const legalPageVersions = pgTable("legal_page_versions", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  slug: text("slug").notNull(),
  language: text("language").notNull(),
  version: integer("version").notNull(),
  title: text("title").notNull(),
  subtitle: text("subtitle").notNull().default(""),
  blocks: jsonb("blocks").$type<LegalBlock[]>().notNull(),
  effectiveDate: text("effective_date").notNull(),
  publishedAt: timestamp("published_at").notNull().defaultNow(),
  publishedBy: varchar("published_by", { length: 36 }),
}, (table) => ({
  slugLangVersionUnique: uniqueIndex("legal_page_versions_slug_language_version_unique").on(
    table.slug, table.language, table.version,
  ),
  slugLangIdx: index("legal_page_versions_slug_language_idx").on(table.slug, table.language),
}));
export type LegalPageVersion = typeof legalPageVersions.$inferSelect;

// Cookie consent — current policy version. Bump this whenever the cookie
// policy / Cookie Policy doc changes meaningfully. The frontend banner
// re-prompts any user whose stored consent record is for an older
// version, and the server stamps the version into every consent_logs
// row so an auditor can see which policy text the user actually agreed
// to.
export const COOKIE_POLICY_VERSION = 1;

export const COOKIE_CONSENT_DECISIONS = [
  "accept_all",
  "reject_non_essential",
  "custom",
] as const;
export type CookieConsentDecision = (typeof COOKIE_CONSENT_DECISIONS)[number];

// One row per consent decision. Append-only — never updated, never deleted.
// `userId` is set when a logged-in user makes the choice; `anonymousId` is
// a UUID minted in localStorage for unauthenticated visitors so we can
// still tie a decision back to a single browser. At least one of the two
// is required (enforced at the API layer).
export const consentLogs = pgTable("consent_logs", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id", { length: 36 }).references(() => users.id),
  anonymousId: varchar("anonymous_id", { length: 64 }),
  policyVersion: integer("policy_version").notNull(),
  decision: text("decision").notNull(), // accept_all | reject_non_essential | custom
  essential: boolean("essential").notNull().default(true),
  analytics: boolean("analytics").notNull().default(false),
  marketing: boolean("marketing").notNull().default(false),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  userIdIdx: index("consent_logs_user_id_idx").on(table.userId),
  anonIdIdx: index("consent_logs_anonymous_id_idx").on(table.anonymousId),
  createdAtIdx: index("consent_logs_created_at_idx").on(table.createdAt),
}));
export type ConsentLog = typeof consentLogs.$inferSelect;

export const insertConsentLogSchema = createInsertSchema(consentLogs).omit({
  id: true,
  createdAt: true,
});
export type InsertConsentLog = z.infer<typeof insertConsentLogSchema>;

// Public payload the cookie banner POSTs to /api/consent. The server
// always stamps the *current* `COOKIE_POLICY_VERSION` itself (so the
// audit log can never disagree with the deployed policy text);
// `policyVersion` is therefore optional in the request and treated as
// informational only — useful for diagnosing stale clients that haven't
// reloaded since a policy bump. Server adds userId / anonymousId / IP /
// user-agent / timestamp.
export const consentRequestSchema = z.object({
  decision: z.enum(COOKIE_CONSENT_DECISIONS),
  analytics: z.boolean(),
  marketing: z.boolean(),
  policyVersion: z.number().int().positive().optional(),
  anonymousId: z.string().min(8).max(64).optional(),
});
export type ConsentRequest = z.infer<typeof consentRequestSchema>;

export const sessionTable = pgTable("session", {
  sid: varchar("sid").primaryKey(),
  sess: json("sess").notNull(),
  expire: timestamp("expire", { precision: 6, mode: "date" }).notNull(),
}, (table) => ({
  expireIdx: index("IDX_session_expire").on(table.expire),
}));

// Company OS logs - per-LLM-call tracking for the WhatsApp Manager Agent.
// Used by the cost tracker to enforce the monthly AED budget and by the
// /api/company-os/logs admin endpoint for visibility.
export const companyOsLogs = pgTable("company_os_logs", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  agentName: text("agent_name").notNull(), // "manager", "finance", "scheduler", etc.
  command: text("command"), // hard-coded command name or "freeform"
  inputPreview: text("input_preview"), // truncated user message (no PII beyond what they sent)
  outputPreview: text("output_preview"), // truncated agent response
  model: text("model"), // e.g. "gpt-4o-mini"
  tokensUsed: integer("tokens_used").default(0),
  costAed: decimal("cost_aed", { precision: 10, scale: 6 }).default("0"),
  status: text("status").notNull().default("ok"), // "ok", "error", "blocked_budget"
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  createdAtIdx: index("company_os_logs_created_at_idx").on(table.createdAt),
}));

// Finance snapshots - one row per Dubai-day, upserted by the Finance Agent
// from Stripe charges grouped by metadata.category. Powers the WhatsApp
// `revenue` / `revenue week` commands and the /api/company-os/finance
// admin endpoint.
export const financeSnapshots = pgTable("finance_snapshots", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  snapshotDate: text("snapshot_date").notNull().unique(), // YYYY-MM-DD in Asia/Dubai
  totalRevenueAed: decimal("total_revenue_aed", { precision: 12, scale: 2 }).notNull().default("0"),
  transactionCount: integer("transaction_count").notNull().default(0),
  // Breakdown by metadata.category — keys are free-form (e.g. "brand_subscription",
  // "featured_listing", "boosted_post", "ad_space", "insurance", "uncategorized")
  // and values are AED totals as numbers.
  breakdown: jsonb("breakdown").$type<Record<string, number>>().default({}),
  refundsAed: decimal("refunds_aed", { precision: 12, scale: 2 }).notNull().default("0"),
  refundCount: integer("refund_count").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  snapshotDateIdx: index("finance_snapshots_date_idx").on(table.snapshotDate),
}));

// Content briefs - weekly marketing campaign briefs generated by the
// Marketing Agent (LLM + real platform trending data). Rendered to PDF
// via jsPDF and uploaded to private object storage; the storage key is
// persisted here so we can sign on-demand download URLs (no public ACL).
export const contentBriefs = pgTable("content_briefs", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  weekStart: text("week_start").notNull(), // YYYY-MM-DD (Asia/Dubai Monday)
  theme: text("theme").notNull(),
  audience: text("audience").notNull(),
  hooks: jsonb("hooks").$type<string[]>().notNull().default([]),
  hashtags: jsonb("hashtags").$type<string[]>().notNull().default([]),
  suggestedBudgetAed: decimal("suggested_budget_aed", { precision: 12, scale: 2 }).notNull().default("0"),
  recommendations: text("recommendations"),
  pdfStorageKey: text("pdf_storage_key"), // relative key under PRIVATE_OBJECT_DIR
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  weekStartIdx: index("content_briefs_week_start_idx").on(table.weekStart),
}));

// Campaign performance - manual founder capture of CTR / spend / conversions
// for each external campaign run. Replaces Meta Graph auto-fetch until the
// Bareter Meta Business app has been approved for the Marketing API.
export const campaignPerformance = pgTable("campaign_performance", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  campaignName: text("campaign_name").notNull().unique(),
  channel: text("channel"), // "instagram", "linkedin", "tiktok", "x", null = unknown
  ctr: decimal("ctr", { precision: 6, scale: 2 }).notNull().default("0"),
  spendAed: decimal("spend_aed", { precision: 12, scale: 2 }).notNull().default("0"),
  conversions: integer("conversions").notNull().default(0),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Legal documents - artifacts produced by the Legal Agent. Three flavours:
//   • `contract` — UAE-jurisdiction barter contract PDF generated from
//     a WhatsApp `contract` command. PDF lives in private object storage.
//   • `dispute_summary` — the Friday weekly rollup of reports/disputes
//     plus 3 LLM-authored risk callouts. Body stored on the row.
//   • `vat_flag` — snapshot of users approaching / over the UAE VAT
//     registration threshold (AED 187,500 rolling 12 months).
export const legalDocuments = pgTable("legal_documents", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  documentType: text("document_type").notNull(), // 'contract' | 'dispute_summary' | 'vat_flag'
  title: text("title").notNull(),
  partyA: text("party_a"),
  partyB: text("party_b"),
  valueAed: decimal("value_aed", { precision: 12, scale: 2 }),
  body: text("body"), // plain-text version (contract body OR summary text)
  metadata: jsonb("metadata"), // structured details (exchange, callouts, flagged users, etc.)
  objectStorageKey: text("object_storage_key"), // relative key under PRIVATE_OBJECT_DIR (unsigned PDF)
  // Contract lifecycle:
  //   contract:        'draft' → 'sent' → 'signed' → 'active' → 'archived'
  //   dispute_summary: 'generated'
  //   vat_flag:        'generated'
  status: text("status").notNull().default("draft"),
  // Per-party e-signature fields (contracts only). Each party gets a
  // unique random token they can use to confirm acceptance from a
  // public link (no login required) or that the founder can quote in a
  // `sign <token>` WhatsApp reply.
  signatureTokenA: text("signature_token_a"),
  signatureTokenB: text("signature_token_b"),
  partyASignedAt: timestamp("party_a_signed_at"),
  partyBSignedAt: timestamp("party_b_signed_at"),
  partyASignedName: text("party_a_signed_name"),
  partyBSignedName: text("party_b_signed_name"),
  partyASignedIp: text("party_a_signed_ip"),
  partyBSignedIp: text("party_b_signed_ip"),
  // Object-storage key for the *signed* PDF revision, written once both
  // parties have e-signed. Original `objectStorageKey` keeps pointing at
  // the unsigned draft so admins can still see the original.
  signedObjectStorageKey: text("signed_object_storage_key"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  typeIdx: index("legal_documents_type_idx").on(table.documentType),
  createdAtIdx: index("legal_documents_created_at_idx").on(table.createdAt),
  signatureTokenAIdx: uniqueIndex("legal_documents_signature_token_a_idx").on(
    table.signatureTokenA,
  ),
  signatureTokenBIdx: uniqueIndex("legal_documents_signature_token_b_idx").on(
    table.signatureTokenB,
  ),
}));

// KPI snapshots - one row per Dubai-day, captured by the Dashboard Agent
// at 02:00 Asia/Dubai. Powers the WhatsApp `dashboard` short summary,
// the /admin/company-os page (30-day trends), and the JSON export.
// `extras` is a free-form blob for things we don't want columns for yet
// (top-3 categories list, top-3 cities list, agent-by-agent cost map, etc).
export const kpiSnapshots = pgTable("kpi_snapshots", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  snapshotDate: text("snapshot_date").notNull().unique(), // YYYY-MM-DD in Asia/Dubai
  totalUsers: integer("total_users").notNull().default(0),
  newUsersToday: integer("new_users_today").notNull().default(0),
  activeUsers7d: integer("active_users_7d").notNull().default(0),
  totalPosts: integer("total_posts").notNull().default(0),
  postsToday: integer("posts_today").notNull().default(0),
  totalDeals: integer("total_deals").notNull().default(0),
  dealsCompletedToday: integer("deals_completed_today").notNull().default(0),
  gmvAed7d: decimal("gmv_aed_7d", { precision: 12, scale: 2 }).notNull().default("0"),
  completionRatePct: decimal("completion_rate_pct", { precision: 5, scale: 2 }).notNull().default("0"),
  topCategory: text("top_category"),
  topCity: text("top_city"),
  aiCostAedMonthToDate: decimal("ai_cost_aed_month_to_date", { precision: 12, scale: 2 }).notNull().default("0"),
  extras: jsonb("extras").$type<Record<string, unknown>>().default({}),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  snapshotDateIdx: index("kpi_snapshots_date_idx").on(table.snapshotDate),
}));

// Sales leads - DB-backed CRM for the Sales Agent. One row per Bareter user
// that has been ingested by the agent. Replaces a third-party CRM (Airtable)
// so the founder can filter / sort / edit from the Company OS admin page
// without paying for or wiring up an external service.
export const salesLeads = pgTable("sales_leads", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id", { length: 36 }).notNull().references(() => users.id),
  email: text("email").notNull(),
  fullName: text("full_name").notNull(),
  userType: text("user_type").notNull(), // "asset_owner" | "business" | "freelancer"
  location: text("location"), // city or country fallback
  leadScore: integer("lead_score").notNull().default(0), // 0-100
  status: text("status").notNull().default("new"), // new | active | engaged | re_engaged | converted | dormant
  lastActivityAt: timestamp("last_activity_at"),
  firstDealAt: timestamp("first_deal_at"),
  reEngagementSentAt: timestamp("re_engagement_sent_at"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  userIdUniqueIdx: uniqueIndex("sales_leads_user_id_unique_idx").on(table.userId),
  statusIdx: index("sales_leads_status_idx").on(table.status),
  scoreIdx: index("sales_leads_lead_score_idx").on(table.leadScore),
  lastActivityIdx: index("sales_leads_last_activity_idx").on(table.lastActivityAt),
}));

// Sales re-engagement events - lightweight outcome tracking for the Sales
// Agent's re-engagement campaign. One row is written per email sent (event
// "sent") with a per-lead `linkToken` embedded in the CTA URL. When the
// recipient clicks the tracked link, a second row is written ("return_visit")
// for the same token. The reporting query joins these against `posts` and
// `deals` to surface a "X of last 50 emails brought the user back within
// 7 days" conversion rate on the WhatsApp `leads` command and the
// /api/company-os/sales/leads admin endpoint.
//
// `linkToken` is unique per (token, eventType) so the return_visit insert
// is naturally idempotent — a recipient who clicks the link twice is only
// counted once.
export const salesReengagementEvents = pgTable("sales_reengagement_events", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  leadId: varchar("lead_id", { length: 36 }).notNull().references(() => salesLeads.id),
  userId: varchar("user_id", { length: 36 }).notNull().references(() => users.id),
  eventType: text("event_type").notNull(), // "sent" | "return_visit"
  linkToken: varchar("link_token", { length: 64 }).notNull(),
  metadata: jsonb("metadata").$type<Record<string, unknown> | null>(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  tokenEventIdx: uniqueIndex("sales_reengage_token_event_idx").on(
    table.linkToken,
    table.eventType,
  ),
  userCreatedIdx: index("sales_reengage_user_created_idx").on(
    table.userId,
    table.createdAt,
  ),
  eventCreatedIdx: index("sales_reengage_event_created_idx").on(
    table.eventType,
    table.createdAt,
  ),
}));

// Marketing posts - one row per outbound publish attempt by the Marketing
// Agent's `publishPostFromTopic` / `handleConfirmPublishSend` flows.
// Decoupled from `llm_calls` (which is an audit log of LLM usage) so the
// dashboard / weekly brief can show *what actually went out* without
// joining against text-search of LLM previews.
//
// `status` is "success" or "failure" — the publisher returns a typed
// outcome and we persist both the success metadata (externalId,
// externalUrl) and the failure detail (`error`) so the founder can see
// why a publish broke from the same row that records the attempt.
export const marketingPosts = pgTable("marketing_posts", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  channel: text("channel"),                          // "buffer" | "linkedin" | "meta" | null when the dispatch never picked one
  topic: text("topic").notNull(),                    // founder-supplied topic that drove the draft
  body: text("body").notNull(),                      // the rendered post body that was sent
  externalId: text("external_id"),                   // upstream post id from the connector (when available)
  externalUrl: text("external_url"),                 // upstream public URL (when the connector returns one)
  status: text("status").notNull(),                  // "success" | "failure"
  error: text("error"),                              // failure detail (truncated)
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  createdAtIdx: index("marketing_posts_created_at_idx").on(table.createdAt),
  statusIdx: index("marketing_posts_status_idx").on(table.status),
}));

// Sales sync state - singleton row that holds the cursor used by the
// Sales Agent's `syncNewLeads` refresh pass. Persisting the cursor
// (instead of recomputing it from `salesLeads.updatedAt`) is what
// guarantees every Bareter user is re-scored on a predictable cadence
// even after the marketplace grows past the per-run ingest budget:
// each run advances `cursorUserId` by ≤ refreshLimit users; when the
// query returns fewer rows than the limit we know we've reached the
// end of the user table and reset the cursor (a "wrap"). `wrapCount`
// is bumped on each wrap so the founder / monitoring can see the
// full-pass cadence in one glance.
//
// Single row keyed by `id = 'default'`. We use the literal string
// "default" rather than a UUID so the upsert in `syncNewLeads` is
// dead simple (`onConflictDoUpdate({ target: id })`). If we ever need
// per-tenant cursors the `id` column already accommodates additional
// keys without a schema change.
export const salesSyncState = pgTable("sales_sync_state", {
  id: text("id").primaryKey(),
  cursorUserId: varchar("cursor_user_id", { length: 36 }),
  lastRunAt: timestamp("last_run_at"),
  wrapCount: integer("wrap_count").notNull().default(0),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Agent memory - shared cross-agent learnings persisted by the Memory
// Agent. Every Company OS agent can write `remember()` after a meaningful
// output (preference, learning, pattern) and read `buildAgentContext()`
// before its next LLM call so future replies get measurably smarter
// without retraining anything.
//
// Unique index on (agentName, memoryType, key) so `remember()` upserts
// instead of duplicating. `value` is a JSON blob; the helper enforces
// a 4 KB ceiling so a runaway agent can't bloat the table.
export const agentMemory = pgTable("agent_memory", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  agentName: text("agent_name").notNull(),       // "manager" | "finance" | "marketing" | "sales" | "dashboard" | "legal"
  memoryType: text("memory_type").notNull(),     // "preference" | "learning" | "pattern" | ...
  key: text("key").notNull(),                    // exact-match lookup key (e.g. "top_ctr_campaign")
  value: jsonb("value").notNull(),               // arbitrary JSON, capped at 4 KB by the helper
  confidence: decimal("confidence", { precision: 4, scale: 3 }).notNull().default("0.500"), // 0.000–1.000
  usageCount: integer("usage_count").notNull().default(0),
  lastUsedAt: timestamp("last_used_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  agentTypeKeyUniqueIdx: uniqueIndex("agent_memory_agent_type_key_unique_idx").on(
    table.agentName,
    table.memoryType,
    table.key,
  ),
  agentIdx: index("agent_memory_agent_idx").on(table.agentName),
  usageIdx: index("agent_memory_usage_idx").on(table.usageCount),
}));

// Proactive Alerts — written by the Intelligence Agent when a heuristic
// detector trips (revenue drop, dispute spike, AI burn rate, hot
// category, zero-deals window). Each alert is shown in the WhatsApp
// `alerts` command and on the admin dashboard's alerts feed; ack-ing
// stamps `acknowledgedAt` so it drops out of the open list.
//
// Dedupe: `dayKey` is a UTC YYYY-MM-DD computed by the agent before
// insert. Combined with `alertType` it forms a unique index — a second
// detector firing on the same day no-ops via `onConflictDoNothing` so
// the founder never gets the same alert twice on the same day.
//
// NOTE: this is functionally equivalent to a `UNIQUE(alert_type,
// DATE(created_at))` expression index, but we materialise the day in
// its own `text` column instead so (a) the index works on every
// Postgres version without needing an immutable expression, and
// (b) we control the timezone explicitly (always UTC) instead of
// inheriting the server's `timezone` setting via `DATE()`.
// Board reports - monthly investor/board-ready PDF reports generated by
// the Board Report Agent on the 1st of each month at 10:00 Asia/Dubai
// (== 06:00 UTC). One row per `reportMonth` (YYYY-MM) so re-runs of the
// same month are idempotent — they overwrite the storage key and update
// the row instead of creating duplicates. PDF lives in private object
// storage under `companyOs/board-reports/<month>.pdf`; the row pins the
// key so we can sign on-demand download URLs.
export const boardReports = pgTable("board_reports", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  reportMonth: text("report_month").notNull().unique(), // YYYY-MM
  objectStorageKey: text("object_storage_key"), // relative key under PRIVATE_OBJECT_DIR
  summaryText: text("summary_text").notNull().default(""),
  metricsJson: jsonb("metrics_json").$type<Record<string, unknown>>().default({}),
  pdfSizeBytes: integer("pdf_size_bytes").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  monthIdx: index("board_reports_month_idx").on(table.reportMonth),
}));

// Per-agent monthly AED cap overrides edited from the admin dashboard.
// One row per canonical agent name (e.g. "marketing", "sales"). Read by
// the cost tracker on every getAgentBudgetAed() call (via in-memory
// cache) and falls back to the hardcoded AGENT_LIMITS_AED map when no
// row exists.
export const agentBudgets = pgTable("agent_budgets", {
  agentName: text("agent_name").primaryKey(), // canonical short name
  monthlyCapAed: decimal("monthly_cap_aed", { precision: 10, scale: 2 }).notNull(),
  enabled: boolean("enabled").default(true),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const proactiveAlerts = pgTable("proactive_alerts", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  alertType: text("alert_type").notNull(), // e.g. "revenue_drop_wow", "dispute_spike_wow"
  severity: text("severity").notNull(),    // "info" | "warning" | "critical"
  title: text("title").notNull(),
  body: text("body").notNull(),
  dataJson: jsonb("data_json").$type<Record<string, unknown>>().default({}),
  dayKey: text("day_key").notNull(),       // UTC YYYY-MM-DD — dedupe partner
  acknowledgedAt: timestamp("acknowledged_at"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  typeDayUniqueIdx: uniqueIndex("proactive_alerts_type_day_unique_idx").on(
    table.alertType,
    table.dayKey,
  ),
  createdAtIdx: index("proactive_alerts_created_at_idx").on(table.createdAt),
  ackIdx: index("proactive_alerts_ack_idx").on(table.acknowledgedAt),
}));

// Category template details type
export type CategoryDetails = {
  numberOfOutfits?: number;
  shootDuration?: string;
  dates?: string;
  roomType?: string;
  contentDeliverables?: string;
  licenseDuration?: string;
  featuresIncluded?: string;
  [key: string]: string | number | undefined;
};

// Insert schemas
export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  isVerified: true,
  isAdmin: true,
});

export const insertListingSchema = createInsertSchema(listings).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  viewCount: true,
  likeCount: true,
});

export const insertDealSchema = createInsertSchema(deals).omit({
  id: true,
  dealNumber: true,
  createdAt: true,
  updatedAt: true,
  seekerCompleted: true,
  providerCompleted: true,
  contractPdfUrl: true,
  proposedAt: true,
  acceptedAt: true,
  completedAt: true,
  cancelledAt: true,
});

export const insertMessageSchema = createInsertSchema(messages).omit({
  id: true,
  createdAt: true,
  isRead: true,
});

export const insertRatingSchema = createInsertSchema(ratings).omit({
  id: true,
  createdAt: true,
});

export const insertNotificationSchema = createInsertSchema(notifications).omit({
  id: true,
  createdAt: true,
  isRead: true,
});

export const insertFollowerSchema = createInsertSchema(followers).omit({
  id: true,
  createdAt: true,
});

export const insertReferralSchema = createInsertSchema(referrals).omit({
  id: true,
  createdAt: true,
  referrerFeeWaived: true,
  referredFeeWaived: true,
  referrerDealId: true,
  referredDealId: true,
});

export const insertWishlistSchema = createInsertSchema(wishlists).omit({
  id: true,
  createdAt: true,
});

export const insertPostSchema = createInsertSchema(posts).omit({
  id: true,
  createdAt: true,
  likeCount: true,
  isActive: true,
});

export const insertPostLikeSchema = createInsertSchema(postLikes).omit({
  id: true,
  createdAt: true,
});

export const insertPostCommentSchema = createInsertSchema(postComments).omit({
  id: true,
  createdAt: true,
});

export const insertPostBookmarkSchema = createInsertSchema(postBookmarks).omit({
  id: true,
  createdAt: true,
});

export const insertEndorsementSchema = createInsertSchema(endorsements).omit({
  id: true,
  createdAt: true,
});

export const insertSavedSearchSchema = createInsertSchema(savedSearches).omit({
  id: true,
  createdAt: true,
  lastNotifiedAt: true,
});

export const insertDealMilestoneSchema = createInsertSchema(dealMilestones).omit({
  id: true,
  createdAt: true,
  isCompleted: true,
  completedAt: true,
  completedBy: true,
});

export const insertPortfolioItemSchema = createInsertSchema(portfolioItems).omit({
  id: true,
  createdAt: true,
});

export const insertQuickInquirySchema = createInsertSchema(quickInquiries).omit({
  id: true,
  createdAt: true,
  isRead: true,
  reply: true,
});

export const insertListingLikeSchema = createInsertSchema(listingLikes).omit({
  id: true,
  createdAt: true,
});

export const insertListingCommentSchema = createInsertSchema(listingComments).omit({
  id: true,
  createdAt: true,
});

// Auth schemas. Use `.strict()` on registration so unknown fields
// (e.g. attempts to smuggle `isAdmin`, `role`, `kybStatus` etc.) are
// rejected with a 400 instead of silently passing through.
export const loginSchema = z
  .object({
    email: z.string().email("Invalid email address"),
    password: z.string().min(6, "Password must be at least 6 characters"),
  })
  .strict();

// Strict whitelist of admin-settable KYB statuses. Anything outside this
// enum (including SQL fragments, arrays, etc.) is rejected with 400.
export const adminKybStatusSchema = z
  .object({
    status: z.enum([
      "NOT_STARTED",
      "IN_PROGRESS",
      "PENDING_REVIEW",
      "APPROVED",
      "DECLINED",
    ]),
  })
  .strict();

export const registerSchema = z
  .object({
    email: z.string().email("Invalid email address"),
    password: z.string().min(6, "Password must be at least 6 characters"),
    fullName: z.string().min(2, "Full name must be at least 2 characters"),
    country: z.string().length(2, "Please select a country"),
    city: z.string().min(1, "Please select a city"),
    // Optional product fields supplied by the signup wizard. Explicitly
    // listed (and validated) so `.strict()` doesn't break the existing
    // client payload while still rejecting unknown smuggled fields.
    signupType: z.enum(SIGNUP_TYPES).optional(),
    socialProfiles: z
      .array(
        z.object({
          platform: z.string().min(1),
          username: z.string().min(1),
          url: z.string().optional(),
          followerCount: z.number().int().nonnegative().optional(),
          categories: z.array(z.string()).optional(),
        }),
      )
      .optional(),
    inviteCode: z.string().max(16).optional(),
  })
  .strict();

// Types
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

export type InsertListing = z.infer<typeof insertListingSchema>;
export type Listing = typeof listings.$inferSelect;

export type InsertDeal = z.infer<typeof insertDealSchema>;
export type Deal = typeof deals.$inferSelect;

export type InsertMessage = z.infer<typeof insertMessageSchema>;
export type Message = typeof messages.$inferSelect;

export type InsertRating = z.infer<typeof insertRatingSchema>;
export type Rating = typeof ratings.$inferSelect;

export type InsertNotification = z.infer<typeof insertNotificationSchema>;
export type Notification = typeof notifications.$inferSelect;

export type InsertFollower = z.infer<typeof insertFollowerSchema>;
export type Follower = typeof followers.$inferSelect;

export type InsertReferral = z.infer<typeof insertReferralSchema>;
export type Referral = typeof referrals.$inferSelect;

export type InsertWishlist = z.infer<typeof insertWishlistSchema>;
export type Wishlist = typeof wishlists.$inferSelect;

export type InsertPost = z.infer<typeof insertPostSchema>;
export type Post = typeof posts.$inferSelect;

export type InsertPostLike = z.infer<typeof insertPostLikeSchema>;
export type PostLike = typeof postLikes.$inferSelect;

export type InsertPostComment = z.infer<typeof insertPostCommentSchema>;
export type PostComment = typeof postComments.$inferSelect;

export type InsertPostBookmark = z.infer<typeof insertPostBookmarkSchema>;
export type PostBookmark = typeof postBookmarks.$inferSelect;

export type InsertEndorsement = z.infer<typeof insertEndorsementSchema>;
export type Endorsement = typeof endorsements.$inferSelect;

export type InsertSavedSearch = z.infer<typeof insertSavedSearchSchema>;
export type SavedSearch = typeof savedSearches.$inferSelect;

export type InsertDealMilestone = z.infer<typeof insertDealMilestoneSchema>;
export type DealMilestone = typeof dealMilestones.$inferSelect;

export type InsertPortfolioItem = z.infer<typeof insertPortfolioItemSchema>;
export type PortfolioItem = typeof portfolioItems.$inferSelect;

export type InsertQuickInquiry = z.infer<typeof insertQuickInquirySchema>;
export type QuickInquiry = typeof quickInquiries.$inferSelect;

export type InsertListingLike = z.infer<typeof insertListingLikeSchema>;
export type ListingLike = typeof listingLikes.$inferSelect;

export type InsertListingComment = z.infer<typeof insertListingCommentSchema>;
export type ListingComment = typeof listingComments.$inferSelect;

export const insertReportSchema = createInsertSchema(reports).omit({
  id: true,
  createdAt: true,
  status: true,
});
export type InsertReport = z.infer<typeof insertReportSchema>;
export type Report = typeof reports.$inferSelect;

export const insertImageScanSchema = createInsertSchema(imageScans).omit({
  id: true,
  createdAt: true,
});
export type InsertImageScan = z.infer<typeof insertImageScanSchema>;
export type ImageScan = typeof imageScans.$inferSelect;

export const insertModerationLogSchema = createInsertSchema(moderationLogs).omit({
  id: true,
  createdAt: true,
  reviewedByAdmin: true,
  adminUserId: true,
});
export type InsertModerationLog = z.infer<typeof insertModerationLogSchema>;
export type ModerationLog = typeof moderationLogs.$inferSelect;

export const insertAgentInteractionSchema = createInsertSchema(agentInteractions).omit({
  id: true,
  createdAt: true,
  tokensUsed: true,
});
export type InsertAgentInteraction = z.infer<typeof insertAgentInteractionSchema>;
export type AgentInteraction = typeof agentInteractions.$inferSelect;

export const insertCompanyOsLogSchema = createInsertSchema(companyOsLogs).omit({
  id: true,
  createdAt: true,
});
export type InsertCompanyOsLog = z.infer<typeof insertCompanyOsLogSchema>;
export type CompanyOsLog = typeof companyOsLogs.$inferSelect;

export const insertFinanceSnapshotSchema = createInsertSchema(financeSnapshots).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertFinanceSnapshot = z.infer<typeof insertFinanceSnapshotSchema>;
export type FinanceSnapshot = typeof financeSnapshots.$inferSelect;

export const insertContentBriefSchema = createInsertSchema(contentBriefs).omit({
  id: true,
  createdAt: true,
});
export type InsertContentBrief = z.infer<typeof insertContentBriefSchema>;
export type ContentBrief = typeof contentBriefs.$inferSelect;

export const insertCampaignPerformanceSchema = createInsertSchema(campaignPerformance).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertCampaignPerformance = z.infer<typeof insertCampaignPerformanceSchema>;
export type CampaignPerformance = typeof campaignPerformance.$inferSelect;

export const insertLegalDocumentSchema = createInsertSchema(legalDocuments).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertLegalDocument = z.infer<typeof insertLegalDocumentSchema>;
export type LegalDocument = typeof legalDocuments.$inferSelect;

export const insertMarketingPostSchema = createInsertSchema(marketingPosts).omit({
  id: true,
  createdAt: true,
});
export type InsertMarketingPost = z.infer<typeof insertMarketingPostSchema>;
export type MarketingPost = typeof marketingPosts.$inferSelect;

export const insertSalesLeadSchema = createInsertSchema(salesLeads).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertSalesLead = z.infer<typeof insertSalesLeadSchema>;
export type SalesLead = typeof salesLeads.$inferSelect;

export const insertSalesReengagementEventSchema = createInsertSchema(
  salesReengagementEvents,
).omit({
  id: true,
  createdAt: true,
});
export type InsertSalesReengagementEvent = z.infer<
  typeof insertSalesReengagementEventSchema
>;

export const insertSalesSyncStateSchema = createInsertSchema(salesSyncState).omit({
  updatedAt: true,
});
export type InsertSalesSyncState = z.infer<typeof insertSalesSyncStateSchema>;
export type SalesSyncState = typeof salesSyncState.$inferSelect;
export type SalesReengagementEvent =
  typeof salesReengagementEvents.$inferSelect;

export const insertKpiSnapshotSchema = createInsertSchema(kpiSnapshots).omit({
  id: true,
  createdAt: true,
});
export type InsertKpiSnapshot = z.infer<typeof insertKpiSnapshotSchema>;
export type KpiSnapshot = typeof kpiSnapshots.$inferSelect;

export const insertAgentMemorySchema = createInsertSchema(agentMemory).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  lastUsedAt: true,
  usageCount: true,
});
export type InsertAgentMemory = z.infer<typeof insertAgentMemorySchema>;
export type AgentMemory = typeof agentMemory.$inferSelect;

export const insertProactiveAlertSchema = createInsertSchema(proactiveAlerts).omit({
  id: true,
  createdAt: true,
  acknowledgedAt: true,
});
export type InsertProactiveAlert = z.infer<typeof insertProactiveAlertSchema>;
export type ProactiveAlert = typeof proactiveAlerts.$inferSelect;

export const insertBoardReportSchema = createInsertSchema(boardReports).omit({
  id: true,
  createdAt: true,
});
export type InsertBoardReport = z.infer<typeof insertBoardReportSchema>;
export type BoardReport = typeof boardReports.$inferSelect;

// Waitlist
export const insertWaitlistEntrySchema = createInsertSchema(waitlistEntries)
  .omit({
    id: true,
    position: true,
    referralCode: true,
    referralCount: true,
    founderBadgeReserved: true,
    confirmedAt: true,
    convertedUserId: true,
    createdAt: true,
  })
  .extend({
    email: z.string().email("Please enter a valid email address").transform((v) => v.trim().toLowerCase()),
    name: z.string().max(120).optional().nullable(),
    country: z.string().length(2).optional().nullable(),
    city: z.string().max(120).optional().nullable(),
    accountType: z.enum(["individual", "business"]).optional().nullable(),
    businessName: z.string().max(160).optional().nullable(),
    categoriesOfInterest: z.array(z.string().max(80)).max(10).optional(),
    source: z.string().max(200).optional().nullable(),
    referredByCode: z.string().max(16).optional().nullable(),
  });
export type InsertWaitlistEntry = z.infer<typeof insertWaitlistEntrySchema>;
export type WaitlistEntry = typeof waitlistEntries.$inferSelect;

export type BannedEmail = typeof bannedEmails.$inferSelect;

export const DISPUTE_STATUSES = ["open", "in_mediation", "resolved"] as const;
export const DISPUTE_OUTCOMES = ["in_favor_party_a", "in_favor_party_b", "mutual", "dismissed"] as const;

export type DisputeEvidence = {
  submittedBy: string;
  submittedByName?: string;
  description: string;
  fileUrls?: string[];
  submittedAt: string;
};

export const disputes = pgTable("disputes", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  reportId: varchar("report_id", { length: 36 }).references(() => reports.id),
  dealId: varchar("deal_id", { length: 36 }).references(() => deals.id),
  partyAId: varchar("party_a_id", { length: 36 }).notNull().references(() => users.id),
  partyBId: varchar("party_b_id", { length: 36 }).notNull().references(() => users.id),
  status: text("status").notNull().default("open"),
  subject: text("subject").notNull(),
  description: text("description"),
  evidence: jsonb("evidence").$type<DisputeEvidence[]>().default([]),
  decision: text("decision"),
  decisionReasoning: text("decision_reasoning"),
  decisionBy: varchar("decision_by", { length: 36 }).references(() => users.id),
  decisionAt: timestamp("decision_at"),
  outcome: text("outcome"),
  escalatedAt: timestamp("escalated_at"),
  escalatedBy: varchar("escalated_by", { length: 36 }).references(() => users.id),
  resolvedAt: timestamp("resolved_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  statusIdx: index("disputes_status_idx").on(table.status),
  partyAIdx: index("disputes_party_a_idx").on(table.partyAId),
  partyBIdx: index("disputes_party_b_idx").on(table.partyBId),
  createdAtIdx: index("disputes_created_at_idx").on(table.createdAt),
}));

export const insertDisputeSchema = createInsertSchema(disputes).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  decision: true,
  decisionReasoning: true,
  decisionBy: true,
  decisionAt: true,
  outcome: true,
  escalatedAt: true,
  escalatedBy: true,
  resolvedAt: true,
});
export type InsertDispute = z.infer<typeof insertDisputeSchema>;
export type Dispute = typeof disputes.$inferSelect;

export type DisputeWithParties = Dispute & {
  partyA: Omit<User, "password">;
  partyB: Omit<User, "password">;
  decisionByAdmin?: Omit<User, "password"> | null;
};

export const adminAuditLogs = pgTable("admin_audit_logs", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  adminId: varchar("admin_id", { length: 36 }).notNull().references(() => users.id),
  adminEmail: text("admin_email"),
  action: text("action").notNull(),
  targetType: text("target_type").notNull(),
  targetId: varchar("target_id", { length: 36 }),
  details: jsonb("details").$type<Record<string, unknown>>(),
  ipAddress: text("ip_address"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  adminIdx: index("admin_audit_logs_admin_idx").on(table.adminId),
  actionIdx: index("admin_audit_logs_action_idx").on(table.action),
  createdAtIdx: index("admin_audit_logs_created_at_idx").on(table.createdAt),
}));

export const insertAdminAuditLogSchema = createInsertSchema(adminAuditLogs).omit({
  id: true,
  createdAt: true,
});
export type InsertAdminAuditLog = z.infer<typeof insertAdminAuditLogSchema>;
export type AdminAuditLog = typeof adminAuditLogs.$inferSelect;

export const failedLoginAttempts = pgTable("failed_login_attempts", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  email: text("email").notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  reason: text("reason").default("invalid_credentials"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  emailIdx: index("failed_login_email_idx").on(table.email),
  createdAtIdx: index("failed_login_created_at_idx").on(table.createdAt),
}));

export const insertFailedLoginAttemptSchema = createInsertSchema(failedLoginAttempts).omit({
  id: true,
  createdAt: true,
});
export type InsertFailedLoginAttempt = z.infer<typeof insertFailedLoginAttemptSchema>;
export type FailedLoginAttempt = typeof failedLoginAttempts.$inferSelect;

export const broadcastJobs = pgTable("broadcast_jobs", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  subject: text("subject").notNull(),
  body: text("body").notNull(),
  filter: jsonb("filter"),
  status: text("status").notNull().default("queued"),
  recipientCount: integer("recipient_count").notNull().default(0),
  sent: integer("sent").notNull().default(0),
  failed: integer("failed").notNull().default(0),
  sentBy: varchar("sent_by", { length: 36 }).references(() => users.id),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").defaultNow(),
});
export type BroadcastJob = typeof broadcastJobs.$inferSelect;

export const emailLogs = pgTable("email_logs", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  recipientEmail: text("recipient_email").notNull(),
  subject: text("subject").notNull(),
  status: text("status").notNull().default("sent"),
  source: text("source").notNull().default("admin"),
  broadcastId: varchar("broadcast_id", { length: 36 }),
  errorMessage: text("error_message"),
  sentBy: varchar("sent_by", { length: 36 }).references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  statusIdx: index("email_logs_status_idx").on(table.status),
  broadcastIdx: index("email_logs_broadcast_idx").on(table.broadcastId),
  createdAtIdx: index("email_logs_created_at_idx").on(table.createdAt),
}));

export type EmailLog = typeof emailLogs.$inferSelect;

// Support Tickets
export const SUPPORT_TICKET_STATUSES = ["open", "in_progress", "waiting_user", "resolved", "closed"] as const;
export const SUPPORT_TICKET_PRIORITIES = ["low", "normal", "high", "urgent"] as const;
export const SUPPORT_TICKET_CATEGORIES = ["account", "listing", "deal", "verification", "billing", "bug", "other"] as const;

export const supportTickets = pgTable("support_tickets", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  ticketNumber: text("ticket_number").notNull().unique(),
  userId: varchar("user_id", { length: 36 }).references(() => users.id),
  requesterName: text("requester_name"),
  requesterEmail: text("requester_email"),
  subject: text("subject").notNull(),
  category: text("category").notNull().default("other"),
  priority: text("priority").notNull().default("normal"),
  status: text("status").notNull().default("open"),
  assignedTo: varchar("assigned_to", { length: 36 }).references(() => users.id),
  resolvedAt: timestamp("resolved_at"),
  closedAt: timestamp("closed_at"),
  lastActivityAt: timestamp("last_activity_at").defaultNow(),
  aiHandled: boolean("ai_handled").default(false),
  escalatedAt: timestamp("escalated_at"),
  internalNote: text("internal_note"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  userIdx: index("support_tickets_user_idx").on(table.userId),
  statusIdx: index("support_tickets_status_idx").on(table.status),
  createdAtIdx: index("support_tickets_created_at_idx").on(table.createdAt),
}));

export const insertSupportTicketSchema = createInsertSchema(supportTickets).omit({
  id: true,
  ticketNumber: true,
  createdAt: true,
  updatedAt: true,
  lastActivityAt: true,
});
export type InsertSupportTicket = z.infer<typeof insertSupportTicketSchema>;
export type SupportTicket = typeof supportTickets.$inferSelect;

export const supportMessages = pgTable("support_messages", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  ticketId: varchar("ticket_id", { length: 36 }).notNull().references(() => supportTickets.id),
  senderId: varchar("sender_id", { length: 36 }).references(() => users.id),
  senderType: text("sender_type").notNull().default("user"), // "user" | "admin" | "ai"
  content: text("content").notNull(),
  isInternal: boolean("is_internal").default(false),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  ticketIdx: index("support_messages_ticket_idx").on(table.ticketId),
}));

export const insertSupportMessageSchema = createInsertSchema(supportMessages).omit({
  id: true,
  createdAt: true,
});
export type InsertSupportMessage = z.infer<typeof insertSupportMessageSchema>;
export type SupportMessage = typeof supportMessages.$inferSelect;

export type SupportTicketWithUser = SupportTicket & {
  user?: Omit<User, "password"> | null;
  assignee?: Omit<User, "password"> | null;
  messageCount?: number;
  lastMessage?: string | null;
};
export type SupportMessageWithSender = SupportMessage & {
  sender?: Omit<User, "password"> | null;
};

export type PostCommentWithUser = PostComment & { user: Omit<User, "password"> };
export type ListingCommentWithUser = ListingComment & { user: Omit<User, "password"> };

// Extended types with relations
export type ListingWithUser = Listing & { user: User; isLiked?: boolean; commentCount?: number };
export type DealWithUsers = Deal & { seeker: User; provider: User };
export type MessageWithSender = Message & { sender: User };
export type RatingWithUsers = Rating & { fromUser: User; toUser: User };
export type PostWithUser = Post & { user: Omit<User, "password">; liked?: boolean; bookmarked?: boolean; commentCount?: number };
export type EndorsementWithUser = Endorsement & { fromUser: Omit<User, "password"> };
export type QuickInquiryWithUsers = QuickInquiry & { fromUser: Omit<User, "password">; toUser: Omit<User, "password"> };
