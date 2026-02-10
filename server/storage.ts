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
  type ListingWithUser,
  type DealWithUsers,
  type MessageWithSender,
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
}

export const storage = new DatabaseStorage();
