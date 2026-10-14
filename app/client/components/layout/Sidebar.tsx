"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { clearSession } from "@/lib/auth";
import ChangePasswordDialog from "@/features/account/ChangePasswordDialog";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import { Z_LAYERS } from "@/components/ui/Overlay";
import { useUnreadCount } from "@/features/messaging/hooks/use-unread-count";
import NotificationBell from "@/features/notifications/components/NotificationBell";
import { useCurrentUser } from "@/lib/hooks/use-current-user";
import { useGetSupervisorEstablishmentQuery } from "@/lib/api/supervisorApi";
import { SCHOOL_ADDRESS, SCHOOL_SHORT_NAME } from "@/lib/school";
import {
  LucideIcon,
  Building2,
  MapPin,
  LogOut,
  KeyRound,
  UserCircle,
  Menu,
  X,
} from "lucide-react";

export interface SidebarNavItem {
  label: string;
  href: string;
  icon: LucideIcon;
}

interface SidebarProps {
  items: SidebarNavItem[];
  userName: string;
  userSubtitle?: string;
  onLogout?: () => void;
}

/**
 * The heading at the top of the sidebar: whose system this is, and where they
 * are. Decided here from the signed-in role, not passed in by each page — the
 * pages used to hardcode it and had drifted apart ("Barangay San Francisco",
 * "OJT Monitoring", "Supervisor Portal").
 *
 * Coordinators and students belong to the school, so they see its name and
 * address. A supervisor belongs to an establishment, so they see that
 * establishment's name and its saved address — and no subtitle at all when it
 * has none, rather than a placeholder.
 */
function useOrgHeading(): { name: string; address: string } {
  const role = useCurrentUser()?.role;
  const isSupervisor = role === "SUPERVISOR";
  const { data: establishment } = useGetSupervisorEstablishmentQuery(
    undefined,
    {
      skip: !isSupervisor,
    },
  );

  if (!isSupervisor) {
    return { name: SCHOOL_SHORT_NAME, address: SCHOOL_ADDRESS };
  }
  return {
    // Blank while it loads: the school's name here would be a wrong answer
    // flashing past, not a placeholder.
    name: establishment?.name ?? "",
    address: [
      establishment?.streetAddress,
      establishment?.barangay,
      establishment?.city,
      establishment?.province,
    ]
      .map((part) => part?.trim())
      .filter(Boolean)
      .join(", "),
  };
}

/**
 * The app's navigation. A fixed column from `lg` up; below that a top bar with
 * a menu button, and the same column as a drawer that slides in over the page.
 *
 * It renders the top bar and the column as siblings, so the page's wrapper
 * must stack them on small screens: `flex flex-col lg:flex-row`.
 */
