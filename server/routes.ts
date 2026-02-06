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
} from "@shared/schema";
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

  app.post("/api/auth/logout", (req, res) => {
    req.session.destroy((err) => {
      if (err) {
        return res.status(500).json({ message: "Failed to logout" });
      }
      res.json({ message: "Logged out successfully" });
    });
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

      if (verified === "true") {
        listings = listings.filter((l) => l.user?.isVerified);
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

      res.json(listings);
    } catch (error) {
      console.error("Get listings error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/listings/user/:userId", requireAuth, async (req, res) => {
    try {
      const listings = await storage.getListingsByUser(req.params.userId);
      res.json(listings);
    } catch (error) {
      console.error("Get user listings error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/listings/:id", async (req, res) => {
    try {
      const listing = await storage.getListingWithUser(req.params.id);
      if (!listing) {
        return res.status(404).json({ message: "Listing not found" });
      }
      await storage.incrementListingViews(req.params.id);
      res.json(listing);
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

      const data = insertListingSchema.parse({
        ...req.body,
        userId: req.session.userId,
      });
      const listing = await storage.createListing(data);
      res.json(listing);
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
      const listing = await storage.getListing(req.params.id);
      if (!listing) {
        return res.status(404).json({ message: "Listing not found" });
      }
      if (listing.userId !== req.session.userId) {
        return res.status(403).json({ message: "Not authorized" });
      }
      const updated = await storage.updateListing(req.params.id, req.body);
      res.json(updated);
    } catch (error) {
      console.error("Update listing error:", error);
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
      const followers = await storage.getFollowers(req.params.id);
      res.json(followers);
    } catch (error) {
      console.error("Get followers error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/users/:id/following", requireAuth, async (req, res) => {
    try {
      const following = await storage.getFollowing(req.params.id);
      res.json(following);
    } catch (error) {
      console.error("Get following error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/users/:id/follow", requireAuth, async (req, res) => {
    try {
      const followingId = req.params.id;
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
      const followingId = req.params.id;
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
      const followerId = req.params.id;
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
      const deal = await storage.getDealWithUsers(req.params.id);
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
      const deal = await storage.getDealWithUsers(req.params.id);
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
      doc.text("Generated by Margin Barter Marketplace | www.margin.ae", 105, 285, { align: "center" });
      
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
    deliverables: z.string().optional(),
  });

  app.patch("/api/deals/:id", requireAuth, async (req, res) => {
    try {
      const deal = await storage.getDeal(req.params.id);
      if (!deal) {
        return res.status(404).json({ message: "Deal not found" });
      }
      if (deal.seekerId !== req.session.userId && deal.providerId !== req.session.userId) {
        return res.status(403).json({ message: "Not authorized" });
      }

      const data = updateDealSchema.parse(req.body);
      const isSeeker = deal.seekerId === req.session.userId;
      const isProvider = deal.providerId === req.session.userId;

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

      let updated = await storage.updateDeal(req.params.id, data);

      // Check if both parties completed - auto-complete the deal
      if (updated && updated.seekerCompleted && updated.providerCompleted && updated.state === "delivery_proof") {
        updated = await storage.updateDeal(req.params.id, { state: "completed" });
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
      const deal = await storage.getDeal(req.params.id);
      if (!deal) {
        return res.status(404).json({ message: "Deal not found" });
      }
      if (deal.seekerId !== req.session.userId && deal.providerId !== req.session.userId) {
        return res.status(403).json({ message: "Not authorized" });
      }
      const messages = await storage.getMessagesByDeal(req.params.id);
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
      const deal = await storage.getDeal(req.params.id);
      if (!deal) {
        return res.status(404).json({ message: "Deal not found" });
      }
      if (deal.seekerId !== req.session.userId && deal.providerId !== req.session.userId) {
        return res.status(403).json({ message: "Not authorized" });
      }

      const data = createMessageSchema.parse(req.body);

      const message = await storage.createMessage({
        dealId: req.params.id,
        senderId: req.session.userId!,
        content: data.content,
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
      const ratings = await storage.getRatingsByUser(req.params.userId);
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
      await storage.markNotificationAsRead(req.params.id);
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
          message: "Your identity has been verified. You can now start trading!",
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
      res.json(listings);
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
      const user = await storage.updateUser(req.params.id, { isVerified: verified });
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
      const listing = await storage.updateListing(req.params.id, { isActive: !flagged });
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
      const user = await storage.updateUser(req.params.id, { role, isAdmin });
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
      const user = await storage.updateUser(req.params.id, updates);
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
      const listing = await storage.updateListing(req.params.id, { isActive: false });
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
      const messages = await storage.getMessagesByDeal(req.params.id);
      res.json(messages);
    } catch (error) {
      console.error("Admin get deal messages error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Stripe checkout for deal completion
  app.post("/api/deals/:id/checkout", requireAuth, async (req, res) => {
    try {
      const deal = await storage.getDeal(req.params.id);
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
              name: `Margin Success Fee - Deal ${deal.dealNumber}`,
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

  // User profile by ID (public)
  app.get("/api/users/:id", async (req, res) => {
    try {
      const user = await storage.getUser(req.params.id);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      const ratings = await storage.getRatingsByUser(req.params.id);
      const avgRating = ratings.length > 0 
        ? ratings.reduce((sum, r) => sum + r.score, 0) / ratings.length 
        : 0;
      
      const { password, emailVerificationToken, passwordResetToken, ...publicUser } = user;
      res.json({ ...publicUser, avgRating, totalRatings: ratings.length, ratings });
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
          bio: "Master tailor and bespoke suit manufacturer. Specializing in luxury menswear and custom tailoring for executives.",
          location: "Dubai",
          isVerified: true,
          businessName: "Bellini Bespoke Tailoring",
          whatIOffer: [{ name: "Bespoke Suits", value: 5000, description: "Custom tailored suits" }, { name: "Formal Wear", value: 3000 }],
          whatINeed: [{ name: "Model Services", value: 2000 }, { name: "Photography", value: 1500 }],
          kycStatus: "APPROVED",
        },
        {
          email: `luxury_hotel_${Date.now()}@demo.margin.ae`,
          password: hashedPassword,
          fullName: "Layla Al-Farsi",
          bio: "General Manager of a boutique luxury hotel. Offering premium stays for content creators and influencers.",
          location: "Dubai",
          isVerified: true,
          businessName: "The Azure Resort & Spa",
          whatIOffer: [{ name: "Hotel Stays", value: 3000, description: "Luxury suite accommodations" }, { name: "Spa Treatments", value: 500 }],
          whatINeed: [{ name: "Social Media Content", value: 2000 }, { name: "Reels & Stories", value: 1000 }],
          kycStatus: "APPROVED",
        },
        {
          email: `influencer_${Date.now()}@demo.margin.ae`,
          password: hashedPassword,
          fullName: "Sofia Reyes",
          bio: "Travel and lifestyle influencer with 500K+ followers. Creating engaging content for premium brands.",
          location: "Dubai",
          isVerified: true,
          businessName: null,
          whatIOffer: [{ name: "Instagram Reels", value: 1500 }, { name: "Stories Coverage", value: 500 }, { name: "TikTok Content", value: 1000 }],
          whatINeed: [{ name: "Hotel Stays", value: 3000 }, { name: "Experiences", value: 2000 }],
          kycStatus: "APPROVED",
        },
        {
          email: `restaurant_${Date.now()}@demo.margin.ae`,
          password: hashedPassword,
          fullName: "Chef Khalid Al-Rashid",
          bio: "Award-winning chef and restaurant owner. Offering premium dining experiences in exchange for creative services.",
          location: "Dubai",
          isVerified: true,
          businessName: "Saffron & Sage Restaurant",
          whatIOffer: [{ name: "Fine Dining Experiences", value: 1500 }, { name: "Catering Services", value: 5000 }],
          whatINeed: [{ name: "Food Photography", value: 2000 }, { name: "Menu Design", value: 1000 }],
          kycStatus: "APPROVED",
        },
        {
          email: `food_photographer_${Date.now()}@demo.margin.ae`,
          password: hashedPassword,
          fullName: "Nina Chen",
          bio: "Professional food and lifestyle photographer. Specializing in restaurant, menu, and culinary content.",
          location: "Dubai",
          isVerified: true,
          businessName: "NinaChen Studios",
          whatIOffer: [{ name: "Food Photography Session", value: 2500 }, { name: "Menu Shoot Package", value: 4000 }],
          whatINeed: [{ name: "Dining Credits", value: 1500 }, { name: "Event Catering", value: 3000 }],
          kycStatus: "APPROVED",
        },
        {
          email: `saas_company_${Date.now()}@demo.margin.ae`,
          password: hashedPassword,
          fullName: "James Mitchell",
          bio: "Founder of a fast-growing SaaS startup. Offering enterprise software licenses in exchange for creative services.",
          location: "Abu Dhabi",
          isVerified: true,
          businessName: "CloudFlow Technologies",
          whatIOffer: [{ name: "12-Month SaaS License", value: 15000 }, { name: "Custom Integrations", value: 5000 }],
          whatINeed: [{ name: "Full Rebrand", value: 12000 }, { name: "UI/UX Design", value: 8000 }],
          kycStatus: "APPROVED",
        },
        {
          email: `graphic_designer_${Date.now()}@demo.margin.ae`,
          password: hashedPassword,
          fullName: "Zara Ahmed",
          bio: "Senior brand designer with 10+ years experience. Specializing in complete brand identity and rebranding projects.",
          location: "Dubai",
          isVerified: true,
          businessName: "Zara Design Studio",
          whatIOffer: [{ name: "Full Rebrand Package", value: 15000 }, { name: "Logo Design", value: 3000 }],
          whatINeed: [{ name: "SaaS Tools", value: 10000 }, { name: "Project Management Software", value: 5000 }],
          kycStatus: "APPROVED",
        },
        {
          email: `dentist_${Date.now()}@demo.margin.ae`,
          password: hashedPassword,
          fullName: "Dr. Amira Hassan",
          bio: "Cosmetic dentist specializing in teeth whitening and smile makeovers. Trading dental services for marketing.",
          location: "Dubai",
          isVerified: true,
          businessName: "Pearl Smile Dental Clinic",
          whatIOffer: [{ name: "Teeth Whitening", value: 2500 }, { name: "Dental Cleaning", value: 500 }],
          whatINeed: [{ name: "Digital Ad Campaign", value: 5000 }, { name: "Social Media Marketing", value: 3000 }],
          kycStatus: "APPROVED",
        },
        {
          email: `marketing_agency_${Date.now()}@demo.margin.ae`,
          password: hashedPassword,
          fullName: "Ryan Thompson",
          bio: "Digital marketing agency founder. Running performance campaigns for healthcare and wellness brands.",
          location: "Dubai",
          isVerified: true,
          businessName: "Spark Digital Marketing",
          whatIOffer: [{ name: "Ad Campaign Management", value: 8000 }, { name: "Social Media Strategy", value: 4000 }],
          whatINeed: [{ name: "Health Services", value: 3000 }, { name: "Wellness Treatments", value: 2000 }],
          kycStatus: "APPROVED",
        },
        {
          email: `model_${Date.now()}@demo.margin.ae`,
          password: hashedPassword,
          fullName: "Alessandro Romano",
          bio: "Professional male model for fashion and commercial shoots. Available for runway and editorial work.",
          location: "Dubai",
          isVerified: true,
          businessName: null,
          whatIOffer: [{ name: "Fashion Modeling", value: 3000 }, { name: "Commercial Shoots", value: 2000 }],
          whatINeed: [{ name: "Custom Suits", value: 5000 }, { name: "Formal Attire", value: 3000 }],
          kycStatus: "APPROVED",
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
          deliverables: "Model: 3 full-day photo shoots; Tailor: 2 custom suits with 3 fitting sessions each",
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
          deliverables: "Influencer: 50+ content pieces with tags and mentions; Hotel: Full accommodation package",
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
          deliverables: "Photographer: 50+ edited photos; Restaurant: Dining credit and 2 chef table experiences",
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
          deliverables: "Designer: Full brand kit; SaaS: 12-month unlimited license with priority support",
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
          deliverables: "Agency: Full campaign with reporting; Dentist: Whitening + cleaning for 4 people",
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

  return httpServer;
}
