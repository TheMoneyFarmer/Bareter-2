import { useLocation } from "wouter";

// All marketplace categories — drawn from Bareter, Facebook Marketplace,
// Dubizzle, Amazon.ae, and Noon.com to cover the full UAE trading landscape.
const CATEGORY_CHIPS: { label: string; category: string }[] = [
  { label: "Cars & Vehicles",      category: "Automotive" },
  { label: "Real Estate",          category: "Real Estate" },
  { label: "Services",             category: "Services" },
  { label: "Electronics",          category: "Electronics" },
  { label: "Hospitality",          category: "Hospitality" },
  { label: "Fashion",              category: "Fashion" },
  { label: "Health & Wellness",    category: "Health & Wellness" },
  { label: "Food & Dining",        category: "Food" },
  { label: "Jewelry & Watches",    category: "Jewelry & Watches" },
  { label: "Photography",          category: "Photography" },
  { label: "SaaS & Tech",          category: "SaaS" },
  { label: "Marketing",            category: "Marketing" },
  { label: "Legal",                category: "Legal" },
  { label: "Design",               category: "Design" },
  { label: "Consulting",           category: "Consulting" },
  { label: "Education",            category: "Education" },
  { label: "Events",               category: "Events" },
  { label: "Entertainment",        category: "Entertainment" },
  { label: "Modeling",             category: "Modeling" },
  { label: "Sports & Fitness",     category: "Sports & Fitness" },
  { label: "Kids & Baby",          category: "Kids & Baby" },
  { label: "Furniture & Home",     category: "Furniture & Home" },
  { label: "Home Appliances",      category: "Home Appliances" },
  { label: "Garden & Outdoor",     category: "Garden & Outdoor" },
  { label: "Pets & Animals",       category: "Pets & Animals" },
  { label: "Books & Stationery",   category: "Books & Stationery" },
  { label: "Musical Instruments",  category: "Musical Instruments" },
  { label: "Art & Collectibles",   category: "Art & Collectibles" },
  { label: "Gaming",               category: "Gaming" },
  { label: "Beauty & Cosmetics",   category: "Beauty & Cosmetics" },
  { label: "Tools & Equipment",    category: "Tools & Equipment" },
  { label: "Luggage & Travel",     category: "Luggage & Travel" },
  { label: "Yachts & Boats",       category: "Yachts" },
  { label: "Classified",           category: "Classified" },
  { label: "Miscellaneous",        category: "Miscellaneous" },
];

export function CategoryNav() {
  const [currentPath, navigate] = useLocation();

  const currentCategory = (() => {
    try {
      const params = new URLSearchParams(window.location.search);
      return params.get("category") ?? null;
    } catch {
      return null;
    }
  })();

  const handleChip = (category: string) => {
    navigate(`/browse?category=${encodeURIComponent(category)}`);
  };

  return (
    <nav
      className="bg-white dark:bg-card border-b border-bareter-border dark:border-border shadow-sm"
      aria-label="Browse by category"
      data-testid="category-nav"
    >
      <div className="container mx-auto max-w-7xl px-4">
        <div className="flex items-center gap-1.5 py-2.5 overflow-x-auto scrollbar-hide">
          {/* All chip */}
          <button
            type="button"
            onClick={() => navigate("/browse")}
            className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all border
              ${!currentCategory && currentPath.startsWith("/browse")
                ? "bg-bareter-navy text-white border-bareter-navy"
                : "border-bareter-border text-bareter-navy dark:text-foreground hover:border-bareter-teal hover:text-bareter-teal dark:hover:text-bareter-teal bg-transparent hover:bg-bareter-teal/5"
              }`}
          >
            All
          </button>

          {CATEGORY_CHIPS.map(({ label, category }) => {
            const isActive = currentCategory === category;
            return (
              <button
                key={category}
                type="button"
                onClick={() => handleChip(category)}
                className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all border
                  ${isActive
                    ? "bg-bareter-teal text-white border-bareter-teal"
                    : "border-bareter-border text-bareter-navy dark:text-foreground hover:border-bareter-teal hover:text-bareter-teal dark:hover:text-bareter-teal bg-transparent hover:bg-bareter-teal/5"
                  }`}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
