import { NextResponse, type NextRequest } from "next/server";

/**
 * Optimistic auth redirect only (cookie presence). Real authorization happens
 * server-side in every page, server action and route handler.
 */
const PUBLIC = ["/login", "/one-pager", "/privacy", "/terms", "/api/", "/_next/", "/favicon.ico"];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (pathname === "/" || PUBLIC.some((p) => pathname.startsWith(p))) return NextResponse.next();
  if (!request.cookies.has("cf_session")) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
