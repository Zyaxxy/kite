import type { MetadataRoute } from "next";
import { siteUrl } from "../lib/site";
export default function sitemap(): MetadataRoute.Sitemap {
  return ["/", "/markets", "/baskets", "/privacy", "/terms"].map((path) => ({
    url: new URL(path, siteUrl()).href,
    changeFrequency: "weekly",
    priority: path === "/" ? 1 : 0.6,
  }));
}
