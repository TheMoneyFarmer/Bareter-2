export type DeliverableItem = {
  label: string;
  checked: boolean;
};

export const CATEGORY_DELIVERABLES: Record<string, string[]> = {
  Hospitality: [
    "Room nights / suite accommodation",
    "F&B credits or complimentary dining",
    "Spa or wellness treatments",
    "Event venue or meeting room access",
    "Airport transfers / concierge services",
    "Branded welcome amenities",
    "Photo & video usage rights of property",
  ],
  Fashion: [
    "Custom garments or bespoke tailoring",
    "Lookbook or campaign photoshoot",
    "Runway show placement",
    "Product samples or full collection",
    "Brand tagging on all posts",
    "Usage rights for marketing materials",
    "Style consultation session",
  ],
  Modeling: [
    "3 Reels + 5 Stories + 2 Posts",
    "Brand tagging in all content",
    "Usage rights for all produced content",
    "Full-day or half-day shoot",
    "Behind-the-scenes content",
    "Exclusivity period (30 days)",
    "Re-sharing on personal channels",
  ],
  SaaS: [
    "12-month software license (full plan)",
    "Onboarding and setup assistance",
    "Priority support access",
    "Custom feature development",
    "API access and integration support",
    "Training sessions for team",
    "Data migration support",
  ],
  Photography: [
    "Professional photoshoot session",
    "Edited high-resolution images (minimum 20)",
    "Raw files delivery",
    "Usage rights for commercial use",
    "Retouching and post-production",
    "Same-day preview delivery",
    "Print-ready files",
  ],
  Services: [
    "Defined scope of work document",
    "Milestone delivery schedule",
    "Progress reports (weekly/bi-weekly)",
    "Final deliverable handover",
    "Revision rounds included (2 rounds)",
    "Post-delivery support period",
    "Non-disclosure agreement",
  ],
  Food: [
    "Catering for specified number of guests",
    "Menu customization and tasting session",
    "Professional food styling",
    "Dietary accommodations",
    "Delivery and setup included",
    "Branded packaging or presentation",
    "Recipe or menu licensing",
  ],
  Legal: [
    "Legal consultation hours",
    "Document drafting and review",
    "Contract templates (customized)",
    "Compliance review and advisory",
    "Representation or mediation",
    "Legal opinion letter",
    "Follow-up advisory session",
  ],
  Events: [
    "Event planning and coordination",
    "Venue sourcing and management",
    "Guest list management",
    "AV and production setup",
    "On-site event management",
    "Post-event analytics report",
    "Photography and videography coverage",
  ],
  "Real Estate": [
    "Property viewing and tour arrangement",
    "Market analysis and valuation report",
    "Staging and presentation services",
    "Listing and marketing campaign",
    "Negotiation and closing support",
    "Virtual tour or 3D walkthrough",
    "Legal documentation support",
  ],
  Automotive: [
    "Vehicle detailing and preparation",
    "Test drive or vehicle loan period",
    "Maintenance or service package",
    "Vehicle branding or wrap installation",
    "Showroom or event placement",
    "Insurance coverage during use",
    "Delivery and pickup service",
  ],
  "Health & Wellness": [
    "Treatment sessions (specify number)",
    "Wellness assessment and consultation",
    "Customized treatment plan",
    "Product samples or full supply",
    "Follow-up sessions included",
    "Health report or progress tracking",
    "Branded content from sessions",
  ],
  Education: [
    "Course access or enrollment (specify duration)",
    "Certification upon completion",
    "One-on-one tutoring sessions",
    "Custom curriculum development",
    "Workshop or group training",
    "Learning materials and resources",
    "Progress assessment reports",
  ],
  Marketing: [
    "3 Reels + 5 Stories + 2 Posts",
    "Brand tagging and mentions",
    "Campaign strategy document",
    "Social media content calendar",
    "Audience analytics and reporting",
    "Ad creative design and copy",
    "Usage rights for all produced content",
    "Performance metrics report",
  ],
  Technology: [
    "Technical solution architecture",
    "Development and deployment",
    "Source code and documentation",
    "Testing and QA coverage",
    "Deployment and hosting setup",
    "Maintenance period (specify months)",
    "Technical training for team",
  ],
  Consulting: [
    "Discovery and assessment session",
    "Strategy document or roadmap",
    "Implementation recommendations",
    "Follow-up advisory sessions (specify count)",
    "Industry benchmarking report",
    "Stakeholder presentation",
    "Action plan with milestones",
  ],
  Design: [
    "Brand identity package (logo, colors, typography)",
    "Design files in editable formats",
    "Revision rounds included (3 rounds)",
    "Print-ready and digital-ready assets",
    "Brand guidelines document",
    "Social media templates",
    "Stationery and collateral design",
  ],
  Entertainment: [
    "Performance or appearance (specify duration)",
    "Rehearsal and preparation time",
    "Sound check and technical requirements",
    "Content creation from event",
    "Social media promotion pre and post event",
    "Meet and greet session",
    "Usage rights for event footage",
  ],
};

