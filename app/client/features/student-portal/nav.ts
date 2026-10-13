import {
  LayoutDashboard,
  CalendarCheck,
  NotebookPen,
  ListChecks,
  UserCircle,
  FileText,
  BadgeCheck,
  MessageSquare,
} from "lucide-react";

/** Student sidebar. */
export const STUDENT_NAV = [
  { label: "Dashboard", href: "/student/dashboard", icon: LayoutDashboard },
  { label: "Attendance", href: "/student/attendance", icon: CalendarCheck },
  { label: "Journal", href: "/student/journal", icon: NotebookPen },
  { label: "Weekly Tasks", href: "/student/weekly-tasks", icon: ListChecks },
  { label: "Documents", href: "/student/documents", icon: FileText },
  { label: "Credentials", href: "/student/credentials", icon: BadgeCheck },
  { label: "Profile", href: "/student/profile", icon: UserCircle },
  { label: "Messages", href: "/student/messages", icon: MessageSquare },
];
