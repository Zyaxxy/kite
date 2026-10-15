import type { Metadata } from "next";

export const socialPreview = {
  url: "/images/social/kite-stocks-baskets-v2.jpg",
  width: 1200,
  height: 630,
  type: "image/jpeg",
  alt: "Kite | Research & automate Stocks & Baskets Investing, with Apple, NVIDIA, Microsoft and Tesla logos in an abstract basket.",
};

export function pageMetadata({
  title,
  description,
  ...rest
}: Metadata & { title: string; description: string }): Metadata {
  const pageTitle = `Kite | ${title}`;
  return {
    ...rest,
    title: { absolute: pageTitle },
    description,
    openGraph: {
      type: "website",
      siteName: "Kite",
      title: pageTitle,
      description,
      images: [socialPreview],
    },
    twitter: {
      card: "summary_large_image",
      title: pageTitle,
      description,
      images: [socialPreview],
    },
  };
}

export const landingMetadata = pageMetadata({
  title: "Research & automate Stocks & Baskets Investing",
  description:
    "Research tokenized stocks, build a basket and invest from your own wallet on Solana. Mainnet spot purchases, a vaultless devnet SIP/DCA demo and paper practice.",
});
