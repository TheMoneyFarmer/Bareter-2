import { db } from "./db";
import { users, listings, deals, ratings, posts } from "@shared/schema";
import bcrypt from "bcryptjs";
import { eq, sql } from "drizzle-orm";

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

  // Create sample posts for the feed
  const samplePosts = await db
    .insert(posts)
    .values([
      // Real Estate posts (4)
      {
        userId: sampleUsers[1].id,
        title: "Palm Jumeirah 4-Bed Villa with Private Beach",
        caption: "Stunning beachfront villa on the Palm. Fully furnished, private pool, direct beach access. Open to barter for luxury vehicles, yacht time, or premium hospitality services.",
        feedCategory: "Big Ticket",
        subCategory: "Villa",
        mediaUrls: [],
        declaredValue: "12500000",
        offerItems: [{ name: "Palm Jumeirah Villa", value: 12500000 }],
        wantItems: [{ name: "Luxury Fleet (3+ vehicles)", value: 5000000 }, { name: "Yacht", value: 4000000 }],
        hashtags: ["palmjumeirah", "luxuryvilla", "dubaiproperties", "beachfront"],
        location: "Dubai",
        categoryDetails: { propertyType: "Villa", bedrooms: 4, bathrooms: 5, squareMeters: 650, yearBuilt: 2019, area: "Palm Jumeirah", amenities: ["Pool", "Sea View", "Parking", "Garden", "Security", "Furnished"], ownershipStatus: "Freehold", viewType: "Full Sea View", furnished: true, mapsLink: "https://maps.google.com/?q=Palm+Jumeirah" },
        postType: "offer",
        likeCount: 24,
      },
      {
        userId: sampleUsers[2].id,
        title: "Downtown Dubai 2-Bed Apartment in Burj Khalifa District",
        caption: "Modern apartment with stunning Burj Khalifa views. High floor, premium finishes, access to world-class amenities. Ideal for executives. Bartering for tech services, SaaS partnerships, or consulting.",
        feedCategory: "Big Ticket",
        subCategory: "Apartment",
        mediaUrls: [],
        declaredValue: "3200000",
        offerItems: [{ name: "Downtown Apartment", value: 3200000 }],
        wantItems: [{ name: "Enterprise Software Development", value: 1500000 }, { name: "Technology Consulting", value: 800000 }],
        hashtags: ["downtown", "burjkhalifa", "luxuryapartment", "dubailiving"],
        location: "Dubai",
        categoryDetails: { propertyType: "Apartment", bedrooms: 2, bathrooms: 3, squareMeters: 180, yearBuilt: 2021, area: "Downtown Dubai", amenities: ["Pool", "Gym", "Parking", "Security", "Furnished", "Balcony"], ownershipStatus: "Freehold", floorNumber: 42, viewType: "Burj Khalifa View" },
        likeCount: 18,
      },
      {
        userId: sampleUsers[4].id,
        title: "Abu Dhabi Saadiyat Island Penthouse",
        caption: "Exclusive penthouse on Saadiyat Island with private terrace and panoramic sea views. Museum district location, steps from Louvre Abu Dhabi. Trading for events portfolio, hospitality services, or premium real estate.",
        feedCategory: "Big Ticket",
        subCategory: "Apartment",
        mediaUrls: [],
        declaredValue: "8500000",
        offerItems: [{ name: "Saadiyat Penthouse", value: 8500000 }],
        wantItems: [{ name: "Events Management Portfolio", value: 3000000 }, { name: "Hospitality Services", value: 2000000 }],
        hashtags: ["saadiyat", "penthouse", "abudhabi", "louvreabudhabi"],
        location: "Abu Dhabi",
        categoryDetails: { propertyType: "Penthouse", bedrooms: 3, bathrooms: 4, squareMeters: 420, yearBuilt: 2022, area: "Saadiyat Island", amenities: ["Pool", "Sea View", "Gym", "Parking", "Security", "Furnished", "Balcony", "Maid's Room"], ownershipStatus: "Freehold", floorNumber: 18, viewType: "Full Sea View" },
        likeCount: 31,
      },
      {
        userId: sampleUsers[3].id,
        title: "Sharjah Al Mamzar Commercial Office Space",
        caption: "Prime commercial office space in Sharjah's business district. 350 sqm, ready to move in, includes parking. Perfect for growing businesses. Open to barter for fashion retail space, marketing services, or creative services.",
        feedCategory: "Space & Office",
        subCategory: "Office Space",
        mediaUrls: [],
        declaredValue: "1800000",
        offerItems: [{ name: "Commercial Office Space", value: 1800000 }],
        wantItems: [{ name: "Fashion Retail Space", value: 800000 }, { name: "Marketing Services", value: 500000 }],
        hashtags: ["sharjah", "officespace", "commercial", "businessdistrict"],
        location: "Sharjah",
        categoryDetails: { propertyType: "Office Space", bedrooms: 0, bathrooms: 2, squareMeters: 350, yearBuilt: 2018, area: "Al Mamzar", amenities: ["Parking", "Security"], ownershipStatus: "Freehold" },
        postType: "request",
        likeCount: 9,
      },
      // Cars (3)
      {
        userId: sampleUsers[1].id,
        title: "2024 Mercedes-Benz G63 AMG - Obsidian Black",
        caption: "Brand new G63 AMG, fully loaded. Night Package, Burmester sound, designo interior. Under warranty. Looking to barter for hospitality packages, travel credits, or premium event services.",
        feedCategory: "Assets & Vehicles",
        subCategory: "Car",
        mediaUrls: [],
        declaredValue: "950000",
        offerItems: [{ name: "Mercedes G63 AMG 2024", value: 950000 }],
        wantItems: [{ name: "Hotel Suite Nights (50+)", value: 400000 }, { name: "Private Jet Charter Hours", value: 300000 }],
        hashtags: ["g63", "amg", "mercedesbenz", "luxurycars", "dubailuxury"],
        location: "Dubai",
        categoryDetails: { make: "Mercedes-Benz", model: "G63 AMG", year: 2024, mileage: 2500, doors: 5, engineType: "Petrol", engineCapacity: "4.0L V8 Biturbo", transmission: "Automatic", condition: "New", color: "Obsidian Black", features: ["Leather Seats", "Navigation", "Sunroof", "AC", "Sound System", "Bluetooth", "Rear Camera", "Cruise Control"], registrationExpiry: "2026-12-31", insuranceExpiry: "2025-12-31", fuelEfficiency: "8 km/L" },
        postType: "offer",
        likeCount: 42,
      },
      {
        userId: sampleUsers[2].id,
        title: "2023 Porsche 911 GT3 - Guards Red",
        caption: "Track-ready GT3 with PDK, carbon-ceramic brakes, and full PPF. UAE spec, 1 owner. Open to trade for office space, technology partnerships, or high-value consulting contracts.",
        feedCategory: "Assets & Vehicles",
        subCategory: "Car",
        mediaUrls: [],
        declaredValue: "780000",
        offerItems: [{ name: "Porsche 911 GT3", value: 780000 }],
        wantItems: [{ name: "Premium Office Space (2 years)", value: 400000 }, { name: "Enterprise Tech Infrastructure", value: 300000 }],
        hashtags: ["porsche", "911gt3", "sportscar", "trackday"],
        location: "Abu Dhabi",
        categoryDetails: { make: "Porsche", model: "911 GT3", year: 2023, mileage: 8500, doors: 2, engineType: "Petrol", engineCapacity: "4.0L Flat-6", transmission: "Automatic", condition: "Excellent", color: "Guards Red", features: ["Leather Seats", "Navigation", "AC", "Sound System", "Bluetooth", "Rear Camera", "Cruise Control"], registrationExpiry: "2026-06-15", fuelEfficiency: "10 km/L" },
        postType: "offer",
        likeCount: 35,
      },
      {
        userId: sampleUsers[4].id,
        title: "2024 Range Rover Autobiography LWB",
        caption: "Ultimate luxury SUV. Extended wheelbase, executive rear seats, refrigerator, rear entertainment. GCC spec with full service history. Bartering for premium event venue packages or luxury hospitality.",
        feedCategory: "Assets & Vehicles",
        subCategory: "Car",
        mediaUrls: [],
        declaredValue: "820000",
        offerItems: [{ name: "Range Rover Autobiography LWB", value: 820000 }],
        wantItems: [{ name: "Event Venue Access (Annual)", value: 400000 }, { name: "VIP Hospitality Package", value: 300000 }],
        hashtags: ["rangerover", "autobiography", "luxurysuv", "dubailiving"],
        location: "Dubai",
        categoryDetails: { make: "Land Rover", model: "Range Rover Autobiography LWB", year: 2024, mileage: 5200, doors: 5, engineType: "Petrol", engineCapacity: "4.4L V8 Biturbo", transmission: "Automatic", condition: "Excellent", color: "Santorini Black", features: ["Leather Seats", "Navigation", "Sunroof", "AC", "Sound System", "Bluetooth", "Rear Camera", "Cruise Control"] },
        likeCount: 28,
      },
      // Yachts (2)
      {
        userId: sampleUsers[1].id,
        title: "55ft Sunseeker Manhattan - Marina Berth Included",
        caption: "Prestigious 55ft motor yacht with 3 cabins, flybridge, and full crew support available. Dubai Marina berth included. Perfect for corporate entertaining or weekend getaways. Open to barter for property, vehicles, or hospitality.",
        feedCategory: "Assets & Vehicles",
        subCategory: "Yacht/Boat",
        mediaUrls: [],
        declaredValue: "4200000",
        offerItems: [{ name: "Sunseeker Manhattan 55ft", value: 4200000 }],
        wantItems: [{ name: "Palm Jumeirah Property", value: 3000000 }, { name: "Luxury Vehicle Fleet", value: 1500000 }],
        hashtags: ["yacht", "sunseeker", "dubaimarina", "boating", "luxury"],
        location: "Dubai",
        categoryDetails: { make: "Sunseeker", model: "Manhattan 55", year: 2021, mileage: 420, doors: 3, engineType: "Diesel", engineCapacity: "Twin MAN V8", transmission: "Automatic", condition: "Excellent", color: "White/Blue", features: ["Navigation", "AC", "Sound System", "Bluetooth"] },
        likeCount: 38,
      },
      {
        userId: sampleUsers[4].id,
        title: "42ft Azimut Atlantis - Fully Serviced",
        caption: "Italian-built luxury sports cruiser. Recently serviced, new upholstery. 2 cabins, sundeck, tender garage. Abu Dhabi berth available. Looking for event management services, marketing contracts, or premium experiences.",
        feedCategory: "Assets & Vehicles",
        subCategory: "Yacht/Boat",
        mediaUrls: [],
        declaredValue: "2800000",
        offerItems: [{ name: "Azimut Atlantis 42ft", value: 2800000 }],
        wantItems: [{ name: "Annual Event Management", value: 1500000 }, { name: "Marketing Campaign Package", value: 800000 }],
        hashtags: ["azimut", "yachtlife", "abudhabi", "sportscruiser"],
        location: "Abu Dhabi",
        categoryDetails: { make: "Azimut", model: "Atlantis 42", year: 2020, mileage: 650, doors: 2, engineType: "Diesel", engineCapacity: "Twin Volvo D6", transmission: "Automatic", condition: "Good", color: "White", features: ["Navigation", "AC", "Sound System", "Bluetooth"] },
        likeCount: 22,
      },
      // Watch (1)
      {
        userId: sampleUsers[1].id,
        title: "Patek Philippe Nautilus 5711/1A - Blue Dial",
        caption: "Iconic discontinued Nautilus reference. Pristine condition with full set: box, papers, warranty card. One of the most sought-after timepieces globally. Open to barter for property, vehicles, or premium hospitality services.",
        feedCategory: "Big Ticket",
        subCategory: "Watches",
        mediaUrls: [],
        declaredValue: "650000",
        offerItems: [{ name: "Patek Philippe Nautilus 5711/1A", value: 650000 }],
        wantItems: [{ name: "Downtown Apartment", value: 500000 }, { name: "Luxury Vehicle", value: 400000 }],
        hashtags: ["patekphilippe", "nautilus", "luxurywatch", "timepiece"],
        location: "Dubai",
        categoryDetails: { brand: "Patek Philippe", model: "Nautilus 5711/1A", year: 2021, condition: "Excellent", material: "Steel", features: "Blue gradient dial, integrated bracelet, date display", boxAndPapers: true, serialNumber: "PP-5711-UAE" },
        likeCount: 56,
      },
      // Services & Skills posts (5)
      {
        userId: sampleUsers[2].id,
        title: "Enterprise CRM & Workflow Automation Setup",
        caption: "Full enterprise CRM implementation including custom workflows, integrations, training, and 12 months of support. Our platform serves 500+ companies across GCC. Looking for office space, marketing services, or travel perks.",
        feedCategory: "Services & Skills",
        subCategory: "Technology",
        mediaUrls: [],
        declaredValue: "85000",
        offerItems: [{ name: "CRM Implementation", value: 50000 }, { name: "12-Month Support", value: 35000 }],
        wantItems: [{ name: "Office Space (6 months)", value: 45000 }, { name: "Marketing Campaign", value: 30000 }],
        hashtags: ["crm", "saas", "automation", "enterprise"],
        location: "Abu Dhabi",
        likeCount: 14,
      },
      {
        userId: sampleUsers[3].id,
        title: "Luxury Fashion Collection Styling & Design",
        caption: "Complete fashion design and styling service for brands and individuals. Includes 20 custom pieces, lookbook production, and styling consultation. Featured in Vogue Arabia. Trading for photography, events, or retail space.",
        feedCategory: "Services & Skills",
        subCategory: "Fashion Design",
        mediaUrls: [],
        declaredValue: "45000",
        offerItems: [{ name: "Custom Fashion Collection", value: 30000 }, { name: "Styling Consultation", value: 15000 }],
        wantItems: [{ name: "Professional Photography", value: 20000 }, { name: "Retail Pop-up Space", value: 25000 }],
        hashtags: ["fashion", "design", "styling", "voguearabia"],
        location: "Sharjah",
        likeCount: 19,
      },
      {
        userId: sampleUsers[4].id,
        title: "Corporate Event Management for 200+ Guests",
        caption: "End-to-end event management for large corporate gatherings. Includes venue scouting, vendor coordination, theme design, AV setup, and on-site management. 10+ years of experience with ADNOC, du, and Emaar clients.",
        feedCategory: "Services & Skills",
        subCategory: "Event Management",
        mediaUrls: [],
        declaredValue: "65000",
        offerItems: [{ name: "Event Planning & Execution", value: 45000 }, { name: "Vendor Coordination", value: 20000 }],
        wantItems: [{ name: "Catering Services", value: 30000 }, { name: "AV Equipment Rental", value: 15000 }],
        hashtags: ["events", "corporate", "eventmanagement", "dubai"],
        location: "Dubai",
        likeCount: 11,
      },
      // Food & Hospitality (3)
      {
        userId: sampleUsers[1].id,
        title: "50 Luxury Suite Nights - 5-Star Marina Bay Hotel",
        caption: "Premium suite package at our flagship property. Includes breakfast, spa access, airport transfers, and dedicated concierge. Perfect for companies needing client entertainment or employee rewards. Bartering for marketing, tech, or creative services.",
        feedCategory: "Food & Hospitality",
        subCategory: "Hotel Stays",
        mediaUrls: [],
        declaredValue: "175000",
        offerItems: [{ name: "50 Suite Nights", value: 150000 }, { name: "Spa & Dining Credits", value: 25000 }],
        wantItems: [{ name: "Digital Marketing (Annual)", value: 80000 }, { name: "Web/App Development", value: 60000 }],
        hashtags: ["luxury", "hotel", "dubai", "hospitality", "marinabay"],
        location: "Dubai",
        likeCount: 27,
      },
      {
        userId: sampleUsers[1].id,
        title: "Private Dining Experience for Corporate Groups",
        caption: "Exclusive private dining for groups of 20-50 at our signature restaurant. 5-course tasting menu, sommelier service, and private terrace. Ideal for client entertainment. Open to barter for creative and professional services.",
        feedCategory: "Food & Hospitality",
        subCategory: "Dining",
        mediaUrls: [],
        declaredValue: "35000",
        offerItems: [{ name: "Private Dining Experiences (5)", value: 35000 }],
        wantItems: [{ name: "Interior Design Consultation", value: 20000 }, { name: "PR Services", value: 15000 }],
        hashtags: ["dining", "privatechef", "finedining", "corporate"],
        location: "Dubai",
        likeCount: 16,
      },
      {
        userId: sampleUsers[4].id,
        title: "Annual VIP Event Catering Package",
        caption: "Full catering for 10 corporate events throughout the year, serving up to 100 guests each. Includes menu customization, staff, equipment, and setup/teardown. Bartering for venue space, entertainment, or technology services.",
        feedCategory: "Food & Hospitality",
        subCategory: "Catering",
        mediaUrls: [],
        declaredValue: "120000",
        offerItems: [{ name: "Catering (10 Events)", value: 120000 }],
        wantItems: [{ name: "Venue Access (Annual)", value: 60000 }, { name: "Entertainment Services", value: 40000 }],
        hashtags: ["catering", "corporate", "events", "foodservice"],
        location: "Dubai",
        likeCount: 13,
      },
      // Space & Office (2)
      {
        userId: sampleUsers[2].id,
        title: "Co-Working Space with Meeting Rooms - ADGM",
        caption: "Premium co-working membership in ADGM for 15 team members. Includes 4 dedicated meeting rooms, reception services, and 24/7 access. Looking for software development, design, or consulting services in return.",
        feedCategory: "Space & Office",
        subCategory: "Co-Working",
        mediaUrls: [],
        declaredValue: "180000",
        offerItems: [{ name: "Co-Working (Annual)", value: 180000 }],
        wantItems: [{ name: "Mobile App Development", value: 100000 }, { name: "UI/UX Design", value: 50000 }],
        hashtags: ["coworking", "adgm", "abudhabi", "officespace"],
        location: "Abu Dhabi",
        likeCount: 8,
      },
      {
        userId: sampleUsers[3].id,
        title: "Fashion Showroom & Studio Space - Sharjah",
        caption: "400 sqm showroom and design studio in Sharjah Art District. High ceilings, natural light, changing rooms, and storage. Available for pop-up events, photoshoots, or long-term use. Bartering for marketing, photography, or event services.",
        feedCategory: "Space & Office",
        subCategory: "Showroom",
        mediaUrls: [],
        declaredValue: "95000",
        offerItems: [{ name: "Showroom Space (Annual)", value: 95000 }],
        wantItems: [{ name: "Social Media Management", value: 40000 }, { name: "Fashion Photography", value: 30000 }],
        hashtags: ["showroom", "studio", "fashionspace", "sharjah"],
        location: "Sharjah",
        likeCount: 12,
      },
      // Other (2)
      {
        userId: sampleUsers[2].id,
        title: "Custom AI Chatbot Development for Business",
        caption: "End-to-end AI chatbot development using GPT-4 and custom models. Includes training, integration with your CRM, and 6 months of support. Perfect for hospitality, retail, or service businesses needing 24/7 customer support.",
        feedCategory: "Other",
        subCategory: "AI/Technology",
        mediaUrls: [],
        declaredValue: "55000",
        offerItems: [{ name: "AI Chatbot Development", value: 40000 }, { name: "6-Month Support", value: 15000 }],
        wantItems: [{ name: "Office Space (6 months)", value: 30000 }, { name: "Travel Credits", value: 20000 }],
        hashtags: ["ai", "chatbot", "gpt4", "automation"],
        location: "Abu Dhabi",
        likeCount: 21,
      },
      {
        userId: sampleUsers[3].id,
        title: "Luxury Abaya Collection - 50 Pieces Wholesale",
        caption: "Premium designer abaya collection of 50 unique pieces. Handcrafted with Italian silk and Japanese fabrics, intricate embroidery. Retail-ready packaging and branding. Open to trade for marketing services, photography, or retail space.",
        feedCategory: "Other",
        subCategory: "Fashion Products",
        mediaUrls: [],
        declaredValue: "125000",
        offerItems: [{ name: "Abaya Collection (50 pieces)", value: 125000 }],
        wantItems: [{ name: "Marketing Campaign", value: 50000 }, { name: "Photography + Content", value: 40000 }],
        hashtags: ["abaya", "luxuryfashion", "modest", "designer"],
        location: "Sharjah",
        likeCount: 17,
      },
    ])
    .returning();

  console.log(`Created ${samplePosts.length} sample posts`);
  console.log("Database seeding completed!");
}
