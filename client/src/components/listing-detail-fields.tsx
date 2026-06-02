import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { FormLabel } from "@/components/ui/form";
import { Badge } from "@/components/ui/badge";
import { Plus, X } from "lucide-react";
import { useState } from "react";

export type ItemType =
  | "hospitality" | "room_rental" | "office_space" | "real_estate"
  | "automotive"  | "yachts_boats" | "electronics" | "gaming"
  | "fashion"     | "jewelry_watches" | "beauty_wellness"
  | "food_dining" | "sports_fitness" | "home_appliances"
  | "furniture"   | "garden_outdoor" | "tools_equipment"
  | "pets_animals" | "books_media"   | "musical_instruments"
  | "art_collectibles" | "luggage_travel" | "services"
  | "brand_collab" | "other" | "";

export const ITEM_TYPE_LABELS: Record<Exclude<ItemType, "">, string> = {
  hospitality:         "Hotel / Stay",
  room_rental:         "Room for Rent",
  office_space:        "Office Space",
  real_estate:         "Real Estate",
  automotive:          "Car / Vehicle",
  yachts_boats:        "Yacht / Boat",
  electronics:         "Electronics",
  gaming:              "Gaming",
  fashion:             "Fashion",
  jewelry_watches:     "Jewelry & Watches",
  beauty_wellness:     "Beauty & Wellness",
  food_dining:         "Food & Dining",
  sports_fitness:      "Sports & Fitness",
  home_appliances:     "Home Appliances",
  furniture:           "Furniture & Home",
  garden_outdoor:      "Garden & Outdoor",
  tools_equipment:     "Tools & Equipment",
  pets_animals:        "Pets & Animals",
  books_media:         "Books & Media",
  musical_instruments: "Musical Instruments",
  art_collectibles:    "Art & Collectibles",
  luggage_travel:      "Luggage & Travel",
  services:            "Professional Service",
  brand_collab:        "Brand × Creator",
  other:               "Other",
};

const CONDITIONS_GENERAL  = ["Brand New", "Like New", "Good", "Fair", "Damaged"];
const CONDITIONS_PROPERTY = ["Brand New / Off-plan", "Good Condition", "Needs Renovation"];
const CONDITIONS_VEHICLE  = ["Brand New", "Like New", "Good", "Fair", "Needs Repair"];
const CONDITIONS_FASHION  = ["Brand New with Tags", "Brand New without Tags", "Like New", "Good", "Fair"];
const CONDITIONS_COLLECTIBLE = ["Mint / Unused", "Near Mint", "Very Good", "Good", "Fair", "Poor"];

type Details = Record<string, string | number | boolean | string[]>;
interface Props { itemType: ItemType; details: Details; onChange: (details: Details) => void; }

// ─── Primitives ───────────────────────────────────────────────────────────────
function SH({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="pt-2 pb-1 border-b border-border">
      <p className="text-sm font-bold text-foreground">{title}</p>
      {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  );
}
function F({ label, hint, children, req }: { label: string; hint?: string; children: React.ReactNode; req?: boolean }) {
  return (
    <div className="space-y-1.5">
      <FormLabel className="text-sm">{label}{req && <span className="text-destructive ml-0.5">*</span>}</FormLabel>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
function TI({ label, field, placeholder, details, onChange, type = "text", hint, req }: {
  label: string; field: string; placeholder?: string; details: Details;
  onChange: (d: Details) => void; type?: string; hint?: string; req?: boolean;
}) {
  return <F label={label} hint={hint} req={req}><Input type={type} placeholder={placeholder}
    value={(details[field] as string) ?? ""} onChange={(e) => onChange({ ...details, [field]: e.target.value })} /></F>;
}
function TA({ label, field, placeholder, details, onChange, hint, rows = 3, req }: {
  label: string; field: string; placeholder?: string; details: Details;
  onChange: (d: Details) => void; hint?: string; rows?: number; req?: boolean;
}) {
  return <F label={label} hint={hint} req={req}><Textarea rows={rows} placeholder={placeholder}
    value={(details[field] as string) ?? ""} onChange={(e) => onChange({ ...details, [field]: e.target.value })} /></F>;
}
function SI({ label, field, options, placeholder, details, onChange, hint, req }: {
  label: string; field: string; options: string[]; placeholder?: string;
  details: Details; onChange: (d: Details) => void; hint?: string; req?: boolean;
}) {
  return (
    <F label={label} hint={hint} req={req}>
      <Select value={(details[field] as string) ?? ""} onValueChange={(v) => onChange({ ...details, [field]: v })}>
        <SelectTrigger><SelectValue placeholder={placeholder ?? `Select…`} /></SelectTrigger>
        <SelectContent>{options.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
      </Select>
    </F>
  );
}
function CB({ label, field, options, details, onChange, hint, cols = 3, req }: {
  label: string; field: string; options: string[]; details: Details;
  onChange: (d: Details) => void; hint?: string; cols?: number; req?: boolean;
}) {
  const cur = (details[field] as string[]) ?? [];
  const toggle = (o: string) => onChange({ ...details, [field]: cur.includes(o) ? cur.filter(x => x !== o) : [...cur, o] });
  return (
    <F label={label} hint={hint} req={req}>
      <div className={`grid gap-2 ${cols === 2 ? "grid-cols-2" : cols === 4 ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-2 sm:grid-cols-3"}`}>
        {options.map(o => (
          <label key={o} className="flex items-center gap-2 text-sm cursor-pointer py-0.5">
            <Checkbox checked={cur.includes(o)} onCheckedChange={() => toggle(o)} />{o}
          </label>
        ))}
      </div>
    </F>
  );
}
function Tags({ label, field, placeholder, details, onChange, hint }: {
  label: string; field: string; placeholder?: string; details: Details; onChange: (d: Details) => void; hint?: string;
}) {
  const [draft, setDraft] = useState("");
  const cur = (details[field] as string[]) ?? [];
  const add = () => { const v = draft.trim(); if (!v || cur.includes(v)) return; onChange({ ...details, [field]: [...cur, v] }); setDraft(""); };
  return (
    <F label={label} hint={hint}>
      <div className="flex gap-2">
        <Input placeholder={placeholder} value={draft} onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); add(); } }} />
        <button type="button" onClick={add} className="px-3 py-2 rounded-md border border-border bg-muted hover:bg-muted/80 flex-shrink-0"><Plus className="h-4 w-4" /></button>
      </div>
      {cur.length > 0 && <div className="flex flex-wrap gap-1.5 mt-2">{cur.map(t => (
        <Badge key={t} variant="secondary" className="gap-1 pr-1">{t}
          <button type="button" onClick={() => onChange({ ...details, [field]: cur.filter(x => x !== t) })}><X className="h-3 w-3" /></button>
        </Badge>
      ))}</div>}
    </F>
  );
}

// ─── 01 Hospitality ──────────────────────────────────────────────────────────
function HospitalityFields({ details, onChange }: { details: Details; onChange: (d: Details) => void }) {
  return (<>
    <SH title="Property Details" />
    <SI label="Property Type" field="propertyType" req details={details} onChange={onChange}
      options={["Hotel","Resort","Boutique Hotel","Spa & Wellness Retreat","Desert Camp","Beach Club","Holiday Home / Villa","Yacht / Boat Stay","Other"]} />
    <div className="grid grid-cols-2 gap-4">
      <TI label="Hotel / Property Name" field="propertyName" req placeholder="e.g. JW Marriott Marquis Dubai" details={details} onChange={onChange} />
      <SI label="Star Rating" field="starRating" details={details} onChange={onChange} options={["5 Star","4 Star","3 Star","2 Star","Unrated / Boutique"]} />
    </div>
    <SH title="Room / Package" />
    <SI label="Room Type" field="roomType" req details={details} onChange={onChange}
      options={["Standard Room","Superior Room","Deluxe Room","Executive Room","Junior Suite","Suite","Grand Suite","Presidential Suite","Family Room","Connecting Rooms","Pool Villa","Beach Villa","Penthouse"]} />
    <div className="grid grid-cols-2 gap-4">
      <TI label="Nights" field="nights" type="number" req placeholder="e.g. 2" details={details} onChange={onChange} />
      <TI label="Rooms" field="rooms" type="number" placeholder="e.g. 1" details={details} onChange={onChange} />
    </div>
    <div className="grid grid-cols-2 gap-4">
      <SI label="Bed Config" field="bedConfig" details={details} onChange={onChange} options={["King Bed","Queen Bed","Twin Beds","Double Bed","Flexible (King or Twin)"]} />
      <SI label="Max Occupancy" field="maxOccupancy" details={details} onChange={onChange} options={["1 Guest","2 Guests","3 Guests","4 Guests","5+ Guests"]} />
    </div>
    <SH title="Availability" />
    <div className="grid grid-cols-2 gap-4">
      <TI label="Check-in From" field="checkinFrom" type="date" req details={details} onChange={onChange} hint="Earliest check-in date" />
      <TI label="Check-in Until" field="checkinUntil" type="date" req details={details} onChange={onChange} hint="Last possible check-in" />
    </div>
    <div className="grid grid-cols-2 gap-4">
      <SI label="Advance Notice" field="advanceNotice" details={details} onChange={onChange} options={["Same day","1 day","2 days","3 days","1 week","2 weeks"]} />
      <SI label="Min Stay" field="minStay" details={details} onChange={onChange} options={["1 night","2 nights","3 nights","1 week","Flexible"]} />
    </div>
    <SH title="Inclusions" />
    <SI label="Meal Plan" field="mealPlan" details={details} onChange={onChange} options={["Room Only","Breakfast Included","Half Board","Full Board","All Inclusive"]} />
    <CB label="Property Amenities" field="amenities" details={details} onChange={onChange}
      options={["Swimming Pool","Private Pool","Gym","Spa & Massage","Sauna","Private Beach","Water Sports","Kids Club","Concierge 24/7","Butler Service","Airport Transfer","Valet Parking","Free Parking","Restaurant","Bar / Lounge","Room Service 24/7","WiFi","Jacuzzi","Tennis Court","Golf Access"]} />
    <CB label="Room Features" field="roomFeatures" details={details} onChange={onChange}
      options={["Sea View","City View","Garden View","Pool View","Private Balcony","Kitchenette","Living Area","Bathtub","Rain Shower","Smart TV","Mini Bar","Nespresso","Safe","Blackout Curtains"]} />
    <SI label="Cancellation Policy" field="cancellationPolicy" details={details} onChange={onChange}
      options={["Free cancellation (48h)","Free cancellation (72h)","Free cancellation (1 week)","Non-refundable"]} />
    <TA label="Special Terms / Blackout Dates" field="specialTerms" placeholder="e.g. Not valid on public holidays. UAE residents only." details={details} onChange={onChange} rows={2} />
    <SH title="Content Deliverables Wanted" sub="What must the creator deliver in return?" />
    <CB label="Platforms" field="contentPlatforms" details={details} onChange={onChange} cols={2}
      options={["Instagram","TikTok","YouTube","X / Twitter","Snapchat","LinkedIn","Blog"]} />
    <CB label="Content Types" field="contentTypes" details={details} onChange={onChange} cols={2}
      options={["Instagram Reel","TikTok Video","Stories (×5)","YouTube Video","YouTube Short","Static Post","Blog Article","Live Stream"]} />
    <div className="grid grid-cols-2 gap-4">
      <TI label="Min Followers" field="minFollowers" type="number" placeholder="e.g. 10000" details={details} onChange={onChange} />
      <SI label="Creator Niche" field="creatorNiche" details={details} onChange={onChange}
        options={["Travel","Lifestyle","Food","Luxury","Fashion & Beauty","Family","Fitness","Photography","Any"]} />
    </div>
    <Tags label="Required Hashtags" field="requiredHashtags" placeholder="Type tag + Enter" details={details} onChange={onChange} />
    <TA label="Key Messages to Include" field="keyMessages" placeholder="e.g. Highlight rooftop pool, tag @HotelHandle in every post" details={details} onChange={onChange} rows={2} />
    <SI label="Posting Deadline" field="postingDeadline" details={details} onChange={onChange}
      options={["During stay","Within 48h of checkout","Within 1 week","Within 2 weeks","Within 1 month","Flexible"]} />
  </>);
}

