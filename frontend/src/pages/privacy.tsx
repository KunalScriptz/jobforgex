import { Link } from "react-router-dom";
import { PageTitle } from "@/components/page-title";
import { ArrowLeft, ShieldCheck, Mail } from "lucide-react";

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-muted/30 py-12 px-4 sm:px-6 lg:px-8">
      <PageTitle title="Privacy Policy" />
      <div className="mx-auto max-w-4xl">
        <div className="mb-6 flex items-center justify-between">
          <Link
            to="/"
            className="inline-flex items-center text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Home
          </Link>
          <div className="flex items-center space-x-2 text-xs text-muted-foreground">
            <ShieldCheck className="h-4 w-4 text-emerald-500" />
            <span>Privacy Policy Notice</span>
          </div>
        </div>

        <div className="rounded-xl border bg-card p-6 shadow-sm sm:p-10 text-card-foreground">
          <div className="border-b pb-6 mb-8">
            <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl mb-2">
              Privacy Policy Notice
            </h1>
            <p className="text-sm text-muted-foreground">
              Last revised: August 2026
            </p>
          </div>

          <div className="prose prose-slate dark:prose-invert max-w-none space-y-8 text-sm leading-relaxed">
            <section className="space-y-4">
              <p className="text-base font-medium leading-relaxed">
                Jobforge respects your privacy and is committed to protecting it through our compliance with this privacy policy (“Privacy Policy”). This Privacy Policy describes the types of information we may collect from job seekers (“you” or “user”) when you use our web-based service (“Services”) or that you may provide when you visit the website{" "}
                <a
                  href="https://jobforge.helixos.pro"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-semibold text-primary underline underline-offset-4"
                >
                  https://jobforge.helixos.pro
                </a>{" "}
                (our “Website”). We do not ask for your information unless we truly need it.
              </p>
              <p>This privacy notice applies to all information collected through our Services, including when you:</p>
              <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
                <li>
                  Visit our website at{" "}
                  <a
                    href="https://jobforge.helixos.pro"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary underline underline-offset-4"
                  >
                    https://jobforge.helixos.pro
                  </a>
                  , or any website of ours that links to this privacy notice
                </li>
                <li>
                  Download and use our application (Jobforge Website Extension), or any other application of ours that links to this privacy notice
                </li>
                <li>
                  Engage with us in other related ways, including any sales, marketing, or events
                </li>
              </ul>
            </section>

            <section className="space-y-3">
              <h2 className="text-xl font-semibold tracking-tight text-foreground border-b pb-2">
                Our Service
              </h2>
              <p className="text-muted-foreground">
                Jobforge is a job search organizer and career services platform that helps job seekers organize their search and also connects job seekers, organizations (like colleges, universities, schools, career coaching companies, outplacement companies, etc) working with job seekers (“Organizations”) and employers (“Employer”) and provides each with powerful tracking and organizational tools.
              </p>
              <p className="text-muted-foreground">
                Our System is designed to provide job seekers and Organizations with control over their data. Job seekers can fully control their profile and can determine what information they want to share on their profile and with prospective Employers. Jobforge does not share data with any third-party Organizations or Employers without your consent, and will never sell your personal data.
              </p>
              <p className="text-muted-foreground">
                This does not extend to website hosting partners and other third-party services involved in running our website, managing our operations, or assisting our users, provided they commit to keeping this information private. For more details on these third-party services, please refer to the 'Third-Party Services' section of this policy.
              </p>
            </section>

            <section className="space-y-4">
              <h2 className="text-xl font-semibold tracking-tight text-foreground border-b pb-2">
                Information We Collect About You and How We Collect It
              </h2>
              <p className="text-muted-foreground">
                We collect several types of information from and about users of our Services, including information:
              </p>
              <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
                <li>
                  By which you may be personally identified, such as name, postal address, resume, e-mail address or telephone number (“personal information”);
                </li>
                <li>
                  That is about you but individually does not identify you, such as your job preferences, education, experience, projects, details about your job search; and
                </li>
                <li>
                  About your internet connection, the equipment you use to access our Services, including mobile data, and usage details.
                </li>
              </ul>

              <h3 className="text-base font-semibold text-foreground pt-2">
                Information You Provide to Us
              </h3>
              <p className="text-muted-foreground">
                The information we collect on or through our Services may include:
              </p>
              <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
                <li>Information that you provide by creating and updating your profile.</li>
                <li>Information that you provide by filling in forms on our Services.</li>
                <li>Information that you provide on surveys from us.</li>
                <li>Information that you provide while corresponding with us.</li>
              </ul>
            </section>

            <section className="space-y-3">
              <h2 className="text-xl font-semibold tracking-tight text-foreground border-b pb-2">
                How We Use Your Information
              </h2>
              <p className="text-muted-foreground">
                We use information that we collect about you or that you provide to us, including any personal information:
              </p>
              <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
                <li>
                  To provide you with our Services. This includes allowing you to: organize your job search; connect with Employers; sign up for events; and connect with staff from your Organization, if you signed up through an invitation from an Organization.
                </li>
                <li>
                  To provide an Organization you are working with, with our Services. This includes allowing them to: track placement outcomes; keep details about job seekers they work with; and share your candidate profile with their Employer partners.
                </li>
                <li>To present our Website and its contents to you.</li>
                <li>To provide you with information, products, or services that you request from us.</li>
                <li>To answer any inquiries over the phone, or in person.</li>
                <li>To fulfill any other purpose for which you provide it.</li>
                <li>To notify you about changes to our Services or Website.</li>
                <li>In any other way we may describe when you provide the information.</li>
                <li>For any other purpose with your consent.</li>
              </ul>
            </section>

            <section className="space-y-3">
              <h2 className="text-xl font-semibold tracking-tight text-foreground border-b pb-2">
                Disclosure of Your Personal Information
              </h2>
              <p className="text-muted-foreground">
                We may disclose information when relevant law enforcement bodies request it, if we believe that disclosure is reasonably necessary to comply with the law, regulation, valid legal process or governmental or regulatory request. If we are going to release your data, we will do our best to provide you with notice in advance by email, unless we are prohibited by law from doing so.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-xl font-semibold tracking-tight text-foreground border-b pb-2">
                Disclosure of Non-Personal Information
              </h2>
              <p className="text-muted-foreground">
                We may disclose non-personal information, aggregated information, and information that does not identify any individual, without restriction. This type of information cannot be reasonably linked back to our users and may be provided to our business partners as a way to track trends and view statistical data about job applicants.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-xl font-semibold tracking-tight text-foreground border-b pb-2">
                Retention of Your Information
              </h2>
              <p className="text-muted-foreground">
                We only retain personal information for as long as necessary to provide our users with our Services. Users may deactivate their account or switch their account to private within our Services at any time. However, we may retain your information as a service provider to your Organization. If you would like us to stop processing your information, please contact your Organization with a request to delete your account.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-xl font-semibold tracking-tight text-foreground border-b pb-2">
                Third Party Links
              </h2>
              <p className="text-muted-foreground">
                Our Services may contain third party links to websites that are not operated by us. Please note that third party websites are subject to their own privacy policies and we have no control over the content and practices of these website. We do not accept responsibility or liabilities for third party links or for the data that you may provide in third party websites. Please use your discretion and review third party policies before submitting information to another website.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-xl font-semibold tracking-tight text-foreground border-b pb-2">
                Cookies
              </h2>
              <p className="text-muted-foreground">
                We use cookies to collect information about you and your activity across our Website and Services. A cookie is a small piece of data that our Website stores on your computer and allows us to understand how you use or Website and serve content to you based on your preferences. If you do not wish to accept cookies from us you should instruct your browser to refuse cookies from our Website.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-xl font-semibold tracking-tight text-foreground border-b pb-2">
                Third-Party Services
              </h2>
              <p className="text-muted-foreground">
                We utilize third-party services for user verification, user authentication, payment processing, site analytics, AI content creation, data storage, web hosting, email delivery, operational analytics and customer support. We review the privacy policies of our third-party providers before enlisting their services to ensure their practices align with ours. Third parties may only access your personal information for the specific purpose of providing the aforementioned services.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-xl font-semibold tracking-tight text-foreground border-b pb-2">
                Children Under the Age of Eighteen
              </h2>
              <p className="text-muted-foreground">
                Our Services are not intended for children under eighteen years of age. No one under age eighteen may provide any information to us. We do not knowingly collect personal information from children under eighteen. If you are under eighteen, do not use or provide any information to us. If we learn we have collected or received personal information from a child under eighteen without verification of parental consent, we will delete that information. If you believe we might have any information from or about a child under eighteen, please contact us.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-xl font-semibold tracking-tight text-foreground border-b pb-2">
                Changes to Our Privacy Policy
              </h2>
              <p className="text-muted-foreground">
                It is our policy to post any changes we make to our Privacy Policy on this page. The date the Privacy Policy was last revised is identified at the top of the page. You are responsible for periodically visiting our Website and this Privacy Policy to check for any changes.
              </p>
            </section>
            <section className="space-y-3">
              <h2 className="text-xl font-semibold tracking-tight text-foreground">
                Contact Us
              </h2>
              <p className="text-muted-foreground">
                If you have any questions or concerns regarding this Privacy Policy or our data practices, please reach out to us at:
              </p>
              <div className="flex items-center space-x-2 text-primary font-medium">
                <Mail className="h-4 w-4" />
                <a href="mailto:murkyaxe@gmail.com" className="hover:underline">
                  murkyaxe@gmail.com
                </a>
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}

