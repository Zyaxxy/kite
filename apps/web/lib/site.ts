export function siteUrl(): URL {
  const configured =
    process.env.KITE_SITE_URL ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : "http://localhost:3000");
  const url = new URL(configured);
  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !["https:", "http:"].includes(url.protocol)
  )
    throw new Error("KITE_SITE_URL must be a public site origin.");
  return new URL(url.origin);
}
export const supportEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
  process.env.KITE_SUPPORT_EMAIL ?? "",
)
  ? process.env.KITE_SUPPORT_EMAIL
  : null;
export const projectIssuesUrl = "https://github.com/Zyaxxy/kite/issues";
export const operatorName =
  process.env.KITE_OPERATOR_NAME || "the Kite project contributors";
