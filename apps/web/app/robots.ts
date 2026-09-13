import type { MetadataRoute } from "next";
import { siteUrl } from "../lib/site";
export default function robots(): MetadataRoute.Robots {
  const origin = siteUrl();
  if (
    origin.hostname === "localhost" ||
    (process.env.VERCEL_ENV && process.env.VERCEL_ENV !== "production")
  )
    return { rules: { userAgent: "*", disallow: "/" } };
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", "/portfolio", "/orders", "/settings"],
    },
    sitemap: new URL("/sitemap.xml", origin).href,
  };
}
