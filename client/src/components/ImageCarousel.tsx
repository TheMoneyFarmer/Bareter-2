import { useCallback, useEffect, useState, type MouseEvent } from "react";
import useEmblaCarousel from "embla-carousel-react";
import { ChevronLeft, ChevronRight, X, ZoomIn } from "lucide-react";

interface ImageCarouselProps {
  images: string[];
  alt: string;
  aspect?: string;
  className?: string;
  testIdPrefix?: string;
  overlays?: React.ReactNode;
  onFirstLoad?: () => void;
}

function Lightbox({
  images,
  alt,
  startIndex,
  onClose,
}: {
  images: string[];
  alt: string;
  startIndex: number;
  onClose: () => void;
}) {
  const [emblaRef, emblaApi] = useEmblaCarousel({ loop: images.length > 1, startIndex });
  const [current, setCurrent] = useState(startIndex);

  useEffect(() => {
    if (!emblaApi) return;
    const onSelect = () => setCurrent(emblaApi.selectedScrollSnap());
    emblaApi.on("select", onSelect);
    onSelect();
    return () => { emblaApi.off("select", onSelect); };
  }, [emblaApi]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft") emblaApi?.scrollPrev();
      if (e.key === "ArrowRight") emblaApi?.scrollNext();
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [emblaApi, onClose]);

  return (
    <div
      className="fixed inset-0 z-[9999] bg-black/95 flex flex-col"
      data-testid="lightbox-overlay"
      onClick={onClose}
    >
      {/* Top bar */}
      <div
        className="flex items-center justify-between px-4 py-3 flex-shrink-0"
        onClick={(e) => e.stopPropagation()}
      >
        <span className="text-white/70 text-sm">{current + 1} / {images.length}</span>
        <button
          type="button"
          onClick={onClose}
          className="h-10 w-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors"
          aria-label="Close"
          data-testid="lightbox-close"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Swipeable carousel */}
      <div
        className="flex-1 overflow-hidden relative"
        onClick={(e) => e.stopPropagation()}
        ref={emblaRef}
      >
        <div className="flex h-full">
          {images.map((src, i) => (
            <div
              key={`${src}-${i}`}
              className="relative h-full min-w-0 flex-[0_0_100%] flex items-center justify-center px-2"
            >
              <img
                src={src}
                alt={`${alt} ${i + 1} of ${images.length}`}
                loading={i === 0 ? "eager" : "lazy"}
                className="max-h-full max-w-full object-contain select-none"
                draggable={false}
              />
            </div>
          ))}
        </div>

        {images.length > 1 && (
          <>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); emblaApi?.scrollPrev(); }}
              className="absolute start-3 top-1/2 -translate-y-1/2 h-11 w-11 rounded-full bg-black/50 hover:bg-black/70 text-white flex items-center justify-center backdrop-blur-sm transition-colors"
              aria-label="Previous image"
              data-testid="lightbox-prev"
            >
              <ChevronLeft className="h-6 w-6" />
            </button>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); emblaApi?.scrollNext(); }}
              className="absolute end-3 top-1/2 -translate-y-1/2 h-11 w-11 rounded-full bg-black/50 hover:bg-black/70 text-white flex items-center justify-center backdrop-blur-sm transition-colors"
              aria-label="Next image"
              data-testid="lightbox-next"
            >
              <ChevronRight className="h-6 w-6" />
            </button>
          </>
        )}
      </div>

      {/* Dot strip */}
      {images.length > 1 && (
        <div
          className="flex items-center justify-center gap-2 py-4 flex-shrink-0"
          onClick={(e) => e.stopPropagation()}
        >
          {images.map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => emblaApi?.scrollTo(i)}
              className={`h-2 rounded-full transition-all ${i === current ? "bg-white w-5" : "bg-white/40 w-2"}`}
              aria-label={`Go to image ${i + 1}`}
              data-testid={`lightbox-dot-${i}`}
            />
          ))}
        </div>
      )}
    </div>
  );
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
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

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
    return () => { emblaApi.off("select", onSelect); };
  }, [emblaApi]);

  const scrollPrev = useCallback(
    (e: MouseEvent) => { e.preventDefault(); e.stopPropagation(); emblaApi?.scrollPrev(); },
    [emblaApi]
  );

  const scrollNext = useCallback(
    (e: MouseEvent) => { e.preventDefault(); e.stopPropagation(); emblaApi?.scrollNext(); },
    [emblaApi]
  );

  const openLightbox = useCallback((e: MouseEvent, index: number) => {
    e.preventDefault();
    e.stopPropagation();
    setLightboxIndex(index);
  }, []);

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
    <>
      <div className={`relative ${aspect} bg-bareter-off-white dark:bg-muted overflow-hidden ${className}`}>
        <div
          className="overflow-hidden h-full"
          ref={emblaRef}
          data-testid={testIdPrefix ? `${testIdPrefix}-carousel` : undefined}
        >
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

        {/* Invisible click-catcher to open lightbox */}
        <button
          type="button"
          onClick={(e) => openLightbox(e as unknown as MouseEvent, selectedIndex)}
          className="absolute inset-0 z-[1] cursor-zoom-in"
          aria-label="View full image"
          data-testid={testIdPrefix ? `${testIdPrefix}-expand` : "carousel-expand"}
        />

        {/* Zoom hint icon */}
        <div className="absolute top-2 end-2 z-[2] pointer-events-none h-8 w-8 rounded-full bg-black/40 text-white flex items-center justify-center">
          <ZoomIn className="h-4 w-4" />
        </div>

        {showControls && (
          <>
            <button
              type="button"
              onClick={scrollPrev}
              className="absolute start-2 top-1/2 -translate-y-1/2 h-8 w-8 rounded-full bg-black/40 text-white hover:bg-black/60 backdrop-blur-sm flex items-center justify-center z-[3] opacity-0 group-hover:opacity-100 transition-opacity"
              aria-label="Previous image"
              data-testid={testIdPrefix ? `${testIdPrefix}-prev` : undefined}
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={scrollNext}
              className="absolute end-2 top-1/2 -translate-y-1/2 h-8 w-8 rounded-full bg-black/40 text-white hover:bg-black/60 backdrop-blur-sm flex items-center justify-center z-[3] opacity-0 group-hover:opacity-100 transition-opacity"
              aria-label="Next image"
              data-testid={testIdPrefix ? `${testIdPrefix}-next` : undefined}
            >
              <ChevronRight className="h-4 w-4" />
            </button>

            <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex items-center gap-1.5 pointer-events-none z-[2]">
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

      {lightboxIndex !== null && (
        <Lightbox
          images={safeImages}
          alt={alt}
          startIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
        />
      )}
    </>
  );
}

export default ImageCarousel;
