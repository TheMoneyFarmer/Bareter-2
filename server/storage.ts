import { db } from "./db";
import { eq, and, or, desc, sql, ilike, gte, lte, count as drizzleCount, inArray, isNotNull } from "drizzle-orm";
import {
  users,
  listings,
  deals,
  messages,
  ratings,
  notifications,
  followers,
  referrals,
  wishlists,
  posts,
  postLikes,
  postComments,
  postBookmarks,
  endorsements,
  savedSearches,
  dealMilestones,
  portfolioItems,
  quickInquiries,
  listingLikes,
  listingComments,
  type User,
  type InsertUser,
  type Listing,
  type InsertListing,
  type Deal,
  type InsertDeal,
  type Message,
  type InsertMessage,
  type Rating,
  type InsertRating,
  type Notification,
  type InsertNotification,
  type Follower,
  type InsertFollower,
  type Referral,
  type InsertReferral,
  type Wishlist,
  type InsertWishlist,
  type Post,
  type InsertPost,
  type PostWithUser,
  type PostComment,
  type PostCommentWithUser,
  type PostBookmark,
  type ListingWithUser,
  type DealWithUsers,
  type MessageWithSender,
  type Endorsement,
  type InsertEndorsement,
  type EndorsementWithUser,
  type SavedSearch,
  type InsertSavedSearch,
  type SavedSearchFilters,
  type DealMilestone,
  type InsertDealMilestone,
  type PortfolioItem,
  type InsertPortfolioItem,
  type QuickInquiry,
  type InsertQuickInquiry,
  type QuickInquiryWithUsers,
  type ListingLike,
  type ListingComment,
  type ListingCommentWithUser,
  waitlistEntries,
  type WaitlistEntry,
  type InsertWaitlistEntry,
  appSettings,
  consentLogs,
  type ConsentLog,
  type InsertConsentLog,
  legalPages,
  legalPageVersions,
  type LegalPage,
  type InsertLegalPage,
  type LegalPageVersion,
  bannedEmails,
  type BannedEmail,
  moderationLogs,
  type ModerationLog,
  disputes,
  type Dispute,
  type InsertDispute,
  type DisputeWithParties,
  adminAuditLogs,
  type AdminAuditLog,
  type InsertAdminAuditLog,
  failedLoginAttempts,
  type FailedLoginAttempt,
  type InsertFailedLoginAttempt,
  emailLogs,
  type EmailLog,
  broadcastJobs,
  type BroadcastJob,
  agentBudgets,
  listingDrafts,
  type ListingDraft,
  type InsertListingDraft,
  engagementEvents,
  type EngagementEvent,
  type InsertEngagementEvent,
  type EngagementEventType,
  reminderLog,
  type ReminderLogRow,
  type ReminderKind,
  supportTickets,
  supportMessages,
  type SupportTicket,
  type InsertSupportTicket,
  type SupportMessage,
  type InsertSupportMessage,
  type SupportTicketWithUser,
  type SupportMessageWithSender,
  reviews,
  type Review,
  type ReviewWithReviewer,
  pushSubscriptions,
} from "@shared/schema";
import { v4 as uuid } from "uuid";
import crypto from "crypto";

export interface IStorage {
  // Users
  getUser(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  getUserByPhone(phone: string): Promise<User | undefined>;
  getUserByPasswordResetToken(token: string): Promise<User | undefined>;
  getUserByDiditSessionId(sessionId: string): Promise<User | undefined>;
  getUsersWithPendingVerification(): Promise<User[]>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: string, data: Partial<User>): Promise<User | undefined>;
  getAllUsers(): Promise<User[]>;

  // Listings
  getListing(id: string): Promise<Listing | undefined>;
  getListingWithUser(id: string): Promise<ListingWithUser | undefined>;
  getListings(): Promise<ListingWithUser[]>;
  getListingsByUser(userId: string): Promise<Listing[]>;
  createListing(listing: InsertListing): Promise<Listing>;
  updateListing(id: string, data: Partial<Listing>): Promise<Listing | undefined>;
  incrementListingViews(id: string): Promise<void>;

  // Deals
  getDeal(id: string): Promise<Deal | undefined>;
  getDealWithUsers(id: string): Promise<DealWithUsers | undefined>;
  getDealsByUser(userId: string): Promise<DealWithUsers[]>;
  getAllDeals(): Promise<DealWithUsers[]>;
  createDeal(deal: InsertDeal): Promise<Deal>;
  updateDeal(id: string, data: Partial<Deal>): Promise<Deal | undefined>;

  // Messages
  getMessagesByDeal(dealId: string): Promise<MessageWithSender[]>;
  createMessage(message: InsertMessage): Promise<Message>;
  markMessagesAsRead(dealId: string, userId: string): Promise<void>;

  // Ratings
  getRatingsByUser(userId: string): Promise<Rating[]>;
  getRatingsByDeal(dealId: string): Promise<Rating[]>;
  createRating(rating: InsertRating): Promise<Rating>;

  // Notifications
  getNotificationsByUser(userId: string): Promise<Notification[]>;
  createNotification(notification: InsertNotification): Promise<Notification>;
  markNotificationAsRead(id: string): Promise<void>;
  markAllNotificationsAsRead(userId: string): Promise<void>;

  // Followers
  getFollowers(userId: string): Promise<(Follower & { follower: User })[]>;
  getFollowing(userId: string): Promise<(Follower & { following: User })[]>;
  isFollowing(followerId: string, followingId: string): Promise<boolean>;
  followUser(followerId: string, followingId: string): Promise<Follower>;
  unfollowUser(followerId: string, followingId: string): Promise<void>;
  getFollowerCount(userId: string): Promise<number>;
  getFollowingCount(userId: string): Promise<number>;

  // Referrals
  getReferralByUsers(referrerId: string, referredId: string): Promise<Referral | undefined>;
  getReferralsByUser(userId: string): Promise<Referral[]>;
  createReferral(referral: InsertReferral): Promise<Referral>;
  updateReferral(id: string, data: Partial<Referral>): Promise<Referral | undefined>;
  getUserByReferralCode(code: string): Promise<User | undefined>;

  // Wishlists
  getWishlistByUser(userId: string): Promise<(Wishlist & { listing: ListingWithUser })[]>;
  isWishlisted(userId: string, listingId: string): Promise<boolean>;
  addToWishlist(userId: string, listingId: string): Promise<Wishlist>;
  removeFromWishlist(userId: string, listingId: string): Promise<void>;

  // Posts
  getPosts(options?: { category?: string; limit?: number; offset?: number; userId?: string }): Promise<PostWithUser[]>;
  getPost(id: string): Promise<PostWithUser | undefined>;
  getStories(): Promise<PostWithUser[]>;
  createPost(post: InsertPost): Promise<Post>;
  likePost(postId: string, userId: string): Promise<void>;
  unlikePost(postId: string, userId: string): Promise<void>;
  isPostLiked(postId: string, userId: string): Promise<boolean>;

  // Post Comments
  getCommentsByPost(postId: string): Promise<PostCommentWithUser[]>;
  getCommentCount(postId: string): Promise<number>;
  createComment(postId: string, userId: string, content: string | null, offerItemName: string, offerItemValue: string, offerDescription?: string | null, images?: string[]): Promise<PostComment>;
  deleteComment(id: string, userId: string): Promise<void>;

  // Post Bookmarks
  isPostBookmarked(postId: string, userId: string): Promise<boolean>;
  bookmarkPost(postId: string, userId: string): Promise<PostBookmark>;
  unbookmarkPost(postId: string, userId: string): Promise<void>;
  getBookmarkedPosts(userId: string): Promise<PostWithUser[]>;

  // Endorsements
  getEndorsementsByUser(userId: string): Promise<EndorsementWithUser[]>;
  getEndorsementCount(userId: string): Promise<number>;
  createEndorsement(fromUserId: string, toUserId: string, skill: string): Promise<Endorsement>;
  deleteEndorsement(fromUserId: string, toUserId: string, skill: string): Promise<void>;
  hasEndorsed(fromUserId: string, toUserId: string, skill: string): Promise<boolean>;

  // Saved Searches
  getSavedSearchesByUser(userId: string): Promise<SavedSearch[]>;
  createSavedSearch(search: InsertSavedSearch): Promise<SavedSearch>;
  deleteSavedSearch(id: string, userId: string): Promise<void>;
  updateSavedSearch(id: string, data: Partial<SavedSearch>): Promise<SavedSearch | undefined>;

  // Deal Milestones
  getMilestonesByDeal(dealId: string): Promise<DealMilestone[]>;
  createMilestone(milestone: InsertDealMilestone): Promise<DealMilestone>;
  completeMilestone(id: string, userId: string): Promise<DealMilestone | undefined>;
  deleteMilestone(id: string): Promise<void>;

  // Portfolio Items
  getPortfolioByUser(userId: string): Promise<PortfolioItem[]>;
  createPortfolioItem(item: InsertPortfolioItem): Promise<PortfolioItem>;
  deletePortfolioItem(id: string, userId: string): Promise<void>;

  // Quick Inquiries
  getInquiriesByUser(userId: string): Promise<QuickInquiryWithUsers[]>;
  getInquiriesForUser(userId: string): Promise<QuickInquiryWithUsers[]>;
  createInquiry(inquiry: InsertQuickInquiry): Promise<QuickInquiry>;
  replyToInquiry(id: string, reply: string): Promise<QuickInquiry | undefined>;
  markInquiryRead(id: string): Promise<void>;

  // Listing Likes
  likeListingItem(listingId: string, userId: string): Promise<void>;
  unlikeListingItem(listingId: string, userId: string): Promise<void>;
  isListingLiked(listingId: string, userId: string): Promise<boolean>;
  getListingLikeCount(listingId: string): Promise<number>;

  // Listing Comments
  getListingComments(listingId: string): Promise<ListingCommentWithUser[]>;
  getListingCommentCount(listingId: string): Promise<number>;
  createListingComment(listingId: string, userId: string, content: string | null, offerItemName: string, offerItemValue: string, offerDescription?: string | null, images?: string[]): Promise<ListingComment>;
  updateListingCommentStatus(commentId: string, status: "accepted" | "rejected" | "countered"): Promise<ListingComment>;
  updateListingCommentValuation(commentId: string, valuation: { min: number; max: number; fair: number; confidence: number }): Promise<void>;
  getListingComment(commentId: string): Promise<ListingComment | undefined>;
  submitCounterOffer(commentId: string, counter: { name: string; value: string; description?: string; images?: string[] }): Promise<ListingComment>;
  respondToCounterOffer(commentId: string, response: "accepted" | "rejected"): Promise<ListingComment>;

  // Reviews
  createReview(data: { reviewerId: string; revieweeId: string; listingCommentId?: string; listingId?: string; dealId?: string; rating: number; comment?: string; tags?: string[] }): Promise<import("@shared/schema").Review>;
  getReviewsForUser(userId: string): Promise<import("@shared/schema").ReviewWithReviewer[]>;
  getUserAverageRating(userId: string): Promise<{ avg: number; count: number }>;
  hasReviewedProposal(reviewerId: string, listingCommentId: string): Promise<boolean>;
  hasReviewedDeal(reviewerId: string, dealId: string): Promise<boolean>;

  // Bulk engagement helpers
  getUserLikedListingIds(userId: string): Promise<Set<string>>;
  getListingCommentCounts(): Promise<Map<string, number>>;

  // Recommendations
  getRecommendedUsers(userId: string): Promise<User[]>;
  getRecommendedListings(userId: string, limit?: number): Promise<ListingWithUser[]>;
  getListingsByCity(city: string, excludeUserId?: string, limit?: number): Promise<ListingWithUser[]>;

  // Trending/Featured
  getFeaturedListings(): Promise<ListingWithUser[]>;
  getTrendingPosts(): Promise<PostWithUser[]>;
  getSimilarListings(listingId: string, limit?: number): Promise<ListingWithUser[]>;
  getTrendingListings(limit?: number): Promise<ListingWithUser[]>;
  getRecentCompletedDeals(limit?: number): Promise<DealWithUsers[]>;

