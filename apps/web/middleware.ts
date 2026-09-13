import { NextRequest, NextResponse } from "next/server";
import {
  allowedOrigin,
  createRequestLimiter,
  isLoopback,
} from "./lib/server/request-policy";

const reads = createRequestLimiter(120);
const writes = createRequestLimiter(20);
export function middleware(request: NextRequest) {
  const api = request.nextUrl.pathname.startsWith("/api/");
  const development = process.env.NODE_ENV !== "production";
  const trustProxy =
    process.env.VERCEL === "1" || process.env.KITE_TRUST_PROXY === "true";
  const protocol = (
    trustProxy
      ? (request.headers.get("x-forwarded-proto")?.split(",")[0].trim() ??
        request.nextUrl.protocol.replace(":", ""))
      : request.nextUrl.protocol.replace(":", "")
  ).toLowerCase();
  if (
    !development &&
    !isLoopback(request.nextUrl.hostname) &&
    protocol !== "https"
  ) {
    const target = process.env.KITE_SITE_URL;
    if (!target?.startsWith("https://"))
      return NextResponse.json(
        {
          error:
            "HTTPS is required. Configure the public site URL and trusted reverse proxy.",
        },
        { status: 503 },
      );
    let destination: URL;
    try {
      destination = new URL(target);
      if (
        destination.username ||
        destination.password ||
        destination.hash ||
        destination.search
      )
        throw new Error();
    } catch {
      return NextResponse.json(
        { error: "Configure a valid public HTTPS site origin." },
        { status: 503 },
      );
    }
    destination.pathname = request.nextUrl.pathname;
    destination.search = request.nextUrl.search;
    return NextResponse.redirect(destination, 308);
  }
  let response = NextResponse.next();
  if (!isLoopback(request.nextUrl.hostname) && protocol === "https")
    response.headers.set("Strict-Transport-Security", "max-age=31536000");
  if (!api) return response;
  const origin = request.headers.get("origin");
  const effectiveOrigin = `${protocol}://${request.nextUrl.host}`;
  if (
    !allowedOrigin(
      origin,
      effectiveOrigin,
      process.env.KITE_ALLOWED_ORIGINS ?? "",
      development,
    )
  )
    return NextResponse.json(
      { error: "This browser origin is not allowed." },
      { status: 403 },
    );
  if (request.method === "OPTIONS")
    response = new NextResponse(null, { status: 204 });
  else {
    const mutation = !["GET", "HEAD"].includes(request.method);
    // Trust client IP headers only behind a configured proxy that overwrites them.
    const ip = trustProxy
      ? (request.headers.get("x-real-ip") ??
        request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
        "unknown")
      : "local";
    const retry = (mutation ? writes : reads)(ip);
    if (retry)
      response = NextResponse.json(
        { error: "Too many requests. Please wait and try again." },
        {
          status: 429,
          headers: {
            "Retry-After": String(retry),
            "Cache-Control": "no-store",
          },
        },
      );
    else if (
      mutation &&
      request.headers
        .get("content-type")
        ?.split(";")[0]
        .trim()
        .toLowerCase() !== "application/json"
    )
      response = NextResponse.json(
        { error: "Send an application/json request." },
        { status: 415 },
      );
    else if (
      mutation &&
      Number(request.headers.get("content-length") ?? 0) > 16_384
    )
      response = NextResponse.json(
        { error: "The request body is too large." },
        { status: 413 },
      );
  }
  if (origin) {
    response.headers.set("Access-Control-Allow-Origin", origin);
    response.headers.append("Vary", "Origin");
  }
  response.headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  response.headers.set(
    "Access-Control-Allow-Headers",
    "Content-Type, If-None-Match",
  );
  response.headers.set("Access-Control-Expose-Headers", "ETag, Retry-After");
  if (request.method === "OPTIONS")
    response.headers.set("Access-Control-Max-Age", "600");
  if (!isLoopback(request.nextUrl.hostname) && protocol === "https")
    response.headers.set("Strict-Transport-Security", "max-age=31536000");
  return response;
}
export const config = {
  matcher: ["/((?!_next/static|_next/image|icon.svg|favicon.ico).*)"],
};
