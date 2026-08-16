/**
 * UAE neighbourhoods / communities, mapped to their parent emirate.
 *
 * Listings carry two location values: `city` (the emirate, from a dropdown) and
 * `location` (free text — the specific area the item is in). The emirate
 * allow-list gate only ever runs against `city`.
 *
 * This map exists so a user who types "Downtown Dubai", "JBR" or "Al Quoz"
 * into the free-text field is still recognised as being in Dubai — their
 * listing gets the right emirate stamped on it for filtering, and the gate
 * passes, without forcing them to also touch the dropdown.
 *
 * The map is a convenience, never a restriction: `location` accepts ANY string
 * up to 200 chars. An area that isn't listed here simply doesn't auto-resolve.
 */

export const UAE_AREAS: Record<string, string[]> = {
  Dubai: [
    "Downtown Dubai", "Dubai Marina", "JBR", "Jumeirah Beach Residence", "Business Bay",
    "DIFC", "Dubai International Financial Centre", "Palm Jumeirah", "Jumeirah", "Jumeirah 1",
    "Jumeirah 2", "Jumeirah 3", "Umm Suqeim", "Al Barsha", "Al Barsha South", "Barsha Heights",
    "Tecom", "Dubai Media City", "Dubai Internet City", "Knowledge Village", "Al Sufouh",
    "Emirates Hills", "Springs", "Meadows", "The Lakes", "The Greens", "The Views",
    "Jumeirah Lake Towers", "JLT", "Jumeirah Village Circle", "JVC", "Jumeirah Village Triangle",
    "JVT", "Jumeirah Islands", "Jumeirah Park", "Jumeirah Golf Estates", "Dubai Hills Estate",
    "Dubai Hills", "Arabian Ranches", "Arabian Ranches 2", "Arabian Ranches 3", "Motor City",
    "Sports City", "Dubai Sports City", "Studio City", "Dubai Production City", "IMPZ",
    "Dubai Silicon Oasis", "DSO", "Academic City", "International City", "Discovery Gardens",
    "Al Furjan", "Dubai South", "Expo City", "Damac Hills", "Damac Hills 2", "Town Square",
    "Mudon", "Remraam", "Serena", "Villanova", "Reem", "Mira", "Mira Oasis", "The Sustainable City",
    "Al Quoz", "Al Quoz Industrial", "Al Quoz Industrial 1", "Al Quoz Industrial 2",
    "Al Quoz Industrial 3", "Al Quoz Industrial 4", "Alserkal Avenue", "Ras Al Khor",
    "Dubai Investment Park", "DIP", "Jebel Ali", "Jebel Ali Free Zone", "JAFZA", "Dubai Industrial City",
    "Deira", "Al Rigga", "Al Muraqqabat", "Salahuddin", "Abu Hail", "Hor Al Anz", "Al Mamzar",
    "Al Nahda", "Al Qusais", "Muhaisnah", "Mirdif", "Al Warqa", "Al Warqaa", "Nad Al Sheba",
    "Meydan", "Al Khawaneej", "Al Twar", "Oud Metha", "Bur Dubai", "Al Fahidi", "Al Karama",
    "Karama", "Al Satwa", "Satwa", "Al Jaffiliya", "Zabeel", "Za'abeel", "World Trade Center",
    "Trade Centre", "Sheikh Zayed Road", "SZR", "Al Wasl", "Safa Park", "Al Manara", "Al Safa",
    "City Walk", "Bluewaters Island", "Dubai Creek Harbour", "Creek Harbour", "Dubai Festival City",
    "Culture Village", "Jaddaf", "Al Jaddaf", "Dubai Healthcare City", "Port Rashid", "Mina Rashid",
    "La Mer", "Pearl Jumeirah", "Madinat Jumeirah Living", "Al Habtoor City", "Dubai Land",
    "Dubailand", "Liwan", "Majan", "Wadi Al Safa", "Barsha South", "Nshama", "Tilal Al Ghaf",
    "The Valley", "Emaar South", "MBR City", "Mohammed Bin Rashid City", "Sobha Hartland",
  ],
  "Abu Dhabi": [
    "Al Reem Island", "Reem Island", "Yas Island", "Saadiyat Island", "Al Maryah Island",
    "Corniche", "Al Khalidiyah", "Khalidiya", "Al Bateen", "Al Mushrif", "Mushrif",
    "Al Nahyan", "Al Zahiyah", "Tourist Club Area", "Al Danah", "Madinat Zayed", "Al Wahda",
    "Electra Street", "Hamdan Street", "Al Muroor", "Al Karamah", "Al Manhal", "Al Rawdah",
    "Khalifa City", "Khalifa City A", "Khalifa City B", "Al Raha Beach", "Al Raha Gardens",
    "Al Bandar", "Al Zeina", "Al Muneera", "Masdar City", "Mohammed Bin Zayed City", "MBZ City",
    "Shakhbout City", "Al Shamkha", "Al Reef", "Al Ghadeer", "Between Two Bridges", "Bain Al Jessrain",
    "Al Mafraq", "Baniyas", "Mussafah", "Musaffah", "ICAD", "Al Falah", "Hydra Village",
    "Al Samha", "Ghantoot", "Al Rahba", "Al Dhafra", "Ruwais", "Madinat Zayed (Al Dhafra)",
    "Liwa", "Ghayathi", "Delma Island", "Sir Bani Yas",
    // Al Ain is a CITY inside the emirate of Abu Dhabi, not an emirate of its
    // own, and `active_emirates` lists only the seven emirates. Its districts
    // therefore belong here — mapping them to a top-level "Al Ain" would
    // produce a value matching nothing in the allow-list and block every
    // Al Ain resident from listing.
    "Al Ain", "Al Jimi", "Al Mutaredh", "Al Muwaiji", "Al Towayya", "Al Khabisi",
    "Al Masoudi", "Zakher", "Al Hili", "Al Sarooj", "Falaj Hazza", "Asharej",
    "Al Yahar", "Al Foah", "Shiab Al Ashkhar", "Al Maqam", "Neima", "Al Salamat",
  ],
  Sharjah: [
    "Al Majaz", "Al Majaz 1", "Al Majaz 2", "Al Majaz 3", "Al Khan", "Al Nahda (Sharjah)",
    "Al Taawun", "Al Qasimia", "Al Nasserya", "Al Mamzar (Sharjah)", "Al Layyah", "Muwaileh",
    "Muwailih Commercial", "University City", "Al Zahia", "Aljada", "Tilal City", "Al Rahmaniya",
    "Al Suyoh", "Al Tai", "Sharjah Waterfront City", "Al Heerah", "Al Riqqa", "Rolla",
    "Al Ghubaiba", "Industrial Area", "Sharjah Industrial Area", "Al Sajaa", "Al Dhaid",
    "Khor Fakkan", "Kalba", "Dibba Al Hisn", "Al Badayer", "Mleiha",
  ],
  Ajman: [
    "Al Nuaimiya", "Al Rashidiya", "Al Rumailah", "Al Jurf", "Ajman Corniche", "Al Mowaihat",
    "Al Hamidiya", "Al Zahra", "Al Bustan", "Al Rawda", "Al Sawan", "Emirates City",
    "Ajman Downtown", "Ajman Industrial Area", "Masfout", "Manama (Ajman)", "Al Helio",
    "Al Yasmeen", "Al Amerah",
  ],
  "Ras Al Khaimah": [
    "Al Nakheel", "Al Hamra Village", "Al Marjan Island", "Mina Al Arab", "Al Dhait",
    "Al Rams", "Khuzam", "Al Qusaidat", "Al Uraibi", "Julphar", "Al Jazirah Al Hamra",
    "Digdaga", "Sha'am", "Al Ghail", "Khatt", "RAK City", "RAK Free Trade Zone", "RAKEZ",
  ],
  Fujairah: [
    "Fujairah City", "Al Faseel", "Merashid", "Sakamkam", "Al Gurfa", "Dibba Al Fujairah",
    "Masafi", "Al Bidiyah", "Qidfa", "Mirbah", "Fujairah Free Zone", "Al Hayl Industrial Area",
    "Madhab", "Al Aqah",
  ],
  "Umm Al Quwain": [
    "Al Salamah", "Al Raas", "Al Humrah", "Al Dar Al Baida", "Al Riqqah", "Falaj Al Mualla",
    "UAQ Marina", "Emirates Modern Industrial Area", "Al Haditha", "Al Surra",
  ],
};

