"use client";

import { CanarySection } from "@/components/CanarySection";
import { RadarSection } from "@/components/RadarSection";
import { ScanSection } from "@/components/ScanSection";
import { TimelineSection } from "@/components/TimelineSection";

export default function Home() {
  return (
    <main>
      <h1>
        <span className="shield">🛡️</span> Don&apos;t Train On Me
      </h1>
      <p className="tagline">
        Measure your site&apos;s exposure to AI training crawlers. Deploy machine-readable opt-outs.
        Verify the fix yourself. Every result links to the raw evidence.
      </p>

      <ScanSection />

      <RadarSection />

      <TimelineSection />

      <CanarySection />

      {/* ── honesty module: what this can and cannot do ── */}
      <section className="card trust-card">
        <h2>
          <span className="num">§</span> WHAT THIS CAN AND CANNOT DO
        </h2>
        <div className="body trust-body">
          <div>
            <h3>✓ Can</h3>
            <ul>
              <li>Measure exposure against 170+ documented AI crawlers (community ai.robots.txt list)</li>
              <li>Publish legally meaningful opt-outs (EU DSM Art. 4(3))</li>
              <li>Create obligations for GPAI providers under EU AI Act Art. 53(1)(c)</li>
              <li>Verify your deployed configuration, with evidence links</li>
            </ul>
          </div>
          <div>
            <h3>✗ Cannot</h3>
            <ul>
              <li>Physically stop a scraper that ignores robots.txt</li>
              <li>Audit what any model was actually trained on</li>
              <li>Detect unauthorized use of your content post-training</li>
              <li>Replace legal advice — this is a technical control, not counsel</li>
            </ul>
          </div>
        </div>
        <p className="method-note trust-footnote">
          The only complete protection is access control: content that was never fetched cannot be
          trained on. Everything here reduces exposure within the limits of public-web publishing.
        </p>
      </section>

      {/* ── research references ── */}
      <section className="card refs-card">
        <h2>
          <span className="num">§§</span> RESEARCH REFERENCES
        </h2>
        <div className="body">
          <ul className="ref-list">
            <li>
              Directive (EU) 2019/790 on Copyright in the Digital Single Market, Arts. 3–4 (TDM
              exception &amp; opt-out) —{" "}
              <a href="https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32019L0790" target="_blank" rel="noreferrer noopener">eur-lex.europa.eu</a>
            </li>
            <li>
              Regulation (EU) 2024/1689 (AI Act), Art. 53(1)(c)–(d): GPAI copyright policy &amp;
              training-data summaries —{" "}
              <a href="https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=OJ:L_202401689" target="_blank" rel="noreferrer noopener">eur-lex.europa.eu</a>
            </li>
            <li>
              U.S. Copyright Office, <i>Copyright and AI, Part 3: Generative AI Training</i> (May
              2025) —{" "}
              <a href="https://www.copyright.gov/ai/Copyright-and-Artificial-Intelligence-Part-3-Generative-AI-Training-Report-Pre-Publication-Version.pdf" target="_blank" rel="noreferrer noopener">copyright.gov/ai</a>
            </li>
            <li>
              Glaze: protecting artists from style mimicry —{" "}
              <a href="https://glaze.cs.uchicago.edu/" target="_blank" rel="noreferrer noopener">glaze.cs.uchicago.edu</a>{" "}
              · Nightshade: data poisoning deterrent —{" "}
              <a href="https://nightshade.cs.uchicago.edu/" target="_blank" rel="noreferrer noopener">nightshade.cs.uchicago.edu</a>
            </li>
            <li>
              IETF AI Preferences (aipref) Working Group charter —{" "}
              <a href="https://datatracker.ietf.org/doc/charter-ietf-aipref/" target="_blank" rel="noreferrer noopener">datatracker.ietf.org</a>
            </li>
            <li>
              C2PA Content Credentials provenance standard —{" "}
              <a href="https://c2pa.org/" target="_blank" rel="noreferrer noopener">c2pa.org</a>
            </li>
            <li>
              Carlini et al., <i>Stealing Part of a Production Language Model</i> (2024):
              canary-based training-membership detection —{" "}
              <a href="https://arxiv.org/abs/2403.06634" target="_blank" rel="noreferrer noopener">arxiv.org/abs/2403.06634</a>
            </li>
            <li>
              SIGIL: publish-time canary watermarks for training-membership evidence —{" "}
              <a href="https://arxiv.org/html/2606.06502" target="_blank" rel="noreferrer noopener">arxiv.org/html/2606.06502</a>
            </li>
            <li>
              DE-COP: Detecting Copyrighted Content in Language Models Training Data —{" "}
              <a href="https://arxiv.org/abs/2402.09910" target="_blank" rel="noreferrer noopener">arxiv.org/abs/2402.09910</a>
            </li>
            <li>
              Beyond Public Access in LLM Pre-Training Data (O'Reilly DE-COP study on GPT-4o) —{" "}
              <a href="https://arxiv.org/abs/2505.00020" target="_blank" rel="noreferrer noopener">arxiv.org/abs/2505.00020</a>
            </li>
            <li>
              Common Crawl — open web corpus &amp; CDX index API used by our corpus check —{" "}
              <a href="https://commoncrawl.org/" target="_blank" rel="noreferrer noopener">commoncrawl.org</a>
            </li>
            <li>
              RSL 1.0 — Really Simple Licensing standard &amp; Collective —{" "}
              <a href="https://rslstandard.org/" target="_blank" rel="noreferrer noopener">rslstandard.org</a>{" "}
              ·{" "}
              <a href="https://rslcollective.org/" target="_blank" rel="noreferrer noopener">rslcollective.org</a>
            </li>
            <li>
              Spawning AI: Have I Been Trained? / DO NOT TRAIN registry —{" "}
              <a href="https://spawning.ai/" target="_blank" rel="noreferrer noopener">spawning.ai</a>
            </li>
          </ul>
          <p className="method-note" style={{ borderTop: "none", marginBottom: 0 }}>
            Full analysis with findings and limitations:{" "}
            <a href="https://github.com/zeecares/4allhuman/blob/main/research/protecting-human-content-from-ai-training.md" target="_blank" rel="noreferrer noopener">
              /research/protecting-human-content-from-ai-training.md
            </a>
          </p>
        </div>
      </section>

      <footer>
        Open source · nothing stored · no API keys · methodology and research notes in{" "}
        <a href="https://github.com/zeecares/4allhuman" target="_blank" rel="noreferrer noopener">
          github.com/zeecares/4allhuman
        </a>
      </footer>
    </main>
  );
}
