import { describe, it, expect } from "vitest";
import { getVerificationBlock, canTransact, isAccountVerified, hasVerifiedEmail } from "@shared/verification";
import { resolveEmirate, ALL_UAE_AREAS, UAE_AREAS } from "@shared/uae-areas";
import {
  ALLOWED_UPLOAD_MIMES,
  maxBytesForMime,
  MAX_IMAGE_BYTES,
  MAX_VIDEO_BYTES,
  MAX_UPLOAD_BYTES,
} from "../server/handlers/authHardening";

// Regression suite for the three bugs a beta user hit trying to post their
// first listing (a Bob Marley vinyl, Dubai, 30MB clip):
//   1. "You must be verified" despite a green Verified badge
//   2. "World Trade Center is not active" — free-text area matched vs emirates
//   3. "File too large" on a 30MB video against an advertised 50MB limit

describe("Listing/trade eligibility — individuals are never asked for KYC", () => {
  const individual = {
    accountType: "individual",
    emailVerified: true,
    phoneVerified: true,
    kycStatus: "NOT_STARTED",
    kybStatus: "NOT_STARTED",
    isVerified: false,
  };

  it("lets an individual with email + phone list, with no KYC", () => {
    expect(getVerificationBlock(individual, "list")).toBeNull();
    expect(canTransact(individual, "list")).toBe(true);
  });

  it("lets that same individual start a trade, with no KYC", () => {
    expect(getVerificationBlock(individual, "trade")).toBeNull();
  });

  it("treats a creator account exactly like an individual", () => {
    expect(getVerificationBlock({ ...individual, accountType: "creator" })).toBeNull();
  });

  it("never returns a KYC-related block for a non-business account", () => {
    const codes = [
      getVerificationBlock({ ...individual, emailVerified: false })?.code,
      getVerificationBlock({ ...individual, phoneVerified: false })?.code,
    ];
    expect(codes).not.toContain("TRADE_LICENSE_REQUIRED");
    expect(codes.every((c) => c !== undefined && !/KYC/i.test(c))).toBe(true);
  });

  it("blocks on email first, and says what to do about it", () => {
    const block = getVerificationBlock({ ...individual, emailVerified: false, phoneVerified: false });
    expect(block?.code).toBe("EMAIL_VERIFICATION_REQUIRED");
    expect(block?.message).toMatch(/verify your email/i);
    expect(block?.actionUrl).toBeTruthy();
    expect(block?.actionLabel).toBeTruthy();
  });

  it("blocks on phone once email is done, and says what to do about it", () => {
    const block = getVerificationBlock({ ...individual, phoneVerified: false });
    expect(block?.code).toBe("PHONE_VERIFICATION_REQUIRED");
    expect(block?.message).toMatch(/whatsapp/i);
  });

  it("wording differs between listing and trading so the copy fits the action", () => {
    const unverified = { ...individual, emailVerified: false };
    expect(getVerificationBlock(unverified, "list")?.message).toMatch(/create a listing/i);
    expect(getVerificationBlock(unverified, "trade")?.message).toMatch(/start a trade/i);
  });
});

describe("Listing/trade eligibility — businesses still need a trade licence", () => {
  const business = {
    accountType: "business",
    emailVerified: true,
    phoneVerified: true,
    kycStatus: "NOT_STARTED",
    kybStatus: "NOT_STARTED",
    isVerified: false,
  };

  it("blocks a business with no approved KYB", () => {
    const block = getVerificationBlock(business, "list");
    expect(block?.code).toBe("TRADE_LICENSE_REQUIRED");
    expect(block?.message).toMatch(/trade licence/i);
  });

  it("clears a business once KYB is approved", () => {
    expect(getVerificationBlock({ ...business, kybStatus: "APPROVED" })).toBeNull();
  });

  it("requires email and phone from a business that has NOT been reviewed yet", () => {
    expect(getVerificationBlock({ ...business, phoneVerified: false })?.code)
      .toBe("PHONE_VERIFICATION_REQUIRED");
    expect(getVerificationBlock({ ...business, emailVerified: false })?.code)
      .toBe("EMAIL_VERIFICATION_REQUIRED");
  });

  it("an approved trade licence clears the email/phone floor too", () => {
    // KYB approval is a document review by a human — strictly stronger
    // evidence than a confirmation link. Blocking the most-vetted account
    // class over an unconfirmed WhatsApp number would be perverse.
    expect(getVerificationBlock({ ...business, kybStatus: "APPROVED", phoneVerified: false })).toBeNull();
  });
});

