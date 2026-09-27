import type { Metadata } from "next";
import Link from "next/link";
import { legalConfig } from "@/lib/legal";
import { LegalShell } from "../legal-shell";

export const metadata: Metadata = { title: "Terms of Service — CallFlow AI" };

export default function TermsPage() {
  const c = legalConfig();
  return (
    <LegalShell title="Terms of Service">
      <p>
        These Terms of Service (the &ldquo;Terms&rdquo;) are an agreement between {c.legalName} (&ldquo;we,&rdquo; &ldquo;us&rdquo;) and the business that signs up for {c.product} (&ldquo;you&rdquo;). By creating an account, starting a pilot, or using the Service, you agree to these Terms. If you are accepting on behalf of a company, you confirm that you are authorized to do so.
      </p>
      <p>
        Section 12 contains the text-messaging terms that apply to people who receive texts through the Service.
      </p>

      <h2>1. The Service</h2>
      <p>
        {c.product} provides tools for home-service businesses. These include missed-call text-back, call answering, text messaging, scheduling, estimate follow-up, review requests, and reporting. Some features depend on third-party services such as Twilio, Google, Stripe, or AI providers, and are governed in part by their terms. We may improve or change features over time. Features marked &ldquo;beta&rdquo; or &ldquo;pilot&rdquo; are provided as-is.
      </p>

      <h2>2. Pilots and trials</h2>
      <p>
        We may offer a free pilot or trial for a set period. Unless we agree otherwise in writing, a pilot is free of charge, may be ended by either party at any time, and becomes a paid subscription only if you choose to continue.
      </p>

      <h2>3. Your account</h2>
      <p>
        Keep your login details secure and make sure the information in your account is accurate. You are responsible for everything that happens under your account and for your staff&apos;s use of the Service. Tell us promptly at {c.contactEmail} if you suspect unauthorized access.
      </p>

      <h2>4. Your responsibilities</h2>
      <ul>
        <li>
          <strong>Consent for texts.</strong> You will send text messages only to people who contacted your business or otherwise gave appropriate consent. You will honor opt-outs, which the Service processes automatically, and you will comply with the Telephone Consumer Protection Act (TCPA) and other messaging laws and carrier rules.
        </li>
        <li>
          <strong>Call recording.</strong> If you enable recording or voicemail, you are responsible for any notice and consent required by the laws where you and your callers are located.
        </li>
        <li>
          <strong>Your content.</strong> You are responsible for the message templates, prices, policies, and other information you provide, and for approving what is sent to your customers.
        </li>
        <li>
          <strong>Accurate registration information.</strong> Information you provide for phone-number and business-texting registration (such as A2P 10DLC) must be truthful and complete.
        </li>
        <li>
          <strong>Sensitive data.</strong> Do not use the Service to collect Social Security numbers, payment-card numbers, health information, or similar sensitive data.
        </li>
      </ul>

      <h2>5. Acceptable use</h2>
      <p>You will not, and will not allow others to:</p>
      <ul>
        <li>send spam, unsolicited marketing, or messages that are unlawful, deceptive, harassing, or offensive;</li>
        <li>use the Service to break any law or infringe anyone&apos;s rights;</li>
        <li>interfere with or disrupt the Service, try to access other customers&apos; data, or bypass security or usage limits;</li>
        <li>copy, resell, or reverse-engineer the Service, except as the law expressly allows.</li>
      </ul>
      <p>We may suspend accounts that violate this section or that put the Service, carriers, or other customers at risk.</p>

      <h2>6. Not an emergency service</h2>
      <p>
        <strong>{c.product} is not a replacement for 911 or emergency services and does not contact them.</strong> Automated features, including the AI receptionist, can misunderstand callers or make mistakes. You remain responsible for responding to your customers, including urgent and emergency requests. Delivery of calls and text messages depends on phone carriers and third parties and is not guaranteed.
      </p>

      <h2>7. Fees and payment</h2>
      <ul>
        <li>Paid plans are billed monthly in advance through our payment provider, at the prices shown when you subscribe. Taxes are extra where applicable.</li>
        <li>Usage beyond your plan&apos;s limits, and telecommunications fees passed through from carriers, may be charged as described in your plan.</li>
        <li>If payment fails, we may suspend the Service after giving you notice.</li>
        <li>We will give you at least 30 days&apos; notice before changing your price.</li>
        <li>Fees are non-refundable except where required by law or agreed in writing.</li>
      </ul>

      <h2>8. Term and cancellation</h2>
      <p>
        Subscriptions are month-to-month. You can cancel at any time, and cancellation takes effect at the end of the current billing period. We may end these Terms or suspend the Service if you materially breach them. After cancellation, you can request an export of your data for 30 days, after which we delete it as described in our <Link href="/privacy" className="text-brand underline">Privacy Policy</Link>.
      </p>

      <h2>9. Data</h2>
      <p>
        <strong>You own your data</strong>, including your customer records, messages, and recordings. You give us permission to host, process, and transmit that data only as needed to provide, secure, and support the Service. For your customers&apos; information, we act as your service provider and follow your instructions and our Privacy Policy. We may use aggregated, de-identified information to operate and improve the Service.
      </p>

      <h2>10. Intellectual property and feedback</h2>
      <p>
        We own the Service and its software, design, and content, other than your data. If you send us suggestions, we may use them without any obligation to you.
      </p>

      <h2>11. Disclaimers, limitation of liability, and indemnity</h2>
      <ul>
        <li>
          The Service is provided <strong>&ldquo;as is&rdquo; and &ldquo;as available.&rdquo;</strong> To the extent the law allows, we disclaim all implied warranties, including merchantability, fitness for a particular purpose, and non-infringement. We do not guarantee any particular number of calls answered, jobs booked, or revenue recovered.
        </li>
        <li>
          To the extent the law allows, neither party is liable for indirect, incidental, special, consequential, or punitive damages, or for lost profits or revenue. Our total liability for any claim relating to the Service is limited to the fees you paid us in the 12 months before the claim.
        </li>
        <li>
          You will defend and indemnify us against third-party claims arising from your messages, your content, your customer consents, or your breach of these Terms or applicable law.
        </li>
      </ul>

      <h2 id="sms-terms">12. Text messaging terms (for people who receive texts)</h2>
      <p>
        Businesses use {c.product} to send text messages to their customers. If you receive these texts:
      </p>
      <ul>
        <li>
          <strong>What you&apos;ll receive:</strong> messages from the business you contacted about your call, service request, appointment, estimate, or feedback on completed work.
        </li>
        <li>
          <strong>How often:</strong> message frequency varies based on your interactions with the business.
        </li>
        <li>
          <strong>Cost:</strong> message and data rates may apply.
        </li>
        <li>
          <strong>Opt out:</strong> reply <strong>STOP</strong> at any time to stop receiving messages. You will receive one confirmation. Reply <strong>START</strong> to opt back in.
        </li>
        <li>
          <strong>Help:</strong> reply <strong>HELP</strong>, or contact {c.contactEmail}.
        </li>
        <li>Carriers are not liable for delayed or undelivered messages.</li>
        <li>
          Your information is handled as described in our <Link href="/privacy" className="text-brand underline">Privacy Policy</Link>. No mobile information will be shared with third parties or affiliates for marketing or promotional purposes.
        </li>
      </ul>

      <h2>13. Governing law</h2>
      <p>
        These Terms are governed by the laws of the State of {c.state}, without regard to its conflict-of-law rules. Any dispute will be resolved in the state or federal courts located in {c.county}, {c.state}, and both parties consent to their jurisdiction.
      </p>

      <h2>14. Changes and general terms</h2>
      <p>
        We may update these Terms. We will post the new version here and notify business customers of material changes at least 30 days in advance. Continuing to use the Service after changes take effect means you accept them. If any part of these Terms is unenforceable, the rest remains in effect. These Terms, together with any order form or written pilot agreement, are the entire agreement between us about the Service. You may not transfer these Terms without our consent.
      </p>
    </LegalShell>
  );
}
