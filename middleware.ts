import { NextRequest, NextResponse } from "next/server";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname === "/KITCLAIM") {
    const url = request.nextUrl.clone();
    url.pathname = "/kitclaim";
    return NextResponse.redirect(url);
  }

  if (pathname === "/DISPLAY") {
    const url = request.nextUrl.clone();
    url.pathname = "/display";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
