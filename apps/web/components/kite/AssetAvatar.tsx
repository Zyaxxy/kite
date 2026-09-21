"use client";

import Image from "next/image";
import { useState } from "react";
import { Building2 } from "lucide-react";
import type { MarketAsset } from "@kite/sdk";
import { getCompanyLogo } from "../../lib/company-logos";

export function AssetAvatar({
  asset,
  large = false,
  small = false,
  label,
}: {
  asset: Pick<MarketAsset, "symbol" | "logoUrl"> &
    Partial<Pick<MarketAsset, "underlyingSymbol" | "issuer" | "mint">>;
  large?: boolean;
  small?: boolean;
  label?: string;
}) {
  const [failedLogo, setFailedLogo] = useState<string | null>(null);
  const localLogo = getCompanyLogo(asset);
  const logoUrl = localLogo ?? asset.logoUrl;
  let optimizable = false;
  try {
    const url = new URL(logoUrl ?? "");
    optimizable =
      url.protocol === "https:" &&
      [
        "xstocks-metadata.backed.fi",
        "prestocks.com",
        "backpack.exchange",
      ].includes(url.hostname);
  } catch {
    /* Local logos are already compressed; remote logos use the allowed optimizer. */
  }
  const isSvg = Boolean(
    logoUrl?.toLowerCase().endsWith(".svg") ||
      logoUrl?.includes("/stock-logo/"),
  );
  const ticker =
    asset.underlyingSymbol?.slice(0, 3).toUpperCase() ??
    asset.symbol.replace(/\.US$/i, "").slice(0, 3).toUpperCase();

  return (
    <span
      className={`asset-avatar ${large ? "large" : small ? "small" : ""}`}
      title={label}
    >
      {logoUrl && failedLogo !== logoUrl ? (
        <Image
          width={64}
          height={64}
          unoptimized={!optimizable || isSvg}
          sizes={small ? "32px" : "64px"}
          src={logoUrl}
          alt={label ?? ""}
          onError={() => setFailedLogo(logoUrl)}
          loading="lazy"
        />
      ) : small ? (
        <Building2
          size={14}
          role="img"
          aria-label={label ?? "Company logo unavailable"}
        />
      ) : (
        ticker
      )}
    </span>
  );
}
