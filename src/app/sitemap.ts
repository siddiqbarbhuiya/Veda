import type { MetadataRoute } from "next";
import { LEGAL_UPDATED, SITE_URL } from "@/lib/site";

export default function sitemap(): MetadataRoute.Sitemap {
  const legal = ["/terms", "/privacy", "/refund", "/contact"].map((path) => ({
    url: `${SITE_URL}${path}`,
    lastModified: new Date(`${LEGAL_UPDATED}T00:00:00Z`),
    changeFrequency: "yearly" as const,
    priority: 0.3,
  }));
  return [{ url: `${SITE_URL}/`, changeFrequency: "monthly", priority: 1 }, ...legal];
}
