import { useCallback, useEffect, useState, type MouseEvent } from "react";
import useEmblaCarousel from "embla-carousel-react";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface ImageCarouselProps {
  images: string[];
  alt: string;
  /** Tailwind aspect class — defaults to aspect-square (Insta-style) */
  aspect?: string;
  /** Additional class for the outer container */
  className?: string;
  /** Optional test id prefix */
  testIdPrefix?: string;
  /** Children rendered as overlays (badges, buttons) on top of the carousel */
  overlays?: React.ReactNode;
  /** Called when the user has loaded the first slide (used by skeleton blur reveal) */
  onFirstLoad?: () => void;
}

export function ImageCarousel({
  images,
  alt,
  aspect = "aspect-square",
  className = "",
  testIdPrefix,
  overlays,
  onFirstLoad,
}: ImageCarouselProps) {
  const safeImages = images && images.length > 0 ? images : [];
  const [emblaRef, emblaApi] = useEmblaCarousel({
    loop: safeImages.length > 1,
    align: "start",
    skipSnaps: false,
    dragFree: false,
  });
  const [selectedIndex, setSelectedIndex] = useState(0);

  useEffect(() => {
    if (!emblaApi) return;
    const onSelect = () => setSelectedIndex(emblaApi.selectedScrollSnap());
    emblaApi.on("select", onSelect);
    onSelect();
    return () => {
      emblaApi.off("select", onSelect);
    };
  }, [emblaApi]);

  const scrollTo = useCallback(
    (index: number, e?: MouseEvent) => {
      if (e) {
        e.preventDefault();
        e.stopPropagation();
      }
      emblaApi?.scrollTo(index);
    },
    [emblaApi]
  );

  const scrollPrev = useCallback(
    (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      emblaApi?.scrollPrev();
    },
    [emblaApi]
  );

  const scrollNext = useCallback(
    (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      emblaApi?.scrollNext();
    },
    [emblaApi]
  );

  if (safeImages.length === 0) {
    return (
      <div
        className={`relative ${aspect} bg-gradient-to-br from-primary/10 to-primary/5 ${className}`}
        data-testid={testIdPrefix ? `${testIdPrefix}-empty` : undefined}
      >
        {overlays}
      </div>
    );
  }

  const showControls = safeImages.length > 1;

  return (
    <div className={`relative ${aspect} bg-bareter-off-white dark:bg-muted overflow-hidden ${className}`}>
      <div className="overflow-hidden h-full" ref={emblaRef} data-testid={testIdPrefix ? `${testIdPrefix}-carousel` : undefined}>
        <div className="flex h-full">
          {safeImages.map((src, i) => (
            <div
              key={`${src}-${i}`}
              className="relative h-full min-w-0 flex-[0_0_100%]"
              data-testid={testIdPrefix ? `${testIdPrefix}-slide-${i}` : undefined}
            >
              <img
                src={src}
                alt={`${alt} ${i + 1} of ${safeImages.length}`}
                loading={i === 0 ? "eager" : "lazy"}
                className="w-full h-full object-cover"
                onLoad={i === 0 ? onFirstLoad : undefined}
                draggable={false}
              />
            </div>
          ))}
        </div>
      </div>

      {showControls && (
        <>
          <button
            type="button"
            onClick={scrollPrev}
            className="absolute start-2 top-1/2 -translate-y-1/2 h-8 w-8 rounded-full bg-black/40 text-white hover:bg-black/60 backdrop-blur-sm flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
            aria-label="Previous image"
            data-testid={testIdPrefix ? `${testIdPrefix}-prev` : undefined}
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={scrollNext}
            className="absolute end-2 top-1/2 -translate-y-1/2 h-8 w-8 rounded-full bg-black/40 text-white hover:bg-black/60 backdrop-blur-sm flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
            aria-label="Next image"
            data-testid={testIdPrefix ? `${testIdPrefix}-next` : undefined}
          >
            <ChevronRight className="h-4 w-4" />
          </button>

          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex items-center gap-1.5 pointer-events-none">
            {safeImages.map((_, i) => (
              <span
                key={i}
                className={`h-1.5 rounded-full transition-all ${
                  i === selectedIndex ? "bg-white w-4" : "bg-white/60 w-1.5"
                }`}
                data-testid={testIdPrefix ? `${testIdPrefix}-dot-${i}` : undefined}
              />
            ))}
          </div>
        </>
      )}

      {overlays}
    </div>
  );
}

export default ImageCarousel;