// ─── 02 Room Rental ──────────────────────────────────────────────────────────
function RoomRentalFields({ details, onChange }: { details: Details; onChange: (d: Details) => void }) {
  return (<>
    <SH title="Property Details" />
    <SI label="Room / Property Type" field="roomType" req details={details} onChange={onChange}
      options={["Single Room (shared)","Double Room (shared)","Master Bedroom (en-suite)","Studio Apartment","1-Bedroom Apartment","2-Bedroom Apartment","3-Bedroom Apartment","Full Villa","Maid's Room / Basement","Other"]} />
    <div className="grid grid-cols-2 gap-4">
      <TI label="Size (sqft)" field="sizeSqft" type="number" placeholder="e.g. 450" details={details} onChange={onChange} />
      <SI label="Floor" field="floor" details={details} onChange={onChange} options={["Ground","1st","2nd","3rd","4th","5th","6–10","10–20","20+"]} />
    </div>
    <div className="grid grid-cols-2 gap-4">
      <SI label="Furnishing" field="furnishing" req details={details} onChange={onChange} options={["Fully Furnished","Semi-Furnished","Unfurnished"]} />
      <SI label="Condition" field="condition" details={details} onChange={onChange} options={CONDITIONS_PROPERTY} />
    </div>
    <SH title="Availability & Duration" />
    <div className="grid grid-cols-2 gap-4">
      <TI label="Available From" field="availableFrom" type="date" req details={details} onChange={onChange} />
      <SI label="Rental Duration" field="rentalDuration" req details={details} onChange={onChange}
        options={["Daily","Weekly","Monthly","Quarterly","6 Months","Yearly","Flexible"]} />
    </div>
    <CB label="Utilities Included" field="utilitiesIncluded" details={details} onChange={onChange} cols={2}
      options={["DEWA (Electricity & Water)","District Cooling","WiFi","Cable / Satellite TV","Gas"]} />
    <CB label="Amenities" field="amenities" details={details} onChange={onChange}
      options={["AC","Shared Kitchen","Private Kitchen","Washing Machine","Parking","Pool Access","Gym Access","Balcony","Rooftop","24/7 Security","CCTV","Concierge","Storage Room","Pet-Friendly"]} />
    <SH title="House Rules" />
    <CB label="Rules" field="rules" details={details} onChange={onChange} cols={2}
      options={["No Smoking","No Pets","No Parties","Couples Only","Females Only","Males Only","No Overnight Guests","Quiet Hours 10pm–8am"]} />
    <div className="grid grid-cols-2 gap-4">
      <SI label="Tenant Preference" field="tenantPreference" details={details} onChange={onChange}
        options={["Any","Single Professional","Couple","Family","Students Welcome","Executives"]} />
      <SI label="Nationality Preference" field="nationalityPref" details={details} onChange={onChange}
        options={["Any","UAE Nationals Only","Arab Nationals","Expats Welcome","No Preference"]} />
    </div>
    <TA label="Additional Notes" field="additionalNotes" placeholder="e.g. Quiet building, DEWA split equally." details={details} onChange={onChange} rows={2} />
  </>);
}

// ─── 03 Office Space ─────────────────────────────────────────────────────────
function OfficeSpaceFields({ details, onChange }: { details: Details; onChange: (d: Details) => void }) {
  return (<>
    <SH title="Space Details" />
    <SI label="Space Type" field="spaceType" req details={details} onChange={onChange}
      options={["Private Office","Co-working Hot Desk","Dedicated Desk","Meeting Room","Conference Room","Training Room","Retail Unit","Showroom","Warehouse","Light Industrial Unit","Photography Studio","Recording Studio","Creative Studio","Full Floor","Other"]} />
    <div className="grid grid-cols-2 gap-4">
      <TI label="Building Name" field="buildingName" req placeholder="e.g. DIFC Gate Avenue" details={details} onChange={onChange} />
      <SI label="Building Grade" field="buildingGrade" details={details} onChange={onChange}
        options={["Grade A (Premium)","Grade B","Grade C","Freezone Building","Villa / Converted Office"]} />
    </div>
    <div className="grid grid-cols-2 gap-4">
      <TI label="Size (sqft)" field="sizeSqft" type="number" req placeholder="e.g. 800" details={details} onChange={onChange} />
      <SI label="Capacity" field="capacity" details={details} onChange={onChange} options={["1","2","3–5","6–10","11–20","21–50","51–100","100+"]} />
    </div>
    <div className="grid grid-cols-2 gap-4">
      <SI label="Floor" field="floor" details={details} onChange={onChange} options={["Ground","1st","2nd","3rd–5th","6th–10th","11th–20th","Above 20th"]} />
      <SI label="Fit-out" field="fitout" req details={details} onChange={onChange}
        options={["Fully Fitted (plug & play)","Shell & Core","Semi-fitted","Cat A","Cat B"]} />
    </div>
    <SH title="Availability" />
    <div className="grid grid-cols-2 gap-4">
      <TI label="Available From" field="availableFrom" type="date" req details={details} onChange={onChange} />
      <TI label="Available Until" field="availableUntil" type="date" details={details} onChange={onChange} hint="Leave blank if open-ended" />
    </div>
    <div className="grid grid-cols-2 gap-4">
      <SI label="Min Rental Period" field="minRental" req details={details} onChange={onChange}
        options={["1 Day","1 Week","1 Month","3 Months","6 Months","1 Year","Flexible"]} />
      <SI label="Freezone / Mainland" field="jurisdiction" details={details} onChange={onChange}
        options={["Dubai Mainland","Abu Dhabi Mainland","Sharjah Mainland","DIFC","DMCC","Dubai Silicon Oasis","Dubai Media City","Dubai Internet City","JAFZA","Khalifa Industrial Zone","Other Freezone"]} />
    </div>
    <CB label="Facilities Included" field="amenities" details={details} onChange={onChange}
      options={["High-speed WiFi","Dedicated Internet Line","Reception Service","Mail Handling","Printing / Scanning","Pantry / Kitchen","Meeting Room Access","Video Conferencing","Visitor Parking","Covered Parking","CCTV","24/7 Access","Generator Backup","Cleaning Service","Server Room Access"]} />
    <TA label="Additional Notes" field="additionalNotes" placeholder="e.g. Fully furnished with standing desks." details={details} onChange={onChange} rows={2} />
  </>);
}

