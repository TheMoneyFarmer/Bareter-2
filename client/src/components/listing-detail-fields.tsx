import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { FormLabel } from "@/components/ui/form";

export type ItemType = "real_estate" | "automotive" | "electronics" | "fashion" | "furniture" | "other" | "";

export const ITEM_TYPE_LABELS: Record<Exclude<ItemType, "">, string> = {
  real_estate: "Real Estate",
  automotive: "Automotive",
  electronics: "Electronics & Gadgets",
  fashion: "Fashion & Apparel",
  furniture: "Furniture & Home",
  other: "Other",
};

const CONDITIONS_GENERAL = ["Brand New", "Like New", "Good", "Fair", "Damaged"];
const CONDITIONS_PROPERTY = ["Brand New / Off-plan", "Good Condition", "Needs Renovation"];
const CONDITIONS_VEHICLE = ["Brand New", "Like New", "Good", "Fair", "Needs Repair"];
const CONDITIONS_FASHION = ["Brand New with Tags", "Brand New without Tags", "Like New", "Good", "Fair"];

type Details = Record<string, string | number | boolean | string[]>;

interface Props {
  itemType: ItemType;
  details: Details;
  onChange: (details: Details) => void;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <FormLabel className="text-sm">{label}</FormLabel>
      {children}
    </div>
  );
}

function TextInput({ label, field, placeholder, details, onChange, type = "text" }: {
  label: string; field: string; placeholder?: string; details: Details;
  onChange: (d: Details) => void; type?: string;
}) {
  return (
    <Field label={label}>
      <Input
        type={type}
        placeholder={placeholder}
        value={(details[field] as string) ?? ""}
        onChange={(e) => onChange({ ...details, [field]: e.target.value })}
      />
    </Field>
  );
}

