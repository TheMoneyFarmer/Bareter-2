import { useState } from "react";
import { useSeo } from "@/hooks/use-seo";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Compass, Search, HelpCircle, Home } from "lucide-react";

export default function NotFound() {
  const [, navigate] = useLocation();
  const [query, setQuery] = useState("");

  useSeo({ title: "Page not found · Bareter" });

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const q = query.trim();
    navigate(q ? `/browse?q=${encodeURIComponent(q)}` : "/browse");
  };

  return (
    <section
      className="min-h-[70vh] flex items-center justify-center px-4 py-16"
      data-testid="page-not-found"
    >
      <div className="w-full max-w-2xl text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/10 text-primary mb-6">
          <Compass className="w-8 h-8" aria-hidden="true" />
        </div>
        <p
          className="text-sm font-semibold tracking-widest text-primary uppercase mb-2"
          data-testid="text-not-found-code"
        >
          404
        </p>
        <h1
          className="text-3xl sm:text-4xl font-bold text-foreground mb-3"
          data-testid="heading-not-found"
        >
          We couldn't find that page
        </h1>
        <p className="text-base text-muted-foreground mb-8 max-w-xl mx-auto">
          The link may be broken, or the page may have moved. Try searching the
          marketplace or jump back to somewhere familiar.
        </p>

        <form
          onSubmit={onSubmit}
          className="flex gap-2 max-w-lg mx-auto mb-8"
          data-testid="form-not-found-search"
        >
          <div className="relative flex-1">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search listings, services, or businesses…"
              className="pl-9 h-11"
              data-testid="input-not-found-search"
              aria-label="Search the marketplace"
            />
          </div>
          <Button
            type="submit"
            className="h-11 px-5"
            data-testid="button-not-found-search"
          >
            Search
          </Button>
        </form>

        <div className="flex flex-wrap items-center justify-center gap-3">
          <Link href="/">
            <Button variant="outline" className="gap-2" data-testid="link-not-found-home">
              <Home className="w-4 h-4" aria-hidden="true" />
              Home
            </Button>
          </Link>
          <Link href="/browse">
            <Button variant="outline" className="gap-2" data-testid="link-not-found-browse">
              <Compass className="w-4 h-4" aria-hidden="true" />
              Browse
            </Button>
          </Link>
          <Link href="/help">
            <Button variant="outline" className="gap-2" data-testid="link-not-found-help">
              <HelpCircle className="w-4 h-4" aria-hidden="true" />
              Help center
            </Button>
          </Link>
        </div>
      </div>
    </section>
  );
}
