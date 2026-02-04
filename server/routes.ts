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
  // Session middleware
  app.use(
    session({
      secret: process.env.SESSION_SECRET || "recipro-secret-key",
      resave: false,
      saveUninitialized: false,
      store: new MemoryStore({
        checkPeriod: 86400000,
      }),
      cookie: {
        secure: process.env.NODE_ENV === "production",
        httpOnly: true,
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
      const { password, ...userWithoutPassword } = user;
      res.json(userWithoutPassword);
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
      const { password, ...userWithoutPassword } = user;
      res.json(userWithoutPassword);
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

  app.post("/api/deals", requireAuth, async (req, res) => {
    try {
      const { providerListingId, seekerOffer, seekerValue } = req.body;

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
      const user = await storage.updateUser(req.params.id, { isVerified: true });
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

  return httpServer;
}
