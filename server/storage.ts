import { db } from "./db";
import { eq, and, or, desc, sql, ilike } from "drizzle-orm";
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
} from "@shared/schema";
import { v4 as uuid } from "uuid";

export interface IStorage {
  // Users
  getUser(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
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
  createComment(postId: string, userId: string, content: string | null, offerItemName: string, offerItemValue: string): Promise<PostComment>;
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
  createListingComment(listingId: string, userId: string, content: string | null, offerItemName: string, offerItemValue: string): Promise<ListingComment>;

  // Recommendations
  getRecommendedUsers(userId: string): Promise<User[]>;

  // Trending/Featured
  getFeaturedListings(): Promise<ListingWithUser[]>;
  getTrendingPosts(): Promise<PostWithUser[]>;
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

  async createComment(postId: string, userId: string, content: string | null, offerItemName: string, offerItemValue: string): Promise<PostComment> {
    const [comment] = await db
      .insert(postComments)
      .values({ postId, userId, content, offerItemName, offerItemValue })
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

  async createListingComment(listingId: string, userId: string, content: string | null, offerItemName: string, offerItemValue: string): Promise<ListingComment> {
    const [comment] = await db
      .insert(listingComments)
      .values({ listingId, userId, content, offerItemName, offerItemValue })
      .returning();
    return comment;
  }
}

export const storage = new DatabaseStorage();
