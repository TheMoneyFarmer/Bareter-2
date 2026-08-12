/**
 * Single source of truth for "is this account allowed to trade?".
 *
 * This file exists because the client badge and the server gate used to be two
 * separate functions, both named `isUserVerified`, with different signatures
 * and different rules. The badge counted a verified phone as verified; the
 * server demanded an approved Didit KYC. A beta user with email + WhatsApp
 * verified saw a green "Verified" badge and was still refused at listing
 * creation. Both sides now import from here so that can never drift again.
 *
 * ── The rule ────────────────────────────────────────────────────────────────
 *
 *   Individual / creator accounts:  email + phone verified. That is all.
 *                                   Identity KYC is NEVER required of them.
 *
 *   Business accounts:              email + phone verified AND an approved
 *                                   trade licence (KYB). Commercial sellers
 *                                   carry regulatory obligations an individual
 *                                   swapping a vinyl record does not.
 *
 * An admin-set `isVerified` flag, or an already-approved KYC/KYB, satisfies the
 * requirement outright — those are strictly stronger signals than email+phone,
 * so a user who has done more is never punished for it.
 */

export type AccountType = "individual" | "creator" | "business" | (string & {});

export interface VerificationFacts {
  accountType?: string | null;
  emailVerified?: boolean | null;
  phoneVerified?: boolean | null;
  kycStatus?: string | null;
  kybStatus?: string | null;
  isVerified?: boolean | null;
  /** Set when the account was created through / linked to Google Sign-In. */
  googleId?: string | null;
  /** Set when the account was created through / linked to Apple Sign-In. */
  appleId?: string | null;
}

/**
 * Whether the account's email address can be considered confirmed.
 *
 * Signing in with Google or Apple IS email verification — the provider already
 * proved ownership, and we never send those users a confirmation link, so
 * `email_verified` stays false on their row forever. Gating on the raw column
 * alone would lock out every OAuth user on the platform and tell them to check
 * an inbox for a mail that was never sent.
 *
 * Checking the OAuth ids here (rather than only backfilling the column) means
 * existing rows work the moment this ships, with no dependency on a migration
 * having run first.
 */
export function hasVerifiedEmail(user: VerificationFacts): boolean {
  return user.emailVerified === true || !!user.googleId || !!user.appleId;
}

/** Business accounts are the only ones that carry a KYB/trade-licence duty. */
export function isBusinessAccount(accountType?: string | null): boolean {
  return accountType === "business";
}

/**
 * Why an account cannot yet transact, or `null` when it can.
 *
 * Returns a machine-readable reason plus the copy and destination the UI should
 * show, so every gate in the app explains the same next step in the same words
 * instead of each route inventing its own vague "you must be verified".
 */
export type VerificationBlock = {
  /** Stable code for clients to branch on. */
  code:
    | "EMAIL_VERIFICATION_REQUIRED"
    | "PHONE_VERIFICATION_REQUIRED"
    | "TRADE_LICENSE_REQUIRED";
  message: string;
  /** In-app route that resolves the block. */
  actionUrl: string;
  actionLabel: string;
};

export function getVerificationBlock(
  user: VerificationFacts,
  action: "list" | "trade" = "list",
): VerificationBlock | null {
  const verb = action === "trade" ? "start a trade" : "create a listing";

  // A manual admin flag, or an already-completed identity/business check,
  // clears the email+phone floor outright. All three involve a human or a
  // document review that is strictly stronger evidence than a confirmation
  // link — an approved trade licence is the most-vetted state on the platform,
  // so it would be perverse to then block that account over an unconfirmed
  // WhatsApp number. This can only ever REDUCE friction, never add it.
  const alreadyCleared =
    user.isVerified === true ||
    user.kycStatus === "APPROVED" ||
    user.kybStatus === "APPROVED";

  if (!alreadyCleared && !hasVerifiedEmail(user)) {
    return {
      code: "EMAIL_VERIFICATION_REQUIRED",
      message: `Please verify your email address to ${verb}. We sent you a verification link — open it, then try again.`,
      actionUrl: "/settings?tab=account",
      actionLabel: "Verify email",
    };
  }

  if (!alreadyCleared && user.phoneVerified !== true) {
    return {
      code: "PHONE_VERIFICATION_REQUIRED",
      message: `Please verify your WhatsApp number to ${verb}. It takes about a minute and lets trade partners reach you.`,
      actionUrl: "/settings?tab=account",
      actionLabel: "Verify WhatsApp",
    };
  }

  // Business-only. Individuals and creators stop at email + phone — they are
  // never asked for identity KYC.
  if (isBusinessAccount(user.accountType) && user.kybStatus !== "APPROVED") {
    return {
      code: "TRADE_LICENSE_REQUIRED",
      message: `Business accounts need an approved trade licence to ${verb}. Upload yours and we'll review it — usually within one working day.`,
      actionUrl: "/settings?tab=business",
      actionLabel: "Upload trade licence",
    };
  }

  return null;
}

/** Convenience boolean over {@link getVerificationBlock}. */
export function canTransact(
  user: VerificationFacts,
  action: "list" | "trade" = "list",
): boolean {
  return getVerificationBlock(user, action) === null;
}

/**
 * Whether to render the "Verified" badge. Deliberately identical to
 * {@link canTransact} — the badge must never promise access the gate refuses.
 */
export function isAccountVerified(user: VerificationFacts): boolean {
  return canTransact(user, "list");
}
