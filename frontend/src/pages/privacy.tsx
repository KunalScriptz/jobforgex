import { Link } from "react-router-dom";

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-muted/30">
      <div className="mx-auto max-w-3xl px-4 py-12">
        <div className="mb-8 flex items-center gap-3">
          <Link to="/" className="text-sm text-muted-foreground hover:text-foreground">&larr; Back to Home</Link>
        </div>
        <h1 className="mb-2 text-3xl font-bold">Privacy Policy</h1>
        <p className="mb-8 text-sm text-muted-foreground">Last updated: July 2026</p>

        <div className="prose prose-slate max-w-none space-y-6 text-sm leading-relaxed">
          <section>
            <h2 className="text-lg font-semibold">1. Information We Collect</h2>
            <p>
              When you sign in with Google, we receive your email address and name from your Google profile.
              We store this information to identify your account. We do not access your Google Drive, contacts, or any other Google data.
            </p>
            <p>
              We also store the content you create within the application: your resume (LaTeX source), job applications, cover letters, job descriptions you save, and AI-generated documents.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">2. How We Use Your Information</h2>
            <ul className="list-disc space-y-1 pl-5">
              <li>To provide the core service: generating tailored resumes, cover letters, and ATS scores</li>
              <li>To send activity digest emails (if you remain active)</li>
              <li>To process payments via Razorpay (we never store your full payment card details)</li>
              <li>To improve the service and debug issues</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold">3. AI Processing</h2>
            <p>
              When you generate a resume or cover letter, your base resume (LaTeX) and job description are sent to the DeepSeek AI API for processing. DeepSeek does not use your data for model training. We do not share your data with any other third-party AI providers.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">4. Data Storage & Security</h2>
            <p>
              Your data is stored on our self-hosted servers (PostgreSQL, MinIO object storage). We use industry-standard encryption for data at rest and in transit. Your Google authentication is handled via OAuth 2.0 — we never see or store your Google password.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">5. Data Deletion</h2>
            <p>
              You can permanently delete your account and all associated data at any time from the Settings page. This action removes all workspaces, jobs, resumes, cover letters, and generated documents from our servers. Deletion is immediate and irreversible.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">6. Cookies</h2>
            <p>
              We use a single session cookie to maintain your login state. We do not use tracking cookies, analytics cookies, or third-party advertising cookies.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">7. Contact</h2>
            <p>
              If you have questions about this privacy policy or your data, reach out to us at{" "}
              <a href="mailto:support@helixos.pro" className="text-primary underline">support@helixos.pro</a>.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
