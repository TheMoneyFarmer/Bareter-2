import { useMemo, useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { COUNTRIES, getCitiesForCountry, getCountryByCode } from "@shared/schema";
import { Globe, MapPin, Search } from "lucide-react";
import { Switch } from "@/components/ui/switch";

interface LocationPickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialCountry?: string | null;
  initialCity?: string | null;
  initialWorldwide?: boolean;
  onSave: (country: string, city: string) => void;
  onWorldwideChange?: (worldwide: boolean) => void;
  title?: string;
  description?: string;
}

export function LocationPicker({
  open,
  onOpenChange,
  initialCountry,
  initialCity,
  initialWorldwide = false,
  onSave,
  onWorldwideChange,
  title = "Choose your location",
  description = "Pick where you want to barter. You can change this any time.",
}: LocationPickerProps) {
  const [country, setCountry] = useState<string>(initialCountry || "AE");
  const [city, setCity] = useState<string>(initialCity || "");
  const [search, setSearch] = useState("");
  const [worldwide, setWorldwide] = useState<boolean>(initialWorldwide);

  useEffect(() => {
    if (open) {
      setCountry(initialCountry || "AE");
      setCity(initialCity || "");
      setSearch("");
      setWorldwide(initialWorldwide);
    }
  }, [open, initialCountry, initialCity, initialWorldwide]);

  const filteredCountries = useMemo(() => {
    if (!search) return COUNTRIES;
    const q = search.toLowerCase();
    return COUNTRIES.filter((c) => c.name.toLowerCase().includes(q) || c.code.toLowerCase().includes(q));
  }, [search]);

  const cities = getCitiesForCountry(country);

  const handleSave = () => {
    if (onWorldwideChange) onWorldwideChange(worldwide);
    if (!worldwide) {
      const finalCity = city || cities[0] || "";
      onSave(country, finalCity);
    }
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" data-testid="dialog-location-picker">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Globe className="h-4 w-4" /> {title}
          </DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="flex items-center justify-between rounded-md border p-3">
            <div className="space-y-0.5">
              <p className="text-sm font-medium">Show worldwide</p>
              <p className="text-xs text-muted-foreground">See barters from every country.</p>
            </div>
            <Switch
              checked={worldwide}
              onCheckedChange={setWorldwide}
              data-testid="switch-worldwide"
            />
          </div>
          <div className={worldwide ? "opacity-50 pointer-events-none" : ""}>
            <Label className="text-xs">Country</Label>
            <div className="relative mt-1">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search country..."
                className="pl-8"
                data-testid="input-search-country"
              />
            </div>
            <ScrollArea className="h-48 mt-2 border rounded-md">
              <div className="p-1">
                {filteredCountries.map((c) => (
                  <button
                    key={c.code}
                    type="button"
                    onClick={() => { setCountry(c.code); setCity(""); }}
                    className={`w-full text-left px-3 py-2 text-sm rounded-md hover-elevate flex items-center justify-between ${country === c.code ? "bg-accent" : ""}`}
                    data-testid={`option-country-${c.code}`}
                  >
                    <span>{c.name}</span>
                    <span className="text-xs text-muted-foreground">{c.code}</span>
                  </button>
                ))}
                {filteredCountries.length === 0 && (
                  <p className="p-3 text-sm text-muted-foreground text-center">No countries match.</p>
                )}
              </div>
            </ScrollArea>
          </div>

          <div>
            <Label className="text-xs flex items-center gap-1">
              <MapPin className="h-3 w-3" /> City in {getCountryByCode(country)?.name}
            </Label>
            <Select value={city || cities[0] || ""} onValueChange={setCity}>
              <SelectTrigger className="mt-1" data-testid="select-city">
                <SelectValue placeholder="Pick a city" />
              </SelectTrigger>
              <SelectContent>
                {cities.map((c) => (
                  <SelectItem key={c} value={c} data-testid={`option-city-${c}`}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} data-testid="button-cancel-location">
            Cancel
          </Button>
          <Button onClick={handleSave} data-testid="button-save-location">
            Save location
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