export default function Sidebar({
  items,
  userName,
  userSubtitle,
  onLogout,
}: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [passwordDialogOpen, setPasswordDialogOpen] = useState(false);
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false);
  const { conversationCount } = useUnreadCount();
  const { name: orgName, address: orgSubtitle } = useOrgHeading();
  // Every page mounts its own Sidebar (there is no shared layout), so a
  // navigation remounts this closed — no effect has to watch the pathname.
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    if (!drawerOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDrawerOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [drawerOpen]);

  const handleLogout = () => {
    // Always clear first. `proxy.ts` trusts the role cookie for routing, so a
    // caller-supplied onLogout that skipped this would leave the user routed as
    // if still signed in — and unable to reach /login to fix it.
    clearSession();
    if (onLogout) {
      onLogout();
      return;
    }
    router.push("/login");
  };

  return (
    <>
      <header
        style={{ zIndex: Z_LAYERS.stickyHeader }}
        className="lg:hidden print:hidden sticky top-0 shrink-0 h-14 px-2 flex items-center gap-1 bg-indigo-600 text-white"
      >
        <button
          type="button"
          onClick={() => {
            setDrawerOpen(true);
          }}
          aria-label="Open menu"
          aria-expanded={drawerOpen}
          className="w-10 h-10 shrink-0 flex items-center justify-center rounded-lg hover:bg-white/10"
        >
          <Menu size={22} />
        </button>
        <div className="flex-1 min-w-0 px-1">
          <p className="font-bold truncate leading-tight">{orgName}</p>
          {orgSubtitle && (
            <p className="text-xs text-white/80 truncate leading-tight">
              {orgSubtitle}
            </p>
          )}
        </div>
        <NotificationBell />
      </header>

      {drawerOpen && (
        <div
          aria-hidden="true"
          style={{ zIndex: Z_LAYERS.drawer }}
          onClick={() => {
            setDrawerOpen(false);
          }}
          className="lg:hidden fixed inset-0 bg-black/50"
        />
      )}

      <aside
        style={{ zIndex: Z_LAYERS.drawer }}
        className={`print:hidden fixed inset-y-0 left-0 w-64 max-w-[85vw] overflow-y-auto flex flex-col bg-gradient-to-b from-indigo-500 to-purple-700 text-white transition-transform duration-200 lg:sticky lg:top-0 lg:h-screen lg:shrink-0 lg:translate-x-0 ${
          drawerOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="p-5 border-b border-white/10">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="flex items-center gap-2 font-bold text-lg">
                <Building2 size={22} className="shrink-0" />
                <span className="truncate" title={orgName}>
                  {orgName}
                </span>
              </div>
              {orgSubtitle && (
                <div className="flex items-center gap-1.5 text-sm text-white/80 mt-1">
                  <MapPin size={14} className="shrink-0" />
                  <span className="truncate" title={orgSubtitle}>
                    {orgSubtitle}
                  </span>
                </div>
              )}
            </div>
            {/* The bell lives in the top bar below `lg`; here from `lg` up. */}
            <div className="hidden lg:block">
              <NotificationBell />
            </div>
            <button
              type="button"
              onClick={() => {
                setDrawerOpen(false);
              }}
              aria-label="Close menu"
              className="lg:hidden w-8 h-8 shrink-0 flex items-center justify-center rounded-lg text-white/80 hover:text-white hover:bg-white/10"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1">
          {items.map(({ label, href, icon: Icon }) => {
            const active =
              pathname === href || pathname?.startsWith(href + "/");
            // Read off the entry's own href, so all three roles get the badge
            // without their nav.ts knowing anything about messaging.
            const unread = href.endsWith("/messages") ? conversationCount : 0;
            return (
              <Link
                key={href}
                href={href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  active
                    ? "bg-white/25 text-white"
                    : "text-white/85 hover:bg-white/10"
                }`}
              >
                <Icon size={18} className="shrink-0" />
                {/* The label keeps wrapping as it always did, but gives up its
                  width to the badge rather than pushing it out of a 256px
                  sidebar at 390px. */}
                <span className="flex-1 min-w-0">{label}</span>
                {unread > 0 && (
                  <>
                    {/* Solid red with a white ring: legible on the purple
                      gradient and on the lighter bg-white/25 of the active
                      entry alike. */}
                    <span
                      aria-hidden="true"
                      className="shrink-0 min-w-[20px] h-5 px-1.5 inline-flex items-center justify-center rounded-full bg-red-600 ring-1 ring-white/80 text-white text-[11px] font-bold tabular-nums"
                    >
                      {unread > 9 ? "9+" : unread}
                    </span>
                    <span className="sr-only">
                      {`${unread} conversation${unread === 1 ? "" : "s"} with unread messages`}
                    </span>
                  </>
                )}
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-white/10 flex items-center gap-2">
          <UserCircle size={32} className="shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{userName}</p>
            {userSubtitle && (
              <p className="text-xs text-white/70 truncate">{userSubtitle}</p>
            )}
          </div>
          {/* One hit-target size for both, matching the nav rows' touch area. */}
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={() => {
                setPasswordDialogOpen(true);
              }}
              aria-label="Change password"
              title="Change password"
              className="w-8 h-8 flex items-center justify-center rounded-lg text-white/80 hover:text-white hover:bg-white/10"
            >
              <KeyRound size={18} />
            </button>
            <button
              type="button"
              onClick={() => {
                setLogoutConfirmOpen(true);
              }}
              aria-label="Logout"
              title="Logout"
              className="w-8 h-8 flex items-center justify-center rounded-lg text-white/80 hover:text-white hover:bg-white/10"
            >
              <LogOut size={18} />
            </button>
          </div>
        </div>

        <ChangePasswordDialog
          open={passwordDialogOpen}
          onClose={() => {
            setPasswordDialogOpen(false);
          }}
        />

        <ConfirmDialog
          open={logoutConfirmOpen}
          title="Log Out?"
          message="You'll need to sign in again to continue."
          confirmLabel="Yes, log out"
          icon={LogOut}
          variant="danger"
          onConfirm={handleLogout}
          onCancel={() => {
            setLogoutConfirmOpen(false);
          }}
        />
      </aside>
    </>
  );
}
