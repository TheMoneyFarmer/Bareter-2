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
