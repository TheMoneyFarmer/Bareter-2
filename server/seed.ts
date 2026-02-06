import { db } from "./db";
import { users, listings, deals, ratings } from "@shared/schema";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";

export async function seedDatabase() {
  console.log("Checking if seed data exists...");

  // Check if data already exists
  const existingUsers = await db.select().from(users).limit(1);
  if (existingUsers.length > 0) {
    console.log("Seed data already exists, skipping...");
    return;
  }

  console.log("Seeding database with sample data...");

  const hashedPassword = await bcrypt.hash("password123", 10);

  // Create sample users
  const sampleUsers = await db
    .insert(users)
    .values([
      {
        email: "admin@margin.ae",
        password: hashedPassword,
        fullName: "Admin User",
        bio: "Platform administrator managing Margin marketplace",
        location: "Dubai",
        isAdmin: true,
        isVerified: true,
        businessName: "Margin Platform",
        whatIOffer: [{ name: "Platform Management", value: 0 }, { name: "Support Services", value: 0 }],
        whatINeed: [{ name: "Quality Partners", value: 0 }, { name: "Business Growth", value: 0 }],
        profileCompleted: true,
      },
      {
        email: "sarah@luxuryhotels.ae",
        password: hashedPassword,
        fullName: "Sarah Al Maktoum",
        bio: "Managing Director of Luxury Hotels Group with 18 years of experience in the UAE hospitality industry. Our portfolio includes 5-star properties across Dubai and Abu Dhabi. We offer premium hospitality experiences including luxury suite accommodations, event spaces, and F&B credits in exchange for marketing, technology, and creative services.",
        location: "Dubai",
        isVerified: true,
        businessName: "Luxury Hotels Group",
        whatIOffer: [{ name: "Hotel Room Nights", value: 3000 }, { name: "Event Spaces", value: 15000 }, { name: "F&B Credits", value: 2000 }],
        whatINeed: [{ name: "Digital Marketing", value: 5000 }, { name: "Web Development", value: 10000 }, { name: "Photography", value: 3000 }],
        phone: "+971 4 888 9999",
        website: "https://luxuryhotelsgroup.ae",
        socialLinks: { instagram: "https://instagram.com/luxuryhotelsuae", linkedin: "https://linkedin.com/company/luxury-hotels-group" },
        accountType: "business",
        profileCompleted: true,
      },
      {
        email: "omar@techstartup.ae",
        password: hashedPassword,
        fullName: "Omar Hassan",
        bio: "Founder and CTO of TechFlow Solutions, a B2B SaaS company providing workflow automation and CRM tools to businesses across the GCC. Our platform serves 500+ companies. Previously worked at Careem and Noon. Looking to exchange our enterprise software licenses and custom development services for office space, travel perks, and marketing support.",
        location: "Abu Dhabi",
        isVerified: true,
        businessName: "TechFlow Solutions",
        whatIOffer: [{ name: "SaaS Subscriptions", value: 12000 }, { name: "Custom Development", value: 20000 }, { name: "IT Consulting", value: 5000 }],
        whatINeed: [{ name: "Office Space", value: 30000 }, { name: "Travel Perks", value: 5000 }, { name: "Marketing Services", value: 8000 }],
        phone: "+971 2 555 6789",
        website: "https://techflow.ae",
        socialLinks: { linkedin: "https://linkedin.com/company/techflow-solutions", twitter: "https://x.com/techflowae" },
        accountType: "business",
        profileCompleted: true,
      },
      {
        email: "fatima@fashionhouse.ae",
        password: hashedPassword,
        fullName: "Fatima Al Rashid",
        bio: "Fashion designer and founder of Maison Fatima, a luxury abaya and modest fashion brand based in Sharjah. Each piece is handcrafted using premium fabrics sourced from Italy and Japan. Our designs have been featured in Vogue Arabia and Harper's Bazaar. Looking for photography, social media, and event services to support our upcoming collection launch.",
        location: "Sharjah",
        isVerified: false,
        businessName: "Maison Fatima",
        whatIOffer: [{ name: "Designer Clothing", value: 5000 }, { name: "Custom Tailoring", value: 3000 }, { name: "Fashion Consulting", value: 2000 }],
        whatINeed: [{ name: "Photography Services", value: 4000 }, { name: "Social Media Management", value: 3000 }, { name: "Events", value: 5000 }],
        website: "https://maisonfatima.ae",
        socialLinks: { instagram: "https://instagram.com/maisonfatima" },
        accountType: "business",
        profileCompleted: true,
      },
      {
        email: "ahmed@eventspro.ae",
        password: hashedPassword,
        fullName: "Ahmed Khalid",
        bio: "Founder and Managing Director of Events Pro UAE, a full-service event management company specializing in corporate events, conferences, and luxury celebrations. With 10+ years of experience, we've delivered 500+ events for clients including ADNOC, du, and Emaar. Our team handles everything from venue selection to on-site execution.",
        location: "Dubai",
        isVerified: true,
        businessName: "Events Pro UAE",
        whatIOffer: [{ name: "Event Planning", value: 10000 }, { name: "Venue Coordination", value: 5000 }, { name: "Entertainment", value: 8000 }],
        whatINeed: [{ name: "Catering", value: 15000 }, { name: "AV Equipment", value: 5000 }, { name: "Printing Services", value: 3000 }],
        phone: "+971 50 777 8888",
        website: "https://eventsprouae.com",
        socialLinks: { instagram: "https://instagram.com/eventsprouae", linkedin: "https://linkedin.com/company/events-pro-uae" },
        accountType: "business",
        profileCompleted: true,
      },
    ])
    .returning();

  console.log(`Created ${sampleUsers.length} sample users`);

  // Create sample listings
  const sampleListings = await db
    .insert(listings)
    .values([
      {
        userId: sampleUsers[1].id, // Sarah
        type: "offer",
        title: "5 Nights Luxury Suite at Marina Bay Hotel",
        description:
          "Premium luxury suite accommodation in our 5-star Marina Bay Hotel. Includes breakfast, spa access, and airport transfers. Perfect for hosting VIP clients or a luxurious getaway. Suite features panoramic views, king bed, and separate living area.",
        categories: ["Hospitality", "Events"],
        retailValue: "15000.00",
        location: "Dubai",
        tags: ["luxury", "hotel", "accommodation", "spa", "marina"],
        isActive: true,
        viewCount: 45,
      },
      {
        userId: sampleUsers[1].id, // Sarah
        type: "offer",
        title: "Corporate Event Space for 100 Guests",
        description:
          "Beautiful ballroom venue for corporate events, conferences, or celebrations. Includes basic AV equipment, catering coordination, and event support staff. Available for full-day bookings.",
        categories: ["Events", "Hospitality"],
        retailValue: "25000.00",
        location: "Dubai",
        tags: ["event", "corporate", "venue", "ballroom"],
        isActive: true,
        viewCount: 32,
      },
      {
        userId: sampleUsers[2].id, // Omar
        type: "offer",
        title: "1-Year Enterprise SaaS License",
        description:
          "Full enterprise license for our project management and CRM platform. Includes unlimited users, premium support, and custom integrations. Regular retail price applies for the complete package.",
        categories: ["SaaS", "Technology"],
        retailValue: "12000.00",
        location: "Abu Dhabi",
        tags: ["software", "saas", "enterprise", "crm", "project management"],
        isActive: true,
        viewCount: 28,
      },
      {
        userId: sampleUsers[2].id, // Omar
        type: "request",
        title: "Looking for Premium Office Space",
        description:
          "Seeking furnished office space for our growing team of 20. Need modern facilities, meeting rooms, and good connectivity. Flexible on location within UAE. Can offer tech services in exchange.",
        categories: ["Services", "Real Estate"],
        retailValue: "50000.00",
        location: "Abu Dhabi",
        tags: ["office", "workspace", "commercial", "rent"],
        isActive: true,
        viewCount: 19,
      },
      {
        userId: sampleUsers[3].id, // Fatima
        type: "offer",
        title: "Custom Designer Abaya Collection (10 pieces)",
        description:
          "Handcrafted designer abayas featuring premium fabrics and intricate embroidery. Collection of 10 unique pieces in various sizes. Perfect for boutique retailers or special occasions.",
        categories: ["Fashion"],
        retailValue: "18000.00",
        location: "Sharjah",
        tags: ["fashion", "abaya", "designer", "luxury", "custom"],
        isActive: true,
        viewCount: 52,
      },
      {
        userId: sampleUsers[3].id, // Fatima
        type: "request",
        title: "Need Professional Fashion Photography",
        description:
          "Looking for experienced fashion photographer for our upcoming collection launch. Need studio and outdoor shots, editing, and delivery within 2 weeks. Willing to trade designer pieces.",
        categories: ["Services", "Fashion"],
        retailValue: "8000.00",
        location: "Sharjah",
        tags: ["photography", "fashion", "studio", "creative"],
        isActive: true,
        viewCount: 15,
      },
      {
        userId: sampleUsers[4].id, // Ahmed
        type: "offer",
        title: "Full Corporate Event Management Package",
        description:
          "Complete event planning and management for corporate events up to 200 guests. Includes venue selection, vendor coordination, on-site management, and post-event reporting. 3 events package.",
        categories: ["Events", "Services"],
        retailValue: "35000.00",
        location: "Dubai",
        tags: ["events", "corporate", "planning", "management"],
        isActive: true,
        viewCount: 38,
      },
      {
        userId: sampleUsers[4].id, // Ahmed
        type: "request",
        title: "Catering Partner for Upcoming Events",
        description:
          "Need reliable catering partner for 5 upcoming corporate events. Total of approximately 500 guests across all events. Looking for diverse menu options and professional service.",
        categories: ["Food", "Services"],
        retailValue: "45000.00",
        location: "Dubai",
        tags: ["catering", "food", "corporate", "events"],
        isActive: true,
        viewCount: 24,
      },
    ])
    .returning();

  console.log(`Created ${sampleListings.length} sample listings`);

  // Create a sample deal
  const sampleDeals = await db
    .insert(deals)
    .values([
      {
        dealNumber: "RCP-DEMO001",
        seekerId: sampleUsers[2].id, // Omar
        providerId: sampleUsers[1].id, // Sarah
        seekerOffer: "6-Month Enterprise SaaS License with Custom Integration",
        seekerValue: "8000.00",
        providerOffer: "3 Nights Luxury Suite at Marina Bay Hotel",
        providerValue: "9000.00",
        state: "completed",
        timeline: "Delivery within 30 days",
        deliverables: "Software access and hotel vouchers",
        seekerCompleted: true,
        providerCompleted: true,
      },
    ])
    .returning();

  console.log(`Created ${sampleDeals.length} sample deals`);

  // Create ratings for completed deal
  await db.insert(ratings).values([
    {
      dealId: sampleDeals[0].id,
      fromUserId: sampleUsers[2].id, // Omar
      toUserId: sampleUsers[1].id, // Sarah
      score: 5,
      review:
        "Excellent partner to work with! The hotel experience was amazing and everything was delivered as promised. Highly recommend bartering with Sarah.",
    },
    {
      dealId: sampleDeals[0].id,
      fromUserId: sampleUsers[1].id, // Sarah
      toUserId: sampleUsers[2].id, // Omar
      score: 5,
      review:
        "Omar's software platform has transformed how we manage our hotel bookings. Professional service and great communication throughout.",
    },
  ]);

  console.log("Created sample ratings");
  console.log("Database seeding completed!");
}
