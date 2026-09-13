import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { Brand } from "./Brand";
import { projectIssuesUrl, supportEmail } from "../../lib/site";

export function LegalPage({
  title,
  introduction,
  children,
}: {
  title: string;
  introduction: string;
  children: React.ReactNode;
}) {
  return (
    <div className="legal-page">
      <header className="landing-nav">
        <Brand />
        <Link href="/app" className="btn small">
          Open Kite <ArrowUpRight size={16} />
        </Link>
      </header>
      <main id="main-content" className="legal-content">
        <p className="eyebrow">KITE / YOUR INFORMATION</p>
        <h1>{title}</h1>
        <p className="legal-intro">{introduction}</p>
        <p className="muted">Updated 13 September 2026</p>
        {children}
        <section>
          <h2>Contact</h2>
          <p>
            {supportEmail ? (
              <a className="text-link" href={`mailto:${supportEmail}`}>
                {supportEmail}
              </a>
            ) : (
              <>
                Reach the maintainers through{" "}
                <a className="text-link" href={projectIssuesUrl}>
                  Kite’s project support
                </a>
                . Public issues are visible to everyone; do not post personal
                information, private keys or account credentials.
              </>
            )}
          </p>
        </section>
      </main>
      <footer className="legal-footer">
        <Link href="/privacy">Privacy policy</Link>
        <Link href="/terms">Terms &amp; conditions</Link>
        <Link href="/">Back to Kite</Link>
      </footer>
    </div>
  );
}
