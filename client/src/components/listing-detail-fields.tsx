import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { FormLabel } from "@/components/ui/form";
import { Badge } from "@/components/ui/badge";
import { Plus, X } from "lucide-react";
import { useState } from "react";

export type ItemType =
  | "real_estate"
  | "automotive"
  | "electronics"
  | "fashion"
  | "furniture"
  | "hospitality"
  | "room_rental"
  | "office_space"
  | "services"
  | "brand_collab"
  | "other"
  | "";

export const ITEM_TYPE_LABELS: Record<Exclude<ItemType, "">, string> = {
  hospitality:  "Hotel / Stay",
  room_rental:  "Room for Rent",
  office_space: "Office Space",
  real_estate:  "Real Estate",
  automotive:   "Car / Vehicle",
  electronics:  "Electronics",
  services:     "Professional Service",
  brand_collab: "Brand × Creator",
  fashion:      "Fashion",
  furniture:    "Furniture & Home",
  other:        "Other",
};

const CONDITIONS_GENERAL  = ["Brand New", "Like New", "Good", "Fair", "Damaged"];
const CONDITIONS_PROPERTY = ["Brand New / Off-plan", "Good Condition", "Needs Renovation"];
const CONDITIONS_VEHICLE  = ["Brand New", "Like New", "Good", "Fair", "Needs Repair"];
const CONDITIONS_FASHION  = ["Brand New with Tags", "Brand New without Tags", "Like New", "Good", "Fair"];

type Details = Record<string, string | number | boolean | string[]>;

interface Props {
  itemType: ItemType;
  details: Details;
  onChange: (details: Details) => void;
}

// ─── Shared primitives ────────────────────────────────────────────────────────

