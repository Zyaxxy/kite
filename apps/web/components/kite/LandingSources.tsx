import Image from "next/image";
import styles from "./Landing.module.css";

/** Catalog identity and infrastructure have distinct roles, not endorsement badges. */
export function LandingSources() {
  return (
    <section
      className={`${styles.container} ${styles.sourcesSection}`}
      aria-labelledby="landing-sources-title"
      data-landing-sources
    >
      <div className={styles.sourcesGrid}>
        <div className={styles.sourcesIntro}>
          <h2 id="landing-sources-title">
            Know what sits behind <em>your investment.</em>
          </h2>
          <p>Issuer catalogs, routing and reference data—each with a clear role.</p>
        </div>

        <div className={styles.sourceGroup} aria-labelledby="landing-issuers-title">
          <h3 id="landing-issuers-title">Issuer catalogs</h3>
          <ul className={styles.issuerNames} aria-label="Issuer catalogs and securities discovery">
            <li>xStocks</li>
            <li>PreStocks</li>
            <li>Backpack <span>Securities</span></li>
          </ul>
          <p>Catalog discovery. Availability and eligibility vary.</p>
        </div>

        <div className={styles.sourceGroup} aria-labelledby="landing-tools-title">
          <h3 id="landing-tools-title">Tools & data sources</h3>
          <ul className={styles.sourceTools}>
            <li>
              <a href="https://jup.ag/" target="_blank" rel="noreferrer">
                <Image src="/images/integrations/jupiter.png" width={28} height={28} alt="" />
                <span><strong>Jupiter</strong><small>Swap routing</small></span>
              </a>
            </li>
            <li>
              <a href="https://www.pyth.network/" target="_blank" rel="noreferrer">
                <Image src="/images/integrations/pyth.png" width={28} height={28} alt="" />
                <span><strong>Pyth</strong><small>Reference feeds</small></span>
              </a>
            </li>
          </ul>
          <p>Reference feeds where available. Source names do not imply endorsement.</p>
        </div>
      </div>
    </section>
  );
}