// ─── 04 Real Estate ──────────────────────────────────────────────────────────
function RealEstateFields({ details, onChange }: { details: Details; onChange: (d: Details) => void }) {
  return (<>
    <SH title="Property Details" />
    <SI label="Property Type" field="propertyType" req details={details} onChange={onChange}
      options={["Villa","Townhouse","Apartment","Studio","Penthouse","Duplex","Compound","Retail Space","Office Space","Warehouse","Land / Plot","Other"]} />
    <div className="grid grid-cols-2 gap-4">
      <TI label="Size (sqft)" field="sizeSqft" type="number" req placeholder="e.g. 2500" details={details} onChange={onChange} />
      <TI label="Plot Size (sqft)" field="plotSqft" type="number" placeholder="Villas only" details={details} onChange={onChange} />
    </div>
    <div className="grid grid-cols-2 gap-4">
      <SI label="Bedrooms" field="bedrooms" req details={details} onChange={onChange} options={["Studio","1 BR","2 BR","3 BR","4 BR","5 BR","6+ BR"]} />
      <SI label="Bathrooms" field="bathrooms" details={details} onChange={onChange} options={["1","2","3","4","5","6+"]} />
    </div>
    <div className="grid grid-cols-2 gap-4">
      <SI label="Furnishing" field="furnishing" details={details} onChange={onChange} options={["Fully Furnished","Semi-Furnished","Unfurnished"]} />
      <SI label="Condition" field="condition" details={details} onChange={onChange} options={CONDITIONS_PROPERTY} />
    </div>
    <SI label="View" field="view" details={details} onChange={onChange}
      options={["Sea View","Full Sea View","Burj Khalifa View","City Skyline","Golf Course","Garden / Park","Pool View","Community View","Street View"]} />
    <TI label="Development / Building Name" field="buildingName" req placeholder="e.g. Emaar Beachfront" details={details} onChange={onChange} />
    <SI label="Payment Terms" field="paymentTerms" details={details} onChange={onChange}
      options={["Cash Only","Mortgage Accepted","Developer Payment Plan","Instalment Plan","Flexible"]} />
    <SH title="Amenities & Features" />
    <CB label="Community Amenities" field="amenities" details={details} onChange={onChange}
      options={["Swimming Pool","Kids Pool","Gym","Sauna","BBQ Area","Children's Play Area","Covered Parking","Visitor Parking","Concierge 24/7","Security 24/7","CCTV","Tennis Court","Jogging Track","Retail Outlets","Metro Access","Pet-Friendly"]} />
    <CB label="Unit Features" field="unitFeatures" details={details} onChange={onChange} cols={2}
      options={["Maid's Room","Driver's Room","Storage Room","Private Garden","Private Pool","Rooftop Access","Study Room","Smart Home","Central A/C","Laundry Room"]} />
  </>);
}

// ─── 05 Automotive ───────────────────────────────────────────────────────────
function AutomotiveFields({ details, onChange }: { details: Details; onChange: (d: Details) => void }) {
  return (<>
    <SH title="Vehicle Details" />
    <SI label="Vehicle Type" field="vehicleType" req details={details} onChange={onChange}
      options={["Sedan","SUV","Pickup Truck","Sports Car","Luxury Car","Van / Minivan","Coupe","Convertible","Crossover","Motorcycle","Other"]} />
    <div className="grid grid-cols-2 gap-4">
      <TI label="Make / Brand" field="make" req placeholder="e.g. Toyota, Rolls Royce" details={details} onChange={onChange} />
      <TI label="Model" field="model" req placeholder="e.g. Land Cruiser" details={details} onChange={onChange} />
    </div>
    <div className="grid grid-cols-3 gap-4">
      <TI label="Year" field="year" type="number" req placeholder="e.g. 2023" details={details} onChange={onChange} />
      <TI label="Mileage (km)" field="mileageKm" type="number" placeholder="e.g. 25000" details={details} onChange={onChange} />
      <TI label="Engine" field="engine" placeholder="e.g. V8, 2.0L" details={details} onChange={onChange} />
    </div>
    <div className="grid grid-cols-2 gap-4">
      <SI label="Fuel Type" field="fuelType" req details={details} onChange={onChange} options={["Petrol","Diesel","Electric (EV)","Hybrid","Plug-in Hybrid","Other"]} />
      <SI label="Transmission" field="transmission" details={details} onChange={onChange} options={["Automatic","Manual","Semi-Auto / Tiptronic"]} />
    </div>
    <div className="grid grid-cols-2 gap-4">
      <TI label="Exterior Colour" field="color" req placeholder="e.g. Midnight Blue Pearl" details={details} onChange={onChange} />
      <TI label="Interior Colour" field="interiorColor" placeholder="e.g. Cream Nappa Leather" details={details} onChange={onChange} />
    </div>
    <SI label="Condition" field="condition" req details={details} onChange={onChange} options={CONDITIONS_VEHICLE} />
    <div className="grid grid-cols-2 gap-4">
      <SI label="Regional Specs" field="specs" details={details} onChange={onChange}
        options={["GCC Specs","American Specs","European Specs","Japanese Specs","Other"]} />
      <SI label="Number of Doors" field="doors" details={details} onChange={onChange} options={["2","3","4","5"]} />
    </div>
    <SH title="Service & History" />
    <div className="grid grid-cols-2 gap-4">
      <SI label="Service History" field="serviceHistory" details={details} onChange={onChange}
        options={["Full Agency History","Partial History","No History","N/A"]} />
      <SI label="Warranty" field="warranty" details={details} onChange={onChange}
        options={["No Warranty","Under 6 Months","6–12 Months","1–2 Years","2+ Years","Transferable"]} />
    </div>
    <div className="grid grid-cols-2 gap-4">
      <SI label="GCC Registered" field="gccRegistered" details={details} onChange={onChange}
        options={["Yes — UAE Registered","Yes — GCC (Other)","No — Import","N/A"]} />
      <SI label="Accident History" field="accidents" details={details} onChange={onChange}
        options={["No accidents — clean","Minor dent/scratch only","Previously repaired","Accident history — disclosed"]} />
    </div>
    <CB label="Features & Extras" field="features" details={details} onChange={onChange}
      options={["Full Option","Panoramic Roof","Leather Seats","Heated / Cooled Seats","Massage Seats","Head-Up Display","360° Camera","Blind Spot Monitor","Lane Keep Assist","Adaptive Cruise Control","Night Vision","Premium Sound","Apple CarPlay / Android Auto","Remote Start","Keyless Entry"]} />
    <TA label="Additional Notes" field="additionalNotes" placeholder="e.g. Single owner, no accidents, RTA inspection passed." details={details} onChange={onChange} rows={2} />
  </>);
}

// ─── 06 Yachts & Boats ───────────────────────────────────────────────────────
function YachtsBoatsFields({ details, onChange }: { details: Details; onChange: (d: Details) => void }) {
  return (<>
    <SH title="Vessel Details" />
    <SI label="Vessel Type" field="vesselType" req details={details} onChange={onChange}
      options={["Motor Yacht","Super Yacht","Mega Yacht","Sailing Yacht","Speed Boat","Catamaran","RIB / Inflatable","Fishing Boat","Jet Ski","Houseboat","Other"]} />
    <div className="grid grid-cols-2 gap-4">
      <TI label="Make / Brand" field="make" req placeholder="e.g. Azimut, Sunseeker, Sea Ray" details={details} onChange={onChange} />
      <TI label="Model" field="model" req placeholder="e.g. S65 Sport" details={details} onChange={onChange} />
    </div>
    <div className="grid grid-cols-3 gap-4">
      <TI label="Year Built" field="year" type="number" req placeholder="e.g. 2020" details={details} onChange={onChange} />
      <TI label="Length (ft)" field="lengthFt" type="number" req placeholder="e.g. 55" details={details} onChange={onChange} />
      <TI label="Engine Hours" field="engineHours" type="number" placeholder="e.g. 320" details={details} onChange={onChange} />
    </div>
    <div className="grid grid-cols-2 gap-4">
      <TI label="Engine Make & Power" field="engineDetails" placeholder="e.g. Twin Volvo IPS 900hp" details={details} onChange={onChange} />
      <SI label="Max Capacity (persons)" field="capacity" details={details} onChange={onChange}
        options={["2","4","6","8","10","12","15","20","20+"]} />
    </div>
    <SI label="Flag / Registration" field="flag" details={details} onChange={onChange}
      options={["UAE Registered","UAE Flagged","Cayman Islands","British Virgin Islands","Panama","Malta","Other"]} />
    <TI label="Current Marina / Location" field="marina" req placeholder="e.g. Dubai Marina, Abu Dhabi Corniche" details={details} onChange={onChange} />
    <SI label="Offering Type" field="offeringType" req details={details} onChange={onChange}
      options={["Day Charter","Half-day Charter","Overnight Charter","Weekly Charter","Full Ownership / Sale","Barter Exchange"]} />
    <SI label="Condition" field="condition" req details={details} onChange={onChange} options={CONDITIONS_VEHICLE} />
    <SH title="Onboard Amenities" />
    <CB label="Features" field="features" details={details} onChange={onChange}
      options={["Air Conditioning","Flybridge","Sun Deck","Swim Platform","Jet Ski / Tender","Master Cabin","Guest Cabins","Crew Quarters","Fully Equipped Galley","Wet Bar","Jacuzzi / Jacuzzi on deck","Stabilisers","Watermaker","Generator","Satellite TV","WiFi","Fishing Equipment","Snorkelling Gear","BBQ"]} />
    <TA label="Additional Details" field="additionalNotes" placeholder="e.g. Full service history, interior recently refurbished." details={details} onChange={onChange} rows={2} />
  </>);
}

