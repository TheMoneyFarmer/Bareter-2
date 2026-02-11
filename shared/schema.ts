import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, boolean, timestamp, decimal, jsonb } from "drizzle-orm/pg-core";
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

// Locations (UAE/GCC focus)
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
  avatarUrl: text("avatar_url"),
  isVerified: boolean("is_verified").default(false),
  isAdmin: boolean("is_admin").default(false),
  role: text("role").default("user"), // user, admin, super_admin
  isBanned: boolean("is_banned").default(false),
  bannedAt: timestamp("banned_at"),
  bannedReason: text("banned_reason"),
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
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Exchange preference item with optional priority
export type ExchangeItem = {
  name: string;
  isPriority: boolean;
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
  tags: jsonb("tags").$type<string[]>().default([]),
  isActive: boolean("is_active").default(true),
  viewCount: integer("view_count").default(0),
  // Exchange preferences - what the lister wants in return
  wantedCategories: jsonb("wanted_categories").$type<string[]>().default([]),
  exchangeItems: jsonb("exchange_items").$type<ExchangeItem[]>().default([]),
  openToOffers: boolean("open_to_offers").default(true),
  categoryDetails: jsonb("category_details").$type<Record<string, string | number>>(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
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
  successFee: decimal("success_fee", { precision: 12, scale: 2 }),
  stripePaymentId: text("stripe_payment_id"),
  contractPdfUrl: text("contract_pdf_url"),
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
  isStory: boolean("is_story").default(false),
  expiresAt: timestamp("expires_at"),
  likeCount: integer("like_count").default(0),
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
});

export const insertDealSchema = createInsertSchema(deals).omit({
  id: true,
  dealNumber: true,
  createdAt: true,
  updatedAt: true,
  seekerCompleted: true,
  providerCompleted: true,
  successFee: true,
  stripePaymentId: true,
  contractPdfUrl: true,
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

// Auth schemas
export const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

export const registerSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
  fullName: z.string().min(2, "Full name must be at least 2 characters"),
});

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

export type PostCommentWithUser = PostComment & { user: Omit<User, "password"> };

// Extended types with relations
export type ListingWithUser = Listing & { user: User };
export type DealWithUsers = Deal & { seeker: User; provider: User };
export type MessageWithSender = Message & { sender: User };
export type RatingWithUsers = Rating & { fromUser: User; toUser: User };
export type PostWithUser = Post & { user: Omit<User, "password">; liked?: boolean; bookmarked?: boolean; commentCount?: number };
