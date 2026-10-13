import {
  LayoutDashboard,
  BookOpen,
  Building2,
  UserCog,
  Users,
  CalendarCheck,
  NotebookPen,
  Star,
  FileText,
  MessageSquare,
  Megaphone,
  TriangleAlert,
} from "lucide-react";

/**
 * Coordinator sidebar.
 *
 * Was duplicated inline in every coordinator page; centralised here so a new
 * entry doesn't have to be added in several places at once.
 */
export const COORDINATOR_NAV = [
  { label: "Dashboard", href: "/coordinator/dashboard", icon: LayoutDashboard },
  { label: "Course Management", href: "/coordinator/courses", icon: BookOpen },
  {
    label: "Establishment Management",
    href: "/coordinator/establishments",
    icon: Building2,
  },
  {
    label: "Supervisor Management",
    href: "/coordinator/supervisors",
    icon: UserCog,
  },
  { label: "Student Management", href: "/coordinator/students", icon: Users },
  { label: "Attendance", href: "/coordinator/attendance", icon: CalendarCheck },
  {
    label: "Journal Review",
    href: "/coordinator/journals",
    icon: NotebookPen,
  },
  { label: "Evaluations", href: "/coordinator/evaluations", icon: Star },
  { label: "Documents", href: "/coordinator/documents", icon: FileText },
  { label: "Concerns", href: "/coordinator/concerns", icon: TriangleAlert },
  {
    label: "Announcements",
    href: "/coordinator/announcements",
    icon: Megaphone,
  },
  { label: "Messages", href: "/coordinator/messages", icon: MessageSquare },
];
