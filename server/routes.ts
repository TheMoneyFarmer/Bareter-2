import express, { type Express, type Request, type Response, type NextFunction } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import bcrypt from "bcryptjs";
import session from "express-session";
import { z } from "zod";
import multer from "multer";
import path from "path";
import fs from "fs";
import {
  loginSchema,
  registerSchema,
  insertListingSchema,
  insertDealSchema,
  insertMessageSchema,
  insertRatingSchema,
  insertPostSchema,
  insertReportSchema,
  listings,
  reports,
  quickInquiries,
  users,
} from "@shared/schema";
import { db } from "./db";
import { eq, and, desc, gte, count, lt, sql as sqlOperator } from "drizzle-orm";
import memorystore from "memorystore";
import { WebhookHandlers } from "./webhookHandlers";

// Configure multer for file uploads
const uploadDir = "./uploads";
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const multerStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  },
});

const upload = multer({
  storage: multerStorage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|pdf|webp/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    if (extname && mimetype) {
      return cb(null, true);
    }
    cb(new Error("Invalid file type"));
  },
});

const MemoryStore = memorystore(session);

declare module "express-session" {
  interface SessionData {
    userId: string;
  }
}

function param(val: string | string[] | undefined): string {
  if (Array.isArray(val)) return val[0] || "";
  return val || "";
}

const requireAuth = (req: Request, res: Response, next: NextFunction) => {
  if (!req.session.userId) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  next();
};

