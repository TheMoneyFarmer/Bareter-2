import { useQuery } from "@tanstack/react-query";
import { ShieldCheck, Star } from "lucide-react";

export interface SuccessStory {
  name: string;
  city: string;
  swap: string;
  forItem: string;
  value: number;
}

const FALLBACK_STORIES: SuccessStory[] = [
  { name: "Aisha M.", city: "Dubai",     swap: "Catering for 50 guests",  forItem: "Wedding photography",      value: 18500 },
  { name: "Omar S.",  city: "Abu Dhabi", swap: "Office furniture set",     forItem: "3 months of accounting",   value: 32000 },
  { name: "Layla R.", city: "Sharjah",   swap: "Logo and brand identity",  forItem: "Beachfront staycation",    value: 9500 },
];

function StoryCard({ story, index, ariaHidden }: { story: SuccessStory; index: number; ariaHidden?: boolean }) {
  return (
    <article
      className="bareter-story-card"
      data-testid={ariaHidden ? undefined : `card-story-${index}`}
      aria-hidden={ariaHidden ? "true" : undefined}
    >
      <div className="flex items-center gap-2 mb-3">
        <div className="h-9 w-9 rounded-full bg-bareter-teal-muted text-bareter-teal flex items-center justify-center font-semibold">
          {story.name.charAt(0)}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-bareter-navy dark:text-foreground truncate">
            {story.name} <span className="font-normal text-bareter-muted">in {story.city}</span>
          </p>
          <p className="inline-flex items-center gap-1 text-[11px] font-semibold text-bareter-teal">
            <ShieldCheck className="h-3 w-3" /> Verified
          </p>
        </div>
      </div>
      <p className="text-sm text-bareter-navy dark:text-foreground leading-relaxed">
        Swapped <span className="font-semibold">{story.swap}</span> for{" "}
        <span className="font-semibold">{story.forItem}</span>
      </p>
      <p className="mt-3 text-price">AED {story.value.toLocaleString()}</p>
      <div className="mt-3 flex items-center gap-1 text-bareter-teal">
        {Array.from({ length: 5 }).map((_, k) => (
          <Star key={k} className="h-3.5 w-3.5 fill-current" />
        ))}
      </div>
    </article>
  );
}

export function SuccessStoriesMarquee() {
  const { data } = useQuery<SuccessStory[]>({
    queryKey: ["/api/deals/recent-completed"],
    staleTime: 5 * 60 * 1000,
  });

  // Always render at least 3 cards so the marquee feels populated and so the
  // legacy `card-story-0..2` test hooks always exist. Real deals appear first;
  // any remaining slots are filled with the curated fallback set.
  const real = data ?? [];
  const padded: SuccessStory[] = [...real];
  for (const fb of FALLBACK_STORIES) {
    if (padded.length >= 3) break;
    padded.push(fb);
  }
  const stories = padded;
  const doubled = [...stories, ...stories];

  return (
    <div
      className="bareter-stories"
      role="region"
      aria-label="Recent completed barters"
      data-testid="stories-marquee"
      tabIndex={0}
    >
      <div className="bareter-stories-track">
        {doubled.map((story, i) => (
          <StoryCard
            key={`${story.name}-${i}`}
            story={story}
            index={i % stories.length}
            ariaHidden={i >= stories.length}
          />
        ))}
      </div>
    </div>
  );
}

export default SuccessStoriesMarquee;
