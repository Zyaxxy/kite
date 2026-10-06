import { NextResponse } from "next/server";
import { actionHeaders } from "@/lib/server/recurring-actions";

export const runtime = "nodejs";
export function GET() {
  return NextResponse.json(
    {
      rules: [
        { pathPattern: "/api/actions/**", apiPath: "/api/actions/**" },
        { pathPattern: "/basket/*", apiPath: "/api/actions/baskets/*" },
        { pathPattern: "/baskets/*", apiPath: "/api/actions/baskets/*" },
      ],
    },
    { headers: { ...actionHeaders(), "Cache-Control": "public, max-age=300" } },
  );
}
export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: actionHeaders() });
}