describe("Existing users — accounts created before any of this shipped", () => {
  // The platform's users did not all arrive the same way. A rule that only
  // works for a fresh email+password signup would lock out most of the base.

  it("lets a Google user through even though email_verified was never set", () => {
    // Every OAuth account on the platform has email_verified = false, because
    // the sign-in paths never set it and no confirmation mail is ever sent.
    expect(getVerificationBlock({
      accountType: "individual",
      emailVerified: false,
      phoneVerified: true,
      googleId: "google-oauth-sub-12345",
    })).toBeNull();
  });

  it("lets an Apple user through, including the private-relay case", () => {
    expect(getVerificationBlock({
      accountType: "individual",
      emailVerified: false,
      phoneVerified: true,
      appleId: "apple-sub-67890",
    })).toBeNull();
  });

  it("does not tell an OAuth user to go check their inbox", () => {
    const block = getVerificationBlock({
      accountType: "individual", emailVerified: false, phoneVerified: false, googleId: "g-1",
    });
    // They may still owe us a phone, but never an email they cannot verify.
    expect(block?.code).toBe("PHONE_VERIFICATION_REQUIRED");
  });

  it("an OAuth business still needs its trade licence", () => {
    expect(getVerificationBlock({
      accountType: "business", emailVerified: false, phoneVerified: true,
      googleId: "g-2", kybStatus: "NOT_STARTED",
    })?.code).toBe("TRADE_LICENSE_REQUIRED");
  });

  it("a password user with an unverified email is still blocked", () => {
    // No OAuth id — the email gate must still mean something.
    expect(getVerificationBlock({
      accountType: "individual", emailVerified: false, phoneVerified: true,
    })?.code).toBe("EMAIL_VERIFICATION_REQUIRED");
  });

  it("an admin-created account with isVerified is cleared regardless", () => {
    expect(getVerificationBlock({
      accountType: "individual", emailVerified: false, phoneVerified: false, isVerified: true,
    })).toBeNull();
  });

  it("a legacy KYC-approved account keeps working", () => {
    expect(getVerificationBlock({
      accountType: "individual", emailVerified: false, phoneVerified: false, kycStatus: "APPROVED",
    })).toBeNull();
  });

  it("hasVerifiedEmail treats an OAuth link as proof of the address", () => {
    expect(hasVerifiedEmail({ emailVerified: true })).toBe(true);
    expect(hasVerifiedEmail({ googleId: "g" })).toBe(true);
    expect(hasVerifiedEmail({ appleId: "a" })).toBe(true);
    expect(hasVerifiedEmail({ emailVerified: false })).toBe(false);
    expect(hasVerifiedEmail({})).toBe(false);
  });
});

describe("Existing rows — the old backfill put neighbourhoods in `city`", () => {
  // `UPDATE users SET city = location` copied free text into the emirate
  // column, so many legacy rows carry "Downtown Dubai" where an emirate
  // belongs. Those must resolve, not block.
  it.each([
    "Downtown Dubai", "World Trade Center", "JBR", "Al Quoz", "Mirdif",
    "Al Reem Island", "Al Majaz", "Al Nuaimiya",
  ])("a legacy city value of %s still resolves to an emirate", (legacyCity) => {
    expect(resolveEmirate(legacyCity)).not.toBeNull();
  });

  it("a correct emirate in `city` is left exactly as it is", () => {
    for (const e of ["Dubai", "Abu Dhabi", "Sharjah", "Ajman", "Ras Al Khaimah", "Fujairah", "Umm Al Quwain"]) {
      expect(resolveEmirate(e)).toBe(e);
    }
  });
});

describe("Badge and gate can never disagree", () => {
  // The original bug: the badge counted phoneVerified as verified while the
  // server demanded kycStatus === "APPROVED".
  const cases = [
    { accountType: "individual", emailVerified: true, phoneVerified: true },
    { accountType: "individual", emailVerified: true, phoneVerified: false },
    { accountType: "individual", emailVerified: false, phoneVerified: true },
    { accountType: "business", emailVerified: true, phoneVerified: true, kybStatus: "NOT_STARTED" },
    { accountType: "business", emailVerified: true, phoneVerified: true, kybStatus: "APPROVED" },
    { accountType: "individual", emailVerified: false, phoneVerified: false, isVerified: true },
    { accountType: "individual", emailVerified: false, phoneVerified: false, kycStatus: "APPROVED" },
  ];

  it.each(cases)("badge matches the listing gate for %j", (user) => {
    expect(isAccountVerified(user)).toBe(canTransact(user, "list"));
  });

  it("an admin-set isVerified flag clears everything", () => {
    expect(canTransact({ accountType: "individual", isVerified: true })).toBe(true);
  });
});

