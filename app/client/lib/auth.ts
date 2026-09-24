export type UserRole = "STUDENT" | "SUPERVISOR" | "COORDINATOR";

export interface StoredUser {
  id: string;
  email: string;
  username: string | null;
  name: string;
  role: UserRole;
  mustChangePassword: boolean;
}

/**
 * Cookie holding only the role, mirrored from the stored user.
 *
 * `middleware.ts` runs on the server and cannot read localStorage, so it needs
 * a cookie to know who is browsing. Deliberately NOT the JWT: putting the token
 * in a JS-readable cookie widens the attack surface for no gain, since the
 * RTK Query slices already read it from localStorage.
 *
 * A user can forge this cookie in devtools and reach another role's page
 * shell — that is fine. The middleware is navigation UX, not the security
 * boundary. Every request the page makes still carries the real JWT, and
 * `RolesGuard` on the server rejects it.
 */
export const ROLE_COOKIE = "ojt_role";

/**
 * Mirrors `StoredUser.mustChangePassword`. Like `ROLE_COOKIE`, this is
 * read by `proxy.ts` (which cannot reach localStorage) to force every
 * role-prefixed page — and `/login`/`/` — to `/change-password` while the
 * account still holds a coordinator-issued temporary password. Not a
 * security boundary either: the server's global `PasswordChangeGuard`
 * rejects every non-exempt request from such a token regardless of what
 * this cookie says.
 */
export const PASSWORD_CHANGE_COOKIE = "ojt_pwc";

/**
 * Must match the server's JWT lifetime (`SESSION_IDLE_MINUTES` in
 * app/server/src/auth/jwt.constants.ts) — currently 30 minutes.
 *
 * The cookie and the token have to expire together. A cookie that outlives the
 * token traps the user: `proxy.ts` keeps redirecting them off /login to a home
 * page whose every request 401s. A cookie that dies before the token (which is
 * what a session cookie did) forces a needless re-login. This is also why
 * `persistSession` is called again on every `/auth/refresh` response — the
 * sliding-window token refresh has to slide this cookie's Max-Age with it, or
 * the cookie expires out from under a session the token itself is still
 * honouring. If you change the server's SESSION_IDLE_MINUTES, change this too.
 */
export const SESSION_MAX_AGE_SECONDS = 30 * 60;

/** Where each role lands after login. */
export const ROLE_HOME: Record<UserRole, string> = {
  STUDENT: "/student/dashboard",
  SUPERVISOR: "/supervisor/attendance",
  COORDINATOR: "/coordinator/dashboard",
};

/** Route prefix each role owns, used by the middleware to block cross-role access. */
export const ROLE_PREFIX: Record<UserRole, string> = {
  STUDENT: "/student",
  SUPERVISOR: "/supervisor",
  COORDINATOR: "/coordinator",
};

/**
 * Writes both localStorage and the two routing cookies. Called at login, at
 * the end of the forced/voluntary change-password flow, and on every
 * successful `/auth/refresh` — each of those hands back a fresh
 * `{accessToken, user}` pair, and this is the one place that turns it into a
 * stored session.
 */
export function persistSession(token: string, user: StoredUser) {
  localStorage.setItem("token", token);
  localStorage.setItem("user", JSON.stringify(user));
  document.cookie = `${ROLE_COOKIE}=${user.role}; path=/; Max-Age=${SESSION_MAX_AGE_SECONDS}; SameSite=Lax`;
  document.cookie = user.mustChangePassword
    ? `${PASSWORD_CHANGE_COOKIE}=1; path=/; Max-Age=${SESSION_MAX_AGE_SECONDS}; SameSite=Lax`
    : `${PASSWORD_CHANGE_COOKIE}=; path=/; Max-Age=0; SameSite=Lax`;
}

export function clearSession() {
  localStorage.removeItem("token");
  localStorage.removeItem("user");
  document.cookie = `${ROLE_COOKIE}=; path=/; Max-Age=0; SameSite=Lax`;
  document.cookie = `${PASSWORD_CHANGE_COOKIE}=; path=/; Max-Age=0; SameSite=Lax`;
}

/** Reads the stored user, tolerating absent or corrupt JSON. */
export function getStoredUser(): StoredUser | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem("user");
  if (!raw) return null;
  try {
    return JSON.parse(raw) as StoredUser;
  } catch {
    return null;
  }
}
