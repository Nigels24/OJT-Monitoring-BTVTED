"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { LogOut, ShieldAlert } from "lucide-react";
import Button from "@/components/ui/Button";
import Overlay from "@/components/ui/Overlay";
import { useRefreshMutation } from "@/lib/api/authApi";
import { clearSession, persistSession, type StoredUser } from "@/lib/auth";

const LAST_ACTIVITY_KEY = "ojt_last_activity";

const IDLE_LIMIT_MS = 30 * 60 * 1000;
const WARNING_AT_MS = 28 * 60 * 1000;
const REFRESH_INTERVAL_MS = 5 * 60 * 1000;
const TICK_MS = 1000;
// mousemove/scroll fire far more often than "the user did something new"
// actually needs recording — this caps how often either writes to state or
// localStorage.
const MOTION_THROTTLE_MS = 1000;

function formatMMSS(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

/**
 * Client half of the 30-minute inactivity timeout (CLAUDE.md-adjacent
 * feature — see the server's `SESSION_IDLE_MINUTES`). The actual enforcement
 * is the access token's own 30-minute lifetime: this component's job is only
 * to (a) proactively slide that window forward via `/auth/refresh` when
 * there's been real activity, so a merely-slow-reading user doesn't get
 * yanked mid-task, and (b) warn and then sign out client-side before a
 * genuinely idle session starts hitting random 401s. A tab that's truly been
 * idle for 30 minutes gets no refresh calls at all, so the token expires on
 * schedule and the next request would 401 regardless of this component.
 *
 * Mounted once from `lib/providers.tsx` — the app has no shared per-role
 * layout (every page composes its own Sidebar, per CLAUDE.md), so the
 * app-wide provider tree is the closest equivalent to "the authenticated
 * layout" available without a larger restructure. It no-ops on every render
 * where there's no stored token (nothing to time out) or on /login (nothing
 * to warn about yet).
 */
export default function IdleSessionManager() {
  const pathname = usePathname();
  const [refresh] = useRefreshMutation();
  const [remainingMs, setRemainingMs] = useState<number | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // 0, not Date.now(): reading the clock is an impure call the render body
  // itself must not make (react-hooks/purity). Both are given a real
  // timestamp inside the effect below, before anything reads them.
  const lastActivityRef = useRef<number>(0);
  const lastRefreshAtRef = useRef<number>(0);
  const initializedRef = useRef(false);

  const recordActivity = () => {
    const now = Date.now();
    lastActivityRef.current = now;
    try {
      localStorage.setItem(LAST_ACTIVITY_KEY, String(now));
    } catch {
      // Private browsing / blocked storage — this tab just loses cross-tab
      // sync, idle tracking still works locally.
    }
  };

  const doRefresh = async () => {
    setIsRefreshing(true);
    try {
      const result = await refresh().unwrap();
      persistSession(result.accessToken, result.user as StoredUser);
      lastRefreshAtRef.current = Date.now();
    } catch {
      // A rejected refresh (expired/invalid token) is handled by
      // baseQueryWithAuth's own 401 redirect — nothing to do here.
    } finally {
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    // Re-anchor from whatever the last known activity was (this tab's own
    // history, or another tab's, via localStorage) rather than always
    // "now" — a reopened tab that was truly idle for an hour should be
    // treated as idle for an hour, not reset to zero.
    if (!initializedRef.current) {
      initializedRef.current = true;
      let initialActivity = Date.now();
      try {
        const stored = localStorage.getItem(LAST_ACTIVITY_KEY);
        if (stored) {
          const parsed = Number(stored);
          if (!Number.isNaN(parsed)) initialActivity = parsed;
        }
      } catch {
        // Fall back to the Date.now() already assigned above.
      }
      lastActivityRef.current = initialActivity;
      lastRefreshAtRef.current = Date.now();
    }

    let lastMotion = 0;
    const onMotion = () => {
      const now = Date.now();
      if (now - lastMotion < MOTION_THROTTLE_MS) return;
      lastMotion = now;
      recordActivity();
    };
    const onActivity = () => recordActivity();

    document.addEventListener("mousemove", onMotion);
    document.addEventListener("scroll", onMotion, true);
    document.addEventListener("keydown", onActivity);
    document.addEventListener("click", onActivity);
    document.addEventListener("touchstart", onActivity);

    const onStorage = (e: StorageEvent) => {
      try {
        if (e.key !== LAST_ACTIVITY_KEY || !e.newValue) return;
        const parsed = Number(e.newValue);
        if (!Number.isNaN(parsed) && parsed > lastActivityRef.current) {
          lastActivityRef.current = parsed;
        }
      } catch {
        // Nothing to recover from here — just skip this sync.
      }
    };
    window.addEventListener("storage", onStorage);

    const tick = setInterval(() => {
      // Re-checked every tick, not cached: this component stays mounted
      // across login/logout (it lives above the router), so "is there a
      // session right now" can only be answered fresh each time.
      const hasToken =
        typeof window !== "undefined" && !!localStorage.getItem("token");
      if (!hasToken || pathname === "/login") {
        // Unconditional, not read-then-set: `remainingMs` from the outer
        // scope is a stale closure (this effect only re-runs on `pathname`
        // changes), so branching on it here could skip a needed clear.
        // React bails out its own re-render when the value doesn't change,
        // so this is cheap even when it's already null.
        setRemainingMs(null);
        return;
      }

      const now = Date.now();
      const idleMs = now - lastActivityRef.current;

      if (idleMs >= IDLE_LIMIT_MS) {
        clearSession();
        // eslint-disable-next-line @next/next/no-location-assign-relative-destination
        window.location.href = "/login?reason=idle";
        return;
      }

      setRemainingMs(idleMs >= WARNING_AT_MS ? IDLE_LIMIT_MS - idleMs : null);

      if (
        now - lastRefreshAtRef.current >= REFRESH_INTERVAL_MS &&
        lastActivityRef.current > lastRefreshAtRef.current
      ) {
        // Set before the request resolves so a slow response can't cause a
        // second call to fire on the next tick.
        lastRefreshAtRef.current = now;
        void doRefresh();
      }
    }, TICK_MS);

    return () => {
      document.removeEventListener("mousemove", onMotion);
      document.removeEventListener("scroll", onMotion, true);
      document.removeEventListener("keydown", onActivity);
      document.removeEventListener("click", onActivity);
      document.removeEventListener("touchstart", onActivity);
      window.removeEventListener("storage", onStorage);
      clearInterval(tick);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- doRefresh/recordActivity close over stable refs/mutation trigger; re-subscribing on their identity would just churn listeners every render.
  }, [pathname]);

  const handleStaySignedIn = () => {
    recordActivity();
    setRemainingMs(null);
    void doRefresh();
  };

  return (
    <Overlay
      open={remainingMs !== null}
      label="Session about to expire"
      onClose={handleStaySignedIn}
      closeOnBackdrop={false}
    >
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm max-h-[90dvh] overflow-y-auto flex flex-col">
        <div className="p-4 md:p-6 space-y-4">
          <div className="flex items-center gap-2">
            <ShieldAlert size={20} className="text-amber-600" />
            <h2 className="text-lg font-semibold text-gray-900">
              Still there?
            </h2>
          </div>
          <p className="text-sm text-gray-600">
            You&apos;ll be signed out in{" "}
            <span className="font-mono font-semibold text-gray-900">
              {formatMMSS(remainingMs ?? 0)}
            </span>{" "}
            due to inactivity.
          </p>
          <div className="flex flex-col sm:flex-row gap-3">
            <Button
              type="button"
              icon={ShieldAlert}
              loading={isRefreshing}
              onClick={handleStaySignedIn}
            >
              Stay signed in
            </Button>
            <Button
              type="button"
              variant="secondary"
              icon={LogOut}
              onClick={() => {
                clearSession();
                // eslint-disable-next-line @next/next/no-location-assign-relative-destination
                window.location.href = "/login?reason=idle";
              }}
            >
              Sign out now
            </Button>
          </div>
        </div>
      </div>
    </Overlay>
  );
}