describe("Free-text location resolves to an emirate", () => {
  it("resolves the exact area the beta user typed", () => {
    expect(resolveEmirate("World Trade Center")).toBe("Dubai");
  });

  it.each([
    ["Downtown Dubai", "Dubai"],
    ["Dubai Marina", "Dubai"],
    ["JBR", "Dubai"],
    ["Al Quoz Industrial 3", "Dubai"],
    ["DIFC", "Dubai"],
    ["Business Bay", "Dubai"],
    ["Al Reem Island", "Abu Dhabi"],
    ["Khalifa City", "Abu Dhabi"],
    ["Al Majaz", "Sharjah"],
    ["Al Nuaimiya", "Ajman"],
    ["Al Marjan Island", "Ras Al Khaimah"],
    ["Dibba Al Fujairah", "Fujairah"],
    ["Falaj Al Mualla", "Umm Al Quwain"],
    ["Al Jimi", "Abu Dhabi"],
  ])("resolves %s to %s", (area, emirate) => {
    expect(resolveEmirate(area)).toBe(emirate);
  });

  it("is case- and punctuation-insensitive", () => {
    expect(resolveEmirate("downtown  dubai")).toBe("Dubai");
    expect(resolveEmirate("Za'abeel")).toBe("Dubai");
    expect(resolveEmirate("JUMEIRAH LAKE TOWERS")).toBe("Dubai");
  });

  it("finds the area inside a longer address", () => {
    expect(resolveEmirate("Apartment 402, Marina Gate, Dubai Marina")).toBe("Dubai");
    expect(resolveEmirate("near the tram, JBR")).toBe("Dubai");
  });

  it("prefers an explicitly named emirate over an ambiguous area", () => {
    // Both Dubai and Sharjah have an Al Nahda.
    expect(resolveEmirate("Al Nahda, Sharjah")).toBe("Sharjah");
  });

  it("accepts a bare emirate name", () => {
    expect(resolveEmirate("Dubai")).toBe("Dubai");
    expect(resolveEmirate("Umm Al Quwain")).toBe("Umm Al Quwain");
  });

  it("returns null for unknown text rather than rejecting it", () => {
    expect(resolveEmirate("Narnia")).toBeNull();
    expect(resolveEmirate("")).toBeNull();
    expect(resolveEmirate(null)).toBeNull();
    expect(resolveEmirate(undefined)).toBeNull();
  });

  it("covers all seven emirates plus Al Ain", () => {
    // Exactly the seven emirates — the same set `active_emirates` holds.
    // Al Ain is a city inside Abu Dhabi, never a top-level key.
    expect(Object.keys(UAE_AREAS).sort()).toEqual([
      "Abu Dhabi", "Ajman", "Dubai", "Fujairah",
      "Ras Al Khaimah", "Sharjah", "Umm Al Quwain",
    ]);
    expect(resolveEmirate("Al Ain")).toBe("Abu Dhabi");
    expect(resolveEmirate("Al Jimi")).toBe("Abu Dhabi");
    expect(ALL_UAE_AREAS.length).toBeGreaterThan(300);
  });
});

describe("Upload limits — one multer ceiling, per-type enforcement", () => {
  it("accepts the three video MIME types the client can produce", () => {
    expect(ALLOWED_UPLOAD_MIMES.has("video/mp4")).toBe(true);
    expect(ALLOWED_UPLOAD_MIMES.has("video/quicktime")).toBe(true); // .MOV from iPhone
    expect(ALLOWED_UPLOAD_MIMES.has("video/webm")).toBe(true);
  });

  it("still accepts images and PDF", () => {
    for (const m of ["image/jpeg", "image/png", "image/gif", "image/webp", "application/pdf"]) {
      expect(ALLOWED_UPLOAD_MIMES.has(m)).toBe(true);
    }
  });

  it("gives video a 100MB ceiling and images 10MB", () => {
    expect(maxBytesForMime("video/quicktime")).toBe(MAX_VIDEO_BYTES);
    expect(maxBytesForMime("image/jpeg")).toBe(MAX_IMAGE_BYTES);
    expect(maxBytesForMime("application/pdf")).toBe(10 * 1024 * 1024);
  });

  it("would have accepted the 30MB .MOV the beta user was rejected for", () => {
    const thirtyMb = 30 * 1024 * 1024;
    expect(thirtyMb).toBeLessThanOrEqual(MAX_UPLOAD_BYTES); // clears multer
    expect(thirtyMb).toBeLessThanOrEqual(maxBytesForMime("video/quicktime")); // clears type limit
  });

  it("multer's single ceiling is at least the largest per-type limit", () => {
    // A smaller multer limit is what produced "File too large" on a video
    // that was well within the advertised video limit.
    expect(MAX_UPLOAD_BYTES).toBeGreaterThanOrEqual(MAX_VIDEO_BYTES);
    expect(MAX_UPLOAD_BYTES).toBeGreaterThanOrEqual(MAX_IMAGE_BYTES);
  });

  it("still rejects an oversized image at the image limit", () => {
    expect(11 * 1024 * 1024).toBeGreaterThan(maxBytesForMime("image/png"));
  });
});

describe("OAuth status reaches the client without leaking the ids", () => {
  it("stripAuthTokens reports an OAuth account as email-verified", async () => {
    const { stripAuthTokens } = await import("../server/security");
    const googleUser = stripAuthTokens({
      id: "u1", email: "a@b.com", emailVerified: false,
      googleId: "google-sub-1", appleId: null, password: "x",
    }) as Record<string, unknown>;

    expect(googleUser.emailVerified).toBe(true);
    // The identifiers themselves must never reach the browser.
    expect("googleId" in googleUser).toBe(false);
    expect("appleId" in googleUser).toBe(false);
    expect("password" in googleUser).toBe(false);
  });

  it("leaves a password account's emailVerified untouched", async () => {
    const { stripAuthTokens } = await import("../server/security");
    const pwUser = stripAuthTokens({
      id: "u2", email: "c@d.com", emailVerified: false,
      googleId: null, appleId: null, password: "x",
    }) as Record<string, unknown>;
    expect(pwUser.emailVerified).toBe(false);
  });
});