// ─── 07 Electronics ──────────────────────────────────────────────────────────
function ElectronicsFields({ details, onChange }: { details: Details; onChange: (d: Details) => void }) {
  return (<>
    <SI label="Device Type" field="deviceType" req details={details} onChange={onChange}
      options={["Smartphone","Laptop / MacBook","Tablet / iPad","Smart Watch","Camera / DSLR","Drone","TV / Display","Smart Speaker","Headphones / AirPods","SaaS Licence","Other"]} />
    <div className="grid grid-cols-2 gap-4">
      <TI label="Brand" field="brand" req placeholder="e.g. Apple, Samsung" details={details} onChange={onChange} />
      <TI label="Model" field="model" req placeholder="e.g. iPhone 15 Pro Max" details={details} onChange={onChange} />
    </div>
    <div className="grid grid-cols-2 gap-4">
      <TI label="Storage / Capacity" field="storage" placeholder="e.g. 256GB" details={details} onChange={onChange} />
      <TI label="RAM" field="ram" placeholder="e.g. 16GB" details={details} onChange={onChange} />
    </div>
    <div className="grid grid-cols-2 gap-4">
      <TI label="Colour" field="color" req placeholder="e.g. Space Black" details={details} onChange={onChange} />
      <SI label="Region" field="region" details={details} onChange={onChange}
        options={["GCC / International","USA Model","UK Model","Unlocked (any SIM)","Carrier Locked"]} />
    </div>
    <SI label="Condition" field="condition" req details={details} onChange={onChange} options={CONDITIONS_GENERAL} />
    <div className="grid grid-cols-2 gap-4">
      <SI label="Warranty" field="warranty" details={details} onChange={onChange}
        options={["No Warranty","Under 3 Months","3–6 Months","6–12 Months","1+ Year","AppleCare / Extended"]} />
      <TI label="Battery Health %" field="batteryHealth" type="number" placeholder="e.g. 94" details={details} onChange={onChange} />
    </div>
    <TI label="Accessories Included" field="accessories" placeholder="e.g. Original box, charger, case" details={details} onChange={onChange} />
  </>);
}

// ─── 08 Gaming ───────────────────────────────────────────────────────────────
function GamingFields({ details, onChange }: { details: Details; onChange: (d: Details) => void }) {
  return (<>
    <SI label="Type" field="gamingType" req details={details} onChange={onChange}
      options={["Gaming Console","Game Title (Physical)","Game Title (Digital Code)","Gaming PC / Laptop","Controller / Accessory","VR Headset","Steering Wheel / Joystick","Gaming Chair","Monitor","Arcade Machine","Gaming Collectible"]} />
    <SI label="Platform" field="platform" req details={details} onChange={onChange}
      options={["PlayStation 5","PlayStation 4","Xbox Series X|S","Xbox One","Nintendo Switch","PC (Steam)","PC (Other)","Meta Quest / VR","iOS / Android","Retro / Other"]} />
    <div className="grid grid-cols-2 gap-4">
      <TI label="Title / Model Name" field="titleModel" req placeholder="e.g. Call of Duty: Modern Warfare III" details={details} onChange={onChange} />
      <TI label="Brand" field="brand" placeholder="e.g. Sony, Microsoft, Razer" details={details} onChange={onChange} />
    </div>
    <SI label="Condition" field="condition" req details={details} onChange={onChange} options={CONDITIONS_GENERAL} />
    <div className="grid grid-cols-2 gap-4">
      <SI label="Format (Games)" field="format" details={details} onChange={onChange}
        options={["Physical Disc / Cartridge","Digital Code","N/A — Hardware"]} />
      <SI label="Region" field="region" details={details} onChange={onChange}
        options={["Region 2 / UAE / Middle East","Region 1 / USA","Region Free","N/A"]} />
    </div>
    <CB label="Included Items" field="includes" details={details} onChange={onChange} cols={2}
      options={["Original Box","All Cables","2nd Controller","Charging Dock","Game Bundle","DLC / Season Pass","Headset","Keyboard & Mouse","Original Receipts","Memory Card / Storage"]} />
    <TA label="Additional Notes" field="additionalNotes" placeholder="e.g. Console has never been jailbroken. Purchased from Virgin Megastore." details={details} onChange={onChange} rows={2} />
  </>);
}

// ─── 09 Fashion ──────────────────────────────────────────────────────────────
function FashionFields({ details, onChange }: { details: Details; onChange: (d: Details) => void }) {
  return (<>
    <SI label="Category" field="fashionCategory" req details={details} onChange={onChange}
      options={["Clothing","Shoes / Sneakers","Bag / Handbag","Sportswear","Swimwear","Abaya / Modest Wear","Accessories","Perfume / Fragrance","Other"]} />
    <div className="grid grid-cols-2 gap-4">
      <TI label="Brand" field="brand" req placeholder="e.g. Gucci, Nike, Zara" details={details} onChange={onChange} />
      <TI label="Size" field="size" placeholder="e.g. M, EU42, UK8" details={details} onChange={onChange} />
    </div>
    <div className="grid grid-cols-2 gap-4">
      <TI label="Colour" field="color" req placeholder="e.g. Midnight Black" details={details} onChange={onChange} />
      <SI label="Gender" field="gender" details={details} onChange={onChange} options={["Men","Women","Unisex","Kids"]} />
    </div>
    <SI label="Condition" field="condition" req details={details} onChange={onChange} options={CONDITIONS_FASHION} />
    <TI label="Material / Fabric" field="material" placeholder="e.g. 100% Cotton, Genuine Leather" details={details} onChange={onChange} />
    <CB label="Comes With" field="includes" details={details} onChange={onChange} cols={2}
      options={["Original Box","Dust Bag","Authenticity Card","Receipt","Tags Attached","Extra Straps","Protective Case"]} />
  </>);
}

// ─── 10 Jewelry & Watches ────────────────────────────────────────────────────
function JewelryWatchesFields({ details, onChange }: { details: Details; onChange: (d: Details) => void }) {
  return (<>
    <SI label="Item Type" field="jewelryType" req details={details} onChange={onChange}
      options={["Luxury Watch","Smart Watch","Ring","Necklace / Chain","Bracelet","Earrings","Brooch / Pin","Cufflinks","Pendant","Full Jewelry Set","Other"]} />
    <div className="grid grid-cols-2 gap-4">
      <TI label="Brand / Maker" field="brand" req placeholder="e.g. Rolex, Cartier, Tiffany" details={details} onChange={onChange} />
      <TI label="Reference / Model" field="model" placeholder="e.g. Submariner 126610LN" details={details} onChange={onChange} />
    </div>
    <div className="grid grid-cols-2 gap-4">
      <TI label="Year / Age" field="year" placeholder="e.g. 2021" details={details} onChange={onChange} />
      <TI label="Case Size (watches, mm)" field="caseSize" type="number" placeholder="e.g. 41" details={details} onChange={onChange} />
    </div>
    <SH title="Material & Stones" />
    <div className="grid grid-cols-2 gap-4">
      <SI label="Metal / Material" field="metal" details={details} onChange={onChange}
        options={["18K Yellow Gold","18K White Gold","18K Rose Gold","Platinum","Sterling Silver (925)","Stainless Steel","Titanium","Gold-Plated","Two-tone","Mixed"]} />
      <SI label="Stone(s)" field="stone" details={details} onChange={onChange}
        options={["Diamond","Ruby","Emerald","Sapphire","Pearl","Amethyst","No Stone / Plain","Other"]} />
    </div>
    <div className="grid grid-cols-2 gap-4">
      <TI label="Stone Carat / Weight" field="stoneCarat" placeholder="e.g. 1.5ct TW" details={details} onChange={onChange} />
      <SI label="Watch Movement" field="movement" details={details} onChange={onChange}
        options={["Automatic","Manual Winding","Quartz","Solar / Kinetic","N/A"]} />
    </div>
    <SI label="Condition" field="condition" req details={details} onChange={onChange} options={CONDITIONS_FASHION} />
    <CB label="Comes With" field="includes" details={details} onChange={onChange} cols={2}
      options={["Original Box","Papers / Certificate","Warranty Card","Service History","Spare Links","Extra Strap","GIA / AGS Certificate","Invoice / Receipt"]} />
    <TA label="Additional Notes" field="additionalNotes" placeholder="e.g. Recently serviced at Rolex UAE. Still under manufacturer warranty." details={details} onChange={onChange} rows={2} />
  </>);
}

// ─── 11 Beauty & Wellness ────────────────────────────────────────────────────
function BeautyWellnessFields({ details, onChange }: { details: Details; onChange: (d: Details) => void }) {
  return (<>
    <SI label="Type" field="beautyType" req details={details} onChange={onChange}
      options={["Skincare Product / Set","Makeup / Cosmetics","Haircare Product","Fragrance / Perfume","Nail Care","Salon Service","Hair Treatment","Spa Treatment / Package","Massage Therapy","Laser / Aesthetic Treatment","Nutrition / Supplement","Medical Aesthetic Consultation","Training / Beauty Course","Other"]} />
    <div className="grid grid-cols-2 gap-4">
      <TI label="Brand / Provider" field="brand" req placeholder="e.g. La Mer, Charlotte Tilbury, Luxury Spa" details={details} onChange={onChange} />
      <TI label="Product / Service Name" field="productName" req placeholder="e.g. Crème de la Mer 100ml" details={details} onChange={onChange} />
    </div>
    <SI label="Condition" field="condition" details={details} onChange={onChange}
      options={["Brand New / Sealed","New without Box","Lightly Used (>80% remaining)","Half Used","Empty — for display only","N/A — Service"]} />
    <div className="grid grid-cols-2 gap-4">
      <TI label="Size / Volume / Duration" field="sizeVolume" placeholder="e.g. 100ml, 60-min session" details={details} onChange={onChange} />
      <TI label="Expiry Date" field="expiryDate" type="date" details={details} onChange={onChange} hint="For products only" />
    </div>
    <CB label="Suitable For" field="suitableFor" details={details} onChange={onChange} cols={2}
      options={["All Skin Types","Dry Skin","Oily Skin","Combination Skin","Sensitive Skin","Normal Skin","Dark Complexion","Fair Complexion","Anti-Ageing","Acne-Prone"]} />
    <CB label="Certifications / Claims" field="certifications" details={details} onChange={onChange} cols={2}
      options={["Halal Certified","Cruelty-Free","Vegan","Organic","Dermatologist Tested","Fragrance-Free","Paraben-Free","Sulphate-Free","Hypoallergenic"]} />
    <SI label="Service Location" field="serviceLocation" details={details} onChange={onChange}
      options={["In-salon / At location","Home Visit","Online Consultation","Client's Choice","N/A — Product"]} />
    <TI label="Qualifications / Certifications (for services)" field="qualifications" placeholder="e.g. CIDESCO certified, 10 years' experience" details={details} onChange={onChange} />
    <TA label="Additional Details" field="additionalNotes" placeholder="e.g. Authentic, purchased from official retailer. Never opened." details={details} onChange={onChange} rows={2} />
  </>);
}

