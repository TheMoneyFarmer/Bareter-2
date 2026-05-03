import { useEffect, useState } from "react";
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

function pickEmoji(swap: string): string {
  const s = swap.toLowerCase();
  if (/photo|camera|video/.test(s)) return "📸";
  if (/cater|food|restaurant|chef/.test(s)) return "🍽️";
  if (/furniture|office|desk|chair/.test(s)) return "🪑";
  if (/account|legal|consult|advisor/.test(s)) return "📊";
  if (/logo|brand|design|identity/.test(s)) return "🎨";
  if (/hotel|stay|suite|resort|beach/.test(s)) return "🏖️";
  if (/saas|software|enterprise|license/.test(s)) return "💻";
  if (/wedding|event/.test(s)) return "🎉";
  if (/marketing|seo|ads/.test(s)) return "📣";
  return "🤝";
}

function StoryCard({ story, index, ariaHidden }: { story: SuccessStory; index: number; ariaHidden?: boolean }) {
  const swapEmoji = pickEmoji(story.swap);
  const forEmoji = pickEmoji(story.forItem);
  return (
    <article
      className="bareter-story-card"
      data-testid={ariaHidden ? undefined : `card-story-${index}`}
      aria-hidden={ariaHidden ? "true" : undefined}
      tabIndex={ariaHidden ? -1 : 0}
      aria-label={
        ariaHidden
          ? undefined
          : `${story.name} in ${story.city} swapped ${story.swap} for ${story.forItem} worth AED ${story.value.toLocaleString()}`
      }
    >
      {/* Visual header strip — emoji "before/after" of the swap */}
      <div className="bareter-story-card__visual mb-3" aria-hidden="true">
        <span className="bareter-story-card__emoji" data-side="left">{swapEmoji}</span>
        <span className="bareter-story-card__arrow">→</span>
        <span className="bareter-story-card__emoji" data-side="right">{forEmoji}</span>
      </div>
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

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState<boolean>(() => {
    if (typeof window === "undefined" || !window.matchMedia) return false;
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  });
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(mq.matches);
    update();
    mq.addEventListener?.("change", update);
    return () => mq.removeEventListener?.("change", update);
  }, []);
  return reduced;
}

export function SuccessStoriesMarquee() {
  const { data } = useQuery<SuccessStory[]>({
    queryKey: ["/api/deals/recent-completed"],
    staleTime: 5 * 60 * 1000,
  });
  const reducedMotion = usePrefersReducedMotion();

  // Per spec: when no real completed deals exist (still loading or empty
  // result), fall back to the 3 hand-curated stories. Otherwise show only
  // the real deals so the marquee is always genuine.
  const real = data ?? [];
  const stories = real.length > 0 ? real : FALLBACK_STORIES;
  // For reduced-motion users we render only the original set so the
  // horizontal-scroll fallback shows each story exactly once. With motion,
  // we render multiple copies of the story set so:
  //   1. The total track is much wider than any viewport (no empty side
  //      gap mid-animation, which happens when one "set" is narrower than
  //      the viewport).
  //   2. The first half of the track is an exact pixel copy of the
  //      second half, so translateX(-50%) loops seamlessly.
  // We render 6 copies (3 sets per half) — works for 3+ stories on a
  // ~1920px desktop while staying lightweight on mobile.
  const COPIES_PER_HALF = 3;
  const rendered = reducedMotion
    ? stories
    : Array.from({ length: COPIES_PER_HALF * 2 }, () => stories).flat();

  return (
    <div
      className="bareter-stories"
      role="region"
      aria-label="Recent completed barters"
      data-testid="stories-marquee"
    >
      <div className="bareter-stories-track">
        {rendered.map((story, i) => (
          <StoryCard
            key={`${story.name}-${i}`}
            story={story}
            index={i % stories.length}
            ariaHidden={!reducedMotion && i >= stories.length}
          />
        ))}
      </div>
    </div>
  );
}

export default SuccessStoriesMarquee;