// ── Keyword-based deliverable sets for specific items ──────────────────────────
// Each entry maps a keyword group to tailored deliverables. Checked true = pre-selected.
const KEYWORD_DELIVERABLES: { keywords: string[]; items: string[] }[] = [
  {
    keywords: ["iphone", "samsung", "phone", "smartphone", "mobile", "android", "pixel", "oneplus", "huawei", "xiaomi", "oppo"],
    items: [
      "Device unlocked and factory reset",
      "Original charger, cable and box included",
      "Battery health report (screenshot)",
      "IMEI clearance confirmation",
      "Screen and body condition documented with photos",
      "All ports and buttons tested and working",
      "Warranty period remaining (if applicable)",
    ],
  },
  {
    keywords: ["macbook", "laptop", "notebook", "computer", "pc", "dell", "hp", "lenovo", "asus", "surface"],
    items: [
      "Device wiped and OS reinstalled",
      "Original charger and accessories included",
      "Screen, keyboard and trackpad condition report",
      "Battery cycle count and health report",
      "All ports tested and confirmed working",
      "Storage and RAM specifications confirmed",
      "Original packaging (if available)",
    ],
  },
  {
    keywords: ["ipad", "tablet", "kindle"],
    items: [
      "Device factory reset and unlocked",
      "Original charger and cable included",
      "Screen and body condition with photos",
      "Battery health report",
      "Accessories (case, stylus) if agreed",
      "IMEI or serial number confirmed",
    ],
  },
  {
    keywords: ["airpods", "headphones", "earbuds", "earphones", "speaker", "audio", "sound"],
    items: [
      "Device tested and confirmed working",
      "Original case and charging cable included",
      "Battery life report for both earbuds and case",
      "Original packaging included",
      "All controls and microphone tested",
    ],
  },
  {
    keywords: ["apple watch", "smartwatch", "watch", "garmin", "fitbit", "wearable"],
    items: [
      "Watch face and body in described condition",
      "Band(s) included",
      "Charger included",
      "Battery health report",
      "All sensors and features tested",
      "Original box (if available)",
    ],
  },
  {
    keywords: ["camera", "dslr", "mirrorless", "gopro", "drone", "gimbal", "lens", "nikon", "canon", "sony"],
    items: [
      "Camera body tested and confirmed working",
      "Shutter count report",
      "All lenses and accessories included as listed",
      "Sensor cleaned and inspected",
      "Battery and charger included",
      "Memory card (if agreed)",
      "Original packaging and manual (if available)",
    ],
  },
  {
    keywords: ["ps5", "playstation", "xbox", "nintendo", "console", "gaming", "game"],
    items: [
      "Console factory reset and tested",
      "All controllers included and working",
      "HDMI cable and power cable included",
      "Games / accessories as listed",
      "Disk drive tested (if applicable)",
      "Original packaging (if available)",
    ],
  },
  {
    keywords: ["tv", "television", "monitor", "screen", "display"],
    items: [
      "Screen tested with no dead pixels or burn-in",
      "All ports (HDMI, USB) tested",
      "Remote control included",
      "Power cable and accessories included",
      "Mounting hardware (if applicable)",
      "Original packaging (if available)",
    ],
  },
  {
    keywords: ["reel", "reels", "tiktok", "video", "film", "youtube", "vlog", "short", "footage"],
    items: [
      "Instagram Reels (specify count)",
      "TikTok videos (specify count)",
      "YouTube video / Short (specify length)",
      "Raw footage files delivered",
      "Edited and color-graded final cut",
      "Subtitles and captions included",
      "Usage rights for all produced content",
      "Content goes live on agreed date",
    ],
  },
  {
    keywords: ["photo", "photoshoot", "shoot", "portrait", "headshot", "product photo"],
    items: [
      "Professional photoshoot session (specify hours)",
      "Edited high-resolution images (specify count)",
      "Raw files delivery",
      "Same-day preview selection",
      "Retouching and post-production",
      "Usage rights for commercial use",
      "Online gallery delivery link",
    ],
  },
  {
    keywords: ["instagram", "social media", "post", "story", "stories", "influencer", "ugc", "content creator"],
    items: [
      "Instagram feed posts (specify count)",
      "Instagram Stories (specify count)",
      "Brand tagging and mentions in all posts",
      "Content live on agreed date",
      "Usage rights for all content",
      "No deletion for agreed period (min 30 days)",
      "Performance insights screenshot",
    ],
  },
  {
    keywords: ["logo", "brand", "branding", "graphic", "design", "ui", "ux", "figma", "illustration"],
    items: [
      "Logo files in all formats (AI, SVG, PNG, PDF)",
      "Design files in editable formats (Figma/AI/PSD)",
      "3 revision rounds included",
      "Print-ready and digital-ready assets",
      "Brand guidelines document",
      "Social media template kit",
      "Color palette and typography guide",
    ],
  },
  {
    keywords: ["website", "web", "webapp", "app", "mobile app", "development", "coding", "software", "saas", "platform"],
    items: [
      "Technical scope of work document",
      "Full development and deployment",
      "Source code and documentation",
      "Testing and QA coverage",
      "Hosting and domain setup (if agreed)",
      "Maintenance period (specify months)",
      "User training or handover session",
    ],
  },
  {
    keywords: ["marketing", "ads", "campaign", "seo", "ppc", "google ads", "meta ads", "advertising"],
    items: [
      "Campaign strategy document",
      "Ad creative designs (specify count)",
      "Copywriting for all ad variations",
      "Audience targeting setup",
      "Monthly content calendar",
      "A/B test variations",
      "Performance metrics report",
    ],
  },
  {
    keywords: ["hotel", "stay", "accommodation", "villa", "resort", "suite", "airbnb", "room", "chalet"],
    items: [
      "Room nights (specify count and room type)",
      "Breakfast or meal plan included",
      "Spa or wellness access",
      "Airport transfer (if agreed)",
      "F&B credits",
      "Photo and video usage rights of property",
      "Confirmed booking dates",
    ],
  },
  {
    keywords: ["car", "vehicle", "rent", "rental", "supercar", "suv", "truck", "motorcycle", "bike", "bmw", "mercedes", "porsche", "ferrari", "lamborghini", "tesla"],
    items: [
      "Vehicle professionally detailed and cleaned",
      "Full tank of fuel included",
      "Loan or rental period (specify days)",
      "Vehicle condition report with photos",
      "Insurance coverage during use confirmed",
      "Delivery and pickup service",
      "Mileage limit agreed and documented",
    ],
  },
  {
    keywords: ["food", "catering", "chef", "meal", "restaurant", "dining", "cake", "pastry", "bakery", "cuisine"],
    items: [
      "Meals / dishes (specify count and type)",
      "Delivery and setup included",
      "Menu customization agreed",
      "Dietary accommodations confirmed",
      "Branded packaging",
      "Professional food styling (if content involved)",
      "Tasting session (if applicable)",
    ],
  },
  {
    keywords: ["fitness", "training", "gym", "workout", "personal trainer", "pt", "yoga", "pilates", "coach"],
    items: [
      "Personal training sessions (specify count)",
      "Customized workout program",
      "Nutritional guidance and meal plan",
      "Progress tracking and check-ins",
      "Video workout demos",
      "Fitness assessment report",
      "Access to app or online platform (if applicable)",
    ],
  },
  {
    keywords: ["legal", "lawyer", "attorney", "contract", "compliance", "advisory", "law"],
    items: [
      "Legal consultation hours (specify count)",
      "Document drafting and review",
      "Contract templates (customized)",
      "Compliance advisory report",
      "Legal opinion letter",
      "Follow-up advisory session",
      "NDA included (if required)",
    ],
  },
  {
    keywords: ["event", "party", "wedding", "conference", "seminar", "entertainment", "show", "concert"],
    items: [
      "Event planning and coordination",
      "Venue arrangement",
      "Guest list and RSVP management",
      "AV and production setup",
      "Photography and videography coverage",
      "Post-event recap or analytics",
      "Social media promotion pre and post event",
    ],
  },
  {
    keywords: ["consulting", "strategy", "advisory", "mentorship", "coaching", "business"],
    items: [
      "Discovery and assessment session",
      "Strategy document or roadmap",
      "Implementation recommendations",
      "Follow-up advisory sessions (specify count)",
      "Industry benchmarking report",
      "Stakeholder presentation",
      "Action plan with milestones",
    ],
  },
];