// ─── 12 Food & Dining ────────────────────────────────────────────────────────
function FoodDiningFields({ details, onChange }: { details: Details; onChange: (d: Details) => void }) {
  return (<>
    <SI label="Type" field="foodType" req details={details} onChange={onChange}
      options={["Restaurant Voucher / Experience","Private Chef (at-home)","Catering Package","Wedding / Event Catering","Specialty Bakery & Pastry","Food Product / Hamper","BBQ & Grill Setup","Cooking Class","Meal Prep Service","Corporate Lunch Package","Food Truck Hire","Dessert / Cake Order","Other"]} />
    <div className="grid grid-cols-2 gap-4">
      <TI label="Restaurant / Provider Name" field="providerName" req placeholder="e.g. Nobu Dubai, Chef Omar's Kitchen" details={details} onChange={onChange} />
      <SI label="Cuisine Type" field="cuisine" details={details} onChange={onChange}
        options={["Arabic / Levantine","Emirati","Asian Fusion","Japanese / Sushi","Indian","Mediterranean","Italian","French","American / BBQ","Persian","Turkish","Pan-Asian","International Buffet","Multiple / Mixed","Other"]} />
    </div>
    <div className="grid grid-cols-2 gap-4">
      <TI label="Serves (persons)" field="serves" type="number" req placeholder="e.g. 10" details={details} onChange={onChange} />
      <SI label="Meal Type" field="mealType" details={details} onChange={onChange}
        options={["Breakfast","Brunch","Lunch","Dinner","All-day","Multiple Meals","Custom"]} />
    </div>
    <SH title="Availability" />
    <div className="grid grid-cols-2 gap-4">
      <TI label="Available From" field="availableFrom" type="date" req details={details} onChange={onChange} />
      <TI label="Available Until" field="availableUntil" type="date" details={details} onChange={onChange} hint="Leave blank if open" />
    </div>
    <div className="grid grid-cols-2 gap-4">
      <SI label="Advance Booking Notice" field="advanceNotice" details={details} onChange={onChange}
        options={["Same day","24 hours","48 hours","3 days","1 week","2 weeks"]} />
      <SI label="Duration" field="duration" details={details} onChange={onChange}
        options={["1 hour","2 hours","3 hours","4 hours","Half day","Full day","Multiple days"]} />
    </div>
    <CB label="Dietary Options Available" field="dietary" details={details} onChange={onChange} cols={2}
      options={["Halal","Kosher","Vegetarian","Vegan","Gluten-Free","Dairy-Free","Nut-Free","Low-Carb / Keto","Diabetic-Friendly"]} />
    <CB label="Included" field="includes" details={details} onChange={onChange} cols={2}
      options={["Setup & Teardown","Tableware & Cutlery","Serving Staff","Beverages","Dessert","Decoration","Transport","Chafing Dishes / Equipment"]} />
    <TA label="Menu / Package Description" field="menuDescription" req placeholder="e.g. 3-course Levantine dinner: mezze, grilled mixed grill platter, dessert assortment. All fully Halal." details={details} onChange={onChange} rows={3}
      hint="Be specific — list what dishes are included" />
    <TA label="Terms & Restrictions" field="terms" placeholder="e.g. Valid Mon–Thu only. 3-day advance notice required. Delivery within Dubai only." details={details} onChange={onChange} rows={2} />
  </>);
}

// ─── 13 Sports & Fitness ────────────────────────────────────────────────────
function SportsFitnessFields({ details, onChange }: { details: Details; onChange: (d: Details) => void }) {
  return (<>
    <SI label="Type" field="sportsType" req details={details} onChange={onChange}
      options={["Sports Equipment (General)","Football / Soccer Equipment","Tennis / Padel Equipment","Golf Equipment","Cycling / Bicycle","Water Sports Equipment","Gym Equipment","Personal Training Package","Gym Membership","Fitness Classes (Pack)","Sports Club Membership","Swimming Lessons","Martial Arts / Boxing","Yoga / Pilates Classes","Sports Event Tickets","Team Kit / Uniform","Other"]} />
    <div className="grid grid-cols-2 gap-4">
      <TI label="Brand" field="brand" placeholder="e.g. Nike, Wilson, Technogym" details={details} onChange={onChange} />
      <TI label="Model / Name" field="model" placeholder="e.g. Pro Staff 97, Wahoo KICKR" details={details} onChange={onChange} />
    </div>
    <SI label="Condition" field="condition" req details={details} onChange={onChange} options={CONDITIONS_GENERAL} />
    <div className="grid grid-cols-2 gap-4">
      <SI label="Sport Category" field="sportCategory" details={details} onChange={onChange}
        options={["Football / Soccer","Basketball","Tennis","Padel","Golf","Cricket","Swimming","Cycling","Running","Crossfit / HIIT","Boxing / Martial Arts","Water Sports","Yoga / Pilates","Gymnastics","Horse Riding","Multiple / Other"]} />
      <SI label="Target Level" field="targetLevel" details={details} onChange={onChange}
        options={["Beginner","Intermediate","Advanced","Professional","All Levels"]} />
    </div>
    <div className="grid grid-cols-2 gap-4">
      <TI label="Sessions / Classes / Days" field="sessions" placeholder="e.g. 10 sessions, 3-month membership" details={details} onChange={onChange} />
      <TI label="Valid Until (if applicable)" field="validUntil" type="date" details={details} onChange={onChange} />
    </div>
    <SI label="Location / Delivery" field="location" details={details} onChange={onChange}
      options={["In-person — Dubai","In-person — Abu Dhabi","In-person — Sharjah","Online / Virtual","Client's Home / Location","Specific Gym / Club","Equipment delivered to door"]} />
    <CB label="Equipment Features" field="features" details={details} onChange={onChange} cols={2}
      options={["Adjustable / Multi-functional","Foldable / Space-saving","Commercial Grade","Smart / Connected","Includes App","Bluetooth","Warranty Remaining","Original Packaging"]} />
    <TA label="Additional Details" field="additionalNotes" placeholder="e.g. Technogym Bike Forma, purchased 2023, barely used. Includes Technogym App subscription." details={details} onChange={onChange} rows={2} />
  </>);
}

// ─── 14 Home Appliances ──────────────────────────────────────────────────────
function HomeAppliancesFields({ details, onChange }: { details: Details; onChange: (d: Details) => void }) {
  return (<>
    <SI label="Appliance Type" field="applianceType" req details={details} onChange={onChange}
      options={["Refrigerator / Fridge-Freezer","Washing Machine","Tumble Dryer","Washer-Dryer Combo","Dishwasher","Oven / Cooker","Microwave","Air Fryer","Blender / Mixer","Coffee Machine","Water Dispenser / Purifier","Air Conditioner (Split / Portable)","Air Purifier","Vacuum Cleaner (Regular)","Robot Vacuum","Steam Iron / Garment Steamer","Smart Home Hub","Generator","Solar Panel / Water Heater","Other"]} />
    <div className="grid grid-cols-2 gap-4">
      <TI label="Brand" field="brand" req placeholder="e.g. Samsung, Bosch, Dyson" details={details} onChange={onChange} />
      <TI label="Model" field="model" req placeholder="e.g. WW90T684DLH" details={details} onChange={onChange} />
    </div>
    <div className="grid grid-cols-2 gap-4">
      <TI label="Year Purchased" field="year" placeholder="e.g. 2022" details={details} onChange={onChange} />
      <SI label="Voltage" field="voltage" details={details} onChange={onChange}
        options={["220V (UAE / GCC)","110V (USA / Japan)","Universal (110–240V)"]} />
    </div>
    <SI label="Condition" field="condition" req details={details} onChange={onChange} options={CONDITIONS_GENERAL} />
    <div className="grid grid-cols-2 gap-4">
      <SI label="Warranty Remaining" field="warranty" details={details} onChange={onChange}
        options={["No Warranty","Under 3 Months","3–6 Months","6–12 Months","1+ Year"]} />
      <TI label="Capacity / Size" field="capacity" placeholder="e.g. 9kg, 600L, 1.5 Ton" details={details} onChange={onChange} />
    </div>
    <TI label="Colour / Finish" field="color" placeholder="e.g. Stainless Steel, White, Black" details={details} onChange={onChange} />
    <CB label="Included" field="includes" details={details} onChange={onChange} cols={2}
      options={["Original Box","User Manual","Remote Control","Extra Accessories","Installation Service Available","Original Receipt"]} />
    <TA label="Additional Notes" field="additionalNotes" placeholder="e.g. Moving abroad — selling due to voltage difference. Works perfectly." details={details} onChange={onChange} rows={2} />
  </>);
}