function SectionHeading({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="pt-2 pb-1 border-b border-border">
      <p className="text-sm font-bold text-foreground">{title}</p>
      {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
    </div>
  );
}

function Field({ label, hint, children, required }: { label: string; hint?: string; children: React.ReactNode; required?: boolean }) {
  return (
    <div className="space-y-1.5">
      <FormLabel className="text-sm">
        {label}{required && <span className="text-destructive ml-0.5">*</span>}
      </FormLabel>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function TextInput({ label, field, placeholder, details, onChange, type = "text", hint, required }: {
  label: string; field: string; placeholder?: string; details: Details;
  onChange: (d: Details) => void; type?: string; hint?: string; required?: boolean;
}) {
  return (
    <Field label={label} hint={hint} required={required}>
      <Input type={type} placeholder={placeholder} value={(details[field] as string) ?? ""}
        onChange={(e) => onChange({ ...details, [field]: e.target.value })} />
    </Field>
  );
}

function TextareaInput({ label, field, placeholder, details, onChange, hint, rows = 3, required }: {
  label: string; field: string; placeholder?: string; details: Details;
  onChange: (d: Details) => void; hint?: string; rows?: number; required?: boolean;
}) {
  return (
    <Field label={label} hint={hint} required={required}>
      <Textarea rows={rows} placeholder={placeholder} value={(details[field] as string) ?? ""}
        onChange={(e) => onChange({ ...details, [field]: e.target.value })} />
    </Field>
  );
}

function SelectInput({ label, field, options, placeholder, details, onChange, hint, required }: {
  label: string; field: string; options: string[]; placeholder?: string;
  details: Details; onChange: (d: Details) => void; hint?: string; required?: boolean;
}) {
  return (
    <Field label={label} hint={hint} required={required}>
      <Select value={(details[field] as string) ?? ""} onValueChange={(v) => onChange({ ...details, [field]: v })}>
        <SelectTrigger><SelectValue placeholder={placeholder ?? `Select ${label.toLowerCase()}`} /></SelectTrigger>
        <SelectContent>
          {options.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
        </SelectContent>
      </Select>
    </Field>
  );
}

function CheckboxGroup({ label, field, options, details, onChange, hint, columns = 3, required }: {
  label: string; field: string; options: string[]; details: Details;
  onChange: (d: Details) => void; hint?: string; columns?: number; required?: boolean;
}) {
  const current = (details[field] as string[]) ?? [];
  const toggle = (opt: string) => {
    const next = current.includes(opt) ? current.filter((x) => x !== opt) : [...current, opt];
    onChange({ ...details, [field]: next });
  };
  return (
    <Field label={label} hint={hint} required={required}>
      <div className={`grid gap-2 ${columns === 2 ? "grid-cols-2" : columns === 4 ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-2 sm:grid-cols-3"}`}>
        {options.map((opt) => (
          <label key={opt} className="flex items-center gap-2 text-sm cursor-pointer py-0.5">
            <Checkbox checked={current.includes(opt)} onCheckedChange={() => toggle(opt)} />
            {opt}
          </label>
        ))}
      </div>
    </Field>
  );
}

function TagInput({ label, field, placeholder, details, onChange, hint }: {
  label: string; field: string; placeholder?: string; details: Details;
  onChange: (d: Details) => void; hint?: string;
}) {
  const [draft, setDraft] = useState("");
  const current = (details[field] as string[]) ?? [];
  const add = () => {
    const v = draft.trim();
    if (!v || current.includes(v)) return;
    onChange({ ...details, [field]: [...current, v] });
    setDraft("");
  };
  return (
    <Field label={label} hint={hint}>
      <div className="flex gap-2">
        <Input placeholder={placeholder} value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); add(); } }} />
        <button type="button" onClick={add}
          className="px-3 py-2 rounded-md border border-border bg-muted hover:bg-muted/80 transition-colors flex-shrink-0">
          <Plus className="h-4 w-4" />
        </button>
      </div>
      {current.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-2">
          {current.map(t => (
            <Badge key={t} variant="secondary" className="gap-1 pr-1">
              {t}
              <button type="button" onClick={() => onChange({ ...details, [field]: current.filter(x => x !== t) })}>
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
    </Field>
  );
}

// ─── Hospitality — Hotels, Resorts, Spas, Staycations ────────────────────────
function HospitalityFields({ details, onChange }: { details: Details; onChange: (d: Details) => void }) {
  return (
    <>
      <SectionHeading title="Property Details" subtitle="Tell us about the accommodation you're offering." />

      <SelectInput label="Property Type" field="propertyType" required details={details} onChange={onChange}
        options={["Hotel", "Resort", "Boutique Hotel", "Spa & Wellness Retreat", "Desert Camp", "Beach Club", "Holiday Home / Villa", "Yacht / Boat Stay", "Other"]} />

      <div className="grid grid-cols-2 gap-4">
        <TextInput label="Hotel / Property Name" field="propertyName" required placeholder="e.g. JW Marriott Marquis Dubai" details={details} onChange={onChange} />
        <SelectInput label="Star Rating" field="starRating" details={details} onChange={onChange}
          options={["5 Star", "4 Star", "3 Star", "2 Star", "Unrated / Boutique"]} />
      </div>

      <SectionHeading title="Room / Package Offering" />

      <SelectInput label="Room / Package Type" field="roomType" required details={details} onChange={onChange}
        options={["Standard Room", "Superior Room", "Deluxe Room", "Executive Room", "Junior Suite", "Suite", "Grand Suite", "Presidential Suite", "Family Room", "Connecting Rooms", "Pool Villa", "Beach Villa", "Penthouse"]} />

      <div className="grid grid-cols-2 gap-4">
        <TextInput label="Number of Nights" field="nights" type="number" required placeholder="e.g. 2" details={details} onChange={onChange} />
        <TextInput label="Number of Rooms" field="rooms" type="number" placeholder="e.g. 1" details={details} onChange={onChange} />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <SelectInput label="Bed Configuration" field="bedConfig" details={details} onChange={onChange}
          options={["King Bed", "Queen Bed", "Twin Beds", "Double Bed", "Bunk Beds", "Flexible (King or Twin)"]} />
        <SelectInput label="Max Occupancy" field="maxOccupancy" details={details} onChange={onChange}
          options={["1 Guest", "2 Guests", "3 Guests", "4 Guests", "5+ Guests"]} />
      </div>

      <SectionHeading title="Availability" subtitle="When can guests check in?" />

      <div className="grid grid-cols-2 gap-4">
        <TextInput label="Available Check-in From" field="checkinFrom" type="date" required details={details} onChange={onChange}
          hint="Earliest date guests can arrive" />
        <TextInput label="Available Check-in Until" field="checkinUntil" type="date" required details={details} onChange={onChange}
          hint="Last date for check-in" />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <SelectInput label="Advance Notice Required" field="advanceNotice" details={details} onChange={onChange}
          options={["Same day", "1 day", "2 days", "3 days", "1 week", "2 weeks"]} />
        <SelectInput label="Minimum Stay" field="minStay" details={details} onChange={onChange}
          options={["1 night", "2 nights", "3 nights", "4 nights", "5 nights", "1 week", "Flexible"]} />
      </div>

      <SectionHeading title="Inclusions" />

      <SelectInput label="Meal Plan" field="mealPlan" details={details} onChange={onChange}
        options={["Room Only", "Breakfast Included", "Half Board (B&D)", "Full Board (B,L,D)", "All Inclusive", "Custom — specify below"]} />

      <CheckboxGroup label="Property Amenities" field="amenities" details={details} onChange={onChange}
        options={["Swimming Pool", "Private Pool", "Gym / Fitness Centre", "Spa & Massage", "Sauna / Steam Room", "Private Beach", "Water Sports", "Kids Club", "Concierge 24/7", "Butler Service", "Airport Transfer", "Valet Parking", "Free Parking", "Restaurant On-site", "Bar / Lounge", "Room Service 24/7", "High-speed WiFi", "Jacuzzi", "Tennis Court", "Golf Access"]} />

      <CheckboxGroup label="Room Features" field="roomFeatures" details={details} onChange={onChange}
        options={["Sea View", "City View", "Garden View", "Pool View", "Private Balcony / Terrace", "Kitchenette", "Living Area", "Bathtub", "Rain Shower", "Smart TV", "Mini Bar", "Nespresso Machine", "Safe", "Blackout Curtains"]} />

      <SectionHeading title="Cancellation & Policy" />

      <SelectInput label="Cancellation Policy" field="cancellationPolicy" details={details} onChange={onChange}
        options={["Free cancellation (48h notice)", "Free cancellation (72h notice)", "Free cancellation (1 week notice)", "Non-refundable", "Custom — specify below"]} />

      <TextareaInput label="Special Terms / Exclusions" field="specialTerms" placeholder="e.g. Valid for UAE residents only. Not valid on public holidays. Subject to availability." details={details} onChange={onChange}
        hint="Blackout dates, restrictions, extras not included" rows={2} />

      <SectionHeading title="Content Deliverables Wanted" subtitle="What should the creator/guest deliver in exchange?" />

      <CheckboxGroup label="Content Platforms" field="contentPlatforms" details={details} onChange={onChange} columns={2}
        options={["Instagram", "TikTok", "YouTube", "X / Twitter", "Snapchat", "LinkedIn", "Blog / Website"]} />

      <CheckboxGroup label="Content Types Required" field="contentTypes" details={details} onChange={onChange} columns={2}
        options={["Instagram Reel", "TikTok Video", "Instagram Stories (×5)", "YouTube Video (5+ min)", "YouTube Short", "Static Post", "Blog Article", "Podcast Mention", "Live Stream"]} />

      <div className="grid grid-cols-2 gap-4">
        <TextInput label="Minimum Follower Count" field="minFollowers" type="number" placeholder="e.g. 10000" details={details} onChange={onChange} />
        <SelectInput label="Creator Niche" field="creatorNiche" details={details} onChange={onChange}
          options={["Travel", "Lifestyle", "Food & Dining", "Luxury", "Fashion & Beauty", "Family / Parenting", "Fitness & Wellness", "Photography", "Tech", "Any"]} />
      </div>

      <TagInput label="Required Hashtags" field="requiredHashtags" placeholder="Type hashtag then Enter" details={details} onChange={onChange}
        hint="e.g. #JWMarriottDubai #BareterDeal" />

      <TextareaInput label="Key Messages to Include" field="keyMessages" placeholder="e.g. Highlight the rooftop infinity pool, mention the breakfast buffet, tag @HotelHandle in every post" details={details} onChange={onChange} rows={3}
        hint="Be specific — what must the creator say or show?" />

      <SelectInput label="Posting Deadline" field="postingDeadline" details={details} onChange={onChange}
        options={["During the stay", "Within 48 hours of checkout", "Within 1 week", "Within 2 weeks", "Within 1 month", "Flexible"]} />
    </>
  );
}

// ─── Room Rental ──────────────────────────────────────────────────────────────
function RoomRentalFields({ details, onChange }: { details: Details; onChange: (d: Details) => void }) {
  return (
    <>
      <SectionHeading title="Property Details" />

      <SelectInput label="Room / Property Type" field="roomType" required details={details} onChange={onChange}
        options={["Single Room (shared villa/apt)", "Double Room (shared villa/apt)", "Master Bedroom (en-suite)", "Studio Apartment", "1-Bedroom Apartment", "2-Bedroom Apartment", "3-Bedroom Apartment", "Full Villa", "Basement / Maid's Room", "Other"]} />

      <div className="grid grid-cols-2 gap-4">
        <TextInput label="Size (sqft)" field="sizeSqft" type="number" placeholder="e.g. 450" details={details} onChange={onChange} />
        <SelectInput label="Floor" field="floor" details={details} onChange={onChange}
          options={["Ground", "1st", "2nd", "3rd", "4th", "5th", "6–10", "10–20", "20+"]} />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <SelectInput label="Furnishing" field="furnishing" required details={details} onChange={onChange}
          options={["Fully Furnished", "Semi-Furnished", "Unfurnished"]} />
        <SelectInput label="Condition" field="condition" details={details} onChange={onChange} options={CONDITIONS_PROPERTY} />
      </div>

      <SectionHeading title="Availability & Duration" />

      <div className="grid grid-cols-2 gap-4">
        <TextInput label="Available From" field="availableFrom" type="date" required details={details} onChange={onChange} />
        <SelectInput label="Rental Duration" field="rentalDuration" required details={details} onChange={onChange}
          options={["Daily", "Weekly", "Monthly", "Quarterly", "6 Months", "Yearly", "Flexible"]} />
      </div>

      <SectionHeading title="What's Included" />

      <CheckboxGroup label="Utilities Included" field="utilitiesIncluded" details={details} onChange={onChange} columns={2}
        options={["DEWA (Electricity & Water)", "District Cooling (Chiller)", "High-speed WiFi", "Cable / Satellite TV", "Gas"]} />

      <CheckboxGroup label="Amenities & Features" field="amenities" details={details} onChange={onChange}
        options={["Air Conditioning", "Shared Kitchen Access", "Private Kitchen", "Washing Machine", "Parking Space", "Pool Access", "Gym Access", "Balcony", "Rooftop Access", "24/7 Security", "CCTV", "Building Concierge", "Storage Room", "Pet-Friendly"]} />

      <SectionHeading title="House Rules" />

      <CheckboxGroup label="Rules & Restrictions" field="rules" details={details} onChange={onChange} columns={2}
        options={["No Smoking", "No Pets", "No Parties / Events", "Couples Only", "Females Only", "Males Only", "No Overnight Guests", "Quiet Hours (10pm–8am)"]} />

      <div className="grid grid-cols-2 gap-4">
        <SelectInput label="Tenant Preference" field="tenantPreference" details={details} onChange={onChange}
          options={["Any", "Single Professional", "Couple", "Family", "Students Welcome", "Executives"]} />
        <SelectInput label="Nationality Preference" field="nationalityPref" details={details} onChange={onChange}
          options={["Any Nationality", "UAE Nationals Only", "Arab Nationals", "Expats Welcome", "No Preference"]} />
      </div>

      <TextareaInput label="Additional Notes" field="additionalNotes" placeholder="e.g. Quiet building, no parties. DEWA split equally between all tenants." details={details} onChange={onChange} rows={2} />
    </>
  );
}

// ─── Office Space ─────────────────────────────────────────────────────────────
function OfficeSpaceFields({ details, onChange }: { details: Details; onChange: (d: Details) => void }) {
  return (
    <>
      <SectionHeading title="Space Details" />

      <SelectInput label="Space Type" field="spaceType" required details={details} onChange={onChange}
        options={["Private Office", "Co-working Desk (Hot Desk)", "Dedicated Desk", "Meeting Room", "Conference Room", "Training Room", "Retail Unit", "Showroom", "Warehouse", "Light Industrial Unit", "Photography / Film Studio", "Recording Studio", "Creative Studio", "Full Floor", "Other"]} />

      <div className="grid grid-cols-2 gap-4">
        <TextInput label="Building / Complex Name" field="buildingName" required placeholder="e.g. DIFC Gate Avenue" details={details} onChange={onChange} />
        <SelectInput label="Building Grade" field="buildingGrade" details={details} onChange={onChange}
          options={["Grade A (Premium)", "Grade B", "Grade C", "Freezone Building", "Villa / Converted Office"]} />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <TextInput label="Size (sqft)" field="sizeSqft" type="number" required placeholder="e.g. 800" details={details} onChange={onChange} />
        <SelectInput label="Capacity (Persons)" field="capacity" details={details} onChange={onChange}
          options={["1", "2", "3–5", "6–10", "11–20", "21–50", "51–100", "100+"]} />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <SelectInput label="Floor Level" field="floor" details={details} onChange={onChange}
          options={["Ground Floor", "1st Floor", "2nd Floor", "3rd–5th", "6th–10th", "11th–20th", "Above 20th"]} />
        <SelectInput label="Fit-out Status" field="fitout" required details={details} onChange={onChange}
          options={["Fully Fitted (plug & play)", "Shell & Core", "Semi-fitted", "Cat A Fit-out", "Cat B Fit-out"]} />
      </div>

      <SectionHeading title="Availability" />

      <div className="grid grid-cols-2 gap-4">
        <TextInput label="Available From" field="availableFrom" type="date" required details={details} onChange={onChange} />
        <TextInput label="Available Until" field="availableUntil" type="date" details={details} onChange={onChange}
          hint="Leave blank if open-ended" />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <SelectInput label="Minimum Rental Period" field="minRental" required details={details} onChange={onChange}
          options={["1 Day", "1 Week", "1 Month", "3 Months", "6 Months", "1 Year", "Flexible"]} />
        <SelectInput label="Freezone / Mainland" field="freezoneMaindland" details={details} onChange={onChange}
          options={["Dubai Mainland", "Abu Dhabi Mainland", "Sharjah Mainland", "DIFC", "DMCC", "Dubai Silicon Oasis", "Dubai Media City", "Dubai Internet City", "JAFZA", "Khalifa Industrial Zone", "Other Freezone"]} />
      </div>

      <SectionHeading title="Facilities Included" />

      <CheckboxGroup label="Office Amenities" field="amenities" details={details} onChange={onChange}
        options={["High-speed WiFi", "Dedicated Internet Line", "Reception Service", "Mail Handling", "Printing / Scanning", "Pantry / Kitchen", "Meeting Room Access", "Conference Room Access", "Video Conferencing Setup", "Visitor Parking", "Covered Parking", "CCTV & Access Control", "24/7 Building Access", "Generator Backup", "Cleaning Service", "Air Conditioning", "Server Room Access"]} />

      <TextareaInput label="Additional Notes / Fit-out Details" field="additionalNotes"
        placeholder="e.g. Fully furnished with standing desks. Access to 2 meeting rooms (book via app). Server room on same floor." details={details} onChange={onChange} rows={3} />
    </>
  );
}

// ─── Real Estate ──────────────────────────────────────────────────────────────
function RealEstateFields({ details, onChange }: { details: Details; onChange: (d: Details) => void }) {
  return (
    <>
      <SectionHeading title="Property Details" />
      <SelectInput label="Property Type" field="propertyType" required details={details} onChange={onChange}
        options={["Villa", "Townhouse", "Apartment", "Studio", "Penthouse", "Duplex", "Compound", "Retail Space", "Office Space", "Warehouse", "Land / Plot", "Other"]} />
      <div className="grid grid-cols-2 gap-4">
        <TextInput label="Size (sqft)" field="sizeSqft" type="number" required placeholder="e.g. 2500" details={details} onChange={onChange} />
        <TextInput label="Plot Size (sqft)" field="plotSqft" type="number" placeholder="e.g. 5000 (villas)" details={details} onChange={onChange} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <SelectInput label="Bedrooms" field="bedrooms" required details={details} onChange={onChange}
          options={["Studio", "1 BR", "2 BR", "3 BR", "4 BR", "5 BR", "6+ BR"]} />
        <SelectInput label="Bathrooms" field="bathrooms" details={details} onChange={onChange}
          options={["1", "2", "3", "4", "5", "6+"]} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <SelectInput label="Furnishing" field="furnishing" details={details} onChange={onChange}
          options={["Fully Furnished", "Semi-Furnished", "Unfurnished"]} />
        <SelectInput label="Condition" field="condition" details={details} onChange={onChange} options={CONDITIONS_PROPERTY} />
      </div>
      <SelectInput label="View" field="view" details={details} onChange={onChange}
        options={["Sea View", "Full Sea View", "Burj Khalifa View", "City Skyline", "Golf Course View", "Garden / Park View", "Pool View", "Community View", "Street View"]} />
      <TextInput label="Building / Development Name" field="buildingName" required placeholder="e.g. Emaar Beachfront, The Palm" details={details} onChange={onChange} />
      <SelectInput label="Payment Terms" field="paymentTerms" details={details} onChange={onChange}
        options={["Cash Buyer Only", "Mortgage Accepted", "Developer Payment Plan", "Instalment Plan (specify)", "Flexible"]} />
      <SectionHeading title="Amenities & Features" />
      <CheckboxGroup label="Building / Community Amenities" field="amenities" details={details} onChange={onChange}
        options={["Swimming Pool", "Kids Pool", "Gym / Fitness Centre", "Sauna / Steam Room", "BBQ Area", "Children's Play Area", "Covered Parking", "Visitor Parking", "Concierge 24/7", "Security 24/7", "CCTV", "Tennis Court", "Squash Court", "Jogging Track", "Retail Outlets", "Metro Access", "Pet-Friendly"]} />
      <CheckboxGroup label="Unit Features" field="unitFeatures" details={details} onChange={onChange}
        options={["Maid's Room", "Driver's Room", "Storage Room", "Private Garden", "Private Pool", "Rooftop Access", "Study Room", "Smart Home", "Central A/C", "Central Vacuum", "Laundry Room"]} />
    </>
  );
}

// ─── Automotive ───────────────────────────────────────────────────────────────
function AutomotiveFields({ details, onChange }: { details: Details; onChange: (d: Details) => void }) {
  return (
    <>
      <SectionHeading title="Vehicle Details" />
      <SelectInput label="Vehicle Type" field="vehicleType" required details={details} onChange={onChange}
        options={["Sedan", "SUV", "Pickup Truck", "Sports Car", "Luxury Car", "Van / Minivan", "Coupe", "Convertible", "Crossover", "Motorcycle", "Boat", "Yacht", "Jet Ski", "Golf Cart", "Other"]} />
      <div className="grid grid-cols-2 gap-4">
        <TextInput label="Make / Brand" field="make" required placeholder="e.g. Toyota, Rolls Royce" details={details} onChange={onChange} />
        <TextInput label="Model" field="model" required placeholder="e.g. Land Cruiser, Ghost" details={details} onChange={onChange} />
      </div>
      <div className="grid grid-cols-3 gap-4">
        <TextInput label="Year" field="year" type="number" required placeholder="e.g. 2023" details={details} onChange={onChange} />
        <TextInput label="Mileage (km)" field="mileageKm" type="number" placeholder="e.g. 25000" details={details} onChange={onChange} />
        <TextInput label="Cylinder / Engine cc" field="engine" placeholder="e.g. V8, 2.0L" details={details} onChange={onChange} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <SelectInput label="Fuel Type" field="fuelType" required details={details} onChange={onChange}
          options={["Petrol", "Diesel", "Electric (EV)", "Hybrid", "Plug-in Hybrid (PHEV)", "Other"]} />
        <SelectInput label="Transmission" field="transmission" details={details} onChange={onChange}
          options={["Automatic", "Manual", "Semi-Automatic / Tiptronic"]} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <TextInput label="Exterior Colour" field="color" required placeholder="e.g. Midnight Blue Pearl" details={details} onChange={onChange} />
        <TextInput label="Interior Colour" field="interiorColor" placeholder="e.g. Cream Nappa Leather" details={details} onChange={onChange} />
      </div>
      <SelectInput label="Condition" field="condition" required details={details} onChange={onChange} options={CONDITIONS_VEHICLE} />
      <div className="grid grid-cols-2 gap-4">
        <SelectInput label="Number of Doors" field="doors" details={details} onChange={onChange} options={["2", "3", "4", "5"]} />
        <SelectInput label="Regional Specs" field="specs" details={details} onChange={onChange}
          options={["GCC Specs", "American Specs", "European Specs", "Japanese Specs", "Korean Specs", "Other"]} />
      </div>
      <SectionHeading title="Service & History" />
      <div className="grid grid-cols-2 gap-4">
        <SelectInput label="Service History" field="serviceHistory" details={details} onChange={onChange}
          options={["Full Agency Service History", "Partial Service History", "No Service History", "Not Applicable"]} />
        <SelectInput label="Warranty Remaining" field="warranty" details={details} onChange={onChange}
          options={["No Warranty", "Under 6 Months", "6–12 Months", "1–2 Years", "2+ Years", "Transferable Warranty"]} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <SelectInput label="GCC Registered" field="gccRegistered" details={details} onChange={onChange}
          options={["Yes — UAE Registered", "Yes — GCC (Other)", "No — Import", "Not Applicable"]} />
        <SelectInput label="Accidents / Damage" field="accidents" details={details} onChange={onChange}
          options={["No accidents — clean", "Minor dent/scratch only", "Previously repaired", "Accident history — disclosed"]} />
      </div>
      <CheckboxGroup label="Features & Extras" field="features" details={details} onChange={onChange}
        options={["Full Option", "Panoramic Roof / Sunroof", "Leather Seats", "Heated / Cooled Seats", "Massage Seats", "Head-Up Display", "360° Camera", "Blind Spot Monitor", "Lane Keep Assist", "Adaptive Cruise Control", "Night Vision", "Premium Sound System", "Apple CarPlay / Android Auto", "Remote Start", "Keyless Entry"]} />
      <TextareaInput label="Additional Notes" field="additionalNotes"
        placeholder="e.g. Single owner, no accidents, full specs list available, spare tyre included, RTA inspection passed." details={details} onChange={onChange} rows={2} />
    </>
  );
}

// ─── Electronics ─────────────────────────────────────────────────────────────
function ElectronicsFields({ details, onChange }: { details: Details; onChange: (d: Details) => void }) {
  return (
    <>
      <SelectInput label="Device Type" field="deviceType" required details={details} onChange={onChange}
        options={["Smartphone", "Laptop / MacBook", "Tablet / iPad", "Smart Watch", "Camera / DSLR / Mirrorless", "Drone", "Gaming Console", "TV / Display", "Smart Speaker", "Headphones / AirPods", "SaaS / Software Licence", "Other"]} />
      <div className="grid grid-cols-2 gap-4">
        <TextInput label="Brand" field="brand" required placeholder="e.g. Apple, Samsung" details={details} onChange={onChange} />
        <TextInput label="Model" field="model" required placeholder="e.g. iPhone 15 Pro Max" details={details} onChange={onChange} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <TextInput label="Storage / Capacity" field="storage" placeholder="e.g. 256GB, 1TB" details={details} onChange={onChange} />
        <TextInput label="RAM" field="ram" placeholder="e.g. 16GB (laptops)" details={details} onChange={onChange} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <TextInput label="Colour" field="color" required placeholder="e.g. Space Black" details={details} onChange={onChange} />
        <SelectInput label="Region / Network Lock" field="region" details={details} onChange={onChange}
          options={["GCC / International", "USA Model", "UK Model", "Unlocked (any SIM)", "Locked to carrier"]} />
      </div>
      <SelectInput label="Condition" field="condition" required details={details} onChange={onChange} options={CONDITIONS_GENERAL} />
      <div className="grid grid-cols-2 gap-4">
        <SelectInput label="Warranty Remaining" field="warranty" details={details} onChange={onChange}
          options={["No Warranty", "Under 3 Months", "3–6 Months", "6–12 Months", "1+ Year", "AppleCare / Extended"]} />
        <TextInput label="Battery Health %" field="batteryHealth" type="number" placeholder="e.g. 94 (iPhones)" details={details} onChange={onChange} />
      </div>
      <TextInput label="Accessories Included" field="accessories" placeholder="e.g. Original box, charger, case, screen protector" details={details} onChange={onChange} />
    </>
  );
}

// ─── Professional Services (Fiverr-style) ────────────────────────────────────
function ServicesFields({ details, onChange }: { details: Details; onChange: (d: Details) => void }) {
  return (
    <>
      <SectionHeading title="Service Overview" subtitle="Describe your service like a Fiverr gig — be specific." />

      <SelectInput label="Service Category" field="serviceCategory" required details={details} onChange={onChange}
        options={["Legal Services", "Marketing & Advertising", "Graphic Design", "Web Design & Development", "App Development", "Photography", "Videography & Film", "Content Writing & Copywriting", "Social Media Management", "Accounting & Finance", "Business Consulting", "IT Support & Networking", "Architecture & Interior Design", "Translation & Interpreting", "Event Planning & Management", "HR & Recruitment", "Public Relations", "Research & Analysis", "Training & Coaching", "Other"]} />

      <TextInput label="Service Title" field="serviceTitle" required placeholder="e.g. Professional Brand Identity & Logo Design Package" details={details} onChange={onChange}
        hint="Be specific — this is your gig headline" />

      <SectionHeading title="What's Included" subtitle="List exactly what the client receives." />

      <TagInput label="Deliverables (add one per line)" field="deliverables" placeholder="e.g. 3 logo concepts" details={details} onChange={onChange}
        hint="Press Enter after each item. Be specific (e.g. '5-page website', '30-second ad video', 'monthly report')" />

      <SectionHeading title="Scope & Timelines" />

      <div className="grid grid-cols-2 gap-4">
        <SelectInput label="Delivery Timeline" field="deliveryTimeline" required details={details} onChange={onChange}
          options={["Same day", "1–2 days", "3–5 days", "1 week", "2 weeks", "3 weeks", "1 month", "2 months", "3+ months", "Ongoing / Retainer"]} />
        <SelectInput label="Number of Revisions" field="revisions" details={details} onChange={onChange}
          options={["1 revision", "2 revisions", "3 revisions", "5 revisions", "Unlimited revisions", "No revisions"]} />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <SelectInput label="Experience Level" field="experienceLevel" details={details} onChange={onChange}
          options={["Entry-level", "Intermediate", "Expert", "Agency-grade"]} />
        <SelectInput label="Languages" field="languages" details={details} onChange={onChange}
          options={["English", "Arabic", "English & Arabic", "French", "Russian", "Hindi", "Urdu", "Tagalog / Filipino", "Multiple — specify below"]} />
      </div>

      <SectionHeading title="Packages (optional)" subtitle="Define Basic, Standard, and Premium tiers if applicable." />

      <TextareaInput label="Basic Package" field="packageBasic"
        placeholder="e.g. 1 logo concept, 1 revision, JPEG only — AED 500 value" details={details} onChange={onChange} rows={2} />
      <TextareaInput label="Standard Package" field="packageStandard"
        placeholder="e.g. 3 logo concepts, 3 revisions, all file formats — AED 1,200 value" details={details} onChange={onChange} rows={2} />
      <TextareaInput label="Premium Package" field="packagePremium"
        placeholder="e.g. Full brand kit: logo + business cards + letterhead + social templates, unlimited revisions — AED 3,500 value" details={details} onChange={onChange} rows={2} />

      <SectionHeading title="Requirements from Client" subtitle="What do you need from the other party to start?" />

      <TagInput label="What you need to begin" field="requirements" placeholder="e.g. Brand brief document" details={details} onChange={onChange}
        hint="List each requirement as a separate item" />

      <CheckboxGroup label="Tools & Platforms You Use" field="tools" details={details} onChange={onChange}
        options={["Adobe Creative Suite", "Figma", "Canva Pro", "WordPress", "Webflow", "Shopify", "React / Next.js", "Google Workspace", "Microsoft 365", "Xero / QuickBooks", "Salesforce", "HubSpot", "Meta Ads Manager", "Google Ads", "Final Cut Pro", "Adobe Premiere"]} />

      <TextareaInput label="Portfolio / Previous Work" field="portfolio"
        placeholder="e.g. Paste links to your portfolio, Behance, LinkedIn, or describe notable past projects." details={details} onChange={onChange} rows={2} />
    </>
  );
}

// ─── Brand × Creator Deals ───────────────────────────────────────────────────
function BrandCollabFields({ details, onChange }: { details: Details; onChange: (d: Details) => void }) {
  return (
    <>
      <SectionHeading title="What Your Brand Is Offering" subtitle="Describe the product, service, or experience creators will receive." />

      <SelectInput label="Offering Category" field="offeringCategory" required details={details} onChange={onChange}
        options={["Physical Product / Gift", "Hotel Stay / Staycation", "Restaurant / F&B Experience", "Spa / Wellness Experience", "Fashion / Clothing", "Beauty / Skincare Products", "Tech / Electronics", "Software / App Access", "Event Tickets / Access", "Travel Package", "Service / Subscription", "Cash-equivalent Gift Card", "Other"]} />

      <TextInput label="Product / Offering Name" field="offeringName" required placeholder="e.g. Luxury Staycation for 2 — JW Marriott Dubai" details={details} onChange={onChange} />

      <TextareaInput label="Offering Description" field="offeringDescription" required
        placeholder="e.g. 2-night stay in a Superior Room with breakfast included, access to the infinity pool and gym, and a AED 300 spa credit. Room rate value: AED 2,800." details={details} onChange={onChange} rows={3}
        hint="Be detailed — creators need to understand exactly what they're receiving" />

      <div className="grid grid-cols-2 gap-4">
        <TextInput label="Retail / Market Value (AED)" field="retailValue" type="number" required placeholder="e.g. 2800" details={details} onChange={onChange} />
        <SelectInput label="Number of Spots Available" field="spotsAvailable" details={details} onChange={onChange}
          options={["1 creator", "2 creators", "3 creators", "5 creators", "10 creators", "Ongoing / Multiple"]} />
      </div>

      <SectionHeading title="Content Deliverables Required" subtitle="Be as specific as a production brief." />

      <CheckboxGroup label="Required Platforms" field="platforms" required details={details} onChange={onChange} columns={2}
        options={["Instagram", "TikTok", "YouTube", "YouTube Shorts", "Snapchat", "X / Twitter", "LinkedIn", "Blog / Website", "Podcast"]} />

      <div className="grid grid-cols-2 gap-4">
        <CheckboxGroup label="Content Formats" field="contentFormats" details={details} onChange={onChange} columns={2}
          options={["Reel (30–90 sec)", "TikTok Video (15–60 sec)", "YouTube Video (5+ min)", "YouTube Short", "Instagram Stories (series)", "Static Post / Carousel", "Blog Article (800+ words)", "Podcast Mention / Ad Read"]} />
        <div className="space-y-4">
          <TextInput label="Total Content Pieces Required" field="contentCount" type="number" placeholder="e.g. 3" details={details} onChange={onChange} />
          <SelectInput label="Posting Deadline" field="postingDeadline" details={details} onChange={onChange}
            options={["During / same day", "Within 48 hours", "Within 1 week", "Within 2 weeks", "Within 1 month", "Flexible"]} />
        </div>
      </div>

      <SectionHeading title="Creator Requirements" />

      <div className="grid grid-cols-2 gap-4">
        <TextInput label="Minimum Followers" field="minFollowers" type="number" required placeholder="e.g. 10000" details={details} onChange={onChange} />
        <SelectInput label="Minimum Engagement Rate" field="minEngagement" details={details} onChange={onChange}
          options={["Any", "1%+", "2%+", "3%+", "5%+", "7%+"]} />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <SelectInput label="Creator Niche" field="creatorNiche" details={details} onChange={onChange}
          options={["Any niche", "Travel & Lifestyle", "Food & Dining", "Luxury & Fashion", "Beauty & Skincare", "Fitness & Health", "Family & Parenting", "Tech & Gadgets", "Business & Finance", "Art & Photography", "Comedy / Entertainment"]} />
        <SelectInput label="Creator Location" field="creatorLocation" details={details} onChange={onChange}
          options={["UAE-based only", "GCC-based", "Arab World", "Any location", "Open to discussion"]} />
      </div>

      <SectionHeading title="Brand Guidelines & Messaging" />

      <TagInput label="Required Hashtags" field="requiredHashtags" placeholder="Type hashtag then Enter" details={details} onChange={onChange}
        hint="e.g. #YourBrand #BareterDeal" />

      <TagInput label="Required Tags / Mentions" field="requiredMentions" placeholder="e.g. @YourBrandHandle" details={details} onChange={onChange} />

      <TextareaInput label="Key Messages to Communicate" field="keyMessages" required
        placeholder="e.g. Emphasise the rooftop pool. Show the breakfast spread. Highlight that this is a 5-star experience. Must include 'book via Bareter' in caption." details={details} onChange={onChange} rows={3}
        hint="What must the creator say, show, or avoid?" />

      <TextareaInput label="Tone & Style" field="toneStyle"
        placeholder="e.g. Aspirational and luxurious. Avoid overly salesy language. Authentic lifestyle shots preferred over studio-style." details={details} onChange={onChange} rows={2} />

      <SelectInput label="Content Usage Rights" field="usageRights" details={details} onChange={onChange}
        options={["Creator retains rights (organic posts only)", "Brand may repost on social media", "Brand may use in paid ads (6 months)", "Brand may use in paid ads (1 year)", "Full perpetual licence", "Custom — specify below"]} />
    </>
  );
}

// ─── Fashion ──────────────────────────────────────────────────────────────────
function FashionFields({ details, onChange }: { details: Details; onChange: (d: Details) => void }) {
  return (
    <>
      <SelectInput label="Item Category" field="fashionCategory" required details={details} onChange={onChange}
        options={["Clothing", "Shoes / Sneakers", "Bag / Handbag", "Luxury Watch", "Jewelry", "Belt / Wallet", "Sunglasses", "Accessories", "Perfume / Fragrance", "Other"]} />
      <div className="grid grid-cols-2 gap-4">
        <TextInput label="Brand" field="brand" required placeholder="e.g. Gucci, Nike, Zara" details={details} onChange={onChange} />
        <TextInput label="Size" field="size" placeholder="e.g. M, EU42, UK8" details={details} onChange={onChange} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <TextInput label="Colour" field="color" required placeholder="e.g. Midnight Black" details={details} onChange={onChange} />
        <SelectInput label="Gender" field="gender" details={details} onChange={onChange}
          options={["Men", "Women", "Unisex", "Kids"]} />
      </div>
      <SelectInput label="Condition" field="condition" required details={details} onChange={onChange} options={CONDITIONS_FASHION} />
      <TextInput label="Material / Fabric" field="material" placeholder="e.g. 100% Cotton, Genuine Leather, Cashmere" details={details} onChange={onChange} />
      <CheckboxGroup label="Comes With" field="includes" details={details} onChange={onChange} columns={2}
        options={["Original Box", "Dust Bag", "Authenticity Card", "Receipt", "Tags Attached", "Extra Straps", "Protective Case"]} />
    </>
  );
}

// ─── Furniture & Home ────────────────────────────────────────────────────────
function FurnitureFields({ details, onChange }: { details: Details; onChange: (d: Details) => void }) {
  return (
    <>
      <SelectInput label="Item Type" field="furnitureType" required details={details} onChange={onChange}
        options={["Sofa / Sectional", "Bed Frame", "Mattress", "Dining Table & Chairs", "Wardrobe", "Desk", "Office Chair", "Appliance", "Kitchen Item", "Lighting", "Artwork / Decor", "Outdoor Furniture", "Other"]} />
      <div className="grid grid-cols-2 gap-4">
        <TextInput label="Brand" field="brand" placeholder="e.g. IKEA, NOVO, Natuzzi" details={details} onChange={onChange} />
        <TextInput label="Colour / Finish" field="color" placeholder="e.g. Oak Wood, Grey Fabric" details={details} onChange={onChange} />
      </div>
      <TextInput label="Dimensions (L × W × H cm)" field="dimensions" placeholder="e.g. 220 × 95 × 85 cm" details={details} onChange={onChange} />
      <SelectInput label="Material" field="material" details={details} onChange={onChange}
        options={["Wood", "Metal", "Fabric / Upholstery", "Leather", "Glass", "Plastic", "Marble", "Rattan / Wicker", "Mixed"]} />
      <SelectInput label="Condition" field="condition" required details={details} onChange={onChange} options={CONDITIONS_GENERAL} />
      <SelectInput label="Assembly Required" field="assembly" details={details} onChange={onChange}
        options={["No — ready to use", "Yes — self-assembly", "Yes — professional assembly needed"]} />
    </>
  );
}

// ─── Other ───────────────────────────────────────────────────────────────────
function OtherFields({ details, onChange }: { details: Details; onChange: (d: Details) => void }) {
  return (
    <>
      <div className="grid grid-cols-2 gap-4">
        <TextInput label="Brand / Manufacturer" field="brand" placeholder="e.g. Sony" details={details} onChange={onChange} />
        <TextInput label="Model / Version" field="model" placeholder="e.g. Alpha 7 IV" details={details} onChange={onChange} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <SelectInput label="Condition" field="condition" details={details} onChange={onChange} options={CONDITIONS_GENERAL} />
        <TextInput label="Colour" field="color" placeholder="e.g. Black" details={details} onChange={onChange} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <TextInput label="Year / Age" field="age" placeholder="e.g. 2023" details={details} onChange={onChange} />
        <TextInput label="Quantity" field="quantity" type="number" placeholder="1" details={details} onChange={onChange} />
      </div>
      <TextareaInput label="Description" field="description" placeholder="Describe your item in detail." details={details} onChange={onChange} rows={3} />
    </>
  );
}

// ─── Main export ─────────────────────────────────────────────────────────────
export function ListingDetailFields({ itemType, details, onChange }: Props) {
  if (!itemType) return null;

  const inner = () => {
    switch (itemType) {
      case "hospitality":  return <HospitalityFields  details={details} onChange={onChange} />;
      case "room_rental":  return <RoomRentalFields    details={details} onChange={onChange} />;
      case "office_space": return <OfficeSpaceFields   details={details} onChange={onChange} />;
      case "real_estate":  return <RealEstateFields    details={details} onChange={onChange} />;
      case "automotive":   return <AutomotiveFields    details={details} onChange={onChange} />;
      case "electronics":  return <ElectronicsFields   details={details} onChange={onChange} />;
      case "services":     return <ServicesFields      details={details} onChange={onChange} />;
      case "brand_collab": return <BrandCollabFields   details={details} onChange={onChange} />;
      case "fashion":      return <FashionFields       details={details} onChange={onChange} />;
      case "furniture":    return <FurnitureFields     details={details} onChange={onChange} />;
      default:             return <OtherFields         details={details} onChange={onChange} />;
    }
  };

  return <div className="space-y-4">{inner()}</div>;
}