export function getDeliverablesForCategories(categories: string[]): DeliverableItem[] {
  const seen = new Set<string>();
  const items: DeliverableItem[] = [];

  for (const category of categories) {
    const deliverables = CATEGORY_DELIVERABLES[category];
    if (deliverables) {
      for (const label of deliverables) {
        if (!seen.has(label)) {
          seen.add(label);
          items.push({ label, checked: true });
        }
      }
    }
  }

  return items;
}

/**
 * Smart deliverable suggestions based on the listing title, description, and categories.
 * Keyword matching on title/description takes priority; falls back to category mapping.
 * Returns at most 7 items to keep the checklist scannable.
 */
export function getDeliverablesForListing(
  title: string,
  description: string,
  categories: string[],
): DeliverableItem[] {
  const haystack = `${title} ${description}`.toLowerCase();
  const seen = new Set<string>();
  const items: string[] = [];

  // First pass: keyword matching against title + description
  for (const group of KEYWORD_DELIVERABLES) {
    if (group.keywords.some((kw) => haystack.includes(kw))) {
      for (const label of group.items) {
        if (!seen.has(label) && items.length < 7) {
          seen.add(label);
          items.push(label);
        }
      }
      if (items.length >= 7) break;
    }
  }

  // Second pass: fill remaining slots from category map
  if (items.length < 7) {
    for (const category of categories) {
      const catItems = CATEGORY_DELIVERABLES[category] ?? [];
      for (const label of catItems) {
        if (!seen.has(label) && items.length < 7) {
          seen.add(label);
          items.push(label);
        }
      }
    }
  }

  return items.map((label) => ({ label, checked: true }));
}
