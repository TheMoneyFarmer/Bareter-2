import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Mail, MapPin, Phone } from "lucide-react";
import {
  SiInstagram,
  SiLinkedin,
  SiTiktok,
  SiFacebook,
  SiWhatsapp,
} from "react-icons/si";
import type { IconType } from "react-icons";
import { useI18n } from "@/lib/i18n";
import { openCookiePreferences } from "@/lib/cookie-consent";

// Stylish brand-aware socials. Each item carries the on-hover brand color
// so the footer pops with a tasteful, on-brand reveal instead of a flat
// grey row. URLs default to "#" and can be wired up once the official
// handles are confirmed by the founder.
type Social = {
  name: string;
  href: string;
  Icon: IconType;
  color: string; // tailwind text color used on hover (brand color)
  glow: string;  // tailwind shadow color used on hover
};

const SOCIALS: Social[] = [
  {
    name: "Instagram",
    href: "https://www.instagram.com/bareter_barter",
    Icon: SiInstagram,
    color: "group-hover:text-[#E4405F]",
    glow: "group-hover:shadow-[0_0_24px_-4px_rgba(228,64,95,0.55)]",
  },
  {
    name: "LinkedIn",
    href: "https://www.linkedin.com/company/bareter",
    Icon: SiLinkedin,
    color: "group-hover:text-[#0A66C2]",
    glow: "group-hover:shadow-[0_0_24px_-4px_rgba(10,102,194,0.55)]",
  },
  {
    name: "TikTok",
    href: "https://www.tiktok.com/@bareter81",
    Icon: SiTiktok,
    color: "group-hover:text-[#FF0050]",
    glow: "group-hover:shadow-[0_0_24px_-4px_rgba(255,0,80,0.55)]",
  },
  {
    name: "Facebook",
    href: "https://www.facebook.com/share/1DnCWufgyZ/",
    Icon: SiFacebook,
    color: "group-hover:text-[#1877F2]",
    glow: "group-hover:shadow-[0_0_24px_-4px_rgba(24,119,242,0.55)]",
  },
  {
    name: "WhatsApp",
    href: "https://wa.me/971523133512?text=Hi!%20I%20need%20help%20with%20Bareter%20marketplace.",
    Icon: SiWhatsapp,
    color: "group-hover:text-[#25D366]",
    glow: "group-hover:shadow-[0_0_24px_-4px_rgba(37,211,102,0.55)]",
  },
];

type PublicSettings = Record<string, string | null>;