const requireAdmin = async (req: Request, res: Response, next: NextFunction) => {
  if (!req.session.userId) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  const user = await storage.getUser(req.session.userId);
  if (!user?.isAdmin) {
    return res.status(403).json({ message: "Forbidden" });
  }
  next();
};

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // Stripe webhook route - must be before other middleware that parse body
  app.post("/api/webhooks/stripe", async (req, res) => {
    try {
      const signature = req.headers["stripe-signature"] as string;
      const rawBody = (req as any).rawBody as Buffer;
      
      if (!rawBody || !signature) {
        return res.status(400).json({ message: "Missing webhook payload or signature" });
      }
      
      await WebhookHandlers.processWebhook(rawBody, signature);
      res.json({ received: true });
    } catch (error) {
      console.error("Webhook error:", error);
      res.status(400).json({ message: "Webhook processing failed" });
    }
  });

  // Session middleware - trust proxy for Replit's HTTPS
  app.set("trust proxy", 1);
  
  app.use(
    session({
      secret: process.env.SESSION_SECRET || "margin-secret-key",
      resave: false,
      saveUninitialized: false,
      store: new MemoryStore({
        checkPeriod: 86400000,
      }),
      cookie: {
        secure: true, // Always secure since Replit serves over HTTPS
        httpOnly: true,
        sameSite: "lax",
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      },
    })
  );

  // Auth routes
  app.post("/api/auth/register", async (req, res) => {
    try {
      const data = registerSchema.parse(req.body);

      const existingUser = await storage.getUserByEmail(data.email);
      if (existingUser) {
        return res.status(400).json({ message: "Email already registered" });
      }

      const hashedPassword = await bcrypt.hash(data.password, 10);
      const user = await storage.createUser({
        email: data.email,
        password: hashedPassword,
        fullName: data.fullName,
        country: data.country || "AE",
        city: data.city || null,
        location: data.city || null,
        signupType: req.body.signupType || "creator",
        socialProfiles: req.body.socialProfiles || [],
      });

      req.session.userId = user.id;
      
      // Explicitly save session before responding
      req.session.save((err) => {
        if (err) {
          console.error("Session save error:", err);
          return res.status(500).json({ message: "Session error" });
        }
        const { password, ...userWithoutPassword } = user;
        res.json(userWithoutPassword);
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: error.errors[0].message });
      }
      console.error("Registration error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/auth/login", async (req, res) => {
    try {
      const data = loginSchema.parse(req.body);

      const user = await storage.getUserByEmail(data.email);
      if (!user) {
        return res.status(401).json({ message: "Invalid credentials" });
      }

      const validPassword = await bcrypt.compare(data.password, user.password);
      if (!validPassword) {
        return res.status(401).json({ message: "Invalid credentials" });
      }

      req.session.userId = user.id;
      
      // Explicitly save session before responding
      req.session.save((err) => {
        if (err) {
          console.error("Session save error:", err);
          return res.status(500).json({ message: "Session error" });
        }
        const { password, ...userWithoutPassword } = user;
        res.json(userWithoutPassword);
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: error.errors[0].message });
      }
      console.error("Login error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/auth/forgot-password", async (req, res) => {
    try {
      const { email } = req.body;
      if (!email || typeof email !== "string") {
        return res.status(400).json({ message: "Email is required" });
      }

      const user = await storage.getUserByEmail(email.toLowerCase().trim());

      if (user) {
        const crypto = await import("crypto");
        const token = crypto.randomBytes(32).toString("hex");
        const expires = new Date(Date.now() + 60 * 60 * 1000);

        await storage.updateUser(user.id, {
          passwordResetToken: token,
          passwordResetExpires: expires,
        });

        const protocol = req.headers["x-forwarded-proto"] || req.protocol || "https";
        const host = req.headers["x-forwarded-host"] || req.headers.host;
        const baseUrl = `${protocol}://${host}`;

        const { sendPasswordResetEmail } = await import("./emailService");
        await sendPasswordResetEmail(user.email, token, baseUrl);
      }

      res.json({ message: "If an account exists for that email, a reset link has been sent." });
    } catch (err) {
      console.error("Forgot password error:", err);
      res.status(500).json({ message: "Failed to process request" });
    }
  });

  app.get("/api/auth/reset-password/validate", async (req, res) => {
    const { token } = req.query;
    if (!token || typeof token !== "string") {
      return res.status(400).json({ valid: false, message: "Token is required" });
    }
    const user = await storage.getUserByPasswordResetToken(token);
    if (!user || !user.passwordResetExpires || new Date() > new Date(user.passwordResetExpires)) {
      return res.status(400).json({ valid: false, message: "Reset link is invalid or has expired" });
    }
    res.json({ valid: true });
  });

  app.post("/api/auth/reset-password", async (req, res) => {
    try {
      const { token, password } = req.body;
      if (!token || !password) {
        return res.status(400).json({ message: "Token and password are required" });
      }
      if (typeof password !== "string" || password.length < 8) {
        return res.status(400).json({ message: "Password must be at least 8 characters" });
      }

      const user = await storage.getUserByPasswordResetToken(token);
      if (!user || !user.passwordResetExpires || new Date() > new Date(user.passwordResetExpires)) {
        return res.status(400).json({ message: "Reset link is invalid or has expired" });
      }

      const bcrypt = await import("bcryptjs");
      const hashedPassword = await bcrypt.hash(password, 12);

      await storage.updateUser(user.id, {
        password: hashedPassword,
        passwordResetToken: null,
        passwordResetExpires: null,
      });

      res.json({ message: "Password updated successfully" });
    } catch (err) {
      console.error("Reset password error:", err);
      res.status(500).json({ message: "Failed to reset password" });
    }
  });

  app.post("/api/auth/logout", (req, res) => {
    req.session.destroy((err) => {
      if (err) {
        return res.status(500).json({ message: "Failed to logout" });
      }
      res.json({ message: "Logged out successfully" });
    });
  });

  // Geo lookup endpoint - returns detected country/city for the requesting client
  app.get("/api/geo/lookup", async (req, res) => {
    try {
      // Per-session cache so we don't hit external geo providers on every load.
      const sess = req.session as any;
      const cached = sess?.geoLookup;
      const TTL_MS = 60 * 60 * 1000; // 1 hour
      if (cached && cached.expiresAt && cached.expiresAt > Date.now()) {
        return res.json({ ...cached.value, cached: true });
      }
      const { lookupGeo } = await import("./geoClient");
      const result = await lookupGeo(req);
      if (sess) {
        sess.geoLookup = { value: result, expiresAt: Date.now() + TTL_MS };
      }
      res.json(result);
    } catch (error) {
      console.error("Geo lookup error:", error);
      res.json({ country: "AE", countryName: "United Arab Emirates", city: "Dubai", source: "fallback" });
    }
  });

  // Mark the location-prompt as shown so the user does not see the popup again
  app.post("/api/users/me/location-prompted", requireAuth, async (req, res) => {
    try {
      await storage.updateUser(req.session.userId!, { locationPrompted: true });
      res.json({ ok: true });
    } catch (error) {
      console.error("Mark location prompted error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/auth/me", async (req, res) => {
    if (!req.session.userId) {
      return res.status(401).json({ message: "Not authenticated" });
    }

    const user = await storage.getUser(req.session.userId);
    if (!user) {
      return res.status(401).json({ message: "User not found" });
    }

    const { password, ...userWithoutPassword } = user;
    res.json(userWithoutPassword);
  });

  // Serve uploaded files
  app.use("/uploads", (req, res, next) => {
    res.setHeader("Cache-Control", "public, max-age=31536000");
    next();
  });
  app.use("/uploads", express.static(uploadDir));

  // File upload endpoint
  app.post("/api/upload", requireAuth, upload.single("file"), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "No file uploaded" });
      }

      const fileUrl = `/uploads/${req.file.filename}`;
      const uploadType = req.body.type;

      // Update user profile based on upload type
      if (uploadType === "avatar") {
        await storage.updateUser(req.session.userId!, { avatarUrl: fileUrl });
      } else if (uploadType === "verification") {
        await storage.updateUser(req.session.userId!, {
          verificationDocUrl: fileUrl,
          verificationStatus: "submitted",
        });
      } else if (uploadType === "portfolio") {
        const user = await storage.getUser(req.session.userId!);
        if (user) {
          const portfolioImages = [...(user.portfolioImages || []), fileUrl];
          await storage.updateUser(req.session.userId!, { portfolioImages });
        }
      } else if (uploadType === "business_license") {
        await storage.updateUser(req.session.userId!, {
          businessLicenseUrl: fileUrl,
          kybStatus: "PENDING_REVIEW",
        });
      }

      res.json({ url: fileUrl, type: uploadType });
    } catch (error) {
      console.error("Upload error:", error);
      res.status(500).json({ message: "Upload failed" });
    }
  });

  // User routes - with strict allowlist to prevent privilege escalation
  const offerNeedItemSchema = z.object({
    name: z.string(),
    value: z.number(),
    description: z.string().optional(),
  });

  const updateProfileSchema = z.object({
    fullName: z.string().min(2).optional(),
    bio: z.string().optional(),
    location: z.string().optional(),
    country: z.string().length(2).optional(),
    city: z.string().optional(),
    locationPrompted: z.boolean().optional(),
    businessName: z.string().optional(),
    avatarUrl: z.string().optional(),
    whatIOffer: z.array(offerNeedItemSchema).optional(),
    whatINeed: z.array(offerNeedItemSchema).optional(),
    portfolioImages: z.array(z.string()).optional(),
    language: z.enum(["en", "ar"]).optional(),
  });

  app.patch("/api/users/profile", requireAuth, async (req, res) => {
    try {
      const data = updateProfileSchema.parse(req.body);
      
      // Check if profile is being completed
      const user = await storage.getUser(req.session.userId!);
      let profileCompleted = user?.profileCompleted;
      
      if (!profileCompleted) {
        const newBio = data.bio ?? user?.bio;
        const newLocation = data.location ?? user?.location;
        const newBusinessName = data.businessName ?? user?.businessName;
        if (newBio && newLocation && newBusinessName) {
          profileCompleted = true;
        }
      }

      const updatedUser = await storage.updateUser(req.session.userId!, {
        ...data,
        profileCompleted,
      });
      if (!updatedUser) {
        return res.status(404).json({ message: "User not found" });
      }
      const { password, ...userWithoutPassword } = updatedUser;
      res.json(userWithoutPassword);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: error.errors[0].message });
      }
      console.error("Update profile error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Settings update route
  app.patch("/api/users/settings", requireAuth, async (req, res) => {
    try {
      const allowedFields = [
        "fullName", "email", "phone", "website", "businessName", "location",
        "country", "city", "locationPrompted",
        "timezone", "currency", "language",
        "emailNotifications", "dealNotifications", "messageNotifications", "marketingEmails",
        "profileVisibility", "showEmail", "showPhone", "allowDirectMessages",
        "preferredCategories", "tradingRadius", "minTradeValue", "maxTradeValue", "autoMatchEnabled",
      ];
      
      const data: Record<string, any> = {};
      for (const key of allowedFields) {
        if (req.body[key] !== undefined) {
          data[key] = req.body[key];
        }
      }

      if (Object.keys(data).length === 0) {
        return res.status(400).json({ message: "No valid fields to update" });
      }

      const updatedUser = await storage.updateUser(req.session.userId!, data);
      if (!updatedUser) {
        return res.status(404).json({ message: "User not found" });
      }

      const { password, ...userWithoutPassword } = updatedUser;
      res.json(userWithoutPassword);
    } catch (error) {
      console.error("Update settings error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Password change route
  app.post("/api/users/change-password", requireAuth, async (req, res) => {
    try {
      const { currentPassword, newPassword } = req.body;

      if (!currentPassword || !newPassword) {
        return res.status(400).json({ message: "Current and new passwords are required" });
      }

      if (newPassword.length < 8) {
        return res.status(400).json({ message: "New password must be at least 8 characters" });
      }

      const user = await storage.getUser(req.session.userId!);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      const validPassword = await bcrypt.compare(currentPassword, user.password);
      if (!validPassword) {
        return res.status(401).json({ message: "Current password is incorrect" });
      }

      const hashedPassword = await bcrypt.hash(newPassword, 10);
      await storage.updateUser(req.session.userId!, { password: hashedPassword });

      res.json({ message: "Password changed successfully" });
    } catch (error) {
      console.error("Change password error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Listings routes with search/filter
  app.get("/api/listings", async (req, res) => {
    try {
      const { search, type, category, location, verified, minValue, maxValue } = req.query;
      
      let listings = await storage.getListings();

      // Apply filters server-side
      if (search && typeof search === "string") {
        const searchLower = search.toLowerCase();
        listings = listings.filter(
          (l) =>
            l.title.toLowerCase().includes(searchLower) ||
            l.description.toLowerCase().includes(searchLower)
        );
      }

      if (type && type !== "all" && typeof type === "string") {
        listings = listings.filter((l) => l.type === type);
      }

      if (category && typeof category === "string") {
        listings = listings.filter((l) => (l.categories || []).includes(category));
      }

      if (location && location !== "all" && typeof location === "string") {
        listings = listings.filter((l) => l.location === location);
      }

      const worldwide = req.query.worldwide === "true";
      const sessionUser = req.session?.userId
        ? await storage.getUser(req.session.userId)
        : null;
      const queryCountry = req.query.country as string | undefined;
      const queryCity = req.query.city as string | undefined;
      const country = worldwide
        ? undefined
        : queryCountry || sessionUser?.country || undefined;
      const city = worldwide
        ? undefined
        : queryCity || (queryCountry ? undefined : sessionUser?.city || undefined);
      if (country && country !== "all") {
        const code = country.toUpperCase();
        listings = listings.filter((l) => {
          const lc = (l.country || l.user?.country || "").toUpperCase();
          return lc === code;
        });
      }
      if (city && city !== "all") {
        listings = listings.filter((l) => {
          const lc = l.city || l.location || "";
          return lc === city;
        });
      }

      if (verified === "true") {
        listings = listings.filter((l) =>
          l.user?.isVerified ||
          l.user?.kycStatus === "APPROVED" ||
          l.user?.kybStatus === "APPROVED"
        );
      }

      if (minValue && typeof minValue === "string") {
        const min = parseFloat(minValue);
        if (!isNaN(min)) {
          listings = listings.filter((l) => parseFloat(l.retailValue as string) >= min);
        }
      }

      if (maxValue && typeof maxValue === "string") {
        const max = parseFloat(maxValue);
        if (!isNaN(max)) {
          listings = listings.filter((l) => parseFloat(l.retailValue as string) <= max);
        }
      }

      const userId = req.session?.userId;
      const likedIds = userId ? await storage.getUserLikedListingIds(userId) : new Set<string>();
      const commentCounts = await storage.getListingCommentCounts();

      const enriched = listings.map(l => ({
        ...l,
        isLiked: likedIds.has(l.id),
        commentCount: commentCounts.get(l.id) || 0,
      }));

      res.json(enriched);
    } catch (error) {
      console.error("Get listings error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/listings/user/:userId", requireAuth, async (req, res) => {
    try {
      const listings = await storage.getListingsByUser(param(req.params.userId));
      res.json(listings);
    } catch (error) {
      console.error("Get user listings error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/listings/featured", async (req, res) => {
    try {
      const featured = await storage.getFeaturedListings();
      const userId = req.session?.userId;
      const likedIds = userId ? await storage.getUserLikedListingIds(userId) : new Set<string>();
      const commentCounts = await storage.getListingCommentCounts();
      const enriched = featured.map(l => ({
        ...l,
        isLiked: likedIds.has(l.id),
        commentCount: commentCounts.get(l.id) || 0,
      }));
      res.json(enriched);
    } catch (error) {
      console.error("Get featured listings error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/listings/:id", async (req, res) => {
    try {
      const listing = await storage.getListingWithUser(param(req.params.id));
      if (!listing) {
        return res.status(404).json({ message: "Listing not found" });
      }
      await storage.incrementListingViews(param(req.params.id));

      const userId = req.session?.userId;
      const isLiked = userId ? await storage.isListingLiked(listing.id, userId) : false;
      const commentCount = await storage.getListingCommentCount(listing.id);

      res.json({ ...listing, isLiked, commentCount });
    } catch (error) {
      console.error("Get listing error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/listings", requireAuth, async (req, res) => {
    try {
      const listingUser = await storage.getUser(req.session.userId!);
      if (!listingUser) {
        return res.status(404).json({ message: "User not found" });
      }

      // Pause gate
      if (listingUser.isPaused) {
        return res.status(403).json({ message: "Your account has been paused. Please contact support.", isPaused: true });
      }

      // Business license gate
      if (listingUser.accountType === "business" && listingUser.kybStatus !== "APPROVED") {
        return res.status(403).json({ 
          message: "Business accounts must have a verified trade license before creating listings.",
          requiresTradeLicense: true
        });
      }

      const { isUserVerified } = await import("./diditClient");
      const userVerified = isUserVerified(
        listingUser.accountType || "individual",
        listingUser.kycStatus || "NOT_STARTED",
        listingUser.kybStatus || "NOT_STARTED"
      );

      if (!userVerified) {
        return res.status(403).json({ 
          message: "You must be verified to create listings. Please complete identity verification first.",
          requiresVerification: true
        });
      }

      const { isValueFlagged } = await import("./marketValues");
      const rawCategories = req.body.categories || [];
      const retailVal = parseFloat(req.body.retailValue) || 0;
      const valueFlagged = isValueFlagged(retailVal, rawCategories);

      const data = insertListingSchema.parse({
        ...req.body,
        userId: req.session.userId,
        valueFlagged,
      });
      const listing = await storage.createListing(data);
      res.json(listing);

      import("./agents/moderationAgent").then(({ moderateAndLog }) => {
        moderateAndLog("listing", listing.id, {
          title: listing.title,
          description: listing.description,
          value: parseFloat(listing.retailValue as string),
          categories: listing.categories as string[],
        }, req.session.userId).catch(() => {});
      }).catch(() => {});

      const imageUrls: string[] = data.images || [];
      if (imageUrls.length > 0) {
        import("./visionClient").then(({ scanListingImages }) => {
          scanListingImages(imageUrls, listing.id).then((flagged) => {
            if (flagged) {
              storage.updateListing(listing.id, { imageFlagged: true }).catch(() => {});
            }
          }).catch(() => {});
        }).catch(() => {});
      }
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: error.errors[0].message });
      }
      console.error("Create listing error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.patch("/api/listings/:id", requireAuth, async (req, res) => {
    try {
      const listing = await storage.getListing(param(req.params.id));
      if (!listing) {
        return res.status(404).json({ message: "Listing not found" });
      }
      if (listing.userId !== req.session.userId) {
        return res.status(403).json({ message: "Not authorized" });
      }
      const updated = await storage.updateListing(param(req.params.id), req.body);
      res.json(updated);
    } catch (error) {
      console.error("Update listing error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Listing Likes
  app.post("/api/listings/:id/like", requireAuth, async (req, res) => {
    try {
      const listingId = param(req.params.id);
      const userId = req.session.userId!;
      const listing = await storage.getListing(listingId);
      if (!listing) return res.status(404).json({ message: "Listing not found" });

      const alreadyLiked = await storage.isListingLiked(listingId, userId);
      if (alreadyLiked) {
        await storage.unlikeListingItem(listingId, userId);
        const count = await storage.getListingLikeCount(listingId);
        return res.json({ liked: false, likeCount: count });
      }
      await storage.likeListingItem(listingId, userId);
      const count = await storage.getListingLikeCount(listingId);
      res.json({ liked: true, likeCount: count });
    } catch (error) {
      console.error("Listing like error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Listing Comments
  app.get("/api/listings/:id/comments", async (req, res) => {
    try {
      const listingId = param(req.params.id);
      const comments = await storage.getListingComments(listingId);
      res.json(comments);
    } catch (error) {
      console.error("Get listing comments error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/listings/:id/comments", requireAuth, async (req, res) => {
    try {
      const listingId = param(req.params.id);
      const userId = req.session.userId!;
      const listing = await storage.getListing(listingId);
      if (!listing) return res.status(404).json({ message: "Listing not found" });

      const schema = z.object({
        offerItemName: z.string().min(1, "Offer item name is required"),
        offerItemValue: z.string().refine(v => !isNaN(parseFloat(v)) && parseFloat(v) > 0, "Value must be a positive number"),
        content: z.string().nullable().optional(),
      });
      const parsed = schema.parse(req.body);
      const comment = await storage.createListingComment(listingId, userId, parsed.content || null, parsed.offerItemName, parsed.offerItemValue);
      res.json(comment);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: error.errors[0].message });
      }
      console.error("Create listing comment error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Dashboard routes
  app.get("/api/dashboard/analytics", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const timeRange = parseInt(req.query.timeRange as string) || 30;
      
      // Get user's listings
      const userListings = await storage.getListingsByUser(userId);
      const activeListings = userListings.filter(l => l.isActive);
      const totalViews = userListings.reduce((sum, l) => sum + (l.viewCount || 0), 0);
      
      // Get user's deals
      const userDeals = await storage.getDealsByUser(userId);
      const completedDeals = userDeals.filter(d => d.state === "completed");
      const totalValue = completedDeals.reduce((sum, d) => {
        const isSeeker = d.seekerId === userId;
        return sum + Number(isSeeker ? d.seekerValue : d.providerValue);
      }, 0);
      
      // Get follower counts
      const followerCount = await storage.getFollowerCount(userId);
      const followingCount = await storage.getFollowingCount(userId);
      
      // Generate sample views over time data
      const viewsOverTime = [];
      for (let i = timeRange; i >= 0; i -= Math.ceil(timeRange / 10)) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        viewsOverTime.push({
          date: date.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
          views: Math.floor(Math.random() * 50) + 10,
        });
      }
      
      // Listings by category
      const categoryMap = new Map<string, number>();
      userListings.forEach(l => {
        (l.categories || []).forEach(cat => {
          categoryMap.set(cat, (categoryMap.get(cat) || 0) + 1);
        });
      });
      const listingsByCategory = Array.from(categoryMap.entries()).map(([category, count]) => ({
        category,
        count,
      }));
      
      res.json({
        totalListings: userListings.length,
        activeListings: activeListings.length,
        totalViews,
        totalDeals: userDeals.length,
        completedDeals: completedDeals.length,
        totalValue,
        followerCount,
        followingCount,
        viewsOverTime,
        dealsOverTime: [],
        listingsByCategory,
      });
    } catch (error) {
      console.error("Get analytics error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/dashboard/deals", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const filter = req.query.filter as string || "completed";
      
      let deals = await storage.getDealsByUser(userId);
      
      if (filter === "completed") {
        deals = deals.filter(d => d.state === "completed");
      } else if (filter === "in_progress") {
        deals = deals.filter(d => d.state === "in_progress");
      }
      
      res.json(deals);
    } catch (error) {
      console.error("Get dashboard deals error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Followers routes
  app.get("/api/users/:id/followers", requireAuth, async (req, res) => {
    try {
      const followers = await storage.getFollowers(param(req.params.id));
      res.json(followers);
    } catch (error) {
      console.error("Get followers error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/users/:id/following", requireAuth, async (req, res) => {
    try {
      const following = await storage.getFollowing(param(req.params.id));
      res.json(following);
    } catch (error) {
      console.error("Get following error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/users/:id/follow", requireAuth, async (req, res) => {
    try {
      const followingId = param(req.params.id);
      const followerId = req.session.userId!;
      
      if (followerId === followingId) {
        return res.status(400).json({ message: "Cannot follow yourself" });
      }
      
      const isAlreadyFollowing = await storage.isFollowing(followerId, followingId);
      if (isAlreadyFollowing) {
        return res.status(400).json({ message: "Already following this user" });
      }
      
      const follower = await storage.followUser(followerId, followingId);
      res.json(follower);
    } catch (error) {
      console.error("Follow user error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.delete("/api/users/:id/follow", requireAuth, async (req, res) => {
    try {
      const followingId = param(req.params.id);
      const followerId = req.session.userId!;
      
      await storage.unfollowUser(followerId, followingId);
      res.json({ message: "Unfollowed successfully" });
    } catch (error) {
      console.error("Unfollow user error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.delete("/api/users/:id/unfollow", requireAuth, async (req, res) => {
    try {
      // This removes a follower (someone following you)
      const followerId = param(req.params.id);
      const followingId = req.session.userId!;
      
      await storage.unfollowUser(followerId, followingId);
      res.json({ message: "Follower removed successfully" });
    } catch (error) {
      console.error("Remove follower error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Deals routes
  app.get("/api/deals", requireAuth, async (req, res) => {
    try {
      const deals = await storage.getDealsByUser(req.session.userId!);
      res.json(deals);
    } catch (error) {
      console.error("Get deals error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/deals/:id", requireAuth, async (req, res) => {
    try {
      const deal = await storage.getDealWithUsers(param(req.params.id));
      if (!deal) {
        return res.status(404).json({ message: "Deal not found" });
      }
      if (deal.seekerId !== req.session.userId && deal.providerId !== req.session.userId) {
        return res.status(403).json({ message: "Not authorized" });
      }
      res.json(deal);
    } catch (error) {
      console.error("Get deal error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Deal contract PDF download
  app.get("/api/deals/:id/contract", requireAuth, async (req, res) => {
    try {
      const deal = await storage.getDealWithUsers(param(req.params.id));
      if (!deal) {
        return res.status(404).json({ message: "Deal not found" });
      }
      if (deal.seekerId !== req.session.userId && deal.providerId !== req.session.userId) {
        return res.status(403).json({ message: "Not authorized" });
      }
      
      // If contract already exists, redirect to it
      if (deal.contractPdfUrl) {
        return res.redirect(deal.contractPdfUrl);
      }
      
      // Generate contract PDF using jsPDF
      const { jsPDF } = await import("jspdf");
      const doc = new jsPDF();
      
      // Header
      doc.setFontSize(20);
      doc.text("BARTER AGREEMENT CONTRACT", 105, 20, { align: "center" });
      
      // Contract number and date
      doc.setFontSize(10);
      doc.text(`Contract Reference: ${deal.dealNumber}`, 20, 35);
      doc.text(`Date: ${new Date(deal.createdAt!).toLocaleDateString()}`, 20, 42);
      
      // Parties
      doc.setFontSize(12);
      doc.text("PARTIES TO THIS AGREEMENT", 20, 55);
      doc.setFontSize(10);
      doc.text(`Party A (Seeker): ${deal.seeker?.fullName || deal.seeker?.businessName || "N/A"}`, 25, 65);
      doc.text(`Party B (Provider): ${deal.provider?.fullName || deal.provider?.businessName || "N/A"}`, 25, 72);
      
      // Exchange Details
      doc.setFontSize(12);
      doc.text("EXCHANGE DETAILS", 20, 90);
      doc.setFontSize(10);
      doc.text(`Party A Offers: ${deal.seekerOffer}`, 25, 100);
      doc.text(`Estimated Value: AED ${Number(deal.seekerValue).toLocaleString()}`, 25, 107);
      doc.text(`Party B Offers: ${deal.providerOffer}`, 25, 117);
      doc.text(`Estimated Value: AED ${Number(deal.providerValue).toLocaleString()}`, 25, 124);
      
      // Terms
      doc.setFontSize(12);
      doc.text("TERMS AND CONDITIONS", 20, 142);
      doc.setFontSize(10);
      const terms = [
        "1. Both parties agree to exchange the goods/services described above.",
        "2. Each party warrants they have the right to exchange the items offered.",
        "3. The exchange values are agreed estimates and do not constitute cash payment.",
        "4. This agreement is governed by UAE law.",
        "5. Any disputes shall be resolved through arbitration in Dubai.",
      ];
      let yPos = 152;
      terms.forEach((term) => {
        const lines = doc.splitTextToSize(term, 170);
        doc.text(lines, 25, yPos);
        yPos += lines.length * 6;
      });
      
      // UAE VAT Notice
      doc.setFontSize(10);
      doc.text("VAT Notice: Standard UAE VAT (5%) may apply to certain barter transactions.", 20, 220);
      doc.text("Consult a tax advisor for specific guidance.", 20, 227);
      
      // Signatures
      doc.setFontSize(12);
      doc.text("SIGNATURES", 20, 245);
      doc.line(25, 265, 90, 265);
      doc.line(120, 265, 185, 265);
      doc.setFontSize(10);
      doc.text("Party A Signature", 25, 272);
      doc.text("Party B Signature", 120, 272);
      
      // Footer
      doc.setFontSize(8);
      doc.text("Generated by BarterGram Marketplace | www.bartergram.ae", 105, 285, { align: "center" });
      
      // Send PDF
      const pdfBuffer = Buffer.from(doc.output("arraybuffer"));
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="Contract_${deal.dealNumber}.pdf"`);
      res.send(pdfBuffer);
    } catch (error) {
      console.error("Generate contract error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/deals", requireAuth, async (req, res) => {
    try {
      const { providerListingId, seekerOffer, seekerValue } = req.body;

      const seeker = await storage.getUser(req.session.userId!);
      if (!seeker) {
        return res.status(404).json({ message: "User not found" });
      }

      const { isUserVerified } = await import("./diditClient");
      const seekerVerified = isUserVerified(
        seeker.accountType || "individual",
        seeker.kycStatus || "NOT_STARTED",
        seeker.kybStatus || "NOT_STARTED"
      );

      if (!seekerVerified) {
        return res.status(403).json({ 
          message: "You must be verified to start a trade. Please complete identity verification first.",
          requiresVerification: true
        });
      }

      const listing = await storage.getListing(providerListingId);
      if (!listing) {
        return res.status(404).json({ message: "Listing not found" });
      }

      if (listing.userId === req.session.userId) {
        return res.status(400).json({ message: "Cannot trade with yourself" });
      }

      const deal = await storage.createDeal({
        seekerId: req.session.userId!,
        providerId: listing.userId,
        providerListingId,
        seekerOffer,
        seekerValue,
        providerOffer: listing.title,
        providerValue: listing.retailValue,
        state: "proposed",
        deliverables: req.body.deliverables || null,
      });

      // Create notification for provider
      await storage.createNotification({
        userId: listing.userId,
        type: "deal_update",
        title: "New Trade Proposal",
        message: `You have received a new trade proposal for "${listing.title}"`,
        relatedDealId: deal.id,
      });

      res.json(deal);
    } catch (error) {
      console.error("Create deal error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Deal state transitions and allowed fields
  const allowedStateTransitions: Record<string, string[]> = {
    proposed: ["accepted", "cancelled"],
    accepted: ["in_progress", "cancelled"],
    in_progress: ["delivery_proof", "cancelled"],
    delivery_proof: ["completed", "cancelled"],
  };

  const updateDealSchema = z.object({
    state: z.enum(["proposed", "accepted", "in_progress", "delivery_proof", "completed", "cancelled"]).optional(),
    seekerCompleted: z.boolean().optional(),
    providerCompleted: z.boolean().optional(),
    seekerProofUrl: z.string().optional(),
    providerProofUrl: z.string().optional(),
    timeline: z.string().optional(),
    deliverables: z.array(z.object({ label: z.string(), checked: z.boolean() })).optional(),
  });

  app.patch("/api/deals/:id", requireAuth, async (req, res) => {
    try {
      const deal = await storage.getDeal(param(req.params.id));
      if (!deal) {
        return res.status(404).json({ message: "Deal not found" });
      }
      if (deal.seekerId !== req.session.userId && deal.providerId !== req.session.userId) {
        return res.status(403).json({ message: "Not authorized" });
      }

      const data = updateDealSchema.parse(req.body);
      const isSeeker = deal.seekerId === req.session.userId;
      const isProvider = deal.providerId === req.session.userId;

      // Pause gate for accepting deals
      if (data.state === "accepted") {
        const acceptingUser = await storage.getUser(req.session.userId!);
        if (acceptingUser?.isPaused) {
          return res.status(403).json({ message: "Your account has been paused. Please contact support.", isPaused: true });
        }
        if (acceptingUser?.accountType === "business" && acceptingUser.kybStatus !== "APPROVED") {
          return res.status(403).json({ 
            message: "Business accounts must have a verified trade license before accepting deals.",
            requiresTradeLicense: true
          });
        }
      }

      // Validate state transitions
      if (data.state && data.state !== deal.state) {
        const allowed = allowedStateTransitions[deal.state];
        if (!allowed || !allowed.includes(data.state)) {
          return res.status(400).json({ message: `Cannot transition from ${deal.state} to ${data.state}` });
        }
        // Only provider can accept
        if (data.state === "accepted" && !isProvider) {
          return res.status(403).json({ message: "Only the provider can accept a deal" });
        }
      }

      // Only allow users to mark their own completion
      if (data.seekerCompleted !== undefined && !isSeeker) {
        return res.status(403).json({ message: "Only the seeker can mark seeker completion" });
      }
      if (data.providerCompleted !== undefined && !isProvider) {
        return res.status(403).json({ message: "Only the provider can mark provider completion" });
      }

      // Only allow uploading own proof
      if (data.seekerProofUrl !== undefined && !isSeeker) {
        return res.status(403).json({ message: "Only the seeker can upload seeker proof" });
      }
      if (data.providerProofUrl !== undefined && !isProvider) {
        return res.status(403).json({ message: "Only the provider can upload provider proof" });
      }

      let updated = await storage.updateDeal(param(req.params.id), data);

      // Check if both parties completed - auto-complete the deal
      if (updated && updated.seekerCompleted && updated.providerCompleted && updated.state === "delivery_proof") {
        updated = await storage.updateDeal(param(req.params.id), { state: "completed" });
      }

      res.json(updated);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: error.errors[0].message });
      }
      console.error("Update deal error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Messages routes
  app.get("/api/deals/:id/messages", requireAuth, async (req, res) => {
    try {
      const deal = await storage.getDeal(param(req.params.id));
      if (!deal) {
        return res.status(404).json({ message: "Deal not found" });
      }
      if (deal.seekerId !== req.session.userId && deal.providerId !== req.session.userId) {
        return res.status(403).json({ message: "Not authorized" });
      }
      const messages = await storage.getMessagesByDeal(param(req.params.id));
      res.json(messages);
    } catch (error) {
      console.error("Get messages error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  const createMessageSchema = z.object({
    content: z.string().min(1, "Message cannot be empty").max(2000, "Message too long"),
  });

  app.post("/api/deals/:id/messages", requireAuth, async (req, res) => {
    try {
      const deal = await storage.getDeal(param(req.params.id));
      if (!deal) {
        return res.status(404).json({ message: "Deal not found" });
      }
      if (deal.seekerId !== req.session.userId && deal.providerId !== req.session.userId) {
        return res.status(403).json({ message: "Not authorized" });
      }

      const data = createMessageSchema.parse(req.body);

      // Detect off-platform communication attempts
      const offPlatformKeywords = /whatsapp|telegram|phone|transfer|outside|signal|wechat|direct\s*pay/i;
      const isOffPlatform = offPlatformKeywords.test(data.content);

      const message = await storage.createMessage({
        dealId: param(req.params.id),
        senderId: req.session.userId!,
        content: data.content,
        isOffPlatform,
      });

      // Notify the other party
      const recipientId = deal.seekerId === req.session.userId ? deal.providerId : deal.seekerId;
      await storage.createNotification({
        userId: recipientId,
        type: "message",
        title: "New Message",
        message: "You have a new message in your trade deal",
        relatedDealId: deal.id,
      });

      res.json(message);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: error.errors[0].message });
      }
      console.error("Create message error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Ratings routes
  app.get("/api/ratings/user/:userId", async (req, res) => {
    try {
      const ratings = await storage.getRatingsByUser(param(req.params.userId));
      res.json(ratings);
    } catch (error) {
      console.error("Get ratings error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  const createRatingSchema = z.object({
    dealId: z.string().min(1),
    toUserId: z.string().min(1),
    score: z.number().min(1).max(5),
    review: z.string().optional(),
  });

  app.post("/api/ratings", requireAuth, async (req, res) => {
    try {
      const data = createRatingSchema.parse(req.body);

      // Verify the deal exists and is completed
      const deal = await storage.getDeal(data.dealId);
      if (!deal) {
        return res.status(404).json({ message: "Deal not found" });
      }
      if (deal.state !== "completed") {
        return res.status(400).json({ message: "Can only rate completed deals" });
      }
      if (deal.seekerId !== req.session.userId && deal.providerId !== req.session.userId) {
        return res.status(403).json({ message: "Not authorized to rate this deal" });
      }

      // Verify rating the other party
      const otherPartyId = deal.seekerId === req.session.userId ? deal.providerId : deal.seekerId;
      if (data.toUserId !== otherPartyId) {
        return res.status(400).json({ message: "Can only rate the other party in the deal" });
      }

      const rating = await storage.createRating({
        ...data,
        fromUserId: req.session.userId!,
      });
      res.json(rating);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: error.errors[0].message });
      }
      console.error("Create rating error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Notifications routes
  app.get("/api/notifications", requireAuth, async (req, res) => {
    try {
      const notifications = await storage.getNotificationsByUser(req.session.userId!);
      res.json(notifications);
    } catch (error) {
      console.error("Get notifications error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.patch("/api/notifications/:id/read", requireAuth, async (req, res) => {
    try {
      await storage.markNotificationAsRead(param(req.params.id));
      res.json({ success: true });
    } catch (error) {
      console.error("Mark notification read error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.patch("/api/notifications/read-all", requireAuth, async (req, res) => {
    try {
      await storage.markAllNotificationsAsRead(req.session.userId!);
      res.json({ success: true });
    } catch (error) {
      console.error("Mark all notifications read error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Verification routes (Didit KYC/KYB)
  app.post("/api/verification/session", requireAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      const { accountType } = req.body;
      const userAccountType = accountType || user.accountType || "individual";
      
      const workflowId = userAccountType === "business" 
        ? process.env.DIDIT_KYB_WORKFLOW_ID 
        : process.env.DIDIT_KYC_WORKFLOW_ID;

      if (!workflowId) {
        return res.status(500).json({ message: "Verification workflow not configured" });
      }

      const { createVerificationSession } = await import("./diditClient");
      
      const baseUrl = process.env.REPLIT_DEV_DOMAIN 
        ? `https://${process.env.REPLIT_DEV_DOMAIN}`
        : process.env.REPLIT_DOMAINS 
          ? `https://${process.env.REPLIT_DOMAINS.split(",")[0]}`
          : "http://localhost:5000";
      
      const callbackUrl = `${baseUrl}/profile`;
      
      const session = await createVerificationSession(
        workflowId,
        user.id,
        callbackUrl
      );

      if (!session) {
        return res.status(500).json({ message: "Failed to create verification session" });
      }

      await storage.updateUser(user.id, {
        accountType: userAccountType,
        diditSessionId: session.session_id,
        ...(userAccountType === "business" 
          ? { kybStatus: "IN_PROGRESS" }
          : { kycStatus: "IN_PROGRESS" }
        ),
      });

      res.json({
        sessionId: session.session_id,
        verificationUrl: session.url,
      });
    } catch (error) {
      console.error("Create verification session error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/verification/status", requireAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      const { getVerificationStatus, isUserVerified } = await import("./diditClient");
      
      const accountType = user.accountType || "individual";
      const kycStatus = user.kycStatus || "NOT_STARTED";
      const kybStatus = user.kybStatus || "NOT_STARTED";

      const statusInfo = getVerificationStatus(accountType, kycStatus, kybStatus);
      const verified = isUserVerified(accountType, kycStatus, kybStatus);

      res.json({
        accountType,
        kycStatus,
        kybStatus,
        isVerified: verified,
        ...statusInfo,
      });
    } catch (error) {
      console.error("Get verification status error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/webhooks/didit", async (req, res) => {
    try {
      const signature = req.headers["x-webhook-signature"] as string;
      const rawBody = (req as any).rawBody as Buffer;
      
      if (!rawBody) {
        return res.status(400).json({ message: "Missing webhook payload" });
      }

      const { verifyWebhookSignature } = await import("./diditClient");
      const payload = rawBody.toString();
      
      if (!verifyWebhookSignature(payload, signature)) {
        console.error("Invalid Didit webhook signature");
        return res.status(401).json({ message: "Invalid signature" });
      }

      const data = JSON.parse(payload);
      console.log("Didit webhook received:", data);

      const sessionId = data.session_id;
      const status = data.status;
      const vendorData = data.vendor_data;

      if (!sessionId) {
        return res.status(400).json({ message: "Missing session_id" });
      }

      const users = await storage.getAllUsers();
      const user = users.find(u => u.diditSessionId === sessionId);

      if (!user) {
        console.log("User not found for session:", sessionId);
        return res.json({ received: true });
      }

      const updateData: any = {
        updatedAt: new Date(),
      };

      if (user.accountType === "business") {
        updateData.kybStatus = status;
      } else {
        updateData.kycStatus = status;
      }

      if (status === "APPROVED") {
        updateData.isVerified = true;
        updateData.diditVerifiedAt = new Date();
        updateData.diditVerificationData = data.user_data || data.verification || {};
        
        await storage.createNotification({
          userId: user.id,
          type: "system",
          title: "Verification Complete",
          message: "Your identity has been verified. You can now start bartering!",
        });
      } else if (status === "DECLINED") {
        updateData.isVerified = false;
        
        await storage.createNotification({
          userId: user.id,
          type: "system",
          title: "Verification Failed",
          message: "Your identity verification was declined. Please try again or contact support.",
        });
      }

      await storage.updateUser(user.id, updateData);
      res.json({ received: true });
    } catch (error) {
      console.error("Didit webhook error:", error);
      res.status(500).json({ message: "Webhook processing failed" });
    }
  });

  app.patch("/api/users/account-type", requireAuth, async (req, res) => {
    try {
      const { accountType } = req.body;
      if (!["individual", "business"].includes(accountType)) {
        return res.status(400).json({ message: "Invalid account type" });
      }

      const user = await storage.updateUser(req.session.userId!, { accountType });
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      const { password, ...userWithoutPassword } = user;
      res.json(userWithoutPassword);
    } catch (error) {
      console.error("Update account type error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Referral routes
  app.get("/api/referral/code", requireAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user) return res.status(404).json({ message: "User not found" });
      
      if (!user.referralCode) {
        const code = "BG-" + user.id.substring(0, 4).toUpperCase() + Math.random().toString(36).substring(2, 6).toUpperCase();
        const updated = await storage.updateUser(user.id, { referralCode: code });
        return res.json({ referralCode: updated?.referralCode });
      }
      
      res.json({ referralCode: user.referralCode });
    } catch (error) {
      console.error("Get referral code error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/referral/stats", requireAuth, async (req, res) => {
    try {
      const referralsList = await storage.getReferralsByUser(req.session.userId!);
      const sent = referralsList.filter(r => r.referrerId === req.session.userId);
      const feeWaiversEarned = sent.filter(r => r.referrerFeeWaived).length;
      const feeWaiversPending = sent.filter(r => !r.referrerFeeWaived).length;
      
      res.json({
        totalReferrals: sent.length,
        feeWaiversEarned,
        feeWaiversPending,
        referrals: referralsList,
      });
    } catch (error) {
      console.error("Get referral stats error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/referral/apply", requireAuth, async (req, res) => {
    try {
      const { referralCode } = req.body;
      if (!referralCode) return res.status(400).json({ message: "Referral code required" });
      
      const referrer = await storage.getUserByReferralCode(referralCode);
      if (!referrer) return res.status(404).json({ message: "Invalid referral code" });
      if (referrer.id === req.session.userId) return res.status(400).json({ message: "Cannot use your own referral code" });
      
      const user = await storage.getUser(req.session.userId!);
      if (user?.referredBy) return res.status(400).json({ message: "You have already used a referral code" });
      
      const existing = await storage.getReferralByUsers(referrer.id, req.session.userId!);
      if (existing) return res.status(400).json({ message: "Referral already exists" });
      
      await storage.updateUser(req.session.userId!, { referredBy: referrer.id });
      const referral = await storage.createReferral({ referrerId: referrer.id, referredId: req.session.userId! });
      
      await storage.createNotification({
        userId: referrer.id,
        type: "referral",
        title: "New Referral",
        message: `${user?.fullName} joined using your referral code! You both get 1 free deal fee waived.`,
      });
      
      res.json({ message: "Referral applied! Both you and the referrer get 1 free deal fee waived.", referral });
    } catch (error) {
      console.error("Apply referral error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/referral/check-waiver", requireAuth, async (req, res) => {
    try {
      const referralsList = await storage.getReferralsByUser(req.session.userId!);
      const hasWaiver = referralsList.some(r => {
        if (r.referrerId === req.session.userId && !r.referrerFeeWaived) return true;
        if (r.referredId === req.session.userId && !r.referredFeeWaived) return true;
        return false;
      });
      res.json({ hasWaiver, waiverCount: referralsList.filter(r => {
        if (r.referrerId === req.session.userId && !r.referrerFeeWaived) return true;
        if (r.referredId === req.session.userId && !r.referredFeeWaived) return true;
        return false;
      }).length });
    } catch (error) {
      console.error("Check waiver error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Wishlist routes
  app.get("/api/wishlist", requireAuth, async (req, res) => {
    try {
      const items = await storage.getWishlistByUser(req.session.userId!);
      res.json(items);
    } catch (error) {
      console.error("Get wishlist error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/wishlist/check/:listingId", requireAuth, async (req, res) => {
    try {
      const isWishlisted = await storage.isWishlisted(req.session.userId!, param(req.params.listingId));
      res.json({ isWishlisted });
    } catch (error) {
      console.error("Check wishlist error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/wishlist/:listingId", requireAuth, async (req, res) => {
    try {
      const already = await storage.isWishlisted(req.session.userId!, param(req.params.listingId));
      if (already) return res.status(400).json({ message: "Already in wishlist" });
      
      const wishlist = await storage.addToWishlist(req.session.userId!, param(req.params.listingId));
      res.json(wishlist);
    } catch (error) {
      console.error("Add to wishlist error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.delete("/api/wishlist/:listingId", requireAuth, async (req, res) => {
    try {
      await storage.removeFromWishlist(req.session.userId!, param(req.params.listingId));
      res.json({ message: "Removed from wishlist" });
    } catch (error) {
      console.error("Remove from wishlist error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Admin routes
  app.get("/api/admin/users", requireAdmin, async (req, res) => {
    try {
      const users = await storage.getAllUsers();
      res.json(users.map(({ password, ...u }) => u));
    } catch (error) {
      console.error("Admin get users error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/admin/listings", requireAdmin, async (req, res) => {
    try {
      const listings = await storage.getListings();
      const commentCounts = await storage.getListingCommentCounts();
      const enriched = listings.map(l => ({
        ...l,
        commentCount: commentCounts.get(l.id) || 0,
      }));
      res.json(enriched);
    } catch (error) {
      console.error("Admin get listings error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/admin/deals", requireAdmin, async (req, res) => {
    try {
      const deals = await storage.getAllDeals();
      res.json(deals);
    } catch (error) {
      console.error("Admin get deals error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.patch("/api/admin/users/:id/verify", requireAdmin, async (req, res) => {
    try {
      const { verified } = req.body;
      const user = await storage.updateUser(param(req.params.id), { isVerified: verified });
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      const { password, ...userWithoutPassword } = user;
      res.json(userWithoutPassword);
    } catch (error) {
      console.error("Admin verify user error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.patch("/api/admin/listings/:id/flag", requireAdmin, async (req, res) => {
    try {
      const { flagged } = req.body;
      const listing = await storage.updateListing(param(req.params.id), { isActive: !flagged });
      if (!listing) {
        return res.status(404).json({ message: "Listing not found" });
      }
      res.json(listing);
    } catch (error) {
      console.error("Admin flag listing error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/admin/analytics", requireAdmin, async (req, res) => {
    try {
      const allDeals = await storage.getAllDeals();
      const allUsers = await storage.getAllUsers();
      const allListings = await storage.getListings();
      
      const completedDeals = allDeals.filter(d => d.state === "completed");
      const activeDeals = allDeals.filter(d => ["proposed", "accepted", "in_progress", "delivery_proof"].includes(d.state));
      const totalGMV = completedDeals.reduce((sum, d) => 
        sum + parseFloat(d.seekerValue as string) + parseFloat(d.providerValue as string), 0);
      const feesCollected = completedDeals.reduce((sum, d) => 
        sum + (d.successFee ? parseFloat(d.successFee as string) : 0), 0);
      
      const now = new Date();
      const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const monthlyDeals = completedDeals.filter(d => d.createdAt && new Date(d.createdAt) >= thisMonth);
      const monthlyGMV = monthlyDeals.reduce((sum, d) => 
        sum + parseFloat(d.seekerValue as string) + parseFloat(d.providerValue as string), 0);
      const monthlyFees = monthlyDeals.reduce((sum, d) => 
        sum + (d.successFee ? parseFloat(d.successFee as string) : 0), 0);
      
      const pendingVerifications = allUsers.filter(u => 
        (u.kycStatus === "IN_PROGRESS" || u.kycStatus === "IN_REVIEW" || 
         u.kybStatus === "IN_PROGRESS" || u.kybStatus === "IN_REVIEW")
      ).length;
      
      const categoryStats: Record<string, number> = {};
      allListings.forEach(l => {
        const cats = l.categories as string[] || [];
        cats.forEach(cat => {
          categoryStats[cat] = (categoryStats[cat] || 0) + 1;
        });
      });
      
      const dealsPerWeek: { week: string; count: number }[] = [];
      for (let i = 11; i >= 0; i--) {
        const weekStart = new Date(now);
        weekStart.setDate(weekStart.getDate() - (i * 7));
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekEnd.getDate() + 7);
        const count = allDeals.filter(d => {
          if (!d.createdAt) return false;
          const created = new Date(d.createdAt);
          return created >= weekStart && created < weekEnd;
        }).length;
        dealsPerWeek.push({
          week: weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
          count
        });
      }
      
      res.json({
        totalUsers: allUsers.length,
        totalDeals: allDeals.length,
        activeDeals: activeDeals.length,
        completedDeals: completedDeals.length,
        totalListings: allListings.length,
        activeListings: allListings.filter(l => l.isActive).length,
        totalGMV,
        feesCollected,
        monthlyGMV,
        monthlyFees,
        pendingVerifications,
        categoryStats,
        dealsPerWeek,
      });
    } catch (error) {
      console.error("Admin analytics error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.patch("/api/admin/users/:id/role", requireAdmin, async (req, res) => {
    try {
      const { role } = req.body;
      if (!["user", "admin", "super_admin"].includes(role)) {
        return res.status(400).json({ message: "Invalid role" });
      }
      const isAdmin = role === "admin" || role === "super_admin";
      const user = await storage.updateUser(param(req.params.id), { role, isAdmin });
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      const { password, ...userWithoutPassword } = user;
      res.json(userWithoutPassword);
    } catch (error) {
      console.error("Admin change role error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.patch("/api/admin/users/:id/ban", requireAdmin, async (req, res) => {
    try {
      const { banned, reason } = req.body;
      const updates: any = { 
        isBanned: banned,
        bannedReason: banned ? reason : null,
        bannedAt: banned ? new Date() : null
      };
      const user = await storage.updateUser(param(req.params.id), updates);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      const { password, ...userWithoutPassword } = user;
      res.json(userWithoutPassword);
    } catch (error) {
      console.error("Admin ban user error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.delete("/api/admin/listings/:id", requireAdmin, async (req, res) => {
    try {
      const listing = await storage.updateListing(param(req.params.id), { isActive: false });
      if (!listing) {
        return res.status(404).json({ message: "Listing not found" });
      }
      res.json({ message: "Listing removed successfully" });
    } catch (error) {
      console.error("Admin delete listing error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/admin/deals/:id/messages", requireAdmin, async (req, res) => {
    try {
      const messages = await storage.getMessagesByDeal(param(req.params.id));
      res.json(messages);
    } catch (error) {
      console.error("Admin get deal messages error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Stripe checkout for deal completion
  app.post("/api/deals/:id/checkout", requireAuth, async (req, res) => {
    try {
      const deal = await storage.getDeal(param(req.params.id));
      if (!deal) {
        return res.status(404).json({ message: "Deal not found" });
      }
      
      if (deal.seekerId !== req.session.userId && deal.providerId !== req.session.userId) {
        return res.status(403).json({ message: "Not authorized" });
      }
      
      if (deal.state !== "delivery_proof" || !deal.seekerCompleted || !deal.providerCompleted) {
        return res.status(400).json({ message: "Deal must be in delivery_proof state with both parties marking complete" });
      }
      
      const seekerValue = parseFloat(deal.seekerValue as string);
      const providerValue = parseFloat(deal.providerValue as string);
      const smallerValue = Math.min(seekerValue, providerValue);
      const successFee = Math.max(smallerValue * 0.12, 100);
      
      const { getUncachableStripeClient, getStripePublishableKey } = await import("./stripeClient");
      const stripe = await getUncachableStripeClient();
      
      const baseUrl = `https://${process.env.REPLIT_DOMAINS?.split(',')[0]}`;
      
      const session = await stripe.checkout.sessions.create({
        payment_method_types: ["card"],
        line_items: [{
          price_data: {
            currency: "aed",
            product_data: {
              name: `BarterGram Success Fee - Deal ${deal.dealNumber}`,
              description: `12% success fee for completed barter deal (min AED 100)`,
            },
            unit_amount: Math.round(successFee * 100),
          },
          quantity: 1,
        }],
        mode: "payment",
        success_url: `${baseUrl}/deals/${deal.id}?payment=success`,
        cancel_url: `${baseUrl}/deals/${deal.id}?payment=cancelled`,
        metadata: {
          dealId: deal.id,
          dealNumber: deal.dealNumber,
        },
      });
      
      await storage.updateDeal(deal.id, { successFee: successFee.toString() });
      
      res.json({ url: session.url, fee: successFee });
    } catch (error) {
      console.error("Checkout error:", error);
      res.status(500).json({ message: "Failed to create checkout session" });
    }
  });

  // Onboarding routes
  const onboardingSchema = z.object({
    step: z.number().min(1).max(4),
    fullName: z.string().optional(),
    businessName: z.string().optional(),
    location: z.string().optional(),
    country: z.string().length(2).optional(),
    city: z.string().optional(),
    locationPrompted: z.boolean().optional(),
    bio: z.string().optional(),
    whatIOffer: z.array(z.object({
      name: z.string(),
      value: z.number(),
      description: z.string().optional(),
    })).optional(),
    whatINeed: z.array(z.object({
      name: z.string(),
      value: z.number(),
      description: z.string().optional(),
    })).optional(),
    avatarUrl: z.string().optional(),
    portfolioImages: z.array(z.string()).optional(),
  });

  app.patch("/api/onboarding", requireAuth, async (req, res) => {
    try {
      const data = onboardingSchema.parse(req.body);
      const { step, ...profileData } = data;
      
      const updateData: any = {
        ...profileData,
        onboardingStep: step,
      };
      
      if (step === 4) {
        updateData.onboardingCompleted = true;
        updateData.profileCompleted = true;
      }
      
      const user = await storage.updateUser(req.session.userId!, updateData);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      const { password, ...userWithoutPassword } = user;
      res.json(userWithoutPassword);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: error.errors[0].message });
      }
      console.error("Onboarding error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // AI Matching suggestions
  app.get("/api/suggestions", requireAuth, async (req, res) => {
    try {
      const currentUser = await storage.getUser(req.session.userId!);
      if (!currentUser) {
        return res.status(404).json({ message: "User not found" });
      }
      
      const userNeeds = currentUser.whatINeed || [];
      const allListings = await storage.getListings();
      
      const suggestions = allListings
        .filter(listing => {
          if (listing.userId === req.session.userId) return false;
          
          const needKeywords = userNeeds.map(n => n.name.toLowerCase());
          const listingText = `${listing.title} ${listing.description}`.toLowerCase();
          
          return needKeywords.some(keyword => listingText.includes(keyword));
        })
        .slice(0, 10);
      
      res.json(suggestions);
    } catch (error) {
      console.error("Suggestions error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // ========== Posts API ==========

  // Get feed posts with optional category filter
  app.get("/api/posts", async (req, res) => {
    try {
      const category = req.query.category as string | undefined;
      const limit = parseInt(req.query.limit as string) || 20;
      const offset = parseInt(req.query.offset as string) || 0;
      const worldwide = req.query.worldwide === "true";
      const sessionUserPosts = req.session?.userId
        ? await storage.getUser(req.session.userId)
        : null;
      const queryCountryPosts = (req.query.country as string | undefined)?.toUpperCase();
      const queryCityPosts = req.query.city as string | undefined;
      const country = worldwide
        ? undefined
        : queryCountryPosts || sessionUserPosts?.country?.toUpperCase() || undefined;
      const city = worldwide
        ? undefined
        : queryCityPosts || (queryCountryPosts ? undefined : sessionUserPosts?.city || undefined);
      const allPosts = await storage.getPosts({ category, limit: limit * 4, offset });
      const filtered = allPosts.filter((p) => {
        if (country) {
          const pc = (p.country || "").toUpperCase();
          if (pc !== country) return false;
        }
        if (city) {
          if ((p.city || "") !== city) return false;
        }
        return true;
      });
      const postsData = filtered.slice(0, limit);

      // Enrich posts with comment counts and user-specific state
      const enrichedPosts = await Promise.all(
        postsData.map(async (post) => {
          const commentCount = await storage.getCommentCount(post.id);
          if (req.session.userId) {
            const liked = await storage.isPostLiked(post.id, req.session.userId!);
            const bookmarked = await storage.isPostBookmarked(post.id, req.session.userId!);
            return { ...post, liked, bookmarked, commentCount };
          }
          return { ...post, commentCount };
        })
      );
      res.json(enrichedPosts);
    } catch (error) {
      console.error("Get posts error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Get stories
  app.get("/api/stories", async (req, res) => {
    try {
      const stories = await storage.getStories();
      res.json(stories);
    } catch (error) {
      console.error("Get stories error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/posts/trending", async (req, res) => {
    try {
      const trending = await storage.getTrendingPosts();
      res.json(trending);
    } catch (error) {
      console.error("Get trending posts error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Get single post
  app.get("/api/posts/:id", async (req, res) => {
    try {
      const post = await storage.getPost(param(req.params.id));
      if (!post) {
        return res.status(404).json({ message: "Post not found" });
      }
      if (req.session.userId) {
        const liked = await storage.isPostLiked(post.id, req.session.userId);
        return res.json({ ...post, liked });
      }
      res.json(post);
    } catch (error) {
      console.error("Get post error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Create post
  app.post("/api/posts", requireAuth, async (req, res) => {
    try {
      const validated = insertPostSchema.parse({
        ...req.body,
        userId: req.session.userId!,
      });
      const post = await storage.createPost(validated);
      res.status(201).json(post);

      import("./agents/moderationAgent").then(({ moderateAndLog }) => {
        moderateAndLog("post", post.id, {
          title: post.title,
          description: post.caption || undefined,
          categories: [post.feedCategory, post.subCategory].filter(Boolean) as string[],
        }, req.session.userId).catch(() => {});
      }).catch(() => {});
    } catch (error) {
      if (error instanceof Error && error.name === "ZodError") {
        return res.status(400).json({ message: "Invalid post data", errors: (error as Record<string, unknown>).errors });
      }
      console.error("Create post error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Like/unlike post
  app.post("/api/posts/:id/like", requireAuth, async (req, res) => {
    try {
      const postId = param(req.params.id);
      const userId = req.session.userId!;
      const isLiked = await storage.isPostLiked(postId, userId);
      if (isLiked) {
        await storage.unlikePost(postId, userId);
        res.json({ liked: false });
      } else {
        await storage.likePost(postId, userId);
        res.json({ liked: true });
      }
    } catch (error) {
      console.error("Like post error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Get comments for a post
  app.get("/api/posts/:id/comments", async (req, res) => {
    try {
      const comments = await storage.getCommentsByPost(param(req.params.id));
      res.json(comments);
    } catch (error) {
      console.error("Get comments error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Add comment to a post
  app.post("/api/posts/:id/comments", requireAuth, async (req, res) => {
    try {
      const { content, offerItemName, offerItemValue } = req.body;
      if (!offerItemName || typeof offerItemName !== "string" || offerItemName.trim().length === 0) {
        return res.status(400).json({ message: "Please specify what you want to offer" });
      }
      if (!offerItemValue || isNaN(Number(offerItemValue)) || Number(offerItemValue) <= 0) {
        return res.status(400).json({ message: "Please provide a valid value for your offer" });
      }
      const comment = await storage.createComment(
        param(req.params.id),
        req.session.userId!,
        content?.trim() || null,
        offerItemName.trim(),
        String(Number(offerItemValue).toFixed(2))
      );
      const user = await storage.getUser(req.session.userId!);
      const { password, ...safeUser } = user!;
      res.status(201).json({ ...comment, user: safeUser });
    } catch (error) {
      console.error("Create comment error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Delete comment
  app.delete("/api/posts/:postId/comments/:commentId", requireAuth, async (req, res) => {
    try {
      await storage.deleteComment(param(req.params.commentId), req.session.userId!);
      res.json({ message: "Comment deleted" });
    } catch (error) {
      console.error("Delete comment error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Bookmark/save a post
  app.post("/api/posts/:id/bookmark", requireAuth, async (req, res) => {
    try {
      const postId = param(req.params.id);
      const userId = req.session.userId!;
      const isBookmarked = await storage.isPostBookmarked(postId, userId);
      if (isBookmarked) {
        await storage.unbookmarkPost(postId, userId);
        res.json({ bookmarked: false });
      } else {
        await storage.bookmarkPost(postId, userId);
        res.json({ bookmarked: true });
      }
    } catch (error) {
      console.error("Bookmark post error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Get bookmarked posts
  app.get("/api/bookmarks", requireAuth, async (req, res) => {
    try {
      const posts = await storage.getBookmarkedPosts(req.session.userId!);
      res.json(posts);
    } catch (error) {
      console.error("Get bookmarks error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // ========== End Posts API ==========

  // User profile by ID (public)
  app.get("/api/users/:id", requireAuth, async (req, res) => {
    try {
      const user = await storage.getUser(param(req.params.id));
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      const ratings = await storage.getRatingsByUser(param(req.params.id));
      const avgRating = ratings.length > 0 
        ? ratings.reduce((sum, r) => sum + r.score, 0) / ratings.length 
        : 0;

      const userListings = await storage.getListingsByUser(param(req.params.id));
      const activeListings = userListings.filter(l => l.isActive);
      
      const { password, emailVerificationToken, passwordResetToken, ...publicUser } = user;
      res.json({ ...publicUser, avgRating, totalRatings: ratings.length, ratings, listings: activeListings });
    } catch (error) {
      console.error("Get user error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Create sample barter scenario deals for the current user
  app.post("/api/demo/sample-deals", requireAuth, async (req, res) => {
    try {
      const currentUser = await storage.getUser(req.session.userId!);
      if (!currentUser) {
        return res.status(404).json({ message: "User not found" });
      }

      const bcrypt = await import("bcryptjs");
      const hashedPassword = await bcrypt.hash("demo123", 10);

      const sampleBusinesses = [
        {
          email: `suit_manufacturer_${Date.now()}@demo.margin.ae`,
          password: hashedPassword,
          fullName: "Marco Bellini",
          bio: "Master tailor and bespoke suit manufacturer with over 20 years of experience in luxury menswear. Born in Milan, now based in Dubai, I bring Italian craftsmanship to the UAE market. Specializing in custom tailoring for executives, wedding suits, and formal wear collections. Every piece is hand-finished using the finest European fabrics.",
          location: "Dubai",
          isVerified: true,
          kycStatus: "APPROVED",
          businessName: "Bellini Bespoke Tailoring",
          whatIOffer: [{ name: "Bespoke Suits", value: 5000, description: "Custom tailored suits" }, { name: "Formal Wear", value: 3000 }, { name: "Wedding Suits", value: 7000 }],
          whatINeed: [{ name: "Model Services", value: 2000 }, { name: "Photography", value: 1500 }, { name: "Lookbook Design", value: 3000 }],
          phone: "+971 50 123 4567",
          website: "https://bellinibespoke.ae",
          socialLinks: { instagram: "https://instagram.com/bellinibespoke", linkedin: "https://linkedin.com/company/bellinibespoke" },
          accountType: "business",
          profileCompleted: true,
        },
        {
          email: `luxury_hotel_${Date.now()}@demo.margin.ae`,
          password: hashedPassword,
          fullName: "Layla Al-Farsi",
          bio: "General Manager of The Azure Resort & Spa, a boutique 5-star hotel on Dubai Marina. With 15 years in hospitality management, I oversee premium guest experiences including our award-winning spa, rooftop dining, and exclusive event spaces. Passionate about connecting with content creators who can showcase our unique property to the world.",
          location: "Dubai",
          isVerified: true,
          kycStatus: "APPROVED",
          businessName: "The Azure Resort & Spa",
          whatIOffer: [{ name: "Hotel Stays", value: 3000, description: "Luxury suite accommodations" }, { name: "Spa Treatments", value: 500 }, { name: "Event Space Rental", value: 8000 }],
          whatINeed: [{ name: "Social Media Content", value: 2000 }, { name: "Reels & Stories", value: 1000 }, { name: "Professional Photography", value: 3000 }],
          phone: "+971 4 567 8901",
          website: "https://azureresort.ae",
          socialLinks: { instagram: "https://instagram.com/azureresortdubai", linkedin: "https://linkedin.com/company/azure-resort", twitter: "https://x.com/azureresort" },
          accountType: "business",
          profileCompleted: true,
        },
        {
          email: `influencer_${Date.now()}@demo.margin.ae`,
          password: hashedPassword,
          fullName: "Sofia Reyes",
          bio: "Travel and lifestyle content creator with 500K+ followers across Instagram and TikTok. I specialize in creating authentic, engaging content for luxury hotels, restaurants, and lifestyle brands in the UAE and beyond. My audience is 70% women aged 25-40 with high purchasing power. Let's create something beautiful together.",
          location: "Dubai",
          isVerified: true,
          kycStatus: "APPROVED",
          businessName: null,
          whatIOffer: [{ name: "Instagram Reels", value: 1500 }, { name: "Stories Coverage", value: 500 }, { name: "TikTok Content", value: 1000 }, { name: "Blog Feature", value: 2000 }],
          whatINeed: [{ name: "Hotel Stays", value: 3000 }, { name: "Dining Experiences", value: 1000 }, { name: "Spa Days", value: 800 }],
          website: "https://sofiareyes.com",
          socialLinks: { instagram: "https://instagram.com/sofiareyes", twitter: "https://x.com/sofiareyestravel" },
          accountType: "individual",
          profileCompleted: true,
        },
        {
          email: `restaurant_${Date.now()}@demo.margin.ae`,
          password: hashedPassword,
          fullName: "Chef Khalid Al-Rashid",
          bio: "Award-winning executive chef and owner of Saffron & Sage, a modern Arabic fusion restaurant in DIFC. Trained at Le Cordon Bleu Paris, I bring international techniques to traditional Gulf flavors. Our restaurant has been featured in Time Out Dubai and Michelin Guide. Looking to exchange premium dining experiences for creative services that can elevate our brand.",
          location: "Dubai",
          isVerified: true,
          kycStatus: "APPROVED",
          businessName: "Saffron & Sage Restaurant",
          whatIOffer: [{ name: "Fine Dining Experiences", value: 1500 }, { name: "Catering Services", value: 5000 }, { name: "Private Chef Evening", value: 3000 }],
          whatINeed: [{ name: "Food Photography", value: 2000 }, { name: "Menu Design", value: 1000 }, { name: "Interior Photography", value: 1500 }],
          phone: "+971 4 345 6789",
          website: "https://saffronandsage.ae",
          socialLinks: { instagram: "https://instagram.com/saffronandsagedubai" },
          accountType: "business",
          profileCompleted: true,
        },
        {
          email: `food_photographer_${Date.now()}@demo.margin.ae`,
          password: hashedPassword,
          fullName: "Nina Chen",
          bio: "Professional food and lifestyle photographer based in Dubai with 8 years of experience. Clients include Zuma, La Petite Maison, and Four Seasons Hotels. I specialize in editorial food photography, restaurant interiors, and menu design shoots. My work has been published in Conde Nast Traveller and Food & Travel Magazine.",
          location: "Dubai",
          isVerified: true,
          kycStatus: "APPROVED",
          businessName: "NinaChen Studios",
          whatIOffer: [{ name: "Food Photography Session", value: 2500 }, { name: "Menu Shoot Package", value: 4000 }, { name: "Restaurant Interior Shoot", value: 3000 }],
          whatINeed: [{ name: "Dining Credits", value: 1500 }, { name: "Event Catering", value: 3000 }, { name: "Hotel Stays", value: 2000 }],
          website: "https://ninachenstudios.com",
          socialLinks: { instagram: "https://instagram.com/ninachenfood", linkedin: "https://linkedin.com/in/ninachen" },
          accountType: "business",
          profileCompleted: true,
        },
        {
          email: `saas_company_${Date.now()}@demo.margin.ae`,
          password: hashedPassword,
          fullName: "James Mitchell",
          bio: "Founder and CEO of CloudFlow Technologies, a fast-growing SaaS startup providing enterprise project management and CRM solutions. We serve 200+ businesses across the GCC with our all-in-one platform. Previously led product at two Y Combinator startups. Looking to exchange our premium software licenses for creative and design services to support our rebrand.",
          location: "Abu Dhabi",
          isVerified: true,
          kycStatus: "APPROVED",
          businessName: "CloudFlow Technologies",
          whatIOffer: [{ name: "12-Month SaaS License", value: 15000 }, { name: "Custom Integrations", value: 5000 }, { name: "API Access Package", value: 3000 }],
          whatINeed: [{ name: "Full Rebrand", value: 12000 }, { name: "UI/UX Design", value: 8000 }, { name: "Marketing Website", value: 5000 }],
          phone: "+971 2 678 9012",
          website: "https://cloudflow.tech",
          socialLinks: { linkedin: "https://linkedin.com/company/cloudflow-tech", twitter: "https://x.com/cloudflowtech" },
          accountType: "business",
          profileCompleted: true,
        },
        {
          email: `graphic_designer_${Date.now()}@demo.margin.ae`,
          password: hashedPassword,
          fullName: "Zara Ahmed",
          bio: "Senior brand designer and creative director with 12+ years of experience working with luxury and tech brands. My studio specializes in complete brand identity systems, packaging design, and digital experiences. Past clients include Emirates NBD, Careem, and Chalhoub Group. I believe great design is the foundation of every successful brand.",
          location: "Dubai",
          isVerified: true,
          kycStatus: "APPROVED",
          businessName: "Zara Design Studio",
          whatIOffer: [{ name: "Full Rebrand Package", value: 15000 }, { name: "Logo Design", value: 3000 }, { name: "Brand Guidelines", value: 5000 }],
          whatINeed: [{ name: "SaaS Tools", value: 10000 }, { name: "Project Management Software", value: 5000 }, { name: "Cloud Hosting", value: 2000 }],
          website: "https://zaradesign.studio",
          socialLinks: { instagram: "https://instagram.com/zaradesignstudio", linkedin: "https://linkedin.com/in/zaraahmed" },
          accountType: "business",
          profileCompleted: true,
        },
        {
          email: `dentist_${Date.now()}@demo.margin.ae`,
          password: hashedPassword,
          fullName: "Dr. Amira Hassan",
          bio: "Board-certified cosmetic dentist and founder of Pearl Smile Dental Clinic in JBR. Graduated from NYU College of Dentistry with specialization in aesthetic dentistry. We offer premium teeth whitening, veneers, and smile makeover services. Looking to trade our dental services for digital marketing expertise to grow our clinic's online presence.",
          location: "Dubai",
          isVerified: true,
          kycStatus: "APPROVED",
          businessName: "Pearl Smile Dental Clinic",
          whatIOffer: [{ name: "Teeth Whitening", value: 2500 }, { name: "Dental Cleaning", value: 500 }, { name: "Smile Consultation", value: 1000 }],
          whatINeed: [{ name: "Digital Ad Campaign", value: 5000 }, { name: "Social Media Marketing", value: 3000 }, { name: "Google Ads Management", value: 4000 }],
          phone: "+971 4 234 5678",
          website: "https://pearlsmile.ae",
          socialLinks: { instagram: "https://instagram.com/pearlsmiledubai", linkedin: "https://linkedin.com/company/pearl-smile-dental" },
          accountType: "business",
          profileCompleted: true,
        },
        {
          email: `marketing_agency_${Date.now()}@demo.margin.ae`,
          password: hashedPassword,
          fullName: "Ryan Thompson",
          bio: "Founder of Spark Digital Marketing, a performance-driven digital agency specializing in healthcare, wellness, and lifestyle brands. We manage AED 2M+ in annual ad spend across Google, Meta, and TikTok. Our data-driven approach has helped 50+ businesses achieve 3x+ ROAS. Open to bartering our services for health, wellness, and lifestyle experiences.",
          location: "Dubai",
          isVerified: true,
          kycStatus: "APPROVED",
          businessName: "Spark Digital Marketing",
          whatIOffer: [{ name: "Ad Campaign Management", value: 8000 }, { name: "Social Media Strategy", value: 4000 }, { name: "SEO Package", value: 6000 }],
          whatINeed: [{ name: "Health Services", value: 3000 }, { name: "Wellness Treatments", value: 2000 }, { name: "Fitness Programs", value: 1500 }],
          phone: "+971 50 987 6543",
          website: "https://sparkdigital.ae",
          socialLinks: { linkedin: "https://linkedin.com/company/spark-digital-ae", twitter: "https://x.com/sparkdigitalae", instagram: "https://instagram.com/sparkdigital" },
          accountType: "business",
          profileCompleted: true,
        },
        {
          email: `model_${Date.now()}@demo.margin.ae`,
          password: hashedPassword,
          fullName: "Alessandro Romano",
          bio: "Professional male model represented by Elite Model Management Dubai. Experienced in fashion, commercial, and editorial modeling with work published in GQ Middle East, Harper's Bazaar Arabia, and Vogue Man. Available for runway shows, lookbook shoots, and brand campaigns. Seeking premium tailoring and fashion partnerships.",
          location: "Dubai",
          isVerified: true,
          kycStatus: "APPROVED",
          businessName: null,
          whatIOffer: [{ name: "Fashion Modeling", value: 3000 }, { name: "Commercial Shoots", value: 2000 }, { name: "Runway Shows", value: 4000 }],
          whatINeed: [{ name: "Custom Suits", value: 5000 }, { name: "Formal Attire", value: 3000 }, { name: "Grooming Services", value: 1000 }],
          socialLinks: { instagram: "https://instagram.com/alessandroromano", linkedin: "https://linkedin.com/in/alessandroromano" },
          accountType: "individual",
          profileCompleted: true,
        },
      ];

      const createdUsers = [];
      for (const userData of sampleBusinesses) {
        const user = await storage.createUser(userData);
        createdUsers.push(user);
      }

      const [suitMaker, hotel, influencer, restaurant, foodPhotographer, saasCompany, graphicDesigner, dentist, marketingAgency, model] = createdUsers;

      const generateDealNumber = () => `RCP-${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).substring(2, 5).toUpperCase()}`;

      const barterScenarios = [
        {
          dealNumber: generateDealNumber(),
          seekerId: model.id,
          providerId: suitMaker.id,
          seekerListingId: null,
          providerListingId: null,
          seekerOffer: "Fashion modeling for lookbook and promotional materials (3 sessions)",
          seekerValue: "4500.00",
          providerOffer: "2 Custom Bespoke Suits with fittings",
          providerValue: "5000.00",
          state: "completed",
          timeline: "6 weeks for suit completion, modeling sessions over 2 weeks",
          deliverables: [
            { label: "3 full-day photo shoots", checked: true },
            { label: "Lookbook and promotional materials", checked: true },
            { label: "2 custom bespoke suits with fittings", checked: true },
            { label: "3 fitting sessions per suit", checked: true },
            { label: "Usage rights for all produced content", checked: true },
          ],
          seekerCompleted: true,
          providerCompleted: true,
        },
        {
          dealNumber: generateDealNumber(),
          seekerId: influencer.id,
          providerId: hotel.id,
          seekerListingId: null,
          providerListingId: null,
          seekerOffer: "15 Instagram Reels + 30 Stories + 5 TikTok videos featuring the resort",
          seekerValue: "4000.00",
          providerOffer: "5-Night Stay in Ocean View Suite with all meals",
          providerValue: "4500.00",
          state: "in_progress",
          timeline: "Content delivery within 2 weeks of stay",
          deliverables: [
            { label: "3 Reels + 5 Stories + 2 Posts", checked: true },
            { label: "Brand tagging in all content", checked: true },
            { label: "Usage rights for all produced content", checked: true },
            { label: "5 TikTok videos featuring the resort", checked: true },
            { label: "5-Night Stay in Ocean View Suite", checked: true },
            { label: "All meals included", checked: true },
            { label: "Re-sharing on personal channels", checked: true },
          ],
          seekerCompleted: false,
          providerCompleted: true,
        },
        {
          dealNumber: generateDealNumber(),
          seekerId: foodPhotographer.id,
          providerId: restaurant.id,
          seekerListingId: null,
          providerListingId: null,
          seekerOffer: "Complete menu photography session (50+ dishes) with editing",
          seekerValue: "4000.00",
          providerOffer: "AED 3,500 dining credit + 2 private chef experiences",
          providerValue: "4500.00",
          state: "completed",
          timeline: "Photography over 2 days, 1-week editing, dining credits valid 6 months",
          deliverables: [
            { label: "Professional photoshoot session (50+ dishes)", checked: true },
            { label: "Edited high-resolution images (minimum 20)", checked: true },
            { label: "Usage rights for commercial use", checked: true },
            { label: "AED 3,500 dining credit", checked: true },
            { label: "2 private chef experiences", checked: true },
            { label: "Retouching and post-production", checked: true },
          ],
          seekerCompleted: true,
          providerCompleted: true,
        },
        {
          dealNumber: generateDealNumber(),
          seekerId: graphicDesigner.id,
          providerId: saasCompany.id,
          seekerListingId: null,
          providerListingId: null,
          seekerOffer: "Complete brand identity redesign including logo, guidelines, and templates",
          seekerValue: "15000.00",
          providerOffer: "12-month enterprise license for entire team (up to 25 users)",
          providerValue: "15000.00",
          state: "in_progress",
          timeline: "Rebrand delivery in 8 weeks, license activated immediately",
          deliverables: [
            { label: "Brand identity package (logo, colors, typography)", checked: true },
            { label: "Design files in editable formats", checked: true },
            { label: "Brand guidelines document", checked: true },
            { label: "12-month enterprise software license", checked: true },
            { label: "Priority support access", checked: true },
            { label: "Onboarding and setup assistance", checked: true },
          ],
          seekerCompleted: false,
          providerCompleted: false,
        },
        {
          dealNumber: generateDealNumber(),
          seekerId: marketingAgency.id,
          providerId: dentist.id,
          seekerListingId: null,
          providerListingId: null,
          seekerOffer: "3-month digital advertising campaign (Google & Meta Ads)",
          seekerValue: "6000.00",
          providerOffer: "Teeth whitening for 4 team members + dental cleaning package",
          providerValue: "5500.00",
          state: "completed",
          timeline: "Campaign runs 3 months, dental services scheduled over 2 months",
          deliverables: [
            { label: "3-month digital advertising campaign", checked: true },
            { label: "Google and Meta Ads management", checked: true },
            { label: "Campaign strategy document", checked: true },
            { label: "Performance metrics report", checked: true },
            { label: "Teeth whitening for 4 team members", checked: true },
            { label: "Dental cleaning package", checked: true },
          ],
          seekerCompleted: true,
          providerCompleted: true,
        },
      ];

      const createdDeals = [];
      for (const dealData of barterScenarios) {
        const deal = await storage.createDeal(dealData);
        createdDeals.push(deal);
      }

      for (const deal of createdDeals.filter(d => d.state === "completed")) {
        await storage.createRating({
          dealId: deal.id,
          fromUserId: deal.seekerId,
          toUserId: deal.providerId,
          score: 5,
          review: "Excellent trade partner! Professional and delivered exactly as promised.",
        });
        await storage.createRating({
          dealId: deal.id,
          fromUserId: deal.providerId,
          toUserId: deal.seekerId,
          score: 5,
          review: "Great experience working together. Would definitely trade again!",
        });
      }

      res.json({
        message: "Sample barter scenarios created successfully!",
        users: createdUsers.length,
        deals: createdDeals.length,
        scenarios: [
          "Suit manufacturer ↔ Models (pay models in bespoke suits)",
          "Hotel ↔ Influencer (free stays ↔ reels + stories)",
          "Restaurant ↔ Food photographer (free meals ↔ professional photos)",
          "SaaS company ↔ Graphic designer (12-month license ↔ full rebrand)",
          "Dentist ↔ Marketing agency (free teeth whitening ↔ ad campaign)",
        ],
      });
    } catch (error) {
      console.error("Create sample deals error:", error);
      res.status(500).json({ message: "Failed to create sample deals" });
    }
  });

  // Endorsements routes
  app.get("/api/endorsements/check/:toUserId/:skill", requireAuth, async (req, res) => {
    try {
      const hasEndorsed = await storage.hasEndorsed(
        req.session.userId!,
        param(req.params.toUserId),
        param(req.params.skill)
      );
      res.json({ hasEndorsed });
    } catch (error) {
      console.error("Check endorsement error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/endorsements/:userId", async (req, res) => {
    try {
      const endorsements = await storage.getEndorsementsByUser(param(req.params.userId));
      res.json(endorsements);
    } catch (error) {
      console.error("Get endorsements error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/endorsements", requireAuth, async (req, res) => {
    try {
      const { toUserId, skill } = req.body;
      if (!toUserId || !skill) {
        return res.status(400).json({ message: "toUserId and skill are required" });
      }
      if (toUserId === req.session.userId) {
        return res.status(400).json({ message: "Cannot endorse yourself" });
      }
      const already = await storage.hasEndorsed(req.session.userId!, toUserId, skill);
      if (already) {
        return res.status(400).json({ message: "Already endorsed this skill" });
      }
      const endorsement = await storage.createEndorsement(req.session.userId!, toUserId, skill);
      res.json(endorsement);
    } catch (error) {
      console.error("Create endorsement error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.delete("/api/endorsements", requireAuth, async (req, res) => {
    try {
      const { toUserId, skill } = req.body;
      if (!toUserId || !skill) {
        return res.status(400).json({ message: "toUserId and skill are required" });
      }
      await storage.deleteEndorsement(req.session.userId!, toUserId, skill);
      res.json({ message: "Endorsement removed" });
    } catch (error) {
      console.error("Delete endorsement error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Saved Searches routes
  app.get("/api/saved-searches", requireAuth, async (req, res) => {
    try {
      const searches = await storage.getSavedSearchesByUser(req.session.userId!);
      res.json(searches);
    } catch (error) {
      console.error("Get saved searches error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/saved-searches", requireAuth, async (req, res) => {
    try {
      const { name, filters, notifyEnabled } = req.body;
      if (!name || !filters) {
        return res.status(400).json({ message: "name and filters are required" });
      }
      const savedSearch = await storage.createSavedSearch({
        userId: req.session.userId!,
        name,
        filters,
        notifyEnabled: notifyEnabled ?? true,
      });
      res.json(savedSearch);
    } catch (error) {
      console.error("Create saved search error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.delete("/api/saved-searches/:id", requireAuth, async (req, res) => {
    try {
      await storage.deleteSavedSearch(param(req.params.id), req.session.userId!);
      res.json({ message: "Saved search deleted" });
    } catch (error) {
      console.error("Delete saved search error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Deal Milestones routes
  app.get("/api/deals/:dealId/milestones", requireAuth, async (req, res) => {
    try {
      const deal = await storage.getDeal(param(req.params.dealId));
      if (!deal) {
        return res.status(404).json({ message: "Deal not found" });
      }
      if (deal.seekerId !== req.session.userId && deal.providerId !== req.session.userId) {
        return res.status(403).json({ message: "Not authorized" });
      }
      const milestones = await storage.getMilestonesByDeal(param(req.params.dealId));
      res.json(milestones);
    } catch (error) {
      console.error("Get milestones error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/deals/:dealId/milestones", requireAuth, async (req, res) => {
    try {
      const deal = await storage.getDeal(param(req.params.dealId));
      if (!deal) {
        return res.status(404).json({ message: "Deal not found" });
      }
      if (deal.seekerId !== req.session.userId && deal.providerId !== req.session.userId) {
        return res.status(403).json({ message: "Not authorized" });
      }
      const { title, description, sortOrder } = req.body;
      if (!title) {
        return res.status(400).json({ message: "title is required" });
      }
      const milestone = await storage.createMilestone({
        dealId: param(req.params.dealId),
        title,
        description: description || null,
        sortOrder: sortOrder ?? 0,
      });
      res.json(milestone);
    } catch (error) {
      console.error("Create milestone error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.patch("/api/deals/:dealId/milestones/:milestoneId/complete", requireAuth, async (req, res) => {
    try {
      const deal = await storage.getDeal(param(req.params.dealId));
      if (!deal) {
        return res.status(404).json({ message: "Deal not found" });
      }
      if (deal.seekerId !== req.session.userId && deal.providerId !== req.session.userId) {
        return res.status(403).json({ message: "Not authorized" });
      }
      const milestone = await storage.completeMilestone(param(req.params.milestoneId), req.session.userId!);
      if (!milestone) {
        return res.status(404).json({ message: "Milestone not found" });
      }
      res.json(milestone);
    } catch (error) {
      console.error("Complete milestone error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.delete("/api/deals/:dealId/milestones/:milestoneId", requireAuth, async (req, res) => {
    try {
      const deal = await storage.getDeal(param(req.params.dealId));
      if (!deal) {
        return res.status(404).json({ message: "Deal not found" });
      }
      if (deal.seekerId !== req.session.userId && deal.providerId !== req.session.userId) {
        return res.status(403).json({ message: "Not authorized" });
      }
      await storage.deleteMilestone(param(req.params.milestoneId));
      res.json({ message: "Milestone deleted" });
    } catch (error) {
      console.error("Delete milestone error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Portfolio Items routes
  app.get("/api/portfolio/:userId", async (req, res) => {
    try {
      const items = await storage.getPortfolioByUser(param(req.params.userId));
      res.json(items);
    } catch (error) {
      console.error("Get portfolio error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/portfolio", requireAuth, async (req, res) => {
    try {
      const { title, description, images, dealId, category, barterValue } = req.body;
      if (!title) {
        return res.status(400).json({ message: "title is required" });
      }
      const item = await storage.createPortfolioItem({
        userId: req.session.userId!,
        title,
        description: description || null,
        images: images || [],
        dealId: dealId || null,
        category: category || null,
        barterValue: barterValue || null,
      });
      res.json(item);
    } catch (error) {
      console.error("Create portfolio item error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.delete("/api/portfolio/:id", requireAuth, async (req, res) => {
    try {
      await storage.deletePortfolioItem(param(req.params.id), req.session.userId!);
      res.json({ message: "Portfolio item deleted" });
    } catch (error) {
      console.error("Delete portfolio item error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Quick Inquiries routes
  app.get("/api/inquiries/sent", requireAuth, async (req, res) => {
    try {
      const inquiries = await storage.getInquiriesByUser(req.session.userId!);
      res.json(inquiries);
    } catch (error) {
      console.error("Get sent inquiries error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/inquiries/received", requireAuth, async (req, res) => {
    try {
      const inquiries = await storage.getInquiriesForUser(req.session.userId!);
      res.json(inquiries);
    } catch (error) {
      console.error("Get received inquiries error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/inquiries", requireAuth, async (req, res) => {
    try {
      const { toUserId, listingId, postId, message } = req.body;
      if (!toUserId) {
        return res.status(400).json({ message: "toUserId is required" });
      }
      if (toUserId === req.session.userId) {
        return res.status(400).json({ message: "Cannot send inquiry to yourself" });
      }
      const inquiry = await storage.createInquiry({
        fromUserId: req.session.userId!,
        toUserId,
        listingId: listingId || null,
        postId: postId || null,
        message: message || "Is this still available?",
      });
      res.json(inquiry);
    } catch (error) {
      console.error("Create inquiry error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.patch("/api/inquiries/:id/reply", requireAuth, async (req, res) => {
    try {
      const { reply } = req.body;
      if (!reply) {
        return res.status(400).json({ message: "reply is required" });
      }
      const inquiry = await storage.replyToInquiry(param(req.params.id), reply);
      if (!inquiry) {
        return res.status(404).json({ message: "Inquiry not found" });
      }
      if (inquiry.toUserId !== req.session.userId) {
        return res.status(403).json({ message: "Not authorized to reply to this inquiry" });
      }
      res.json(inquiry);
    } catch (error) {
      console.error("Reply to inquiry error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.patch("/api/inquiries/:id/read", requireAuth, async (req, res) => {
    try {
      await storage.markInquiryRead(param(req.params.id));
      res.json({ success: true });
    } catch (error) {
      console.error("Mark inquiry read error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Recommendations & Discovery routes
  app.get("/api/recommendations/users", requireAuth, async (req, res) => {
    try {
      const recommended = await storage.getRecommendedUsers(req.session.userId!);
      res.json(recommended.map(({ password, ...u }) => u));
    } catch (error) {
      console.error("Get recommendations error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/explore/stats", async (req, res) => {
    try {
      const result = await db
        .select()
        .from(listings)
        .where(eq(listings.isActive, true));

      const categoryMap = new Map<string, number>();
      result.forEach((listing) => {
        const cats = (listing.categories as string[]) || [];
        cats.forEach((cat) => {
          categoryMap.set(cat, (categoryMap.get(cat) || 0) + 1);
        });
      });

      const stats = Array.from(categoryMap.entries()).map(([category, count]) => ({
        category,
        count,
      }));

      res.json(stats);
    } catch (error) {
      console.error("Get explore stats error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // ========== Business License Routes ==========
  app.patch("/api/admin/users/:id/kyb", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { status } = req.body; // "APPROVED" or "REJECTED"
      if (!["APPROVED", "REJECTED"].includes(status)) {
        return res.status(400).json({ message: "Status must be APPROVED or REJECTED" });
      }
      const updated = await storage.updateUser(param(req.params.id), { kybStatus: status });
      res.json(updated);
    } catch (error) {
      console.error("KYB update error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // ========== Pause / Unpause Account ==========
  app.patch("/api/admin/users/:id/pause", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { isPaused } = req.body;
      const updated = await storage.updateUser(param(req.params.id), { isPaused: !!isPaused });
      res.json(updated);
    } catch (error) {
      console.error("Pause account error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // ========== Reports API ==========
  app.post("/api/reports", requireAuth, async (req, res) => {
    try {
      const data = insertReportSchema.parse({
        ...req.body,
        reporterId: req.session.userId,
      });
      const [report] = await db.insert(reports).values(data).returning();
      res.json(report);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: error.errors[0].message });
      }
      console.error("Create report error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/admin/reports", requireAuth, requireAdmin, async (req, res) => {
    try {
      const allReports = await db.select().from(reports).orderBy(desc(reports.createdAt));
      res.json(allReports);
    } catch (error) {
      console.error("Get reports error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.patch("/api/admin/reports/:id/status", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { status } = req.body;
      if (!["pending", "dismissed", "actioned"].includes(status)) {
        return res.status(400).json({ message: "Invalid status" });
      }
      const [updated] = await db.update(reports)
        .set({ status })
        .where(eq(reports.id, param(req.params.id)))
        .returning();
      res.json(updated);
    } catch (error) {
      console.error("Update report status error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // ========== Behavioral Flags ==========
  app.get("/api/admin/behavioral-flags", requireAuth, requireAdmin, async (req, res) => {
    try {
      const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

      // Users with >5 listings in last 24h
      const rapidPosters = await db
        .select({ userId: listings.userId, count: count() })
        .from(listings)
        .where(gte(listings.createdAt, twentyFourHoursAgo))
        .groupBy(listings.userId)
        .having(sqlOperator`count(*) > 5`);

      // Users with reports against them (>3 reports)
      const reportedUsers = await db
        .select({ userId: reports.targetId, count: count() })
        .from(reports)
        .where(eq(reports.targetType, "user"))
        .groupBy(reports.targetId)
        .having(sqlOperator`count(*) >= 3`);

      // New accounts (<7 days old) that already have accepted deals
      const newAccountsWithDeals = await db
        .select({ id: users.id, email: users.email, fullName: users.fullName, createdAt: users.createdAt })
        .from(users)
        .where(gte(users.createdAt, sevenDaysAgo));

      res.json({
        rapidPosters: rapidPosters.map(r => ({ userId: r.userId, listingsIn24h: Number(r.count) })),
        reportedUsers: reportedUsers.map(r => ({ userId: r.userId, reportCount: Number(r.count) })),
        newAccountsWithDeals: newAccountsWithDeals.map(u => ({ 
          userId: u.id, email: u.email, fullName: u.fullName, createdAt: u.createdAt 
        })),
      });
    } catch (error) {
      console.error("Behavioral flags error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // ========== Inbox (Direct Messaging) ==========
  app.get("/api/inbox-unread-count", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const [result] = await db.select({ count: count() }).from(quickInquiries)
        .where(and(eq(quickInquiries.toUserId, userId), eq(quickInquiries.isRead, false)));
      res.json({ count: Number(result?.count || 0) });
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/inbox", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const allInquiries = await db.select().from(quickInquiries)
        .where(sqlOperator`(${quickInquiries.fromUserId} = ${userId} OR ${quickInquiries.toUserId} = ${userId})`)
        .orderBy(desc(quickInquiries.createdAt));

      // Group by conversation partner
      const conversations: Record<string, typeof allInquiries[0] & { otherUserId: string; unreadCount: number }> = {};
      for (const inq of allInquiries) {
        const otherUserId = inq.fromUserId === userId ? inq.toUserId : inq.fromUserId;
        if (!conversations[otherUserId]) {
          const unreadCount = allInquiries.filter(
            i => i.fromUserId === otherUserId && i.toUserId === userId && !i.isRead
          ).length;
          conversations[otherUserId] = { ...inq, otherUserId, unreadCount };
        }
      }

      // Enrich with user info
      const enriched = await Promise.all(
        Object.values(conversations).map(async (conv) => {
          const otherUser = await storage.getUser(conv.otherUserId);
          return { ...conv, otherUser: otherUser ? { id: otherUser.id, fullName: otherUser.fullName, avatarUrl: otherUser.avatarUrl, isVerified: otherUser.isVerified } : null };
        })
      );

      res.json(enriched);
    } catch (error) {
      console.error("Get inbox error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/inbox/:userId", requireAuth, async (req, res) => {
    try {
      const myId = req.session.userId!;
      const otherId = param(req.params.userId);

      const thread = await db.select().from(quickInquiries)
        .where(sqlOperator`(
          (${quickInquiries.fromUserId} = ${myId} AND ${quickInquiries.toUserId} = ${otherId}) OR
          (${quickInquiries.fromUserId} = ${otherId} AND ${quickInquiries.toUserId} = ${myId})
        )`)
        .orderBy(quickInquiries.createdAt);

      // Mark messages as read
      await db.update(quickInquiries)
        .set({ isRead: true })
        .where(and(eq(quickInquiries.fromUserId, otherId), eq(quickInquiries.toUserId, myId)));

      const otherUser = await storage.getUser(otherId);
      res.json({ 
        messages: thread, 
        otherUser: otherUser ? { id: otherUser.id, fullName: otherUser.fullName, avatarUrl: otherUser.avatarUrl, isVerified: otherUser.isVerified } : null
      });
    } catch (error) {
      console.error("Get thread error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  const inboxMessageSchema = z.object({
    message: z.string().min(1).max(2000),
    listingId: z.string().optional(),
  });

  app.post("/api/inbox/:userId", requireAuth, async (req, res) => {
    try {
      const fromUserId = req.session.userId!;
      const toUserId = param(req.params.userId);

      if (fromUserId === toUserId) {
        return res.status(400).json({ message: "Cannot message yourself" });
      }

      const data = inboxMessageSchema.parse(req.body);
      const [inq] = await db.insert(quickInquiries).values({
        fromUserId,
        toUserId,
        message: data.message,
        listingId: data.listingId || null,
        isRead: false,
      }).returning();

      res.json(inq);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: error.errors[0].message });
      }
      console.error("Send inbox message error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // ========== Market Average API ==========
  app.get("/api/market-average", async (req, res) => {
    try {
      const { getMarketAverage } = await import("./marketValues");
      const categories = (req.query.categories as string || "").split(",").filter(Boolean);
      const avg = getMarketAverage(categories);
      res.json({ average: avg });
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Credibility Score route
  app.get("/api/users/:userId/credibility", async (req, res) => {
    try {
      const userId = param(req.params.userId);
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      const endorsementCount = await storage.getEndorsementCount(userId);
      const ratings = await storage.getRatingsByUser(userId);
      const ratingAvg = ratings.length > 0
        ? ratings.reduce((sum, r) => sum + r.score, 0) / ratings.length
        : 0;

      const completedDeals = user.totalCompletedDeals || 0;
      const credibilityScore = Math.min(
        100,
        (completedDeals * 10) +
        (user.isVerified ? 20 : 0) +
        (ratingAvg * 8) +
        (endorsementCount * 3)
      );

      res.json({
        credibilityScore: Math.round(credibilityScore),
        completionRate: user.completionRate || "0",
        avgResponseTime: user.avgResponseTime || 0,
        totalCompletedDeals: completedDeals,
        endorsementCount,
        ratingAvg: Math.round(ratingAvg * 100) / 100,
      });
    } catch (error) {
      console.error("Get credibility error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // ========== AI Agent Routes ==========

  // Support chat
  app.post("/api/ai/support", requireAuth, async (req, res) => {
    try {
      const { message, history } = req.body;
      if (!message || typeof message !== "string") {
        return res.status(400).json({ message: "Message is required" });
      }
      const { getSupportResponse } = await import("./agents/supportAgent");
      const conversationHistory = (history || []).map((m: any) => ({
        role: m.role as "user" | "assistant",
        content: m.content as string,
      }));
      const result = await getSupportResponse(message, conversationHistory, req.session.userId);
      res.json({ response: result.response });
    } catch (error) {
      console.error("AI support error:", error);
      res.status(500).json({ message: "AI support unavailable" });
    }
  });

  // Valuation advice
  app.post("/api/ai/valuation", requireAuth, async (req, res) => {
    try {
      const { title, description, category, condition } = req.body;
      if (!title || !description || !category) {
        return res.status(400).json({ message: "Title, description, and category are required" });
      }
      const { getValuation } = await import("./agents/valuationAgent");
      const sessionUser = req.session.userId ? await storage.getUser(req.session.userId) : null;
      const advice = await getValuation(title, description, category, condition, req.session.userId, {
        country: sessionUser?.country,
        city: sessionUser?.city,
      });
      res.json(advice);
    } catch (error) {
      console.error("AI valuation error:", error);
      res.status(500).json({ message: "Valuation service unavailable" });
    }
  });

  // Smart matching
  app.get("/api/ai/matches", requireAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user) return res.status(404).json({ message: "User not found" });
      const allListings = await storage.getListings();
      const worldwide = req.query.worldwide === "true";
      const overrideCountry = (req.query.country as string | undefined)?.toUpperCase();
      const overrideCity = req.query.city as string | undefined;
      const userCountry = worldwide
        ? ""
        : (overrideCountry || user.country || "").toUpperCase();
      const userCity = worldwide ? "" : (overrideCity || user.city || "");
      const otherListings = allListings
        .filter((l) => l.userId !== user.id && l.isActive)
        .filter((l) => !userCountry || (l.country || "").toUpperCase() === userCountry)
        .filter((l) => !userCity || (l.city || "") === userCity)
        .map((l) => ({
          id: l.id,
          title: l.title,
          description: l.description,
          categories: l.categories,
          retailValue: l.retailValue,
          location: l.location,
          country: l.country,
          city: l.city,
          type: l.type,
          wantedCategories: l.wantedCategories,
        }));
      const { findMatches } = await import("./agents/matchingAgent");
      const matches = await findMatches(user, otherListings);
      const enriched = await Promise.all(
        matches.map(async (m) => {
          const listing = allListings.find((l) => l.id === m.listingId);
          return { ...m, listing: listing || null };
        })
      );
      res.json(enriched);
    } catch (error) {
      console.error("AI matching error:", error);
      res.status(500).json({ message: "Matching service unavailable" });
    }
  });

  // Engagement suggestions
  app.get("/api/ai/engagement", requireAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user) return res.status(404).json({ message: "User not found" });
      const userPosts = await storage.getPosts({ userId: user.id, limit: 10 });
      const userDeals = await storage.getDealsByUser(user.id);
      const { getEngagementSuggestions } = await import("./agents/engagementAgent");
      const suggestions = await getEngagementSuggestions(user, {
        postsCount: userPosts.length,
        dealsCount: userDeals.length,
        lastActive: user.lastActiveAt || undefined,
      });
      res.json(suggestions);
    } catch (error) {
      console.error("AI engagement error:", error);
      res.status(500).json({ message: "Engagement service unavailable" });
    }
  });

  // Admin insights
  app.get("/api/ai/admin/insights", requireAdmin, async (req, res) => {
    try {
      const allUsers = await storage.getAllUsers();
      const allListings = await storage.getListings();
      const allDeals = await storage.getAllDeals();
      const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const { getAdminInsights } = await import("./agents/adminAgent");
      const insights = await getAdminInsights({
        totalUsers: allUsers.length,
        activeUsers: allUsers.filter((u) => u.lastActiveAt && new Date(u.lastActiveAt) > oneWeekAgo).length,
        totalListings: allListings.length,
        totalDeals: allDeals.length,
        completedDeals: allDeals.filter((d) => d.state === "completed").length,
        pendingReports: 0,
        flaggedListings: allListings.filter((l) => l.valueFlagged || l.imageFlagged).length,
        recentSignups: allUsers.filter((u) => u.createdAt && new Date(u.createdAt) > oneWeekAgo).length,
      }, req.session.userId);
      res.json(insights);
    } catch (error) {
      console.error("AI admin insights error:", error);
      res.status(500).json({ message: "Admin intelligence unavailable" });
    }
  });

  // Admin ask agent
  app.post("/api/ai/admin/ask", requireAdmin, async (req, res) => {
    try {
      const { question } = req.body;
      if (!question) return res.status(400).json({ message: "Question is required" });
      const allUsers = await storage.getAllUsers();
      const allDeals = await storage.getAllDeals();
      const context = `Platform: ${allUsers.length} users, ${allDeals.length} deals, ${allDeals.filter(d => d.state === "completed").length} completed`;
      const { askAdminAgent } = await import("./agents/adminAgent");
      const result = await askAdminAgent(question, context, req.session.userId);
      res.json({ response: result.response });
    } catch (error) {
      console.error("AI admin ask error:", error);
      res.status(500).json({ message: "Admin agent unavailable" });
    }
  });

  // AI Logs for admin
  app.get("/api/ai/logs", requireAdmin, async (req, res) => {
    try {
      const { moderationLogs, agentInteractions } = await import("@shared/schema");
      const modLogs = await db
        .select()
        .from(moderationLogs)
        .orderBy(desc(moderationLogs.createdAt))
        .limit(50);
      const interactions = await db
        .select()
        .from(agentInteractions)
        .orderBy(desc(agentInteractions.createdAt))
        .limit(50);
      res.json({ moderationLogs: modLogs, agentInteractions: interactions });
    } catch (error) {
      console.error("AI logs error:", error);
      res.status(500).json({ message: "Failed to fetch AI logs" });
    }
  });

  return httpServer;
}
