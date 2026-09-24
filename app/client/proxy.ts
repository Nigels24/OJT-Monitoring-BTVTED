import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  PASSWORD_CHANGE_COOKIE,
  ROLE_COOKIE,
  ROLE_HOME,
  ROLE_PREFIX,
  type UserRole,
} from "@/lib/auth";

// Next 16 renamed the `middleware` file convention to `proxy`; the behaviour is
// unchanged. See node_modules/next/dist/docs/01-app/03-api-reference/
// 03-file-conventions/proxy.md.

const ROLES = Object.keys(ROLE_PREFIX) as UserRole[];
const CHANGE_PASSWORD_PATH = "/change-password";

function isRole(value: string | undefined): value is UserRole {
  return !!value && (ROLES as string[]).includes(value);
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const cookieRole = request.cookies.get(ROLE_COOKIE)?.value;
  const role = isRole(cookieRole) ? cookieRole : null;
  const mustChangePassword =
    request.cookies.get(PASSWORD_CHANGE_COOKIE)?.value === "1";

  const redirectTo = (path: string) =>
    NextResponse.redirect(new URL(path, request.url));
  const home = (r: UserRole) =>
    mustChangePassword ? CHANGE_PASSWORD_PATH : ROLE_HOME[r];

  // `/` is still create-next-app boilerplate — send people somewhere useful.
  if (pathname === "/") {
    return redirectTo(role ? home(role) : "/login");
  }

  // Already signed in? Skip the login form.
  if (pathname === "/login") {
    return role ? redirectTo(home(role)) : NextResponse.next();
  }

  // Standalone, no-sidebar page a mustChangePassword account is forced onto.
  // Not under any ROLE_PREFIX, so it needs its own handling before the
  // prefix check below falls through to NextResponse.next().
  if (pathname === CHANGE_PASSWORD_PATH) {
    if (!role) {
      const login = new URL("/login", request.url);
      login.searchParams.set("next", pathname);
      return redirectTo(`${login.pathname}${login.search}`);
    }
    // Nothing left to change — don't let a stale bookmark/back-button land
    // here once the flag has cleared.
    return mustChangePassword ? NextResponse.next() : redirectTo(ROLE_HOME[role]);
  }

  const owningRole = ROLES.find((r) => pathname.startsWith(ROLE_PREFIX[r]));
  if (!owningRole) {
    return NextResponse.next();
  }

  if (!role) {
    const login = new URL("/login", request.url);
    // Preserve where they were headed so login can bounce them back later.
    login.searchParams.set("next", pathname);
    return redirectTo(`${login.pathname}${login.search}`);
  }

  if (role !== owningRole) {
    return redirectTo(home(role));
  }

  if (mustChangePassword) {
    return redirectTo(CHANGE_PASSWORD_PATH);
  }

  return NextResponse.next();
}

export const config = {
  // Everything except Next internals, the favicon, and files in public/.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
