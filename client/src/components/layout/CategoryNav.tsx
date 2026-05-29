import { useState, useRef, useEffect } from "react";
import { useLocation } from "wouter";
import { ChevronDown } from "lucide-react";

interface SubItem {
  label: string;
  category?: string;
  type?: string;
  href?: string;
  highlight?: boolean;
}

interface SubGroup {
  heading?: string;
  items: SubItem[];
}

interface NavCategory {
  label: string;
  emoji: string;
  category: string;
  href?: string;
  groups: SubGroup[];
}

const NAV_CATEGORIES: NavCategory[] = [
  {
    label: "Cars & Vehicles",
    emoji: "🚗",
    category: "Automotive",
    groups: [
      {
        heading: "By Type",
        items: [
          { label: "Used Cars",           category: "Automotive" },
          { label: "Luxury Cars",         category: "Automotive" },
          { label: "Commercial Vehicles", category: "Automotive" },
          { label: "Motorcycles",         category: "Automotive" },
          { label: "Number Plates",       category: "Automotive" },
        ],
      },
      {
        heading: "Yachts & Boats",
        items: [
          { label: "Yachts",      category: "Yachts" },
          { label: "Speed Boats", category: "Yachts" },
          { label: "Sailboats",   category: "Yachts" },
        ],
      },
    ],
  },
  {
    label: "Real Estate",
    emoji: "🏢",
    category: "Real Estate",
    groups: [
      {
        heading: "For Barter",
        items: [
          { label: "Residential",         category: "Real Estate" },
          { label: "Commercial",          category: "Real Estate" },
          { label: "Villa / Townhouse",   category: "Real Estate" },
          { label: "Apartment",           category: "Real Estate" },
          { label: "Land / Plot",         category: "Real Estate" },
          { label: "Short-Term Space",    category: "Real Estate" },
        ],
      },
      {
        heading: "Office & Retail",
        items: [
          { label: "Office Space",  category: "Real Estate" },
          { label: "Retail Unit",   category: "Real Estate" },
          { label: "Warehouse",     category: "Real Estate" },
        ],
      },
    ],
  },
  {
    label: "Services",
    emoji: "💼",
    category: "Services",
    groups: [
      {
        heading: "Professional",
        items: [
          { label: "Consulting",   category: "Consulting" },
          { label: "Legal",        category: "Legal" },
          { label: "Marketing",    category: "Marketing" },
          { label: "Design",       category: "Design" },
          { label: "Photography",  category: "Photography" },
          { label: "Events",       category: "Events" },
        ],
      },
      {
        heading: "Lifestyle",
        items: [
          { label: "Education",    category: "Education" },
          { label: "Modeling",     category: "Modeling" },
          { label: "Entertainment", category: "Entertainment" },
        ],
      },
    ],
  },
  {
    label: "Electronics & Tech",
    emoji: "📱",
    category: "Electronics",
    groups: [
      {
        heading: "Devices",
        items: [
          { label: "Smartphones",      category: "Electronics" },
          { label: "Laptops / PCs",    category: "Electronics" },
          { label: "Smart Home",       category: "Electronics" },
          { label: "Wearables",        category: "Electronics" },
          { label: "Cameras",          category: "Electronics" },
        ],
      },
      {
        heading: "SaaS & Software",
        items: [
          { label: "SaaS Tools",      category: "SaaS" },
          { label: "Tech Solutions",  category: "Technology" },
          { label: "App Development", category: "Technology" },
        ],
      },
    ],
  },
  {
    label: "Hospitality",
    emoji: "🍽",
    category: "Hospitality",
    groups: [
      {
        heading: "Food & Beverage",
        items: [
          { label: "Restaurant Packages", category: "Food" },
          { label: "Catering Services",   category: "Food" },
          { label: "Chef Services",       category: "Food" },
        ],
      },
      {
        heading: "Venues & Stays",
        items: [
          { label: "Hotel Stays",    category: "Hospitality" },
          { label: "Event Venues",   category: "Hospitality" },
          { label: "Holiday Homes",  category: "Hospitality" },
        ],
      },
    ],
  },
  {
    label: "Health & Fitness",
    emoji: "🏋",
    category: "Health & Wellness",
    groups: [
      {
        heading: "Fitness",
        items: [
          { label: "Gym Memberships",   category: "Health & Wellness" },
          { label: "Personal Training", category: "Health & Wellness" },
          { label: "Sports Equipment",  category: "Health & Wellness" },
        ],
      },
      {
        heading: "Wellness",
        items: [
          { label: "Spa & Beauty",   category: "Health & Wellness" },
          { label: "Medical",        category: "Health & Wellness" },
          { label: "Nutrition",      category: "Health & Wellness" },
        ],
      },
    ],
  },
  {
    label: "Brand Collabs",
    emoji: "📢",
    category: "collabs",
    href: "/browse?tab=collabs",
    groups: [
      {
        heading: "By Niche",
        items: [
          { label: "Fashion & Style",    href: "/browse?tab=collabs" },
          { label: "Beauty & Skincare",  href: "/browse?tab=collabs" },
          { label: "Tech & Gadgets",     href: "/browse?tab=collabs" },
          { label: "Food & Dining",      href: "/browse?tab=collabs" },
          { label: "Fitness & Health",   href: "/browse?tab=collabs" },
          { label: "Travel & Lifestyle", href: "/browse?tab=collabs" },
        ],
      },
      {
        heading: "For Brands",
        items: [
          { label: "How it works",          href: "/browse?tab=collabs" },
          { label: "Browse all collabs",    href: "/browse?tab=collabs" },
          { label: "✦ Post a Brand Collab", href: "/create-listing", highlight: true },
        ],
      },
    ],
  },
  {
    label: "Creators",
    emoji: "🎥",
    category: "creators",
    href: "/creators",
    groups: [
      {
        heading: "Browse by Niche",
        items: [
          { label: "Fashion Creators",    href: "/creators?niche=Fashion" },
          { label: "Beauty Creators",     href: "/creators?niche=Beauty" },
          { label: "Tech Creators",       href: "/creators?niche=Tech" },
          { label: "Food Creators",       href: "/creators?niche=Food" },
          { label: "Fitness Creators",    href: "/creators?niche=Fitness" },
          { label: "Travel Creators",     href: "/creators?niche=Travel" },
        ],
      },
      {
        heading: "For Creators",
        items: [
          { label: "Browse brand deals",     href: "/browse?tab=collabs" },
          { label: "Discover all creators",  href: "/creators" },
          { label: "✦ Join as Creator",      href: "/register", highlight: true },
        ],
      },
    ],
  },
];