function SelectInput({ label, field, options, placeholder, details, onChange }: {
  label: string; field: string; options: string[]; placeholder?: string;
  details: Details; onChange: (d: Details) => void;
}) {
  return (
    <Field label={label}>
      <Select value={(details[field] as string) ?? ""} onValueChange={(v) => onChange({ ...details, [field]: v })}>
        <SelectTrigger><SelectValue placeholder={placeholder ?? `Select ${label.toLowerCase()}`} /></SelectTrigger>
        <SelectContent>
          {options.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
        </SelectContent>
      </Select>
    </Field>
  );
}

function CheckboxGroup({ label, field, options, details, onChange }: {
  label: string; field: string; options: string[]; details: Details; onChange: (d: Details) => void;
}) {
  const current = (details[field] as string[]) ?? [];
  const toggle = (opt: string) => {
    const next = current.includes(opt) ? current.filter((x) => x !== opt) : [...current, opt];
    onChange({ ...details, [field]: next });
  };
  return (
    <Field label={label}>
      <div className="flex flex-wrap gap-x-4 gap-y-2">
        {options.map((opt) => (
          <label key={opt} className="flex items-center gap-2 text-sm cursor-pointer">
            <Checkbox checked={current.includes(opt)} onCheckedChange={() => toggle(opt)} />
            {opt}
          </label>
        ))}
      </div>
    </Field>
  );
}

// ─── Real Estate ─────────────────────────────────────────────────────────────
function RealEstateFields({ details, onChange }: { details: Details; onChange: (d: Details) => void }) {
  return (
    <>
      <SelectInput label="Property Type" field="propertyType" details={details} onChange={onChange}
        options={["Villa", "Apartment", "Studio", "Penthouse", "Townhouse", "Office", "Warehouse", "Retail Space", "Land", "Other"]} />
      <div className="grid grid-cols-2 gap-4">
        <TextInput label="Size (sqft)" field="sizeSqft" type="number" placeholder="e.g. 1500" details={details} onChange={onChange} />
        <SelectInput label="Bedrooms" field="bedrooms" details={details} onChange={onChange}
          options={["Studio", "1", "2", "3", "4", "5", "6+"]} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <SelectInput label="Bathrooms" field="bathrooms" details={details} onChange={onChange}
          options={["1", "2", "3", "4", "5+"]} />
        <SelectInput label="Furnishing" field="furnishing" details={details} onChange={onChange}
          options={["Furnished", "Semi-furnished", "Unfurnished"]} />
      </div>
      <SelectInput label="Condition" field="condition" details={details} onChange={onChange} options={CONDITIONS_PROPERTY} />
      <CheckboxGroup label="Amenities" field="amenities" details={details} onChange={onChange}
        options={["Pool", "Gym", "Parking", "Security 24/7", "CCTV", "Balcony", "Garden", "Concierge", "Children's Play Area", "Pet-Friendly"]} />
      <SelectInput label="View" field="view" details={details} onChange={onChange}
        options={["Sea View", "City View", "Garden View", "Pool View", "Street View", "No View"]} />
      <TextInput label="Building / Project Name" field="buildingName" placeholder="e.g. Emaar Beachfront" details={details} onChange={onChange} />
    </>
  );
}

// ─── Automotive ──────────────────────────────────────────────────────────────
function AutomotiveFields({ details, onChange }: { details: Details; onChange: (d: Details) => void }) {
  return (
    <>
      <SelectInput label="Vehicle Type" field="vehicleType" details={details} onChange={onChange}
        options={["Car", "SUV", "Pickup Truck", "Van / Minivan", "Motorcycle", "Boat", "Yacht", "Jet Ski", "Other"]} />
      <div className="grid grid-cols-2 gap-4">
        <TextInput label="Make / Brand" field="make" placeholder="e.g. Toyota" details={details} onChange={onChange} />
        <TextInput label="Model" field="model" placeholder="e.g. Land Cruiser" details={details} onChange={onChange} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <TextInput label="Year" field="year" type="number" placeholder="e.g. 2022" details={details} onChange={onChange} />
        <TextInput label="Mileage (km)" field="mileageKm" type="number" placeholder="e.g. 45000" details={details} onChange={onChange} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <SelectInput label="Fuel Type" field="fuelType" details={details} onChange={onChange}
          options={["Petrol", "Diesel", "Electric", "Hybrid", "Plug-in Hybrid", "Other"]} />
        <SelectInput label="Transmission" field="transmission" details={details} onChange={onChange}
          options={["Automatic", "Manual"]} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <TextInput label="Color" field="color" placeholder="e.g. Pearl White" details={details} onChange={onChange} />
        <SelectInput label="Number of Doors" field="doors" details={details} onChange={onChange}
          options={["2", "3", "4", "5"]} />
      </div>
      <SelectInput label="Condition" field="condition" details={details} onChange={onChange} options={CONDITIONS_VEHICLE} />
      <TextInput label="Specs / Extras" field="specs" placeholder="e.g. Full option, panoramic roof, leather seats" details={details} onChange={onChange} />
    </>
  );
}

// ─── Electronics ─────────────────────────────────────────────────────────────
function ElectronicsFields({ details, onChange }: { details: Details; onChange: (d: Details) => void }) {
  return (
    <>
      <SelectInput label="Device Type" field="deviceType" details={details} onChange={onChange}
        options={["Smartphone", "Laptop", "Tablet", "Smart Watch", "Camera", "Drone", "Gaming Console", "TV / Display", "Smart Speaker", "Headphones / AirPods", "Other"]} />
      <div className="grid grid-cols-2 gap-4">
        <TextInput label="Brand" field="brand" placeholder="e.g. Apple" details={details} onChange={onChange} />
        <TextInput label="Model" field="model" placeholder="e.g. iPhone 15 Pro Max" details={details} onChange={onChange} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <TextInput label="Storage / Capacity" field="storage" placeholder="e.g. 256GB" details={details} onChange={onChange} />
        <TextInput label="Color" field="color" placeholder="e.g. Natural Titanium" details={details} onChange={onChange} />
      </div>
      <SelectInput label="Condition" field="condition" details={details} onChange={onChange} options={CONDITIONS_GENERAL} />
      <div className="grid grid-cols-2 gap-4">
        <SelectInput label="Warranty Remaining" field="warranty" details={details} onChange={onChange}
          options={["No Warranty", "Under 3 Months", "3–6 Months", "6–12 Months", "1+ Year"]} />
        <TextInput label="Battery Health %" field="batteryHealth" type="number" placeholder="e.g. 91" details={details} onChange={onChange} />
      </div>
      <TextInput label="Accessories Included" field="accessories" placeholder="e.g. Original box, charger, case" details={details} onChange={onChange} />
    </>
  );
}

// ─── Fashion ─────────────────────────────────────────────────────────────────
function FashionFields({ details, onChange }: { details: Details; onChange: (d: Details) => void }) {
  return (
    <>
      <SelectInput label="Item Category" field="fashionCategory" details={details} onChange={onChange}
        options={["Clothing", "Shoes", "Bag / Handbag", "Watch", "Jewelry", "Belt / Wallet", "Sunglasses", "Accessories", "Other"]} />
      <div className="grid grid-cols-2 gap-4">
        <TextInput label="Brand" field="brand" placeholder="e.g. Zara, Gucci, Nike" details={details} onChange={onChange} />
        <TextInput label="Size" field="size" placeholder="e.g. M, 42, UK8" details={details} onChange={onChange} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <TextInput label="Color" field="color" placeholder="e.g. Midnight Black" details={details} onChange={onChange} />
        <SelectInput label="Gender" field="gender" details={details} onChange={onChange}
          options={["Men", "Women", "Unisex", "Kids"]} />
      </div>
      <SelectInput label="Condition" field="condition" details={details} onChange={onChange} options={CONDITIONS_FASHION} />
      <TextInput label="Material" field="material" placeholder="e.g. 100% Cotton, Genuine Leather" details={details} onChange={onChange} />
    </>
  );
}

// ─── Furniture & Home ────────────────────────────────────────────────────────
function FurnitureFields({ details, onChange }: { details: Details; onChange: (d: Details) => void }) {
  return (
    <>
      <SelectInput label="Item Type" field="furnitureType" details={details} onChange={onChange}
        options={["Sofa / Sectional", "Bed Frame", "Mattress", "Dining Table & Chairs", "Wardrobe", "Desk", "Office Chair", "Appliance", "Kitchen Item", "Lighting", "Decor", "Other"]} />
      <div className="grid grid-cols-2 gap-4">
        <TextInput label="Brand" field="brand" placeholder="e.g. IKEA, NOVO" details={details} onChange={onChange} />
        <TextInput label="Color / Finish" field="color" placeholder="e.g. Oak Wood, Grey Fabric" details={details} onChange={onChange} />
      </div>
      <TextInput label="Dimensions" field="dimensions" placeholder="e.g. 200cm x 90cm x 75cm" details={details} onChange={onChange} />
      <SelectInput label="Material" field="material" details={details} onChange={onChange}
        options={["Wood", "Metal", "Fabric", "Leather", "Glass", "Plastic", "Marble", "Mixed"]} />
      <SelectInput label="Condition" field="condition" details={details} onChange={onChange} options={CONDITIONS_GENERAL} />
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
        <TextInput label="Color" field="color" placeholder="e.g. Black" details={details} onChange={onChange} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <TextInput label="Age / Year Purchased" field="age" placeholder="e.g. 2023, 6 months old" details={details} onChange={onChange} />
        <TextInput label="Quantity" field="quantity" type="number" placeholder="1" details={details} onChange={onChange} />
      </div>
    </>
  );
}

// ─── Main export ─────────────────────────────────────────────────────────────
export function ListingDetailFields({ itemType, details, onChange }: Props) {
  if (!itemType) return null;

  const inner = () => {
    switch (itemType) {
      case "real_estate": return <RealEstateFields details={details} onChange={onChange} />;
      case "automotive":  return <AutomotiveFields details={details} onChange={onChange} />;
      case "electronics": return <ElectronicsFields details={details} onChange={onChange} />;
      case "fashion":     return <FashionFields details={details} onChange={onChange} />;
      case "furniture":   return <FurnitureFields details={details} onChange={onChange} />;
      default:            return <OtherFields details={details} onChange={onChange} />;
    }
  };

  return <div className="space-y-4">{inner()}</div>;
}
