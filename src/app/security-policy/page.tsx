import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Security Policy — Don't Train On Me",
  description:
    "4allhuman responsible disclosure policy. How to report security vulnerabilities and what to expect.",
};

export default function SecurityPolicyPage() {
  return (
    <main>

      <h1>
        <span className="shield">🔒</span> Security Policy
      </h1>
      <p className="tagline">
        Responsible disclosure guidelines for 4allhuman.
      </p>

      <div className="card">
        <h2>
          <span className="num">01</span> Reporting a Vulnerability
        </h2>
        <div className="body">
          <p>
            If you believe you have found a security vulnerability in
            4allhuman, its website (4allhuman.vercel.app), the npm package, or
            any related infrastructure, please report it responsibly.
          </p>
          <p>
            Email us at{" "}
            <a href="mailto:security@4allhuman.com">security@4allhuman.com</a>{" "}
            with a description of the issue, steps to reproduce, and any proof
            of concept. Please do not publicly disclose the vulnerability until
            we have had time to investigate and address it.
          </p>
        </div>
      </div>

      <div className="card">
        <h2>
          <span className="num">02</span> Scope
        </h2>
        <div className="body">
          <p>
            The following are in scope for responsible disclosure:
          </p>
          <ul>
            <li>
              Vulnerabilities in the 4allhuman web application
              (4allhuman.vercel.app)
            </li>
            <li>
              Vulnerabilities in the <code>4allhuman</code> npm package and CLI
            </li>
            <li>
              Issues that could compromise user data, allow cross-site
              scripting, or bypass the application's security controls
            </li>
          </ul>
          <p>The following are out of scope:</p>
          <ul>
            <li>
              Reports from automated scanners without a demonstrated exploit
            </li>
            <li>
              Social engineering, phishing, or physical attacks against
              employees or infrastructure
            </li>
            <li>
              Denial-of-service attacks against the public website
            </li>
          </ul>
        </div>
      </div>

      <div className="card">
        <h2>
          <span className="num">03</span> Response Timeline
        </h2>
        <div className="body">
          <p>
            We are committed to working with security researchers to verify and
            address potential vulnerabilities. Here is what to expect:
          </p>
          <ol>
            <li>
              <strong>Acknowledgement</strong> — We will acknowledge receipt of
              your report within 48 hours.
            </li>
            <li>
              <strong>Initial Assessment</strong> — We will provide an initial
              assessment of the report within 5 business days, including whether
              we consider the issue in scope and its severity.
            </li>
            <li>
              <strong>Remediation</strong> — We will work to address confirmed
              vulnerabilities as quickly as possible. Critical issues will be
              prioritised. We will keep you informed of progress.
            </li>
            <li>
              <strong>Disclosure</strong> — Once the issue is resolved, we are
              happy to coordinate public disclosure with you and will credit
              your contribution on our{" "}
              <a href="/security-acknowledgments">acknowledgments page</a>{" "}
              (unless you prefer to remain anonymous).
            </li>
          </ol>
        </div>
      </div>

      <div className="card">
        <h2>
          <span className="num">04</span> Guidelines
        </h2>
        <div className="body">
          <p>
            We ask that researchers follow these principles when testing and
            reporting:
          </p>
          <ul>
            <li>
              Do not access, modify, or delete data that does not belong to you.
            </li>
            <li>
              Do not degrade the availability of the service for other users.
            </li>
            <li>
              Provide enough detail to allow us to reproduce and verify the
              issue.
            </li>
            <li>
              Give us reasonable time to address the issue before any public
              disclosure.
            </li>
          </ul>
        </div>
      </div>

      <div className="card">
        <h2>
          <span className="num">05</span> Contact
        </h2>
        <div className="body">
          <p>
            Security reports:{" "}
            <a href="mailto:security@4allhuman.com">security@4allhuman.com</a>
          </p>
          <p>
            Our security.txt is available at{" "}
            <a href="/.well-known/security.txt">/.well-known/security.txt</a>{" "}
            (RFC 9116 compliant).
          </p>
        </div>
      </div>

      <footer>
        Open source · nothing stored · no API keys · methodology and research
        notes in{" "}
        <a
          href="https://github.com/zeecares/4allhuman"
          target="_blank"
          rel="noreferrer noopener"
        >
          github.com/zeecares/4allhuman
        </a>
      </footer>
    </main>
  );
}
