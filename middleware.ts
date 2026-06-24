import { type NextRequest, NextResponse } from "next/server";

import { updateSession } from "@/lib/supabase/middleware";

import { getAdminBasePath, isAdminRequestPath } from "@/lib/admin/adminPaths";



const PUBLIC_PREFIXES = ["/login", "/register", "/pricing", "/auth", "/logout"] as const;



function isPublicPath(pathname: string) {

  return PUBLIC_PREFIXES.some(

    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)

  );

}



export async function middleware(request: NextRequest) {

  const { pathname } = request.nextUrl;



  const response = await updateSession(request);



  if (isAdminRequestPath(pathname)) {

    const internalBase = "/admin";

    const configuredBase = getAdminBasePath();



    if (configuredBase !== internalBase) {

      const suffix = pathname.slice(configuredBase.length);

      const rewriteUrl = request.nextUrl.clone();

      rewriteUrl.pathname = `${internalBase}${suffix || ""}`;

      const rewriteResponse = NextResponse.rewrite(rewriteUrl);
      response.cookies.getAll().forEach((cookie) => {
        rewriteResponse.cookies.set(cookie);
      });
      return rewriteResponse;

    }



    return response;

  }



  if (isPublicPath(pathname)) {

    return response;

  }



  if (pathname === "/start") {

    return response;

  }



  return response;

}



export const config = {

  matcher: [

    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",

  ],

};