// ─── 15 Furniture & Home ────────────────────────────────────────────────────
function FurnitureFields({ details, onChange }: { details: Details; onChange: (d: Details) => void }) {
  return (<>
    <SI label="Item Type" field="furnitureType" req details={details} onChange={onChange}
      options={["Sofa / Sectional","Bed Frame","Mattress","Dining Table & Chairs","Wardrobe / Closet","Desk","Office Chair","Side Table / Coffee Table","TV Unit","Bookshelf","Appliance","Kitchen Item / Counter","Lighting","Artwork / Décor","Outdoor Furniture","Other"]} />
    <div className="grid grid-cols-2 gap-4">
      <TI label="Brand" field="brand" placeholder="e.g. IKEA, NOVO, Natuzzi" details={details} onChange={onChange} />
      <TI label="Colour / Finish" field="color" req placeholder="e.g. Oak Wood, Grey Velvet" details={details} onChange={onChange} />
    </div>
    <TI label="Dimensions (L × W × H cm)" field="dimensions" placeholder="e.g. 220 × 95 × 85 cm" details={details} onChange={onChange} />
    <div className="grid grid-cols-2 gap-4">
      <SI label="Material" field="material" details={details} onChange={onChange}
        options={["Solid Wood","MDF / Engineered Wood","Metal","Fabric / Upholstery","Leather","Faux Leather","Glass","Marble","Rattan / Wicker","Mixed"]} />
      <SI label="Condition" field="condition" req details={details} onChange={onChange} options={CONDITIONS_GENERAL} />
    </div>
    <SI label="Assembly Required" field="assembly" details={details} onChange={onChange}
      options={["No — ready to use","Yes — self-assembly","Yes — professional assembly needed"]} />
    <TA label="Additional Notes" field="additionalNotes" placeholder="e.g. Set of 6 dining chairs included. Minor scratch on underside (not visible)." details={details} onChange={onChange} rows={2} />
  </>);
}

// ─── 16 Garden & Outdoor ────────────────────────────────────────────────────
function GardenOutdoorFields({ details, onChange }: { details: Details; onChange: (d: Details) => void }) {
  return (<>
    <SI label="Item Type" field="gardenType" req details={details} onChange={onChange}
      options={["Outdoor Furniture Set","Sun Lounger / Daybed","BBQ / Grill / Smoker","Outdoor Kitchen","Garden Umbrella / Shade Sail","Pergola / Gazebo","Swimming Pool Equipment","Irrigation System","Lawnmower / Garden Tools","Plant / Tree","Pot / Planter","Outdoor Lighting","Artificial Grass / Turf","Landscaping Service","Outdoor Play Equipment","Pressure Washer","Other"]} />
    <div className="grid grid-cols-2 gap-4">
      <TI label="Brand" field="brand" placeholder="e.g. Weber, Keter, Rattan World" details={details} onChange={onChange} />
      <TI label="Model / Name" field="model" placeholder="e.g. Spirit E-325 Gas Grill" details={details} onChange={onChange} />
    </div>
    <div className="grid grid-cols-2 gap-4">
      <SI label="Condition" field="condition" req details={details} onChange={onChange} options={CONDITIONS_GENERAL} />
      <TI label="Dimensions" field="dimensions" placeholder="e.g. 200 × 150 × 80 cm" details={details} onChange={onChange} />
    </div>
    <SI label="Material" field="material" details={details} onChange={onChange}
      options={["Teak Wood","Acacia Wood","Aluminium","Wrought Iron","Synthetic Rattan","Polywood / HDPE","Plastic","Stainless Steel","Mixed","Other"]} />
    <CB label="Features" field="features" details={details} onChange={onChange} cols={2}
      options={["Weather Resistant / Treated","UV Protected","Rust Proof","Foldable / Stackable","Cover / Dust Sheet Included","Assembly Required","Electric / Solar Powered","Warranty Remaining"]} />
    <TI label="Colour" field="color" placeholder="e.g. Charcoal Grey, Teak Brown" details={details} onChange={onChange} />
    <TA label="Additional Notes" field="additionalNotes" placeholder="e.g. Includes 4 chairs, 2 loungers, and parasol. Stored indoors during summer." details={details} onChange={onChange} rows={2} />
  </>);
}

// ─── 17 Tools & Equipment ────────────────────────────────────────────────────
function ToolsEquipmentFields({ details, onChange }: { details: Details; onChange: (d: Details) => void }) {
  return (<>
    <SI label="Type" field="toolType" req details={details} onChange={onChange}
      options={["Power Tools (General)","Hand Tools Set","Drill / Impact Driver","Circular Saw","Angle Grinder","Jigsaw","Sandpaper / Sander","Welding Equipment","Generator","Air Compressor","Scaffold / Ladder","Measuring & Levelling Tools","Plumbing Tools","Electrical Testing Equipment","Cleaning / Pressure Washer","Industrial Equipment","Agricultural Equipment","Printing / Signage Machine","Other"]} />
    <div className="grid grid-cols-2 gap-4">
      <TI label="Brand" field="brand" req placeholder="e.g. Bosch, Makita, DeWalt" details={details} onChange={onChange} />
      <TI label="Model" field="model" placeholder="e.g. GSB 18V-21" details={details} onChange={onChange} />
    </div>
    <SI label="Power Source" field="powerSource" details={details} onChange={onChange}
      options={["Corded Electric (220V)","Battery (Cordless)","Petrol / Diesel","Pneumatic (Air)","Manual / Hand","Solar","N/A"]} />
    <div className="grid grid-cols-2 gap-4">
      <SI label="Condition" field="condition" req details={details} onChange={onChange} options={CONDITIONS_GENERAL} />
      <TI label="Hours of Use" field="hoursUsed" placeholder="e.g. ~50 hours" details={details} onChange={onChange} />
    </div>
    <SI label="Warranty" field="warranty" details={details} onChange={onChange}
      options={["No Warranty","Under 6 Months","6–12 Months","1+ Year"]} />
    <CB label="Included" field="includes" details={details} onChange={onChange} cols={2}
      options={["Original Carry Case","Extra Batteries","Charger","Spare Blades / Bits","Safety Equipment","User Manual","Original Box"]} />
    <TA label="Additional Notes" field="additionalNotes" placeholder="e.g. Used once on a single project. Still in near-new condition." details={details} onChange={onChange} rows={2} />
  </>);
}

// ─── 18 Pets & Animals ──────────────────────────────────────────────────────
function PetsAnimalsFields({ details, onChange }: { details: Details; onChange: (d: Details) => void }) {
  return (<>
    <SI label="Type" field="petsType" req details={details} onChange={onChange}
      options={["Dog","Cat","Bird (Parrot / Macaw)","Bird (Budgie / Finch)","Fish / Aquarium Setup","Reptile","Small Animal (Rabbit, Hamster)","Exotic Animal","Pet Accessories / Equipment","Pet Food (Bulk)","Aquarium / Terrarium","Other"]} />
    <div className="grid grid-cols-2 gap-4">
      <TI label="Breed / Species" field="breed" req placeholder="e.g. Golden Retriever, Ragdoll Cat" details={details} onChange={onChange} />
      <SI label="Age" field="age" req details={details} onChange={onChange}
        options={["Under 3 months","3–6 months","6–12 months","1–2 years","2–5 years","5–8 years","8+ years","N/A — Accessories"]} />
    </div>
    <div className="grid grid-cols-2 gap-4">
      <SI label="Gender" field="gender" details={details} onChange={onChange} options={["Male","Female","Unknown / N/A"]} />
      <SI label="Colour / Coat" field="color" details={details} onChange={onChange}
        options={["Black","White","Brown","Golden","Grey","Tricolour","Spotted","Striped","Mixed","N/A"]} />
    </div>
    <SH title="Health & Documentation" />
    <CB label="Health Status" field="health" details={details} onChange={onChange} cols={2}
      options={["Fully Vaccinated","Microchipped","Neutered / Spayed","Dewormed","Health Certificate (recent)","Registered with Municipality","Pet Passport Available","Currently on medication (disclosed)"]} />
    <CB label="Papers & Pedigree" field="papers" details={details} onChange={onChange} cols={2}
      options={["Pedigree Certificate","Kennel Club Registered","Breeding Papers","Import Certificate","No Papers","N/A"]} />
    <SH title="What's Included" />
    <CB label="Included Items" field="includes" details={details} onChange={onChange}
      options={["Cage / Crate / Carrier","Bed / Bedding","Food Bowl & Water Bowl","Leash & Collar","Toys","Food Supply (specify qty)","Grooming Equipment","Aquarium / Tank","Accessories Bundle"]} />
    <TA label="Additional Notes" field="additionalNotes" req placeholder="e.g. Friendly, house-trained, good with children. Moving abroad — looking for loving home. Not a sale, barter only." details={details} onChange={onChange} rows={3}
      hint="Include temperament, training, reason for listing, any known health conditions" />
  </>);
}

// ─── 19 Books & Media ────────────────────────────────────────────────────────
function BooksMediaFields({ details, onChange }: { details: Details; onChange: (d: Details) => void }) {
  return (<>
    <SI label="Type" field="mediaType" req details={details} onChange={onChange}
      options={["Fiction Book","Non-Fiction Book","Academic / Textbook","Children's Book","Comic Book / Manga","Magazine Collection","Vinyl Record","CD / DVD / Blu-ray","Board Game","Card Game (e.g. Trading Cards)","E-Reader Device","Audiobook Collection","Other"]} />
    <div className="grid grid-cols-2 gap-4">
      <TI label="Title" field="title" req placeholder="e.g. Atomic Habits" details={details} onChange={onChange} />
      <TI label="Author / Publisher" field="author" placeholder="e.g. James Clear" details={details} onChange={onChange} />
    </div>
    <div className="grid grid-cols-2 gap-4">
      <SI label="Genre" field="genre" details={details} onChange={onChange}
        options={["Self-Help / Personal Dev","Business & Finance","Science & Technology","History & Politics","Biography","Fiction / Novel","Fantasy / Sci-Fi","Mystery / Thriller","Children's","Academic / Study","Religion & Spirituality","Art & Design","Other"]} />
      <SI label="Language" field="language" details={details} onChange={onChange}
        options={["English","Arabic","French","Urdu","Hindi","Russian","Spanish","Other"]} />
    </div>
    <div className="grid grid-cols-2 gap-4">
      <SI label="Condition" field="condition" req details={details} onChange={onChange} options={CONDITIONS_COLLECTIBLE} />
      <TI label="Quantity" field="quantity" type="number" placeholder="e.g. 1 or 15 books" details={details} onChange={onChange} />
    </div>
    <CB label="Extras" field="includes" details={details} onChange={onChange} cols={2}
      options={["Author's Signature","Hardcover Edition","First Edition","Collector's Box Set","Annotations / Notes Inside (disclosed)","Protective Cover"]} />
    <TA label="Additional Notes" field="additionalNotes" placeholder="e.g. Set of 5 finance books. Lightly highlighted in pencil." details={details} onChange={onChange} rows={2} />
  </>);
}

