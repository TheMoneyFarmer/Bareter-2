import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, boolean, timestamp, decimal, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Categories for listings
export const CATEGORIES = [
  "Hospitality",
  "Fashion",
  "SaaS",
  "Services",
  "Food",
  "Events",
  "Real Estate",
  "Automotive",
  "Health & Wellness",
  "Education",
  "Marketing",
  "Technology",
] as const;

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
  businessName: text("business_name"),
  businessLicenseUrl: text("business_license_url"),
  verificationDocUrl: text("verification_doc_url"),
  verificationStatus: text("verification_status").default("pending"), // pending, submitted, verified, rejected
  profileCompleted: boolean("profile_completed").default(false),
  whatIOffer: jsonb("what_i_offer").$type<OfferNeedItem[]>().default([]),
  whatINeed: jsonb("what_i_need").$type<OfferNeedItem[]>().default([]),
  portfolioImages: jsonb("portfolio_images").$type<string[]>().default([]),
  language: text("language").default("en"), // en, ar
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

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
  deliverables: text("deliverables"),
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

// Extended types with relations
export type ListingWithUser = Listing & { user: User };
export type DealWithUsers = Deal & { seeker: User; provider: User };
export type MessageWithSender = Message & { sender: User };
export type RatingWithUsers = Rating & { fromUser: User; toUser: User };
