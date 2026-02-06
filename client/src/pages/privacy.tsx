import { Link } from "wouter";

export function PrivacyPage() {
  return (
    <div className="container px-4 py-12 mx-auto max-w-4xl">
      <div className="mb-8">
        <h1 className="text-4xl font-bold mb-4">Privacy Policy</h1>
        <p className="text-muted-foreground">Last updated: February 2026</p>
      </div>

      <div className="prose prose-neutral dark:prose-invert max-w-none space-y-8">
        <section>
          <h2 className="text-2xl font-semibold mb-4">1. Introduction</h2>
          <p className="text-muted-foreground leading-relaxed">
            Margin ("Company", "we", "our", "us") is committed to protecting your privacy. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our barter marketplace platform ("Platform").
          </p>
          <p className="text-muted-foreground leading-relaxed mt-4">
            Please read this Privacy Policy carefully. By using the Platform, you consent to the practices described in this policy.
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-semibold mb-4">2. Information We Collect</h2>
          
          <h3 className="text-lg font-medium mt-6 mb-3">Personal Information</h3>
          <p className="text-muted-foreground leading-relaxed">
            When you register and use our Platform, we may collect:
          </p>
          <ul className="list-disc pl-6 mt-4 space-y-2 text-muted-foreground">
            <li>Full name and contact information (email, phone number)</li>
            <li>Business name and registration details</li>
            <li>Location information (emirate/city)</li>
            <li>Profile photos and portfolio images</li>
            <li>Trade license or identification documents for verification</li>
            <li>Payment information processed through Stripe</li>
          </ul>

          <h3 className="text-lg font-medium mt-6 mb-3">Usage Information</h3>
          <p className="text-muted-foreground leading-relaxed">
            We automatically collect certain information when you use the Platform:
          </p>
          <ul className="list-disc pl-6 mt-4 space-y-2 text-muted-foreground">
            <li>Device information (browser type, operating system)</li>
            <li>IP address and general location</li>
            <li>Pages visited and features used</li>
            <li>Time spent on the Platform</li>
            <li>Referring websites or applications</li>
          </ul>

          <h3 className="text-lg font-medium mt-6 mb-3">Transaction Information</h3>
          <p className="text-muted-foreground leading-relaxed">
            We collect information related to your barter transactions:
          </p>
          <ul className="list-disc pl-6 mt-4 space-y-2 text-muted-foreground">
            <li>Listings you create (offers and requests)</li>
            <li>Trade proposals and deal terms</li>
            <li>Chat messages with trading partners</li>
            <li>Delivery proof documentation</li>
            <li>Ratings and reviews</li>
          </ul>
        </section>

        <section>
          <h2 className="text-2xl font-semibold mb-4">3. How We Use Your Information</h2>
          <p className="text-muted-foreground leading-relaxed">
            We use the information we collect to:
          </p>
          <ul className="list-disc pl-6 mt-4 space-y-2 text-muted-foreground">
            <li>Provide, operate, and maintain the Platform</li>
            <li>Verify your business identity and credentials</li>
            <li>Facilitate barter transactions between users</li>
            <li>Process payments and manage fees</li>
            <li>Send notifications about your trades and account</li>
            <li>Respond to your inquiries and provide customer support</li>
            <li>Improve our services and develop new features</li>
            <li>Detect and prevent fraud or abuse</li>
            <li>Comply with legal obligations</li>
          </ul>
        </section>

        <section>
          <h2 className="text-2xl font-semibold mb-4">4. Information Sharing</h2>
          <p className="text-muted-foreground leading-relaxed">
            We may share your information in the following circumstances:
          </p>
          
          <h3 className="text-lg font-medium mt-6 mb-3">With Other Users</h3>
          <p className="text-muted-foreground leading-relaxed">
            Your public profile information (name, business name, location, what you offer/need, portfolio, ratings) is visible to other users. When you engage in a trade, your contact information may be shared with your trading partner.
          </p>

          <h3 className="text-lg font-medium mt-6 mb-3">With Service Providers</h3>
          <p className="text-muted-foreground leading-relaxed">
            We work with third-party service providers who help us operate the Platform, including:
          </p>
          <ul className="list-disc pl-6 mt-4 space-y-2 text-muted-foreground">
            <li>Stripe for payment processing</li>
            <li>Cloud hosting providers for data storage</li>
            <li>Email service providers for notifications</li>
            <li>Analytics tools to improve our services</li>
          </ul>

          <h3 className="text-lg font-medium mt-6 mb-3">For Legal Purposes</h3>
          <p className="text-muted-foreground leading-relaxed">
            We may disclose information if required by law, court order, or government request, or if we believe disclosure is necessary to protect our rights, prevent fraud, or ensure user safety.
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-semibold mb-4">5. Data Security</h2>
          <p className="text-muted-foreground leading-relaxed">
            We implement appropriate technical and organizational measures to protect your personal information, including:
          </p>
          <ul className="list-disc pl-6 mt-4 space-y-2 text-muted-foreground">
            <li>Encryption of data in transit and at rest</li>
            <li>Secure password hashing</li>
            <li>Regular security audits and updates</li>
            <li>Access controls limiting who can view your data</li>
            <li>Secure payment processing through PCI-compliant providers</li>
          </ul>
          <p className="text-muted-foreground leading-relaxed mt-4">
            However, no method of transmission over the Internet is 100% secure, and we cannot guarantee absolute security.
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-semibold mb-4">6. Data Retention</h2>
          <p className="text-muted-foreground leading-relaxed">
            We retain your personal information for as long as your account is active or as needed to provide services. We may retain certain information after account closure for legal, tax, or record-keeping purposes, typically for 7 years as required by UAE regulations.
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-semibold mb-4">7. Your Rights</h2>
          <p className="text-muted-foreground leading-relaxed">
            You have the following rights regarding your personal information:
          </p>
          <ul className="list-disc pl-6 mt-4 space-y-2 text-muted-foreground">
            <li><strong>Access:</strong> Request a copy of the personal information we hold about you</li>
            <li><strong>Correction:</strong> Update or correct inaccurate information</li>
            <li><strong>Deletion:</strong> Request deletion of your account and personal data</li>
            <li><strong>Portability:</strong> Request your data in a portable format</li>
            <li><strong>Objection:</strong> Object to certain processing of your information</li>
          </ul>
          <p className="text-muted-foreground leading-relaxed mt-4">
            To exercise these rights, please contact us at privacy@margin.ae.
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-semibold mb-4">8. Cookies and Tracking</h2>
          <p className="text-muted-foreground leading-relaxed">
            We use cookies and similar technologies to:
          </p>
          <ul className="list-disc pl-6 mt-4 space-y-2 text-muted-foreground">
            <li>Keep you logged into your account</li>
            <li>Remember your preferences (like dark mode)</li>
            <li>Analyze how you use the Platform</li>
            <li>Improve our services</li>
          </ul>
          <p className="text-muted-foreground leading-relaxed mt-4">
            You can manage cookie preferences through your browser settings.
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-semibold mb-4">9. International Data Transfers</h2>
          <p className="text-muted-foreground leading-relaxed">
            Your information may be processed and stored on servers located outside the UAE. We ensure appropriate safeguards are in place to protect your data in accordance with this Privacy Policy.
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-semibold mb-4">10. Children's Privacy</h2>
          <p className="text-muted-foreground leading-relaxed">
            Margin is not intended for individuals under 18 years of age. We do not knowingly collect personal information from minors. If we become aware that we have collected information from a minor, we will delete it promptly.
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-semibold mb-4">11. Changes to This Policy</h2>
          <p className="text-muted-foreground leading-relaxed">
            We may update this Privacy Policy from time to time. We will notify you of significant changes via email or through the Platform. Your continued use of the Platform after changes are posted constitutes acceptance of the updated policy.
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-semibold mb-4">12. Contact Us</h2>
          <p className="text-muted-foreground leading-relaxed">
            If you have questions about this Privacy Policy or our data practices, please contact us:
          </p>
          <div className="mt-4 text-muted-foreground">
            <p>Margin - Data Protection</p>
            <p>Dubai, United Arab Emirates</p>
            <p>Email: privacy@margin.ae</p>
            <p>Phone: +971 4 123 4567</p>
          </div>
        </section>
      </div>

      <div className="mt-12 pt-8 border-t">
        <p className="text-sm text-muted-foreground text-center">
          This Privacy Policy is effective as of February 2026 and applies to all users of the Margin platform.
        </p>
        <div className="flex justify-center gap-4 mt-6">
          <Link href="/terms" className="text-sm text-primary hover:underline">
            Terms of Service
          </Link>
          <Link href="/help" className="text-sm text-primary hover:underline">
            Help Center
          </Link>
        </div>
      </div>
    </div>
  );
}
