# Company and fund logos

These are authentic issuer-provided company/fund token images downloaded on 13 September 2026 from the public xStocks and PreStocks catalogs. They cover all 40 xStocks basket constituents and all nine currently published PreStocks products. The artwork retains the issuer's token branding where present; it is not generated imagery or a ticker monogram.

Each image is stored locally as a 96 × 96 WebP. Resizing preserves its aspect ratio on a transparent canvas, removes metadata, and uses quality 82. The 49 files total 59,092 bytes. The browser does not need an external image host to display them.

`manifest.json` records the verified issuer, token symbol, underlying symbol, Solana mint, original URL, source/output byte counts and output SHA-256. The catalog sources are [xStocks](https://api.xstocks.fi/api/v2/public/assets?network=Solana&page=0&pageSize=100) and [PreStocks](https://prestocks.com/products). Company and fund marks belong to their respective owners; their display identifies the corresponding asset and does not imply endorsement.

To refresh these reviewed sources, run `node scripts/download-company-logos.mjs` from the repository root after installing workspace dependencies. The script uses Next.js's installed Sharp dependency, permits only the two issuer hosts, and writes the local images and manifest. Review any issuer, mint, symbol, or logo changes before updating the manifest or the matching registry in `apps/web/lib/company-logos.ts`.

The registry prioritizes the verified Solana mint. It accepts issuer-scoped symbols only when a mint is absent, and does not infer company identity from an arbitrary token ticker. If a new constituent has not been reviewed yet, the UI can still use the live issuer logo URL or its generic unavailable-image icon.