export function Footer() {
  const { t } = useI18n();
  const { data: pubSettings } = useQuery<PublicSettings>({
    queryKey: ["/api/public/settings"],
    staleTime: 60_000,
  });
  const contactEmail = pubSettings?.contact_email || "hello@bareter.com";
  const supportPhone = pubSettings?.support_phone || "+971 52 313 3512";
  const linkCls =
    "text-sm text-bareter-navy/75 dark:text-white/70 hover:text-bareter-teal dark:hover:text-bareter-teal-light transition-colors";
  const buttonLinkCls = `${linkCls} text-start bg-transparent p-0 border-0 cursor-pointer`;

  return (
    <footer
      className="bg-bareter-teal-muted dark:bg-bareter-navy-deep text-bareter-navy dark:text-white border-t border-bareter-teal/15 dark:border-white/10"
      data-testid="site-footer"
    >
      <div className="container mx-auto max-w-7xl px-4 py-14">
        <div className="grid grid-cols-1 gap-10 md:grid-cols-2 lg:grid-cols-4">
          {/* Brand column */}
          <div className="space-y-4">
            <Link href="/" className="inline-flex items-center" data-testid="footer-link-home">
              <img
                src="/logo-full-color.png"
                alt={t("app.name") || "Bareter"}
                className="h-7 w-auto block dark:hidden"
              />
              <img
                src="/logo-full-white.png"
                alt={t("app.name") || "Bareter"}
                className="h-7 w-auto hidden dark:block"
              />
            </Link>
            <p className="text-sm text-bareter-navy/75 dark:text-white/70 leading-relaxed max-w-xs">
              Barter what you have for what you need.
            </p>

            {/* Social row — stylish brand-color reveal on hover */}
            <div
              className="pt-2"
              data-testid="footer-socials"
              aria-label="Follow Bareter on social media"
            >
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-bareter-teal dark:text-bareter-teal-light mb-3">
                Follow the trade
              </p>
              <ul className="flex flex-wrap items-center gap-2.5">
                {SOCIALS.map(({ name, href, Icon, color, glow }) => (
                  <li key={name}>
                    <a
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={name}
                      data-testid={`link-social-${name.toLowerCase()}`}
                      className={`group relative inline-flex h-10 w-10 items-center justify-center rounded-xl
                        bg-white/60 dark:bg-white/5 backdrop-blur-sm
                        border border-bareter-teal/15 dark:border-white/10
                        text-bareter-navy/70 dark:text-white/75
                        transition-all duration-300 ease-out
                        hover:-translate-y-0.5 hover:border-transparent
                        ${glow}`}
                    >
                      {/* subtle gradient halo that fades in on hover */}
                      <span
                        aria-hidden
                        className="pointer-events-none absolute inset-0 rounded-xl bg-gradient-to-br from-bareter-teal/0 via-bareter-teal/0 to-bareter-teal/0 opacity-0 transition-opacity duration-300 group-hover:opacity-100 group-hover:from-white/40 group-hover:to-white/0 dark:group-hover:from-white/10 dark:group-hover:to-white/0"
                      />
                      <Icon
                        className={`relative h-[18px] w-[18px] transition-colors duration-300 ${color}`}
                      />
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* About / Categories */}
          <div className="space-y-4">
            <h4 className="text-sm font-semibold uppercase tracking-wider text-bareter-teal dark:text-bareter-teal-light">
              {t("nav.quickLinks") || "About Bareter"}
            </h4>
            <nav className="flex flex-col gap-2">
              <Link href="/how-it-works" className={linkCls}>{t("footer.howItWorks") || "How it works"}</Link>
              <Link href="/pricing" className={linkCls}>{t("footer.pricing") || "Pricing"}</Link>
              <Link href="/browse" className={linkCls}>{t("nav.browseListings") || "Browse listings"}</Link>
              <Link href="/create-listing" className={linkCls}>{t("nav.createListing") || "List a barter"}</Link>
            </nav>
          </div>

          {/* Legal */}
          <div className="space-y-4">
            <h4 className="text-sm font-semibold uppercase tracking-wider text-bareter-teal dark:text-bareter-teal-light">
              {t("nav.support") || "Legal"}
            </h4>
            <nav className="flex flex-col gap-2">
              <Link href="/help" className={linkCls} data-testid="footer-link-help">{t("footer.help") || "Help center"}</Link>
              <Link href="/faq" className={linkCls} data-testid="footer-link-faq">{t("footer.faq") || "FAQ"}</Link>
              <Link href="/terms" className={linkCls} data-testid="footer-link-terms">{t("footer.terms") || "Terms of Use"}</Link>
              <Link href="/privacy" className={linkCls} data-testid="footer-link-privacy">{t("footer.privacy") || "Privacy Policy"}</Link>
              <Link href="/legal/barter-rules" className={linkCls} data-testid="footer-link-barter-rules">Barter Rules</Link>
              <Link href="/legal/dispute-resolution" className={linkCls} data-testid="footer-link-disputes">Dispute Resolution</Link>
              <Link href="/legal/vat" className={linkCls} data-testid="footer-link-vat">VAT Policy</Link>
              <Link href="/legal/cookies" className={linkCls} data-testid="footer-link-cookies">Cookie Policy</Link>
              <Link href="/legal/acceptable-use" className={linkCls} data-testid="footer-link-aup">Acceptable Use</Link>
              <Link href="/legal/community-standards" className={linkCls} data-testid="footer-link-community">Community Standards</Link>
              <Link href="/legal/customer-agreement" className={linkCls} data-testid="footer-link-customer-agreement">Customer Agreement</Link>
              <button
                type="button"
                onClick={openCookiePreferences}
                className={buttonLinkCls}
                data-testid="footer-button-cookie-prefs"
              >
                Cookie preferences
              </button>
            </nav>
          </div>

          {/* Contact */}
          <div className="space-y-4">
            <h4 className="text-sm font-semibold uppercase tracking-wider text-bareter-teal dark:text-bareter-teal-light">
              {t("nav.contact") || "Contact"}
            </h4>
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-2 text-sm text-bareter-navy/75 dark:text-white/70">
                <MapPin className="h-4 w-4 shrink-0 text-bareter-teal dark:text-bareter-teal-light" />
                <span dir="ltr">Dubai, United Arab Emirates</span>
              </div>
              <a
                href={`mailto:${contactEmail}`}
                className="flex items-center gap-2 text-sm text-bareter-navy/75 dark:text-white/70 hover:text-bareter-teal dark:hover:text-bareter-teal-light transition-colors"
              >
                <Mail className="h-4 w-4 shrink-0 text-bareter-teal dark:text-bareter-teal-light" />
                <span dir="ltr">{contactEmail}</span>
              </a>
              <a
                href={`tel:${supportPhone.replace(/\s/g, "")}`}
                className="flex items-center gap-2 text-sm text-bareter-navy/75 dark:text-white/70 hover:text-bareter-teal dark:hover:text-bareter-teal-light transition-colors"
                data-testid="footer-link-phone"
              >
                <Phone className="h-4 w-4 shrink-0 text-bareter-teal dark:text-bareter-teal-light" />
                <span dir="ltr">{supportPhone}</span>
              </a>
            </div>
          </div>
        </div>

        {/* UAE built-in strip */}
        <div className="mt-12 pt-6 border-t border-bareter-teal/15 dark:border-white/10">
          <p className="text-xs text-bareter-navy/65 dark:text-white/55 text-center sm:text-start">
            <span className="me-2">🇦🇪</span>
            Built in the UAE
          </p>
        </div>

        {/* Copyright */}
        <div className="mt-4 flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-xs text-bareter-navy/60 dark:text-white/50">
            &copy; {new Date().getFullYear()} {t("app.copyright") || "Bareter. All rights reserved."}
          </p>
          <p className="text-xs text-bareter-navy/60 dark:text-white/50">
            {t("app.vatCompliant") || "VAT compliant for UAE businesses."}
          </p>
        </div>
      </div>
    </footer>
  );
}
