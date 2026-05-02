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

function StoryCard({ story, index, ariaHidden }: { story: SuccessStory; index: number; ariaHidden?: boolean }) {
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
  // we double the track so the CSS keyframe loop is seamless.
  const rendered = reducedMotion ? stories : [...stories, ...stories];

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
