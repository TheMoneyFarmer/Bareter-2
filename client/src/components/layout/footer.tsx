import { Link } from "wouter";
import { Handshake, Mail, MapPin, Phone } from "lucide-react";
import { SiLinkedin, SiInstagram, SiX } from "react-icons/si";
import { useI18n } from "@/lib/i18n";

export function Footer() {
  const { t } = useI18n();

  return (
    <footer className="border-t bg-card">
      <div className="container px-4 py-12 mx-auto max-w-7xl">
        <div className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-4">
            <Link href="/" className="flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary">
                <Handshake className="h-5 w-5 text-primary-foreground" />
              </div>
              <span className="text-xl font-bold tracking-tight">{t("app.name")}</span>
            </Link>
            <p className="text-sm text-muted-foreground leading-relaxed">
              {t("app.description")}
            </p>
            <div className="flex items-center gap-3">
              <a
                href="#"
                className="h-9 w-9 flex items-center justify-center rounded-lg bg-secondary hover-elevate"
                data-testid="link-linkedin"
              >
                <SiLinkedin className="h-4 w-4" />
              </a>
              <a
                href="#"
                className="h-9 w-9 flex items-center justify-center rounded-lg bg-secondary hover-elevate"
                data-testid="link-instagram"
              >
                <SiInstagram className="h-4 w-4" />
              </a>
              <a
                href="#"
                className="h-9 w-9 flex items-center justify-center rounded-lg bg-secondary hover-elevate"
                data-testid="link-twitter"
              >
                <SiX className="h-4 w-4" />
              </a>
            </div>
          </div>

          <div className="space-y-4">
            <h4 className="font-semibold">{t("nav.quickLinks")}</h4>
            <nav className="flex flex-col gap-2">
              <Link href="/browse" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                {t("nav.browseListings")}
              </Link>
              <Link href="/create-listing" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                {t("nav.createListing")}
              </Link>
              <Link href="/how-it-works" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                {t("footer.howItWorks")}
              </Link>
              <Link href="/pricing" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                {t("footer.pricing")}
              </Link>
            </nav>
          </div>

          <div className="space-y-4">
            <h4 className="font-semibold">{t("nav.support")}</h4>
            <nav className="flex flex-col gap-2">
              <Link href="/help" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                {t("footer.help")}
              </Link>
              <Link href="/faq" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                {t("footer.faq")}
              </Link>
              <Link href="/terms" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                {t("footer.terms")}
              </Link>
              <Link href="/privacy" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                {t("footer.privacy")}
              </Link>
            </nav>
          </div>

          <div className="space-y-4">
            <h4 className="font-semibold">{t("nav.contact")}</h4>
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <MapPin className="h-4 w-4 flex-shrink-0" />
                <span>Dubai, United Arab Emirates</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Mail className="h-4 w-4 flex-shrink-0" />
                <span>hello@margin.ae</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Phone className="h-4 w-4 flex-shrink-0" />
                <span>+971 4 123 4567</span>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-12 pt-8 border-t flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-sm text-muted-foreground">
            &copy; {new Date().getFullYear()} {t("app.copyright")}
          </p>
          <p className="text-sm text-muted-foreground">
            {t("app.vatCompliant")}
          </p>
        </div>
      </div>
    </footer>
  );
}