/** Flat list of every known UAE area, for autocomplete. */
export const ALL_UAE_AREAS: string[] = Object.values(UAE_AREAS).flat();

const normalise = (s: string): string =>
  s
    .toLowerCase()
    .replace(/['’`]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/** area (normalised) → emirate. Built once at module load. */
const AREA_TO_EMIRATE = new Map<string, string>();
for (const [emirate, areas] of Object.entries(UAE_AREAS)) {
  AREA_TO_EMIRATE.set(normalise(emirate), emirate);
  for (const area of areas) {
    // First writer wins, so a name repeated across emirates keeps the
    // emirate it was first listed under.
    if (!AREA_TO_EMIRATE.has(normalise(area))) {
      AREA_TO_EMIRATE.set(normalise(area), emirate);
    }
  }
}

/**
 * Best-effort emirate for a free-text location. Returns `null` when the text
 * matches nothing known — callers must treat that as "unknown", never as
 * "invalid". Free text is always accepted; this only enriches it.
 *
 * Matches, in order of confidence:
 *   1. exact area or emirate name          — "Downtown Dubai", "Sharjah"
 *   2. the emirate named anywhere in it    — "Al Barsha, Dubai"
 *   3. a known area named anywhere in it   — "Apt 4, JBR, near the tram"
 */
export function resolveEmirate(location: string | null | undefined): string | null {
  if (!location) return null;
  const text = normalise(location);
  if (!text) return null;

  const exact = AREA_TO_EMIRATE.get(text);
  if (exact) return exact;

  // An emirate named anywhere in the string wins over an area, because
  // "Al Nahda, Sharjah" should resolve to Sharjah even though Dubai also
  // has an Al Nahda.
  for (const emirate of Object.keys(UAE_AREAS)) {
    if (new RegExp(`\\b${normalise(emirate)}\\b`).test(text)) return emirate;
  }

  // Longest area name first, so "dubai investment park" is not shadowed by a
  // shorter substring that happens to also appear.
  const byLength = [...AREA_TO_EMIRATE.entries()].sort((a, b) => b[0].length - a[0].length);
  for (const [area, emirate] of byLength) {
    if (area.length >= 3 && new RegExp(`\\b${area}\\b`).test(text)) return emirate;
  }

  return null;
}
