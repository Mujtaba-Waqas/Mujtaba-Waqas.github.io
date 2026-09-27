import type { Metadata } from "next";
import { legalConfig } from "@/lib/legal";
import { LegalShell } from "../legal-shell";

export const metadata: Metadata = { title: "Privacy Policy — CallFlow AI" };

export default function PrivacyPage() {
  const c = legalConfig();
  return (
    <LegalShell title="Privacy Policy">
      <p>
        This Privacy Policy explains how {c.legalName} (&ldquo;we,&rdquo; &ldquo;us&rdquo;) collects, uses, and protects information through {c.product} (the &ldquo;Service&rdquo;). The Service helps home-service businesses, such as HVAC companies, answer calls, send text messages, schedule appointments, and follow up with their customers.
      </p>

      <h2>1. Who this policy covers</h2>
      <ul>
        <li>
          <strong>Business customers</strong>: the companies that sign up for the Service, and their staff who use it.
        </li>
        <li>
          <strong>Their customers</strong>: people who call, text, or request service or estimates from a business that uses {c.product} (for example, homeowners).
        </li>
      </ul>
      <p>
        When we handle information about a business&apos;s customers, we do so <strong>on behalf of that business</strong>, as its service provider. The business decides how that information is used, and its own privacy policy also applies. If you are a homeowner with a question about your information, you can contact the business directly or contact us, and we will help or pass your request to the business.
      </p>

      <h2>2. Information we collect</h2>
      <h3>From business customers</h3>
      <ul>
        <li>Account details: name, email address, password (stored only as a secure hash), role, and company information.</li>
        <li>Business settings: hours, service area, services, pricing guidelines, message templates, and team members.</li>
        <li>Billing information: processed by our payment provider (Stripe). We do not store full card numbers.</li>
      </ul>
      <h3>About a business&apos;s customers (processed on the business&apos;s behalf)</h3>
      <ul>
        <li>Name, phone number, email address, and service address.</li>
        <li>Details about the service requested, appointments, estimates, and reviews.</li>
        <li>Call information: phone numbers, call times, and where enabled, call recordings, voicemails, and transcripts.</li>
        <li>Text messages sent and received, and text-message opt-in and opt-out status.</li>
      </ul>
      <h3>Automatically</h3>
      <ul>
        <li>Technical and log data such as IP address, browser type, and pages visited, used to operate and secure the Service.</li>
        <li>One essential cookie that keeps you signed in. We do not use advertising or cross-site tracking cookies.</li>
      </ul>

      <h2>3. How we use information</h2>
      <ul>
        <li>To provide the Service: answering and routing calls, sending the text messages a business has set up, scheduling, follow-ups, and alerts to the business&apos;s staff.</li>
        <li>To support, secure, and maintain the Service, including preventing fraud and abuse.</li>
        <li>To bill business customers and communicate with them about their account.</li>
        <li>To improve the Service using aggregated or de-identified information.</li>
        <li>To comply with legal obligations and enforce our Terms.</li>
      </ul>
      <p>
        <strong>Automated and AI features.</strong> The Service uses automated rules and may use third-party artificial-intelligence providers to understand requests, summarize calls, and suggest replies. Where a provider offers the option, we configure it so that information we send is not used to train that provider&apos;s models. AI output can contain mistakes, and businesses remain responsible for reviewing their communications.
      </p>

      <h2>4. Text messaging (SMS)</h2>
      <p>
        Text messages are sent on behalf of the business you contacted, about your call, service request, appointment, or estimate. Message frequency varies. Message and data rates may apply. Reply <strong>STOP</strong> at any time to stop receiving messages, or <strong>HELP</strong> for help.
      </p>
      <p>
        <strong>No mobile information will be shared with third parties or affiliates for marketing or promotional purposes.</strong> Text-messaging opt-in data and consent are not shared with any third parties, except service providers (such as our telecommunications provider) that need it to deliver the messages.
      </p>

      <h2>5. Call recordings</h2>
      <p>
        If a business enables call recording or voicemail, callers are told at the start of the call. Recordings are available only to the business and are used to provide the Service. Businesses are responsible for complying with call-recording and consent laws that apply to them and their callers.
      </p>

      <h2>6. How we share information</h2>
      <p>
        <strong>We do not sell personal information</strong>, and we do not share it for cross-context behavioral advertising. We share information only:
      </p>
      <ul>
        <li>With the business customer the information belongs to.</li>
        <li>
          With service providers that help us run the Service under contracts that protect the information. These include hosting (for example, Vercel), databases (for example, Neon), telecommunications (for example, Twilio), payments (Stripe), and, where enabled, AI and calendar providers (for example, OpenAI and Google).
        </li>
        <li>When required by law, or to protect the rights, safety, and security of people or the Service.</li>
        <li>In connection with a merger, acquisition, or sale of assets, subject to this policy.</li>
      </ul>

      <h2>7. How long we keep information</h2>
      <p>
        We keep information for as long as a business&apos;s account is active or as needed to provide the Service. After an account is closed, we delete or de-identify its data within 90 days, unless we must keep it longer to meet legal obligations, resolve disputes, or enforce agreements. Backups are overwritten on a regular schedule. Businesses can ask us to delete specific records at any time.
      </p>

      <h2>8. Security</h2>
      <p>
        We use reasonable safeguards, including encryption in transit, hashed passwords, role-based access controls, separation between business accounts, and audit logs. No system is completely secure, so we cannot guarantee absolute security. If we learn of a security incident that affects your information, we will notify you as required by law.
      </p>

      <h2>9. Your choices and rights</h2>
      <ul>
        <li>
          <strong>Text messages:</strong> reply STOP to opt out at any time.
        </li>
        <li>
          <strong>Access, correction, and deletion:</strong> contact the business you dealt with, or email us at {c.contactEmail}. We will respond or forward your request to the business. Depending on where you live, you may have additional rights under state privacy laws, and we will honor them as those laws require.
        </li>
        <li>
          <strong>Business customers</strong> can view, export, and correct their data in the Service, or contact us.
        </li>
      </ul>

      <h2>10. Children</h2>
      <p>The Service is intended for businesses and adults. It is not directed to children under 16, and we do not knowingly collect their personal information.</p>

      <h2>11. Changes to this policy</h2>
      <p>We may update this policy from time to time. We will post the new version here, update the effective date, and notify business customers of material changes.</p>

      <h2>12. Contact us</h2>
      <p>
        {c.legalName}
        <br />
        {c.mailingAddress}
        <br />
        {c.contactEmail}
      </p>
    </LegalShell>
  );
}
