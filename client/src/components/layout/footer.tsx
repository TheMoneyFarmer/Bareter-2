import { Link } from "wouter";
import { Mail, MapPin, Phone } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { openCookiePreferences } from "@/lib/cookie-consent";

export function Footer() {
  const { t } = useI18n();
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
                <MapPin className="h-4 w-4 flex-shrink-0 text-bareter-teal dark:text-bareter-teal-light" />
                <span>Dubai, United Arab Emirates</span>
              </div>
              <a
                href="mailto:hello@bareter.com"
                className="flex items-center gap-2 text-sm text-bareter-navy/75 dark:text-white/70 hover:text-bareter-teal dark:hover:text-bareter-teal-light transition-colors"
              >
                <Mail className="h-4 w-4 flex-shrink-0 text-bareter-teal dark:text-bareter-teal-light" />
                <span>hello@bareter.com</span>
              </a>
              <div className="flex items-center gap-2 text-sm text-bareter-navy/75 dark:text-white/70">
                <Phone className="h-4 w-4 flex-shrink-0 text-bareter-teal dark:text-bareter-teal-light" />
                <span>+971 52 313 3512</span>
              </div>
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