// ─── 20 Musical Instruments ──────────────────────────────────────────────────
function MusicalInstrumentsFields({ details, onChange }: { details: Details; onChange: (d: Details) => void }) {
  return (<>
    <SI label="Instrument Type" field="instrumentType" req details={details} onChange={onChange}
      options={["Electric Guitar","Acoustic Guitar","Bass Guitar","Classical Guitar","Piano / Grand Piano","Keyboard / Digital Piano","Drums / Drum Kit","Electronic Drum Pad","Violin","Cello","Oud","Tabla / Percussion","Saxophone","Trumpet / Brass","Flute","DJ Equipment","Recording Equipment","Amplifier / Speaker","Other"]} />
    <div className="grid grid-cols-2 gap-4">
      <TI label="Brand / Make" field="brand" req placeholder="e.g. Yamaha, Gibson, Roland" details={details} onChange={onChange} />
      <TI label="Model" field="model" req placeholder="e.g. P-125 Digital Piano" details={details} onChange={onChange} />
    </div>
    <div className="grid grid-cols-2 gap-4">
      <TI label="Year" field="year" placeholder="e.g. 2021" details={details} onChange={onChange} />
      <SI label="Condition" field="condition" req details={details} onChange={onChange} options={CONDITIONS_GENERAL} />
    </div>
    <TI label="Colour / Finish" field="color" placeholder="e.g. Sunburst, Black, Natural Mahogany" details={details} onChange={onChange} />
    <CB label="Included Accessories" field="includes" details={details} onChange={onChange}
      options={["Hard Case","Gig Bag / Soft Case","Stand","Amplifier","Cables","Pedals / Effects","Bow (for strings)","Picks / Sticks","Tuner","Strap","Instruction Book"]} />
    <TA label="Modifications / Notes" field="additionalNotes" placeholder="e.g. Upgraded pickups. Recently set-up and re-strung by a luthier." details={details} onChange={onChange} rows={2} />
  </>);
}

// ─── 21 Art & Collectibles ───────────────────────────────────────────────────
function ArtCollectiblesFields({ details, onChange }: { details: Details; onChange: (d: Details) => void }) {
  return (<>
    <SI label="Type" field="artType" req details={details} onChange={onChange}
      options={["Original Painting","Limited Edition Print","Sculpture","Photography Print","Calligraphy / Arabic Art","Digital Art","Antique / Vintage Item","Sports Memorabilia","Coins / Currency Collection","Stamps Collection","Watches (Collectible)","Rare Trading Cards","Pop Culture Collectible","Historic Document / Map","Other"]} />
    <div className="grid grid-cols-2 gap-4">
      <TI label="Artist / Maker" field="artist" req placeholder="e.g. Ahmed Al Thani, Picasso (print)" details={details} onChange={onChange} />
      <TI label="Year / Period" field="year" placeholder="e.g. 2019 or 1920s" details={details} onChange={onChange} />
    </div>
    <div className="grid grid-cols-2 gap-4">
      <SI label="Medium / Material" field="medium" details={details} onChange={onChange}
        options={["Oil on Canvas","Acrylic on Canvas","Watercolour","Mixed Media","Photography","Bronze","Marble","Ceramic","Glass","Wood","Digital","Other"]} />
      <TI label="Dimensions (H × W cm)" field="dimensions" placeholder="e.g. 60 × 90 cm" details={details} onChange={onChange} />
    </div>
    <SI label="Condition" field="condition" req details={details} onChange={onChange} options={CONDITIONS_COLLECTIBLE} />
    <CB label="Documentation" field="documentation" details={details} onChange={onChange} cols={2}
      options={["Certificate of Authenticity","Artist's Signature","Edition Number (e.g. 12/50)","Provenance Documents","Gallery Receipt","Appraisal Report","Exhibition History","Import Certificate"]} />
    <SI label="Frame Status" field="frameStatus" details={details} onChange={onChange}
      options={["Framed (included)","Framed (not included)","Unframed","N/A (3D work)"]} />
    <TA label="Provenance / Additional Notes" field="additionalNotes" req
      placeholder="e.g. Purchased at Christie's Dubai 2021. Certificate and receipt included. Never displayed publicly." details={details} onChange={onChange} rows={3}
      hint="Describe the piece's history, exhibition record, or notable details" />
  </>);
}

// ─── 22 Luggage & Travel ────────────────────────────────────────────────────
function LuggageTravelFields({ details, onChange }: { details: Details; onChange: (d: Details) => void }) {
  return (<>
    <SI label="Type" field="luggageType" req details={details} onChange={onChange}
      options={["Hard-shell Suitcase","Soft-shell Suitcase","Cabin / Carry-on","Checked Luggage","Backpack (Travel)","Duffel / Holdall","Garment Bag","Travel Pillow / Accessories Set","Luggage Set (Multiple)","Laptop Bag","Other"]} />
    <div className="grid grid-cols-2 gap-4">
      <TI label="Brand" field="brand" req placeholder="e.g. Rimowa, Samsonite, Away" details={details} onChange={onChange} />
      <SI label="Size" field="size" req details={details} onChange={onChange}
        options={["Cabin (under 56cm)","Medium (60–68cm)","Large (75cm+)","XL / Check-in (80cm+)","Set of 2","Set of 3","One Size"]} />
    </div>
    <div className="grid grid-cols-2 gap-4">
      <TI label="Colour" field="color" req placeholder="e.g. Matte Black, Rose Gold" details={details} onChange={onChange} />
      <SI label="Material" field="material" details={details} onChange={onChange}
        options={["Polycarbonate","ABS Plastic","Aluminium","Nylon / Fabric","Canvas","Leather","Hybrid"]} />
    </div>
    <SI label="Condition" field="condition" req details={details} onChange={onChange} options={CONDITIONS_GENERAL} />
    <div className="grid grid-cols-2 gap-4">
      <SI label="Wheel Type" field="wheels" details={details} onChange={onChange}
        options={["4 spinner wheels","2 wheels","4 multi-directional wheels","N/A"]} />
      <SI label="Lock Type" field="lock" details={details} onChange={onChange}
        options={["TSA-approved combination lock","Key lock","No lock","Built-in TSA lock"]} />
    </div>
    <CB label="Features" field="features" details={details} onChange={onChange} cols={2}
      options={["Expandable","USB Charging Port","Lightweight (under 3kg)","Waterproof Lining","GPS Tracker","Interior Organiser Pockets","Compression Straps","Fleece Lining"]} />
    <TA label="Additional Notes" field="additionalNotes" placeholder="e.g. Used on 2 trips. No dents, wheels in perfect condition. Includes original dust bag." details={details} onChange={onChange} rows={2} />
  </>);
}

// ─── 23 Professional Services ────────────────────────────────────────────────
function ServicesFields({ details, onChange }: { details: Details; onChange: (d: Details) => void }) {
  return (<>
    <SH title="Service Overview" sub="Describe your service like a Fiverr gig — be specific." />
    <SI label="Service Category" field="serviceCategory" req details={details} onChange={onChange}
      options={["Legal Services","Marketing & Advertising","Graphic Design","Web Design & Development","App Development","Photography","Videography & Film","Content Writing & Copywriting","Social Media Management","Accounting & Finance","Business Consulting","IT Support & Networking","Architecture & Interior Design","Translation & Interpreting","Event Planning & Management","HR & Recruitment","Public Relations","Research & Analysis","Training & Coaching","Medical / Health Consultation","Other"]} />
    <TI label="Service Title" field="serviceTitle" req placeholder="e.g. Professional Brand Identity & Logo Design Package" details={details} onChange={onChange}
      hint="Be specific — this is your gig headline" />
    <SH title="Deliverables" sub="List exactly what the client receives." />
    <Tags label="Deliverables (press Enter after each)" field="deliverables" placeholder="e.g. 3 logo concepts" details={details} onChange={onChange}
      hint="Be specific: '5-page website', '30-second ad video', 'monthly SEO report'" />
    <SH title="Scope & Timeline" />
    <div className="grid grid-cols-2 gap-4">
      <SI label="Delivery Timeline" field="deliveryTimeline" req details={details} onChange={onChange}
        options={["Same day","1–2 days","3–5 days","1 week","2 weeks","3 weeks","1 month","2 months","3+ months","Ongoing / Retainer"]} />
      <SI label="Revisions" field="revisions" details={details} onChange={onChange}
        options={["1 revision","2 revisions","3 revisions","5 revisions","Unlimited","No revisions"]} />
    </div>
    <div className="grid grid-cols-2 gap-4">
      <SI label="Experience Level" field="experienceLevel" details={details} onChange={onChange}
        options={["Entry-level","Intermediate","Expert","Agency-grade"]} />
      <SI label="Languages" field="languages" details={details} onChange={onChange}
        options={["English","Arabic","English & Arabic","French","Russian","Hindi","Urdu","Tagalog / Filipino","Multiple"]} />
    </div>
    <SH title="Packages (optional)" sub="Define Basic, Standard, and Premium tiers." />
    <TA label="Basic Package" field="packageBasic" placeholder="e.g. 1 logo concept, 1 revision, JPEG only — AED 500 value" details={details} onChange={onChange} rows={2} />
    <TA label="Standard Package" field="packageStandard" placeholder="e.g. 3 concepts, 3 revisions, all formats — AED 1,200 value" details={details} onChange={onChange} rows={2} />
    <TA label="Premium Package" field="packagePremium" placeholder="e.g. Full brand kit: logo + stationery + social templates, unlimited revisions — AED 3,500 value" details={details} onChange={onChange} rows={2} />
    <Tags label="Requirements from Client" field="requirements" placeholder="e.g. Brand brief document" details={details} onChange={onChange}
      hint="What you need before starting" />
    <CB label="Tools & Platforms" field="tools" details={details} onChange={onChange}
      options={["Adobe Creative Suite","Figma","Canva Pro","WordPress","Webflow","Shopify","React / Next.js","Google Workspace","Xero / QuickBooks","Salesforce","HubSpot","Meta Ads Manager","Google Ads","Final Cut Pro","Adobe Premiere"]} />
    <TA label="Portfolio / Previous Work" field="portfolio" placeholder="e.g. Behance link, LinkedIn, or describe notable past projects." details={details} onChange={onChange} rows={2} />
  </>);
}