  // Waitlist
  createWaitlistEntry(input: InsertWaitlistEntry & { ipAddress?: string | null; userAgent?: string | null }): Promise<WaitlistEntry>;
  getWaitlistEntryByEmail(email: string): Promise<WaitlistEntry | undefined>;
  getWaitlistEntryByReferralCode(code: string): Promise<WaitlistEntry | undefined>;
  listWaitlistEntries(opts?: { limit?: number; offset?: number; country?: string; search?: string }): Promise<WaitlistEntry[]>;
  getWaitlistCount(): Promise<number>;
  getConversionFunnel(): Promise<{ waitlistCount: number; registeredCount: number; listedCount: number; dealtCount: number }>;
  getWaitlistStatsByCountry(): Promise<{ country: string | null; count: number }[]>;
  getWaitlistSignupsByDay(days: number): Promise<{ date: string; count: number }[]>;
  markWaitlistConfirmed(email: string): Promise<void>;
  convertWaitlistEntryToUser(email: string, userId: string): Promise<WaitlistEntry | undefined>;

  // App settings (runtime-tunable key/value pairs)
  getAppSetting(key: string): Promise<string | null>;
  getAllAppSettings(): Promise<Record<string, string>>;
  setAppSetting(key: string, value: string, updatedBy?: string | null): Promise<void>;
  countUserActiveListings(userId: string): Promise<number>;

  // Cookie consent log (append-only audit trail)
  createConsentLog(log: InsertConsentLog): Promise<ConsentLog>;
  listConsentLogs(opts?: { limit?: number; since?: Date }): Promise<ConsentLog[]>;

  // Admin - all listings (including inactive)
  getAllListingsAdmin(): Promise<ListingWithUser[]>;

  // Banned emails
  isBannedEmail(email: string): Promise<boolean>;
  addBannedEmail(email: string, bannedBy: string, reason?: string): Promise<BannedEmail>;
  addBannedEmailHash(emailHash: string, reason?: string): Promise<BannedEmail>;
  removeBannedEmail(email: string): Promise<void>;

  // Moderation logs for listings
  getModerationLogsByTarget(targetId: string, targetType?: string): Promise<ModerationLog[]>;

  // Disputes
  getDisputes(opts?: { status?: string }): Promise<DisputeWithParties[]>;
  getDispute(id: string): Promise<DisputeWithParties | undefined>;
  createDispute(dispute: InsertDispute): Promise<Dispute>;
  updateDispute(id: string, data: Partial<Dispute>): Promise<Dispute | undefined>;

  // Admin Audit Logs
  createAuditLog(log: InsertAdminAuditLog): Promise<AdminAuditLog>;
  getAuditLogs(opts?: { limit?: number; offset?: number; action?: string; adminId?: string; from?: Date; to?: Date }): Promise<AdminAuditLog[]>;

  // Failed Login Attempts
  createFailedLoginAttempt(attempt: InsertFailedLoginAttempt): Promise<FailedLoginAttempt>;
  getFailedLoginAttempts(opts?: { limit?: number; email?: string }): Promise<FailedLoginAttempt[]>;

  // Email logs
  createEmailLog(log: { recipientEmail: string; subject: string; status: string; source: string; broadcastId?: string; errorMessage?: string; sentBy?: string }): Promise<EmailLog>;
  getEmailStats(): Promise<{ total: number; sent: number; failed: number }>;
  createBroadcastJob(job: { id: string; subject: string; body: string; filter?: unknown; recipientCount: number; sentBy?: string }): Promise<BroadcastJob>;
  getBroadcastJob(id: string): Promise<BroadcastJob | undefined>;
  updateBroadcastJob(id: string, data: Partial<Pick<BroadcastJob, "status" | "sent" | "failed" | "startedAt" | "completedAt">>): Promise<void>;

  // Analytics helpers
  getUserSignupsByDay(days: number): Promise<{ date: string; count: number }[]>;
  getNewListingsToday(): Promise<number>;
  getTopListings(limit?: number): Promise<{ id: string; title: string; viewCount: number; proposalCount: number }[]>;

  // Agent toggles
  getAgentEnabled(agentName: string): Promise<boolean>;
  setAgentEnabled(agentName: string, enabled: boolean): Promise<void>;
  getAllAgentToggles(): Promise<{ agentName: string; enabled: boolean }[]>;

  // Legal pages (admin-editable public legal pack)
  getLegalPages(language?: string): Promise<LegalPage[]>;
  getLegalPage(slug: string, language: string): Promise<LegalPage | undefined>;
  upsertLegalPage(
    page: InsertLegalPage,
    publishedBy?: string | null,
  ): Promise<LegalPage>;
  getLegalPageVersions(slug: string, language: string): Promise<LegalPageVersion[]>;
  countLegalPages(): Promise<number>;

  // ── Task #248 — listing drafts, engagement events, reminders ──
  upsertListingDraft(userId: string, data: Record<string, unknown>, opts?: { id?: string; title?: string | null }): Promise<ListingDraft>;
  getListingDraft(id: string): Promise<ListingDraft | undefined>;
  getListingDraftsByUser(userId: string): Promise<ListingDraft[]>;
  deleteListingDraft(id: string, userId: string): Promise<boolean>;
  recordEngagementEvent(event: InsertEngagementEvent): Promise<EngagementEvent>;
  getRecentEngagementForUser(userId: string, limit?: number): Promise<EngagementEvent[]>;
  /** Users whose most recent engagement was 48h–7d ago and who haven't proposed a deal since. */
  getEngagementReminderCandidates(): Promise<{ user: User; lastEvent: EngagementEvent }[]>;
  /** Users with an in-flight Didit session older than `minHours` whose status is still IN_PROGRESS. */
  getVerificationReminderCandidates(): Promise<User[]>;
  getDraftReminderCandidates(): Promise<{ user: User; draft: ListingDraft }[]>;
  countIncompleteVerifications(): Promise<number>;
  countOpenDrafts(): Promise<number>;
  countAbandonedEngagement(): Promise<number>;
  hasUserDealForListing(userId: string, listingId: string): Promise<boolean>;
  hasRecentReminder(userId: string, kind: ReminderKind, targetId: string | null, sinceHours: number): Promise<boolean>;
  recordReminder(userId: string, kind: ReminderKind, targetId?: string | null): Promise<ReminderLogRow>;
  getOrCreateUnsubscribeToken(userId: string): Promise<string>;
  getUserByUnsubscribeToken(token: string): Promise<User | undefined>;

  // Support Tickets
  createSupportTicket(data: InsertSupportTicket & { userId?: string | null; subject: string; requesterName?: string | null; requesterEmail?: string | null }): Promise<SupportTicket>;
  getSupportTicket(id: string): Promise<SupportTicketWithUser | undefined>;
  getSupportTicketByNumber(ticketNumber: string): Promise<SupportTicketWithUser | undefined>;
  getSupportTicketsByUser(userId: string): Promise<SupportTicketWithUser[]>;
  getSupportTicketsByIds(ids: string[]): Promise<SupportTicketWithUser[]>;
  getSupportTicketsByEmail(email: string): Promise<SupportTicketWithUser[]>;
  getAllSupportTickets(opts?: { status?: string; priority?: string; limit?: number; offset?: number }): Promise<SupportTicketWithUser[]>;
  updateSupportTicket(id: string, data: Partial<SupportTicket>): Promise<SupportTicket | undefined>;
  getSupportMessages(ticketId: string, includeInternal?: boolean): Promise<SupportMessageWithSender[]>;
  createSupportMessage(data: InsertSupportMessage): Promise<SupportMessage>;
  getSupportStats(): Promise<{ open: number; in_progress: number; waiting_user: number; resolved: number; closed: number; total: number }>;
}

