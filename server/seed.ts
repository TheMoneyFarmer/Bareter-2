import { db } from "./db";
import { users, listings, deals, ratings, posts } from "@shared/schema";
import bcrypt from "bcryptjs";
import { eq, sql, isNull, and } from "drizzle-orm";

// One-time backfill: ensure existing rows have country/city populated so the
// strict location filters and worldwide-toggle behavior treat them correctly.
// - Default country is "AE" (legacy data was UAE-only).
// - city is derived from the legacy `location` field when present.
// - listings/posts inherit city from location, country from owning user.
export async function backfillLocationFields() {
  try {
    await db.execute(sql`UPDATE users SET country = 'AE' WHERE country IS NULL`);
    await db.execute(sql`UPDATE users SET city = location WHERE city IS NULL AND location IS NOT NULL`);
    await db.execute(sql`UPDATE listings SET city = location WHERE city IS NULL AND location IS NOT NULL`);
    await db.execute(sql`
      UPDATE listings AS l
      SET country = COALESCE(u.country, 'AE')
      FROM users AS u
      WHERE l.user_id = u.id AND l.country IS NULL
    `);
    await db.execute(sql`UPDATE posts SET city = location WHERE city IS NULL AND location IS NOT NULL`);
    await db.execute(sql`
      UPDATE posts AS p
      SET country = COALESCE(u.country, 'AE')
      FROM users AS u
      WHERE p.user_id = u.id AND p.country IS NULL
    `);
  } catch (err) {
    console.error("Location backfill error:", err);
  }
}