// ─── 24 Brand × Creator ──────────────────────────────────────────────────────
function BrandCollabFields({ details, onChange }: { details: Details; onChange: (d: Details) => void }) {
  return (<>
    <SH title="What Your Brand Is Offering" sub="Describe the product, service, or experience creators will receive." />
    <SI label="Offering Category" field="offeringCategory" req details={details} onChange={onChange}
      options={["Physical Product / Gift","Hotel Stay / Staycation","Restaurant / F&B Experience","Spa / Wellness Experience","Fashion / Clothing","Beauty / Skincare","Tech / Electronics","Software / App Access","Event Tickets","Travel Package","Service / Subscription","Gift Card","Other"]} />
    <TI label="Product / Offering Name" field="offeringName" req placeholder="e.g. Luxury Staycation for 2 — JW Marriott Dubai" details={details} onChange={onChange} />
    <TA label="Offering Description" field="offeringDescription" req
      placeholder="e.g. 2-night stay in Superior Room with breakfast, pool & gym access, AED 300 spa credit. Value: AED 2,800." details={details} onChange={onChange} rows={3}
      hint="Be detailed — creators need to understand exactly what they receive" />
    <div className="grid grid-cols-2 gap-4">
      <TI label="Retail / Market Value (AED)" field="retailValue" type="number" req placeholder="e.g. 2800" details={details} onChange={onChange} />
      <SI label="Spots Available" field="spotsAvailable" details={details} onChange={onChange}
        options={["1 creator","2 creators","3 creators","5 creators","10 creators","Ongoing"]} />
    </div>
    <SH title="Content Deliverables Required" sub="Be as specific as a production brief." />
    <CB label="Platforms" field="platforms" req details={details} onChange={onChange} cols={2}
      options={["Instagram","TikTok","YouTube","YouTube Shorts","Snapchat","X / Twitter","LinkedIn","Blog","Podcast"]} />
    <CB label="Content Formats" field="contentFormats" details={details} onChange={onChange} cols={2}
      options={["Reel (30–90 sec)","TikTok Video (15–60 sec)","YouTube Video (5+ min)","YouTube Short","Instagram Stories (series)","Static Post / Carousel","Blog Article (800+ words)","Podcast Ad Read"]} />
    <div className="grid grid-cols-2 gap-4">
      <TI label="Total Pieces Required" field="contentCount" type="number" req placeholder="e.g. 3" details={details} onChange={onChange} />
      <SI label="Posting Deadline" field="postingDeadline" details={details} onChange={onChange}
        options={["During / same day","Within 48h","Within 1 week","Within 2 weeks","Within 1 month","Flexible"]} />
    </div>
    <SH title="Creator Requirements" />
    <div className="grid grid-cols-2 gap-4">
      <TI label="Minimum Followers" field="minFollowers" type="number" req placeholder="e.g. 10000" details={details} onChange={onChange} />
      <SI label="Minimum Engagement Rate" field="minEngagement" details={details} onChange={onChange}
        options={["Any","1%+","2%+","3%+","5%+","7%+"]} />
    </div>
    <div className="grid grid-cols-2 gap-4">
      <SI label="Creator Niche" field="creatorNiche" details={details} onChange={onChange}
        options={["Any","Travel & Lifestyle","Food & Dining","Luxury & Fashion","Beauty & Skincare","Fitness & Health","Family & Parenting","Tech & Gadgets","Business & Finance","Art & Photography","Comedy / Entertainment"]} />
      <SI label="Creator Location" field="creatorLocation" details={details} onChange={onChange}
        options={["UAE-based only","GCC-based","Arab World","Any location","Open to discussion"]} />
    </div>
    <SH title="Brand Guidelines & Messaging" />
    <Tags label="Required Hashtags" field="requiredHashtags" placeholder="Type hashtag + Enter" details={details} onChange={onChange} />
    <Tags label="Required Tags / Mentions" field="requiredMentions" placeholder="e.g. @YourBrand" details={details} onChange={onChange} />
    <TA label="Key Messages to Communicate" field="keyMessages" req
      placeholder="e.g. Emphasise rooftop pool. Show breakfast spread. Highlight 5-star experience. Must include 'book via Bareter' in caption." details={details} onChange={onChange} rows={3} />
    <TA label="Tone & Style" field="toneStyle" placeholder="e.g. Aspirational and luxurious. Avoid salesy language. Authentic lifestyle shots preferred." details={details} onChange={onChange} rows={2} />
    <SI label="Content Usage Rights" field="usageRights" details={details} onChange={onChange}
      options={["Creator retains rights (organic only)","Brand may repost on social media","Brand may use in paid ads (6 months)","Brand may use in paid ads (1 year)","Full perpetual licence","Custom"]} />
  </>);
}

// ─── 25 Other ────────────────────────────────────────────────────────────────
function OtherFields({ details, onChange }: { details: Details; onChange: (d: Details) => void }) {
  return (<>
    <div className="grid grid-cols-2 gap-4">
      <TI label="Brand / Manufacturer" field="brand" placeholder="e.g. Sony" details={details} onChange={onChange} />
      <TI label="Model / Version" field="model" placeholder="e.g. Alpha 7 IV" details={details} onChange={onChange} />
    </div>
    <div className="grid grid-cols-2 gap-4">
      <SI label="Condition" field="condition" details={details} onChange={onChange} options={CONDITIONS_GENERAL} />
      <TI label="Colour" field="color" placeholder="e.g. Black" details={details} onChange={onChange} />
    </div>
    <div className="grid grid-cols-2 gap-4">
      <TI label="Year / Age" field="age" placeholder="e.g. 2023" details={details} onChange={onChange} />
      <TI label="Quantity" field="quantity" type="number" placeholder="1" details={details} onChange={onChange} />
    </div>
    <TA label="Description" field="description" placeholder="Describe your item in detail." details={details} onChange={onChange} rows={3} />
  </>);
}

// ─── Main export ─────────────────────────────────────────────────────────────
export function ListingDetailFields({ itemType, details, onChange }: Props) {
  if (!itemType) return null;
  const inner = () => {
    switch (itemType) {
      case "hospitality":         return <HospitalityFields      details={details} onChange={onChange} />;
      case "room_rental":         return <RoomRentalFields        details={details} onChange={onChange} />;
      case "office_space":        return <OfficeSpaceFields       details={details} onChange={onChange} />;
      case "real_estate":         return <RealEstateFields        details={details} onChange={onChange} />;
      case "automotive":          return <AutomotiveFields        details={details} onChange={onChange} />;
      case "yachts_boats":        return <YachtsBoatsFields       details={details} onChange={onChange} />;
      case "electronics":         return <ElectronicsFields       details={details} onChange={onChange} />;
      case "gaming":              return <GamingFields            details={details} onChange={onChange} />;
      case "fashion":             return <FashionFields           details={details} onChange={onChange} />;
      case "jewelry_watches":     return <JewelryWatchesFields    details={details} onChange={onChange} />;
      case "beauty_wellness":     return <BeautyWellnessFields    details={details} onChange={onChange} />;
      case "food_dining":         return <FoodDiningFields        details={details} onChange={onChange} />;
      case "sports_fitness":      return <SportsFitnessFields     details={details} onChange={onChange} />;
      case "home_appliances":     return <HomeAppliancesFields    details={details} onChange={onChange} />;
      case "furniture":           return <FurnitureFields         details={details} onChange={onChange} />;
      case "garden_outdoor":      return <GardenOutdoorFields     details={details} onChange={onChange} />;
      case "tools_equipment":     return <ToolsEquipmentFields    details={details} onChange={onChange} />;
      case "pets_animals":        return <PetsAnimalsFields       details={details} onChange={onChange} />;
      case "books_media":         return <BooksMediaFields        details={details} onChange={onChange} />;
      case "musical_instruments": return <MusicalInstrumentsFields details={details} onChange={onChange} />;
      case "art_collectibles":    return <ArtCollectiblesFields   details={details} onChange={onChange} />;
      case "luggage_travel":      return <LuggageTravelFields     details={details} onChange={onChange} />;
      case "services":            return <ServicesFields          details={details} onChange={onChange} />;
      case "brand_collab":        return <BrandCollabFields       details={details} onChange={onChange} />;
      default:                    return <OtherFields             details={details} onChange={onChange} />;
    }
  };
  return <div className="space-y-4">{inner()}</div>;
}