export class DatabaseStorage implements IStorage {
  // Users
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user;
  }

  async getUserByPhone(phone: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.phone, phone));
    return user;
  }

  async getUserByPasswordResetToken(token: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.passwordResetToken, token));
    return user;
  }

  async getUserByDiditSessionId(sessionId: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.diditSessionId, sessionId));
    return user;
  }

  async getUsersWithPendingVerification(): Promise<User[]> {
    return db.select().from(users).where(
      and(
        isNotNull(users.diditSessionId),
        or(
          inArray(users.kycStatus, ["IN_PROGRESS", "IN_REVIEW", "PENDING_REVIEW"]),
          inArray(users.kybStatus, ["IN_PROGRESS", "IN_REVIEW", "PENDING_REVIEW"]),
        ),
      ),
    );
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db.insert(users).values(insertUser).returning();
    return user;
  }

  async updateUser(id: string, data: Partial<User>): Promise<User | undefined> {
    const [user] = await db
      .update(users)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning();
    return user;
  }

  async getAllUsers(): Promise<User[]> {
    return db.select().from(users).orderBy(desc(users.createdAt));
  }

  // Listings
  async getListing(id: string): Promise<Listing | undefined> {
    const [listing] = await db.select().from(listings).where(eq(listings.id, id));
    return listing;
  }

  async getListingWithUser(id: string): Promise<ListingWithUser | undefined> {
    const result = await db
      .select()
      .from(listings)
      .leftJoin(users, eq(listings.userId, users.id))
      .where(eq(listings.id, id));

    if (result.length === 0) return undefined;

    const { listings: listing, users: user } = result[0];
    return { ...listing, user: user! };
  }

  async getListings(): Promise<ListingWithUser[]> {
    const result = await db
      .select()
      .from(listings)
      .leftJoin(users, eq(listings.userId, users.id))
      .where(eq(listings.isActive, true))
      .orderBy(desc(listings.createdAt));

    return result.map(({ listings: listing, users: user }) => ({
      ...listing,
      user: user!,
    }));
  }

  async getListingsByUser(userId: string): Promise<Listing[]> {
    return db
      .select()
      .from(listings)
      .where(eq(listings.userId, userId))
      .orderBy(desc(listings.createdAt));
  }

  async createListing(insertListing: InsertListing): Promise<Listing> {
    const [listing] = await db.insert(listings).values(insertListing).returning();
    return listing;
  }

  async updateListing(id: string, data: Partial<Listing>): Promise<Listing | undefined> {
    const [listing] = await db
      .update(listings)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(listings.id, id))
      .returning();
    return listing;
  }

  async incrementListingViews(id: string): Promise<void> {
    await db
      .update(listings)
      .set({ viewCount: sql`${listings.viewCount} + 1` })
      .where(eq(listings.id, id));
  }

  // Deals
  async getDeal(id: string): Promise<Deal | undefined> {
    const [deal] = await db.select().from(deals).where(eq(deals.id, id));
    return deal;
  }

  async getDealWithUsers(id: string): Promise<DealWithUsers | undefined> {
    const result = await db
      .select()
      .from(deals)
      .where(eq(deals.id, id));

    if (result.length === 0) return undefined;

    const deal = result[0];
    const [seeker] = await db.select().from(users).where(eq(users.id, deal.seekerId));
    const [provider] = await db.select().from(users).where(eq(users.id, deal.providerId));

    return { ...deal, seeker, provider };
  }

  async getDealsByUser(userId: string): Promise<DealWithUsers[]> {
    const result = await db
      .select()
      .from(deals)
      .where(or(eq(deals.seekerId, userId), eq(deals.providerId, userId)))
      .orderBy(desc(deals.createdAt));

    const dealsWithUsers = await Promise.all(
      result.map(async (deal) => {
        const [seeker] = await db.select().from(users).where(eq(users.id, deal.seekerId));
        const [provider] = await db.select().from(users).where(eq(users.id, deal.providerId));
        return { ...deal, seeker, provider };
      })
    );

    return dealsWithUsers;
  }

  async getAllDeals(): Promise<DealWithUsers[]> {
    const result = await db.select().from(deals).orderBy(desc(deals.createdAt));

    const dealsWithUsers = await Promise.all(
      result.map(async (deal) => {
        const [seeker] = await db.select().from(users).where(eq(users.id, deal.seekerId));
        const [provider] = await db.select().from(users).where(eq(users.id, deal.providerId));
        return { ...deal, seeker, provider };
      })
    );

    return dealsWithUsers;
  }

  async createDeal(insertDeal: InsertDeal): Promise<Deal> {
    const dealNumber = `RCP-${Date.now().toString(36).toUpperCase()}`;
    const [deal] = await db
      .insert(deals)
      .values({ ...insertDeal, dealNumber })
      .returning();
    return deal;
  }

  async updateDeal(id: string, data: Partial<Deal>): Promise<Deal | undefined> {
    const [deal] = await db
      .update(deals)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(deals.id, id))
      .returning();
    return deal;
  }

  // Messages
  async getMessagesByDeal(dealId: string): Promise<MessageWithSender[]> {
    const result = await db
      .select()
      .from(messages)
      .leftJoin(users, eq(messages.senderId, users.id))
      .where(eq(messages.dealId, dealId))
      .orderBy(messages.createdAt);

    return result.map(({ messages: message, users: sender }) => ({
      ...message,
      sender: sender!,
    }));
  }

  async createMessage(insertMessage: InsertMessage): Promise<Message> {
    const [message] = await db.insert(messages).values(insertMessage).returning();
    return message;
  }

  async markMessagesAsRead(dealId: string, userId: string): Promise<void> {
    await db
      .update(messages)
      .set({ isRead: true })
      .where(and(eq(messages.dealId, dealId), eq(messages.senderId, userId)));
  }

  // Ratings
  async getRatingsByUser(userId: string): Promise<Rating[]> {
    return db
      .select()
      .from(ratings)
      .where(eq(ratings.toUserId, userId))
      .orderBy(desc(ratings.createdAt));
  }

  async getRatingsByDeal(dealId: string): Promise<Rating[]> {
    return db.select().from(ratings).where(eq(ratings.dealId, dealId));
  }

  async createRating(insertRating: InsertRating): Promise<Rating> {
    const [rating] = await db.insert(ratings).values(insertRating).returning();
    return rating;
  }

  // Notifications
  async getNotificationsByUser(userId: string): Promise<Notification[]> {
    return db
      .select()
      .from(notifications)
      .where(eq(notifications.userId, userId))
      .orderBy(desc(notifications.createdAt));
  }

  async createNotification(insertNotification: InsertNotification): Promise<Notification> {
    const [notification] = await db
      .insert(notifications)
      .values(insertNotification)
      .returning();
    return notification;
  }

  async markNotificationAsRead(id: string): Promise<void> {
    await db.update(notifications).set({ isRead: true }).where(eq(notifications.id, id));
  }

  async markAllNotificationsAsRead(userId: string): Promise<void> {
    await db
      .update(notifications)
      .set({ isRead: true })
      .where(eq(notifications.userId, userId));
  }

  // Followers
  async getFollowers(userId: string): Promise<(Follower & { follower: User })[]> {
    const result = await db
      .select()
      .from(followers)
      .innerJoin(users, eq(followers.followerId, users.id))
      .where(eq(followers.followingId, userId))
      .orderBy(desc(followers.createdAt));
    
    return result.map(r => ({
      ...r.followers,
      follower: r.users,
    }));
  }

  async getFollowing(userId: string): Promise<(Follower & { following: User })[]> {
    const result = await db
      .select()
      .from(followers)
      .innerJoin(users, eq(followers.followingId, users.id))
      .where(eq(followers.followerId, userId))
      .orderBy(desc(followers.createdAt));
    
    return result.map(r => ({
      ...r.followers,
      following: r.users,
    }));
  }

  async isFollowing(followerId: string, followingId: string): Promise<boolean> {
    const [existing] = await db
      .select()
      .from(followers)
      .where(and(
        eq(followers.followerId, followerId),
        eq(followers.followingId, followingId)
      ));
    return !!existing;
  }

  async followUser(followerId: string, followingId: string): Promise<Follower> {
    const [follower] = await db
      .insert(followers)
      .values({ followerId, followingId })
      .returning();
    return follower;
  }

  async unfollowUser(followerId: string, followingId: string): Promise<void> {
    await db
      .delete(followers)
      .where(and(
        eq(followers.followerId, followerId),
        eq(followers.followingId, followingId)
      ));
  }

  async getFollowerCount(userId: string): Promise<number> {
    const result = await db
      .select({ count: sql<number>`count(*)` })
      .from(followers)
      .where(eq(followers.followingId, userId));
    return Number(result[0]?.count ?? 0);
  }

  async getFollowingCount(userId: string): Promise<number> {
    const result = await db
      .select({ count: sql<number>`count(*)` })
      .from(followers)
      .where(eq(followers.followerId, userId));
    return Number(result[0]?.count ?? 0);
  }

  // Referrals
  async getReferralByUsers(referrerId: string, referredId: string): Promise<Referral | undefined> {
    const [referral] = await db
      .select()
      .from(referrals)
      .where(and(eq(referrals.referrerId, referrerId), eq(referrals.referredId, referredId)));
    return referral;
  }

  async getReferralsByUser(userId: string): Promise<Referral[]> {
    return db
      .select()
      .from(referrals)
      .where(or(eq(referrals.referrerId, userId), eq(referrals.referredId, userId)))
      .orderBy(desc(referrals.createdAt));
  }

  async createReferral(insertReferral: InsertReferral): Promise<Referral> {
    const [referral] = await db.insert(referrals).values(insertReferral).returning();
    return referral;
  }

  async updateReferral(id: string, data: Partial<Referral>): Promise<Referral | undefined> {
    const [referral] = await db
      .update(referrals)
      .set(data)
      .where(eq(referrals.id, id))
      .returning();
    return referral;
  }

  async getUserByReferralCode(code: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.referralCode, code));
    return user;
  }

  // Wishlists
  async getWishlistByUser(userId: string): Promise<(Wishlist & { listing: ListingWithUser })[]> {
    const result = await db
      .select()
      .from(wishlists)
      .innerJoin(listings, eq(wishlists.listingId, listings.id))
      .innerJoin(users, eq(listings.userId, users.id))
      .where(eq(wishlists.userId, userId))
      .orderBy(desc(wishlists.createdAt));

    return result.map(r => ({
      ...r.wishlists,
      listing: { ...r.listings, user: r.users },
    }));
  }

  async isWishlisted(userId: string, listingId: string): Promise<boolean> {
    const [existing] = await db
      .select()
      .from(wishlists)
      .where(and(eq(wishlists.userId, userId), eq(wishlists.listingId, listingId)));
    return !!existing;
  }

  async addToWishlist(userId: string, listingId: string): Promise<Wishlist> {
    const [wishlist] = await db
      .insert(wishlists)
      .values({ userId, listingId })
      .returning();
    return wishlist;
  }

  async removeFromWishlist(userId: string, listingId: string): Promise<void> {
    await db
      .delete(wishlists)
      .where(and(eq(wishlists.userId, userId), eq(wishlists.listingId, listingId)));
  }

  // Posts
  async getPosts(options?: { category?: string; limit?: number; offset?: number; userId?: string }): Promise<PostWithUser[]> {
    const limit = options?.limit || 20;
    const offset = options?.offset || 0;

    const conditions = [eq(posts.isActive, true), eq(posts.isStory, false)];
    if (options?.category && options.category !== "All") {
      conditions.push(eq(posts.feedCategory, options.category));
    }
    if (options?.userId) {
      conditions.push(eq(posts.userId, options.userId));
    }

    const result = await db
      .select()
      .from(posts)
      .leftJoin(users, eq(posts.userId, users.id))
      .where(and(...conditions))
      .orderBy(desc(posts.createdAt))
      .limit(limit)
      .offset(offset);

    return result.map(({ posts: post, users: user }) => {
      const { password, ...safeUser } = user!;
      return { ...post, user: safeUser };
    });
  }

  async getPost(id: string): Promise<PostWithUser | undefined> {
    const result = await db
      .select()
      .from(posts)
      .leftJoin(users, eq(posts.userId, users.id))
      .where(eq(posts.id, id));

    if (result.length === 0) return undefined;

    const { posts: post, users: user } = result[0];
    const { password, ...safeUser } = user!;
    return { ...post, user: safeUser };
  }

  async getStories(): Promise<PostWithUser[]> {
    const result = await db
      .select()
      .from(posts)
      .leftJoin(users, eq(posts.userId, users.id))
      .where(and(eq(posts.isStory, true), eq(posts.isActive, true)))
      .orderBy(desc(posts.createdAt))
      .limit(20);

    return result.map(({ posts: post, users: user }) => {
      const { password, ...safeUser } = user!;
      return { ...post, user: safeUser };
    });
  }

  async createPost(insertPost: InsertPost): Promise<Post> {
    const [post] = await db.insert(posts).values(insertPost).returning();
    return post;
  }

  async likePost(postId: string, userId: string): Promise<void> {
    await db.insert(postLikes).values({ postId, userId });
    await db.update(posts).set({ likeCount: sql`${posts.likeCount} + 1` }).where(eq(posts.id, postId));
  }

  async unlikePost(postId: string, userId: string): Promise<void> {
    await db.delete(postLikes).where(and(eq(postLikes.postId, postId), eq(postLikes.userId, userId)));
    await db.update(posts).set({ likeCount: sql`GREATEST(${posts.likeCount} - 1, 0)` }).where(eq(posts.id, postId));
  }

  async isPostLiked(postId: string, userId: string): Promise<boolean> {
    const [existing] = await db
      .select()
      .from(postLikes)
      .where(and(eq(postLikes.postId, postId), eq(postLikes.userId, userId)));
    return !!existing;
  }

  // Post Comments
  async getCommentsByPost(postId: string): Promise<PostCommentWithUser[]> {
    const result = await db
      .select()
      .from(postComments)
      .leftJoin(users, eq(postComments.userId, users.id))
      .where(eq(postComments.postId, postId))
      .orderBy(desc(postComments.createdAt));

    return result.map(({ post_comments: comment, users: user }) => {
      const { password, ...safeUser } = user!;
      return { ...comment, user: safeUser };
    });
  }

  async getCommentCount(postId: string): Promise<number> {
    const result = await db
      .select({ count: sql<number>`count(*)` })
      .from(postComments)
      .where(eq(postComments.postId, postId));
    return Number(result[0]?.count ?? 0);
  }

  async createComment(postId: string, userId: string, content: string | null, offerItemName: string, offerItemValue: string, offerDescription?: string | null, images?: string[]): Promise<PostComment> {
    const [comment] = await db
      .insert(postComments)
      .values({ postId, userId, content, offerItemName, offerItemValue, offerDescription: offerDescription || null, images: images || [] })
      .returning();
    return comment;
  }

  async deleteComment(id: string, userId: string): Promise<void> {
    await db
      .delete(postComments)
      .where(and(eq(postComments.id, id), eq(postComments.userId, userId)));
  }

  // Post Bookmarks
  async isPostBookmarked(postId: string, userId: string): Promise<boolean> {
    const [existing] = await db
      .select()
      .from(postBookmarks)
      .where(and(eq(postBookmarks.postId, postId), eq(postBookmarks.userId, userId)));
    return !!existing;
  }

  async bookmarkPost(postId: string, userId: string): Promise<PostBookmark> {
    const [bookmark] = await db
      .insert(postBookmarks)
      .values({ postId, userId })
      .returning();
    return bookmark;
  }

  async unbookmarkPost(postId: string, userId: string): Promise<void> {
    await db
      .delete(postBookmarks)
      .where(and(eq(postBookmarks.postId, postId), eq(postBookmarks.userId, userId)));
  }

  async getBookmarkedPosts(userId: string): Promise<PostWithUser[]> {
    const result = await db
      .select()
      .from(postBookmarks)
      .innerJoin(posts, eq(postBookmarks.postId, posts.id))
      .leftJoin(users, eq(posts.userId, users.id))
      .where(eq(postBookmarks.userId, userId))
      .orderBy(desc(postBookmarks.createdAt));

    return result.map(({ posts: post, users: user }) => {
      const { password, ...safeUser } = user!;
      return { ...post, user: safeUser };
    });
  }

  // Endorsements
  async getEndorsementsByUser(userId: string): Promise<EndorsementWithUser[]> {
    const result = await db
      .select()
      .from(endorsements)
      .leftJoin(users, eq(endorsements.fromUserId, users.id))
      .where(eq(endorsements.toUserId, userId))
      .orderBy(desc(endorsements.createdAt));

    return result.map(({ endorsements: endorsement, users: user }) => {
      const { password, ...safeUser } = user!;
      return { ...endorsement, fromUser: safeUser };
    });
  }

  async getEndorsementCount(userId: string): Promise<number> {
    const result = await db
      .select({ count: sql<number>`count(*)` })
      .from(endorsements)
      .where(eq(endorsements.toUserId, userId));
    return Number(result[0]?.count ?? 0);
  }

  async createEndorsement(fromUserId: string, toUserId: string, skill: string): Promise<Endorsement> {
    const [endorsement] = await db
      .insert(endorsements)
      .values({ fromUserId, toUserId, skill })
      .returning();
    return endorsement;
  }

  async deleteEndorsement(fromUserId: string, toUserId: string, skill: string): Promise<void> {
    await db
      .delete(endorsements)
      .where(and(
        eq(endorsements.fromUserId, fromUserId),
        eq(endorsements.toUserId, toUserId),
        eq(endorsements.skill, skill)
      ));
  }

  async hasEndorsed(fromUserId: string, toUserId: string, skill: string): Promise<boolean> {
    const [existing] = await db
      .select()
      .from(endorsements)
      .where(and(
        eq(endorsements.fromUserId, fromUserId),
        eq(endorsements.toUserId, toUserId),
        eq(endorsements.skill, skill)
      ));
    return !!existing;
  }

  // Saved Searches
  async getSavedSearchesByUser(userId: string): Promise<SavedSearch[]> {
    return db
      .select()
      .from(savedSearches)
      .where(eq(savedSearches.userId, userId))
      .orderBy(desc(savedSearches.createdAt));
  }

  async createSavedSearch(search: InsertSavedSearch): Promise<SavedSearch> {
    const [savedSearch] = await db
      .insert(savedSearches)
      .values(search)
      .returning();
    return savedSearch;
  }

  async deleteSavedSearch(id: string, userId: string): Promise<void> {
    await db
      .delete(savedSearches)
      .where(and(eq(savedSearches.id, id), eq(savedSearches.userId, userId)));
  }

  async updateSavedSearch(id: string, data: Partial<SavedSearch>): Promise<SavedSearch | undefined> {
    const [savedSearch] = await db
      .update(savedSearches)
      .set(data)
      .where(eq(savedSearches.id, id))
      .returning();
    return savedSearch;
  }

  // Deal Milestones
  async getMilestonesByDeal(dealId: string): Promise<DealMilestone[]> {
    return db
      .select()
      .from(dealMilestones)
      .where(eq(dealMilestones.dealId, dealId))
      .orderBy(dealMilestones.sortOrder);
  }

  async createMilestone(milestone: InsertDealMilestone): Promise<DealMilestone> {
    const [created] = await db
      .insert(dealMilestones)
      .values(milestone)
      .returning();
    return created;
  }

  async completeMilestone(id: string, userId: string): Promise<DealMilestone | undefined> {
    const [milestone] = await db
      .update(dealMilestones)
      .set({ isCompleted: true, completedAt: new Date(), completedBy: userId })
      .where(eq(dealMilestones.id, id))
      .returning();
    return milestone;
  }

  async deleteMilestone(id: string): Promise<void> {
    await db.delete(dealMilestones).where(eq(dealMilestones.id, id));
  }

  // Portfolio Items
  async getPortfolioByUser(userId: string): Promise<PortfolioItem[]> {
    return db
      .select()
      .from(portfolioItems)
      .where(eq(portfolioItems.userId, userId))
      .orderBy(desc(portfolioItems.createdAt));
  }

  async createPortfolioItem(item: InsertPortfolioItem): Promise<PortfolioItem> {
    const [created] = await db
      .insert(portfolioItems)
      .values(item)
      .returning();
    return created;
  }

  async deletePortfolioItem(id: string, userId: string): Promise<void> {
    await db
      .delete(portfolioItems)
      .where(and(eq(portfolioItems.id, id), eq(portfolioItems.userId, userId)));
  }

  // Quick Inquiries
  async getInquiriesByUser(userId: string): Promise<QuickInquiryWithUsers[]> {
    const result = await db
      .select()
      .from(quickInquiries)
      .where(eq(quickInquiries.fromUserId, userId))
      .orderBy(desc(quickInquiries.createdAt));

    const inquiriesWithUsers = await Promise.all(
      result.map(async (inquiry) => {
        const [fromUser] = await db.select().from(users).where(eq(users.id, inquiry.fromUserId));
        const [toUser] = await db.select().from(users).where(eq(users.id, inquiry.toUserId));
        const { password: p1, ...safeFromUser } = fromUser!;
        const { password: p2, ...safeToUser } = toUser!;
        return { ...inquiry, fromUser: safeFromUser, toUser: safeToUser };
      })
    );

    return inquiriesWithUsers;
  }

  async getInquiriesForUser(userId: string): Promise<QuickInquiryWithUsers[]> {
    const result = await db
      .select()
      .from(quickInquiries)
      .where(eq(quickInquiries.toUserId, userId))
      .orderBy(desc(quickInquiries.createdAt));

    const inquiriesWithUsers = await Promise.all(
      result.map(async (inquiry) => {
        const [fromUser] = await db.select().from(users).where(eq(users.id, inquiry.fromUserId));
        const [toUser] = await db.select().from(users).where(eq(users.id, inquiry.toUserId));
        const { password: p1, ...safeFromUser } = fromUser!;
        const { password: p2, ...safeToUser } = toUser!;
        return { ...inquiry, fromUser: safeFromUser, toUser: safeToUser };
      })
    );

    return inquiriesWithUsers;
  }

  async createInquiry(inquiry: InsertQuickInquiry): Promise<QuickInquiry> {
    const [created] = await db
      .insert(quickInquiries)
      .values(inquiry)
      .returning();
    return created;
  }

  async replyToInquiry(id: string, reply: string): Promise<QuickInquiry | undefined> {
    const [inquiry] = await db
      .update(quickInquiries)
      .set({ reply })
      .where(eq(quickInquiries.id, id))
      .returning();
    return inquiry;
  }

  async markInquiryRead(id: string): Promise<void> {
    await db
      .update(quickInquiries)
      .set({ isRead: true })
      .where(eq(quickInquiries.id, id));
  }

  // Recommendations
  async getRecommendedListings(userId: string, limit = 6): Promise<ListingWithUser[]> {
    const currentUser = await this.getUser(userId);
    if (!currentUser) return [];

    const myNeeds = (currentUser.whatINeed as any[] || []).map((item: any) => (item.name ?? "").toLowerCase()).filter(Boolean);
    const myCategories = (currentUser.whatIOffer as any[] || []).map((item: any) => (item.category ?? item.name ?? "").toLowerCase()).filter(Boolean);

    const result = await db
      .select()
      .from(listings)
      .leftJoin(users, eq(listings.userId, users.id))
      .where(and(
        eq(listings.isActive, true),
        sql`${listings.userId} != ${userId}`,
        eq(listings.moderationStatus, "approved"),
      ))
      .orderBy(desc(listings.createdAt))
      .limit(100);

    const mapped = result.map(({ listings: l, users: u }) => ({ ...l, user: u! }));

    const scored = mapped.map((listing) => {
      const listingCategories = ((listing.categories as string[]) || []).map(c => c.toLowerCase());
      const listingTitle = listing.title.toLowerCase();
      let score = 0;

      for (const need of myNeeds) {
        if (listingTitle.includes(need)) score += 3;
        if (listingCategories.some(c => c.includes(need) || need.includes(c))) score += 2;
      }
      for (const cat of myCategories) {
        if (listingCategories.some(c => c.includes(cat) || cat.includes(c))) score += 1;
      }
      if (listing.isFeatured) score += 1;
      return { listing, score };
    });

    return scored
      .filter(s => s.score > 0 || myNeeds.length === 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(s => s.listing);
  }

  async getListingsByCity(city: string, excludeUserId?: string, limit = 6): Promise<ListingWithUser[]> {
    const conditions = [
      eq(listings.isActive, true),
      eq(listings.moderationStatus, "approved"),
      sql`LOWER(${listings.city}) = LOWER(${city})`,
    ];
    if (excludeUserId) {
      conditions.push(sql`${listings.userId} != ${excludeUserId}`);
    }

    const result = await db
      .select()
      .from(listings)
      .leftJoin(users, eq(listings.userId, users.id))
      .where(and(...conditions))
      .orderBy(desc(listings.createdAt))
      .limit(limit);

    return result.map(({ listings: l, users: u }) => ({ ...l, user: u! }));
  }

  async getRecommendedUsers(userId: string): Promise<User[]> {
    const currentUser = await this.getUser(userId);
    if (!currentUser) return [];

    const allUsers = await db
      .select()
      .from(users)
      .where(sql`${users.id} != ${userId}`)
      .limit(100);

    const myOffers = (currentUser.whatIOffer || []).map((item: any) => item.name?.toLowerCase());
    const myNeeds = (currentUser.whatINeed || []).map((item: any) => item.name?.toLowerCase());

    const recommended = allUsers.filter((user) => {
      const theirOffers = (user.whatIOffer as any[] || []).map((item: any) => item.name?.toLowerCase());
      const theirNeeds = (user.whatINeed as any[] || []).map((item: any) => item.name?.toLowerCase());

      const theyOfferWhatINeed = myNeeds.some((need: string) =>
        theirOffers.some((offer: string) => offer && need && offer.includes(need))
      );
      const theyNeedWhatIOffer = myOffers.some((offer: string) =>
        theirNeeds.some((need: string) => need && offer && need.includes(offer))
      );

      return theyOfferWhatINeed || theyNeedWhatIOffer;
    });

    return recommended.slice(0, 10);
  }

  // Trending/Featured
  async getSimilarListings(listingId: string, limit = 6): Promise<ListingWithUser[]> {
    const [listing] = await db.select().from(listings).where(eq(listings.id, listingId));
    if (!listing) return [];
    const cats = (listing.categories as string[] | null) ?? [];
    const value = Number(listing.retailValue ?? 0);
    const result = await db
      .select()
      .from(listings)
      .leftJoin(users, eq(listings.userId, users.id))
      .where(and(
        eq(listings.isActive, true),
        sql`${listings.id} != ${listingId}`,
        cats.length > 0 ? sql`${listings.categories} ?| array[${sql.raw(cats.map(c => `'${c.replace(/'/g, "''")}'`).join(","))}]` : sql`true`,
      ))
      .orderBy(
        sql`abs(cast(${listings.retailValue} as numeric) - ${value})`,
        desc(listings.createdAt)
      )
      .limit(limit);
    return result.map(({ listings: l, users: u }) => ({ ...l, user: u! }));
  }

  async getTrendingListings(limit = 10): Promise<ListingWithUser[]> {
    // Listings ranked by proposal count in the last 7 days
    const result = await db
      .select({
        listing: listings,
        user: users,
        proposalCount: sql<number>`count(${listingComments.id})`,
      })
      .from(listings)
      .leftJoin(users, eq(listings.userId, users.id))
      .leftJoin(listingComments, and(
        eq(listingComments.listingId, listings.id),
        sql`${listingComments.createdAt} > now() - interval '7 days'`,
      ))
      .where(eq(listings.isActive, true))
      .groupBy(listings.id, users.id)
      .orderBy(desc(sql`count(${listingComments.id})`), desc(listings.createdAt))
      .limit(limit);
    return result.map(({ listing, user }) => ({ ...listing, user: user! }));
  }

  async getFeaturedListings(): Promise<ListingWithUser[]> {
    const result = await db
      .select()
      .from(listings)
      .leftJoin(users, eq(listings.userId, users.id))
      .where(and(
        eq(listings.isFeatured, true),
        eq(listings.isActive, true),
        or(
          sql`${listings.featuredUntil} IS NULL`,
          sql`${listings.featuredUntil} > NOW()`
        )
      ))
      .orderBy(desc(listings.createdAt));

    return result.map(({ listings: listing, users: user }) => ({
      ...listing,
      user: user!,
    }));
  }

  async getRecentCompletedDeals(limit: number = 10): Promise<DealWithUsers[]> {
    const result = await db
      .select()
      .from(deals)
      .where(eq(deals.state, "completed"))
      .orderBy(desc(deals.updatedAt))
      .limit(limit);

    const dealsWithUsers = await Promise.all(
      result.map(async (deal) => {
        const [seeker] = await db.select().from(users).where(eq(users.id, deal.seekerId));
        const [provider] = await db.select().from(users).where(eq(users.id, deal.providerId));
        return { ...deal, seeker, provider };
      })
    );

    return dealsWithUsers;
  }

  async getTrendingPosts(): Promise<PostWithUser[]> {
    const result = await db
      .select()
      .from(posts)
      .leftJoin(users, eq(posts.userId, users.id))
      .where(and(eq(posts.isActive, true), eq(posts.isStory, false)))
      .orderBy(desc(posts.likeCount))
      .limit(10);

    return result.map(({ posts: post, users: user }) => {
      const { password, ...safeUser } = user!;
      return { ...post, user: safeUser };
    });
  }

  // Listing Likes
  async likeListingItem(listingId: string, userId: string): Promise<void> {
    await db.insert(listingLikes).values({ listingId, userId });
    await db.update(listings).set({ likeCount: sql`${listings.likeCount} + 1` }).where(eq(listings.id, listingId));
  }

  async unlikeListingItem(listingId: string, userId: string): Promise<void> {
    await db.delete(listingLikes).where(and(eq(listingLikes.listingId, listingId), eq(listingLikes.userId, userId)));
    await db.update(listings).set({ likeCount: sql`GREATEST(${listings.likeCount} - 1, 0)` }).where(eq(listings.id, listingId));
  }

  async isListingLiked(listingId: string, userId: string): Promise<boolean> {
    const [existing] = await db
      .select()
      .from(listingLikes)
      .where(and(eq(listingLikes.listingId, listingId), eq(listingLikes.userId, userId)));
    return !!existing;
  }

  async getListingLikeCount(listingId: string): Promise<number> {
    const result = await db
      .select({ count: sql<number>`count(*)` })
      .from(listingLikes)
      .where(eq(listingLikes.listingId, listingId));
    return Number(result[0]?.count ?? 0);
  }

  // Listing Comments
  async getListingComments(listingId: string): Promise<ListingCommentWithUser[]> {
    const result = await db
      .select()
      .from(listingComments)
      .leftJoin(users, eq(listingComments.userId, users.id))
      .where(eq(listingComments.listingId, listingId))
      .orderBy(desc(listingComments.createdAt));

    return result.map(({ listing_comments: comment, users: user }) => {
      const { password, ...safeUser } = user!;
      return { ...comment, user: safeUser };
    });
  }

  async getListingCommentCount(listingId: string): Promise<number> {
    const result = await db
      .select({ count: sql<number>`count(*)` })
      .from(listingComments)
      .where(eq(listingComments.listingId, listingId));
    return Number(result[0]?.count ?? 0);
  }

  async createListingComment(listingId: string, userId: string, content: string | null, offerItemName: string, offerItemValue: string, offerDescription?: string | null, images?: string[]): Promise<ListingComment> {
    const [comment] = await db
      .insert(listingComments)
      .values({ listingId, userId, content, offerItemName, offerItemValue, offerDescription: offerDescription || null, images: images || [] })
      .returning();
    return comment;
  }

  async updateListingCommentStatus(commentId: string, status: "accepted" | "rejected" | "countered"): Promise<ListingComment> {
    const [updated] = await db
      .update(listingComments)
      .set({ status })
      .where(eq(listingComments.id, commentId))
      .returning();
    return updated;
  }

  async getListingComment(commentId: string): Promise<ListingComment | undefined> {
    const [row] = await db.select().from(listingComments).where(eq(listingComments.id, commentId));
    return row;
  }

  async submitCounterOffer(commentId: string, counter: { name: string; value: string; description?: string; images?: string[] }): Promise<ListingComment> {
    const [updated] = await db
      .update(listingComments)
      .set({
        status: "countered",
        counterOfferName: counter.name,
        counterOfferValue: counter.value,
        counterOfferDescription: counter.description ?? null,
        counterOfferImages: counter.images ?? [],
        counterOfferStatus: "pending",
        counterOfferedAt: new Date(),
      })
      .where(eq(listingComments.id, commentId))
      .returning();
    return updated;
  }

  async respondToCounterOffer(commentId: string, response: "accepted" | "rejected"): Promise<ListingComment> {
    const newStatus = response === "accepted" ? "accepted" : "rejected";
    const [updated] = await db
      .update(listingComments)
      .set({ counterOfferStatus: response, status: newStatus })
      .where(eq(listingComments.id, commentId))
      .returning();
    return updated;
  }

  async createReview(data: { reviewerId: string; revieweeId: string; listingCommentId?: string; listingId?: string; dealId?: string; rating: number; comment?: string; tags?: string[] }): Promise<Review> {
    const [row] = await db
      .insert(reviews)
      .values({
        reviewerId: data.reviewerId,
        revieweeId: data.revieweeId,
        listingCommentId: data.listingCommentId ?? null,
        listingId: data.listingId ?? null,
        rating: data.rating,
        comment: data.comment ?? null,
        tags: data.tags ?? [],
      })
      .returning();
    // Update reviewee's credibility score
    const allReviews = await this.getReviewsForUser(data.revieweeId);
    if (allReviews.length > 0) {
      const avg = allReviews.reduce((s, r) => s + r.rating, 0) / allReviews.length;
      await db.update(users).set({ credibilityScore: Math.round(avg * 20) }).where(eq(users.id, data.revieweeId));
    }
    return row;
  }

  async getReviewsForUser(userId: string): Promise<ReviewWithReviewer[]> {
    const rows = await db
      .select({
        review: reviews,
        reviewer: {
          id: users.id,
          fullName: users.fullName,
          avatarUrl: users.avatarUrl,
          isVerified: users.isVerified,
        },
      })
      .from(reviews)
      .innerJoin(users, eq(reviews.reviewerId, users.id))
      .where(eq(reviews.revieweeId, userId))
      .orderBy(desc(reviews.createdAt));
    return rows.map(r => ({ ...r.review, reviewer: r.reviewer }));
  }

  async getUserAverageRating(userId: string): Promise<{ avg: number; count: number }> {
    const result = await db
      .select({ avg: sql<number>`avg(rating)`, count: sql<number>`count(*)` })
      .from(reviews)
      .where(eq(reviews.revieweeId, userId));
    return { avg: Number(result[0]?.avg ?? 0), count: Number(result[0]?.count ?? 0) };
  }

  async hasReviewedProposal(reviewerId: string, listingCommentId: string): Promise<boolean> {
    const [row] = await db
      .select({ id: reviews.id })
      .from(reviews)
      .where(and(eq(reviews.reviewerId, reviewerId), eq(reviews.listingCommentId, listingCommentId)));
    return !!row;
  }

  async hasReviewedDeal(reviewerId: string, dealId: string): Promise<boolean> {
    const deal = await db.select().from(deals).where(eq(deals.id, dealId)).limit(1);
    if (!deal[0]) return false;
    const d = deal[0];
    const otherUserId = d.seekerId === reviewerId ? d.providerId : d.seekerId;
    const [row] = await db
      .select({ id: reviews.id })
      .from(reviews)
      .where(and(eq(reviews.reviewerId, reviewerId), eq(reviews.revieweeId, otherUserId)));
    return !!row;
  }

  async updateListingCommentValuation(commentId: string, valuation: { min: number; max: number; fair: number; confidence: number }): Promise<void> {
    await db
      .update(listingComments)
      .set({
        valuationMinAed: String(valuation.min),
        valuationMaxAed: String(valuation.max),
        valuationFairAed: String(valuation.fair),
        valuationConfidence: String(valuation.confidence),
      })
      .where(eq(listingComments.id, commentId));
  }

  async getUserLikedListingIds(userId: string): Promise<Set<string>> {
    const rows = await db
      .select({ listingId: listingLikes.listingId })
      .from(listingLikes)
      .where(eq(listingLikes.userId, userId));
    return new Set(rows.map(r => r.listingId));
  }

  async getListingCommentCounts(): Promise<Map<string, number>> {
    const rows = await db
      .select({ listingId: listingComments.listingId, count: sql<number>`count(*)` })
      .from(listingComments)
      .groupBy(listingComments.listingId);
    const map = new Map<string, number>();
    for (const r of rows) map.set(r.listingId, Number(r.count));
    return map;
  }

  // Waitlist
  private generateReferralCode(): string {
    return crypto.randomBytes(6).toString("base64url").slice(0, 8).toUpperCase();
  }

  async createWaitlistEntry(input: InsertWaitlistEntry & { ipAddress?: string | null; userAgent?: string | null }): Promise<WaitlistEntry> {
    let code = this.generateReferralCode();
    for (let i = 0; i < 5; i++) {
      const existing = await this.getWaitlistEntryByReferralCode(code);
      if (!existing) break;
      code = this.generateReferralCode();
    }

    type PgUniqueViolation = Error & { code?: string; constraint?: string; detail?: string };
    const isPgUniqueViolation = (e: unknown): e is PgUniqueViolation =>
      typeof e === "object" && e !== null && (e as { code?: string }).code === "23505";

    const fetchNextPosition = async (): Promise<number> => {
      const result = await db.execute<{ next: number }>(
        sql`SELECT COALESCE(MAX(position), 0) + 1 AS next FROM waitlist_entries`
      );
      const rows = (result as unknown as { rows?: Array<{ next: number | string | null }> }).rows
        ?? (result as unknown as Array<{ next: number | string | null }>);
      const raw = rows && rows[0] ? rows[0].next : null;
      return Number(raw ?? 1);
    };

    let entry: WaitlistEntry | undefined;
    let lastError: unknown;
    const MAX_ATTEMPTS = 25;
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const nextPosition = await fetchNextPosition();
      try {
        const [inserted] = await db
          .insert(waitlistEntries)
          .values({
            email: input.email,
            name: input.name ?? null,
            country: input.country ?? null,
            city: input.city ?? null,
            accountType: input.accountType ?? null,
            businessName: input.businessName ?? null,
            categoriesOfInterest: input.categoriesOfInterest ?? [],
            source: input.source ?? null,
            referredByCode: input.referredByCode ?? null,
            referralCode: code,
            position: nextPosition,
            ipAddress: input.ipAddress ?? null,
            userAgent: input.userAgent ?? null,
          })
          .returning();
        entry = inserted;
        break;
      } catch (err: unknown) {
        lastError = err;
        if (!isPgUniqueViolation(err)) throw err;
        const constraint = `${err.constraint ?? ""} ${err.detail ?? ""}`;
        if (/position/i.test(constraint)) {
          // Race on position — small jittered backoff, recompute and retry
          await new Promise((r) => setTimeout(r, 5 + Math.floor(Math.random() * 20)));
          continue;
        }
        if (/referral_code/i.test(constraint)) {
          code = this.generateReferralCode();
          continue;
        }
        throw err;
      }
    }

    if (!entry) {
      throw lastError instanceof Error
        ? lastError
        : new Error("Failed to allocate waitlist position after multiple attempts");
    }

    if (input.referredByCode) {
      await db
        .update(waitlistEntries)
        .set({ referralCount: sql`COALESCE(${waitlistEntries.referralCount}, 0) + 1` })
        .where(eq(waitlistEntries.referralCode, input.referredByCode));
    }

    return entry;
  }

  async getWaitlistEntryByEmail(email: string): Promise<WaitlistEntry | undefined> {
    const [row] = await db
      .select()
      .from(waitlistEntries)
      .where(eq(waitlistEntries.email, email.trim().toLowerCase()));
    return row;
  }

  async getWaitlistEntryByReferralCode(code: string): Promise<WaitlistEntry | undefined> {
    const [row] = await db
      .select()
      .from(waitlistEntries)
      .where(eq(waitlistEntries.referralCode, code));
    return row;
  }

  async listWaitlistEntries(opts: { limit?: number; offset?: number; country?: string; search?: string } = {}): Promise<WaitlistEntry[]> {
    const limit = Math.min(opts.limit ?? 100, 50000);
    const offset = opts.offset ?? 0;
    const conds: any[] = [];
    if (opts.country) conds.push(eq(waitlistEntries.country, opts.country));
    if (opts.search) {
      const q = `%${opts.search.toLowerCase()}%`;
      conds.push(sql`(LOWER(${waitlistEntries.email}) LIKE ${q} OR LOWER(COALESCE(${waitlistEntries.name}, '')) LIKE ${q})`);
    }
    const where = conds.length ? and(...conds) : undefined;
    const q = db.select().from(waitlistEntries);
    const rows = where
      ? await q.where(where).orderBy(desc(waitlistEntries.referralCount), waitlistEntries.position).limit(limit).offset(offset)
      : await q.orderBy(desc(waitlistEntries.referralCount), waitlistEntries.position).limit(limit).offset(offset);
    return rows;
  }

  async getWaitlistCount(): Promise<number> {
    const [row] = await db.select({ c: sql<number>`count(*)` }).from(waitlistEntries);
    return Number(row?.c ?? 0);
  }

  async getConversionFunnel(): Promise<{ waitlistCount: number; registeredCount: number; listedCount: number; dealtCount: number }> {
    const [wlRow] = await db.select({ c: sql<number>`count(*)` }).from(waitlistEntries);
    const [usersRow] = await db.select({ c: sql<number>`count(*)` }).from(users);
    const [listedRow] = await db.select({ c: sql<number>`count(distinct ${listings.userId})` }).from(listings);

    // Count unique users who participated in at least one completed deal (as seeker OR provider)
    // Fetch both sets and union in JS to avoid db.execute shape ambiguity
    const seekerRows = await db
      .selectDistinct({ uid: deals.seekerId })
      .from(deals)
      .where(eq(deals.state, "completed"));
    const providerRows = await db
      .selectDistinct({ uid: deals.providerId })
      .from(deals)
      .where(eq(deals.state, "completed"));
    const uniqueDealtUsers = new Set([
      ...seekerRows.map((r) => r.uid),
      ...providerRows.map((r) => r.uid),
    ]);

    return {
      waitlistCount: Number(wlRow?.c ?? 0),
      registeredCount: Number(usersRow?.c ?? 0),
      listedCount: Number(listedRow?.c ?? 0),
      dealtCount: uniqueDealtUsers.size,
    };
  }

  async getAppSetting(key: string): Promise<string | null> {
    const [row] = await db.select().from(appSettings).where(eq(appSettings.key, key)).limit(1);
    return row?.value ?? null;
  }

  async getAllAppSettings(): Promise<Record<string, string>> {
    const rows = await db.select().from(appSettings);
    const result: Record<string, string> = {};
    for (const row of rows) {
      result[row.key] = row.value;
    }
    return result;
  }

  async setAppSetting(key: string, value: string, updatedBy?: string | null): Promise<void> {
    await db
      .insert(appSettings)
      .values({ key, value, updatedBy: updatedBy ?? null })
      .onConflictDoUpdate({
        target: appSettings.key,
        set: { value, updatedBy: updatedBy ?? null, updatedAt: new Date() },
      });
  }

  async countUserActiveListings(userId: string): Promise<number> {
    const [row] = await db
      .select({ c: sql<number>`count(*)` })
      .from(listings)
      .where(and(
        eq(listings.userId, userId),
        eq(listings.isActive, true)
      ));
    return Number(row?.c ?? 0);
  }

  async getWaitlistStatsByCountry(): Promise<{ country: string | null; count: number }[]> {
    const rows = await db
      .select({ country: waitlistEntries.country, count: sql<number>`count(*)` })
      .from(waitlistEntries)
      .groupBy(waitlistEntries.country);
    return rows.map(r => ({ country: r.country, count: Number(r.count) }));
  }

  async getWaitlistSignupsByDay(days: number): Promise<{ date: string; count: number }[]> {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const rows = await db.execute<any>(sql`
      SELECT TO_CHAR(DATE_TRUNC('day', created_at), 'YYYY-MM-DD') AS date,
             COUNT(*)::int AS count
      FROM waitlist_entries
      WHERE created_at >= ${since}
      GROUP BY 1
      ORDER BY 1
    `);
    const list = (rows as any).rows ?? rows;
    return list.map((r: any) => ({ date: r.date, count: Number(r.count) }));
  }

  async markWaitlistConfirmed(email: string): Promise<void> {
    await db
      .update(waitlistEntries)
      .set({ confirmedAt: new Date() })
      .where(eq(waitlistEntries.email, email.trim().toLowerCase()));
  }

  // ── Legal pages ────────────────────────────────────────────────────────
  async getLegalPages(language?: string): Promise<LegalPage[]> {
    const q = db.select().from(legalPages);
    const rows = language
      ? await q.where(eq(legalPages.language, language))
      : await q;
    return rows;
  }

  async getLegalPage(slug: string, language: string): Promise<LegalPage | undefined> {
    const [row] = await db
      .select()
      .from(legalPages)
      .where(and(eq(legalPages.slug, slug), eq(legalPages.language, language)))
      .limit(1);
    return row;
  }

  async upsertLegalPage(
    page: InsertLegalPage,
    publishedBy?: string | null,
  ): Promise<LegalPage> {
    const existing = await this.getLegalPage(page.slug, page.language);
    const nextVersion = (existing?.version ?? 0) + 1;

    // Snapshot the *previous* live row into the audit history before we
    // overwrite it. The first-ever insert has nothing to snapshot.
    if (existing) {
      await db.insert(legalPageVersions).values({
        slug: existing.slug,
        language: existing.language,
        version: existing.version,
        title: existing.title,
        subtitle: existing.subtitle,
        blocks: existing.blocks,
        effectiveDate: existing.effectiveDate,
        publishedBy: existing.updatedBy ?? null,
      });
    }

    const values: InsertLegalPage & { version: number; updatedAt: Date; updatedBy: string | null } = {
      slug: page.slug,
      language: page.language,
      title: page.title,
      subtitle: page.subtitle ?? "",
      blocks: page.blocks,
      effectiveDate: page.effectiveDate,
      version: nextVersion,
      updatedAt: new Date(),
      updatedBy: publishedBy ?? null,
    };

    const [row] = await db
      .insert(legalPages)
      .values(values)
      .onConflictDoUpdate({
        target: [legalPages.slug, legalPages.language],
        set: {
          title: values.title,
          subtitle: values.subtitle,
          blocks: values.blocks,
          effectiveDate: values.effectiveDate,
          version: values.version,
          updatedAt: values.updatedAt,
          updatedBy: values.updatedBy,
        },
      })
      .returning();
    return row;
  }

  async getLegalPageVersions(
    slug: string,
    language: string,
  ): Promise<LegalPageVersion[]> {
    return db
      .select()
      .from(legalPageVersions)
      .where(and(eq(legalPageVersions.slug, slug), eq(legalPageVersions.language, language)))
      .orderBy(desc(legalPageVersions.version));
  }

  async countLegalPages(): Promise<number> {
    const [row] = await db
      .select({ c: sql<number>`count(*)` })
      .from(legalPages);
    return Number(row?.c ?? 0);
  }

  // Cookie consent log
  async createConsentLog(log: InsertConsentLog): Promise<ConsentLog> {
    const [row] = await db.insert(consentLogs).values(log).returning();
    return row;
  }

  async listConsentLogs(
    opts: { limit?: number; since?: Date } = {},
  ): Promise<ConsentLog[]> {
    const limit = Math.min(Math.max(opts.limit ?? 10000, 1), 50000);
    const where = opts.since
      ? sql`${consentLogs.createdAt} >= ${opts.since}`
      : undefined;
    const q = db.select().from(consentLogs).orderBy(desc(consentLogs.createdAt)).limit(limit);
    return where ? await q.where(where) : await q;
  }

  async convertWaitlistEntryToUser(email: string, userId: string): Promise<WaitlistEntry | undefined> {
    const [row] = await db
      .update(waitlistEntries)
      .set({ convertedUserId: userId })
      .where(eq(waitlistEntries.email, email.trim().toLowerCase()))
      .returning();
    return row;
  }

  async getAllListingsAdmin(): Promise<ListingWithUser[]> {
    const result = await db
      .select()
      .from(listings)
      .leftJoin(users, eq(listings.userId, users.id))
      .orderBy(desc(listings.createdAt));

    return result.map(({ listings: listing, users: user }) => ({
      ...listing,
      user: user!,
    }));
  }

  private hashEmail(email: string): string {
    return crypto.createHash("sha256").update(email.trim().toLowerCase()).digest("hex");
  }

  async isBannedEmail(email: string): Promise<boolean> {
    const hash = this.hashEmail(email);
    const [row] = await db
      .select()
      .from(bannedEmails)
      .where(or(eq(bannedEmails.email, email.trim().toLowerCase()), eq(bannedEmails.email, hash)));
    return !!row;
  }

  async addBannedEmail(email: string, bannedBy: string, reason?: string): Promise<BannedEmail> {
    const [row] = await db
      .insert(bannedEmails)
      .values({ email: email.trim().toLowerCase(), bannedBy, reason: reason || null })
      .onConflictDoNothing()
      .returning();
    if (!row) {
      const [existing] = await db.select().from(bannedEmails).where(eq(bannedEmails.email, email.trim().toLowerCase()));
      return existing;
    }
    return row;
  }

  async addBannedEmailHash(emailHash: string, reason?: string): Promise<BannedEmail> {
    const [row] = await db
      .insert(bannedEmails)
      .values({ email: emailHash, bannedBy: null, reason: reason || null })
      .onConflictDoNothing()
      .returning();
    if (!row) {
      const [existing] = await db.select().from(bannedEmails).where(eq(bannedEmails.email, emailHash));
      return existing;
    }
    return row;
  }

  async removeBannedEmail(email: string): Promise<void> {
    const hash = this.hashEmail(email);
    await db.delete(bannedEmails).where(or(eq(bannedEmails.email, email.trim().toLowerCase()), eq(bannedEmails.email, hash)));
  }

  async getModerationLogsByTarget(targetId: string, targetType?: string): Promise<ModerationLog[]> {
    const conditions = [eq(moderationLogs.targetId, targetId)];
    if (targetType) {
      conditions.push(eq(moderationLogs.targetType, targetType));
    }
    return db
      .select()
      .from(moderationLogs)
      .where(and(...conditions))
      .orderBy(desc(moderationLogs.createdAt));
  }

  async getDisputes(opts?: { status?: string }): Promise<DisputeWithParties[]> {
    const partyA = db.select().from(users).as("partyA");
    const partyB = db.select().from(users).as("partyB");
    const decisionAdmin = db.select().from(users).as("decisionAdmin");

    let query = db
      .select()
      .from(disputes)
      .leftJoin(partyA, eq(disputes.partyAId, sql`"partyA"."id"`))
      .leftJoin(partyB, eq(disputes.partyBId, sql`"partyB"."id"`))
      .leftJoin(decisionAdmin, eq(disputes.decisionBy, sql`"decisionAdmin"."id"`))
      .orderBy(desc(disputes.createdAt));

    const rows = opts?.status
      ? await query.where(eq(disputes.status, opts.status))
      : await query;

    type DisputeRow = {
      disputes: Dispute;
      partyA: User | null;
      partyB: User | null;
      decisionAdmin: User | null;
    };

    return (rows as DisputeRow[]).map((r) => {
      const { password: _pA, ...partyAData } = r.partyA || {} as User;
      const { password: _pB, ...partyBData } = r.partyB || {} as User;
      const decisionByAdmin = r.decisionAdmin
        ? (() => { const { password: _pD, ...d } = r.decisionAdmin; return d; })()
        : null;
      return {
        ...r.disputes,
        partyA: partyAData,
        partyB: partyBData,
        decisionByAdmin,
      } as DisputeWithParties;
    });
  }

  async getDispute(id: string): Promise<DisputeWithParties | undefined> {
    const partyA = db.select().from(users).as("partyA");
    const partyB = db.select().from(users).as("partyB");
    const decisionAdmin = db.select().from(users).as("decisionAdmin");

    const rows = await db
      .select()
      .from(disputes)
      .leftJoin(partyA, eq(disputes.partyAId, sql`"partyA"."id"`))
      .leftJoin(partyB, eq(disputes.partyBId, sql`"partyB"."id"`))
      .leftJoin(decisionAdmin, eq(disputes.decisionBy, sql`"decisionAdmin"."id"`))
      .where(eq(disputes.id, id));

    if (!rows.length) return undefined;
    type DisputeRow = {
      disputes: Dispute;
      partyA: User | null;
      partyB: User | null;
      decisionAdmin: User | null;
    };
    const r = rows[0] as DisputeRow;
    const { password: _pA, ...partyAData } = r.partyA || {} as User;
    const { password: _pB, ...partyBData } = r.partyB || {} as User;
    const decisionByAdmin = r.decisionAdmin
      ? (() => { const { password: _pD, ...d } = r.decisionAdmin; return d; })()
      : null;
    return {
      ...r.disputes,
      partyA: partyAData,
      partyB: partyBData,
      decisionByAdmin,
    } as DisputeWithParties;
  }

  async createDispute(dispute: InsertDispute): Promise<Dispute> {
    const [row] = await db.insert(disputes).values(dispute).returning();
    return row;
  }

  async updateDispute(id: string, data: Partial<Dispute>): Promise<Dispute | undefined> {
    const [row] = await db
      .update(disputes)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(disputes.id, id))
      .returning();
    return row;
  }

  async createAuditLog(log: InsertAdminAuditLog): Promise<AdminAuditLog> {
    const [row] = await db.insert(adminAuditLogs).values(log).returning();
    return row;
  }

  async getAuditLogs(opts?: { limit?: number; offset?: number; action?: string; adminId?: string; from?: Date; to?: Date }): Promise<AdminAuditLog[]> {
    const limit = Math.min(opts?.limit ?? 100, 500);
    const offset = opts?.offset ?? 0;
    const conditions: ReturnType<typeof eq>[] = [];
    if (opts?.action) conditions.push(eq(adminAuditLogs.action, opts.action));
    if (opts?.adminId) conditions.push(eq(adminAuditLogs.adminId, opts.adminId));
    if (opts?.from) conditions.push(sql`${adminAuditLogs.createdAt} >= ${opts.from}` as ReturnType<typeof eq>);
    if (opts?.to) conditions.push(sql`${adminAuditLogs.createdAt} <= ${opts.to}` as ReturnType<typeof eq>);
    const query = db.select().from(adminAuditLogs).orderBy(desc(adminAuditLogs.createdAt)).limit(limit).offset(offset);
    return conditions.length > 0 ? await query.where(and(...conditions)) : await query;
  }

  async createFailedLoginAttempt(attempt: InsertFailedLoginAttempt): Promise<FailedLoginAttempt> {
    const [row] = await db.insert(failedLoginAttempts).values(attempt).returning();
    return row;
  }

  async getFailedLoginAttempts(opts?: { limit?: number; email?: string }): Promise<FailedLoginAttempt[]> {
    const limit = Math.min(opts?.limit ?? 100, 500);
    const query = db.select().from(failedLoginAttempts).orderBy(desc(failedLoginAttempts.createdAt)).limit(limit);
    return opts?.email ? await query.where(eq(failedLoginAttempts.email, opts.email)) : await query;
  }
  // ── Broadcast jobs ───────────────────────────────────────────────
  async createBroadcastJob(job: { id: string; subject: string; body: string; filter?: unknown; recipientCount: number; sentBy?: string }): Promise<BroadcastJob> {
    const [row] = await db.insert(broadcastJobs).values({
      id: job.id,
      subject: job.subject,
      body: job.body,
      filter: job.filter ?? null,
      recipientCount: job.recipientCount,
      status: "queued",
      sentBy: job.sentBy,
    }).returning();
    return row;
  }

  async getBroadcastJob(id: string): Promise<BroadcastJob | undefined> {
    const [row] = await db.select().from(broadcastJobs).where(eq(broadcastJobs.id, id));
    return row;
  }

  async updateBroadcastJob(id: string, data: Partial<Pick<BroadcastJob, "status" | "sent" | "failed" | "startedAt" | "completedAt">>): Promise<void> {
    await db.update(broadcastJobs).set(data).where(eq(broadcastJobs.id, id));
  }

  // ── Email logs ──────────────────────────────────────────────────────
  async createEmailLog(log: { recipientEmail: string; subject: string; status: string; source: string; broadcastId?: string; errorMessage?: string; sentBy?: string }): Promise<EmailLog> {
    const [row] = await db.insert(emailLogs).values(log).returning();
    return row;
  }

  async getEmailStats(): Promise<{ total: number; sent: number; failed: number }> {
    const rows = await db
      .select({ status: emailLogs.status, c: sql<number>`count(*)` })
      .from(emailLogs)
      .groupBy(emailLogs.status);
    let total = 0, sent = 0, failed = 0;
    for (const r of rows) {
      const n = Number(r.c);
      total += n;
      if (r.status === "sent") sent += n;
      if (r.status === "failed") failed += n;
    }
    return { total, sent, failed };
  }

  // ── Analytics helpers ─────────────────────────────────────────────
  async getUserSignupsByDay(days: number): Promise<{ date: string; count: number }[]> {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const rows = await db.execute(sql`
      SELECT TO_CHAR(DATE_TRUNC('day', created_at), 'YYYY-MM-DD') AS date,
             COUNT(*)::int AS count
      FROM users
      WHERE created_at >= ${since}
      GROUP BY 1
      ORDER BY 1
    `);
    const list = (rows as { rows?: unknown[] }).rows ?? (rows as unknown[]);
    return (list as { date: string; count: number | string }[]).map((r) => ({ date: r.date, count: Number(r.count) }));
  }

  async getNewListingsToday(): Promise<number> {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const [row] = await db
      .select({ c: sql<number>`count(*)` })
      .from(listings)
      .where(gte(listings.createdAt, todayStart));
    return Number(row?.c ?? 0);
  }

  async getTopListings(limit: number = 10): Promise<{ id: string; title: string; viewCount: number; proposalCount: number }[]> {
    const rows = await db.execute(sql`
      SELECT l.id, l.title, COALESCE(l.view_count, 0)::int AS "viewCount",
             (SELECT COUNT(*)::int FROM deals d WHERE d.seeker_listing_id = l.id OR d.provider_listing_id = l.id) AS "proposalCount"
      FROM listings l
      WHERE l.is_active = true
      ORDER BY COALESCE(l.view_count, 0) DESC, "proposalCount" DESC
      LIMIT ${limit}
    `);
    const list = (rows as { rows?: unknown[] }).rows ?? (rows as unknown[]);
    return (list as { id: string; title: string; viewCount: number | string; proposalCount: number | string }[]).map((r) => ({
      id: r.id,
      title: r.title,
      viewCount: Number(r.viewCount),
      proposalCount: Number(r.proposalCount),
    }));
  }

  // ── Agent toggles ─────────────────────────────────────────────────
  async getAgentEnabled(agentName: string): Promise<boolean> {
    const [row] = await db.select({ enabled: agentBudgets.enabled }).from(agentBudgets).where(eq(agentBudgets.agentName, agentName));
    return row?.enabled !== false;
  }

  async setAgentEnabled(agentName: string, enabled: boolean): Promise<void> {
    const { AGENT_LIMITS_AED } = await import("./companyOs/costTracker.js");
    const defaultCap = AGENT_LIMITS_AED[agentName] ?? 40;
    await db
      .insert(agentBudgets)
      .values({ agentName, monthlyCapAed: defaultCap.toFixed(2), enabled, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: agentBudgets.agentName,
        set: { enabled, updatedAt: new Date() },
      });
  }

  async getAllAgentToggles(): Promise<{ agentName: string; enabled: boolean }[]> {
    const rows = await db.select({ agentName: agentBudgets.agentName, enabled: agentBudgets.enabled }).from(agentBudgets);
    return rows.map(r => ({ agentName: r.agentName, enabled: r.enabled !== false }));
  }

  // ── Support Tickets ─────────────────────────────────────────────
  private async enrichTicket(ticket: SupportTicket): Promise<SupportTicketWithUser> {
    const [user] = ticket.userId
      ? await db.select().from(users).where(eq(users.id, ticket.userId))
      : [undefined];
    const assignee = ticket.assignedTo
      ? (await db.select().from(users).where(eq(users.id, ticket.assignedTo)))[0]
      : null;
    const [msgCount] = await db
      .select({ c: sql<number>`count(*)` })
      .from(supportMessages)
      .where(and(eq(supportMessages.ticketId, ticket.id), eq(supportMessages.isInternal, false)));
    const lastMsgs = await db
      .select({ content: supportMessages.content })
      .from(supportMessages)
      .where(and(eq(supportMessages.ticketId, ticket.id), eq(supportMessages.isInternal, false)))
      .orderBy(desc(supportMessages.createdAt))
      .limit(1);
    const safeUser = user ? (({ password: _pw, ...rest }) => rest)(user) : null;
    const assigneeOut = assignee ? (({ password: _pw2, ...rest }) => rest)(assignee) : null;
    return {
      ...ticket,
      user: safeUser,
      assignee: assigneeOut,
      messageCount: Number(msgCount?.c ?? 0),
      lastMessage: lastMsgs[0]?.content ?? null,
    };
  }

  async createSupportTicket(data: InsertSupportTicket & { userId?: string | null; subject: string; requesterName?: string | null; requesterEmail?: string | null }): Promise<SupportTicket> {
    const { randomBytes } = await import("crypto");
    const ticketNumber = `TKT-${randomBytes(6).toString("hex").toUpperCase()}`;
    const [ticket] = await db
      .insert(supportTickets)
      .values({ ...data, ticketNumber })
      .returning();
    return ticket;
  }

  async getSupportTicket(id: string): Promise<SupportTicketWithUser | undefined> {
    const [ticket] = await db.select().from(supportTickets).where(eq(supportTickets.id, id));
    if (!ticket) return undefined;
    return this.enrichTicket(ticket);
  }

  async getSupportTicketByNumber(ticketNumber: string): Promise<SupportTicketWithUser | undefined> {
    const [ticket] = await db.select().from(supportTickets).where(eq(supportTickets.ticketNumber, ticketNumber));
    if (!ticket) return undefined;
    return this.enrichTicket(ticket);
  }

  async getSupportTicketsByUser(userId: string): Promise<SupportTicketWithUser[]> {
    const rows = await db
      .select()
      .from(supportTickets)
      .where(eq(supportTickets.userId, userId))
      .orderBy(desc(supportTickets.lastActivityAt));
    return Promise.all(rows.map(t => this.enrichTicket(t)));
  }

  async getSupportTicketsByIds(ids: string[]): Promise<SupportTicketWithUser[]> {
    if (!ids.length) return [];
    const rows = await db
      .select()
      .from(supportTickets)
      .where(inArray(supportTickets.id, ids))
      .orderBy(desc(supportTickets.lastActivityAt));
    return Promise.all(rows.map(t => this.enrichTicket(t)));
  }

  async getSupportTicketsByEmail(email: string): Promise<SupportTicketWithUser[]> {
    if (!email) return [];
    const normalised = email.trim().toLowerCase();
    const rows = await db
      .select()
      .from(supportTickets)
      .where(eq(supportTickets.requesterEmail, normalised))
      .orderBy(desc(supportTickets.lastActivityAt));
    return Promise.all(rows.map(t => this.enrichTicket(t)));
  }

  async getAllSupportTickets(opts?: { status?: string; priority?: string; limit?: number; offset?: number }): Promise<SupportTicketWithUser[]> {
    let query = db.select().from(supportTickets).$dynamic();
    const conditions = [];
    if (opts?.status && opts.status !== "all") conditions.push(eq(supportTickets.status, opts.status));
    if (opts?.priority && opts.priority !== "all") conditions.push(eq(supportTickets.priority, opts.priority));
    if (conditions.length) query = query.where(and(...conditions));
    const rows = await query
      .orderBy(desc(supportTickets.lastActivityAt))
      .limit(opts?.limit ?? 200)
      .offset(opts?.offset ?? 0);
    return Promise.all(rows.map(t => this.enrichTicket(t)));
  }

  async updateSupportTicket(id: string, data: Partial<SupportTicket>): Promise<SupportTicket | undefined> {
    const [ticket] = await db
      .update(supportTickets)
      .set({ ...data, updatedAt: new Date(), lastActivityAt: new Date() })
      .where(eq(supportTickets.id, id))
      .returning();
    return ticket;
  }

  async getSupportMessages(ticketId: string, includeInternal = false): Promise<SupportMessageWithSender[]> {
    const rows = await db
      .select()
      .from(supportMessages)
      .where(
        includeInternal
          ? eq(supportMessages.ticketId, ticketId)
          : and(eq(supportMessages.ticketId, ticketId), eq(supportMessages.isInternal, false)),
      )
      .orderBy(supportMessages.createdAt);

    return Promise.all(
      rows.map(async (msg) => {
        if (!msg.senderId) return { ...msg, sender: null };
        const [sender] = await db.select().from(users).where(eq(users.id, msg.senderId));
        if (!sender) return { ...msg, sender: null };
        const { password: _pw, ...safeSender } = sender;
        return { ...msg, sender: safeSender as Omit<User, "password"> };
      }),
    );
  }

  async createSupportMessage(data: InsertSupportMessage): Promise<SupportMessage> {
    const [msg] = await db.insert(supportMessages).values(data).returning();
    await db
      .update(supportTickets)
      .set({ lastActivityAt: new Date(), updatedAt: new Date() })
      .where(eq(supportTickets.id, data.ticketId));
    return msg;
  }

  async getSupportStats(): Promise<{ open: number; in_progress: number; waiting_user: number; resolved: number; closed: number; total: number }> {
    const rows = await db
      .select({ status: supportTickets.status, c: sql<number>`count(*)` })
      .from(supportTickets)
      .groupBy(supportTickets.status);
    const counts: Record<string, number> = {};
    let total = 0;
    for (const r of rows) {
      counts[r.status] = Number(r.c);
      total += Number(r.c);
    }
    return {
      open: counts["open"] ?? 0,
      in_progress: counts["in_progress"] ?? 0,
      waiting_user: counts["waiting_user"] ?? 0,
      resolved: counts["resolved"] ?? 0,
      closed: counts["closed"] ?? 0,
      total,
    };
  }

  // ─── Task #248 ─────────────────────────────────────────────────────
  async upsertListingDraft(
    userId: string,
    data: Record<string, unknown>,
    opts?: { id?: string; title?: string | null },
  ): Promise<ListingDraft> {
    if (opts?.id) {
      const [existing] = await db
        .select()
        .from(listingDrafts)
        .where(and(eq(listingDrafts.id, opts.id), eq(listingDrafts.userId, userId)));
      if (existing) {
        const [row] = await db
          .update(listingDrafts)
          .set({
            data,
            title: opts.title ?? (data.title as string | undefined) ?? existing.title,
            updatedAt: new Date(),
          })
          .where(eq(listingDrafts.id, opts.id))
          .returning();
        return row;
      }
    }
    const [row] = await db
      .insert(listingDrafts)
      .values({
        userId,
        data,
        title: opts?.title ?? (data.title as string | undefined) ?? null,
      })
      .returning();
    return row;
  }

  async getListingDraft(id: string): Promise<ListingDraft | undefined> {
    const [row] = await db.select().from(listingDrafts).where(eq(listingDrafts.id, id));
    return row;
  }

  async getListingDraftsByUser(userId: string): Promise<ListingDraft[]> {
    return await db
      .select()
      .from(listingDrafts)
      .where(eq(listingDrafts.userId, userId))
      .orderBy(desc(listingDrafts.updatedAt));
  }

  async deleteListingDraft(id: string, userId: string): Promise<boolean> {
    const res = await db
      .delete(listingDrafts)
      .where(and(eq(listingDrafts.id, id), eq(listingDrafts.userId, userId)))
      .returning({ id: listingDrafts.id });
    return res.length > 0;
  }

  async recordEngagementEvent(event: InsertEngagementEvent): Promise<EngagementEvent> {
    const [row] = await db.insert(engagementEvents).values(event).returning();
    return row;
  }

  async getRecentEngagementForUser(userId: string, limit = 10): Promise<EngagementEvent[]> {
    return await db
      .select()
      .from(engagementEvents)
      .where(eq(engagementEvents.userId, userId))
      .orderBy(desc(engagementEvents.createdAt))
      .limit(limit);
  }

  async getEngagementReminderCandidates(): Promise<{ user: User; lastEvent: EngagementEvent }[]> {
    // Reminder eligibility is intentionally narrower than the analytics
    // event log: only "saved" or "message_started" events (i.e. real
    // intent signals) qualify, NOT a passive "viewed". The window is
    // 48h–7d so we honour the +48h target exactly (with a 7d ceiling
    // so we don't ping users about week-old browsing forever).
    const cutoffOld = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const cutoffRecent = new Date(Date.now() - 48 * 60 * 60 * 1000);
    const intentTypes = ["saved", "message_started"];
    const rows = await db
      .select({
        userId: engagementEvents.userId,
        lastAt: sql<Date>`max(${engagementEvents.createdAt})`,
      })
      .from(engagementEvents)
      .where(inArray(engagementEvents.eventType, intentTypes))
      .groupBy(engagementEvents.userId);
    const eligible = rows.filter((r) => {
      const t = new Date(r.lastAt as unknown as string).getTime();
      return t >= cutoffOld.getTime() && t <= cutoffRecent.getTime();
    });
    if (eligible.length === 0) return [];
    const userIds = eligible.map((e) => e.userId);
    const userRows = await db.select().from(users).where(inArray(users.id, userIds));
    const userMap = new Map(userRows.map((u) => [u.id, u]));
    const out: { user: User; lastEvent: EngagementEvent }[] = [];
    for (const r of eligible) {
      const u = userMap.get(r.userId);
      if (!u) continue;
      const [evt] = await db
        .select()
        .from(engagementEvents)
        .where(and(
          eq(engagementEvents.userId, r.userId),
          inArray(engagementEvents.eventType, intentTypes),
        ))
        .orderBy(desc(engagementEvents.createdAt))
        .limit(1);
      if (!evt || !evt.listingId) continue;
      if (await this.hasUserDealForListing(r.userId, evt.listingId)) continue;
      out.push({ user: u, lastEvent: evt });
    }
    return out;
  }

  async getVerificationReminderCandidates(): Promise<User[]> {
    return await db
      .select()
      .from(users)
      .where(
        and(
          isNotNull(users.diditSessionId),
          isNotNull(users.verificationSessionStartedAt),
          or(eq(users.kycStatus, "IN_PROGRESS"), eq(users.kybStatus, "IN_PROGRESS")),
        ),
      );
  }

  async getDraftReminderCandidates(): Promise<{ user: User; draft: ListingDraft }[]> {
    // Drafts created 18h–7d ago whose owner hasn't published a listing
    // since the draft was created. Cheap approximation: just return all
    // candidate drafts; the cron applies the per-user dedupe via
    // hasRecentReminder() before sending.
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const until = new Date(Date.now() - 18 * 60 * 60 * 1000);
    const draftRows = await db
      .select()
      .from(listingDrafts)
      .where(and(gte(listingDrafts.updatedAt, since), lte(listingDrafts.updatedAt, until)));
    if (draftRows.length === 0) return [];
    const uids = Array.from(new Set(draftRows.map((d) => d.userId)));
    const userRows = await db.select().from(users).where(inArray(users.id, uids));
    const uMap = new Map(userRows.map((u) => [u.id, u]));
    return draftRows
      .map((d) => ({ user: uMap.get(d.userId)!, draft: d }))
      .filter((x) => x.user);
  }

  async hasUserDealForListing(userId: string, listingId: string): Promise<boolean> {
    const [row] = await db
      .select({ id: deals.id })
      .from(deals)
      .where(and(
        eq(deals.seekerId, userId),
        or(eq(deals.providerListingId, listingId), eq(deals.seekerListingId, listingId)),
      ))
      .limit(1);
    return !!row;
  }

  async countIncompleteVerifications(): Promise<number> {
    const [row] = await db
      .select({ c: sql<number>`count(*)::int` })
      .from(users)
      .where(or(eq(users.kycStatus, "IN_PROGRESS"), eq(users.kybStatus, "IN_PROGRESS")));
    return row?.c ?? 0;
  }

  async countOpenDrafts(): Promise<number> {
    const [row] = await db
      .select({ c: sql<number>`count(*)::int` })
      .from(listingDrafts);
    return row?.c ?? 0;
  }

  async countAbandonedEngagement(): Promise<number> {
    // Distinct users whose latest "saved" / "message_started" event
    // happened ≥48h ago and who haven't opened a deal on the engaged
    // listing since. Cheap approximation: count unique users with any
    // intent event ≥48h old, minus those who became deal seekers.
    const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000);
    const intentTypes = ["saved", "message_started"];
    const rows = await db
      .selectDistinct({ userId: engagementEvents.userId })
      .from(engagementEvents)
      .where(and(
        inArray(engagementEvents.eventType, intentTypes),
        lte(engagementEvents.createdAt, cutoff),
      ));
    if (rows.length === 0) return 0;
    const uids = rows.map((r) => r.userId);
    const dealRows = await db
      .selectDistinct({ seekerId: deals.seekerId })
      .from(deals)
      .where(inArray(deals.seekerId, uids));
    const haveDeal = new Set(dealRows.map((d) => d.seekerId));
    return uids.filter((id) => !haveDeal.has(id)).length;
  }

  async hasRecentReminder(
    userId: string,
    kind: ReminderKind,
    targetId: string | null,
    sinceHours: number,
  ): Promise<boolean> {
    const since = new Date(Date.now() - sinceHours * 60 * 60 * 1000);
    const conditions = [
      eq(reminderLog.userId, userId),
      eq(reminderLog.kind, kind),
      gte(reminderLog.sentAt, since),
    ];
    if (targetId) conditions.push(eq(reminderLog.targetId, targetId));
    const rows = await db
      .select({ id: reminderLog.id })
      .from(reminderLog)
      .where(and(...conditions))
      .limit(1);
    return rows.length > 0;
  }

  async recordReminder(userId: string, kind: ReminderKind, targetId?: string | null): Promise<ReminderLogRow> {
    const [row] = await db
      .insert(reminderLog)
      .values({ userId, kind, targetId: targetId ?? null })
      .returning();
    return row;
  }

  async getOrCreateUnsubscribeToken(userId: string): Promise<string> {
    const [u] = await db.select().from(users).where(eq(users.id, userId));
    if (u?.unsubscribeToken) return u.unsubscribeToken;
    const token = crypto.randomBytes(24).toString("hex");
    await db.update(users).set({ unsubscribeToken: token }).where(eq(users.id, userId));
    return token;
  }

  async getUserByUnsubscribeToken(token: string): Promise<User | undefined> {
    const [u] = await db.select().from(users).where(eq(users.unsubscribeToken, token));
    return u;
  }
}

export const storage = new DatabaseStorage();