export async function seedDatabase() {
  console.log("Checking if seed data exists...");

  const existingUsers = await db.select().from(users).limit(1);
  if (existingUsers.length > 0) {
    console.log("Seed data already exists, skipping...");
    return;
  }

  console.log("Seeding database with sample data...");

  const hashedPassword = await bcrypt.hash("password123", 10);

  const sampleUsers = await db
    .insert(users)
    .values([
      {
        email: "admin@bartergram.ae",
        password: hashedPassword,
        fullName: "Admin User",
        bio: "Platform administrator managing BarterGram marketplace",
        location: "Dubai",
        isAdmin: true,
        isVerified: true,
        businessName: "BarterGram Platform",
        whatIOffer: [{ name: "Platform Management", value: 0 }, { name: "Support Services", value: 0 }],
        whatINeed: [{ name: "Quality Partners", value: 0 }, { name: "Business Growth", value: 0 }],
        profileCompleted: true,
      },
      {
        email: "sarah@luxuryhotels.ae",
        password: hashedPassword,
        fullName: "Sarah Al Maktoum",
        avatarUrl: "/images/seed/avatar-sarah.jpg",
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
        email: "omar@techflow.ae",
        password: hashedPassword,
        fullName: "Omar Hassan",
        avatarUrl: "/images/seed/avatar-omar.jpg",
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
        email: "fatima@maisonfatima.ae",
        password: hashedPassword,
        fullName: "Fatima Al Rashid",
        avatarUrl: "/images/seed/avatar-fatima.jpg",
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
        avatarUrl: "/images/seed/avatar-ahmed.jpg",
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
      {
        email: "layla@gulfproperties.ae",
        password: hashedPassword,
        fullName: "Layla Bin Zayed",
        avatarUrl: "/images/seed/avatar-layla.jpg",
        bio: "Senior Partner at Gulf Premier Properties, specializing in luxury real estate across Dubai and Abu Dhabi. Over 12 years of experience in high-value property transactions. Certified by RERA and a member of the Dubai Land Department's Elite Broker Circle. I facilitate property barters for business owners looking to diversify their portfolios.",
        location: "Dubai",
        isVerified: true,
        businessName: "Gulf Premier Properties",
        whatIOffer: [{ name: "Luxury Properties", value: 5000000 }, { name: "Real Estate Consulting", value: 25000 }],
        whatINeed: [{ name: "Luxury Vehicles", value: 1000000 }, { name: "Yacht Charters", value: 500000 }, { name: "Hospitality Packages", value: 200000 }],
        phone: "+971 50 333 4444",
        website: "https://gulfpremierproperties.ae",
        socialLinks: { instagram: "https://instagram.com/gulfpremierproperties", linkedin: "https://linkedin.com/in/laylabinzayed" },
        accountType: "business",
        profileCompleted: true,
      },
      {
        email: "khalid@saffronkitchen.ae",
        password: hashedPassword,
        fullName: "Khalid Al Mansouri",
        avatarUrl: "/images/seed/avatar-khalid.jpg",
        bio: "Executive Chef and owner of Saffron Kitchen, an award-winning Emirati-fusion restaurant in DIFC. Trained at Le Cordon Bleu Paris, worked at Nobu Dubai and Zuma. Our catering division serves corporate clients across the UAE. Passionate about connecting food with business through creative barter partnerships.",
        location: "Dubai",
        isVerified: true,
        businessName: "Saffron Kitchen DIFC",
        whatIOffer: [{ name: "Private Dining Packages", value: 25000 }, { name: "Corporate Catering", value: 50000 }, { name: "F&B Consulting", value: 15000 }],
        whatINeed: [{ name: "Interior Design", value: 30000 }, { name: "PR & Marketing", value: 20000 }, { name: "Photography", value: 10000 }],
        phone: "+971 4 222 3344",
        website: "https://saffronkitchen.ae",
        socialLinks: { instagram: "https://instagram.com/saffronkitchenuae" },
        accountType: "business",
        profileCompleted: true,
      },
      {
        email: "noura@shuttercraft.ae",
        password: hashedPassword,
        fullName: "Noura Al Falasi",
        avatarUrl: "/images/seed/avatar-noura.jpg",
        bio: "Award-winning photographer and creative director at ShutterCraft Studios. Specializing in luxury brand photography, architectural shoots, and high-end fashion editorials. Clients include Cartier Middle East, Emaar, and Dubai Tourism. Our studio offers full production services from concept to final delivery.",
        location: "Dubai",
        isVerified: true,
        businessName: "ShutterCraft Studios",
        whatIOffer: [{ name: "Professional Photography", value: 15000 }, { name: "Video Production", value: 25000 }, { name: "Creative Direction", value: 10000 }],
        whatINeed: [{ name: "Studio Space", value: 20000 }, { name: "Travel & Accommodation", value: 15000 }, { name: "Fashion Items", value: 10000 }],
        phone: "+971 55 111 2233",
        website: "https://shuttercraft.ae",
        socialLinks: { instagram: "https://instagram.com/shuttercraftuae", linkedin: "https://linkedin.com/in/nouraalfalasi" },
        accountType: "business",
        profileCompleted: true,
      },
      {
        email: "rashid@elitemotors.ae",
        password: hashedPassword,
        fullName: "Rashid Al Thani",
        avatarUrl: "/images/seed/avatar-rashid.jpg",
        bio: "Founder and CEO of Elite Motors Gallery, one of the GCC's premier luxury and exotic car dealerships. With showrooms in Dubai and Abu Dhabi, we deal in Rolls-Royce, Bentley, Ferrari, Lamborghini, and limited-edition supercars. Actively seeking barter opportunities involving real estate, yachts, and high-value services.",
        location: "Dubai",
        isVerified: true,
        businessName: "Elite Motors Gallery",
        whatIOffer: [{ name: "Luxury Vehicles", value: 2000000 }, { name: "Vehicle Leasing", value: 100000 }],
        whatINeed: [{ name: "Real Estate", value: 3000000 }, { name: "Yacht Charters", value: 500000 }, { name: "VIP Experiences", value: 200000 }],
        phone: "+971 4 999 8877",
        website: "https://elitemotorsgallery.ae",
        socialLinks: { instagram: "https://instagram.com/elitemotorsgallery", linkedin: "https://linkedin.com/company/elite-motors-gallery" },
        accountType: "business",
        profileCompleted: true,
      },
      {
        email: "mariam@designhaus.ae",
        password: hashedPassword,
        fullName: "Mariam Al Suwaidi",
        avatarUrl: "/images/seed/avatar-mariam.jpg",
        bio: "Principal architect and interior designer at DesignHaus Studio. We create luxury residential and commercial spaces across the UAE. Our portfolio includes private villas on the Palm, boutique hotels, and flagship retail stores. Open to bartering our design services for tech solutions, hospitality, and premium products.",
        location: "Abu Dhabi",
        isVerified: false,
        businessName: "DesignHaus Studio",
        whatIOffer: [{ name: "Interior Design", value: 40000 }, { name: "Architecture Services", value: 60000 }, { name: "3D Visualization", value: 15000 }],
        whatINeed: [{ name: "SaaS Tools", value: 20000 }, { name: "Hotel Stays", value: 15000 }, { name: "Office Equipment", value: 10000 }],
        phone: "+971 2 444 5566",
        website: "https://designhausstudio.ae",
        socialLinks: { instagram: "https://instagram.com/designhausuae", linkedin: "https://linkedin.com/company/designhaus-studio" },
        accountType: "business",
        profileCompleted: true,
      },
      {
        email: "hassan@gulfyachts.ae",
        password: hashedPassword,
        fullName: "Hassan Al Nahyan",
        avatarUrl: "/images/seed/avatar-hassan.jpg",
        bio: "Managing Director of Gulf Yachts & Marine, the premier yacht brokerage in the UAE. We handle sales, charters, and management of luxury vessels from 40ft to 200ft+. Licensed by Dubai Maritime City Authority. Actively bartering yacht experiences for premium real estate, luxury vehicles, and exclusive hospitality packages.",
        location: "Dubai",
        isVerified: true,
        businessName: "Gulf Yachts & Marine",
        whatIOffer: [{ name: "Yacht Sales", value: 5000000 }, { name: "Yacht Charters", value: 50000 }, { name: "Marine Services", value: 30000 }],
        whatINeed: [{ name: "Waterfront Properties", value: 3000000 }, { name: "Luxury Vehicles", value: 1000000 }, { name: "Event Services", value: 200000 }],
        phone: "+971 4 666 7788",
        website: "https://gulfyachtsmarine.ae",
        socialLinks: { instagram: "https://instagram.com/gulfyachtsmarine", linkedin: "https://linkedin.com/company/gulf-yachts-marine" },
        accountType: "business",
        profileCompleted: true,
      },
    ])
    .returning();

  console.log(`Created ${sampleUsers.length} sample users`);

  const [admin, sarah, omar, fatima, ahmed, layla, khalid, noura, rashid, mariam, hassan] = sampleUsers;

  const sampleListings = await db
    .insert(listings)
    .values([
      {
        userId: sarah.id,
        type: "offer",
        title: "5 Nights Luxury Suite at Marina Bay Hotel",
        description:
          "Premium luxury suite accommodation in our 5-star Marina Bay Hotel. Includes breakfast, spa access, and airport transfers. Perfect for hosting VIP clients or a luxurious getaway. Suite features panoramic views, king bed, and separate living area.",
        categories: ["Hospitality", "Events"],
        retailValue: "15000.00",
        location: "Dubai",
        tags: ["luxury", "hotel", "accommodation", "spa", "marina"],
        images: ["/images/seed/listing-hotel.jpg"],
        isActive: true,
        viewCount: 45,
      },
      {
        userId: sarah.id,
        type: "offer",
        title: "Corporate Event Space for 100 Guests",
        description:
          "Beautiful ballroom venue for corporate events, conferences, or celebrations. Includes basic AV equipment, catering coordination, and event support staff. Available for full-day bookings.",
        categories: ["Events", "Hospitality"],
        retailValue: "25000.00",
        location: "Dubai",
        tags: ["event", "corporate", "venue", "ballroom"],
        images: ["/images/seed/listing-event-venue.jpg"],
        isActive: true,
        viewCount: 32,
      },
      {
        userId: omar.id,
        type: "offer",
        title: "1-Year Enterprise SaaS License",
        description:
          "Full enterprise license for our project management and CRM platform. Includes unlimited users, premium support, and custom integrations. Regular retail price applies for the complete package.",
        categories: ["SaaS", "Technology"],
        retailValue: "12000.00",
        location: "Abu Dhabi",
        tags: ["software", "saas", "enterprise", "crm", "project management"],
        images: ["/images/seed/listing-saas.jpg"],
        isActive: true,
        viewCount: 28,
      },
      {
        userId: mariam.id,
        type: "request",
        title: "Looking for Premium Office Space",
        description:
          "Seeking furnished office space for our growing design team of 20. Need modern facilities, meeting rooms, and good connectivity. Flexible on location within UAE. Can offer interior design services in exchange.",
        categories: ["Services", "Real Estate"],
        retailValue: "50000.00",
        location: "Abu Dhabi",
        tags: ["office", "workspace", "commercial", "rent"],
        images: ["/images/seed/office-commercial.jpg"],
        isActive: true,
        viewCount: 19,
      },
      {
        userId: fatima.id,
        type: "offer",
        title: "Custom Designer Abaya Collection (10 pieces)",
        description:
          "Handcrafted designer abayas featuring premium fabrics and intricate embroidery. Collection of 10 unique pieces in various sizes. Perfect for boutique retailers or special occasions.",
        categories: ["Fashion"],
        retailValue: "18000.00",
        location: "Sharjah",
        tags: ["fashion", "abaya", "designer", "luxury", "custom"],
        images: ["/images/seed/abaya-collection.jpg"],
        isActive: true,
        viewCount: 52,
      },
      {
        userId: noura.id,
        type: "offer",
        title: "Professional Fashion Photography Package",
        description:
          "Full fashion photography package including studio and outdoor shots, professional editing, and delivery within 2 weeks. Experienced with luxury brands and editorials.",
        categories: ["Services", "Fashion"],
        retailValue: "8000.00",
        location: "Dubai",
        tags: ["photography", "fashion", "studio", "creative"],
        images: ["/images/seed/listing-photography.jpg"],
        isActive: true,
        viewCount: 15,
      },
      {
        userId: ahmed.id,
        type: "offer",
        title: "Full Corporate Event Management Package",
        description:
          "Complete event planning and management for corporate events up to 200 guests. Includes venue selection, vendor coordination, on-site management, and post-event reporting. 3 events package.",
        categories: ["Events", "Services"],
        retailValue: "35000.00",
        location: "Dubai",
        tags: ["events", "corporate", "planning", "management"],
        images: ["/images/seed/service-events.jpg"],
        isActive: true,
        viewCount: 38,
      },
      {
        userId: khalid.id,
        type: "request",
        title: "Catering Partner for Upcoming Events",
        description:
          "Need reliable catering partner for 5 upcoming corporate events. Total of approximately 500 guests across all events. Looking for diverse menu options and professional service.",
        categories: ["Food", "Services"],
        retailValue: "45000.00",
        location: "Dubai",
        tags: ["catering", "food", "corporate", "events"],
        images: ["/images/seed/catering-event.jpg"],
        isActive: true,
        viewCount: 24,
      },
    ])
    .returning();

  console.log(`Created ${sampleListings.length} sample listings`);

  const sampleDeals = await db
    .insert(deals)
    .values([
      {
        dealNumber: "RCP-DEMO001",
        seekerId: omar.id,
        providerId: sarah.id,
        seekerOffer: "6-Month Enterprise SaaS License with Custom Integration",
        seekerValue: "8000.00",
        providerOffer: "3 Nights Luxury Suite at Marina Bay Hotel",
        providerValue: "9000.00",
        state: "completed",
        timeline: "Delivery within 30 days",
        deliverables: [{ label: "Software access credentials", checked: true }, { label: "Hotel vouchers delivered", checked: true }],
        seekerCompleted: true,
        providerCompleted: true,
      },
    ])
    .returning();

  console.log(`Created ${sampleDeals.length} sample deals`);

  await db.insert(ratings).values([
    {
      dealId: sampleDeals[0].id,
      fromUserId: omar.id,
      toUserId: sarah.id,
      score: 5,
      review:
        "Excellent partner to work with! The hotel experience was amazing and everything was delivered as promised. Highly recommend bartering with Sarah.",
    },
    {
      dealId: sampleDeals[0].id,
      fromUserId: sarah.id,
      toUserId: omar.id,
      score: 5,
      review:
        "Omar's software platform has transformed how we manage our hotel bookings. Professional service and great communication throughout.",
    },
  ]);

  console.log("Created sample ratings");

  const samplePosts = await db
    .insert(posts)
    .values([
      {
        userId: layla.id,
        title: "Palm Jumeirah 4-Bed Villa with Private Beach",
        caption: "Stunning beachfront villa on the Palm. Fully furnished, private pool, direct beach access. Open to barter for luxury vehicles, yacht time, or premium hospitality services.",
        feedCategory: "Big Ticket",
        subCategory: "Villa",
        mediaUrls: ["/images/seed/villa-palm.jpg"],
        declaredValue: "12500000",
        offerItems: [{ name: "Palm Jumeirah Villa", value: 12500000 }],
        wantItems: [{ name: "Luxury Fleet (3+ vehicles)", value: 5000000 }, { name: "Yacht", value: 4000000 }, { name: "Commercial Property Portfolio", value: 3500000 }, { name: "Hotel Investment Shares", value: 2000000 }, { name: "Fine Art Collection", value: 1500000 }],
        hashtags: ["palmjumeirah", "luxuryvilla", "dubaiproperties", "beachfront"],
        location: "Dubai",
        categoryDetails: { propertyType: "Villa", bedrooms: 4, bathrooms: 5, squareMeters: 650, yearBuilt: 2019, area: "Palm Jumeirah", amenities: ["Pool", "Sea View", "Parking", "Garden", "Security", "Furnished"], ownershipStatus: "Freehold", viewType: "Full Sea View", furnished: true, mapsLink: "https://maps.google.com/?q=Palm+Jumeirah" },
        postType: "offer",
        likeCount: 24,
      },
      {
        userId: mariam.id,
        title: "Downtown Dubai 2-Bed Apartment in Burj Khalifa District",
        caption: "Modern apartment with stunning Burj Khalifa views. High floor, premium finishes, access to world-class amenities. Ideal for executives. Bartering for tech services, SaaS partnerships, or consulting.",
        feedCategory: "Big Ticket",
        subCategory: "Apartment",
        mediaUrls: ["/images/seed/apartment-downtown.jpg"],
        declaredValue: "3200000",
        offerItems: [{ name: "Downtown Apartment", value: 3200000 }],
        wantItems: [{ name: "Enterprise Software Development", value: 1500000 }, { name: "Technology Consulting", value: 800000 }, { name: "Luxury Vehicle", value: 600000 }, { name: "Office Space (3 years)", value: 450000 }, { name: "Interior Design Services", value: 350000 }],
        hashtags: ["downtown", "burjkhalifa", "luxuryapartment", "dubailiving"],
        location: "Dubai",
        categoryDetails: { propertyType: "Apartment", bedrooms: 2, bathrooms: 3, squareMeters: 180, yearBuilt: 2021, area: "Downtown Dubai", amenities: ["Pool", "Gym", "Parking", "Security", "Furnished", "Balcony"], ownershipStatus: "Freehold", floorNumber: 42, viewType: "Burj Khalifa View" },
        likeCount: 18,
      },
      {
        userId: layla.id,
        title: "Abu Dhabi Saadiyat Island Penthouse",
        caption: "Exclusive penthouse on Saadiyat Island with private terrace and panoramic sea views. Museum district location, steps from Louvre Abu Dhabi. Trading for events portfolio, hospitality services, or premium real estate.",
        feedCategory: "Big Ticket",
        subCategory: "Apartment",
        mediaUrls: ["/images/seed/penthouse-saadiyat.jpg"],
        declaredValue: "8500000",
        offerItems: [{ name: "Saadiyat Penthouse", value: 8500000 }],
        wantItems: [{ name: "Events Management Portfolio", value: 3000000 }, { name: "Hospitality Services", value: 2000000 }, { name: "Luxury Vehicle Collection", value: 2500000 }, { name: "Waterfront Commercial Space", value: 1800000 }, { name: "Yacht Charter Package", value: 1200000 }],
        hashtags: ["saadiyat", "penthouse", "abudhabi", "louvreabudhabi"],
        location: "Abu Dhabi",
        categoryDetails: { propertyType: "Penthouse", bedrooms: 3, bathrooms: 4, squareMeters: 420, yearBuilt: 2022, area: "Saadiyat Island", amenities: ["Pool", "Sea View", "Gym", "Parking", "Security", "Furnished", "Balcony", "Maid's Room"], ownershipStatus: "Freehold", floorNumber: 18, viewType: "Full Sea View" },
        likeCount: 31,
      },
      {
        userId: fatima.id,
        title: "Sharjah Al Mamzar Commercial Office Space",
        caption: "Prime commercial office space in Sharjah's business district. 350 sqm, ready to move in, includes parking. Perfect for growing businesses. Open to barter for fashion retail space, marketing services, or creative services.",
        feedCategory: "Space & Office",
        subCategory: "Office Space",
        mediaUrls: ["/images/seed/office-commercial.jpg"],
        declaredValue: "1800000",
        offerItems: [{ name: "Commercial Office Space", value: 1800000 }],
        wantItems: [{ name: "Fashion Retail Space", value: 800000 }, { name: "Marketing Services", value: 500000 }, { name: "Warehouse & Logistics Setup", value: 350000 }, { name: "E-Commerce Platform Development", value: 200000 }, { name: "Vehicle Fleet (2 vehicles)", value: 400000 }],
        hashtags: ["sharjah", "officespace", "commercial", "businessdistrict"],
        location: "Sharjah",
        categoryDetails: { propertyType: "Office Space", bedrooms: 0, bathrooms: 2, squareMeters: 350, yearBuilt: 2018, area: "Al Mamzar", amenities: ["Parking", "Security"], ownershipStatus: "Freehold" },
        postType: "request",
        likeCount: 9,
      },
      {
        userId: rashid.id,
        title: "2024 Mercedes-Benz G63 AMG - Obsidian Black",
        caption: "Brand new G63 AMG, fully loaded. Night Package, Burmester sound, designo interior. Under warranty. Looking to barter for hospitality packages, travel credits, or premium event services.",
        feedCategory: "Assets & Vehicles",
        subCategory: "Car",
        mediaUrls: ["/images/seed/car-mercedes-g63.jpg"],
        declaredValue: "950000",
        offerItems: [{ name: "Mercedes G63 AMG 2024", value: 950000 }],
        wantItems: [{ name: "Hotel Suite Nights (50+)", value: 400000 }, { name: "Private Jet Charter Hours", value: 300000 }, { name: "Luxury Watch Collection", value: 250000 }, { name: "Yacht Charter Season Pass", value: 200000 }, { name: "Fine Dining & Catering Credits", value: 150000 }],
        hashtags: ["g63", "amg", "mercedesbenz", "luxurycars", "dubailuxury"],
        location: "Dubai",
        categoryDetails: { make: "Mercedes-Benz", model: "G63 AMG", year: 2024, mileage: 2500, doors: 5, engineType: "Petrol", engineCapacity: "4.0L V8 Biturbo", transmission: "Automatic", condition: "New", color: "Obsidian Black", features: ["Leather Seats", "Navigation", "Sunroof", "AC", "Sound System", "Bluetooth", "Rear Camera", "Cruise Control"], registrationExpiry: "2026-12-31", insuranceExpiry: "2025-12-31", fuelEfficiency: "8 km/L" },
        postType: "offer",
        likeCount: 42,
      },
      {
        userId: rashid.id,
        title: "2023 Porsche 911 GT3 - Guards Red",
        caption: "Track-ready GT3 with PDK, carbon-ceramic brakes, and full PPF. UAE spec, 1 owner. Open to trade for office space, technology partnerships, or high-value consulting contracts.",
        feedCategory: "Assets & Vehicles",
        subCategory: "Car",
        mediaUrls: ["/images/seed/car-porsche-911.jpg"],
        declaredValue: "780000",
        offerItems: [{ name: "Porsche 911 GT3", value: 780000 }],
        wantItems: [{ name: "Premium Office Space (2 years)", value: 400000 }, { name: "Enterprise Tech Infrastructure", value: 300000 }, { name: "Luxury Apartment", value: 500000 }, { name: "Annual Marketing Retainer", value: 150000 }, { name: "VIP Hospitality Package", value: 120000 }],
        hashtags: ["porsche", "911gt3", "sportscar", "trackday"],
        location: "Abu Dhabi",
        categoryDetails: { make: "Porsche", model: "911 GT3", year: 2023, mileage: 8500, doors: 2, engineType: "Petrol", engineCapacity: "4.0L Flat-6", transmission: "Automatic", condition: "Excellent", color: "Guards Red", features: ["Leather Seats", "Navigation", "AC", "Sound System", "Bluetooth", "Rear Camera", "Cruise Control"], registrationExpiry: "2026-06-15", fuelEfficiency: "10 km/L" },
        postType: "offer",
        likeCount: 35,
      },
      {
        userId: ahmed.id,
        title: "2024 Range Rover Autobiography LWB",
        caption: "Ultimate luxury SUV. Extended wheelbase, executive rear seats, refrigerator, rear entertainment. GCC spec with full service history. Bartering for premium event venue packages or luxury hospitality.",
        feedCategory: "Assets & Vehicles",
        subCategory: "Car",
        mediaUrls: ["/images/seed/car-range-rover.jpg"],
        declaredValue: "820000",
        offerItems: [{ name: "Range Rover Autobiography LWB", value: 820000 }],
        wantItems: [{ name: "Event Venue Access (Annual)", value: 400000 }, { name: "VIP Hospitality Package", value: 300000 }, { name: "Luxury Watch", value: 200000 }, { name: "Corporate Catering Contract", value: 150000 }, { name: "Interior Design Services", value: 120000 }],
        hashtags: ["rangerover", "autobiography", "luxurysuv", "dubailiving"],
        location: "Dubai",
        categoryDetails: { make: "Land Rover", model: "Range Rover Autobiography LWB", year: 2024, mileage: 5200, doors: 5, engineType: "Petrol", engineCapacity: "4.4L V8 Biturbo", transmission: "Automatic", condition: "Excellent", color: "Santorini Black", features: ["Leather Seats", "Navigation", "Sunroof", "AC", "Sound System", "Bluetooth", "Rear Camera", "Cruise Control"] },
        likeCount: 28,
      },
      {
        userId: hassan.id,
        title: "55ft Sunseeker Manhattan - Marina Berth Included",
        caption: "Prestigious 55ft motor yacht with 3 cabins, flybridge, and full crew support available. Dubai Marina berth included. Perfect for corporate entertaining or weekend getaways. Open to barter for property, vehicles, or hospitality.",
        feedCategory: "Assets & Vehicles",
        subCategory: "Yacht/Boat",
        mediaUrls: ["/images/seed/yacht-sunseeker.jpg"],
        declaredValue: "4200000",
        offerItems: [{ name: "Sunseeker Manhattan 55ft", value: 4200000 }],
        wantItems: [{ name: "Palm Jumeirah Property", value: 3000000 }, { name: "Luxury Vehicle Fleet", value: 1500000 }, { name: "Commercial Office Building", value: 2000000 }, { name: "Fine Art & Collectibles", value: 800000 }, { name: "Hospitality Investment Shares", value: 1000000 }],
        hashtags: ["yacht", "sunseeker", "dubaimarina", "boating", "luxury"],
        location: "Dubai",
        categoryDetails: { make: "Sunseeker", model: "Manhattan 55", year: 2021, mileage: 420, doors: 3, engineType: "Diesel", engineCapacity: "Twin MAN V8", transmission: "Automatic", condition: "Excellent", color: "White/Blue", features: ["Navigation", "AC", "Sound System", "Bluetooth"] },
        likeCount: 38,
      },
      {
        userId: hassan.id,
        title: "42ft Azimut Atlantis - Fully Serviced",
        caption: "Italian-built luxury sports cruiser. Recently serviced, new upholstery. 2 cabins, sundeck, tender garage. Abu Dhabi berth available. Looking for event management services, marketing contracts, or premium experiences.",
        feedCategory: "Assets & Vehicles",
        subCategory: "Yacht/Boat",
        mediaUrls: ["/images/seed/yacht-azimut.jpg"],
        declaredValue: "2800000",
        offerItems: [{ name: "Azimut Atlantis 42ft", value: 2800000 }],
        wantItems: [{ name: "Annual Event Management", value: 1500000 }, { name: "Marketing Campaign Package", value: 800000 }, { name: "Luxury Vehicles (2+)", value: 1200000 }, { name: "Downtown Apartment", value: 900000 }, { name: "Private Dining & Catering Credits", value: 500000 }],
        hashtags: ["azimut", "yachtlife", "abudhabi", "sportscruiser"],
        location: "Abu Dhabi",
        categoryDetails: { make: "Azimut", model: "Atlantis 42", year: 2020, mileage: 650, doors: 2, engineType: "Diesel", engineCapacity: "Twin Volvo D6", transmission: "Automatic", condition: "Good", color: "White", features: ["Navigation", "AC", "Sound System", "Bluetooth"] },
        likeCount: 22,
      },
      {
        userId: sarah.id,
        title: "Patek Philippe Nautilus 5711/1A - Blue Dial",
        caption: "Iconic discontinued Nautilus reference. Pristine condition with full set: box, papers, warranty card. One of the most sought-after timepieces globally. Open to barter for property, vehicles, or premium hospitality services.",
        feedCategory: "Big Ticket",
        subCategory: "Watches",
        mediaUrls: ["/images/seed/watch-patek.jpg"],
        declaredValue: "650000",
        offerItems: [{ name: "Patek Philippe Nautilus 5711/1A", value: 650000 }],
        wantItems: [{ name: "Downtown Apartment", value: 500000 }, { name: "Luxury Vehicle", value: 400000 }, { name: "Yacht Charter Package", value: 250000 }, { name: "Hotel Suite Nights (30+)", value: 200000 }, { name: "Fine Art Pieces", value: 150000 }],
        hashtags: ["patekphilippe", "nautilus", "luxurywatch", "timepiece"],
        location: "Dubai",
        categoryDetails: { brand: "Patek Philippe", model: "Nautilus 5711/1A", year: 2021, condition: "Excellent", material: "Steel", features: "Blue gradient dial, integrated bracelet, date display", boxAndPapers: true, serialNumber: "PP-5711-UAE" },
        likeCount: 56,
      },
      {
        userId: omar.id,
        title: "Enterprise CRM & Workflow Automation Setup",
        caption: "Full enterprise CRM implementation including custom workflows, integrations, training, and 12 months of support. Our platform serves 500+ companies across GCC. Looking for office space, marketing services, or travel perks.",
        feedCategory: "Services & Skills",
        subCategory: "Technology",
        mediaUrls: ["/images/seed/service-tech.jpg"],
        declaredValue: "85000",
        offerItems: [{ name: "CRM Implementation", value: 50000 }, { name: "12-Month Support", value: 35000 }],
        wantItems: [{ name: "Office Space (6 months)", value: 45000 }, { name: "Marketing Campaign", value: 30000 }, { name: "Hotel Stays & Travel Credits", value: 25000 }, { name: "Professional Photography", value: 15000 }, { name: "Event Sponsorship", value: 20000 }],
        hashtags: ["crm", "saas", "automation", "enterprise"],
        location: "Abu Dhabi",
        likeCount: 14,
      },
      {
        userId: fatima.id,
        title: "Luxury Fashion Collection Styling & Design",
        caption: "Complete fashion design and styling service for brands and individuals. Includes 20 custom pieces, lookbook production, and styling consultation. Featured in Vogue Arabia. Trading for photography, events, or retail space.",
        feedCategory: "Services & Skills",
        subCategory: "Fashion Design",
        mediaUrls: ["/images/seed/service-fashion.jpg"],
        declaredValue: "45000",
        offerItems: [{ name: "Custom Fashion Collection", value: 30000 }, { name: "Styling Consultation", value: 15000 }],
        wantItems: [{ name: "Professional Photography", value: 20000 }, { name: "Retail Pop-up Space", value: 25000 }, { name: "Social Media Marketing", value: 15000 }, { name: "Event Management Services", value: 12000 }, { name: "Video Production", value: 10000 }],
        hashtags: ["fashion", "design", "styling", "voguearabia"],
        location: "Sharjah",
        likeCount: 19,
      },
      {
        userId: ahmed.id,
        title: "Corporate Event Management for 200+ Guests",
        caption: "End-to-end event management for large corporate gatherings. Includes venue scouting, vendor coordination, theme design, AV setup, and on-site management. 10+ years of experience with ADNOC, du, and Emaar clients.",
        feedCategory: "Services & Skills",
        subCategory: "Event Management",
        mediaUrls: ["/images/seed/service-events.jpg"],
        declaredValue: "65000",
        offerItems: [{ name: "Event Planning & Execution", value: 45000 }, { name: "Vendor Coordination", value: 20000 }],
        wantItems: [{ name: "Catering Services", value: 30000 }, { name: "AV Equipment Rental", value: 15000 }, { name: "Graphic Design & Branding", value: 12000 }, { name: "Hotel Room Nights", value: 18000 }, { name: "Photography & Videography", value: 10000 }],
        hashtags: ["events", "corporate", "eventmanagement", "dubai"],
        location: "Dubai",
        likeCount: 11,
      },
      {
        userId: noura.id,
        title: "Professional Brand Photography & Content",
        caption: "Complete brand photography package: product shoots, lifestyle imagery, social media content, and team portraits. Our studio has worked with Cartier ME, Emaar, and Dubai Tourism. Bartering for travel, fashion, or tech services.",
        feedCategory: "Services & Skills",
        subCategory: "Photography",
        mediaUrls: ["/images/seed/listing-photography.jpg"],
        declaredValue: "35000",
        offerItems: [{ name: "Brand Photography Package", value: 25000 }, { name: "Social Media Content", value: 10000 }],
        wantItems: [{ name: "Travel & Accommodation", value: 15000 }, { name: "Fashion Items for Shoots", value: 10000 }, { name: "Studio Equipment Upgrade", value: 12000 }, { name: "SaaS & Editing Tools", value: 8000 }, { name: "Co-Working Space Access", value: 7000 }],
        hashtags: ["photography", "branding", "content", "luxury"],
        location: "Dubai",
        likeCount: 23,
      },
      {
        userId: mariam.id,
        title: "Complete Interior Design for Luxury Residence",
        caption: "Full interior design service for villas and penthouses. Includes concept development, 3D visualization, material sourcing, and project management. Our portfolio spans Palm villas to DIFC penthouses. Bartering for tech, hospitality, or automotive.",
        feedCategory: "Services & Skills",
        subCategory: "Design",
        mediaUrls: ["/images/seed/showroom-fashion.jpg"],
        declaredValue: "95000",
        offerItems: [{ name: "Interior Design Package", value: 70000 }, { name: "3D Visualization", value: 25000 }],
        wantItems: [{ name: "SaaS License (Annual)", value: 40000 }, { name: "Luxury Vehicle Lease", value: 50000 }, { name: "Hotel & Hospitality Credits", value: 30000 }, { name: "Corporate Catering Package", value: 20000 }, { name: "Professional Photography", value: 15000 }],
        hashtags: ["interiordesign", "luxury", "villa", "architecture"],
        location: "Abu Dhabi",
        likeCount: 16,
      },
      {
        userId: sarah.id,
        title: "50 Luxury Suite Nights - 5-Star Marina Bay Hotel",
        caption: "Premium suite package at our flagship property. Includes breakfast, spa access, airport transfers, and dedicated concierge. Perfect for companies needing client entertainment or employee rewards. Bartering for marketing, tech, or creative services.",
        feedCategory: "Food & Hospitality",
        subCategory: "Hotel Stays",
        mediaUrls: ["/images/seed/hotel-suite.jpg"],
        declaredValue: "175000",
        offerItems: [{ name: "50 Suite Nights", value: 150000 }, { name: "Spa & Dining Credits", value: 25000 }],
        wantItems: [{ name: "Digital Marketing (Annual)", value: 80000 }, { name: "Web/App Development", value: 60000 }, { name: "Interior Design Services", value: 45000 }, { name: "Fashion Collection", value: 30000 }, { name: "Event Management Package", value: 35000 }],
        hashtags: ["luxury", "hotel", "dubai", "hospitality", "marinabay"],
        location: "Dubai",
        likeCount: 27,
      },
      {
        userId: khalid.id,
        title: "Private Dining Experience for Corporate Groups",
        caption: "Exclusive private dining for groups of 20-50 at Saffron Kitchen DIFC. 5-course Emirati-fusion tasting menu, sommelier service, and private terrace. Ideal for client entertainment. Open to barter for creative and professional services.",
        feedCategory: "Food & Hospitality",
        subCategory: "Dining",
        mediaUrls: ["/images/seed/dining-private.jpg"],
        declaredValue: "35000",
        offerItems: [{ name: "Private Dining Experiences (5)", value: 35000 }],
        wantItems: [{ name: "Interior Design Consultation", value: 20000 }, { name: "PR Services", value: 15000 }, { name: "Professional Photography", value: 10000 }, { name: "Social Media Management", value: 8000 }, { name: "Graphic Design & Branding", value: 7000 }],
        hashtags: ["dining", "privatechef", "finedining", "corporate"],
        location: "Dubai",
        likeCount: 16,
      },
      {
        userId: khalid.id,
        title: "Annual VIP Event Catering Package",
        caption: "Full catering for 10 corporate events throughout the year, serving up to 100 guests each. Includes menu customization, staff, equipment, and setup/teardown. Bartering for venue space, entertainment, or technology services.",
        feedCategory: "Food & Hospitality",
        subCategory: "Catering",
        mediaUrls: ["/images/seed/catering-event.jpg"],
        declaredValue: "120000",
        offerItems: [{ name: "Catering (10 Events)", value: 120000 }],
        wantItems: [{ name: "Venue Access (Annual)", value: 60000 }, { name: "Entertainment Services", value: 40000 }, { name: "Marketing & PR Campaign", value: 30000 }, { name: "Technology Solutions", value: 25000 }, { name: "Photography & Video Package", value: 20000 }],
        hashtags: ["catering", "corporate", "events", "foodservice"],
        location: "Dubai",
        likeCount: 13,
      },
      {
        userId: omar.id,
        title: "Co-Working Space with Meeting Rooms - ADGM",
        caption: "Premium co-working membership in ADGM for 15 team members. Includes 4 dedicated meeting rooms, reception services, and 24/7 access. Looking for software development, design, or consulting services in return.",
        feedCategory: "Space & Office",
        subCategory: "Co-Working",
        mediaUrls: ["/images/seed/coworking-space.jpg"],
        declaredValue: "180000",
        offerItems: [{ name: "Co-Working (Annual)", value: 180000 }],
        wantItems: [{ name: "Mobile App Development", value: 100000 }, { name: "UI/UX Design", value: 50000 }, { name: "Digital Marketing Services", value: 40000 }, { name: "Interior Design & Fit-out", value: 35000 }, { name: "Corporate Catering (Annual)", value: 25000 }],
        hashtags: ["coworking", "adgm", "abudhabi", "officespace"],
        location: "Abu Dhabi",
        likeCount: 8,
      },
      {
        userId: fatima.id,
        title: "Fashion Showroom & Studio Space - Sharjah",
        caption: "400 sqm showroom and design studio in Sharjah Art District. High ceilings, natural light, changing rooms, and storage. Available for pop-up events, photoshoots, or long-term use. Bartering for marketing, photography, or event services.",
        feedCategory: "Space & Office",
        subCategory: "Showroom",
        mediaUrls: ["/images/seed/showroom-fashion.jpg"],
        declaredValue: "95000",
        offerItems: [{ name: "Showroom Space (Annual)", value: 95000 }],
        wantItems: [{ name: "Social Media Management", value: 40000 }, { name: "Fashion Photography", value: 30000 }, { name: "Event Planning Services", value: 25000 }, { name: "Influencer Marketing Campaign", value: 20000 }, { name: "Web Development & E-Commerce", value: 15000 }],
        hashtags: ["showroom", "studio", "fashionspace", "sharjah"],
        location: "Sharjah",
        likeCount: 12,
      },
      {
        userId: omar.id,
        title: "Custom AI Chatbot Development for Business",
        caption: "End-to-end AI chatbot development using GPT-4 and custom models. Includes training, integration with your CRM, and 6 months of support. Perfect for hospitality, retail, or service businesses needing 24/7 customer support.",
        feedCategory: "Other",
        subCategory: "AI/Technology",
        mediaUrls: ["/images/seed/ai-chatbot.jpg"],
        declaredValue: "55000",
        offerItems: [{ name: "AI Chatbot Development", value: 40000 }, { name: "6-Month Support", value: 15000 }],
        wantItems: [{ name: "Office Space (6 months)", value: 30000 }, { name: "Travel Credits", value: 20000 }, { name: "Marketing & PR Services", value: 15000 }, { name: "Hotel Accommodation Package", value: 12000 }, { name: "Professional Video Production", value: 10000 }],
        hashtags: ["ai", "chatbot", "gpt4", "automation"],
        location: "Abu Dhabi",
        likeCount: 21,
      },
      {
        userId: fatima.id,
        title: "Luxury Abaya Collection - 50 Pieces Wholesale",
        caption: "Premium designer abaya collection of 50 unique pieces. Handcrafted with Italian silk and Japanese fabrics, intricate embroidery. Retail-ready packaging and branding. Open to trade for marketing services, photography, or retail space.",
        feedCategory: "Other",
        subCategory: "Fashion Products",
        mediaUrls: ["/images/seed/abaya-collection.jpg"],
        declaredValue: "125000",
        offerItems: [{ name: "Abaya Collection (50 pieces)", value: 125000 }],
        wantItems: [{ name: "Marketing Campaign", value: 50000 }, { name: "Photography + Content", value: 40000 }, { name: "Retail Space Lease", value: 35000 }, { name: "Event Management Services", value: 25000 }, { name: "E-Commerce & Web Development", value: 20000 }],
        hashtags: ["abaya", "luxuryfashion", "modest", "designer"],
        location: "Sharjah",
        likeCount: 17,
      },
    ])
    .returning();

  console.log(`Created ${samplePosts.length} sample posts`);

  seedAiModeration(samplePosts.slice(0, 5).map((p) => ({ id: p.id, title: p.title, caption: p.caption, categories: [] }))).catch(() => {});

  console.log("Database seeding completed!");
}

async function seedAiModeration(testPosts: { id: string; title: string; caption: string | null; categories: string[] }[]) {
  try {
    const { moderateAndLog } = await import("./agents/moderationAgent");
    console.log(`Running AI moderation on ${testPosts.length} seed posts...`);
    for (const post of testPosts) {
      await moderateAndLog("post", post.id, {
        title: post.title,
        description: post.caption || undefined,
        categories: post.categories,
      });
    }
    console.log("AI moderation seeding completed");
  } catch (err) {
    console.log("AI moderation seeding skipped (service unavailable)");
  }
}