interface DropdownProps {
  cat: NavCategory;
  onNavigate: (params: { category?: string; type?: string; href?: string }) => void;
}

function CategoryDropdown({ cat, onNavigate }: DropdownProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleMouseEnter = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setOpen(true);
  };
  const handleMouseLeave = () => {
    timerRef.current = setTimeout(() => setOpen(false), 120);
  };

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  return (
    <div
      ref={ref}
      className="relative"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <button
        type="button"
        className={`flex items-center gap-1.5 px-4 py-2 text-sm font-semibold whitespace-nowrap transition-all rounded-md border
          ${open
            ? "border-bareter-teal bg-bareter-teal-muted text-bareter-teal shadow-sm"
            : "border-transparent text-bareter-navy dark:text-foreground hover:border-bareter-border hover:bg-gray-50 dark:hover:bg-muted hover:text-bareter-teal"
          }`}
        onClick={() => onNavigate({ href: cat.href, category: cat.href ? undefined : cat.category })}
        aria-expanded={open}
      >
        {cat.label}
        <ChevronDown className={`h-3.5 w-3.5 transition-transform flex-shrink-0 ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div
          className="absolute top-full left-0 z-50 mt-0 bg-white dark:bg-card border border-bareter-border dark:border-border shadow-bareter-hover rounded-b-md rounded-tr-md min-w-[480px] flex"
          style={{ minHeight: 200 }}
        >
          {cat.groups.map((group, gi) => (
            <div key={gi} className="flex-1 p-4 border-e border-bareter-border dark:border-border last:border-e-0">
              {group.heading && (
                <p className="text-[11px] font-bold uppercase tracking-wider text-bareter-muted mb-2">
                  {group.heading}
                </p>
              )}
              <ul className="space-y-0.5">
                {group.items.map((item) => (
                  <li key={item.label}>
                    <button
                      type="button"
                      className={`w-full text-start px-2 py-1.5 text-sm rounded-sm transition-colors ${
                        item.highlight
                          ? "text-bareter-teal font-semibold hover:bg-bareter-teal-muted"
                          : "text-bareter-navy dark:text-foreground hover:text-bareter-teal hover:bg-bareter-teal-muted"
                      }`}
                      onClick={() => {
                        setOpen(false);
                        onNavigate({ href: item.href, category: item.category, type: item.type });
                      }}
                    >
                      {item.label}
                    </button>
                  </li>
                ))}
              </ul>
              {gi === 0 && (
                <button
                  type="button"
                  className="mt-3 text-xs font-semibold text-bareter-teal hover:underline"
                  onClick={() => { setOpen(false); onNavigate({ href: cat.href, category: cat.href ? undefined : cat.category }); }}
                >
                  View all {cat.label} →
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function CategoryNav() {
  const [, navigate] = useLocation();

  const handleNavigate = ({ category, type, href }: { category?: string; type?: string; href?: string }) => {
    if (href) { navigate(href); return; }
    const params = new URLSearchParams();
    if (category) params.set("category", category);
    if (type) params.set("type", type);
    navigate(`/browse?${params.toString()}`);
  };

  return (
    <nav
      className="bg-white dark:bg-card border-b border-bareter-border dark:border-border shadow-sm"
      aria-label="Browse by category"
      data-testid="category-nav"
    >
      <div className="container mx-auto max-w-7xl px-4">
        <div className="flex items-center gap-2 py-2 overflow-x-auto scrollbar-hide">
          {NAV_CATEGORIES.map((cat) => (
            <CategoryDropdown
              key={cat.label}
              cat={cat}
              onNavigate={handleNavigate}
            />
          ))}
          <div className="ms-auto flex-shrink-0 ps-2">
            <button
              type="button"
              className="text-sm font-semibold text-bareter-teal hover:underline whitespace-nowrap"
              onClick={() => navigate("/browse?showCategories=true")}
            >
              All Categories →
            </button>
          </div>
        </div>
      </div>
    </nav>
  );
}
