import { Link } from "wouter";

export function TermsPage() {
  return (
    <div className="container px-4 py-12 mx-auto max-w-4xl">
      <div className="mb-8">
        <h1 className="text-4xl font-bold mb-4">Terms of Service</h1>
        <p className="text-muted-foreground">Last updated: February 2026</p>
      </div>

      <div className="prose prose-neutral dark:prose-invert max-w-none space-y-8">
        <section>
          <h2 className="text-2xl font-semibold mb-4">1. Introduction</h2>
          <p className="text-muted-foreground leading-relaxed">
            Welcome to Bareter ("Company", "we", "our", "us"). These Terms of Service ("Terms") govern your access to and use of the Bareter platform, including our website, mobile applications, and services (collectively, the "Platform").
          </p>
          <p className="text-muted-foreground leading-relaxed mt-4">
            By accessing or using our Platform, you agree to be bound by these Terms. If you do not agree to these Terms, please do not use our Platform.
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-semibold mb-4">2. Eligibility</h2>
          <p className="text-muted-foreground leading-relaxed">
            To use Bareter, you must:
          </p>
          <ul className="list-disc pl-6 mt-4 space-y-2 text-muted-foreground">
            <li>Be at least 18 years of age</li>
            <li>Be a registered business or authorized representative of a business entity in the UAE</li>
            <li>Have the legal authority to enter into binding contracts</li>
            <li>Not be prohibited from using the Platform under applicable laws</li>
          </ul>
        </section>

        <section>
          <h2 className="text-2xl font-semibold mb-4">3. Account Registration</h2>
          <p className="text-muted-foreground leading-relaxed">
            When you create an account, you agree to provide accurate, current, and complete information. You are responsible for maintaining the confidentiality of your account credentials and for all activities that occur under your account.
          </p>
          <p className="text-muted-foreground leading-relaxed mt-4">
            Business verification requires submission of valid trade licenses, commercial registration, or government-issued identification. We reserve the right to reject or revoke verification at our discretion.
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-semibold mb-4">4. Barter Transactions</h2>
          <p className="text-muted-foreground leading-relaxed">
            Bareter facilitates barter exchanges between businesses. When you engage in a trade:
          </p>
          <ul className="list-disc pl-6 mt-4 space-y-2 text-muted-foreground">
            <li>You represent that you have the right to trade the goods or services listed</li>
            <li>You agree to provide accurate valuations of your offerings in AED</li>
            <li>You acknowledge that barter contracts are legally binding</li>
            <li>You are responsible for fulfilling your obligations as specified in the deal terms</li>
          </ul>
        </section>

        <section>
          <h2 className="text-2xl font-semibold mb-4">5. Fees and Payments</h2>
          <p className="text-muted-foreground leading-relaxed">
            Bareter is free to use. There are no charges for creating an account, listing items, proposing trades, generating contracts, or completing deals on the Platform.
          </p>
          <p className="text-muted-foreground leading-relaxed mt-4">
            Each party in a barter transaction remains responsible for its own taxes, costs, and any third-party fees associated with delivering the goods or services it has agreed to provide.
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-semibold mb-4">6. VAT and Tax Compliance</h2>
          <p className="text-muted-foreground leading-relaxed">
            Under UAE Federal Tax Authority regulations, barter transactions are subject to Value Added Tax (VAT) at the standard rate of 5%. Each party to a barter transaction is responsible for:
          </p>
          <ul className="list-disc pl-6 mt-4 space-y-2 text-muted-foreground">
            <li>Issuing proper VAT tax invoices for goods or services provided</li>
            <li>Reporting barter transactions in their VAT returns</li>
            <li>Maintaining records of all transactions for tax purposes</li>
            <li>Complying with all applicable UAE tax laws and regulations</li>
          </ul>
        </section>

        <section>
          <h2 className="text-2xl font-semibold mb-4">7. Prohibited Activities</h2>
          <p className="text-muted-foreground leading-relaxed">
            You agree not to:
          </p>
          <ul className="list-disc pl-6 mt-4 space-y-2 text-muted-foreground">
            <li>Use the Platform for any illegal or unauthorized purpose</li>
            <li>Post false, misleading, or fraudulent content</li>
            <li>Infringe on the intellectual property rights of others</li>
            <li>Harass, abuse, or harm other users</li>
            <li>Use automated tools to access or scrape the Platform</li>
            <li>Trade prohibited items including weapons, drugs, or counterfeit goods</li>
          </ul>
        </section>

        <section>
          <h2 className="text-2xl font-semibold mb-4">8. Dispute Resolution</h2>
          <p className="text-muted-foreground leading-relaxed">
            We encourage users to resolve disputes directly through the Platform's chat feature. If a resolution cannot be reached, you may contact our support team for assistance. However, Bareter acts as a platform facilitator and is not a party to transactions between users.
          </p>
          <p className="text-muted-foreground leading-relaxed mt-4">
            Any disputes arising from these Terms shall be governed by the laws of the United Arab Emirates and shall be subject to the exclusive jurisdiction of the courts of Dubai.
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-semibold mb-4">9. Limitation of Liability</h2>
          <p className="text-muted-foreground leading-relaxed">
            Bareter provides the Platform "as is" and "as available" without warranties of any kind. We are not liable for any indirect, incidental, special, or consequential damages arising from your use of the Platform or any transactions conducted through it.
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-semibold mb-4">10. Modifications</h2>
          <p className="text-muted-foreground leading-relaxed">
            We reserve the right to modify these Terms at any time. We will notify users of significant changes via email or through the Platform. Your continued use of the Platform after such modifications constitutes acceptance of the updated Terms.
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-semibold mb-4">11. Contact Information</h2>
          <p className="text-muted-foreground leading-relaxed">
            If you have any questions about these Terms, please contact us at:
          </p>
          <div className="mt-4 text-muted-foreground">
            <p>Bareter</p>
            <p>Dubai, United Arab Emirates</p>
            <p>Email: legal@bareter.com</p>
            <p>Phone: +971 4 123 4567</p>
          </div>
        </section>
      </div>

      <div className="mt-12 pt-8 border-t">
        <p className="text-sm text-muted-foreground text-center">
          By using Bareter, you acknowledge that you have read, understood, and agree to be bound by these Terms of Service.
        </p>
        <div className="flex justify-center gap-4 mt-6">
          <Link href="/privacy" className="text-sm text-primary hover:underline">
            Privacy Policy
          </Link>
          <Link href="/help" className="text-sm text-primary hover:underline">
            Help Center
          </Link>
        </div>
      </div>
    </div>
  );
}
