import {
  LayoutDashboard,
  CalendarCheck,
  NotebookText,
  Star,
  MessageSquare,
} from "lucide-react";

/** Supervisor sidebar. */
export const SUPERVISOR_NAV = [
  { label: "Dashboard", href: "/supervisor/dashboard", icon: LayoutDashboard },
  {
    label: "Attendance Approval",
    href: "/supervisor/attendance",
    icon: CalendarCheck,
  },
  // Read-only: the coordinator reviews journals, the supervisor just reads them.
  { label: "Journals", href: "/supervisor/journals", icon: NotebookText },
  { label: "Evaluation", href: "/supervisor/evaluation", icon: Star },
  { label: "Messages", href: "/supervisor/messages", icon: MessageSquare },
];
