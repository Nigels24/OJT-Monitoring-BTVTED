import { useCallback, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  useGetStudentsQuery,
  useCreateStudentMutation,
  useUpdateStudentMutation,
  useDeleteStudentMutation,
  Student,
  StudentStatus,
} from "@/lib/api/studentApi";
import { useGetEstablishmentsQuery } from "@/lib/api/establishmentApi";
import {
  useGetBlocksQuery,
  useGetCoursesQuery,
  useGetMyBlocksQuery,
} from "@/lib/api/courseApi";
import { useSnackbar } from "@/lib/contexts/SnackbarContext";

export const STATUS_OPTIONS: StudentStatus[] = [
  "ACTIVE",
  "PENDING",
  "COMPLETED",
  "INACTIVE",
];

const EMPTY_FORM = {
  studentIdNumber: "",
  firstName: "",
  middleInitial: "",
  lastName: "",
  email: "",
  username: "",
  password: "",
  age: "",
  dateOfBirth: "",
  contactNumber: "",
  address: "",
  courseId: "",
  courseYearLevel: "",
  blockId: "",
  establishmentId: "",
  requiredHours: "",
  startDate: "",
  status: "ACTIVE" as StudentStatus,
};

export type StudentForm = typeof EMPTY_FORM;

const PAGE_SIZE = 5;

/**
 * The roster's scope and filters, persisted in the URL query string rather
 * than component state — a bookmarked or shared link (or a page refresh)
 * reopens the same "My Block" / "All Program" view and filter combination
 * instead of always resetting to the default.
 */
function useRosterUrlState() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // "block" is the default and is never written to the URL, so the common
  // case keeps a clean /students URL.
  const scope: "block" | "all" =
    searchParams.get("scope") === "all" ? "all" : "block";
  const courseId = searchParams.get("courseId") ?? "";
  const yearLevel = searchParams.get("yearLevel") ?? "";
  const blockId = searchParams.get("blockId") ?? "";
  const academicYear = searchParams.get("academicYear") ?? "";
  const status = searchParams.get("status") ?? "";

  const setParam = useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value) params.set(key, value);
      else params.delete(key);
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [router, pathname, searchParams],
  );

  return {
    scope,
    courseId,
    yearLevel,
    blockId,
    academicYear,
    status,
    setScope: (value: "block" | "all") =>
      setParam("scope", value === "all" ? "all" : ""),
    setCourseId: (value: string) => {
      setParam("courseId", value);
      // A course change invalidates whatever year level/block was picked
      // for the old one.
      setParam("yearLevel", "");
      setParam("blockId", "");
    },
    setYearLevel: (value: string) => {
      setParam("yearLevel", value);
      setParam("blockId", "");
    },
    setBlockId: (value: string) => setParam("blockId", value),
    setAcademicYear: (value: string) => setParam("academicYear", value),
    setStatus: (value: string) => setParam("status", value),
  };
}

export function useStudents() {
  const roster = useRosterUrlState();
  const [form, setForm] = useState<StudentForm>(EMPTY_FORM);
  const [error, setError] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<Student | null>(null);
  const [viewTarget, setViewTarget] = useState<Student | null>(null);
  const [editTarget, setEditTarget] = useState<Student | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  // Set only when createStudent's response carries a system-generated
  // temporaryPassword (i.e. the coordinator left the password field blank) —
  // the "Credentials to release" dialog reads this once, then it's gone.
  const [credentials, setCredentials] = useState<{
    name: string;
    identifier: string;
    temporaryPassword: string;
  } | null>(null);

  const { showSuccess, showError } = useSnackbar();

  const queryParams = useMemo(
    () => ({
      scope: roster.scope,
      courseId: roster.courseId || undefined,
      yearLevel: roster.yearLevel ? Number(roster.yearLevel) : undefined,
      blockId: roster.blockId || undefined,
      academicYear: roster.academicYear || undefined,
      status: (roster.status || undefined) as StudentStatus | undefined,
    }),
    [
      roster.scope,
      roster.courseId,
      roster.yearLevel,
      roster.blockId,
      roster.academicYear,
      roster.status,
    ],
  );

  const { data, isLoading } = useGetStudentsQuery(queryParams);
  // Memoized: an inline `data?.students ?? []` would hand the `filtered`/
  // `stats` useMemos below a fresh `[]` identity on every render data is
  // absent, defeating their own memoization.
  const students = useMemo(() => data?.students ?? [], [data]);
  const noBlocksAssigned = data?.noBlocksAssigned ?? false;

  const { data: establishments } = useGetEstablishmentsQuery();
  const { data: courses } = useGetCoursesQuery();
  // Used only to decide whether the "My Block" scope has anything to show —
  // an empty list here is what the toggle's disabled tooltip explains.
  const { data: myBlocks } = useGetMyBlocksQuery();
  // Options for the filter bar's own Block select, narrowed by whichever of
  // course/year level/academic year are already picked.
  const { data: filterBlocks } = useGetBlocksQuery(
    {
      courseId: roster.courseId || undefined,
      yearLevel: roster.yearLevel ? Number(roster.yearLevel) : undefined,
      academicYear: roster.academicYear || undefined,
    },
    { skip: !roster.courseId },
  );

  const [createStudent, { isLoading: isCreating }] = useCreateStudentMutation();
  const [updateStudent, { isLoading: isUpdating }] = useUpdateStudentMutation();
  const [deleteStudent] = useDeleteStudentMutation();

  // The form's own Course -> Year Level -> Block cascade (independent of the
  // roster filter bar's course/year/block above).
  const activeCourses = useMemo(
    () => (courses ?? []).filter((c) => c.isActive),
    [courses],
  );
  const formCourse = useMemo(
    () => (courses ?? []).find((c) => c.id === form.courseId) ?? null,
    [courses, form.courseId],
  );
  const formYearLevelOptions = useMemo(
    () =>
      (formCourse?.requirements ?? [])
        .map((r) => r.yearLevel)
        .sort((a, b) => a - b),
    [formCourse],
  );
  const { data: formBlocks } = useGetBlocksQuery(
    {
      courseId: form.courseId || undefined,
      yearLevel: form.courseYearLevel ? Number(form.courseYearLevel) : undefined,
    },
    { skip: !form.courseId || !form.courseYearLevel },
  );

  const setField =
    (key: keyof StudentForm) =>
    (e: { target: { value: string } }) => {
      setForm((f) => ({ ...f, [key]: e.target.value }));
    };

  const setCourseField = (value: string) => {
    setForm((f) => ({ ...f, courseId: value, courseYearLevel: "", blockId: "" }));
  };
  const setYearLevelField = (value: string) => {
    setForm((f) => ({ ...f, courseYearLevel: value, blockId: "" }));
  };

  /**
   * Blanks go as `null` so an emptied box actually clears the column — the
   * server reads an *absent* field as "leave unchanged", so omitting them
   * would silently restore the old value on every edit.
   *
   * `requiredHours` is the exception: it is NOT NULL server-side, so a blank
   * stays omitted rather than becoming a null write.
   */
  const detailsPayload = () => ({
    firstName: form.firstName || null,
    lastName: form.lastName || null,
    middleInitial: form.middleInitial || null,
    age: form.age ? Number(form.age) : null,
    dateOfBirth: form.dateOfBirth
      ? new Date(form.dateOfBirth).toISOString()
      : null,
    contactNumber: form.contactNumber || null,
    address: form.address || null,
    courseId: form.courseId || null,
    blockId: form.blockId || null,
    courseYearLevel: form.courseYearLevel ? Number(form.courseYearLevel) : null,
    establishmentId: form.establishmentId || null,
    requiredHours: form.requiredHours ? Number(form.requiredHours) : undefined,
    startDate: form.startDate ? new Date(form.startDate).toISOString() : null,
    status: form.status,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    try {
      if (editTarget) {
        await updateStudent({
          id: editTarget.id,
          ...detailsPayload(),
        }).unwrap();
        showSuccess(`"${form.firstName} ${form.lastName}" has been updated.`);
      } else {
        const result = await createStudent({
          email: form.email,
          username: form.username,
          // Blank -> undefined, not "": an empty string is a too-short
          // password to the server's validator, not "please generate one".
          password: form.password || undefined,
          studentIdNumber: form.studentIdNumber,
          ...detailsPayload(),
        }).unwrap();

        if (result.temporaryPassword) {
          setCredentials({
            name: result.name,
            identifier: result.username ?? result.email,
            temporaryPassword: result.temporaryPassword,
          });
        } else {
          showSuccess(
            `"${result.name}" has been added. Give them the username and password you set.`,
          );
        }
      }
      closeDialog();
    } catch (err: unknown) {
      const message = readError(
        err,
        editTarget ? "Failed to update student." : "Failed to add student.",
      );
      setError(message);
      showError(message);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    try {
      await deleteStudent(deleteTarget.id).unwrap();
      showSuccess(`"${deleteTarget.user.name}" has been removed.`);
      setDeleteTarget(null);
    } catch (err: unknown) {
      const message = readError(err, "Failed to remove student.");
      setError(message);
      showError(message);
    }
  };

  const handleView = (student: Student) => {
    setViewTarget(student);
  };

  const handleEdit = (student: Student) => {
    setEditTarget(student);
    setForm({
      studentIdNumber: student.studentIdNumber,
      firstName: student.firstName ?? "",
      middleInitial: student.middleInitial ?? "",
      lastName: student.lastName ?? "",
      email: student.user.email,
      // Credentials are not editable here — the fields are disabled in edit
      // mode and these values are only shown for reference.
      username: student.user.username ?? "",
      password: "",
      age: student.age?.toString() ?? "",
      // <input type="date"> wants yyyy-mm-dd, not a full ISO timestamp.
      dateOfBirth: student.dateOfBirth ? student.dateOfBirth.slice(0, 10) : "",
      contactNumber: student.contactNumber ?? "",
      address: student.address ?? "",
      courseId: student.courseId ?? "",
      courseYearLevel: student.courseYearLevel?.toString() ?? "",
      blockId: student.blockId ?? "",
      establishmentId: student.establishmentId ?? "",
      requiredHours: student.requiredHours?.toString() ?? "",
      startDate: student.startDate ? student.startDate.slice(0, 10) : "",
      status: student.status,
    });
    setIsDialogOpen(true);
  };

  const handleOpenAddDialog = () => {
    setEditTarget(null);
    setForm(EMPTY_FORM);
    setError("");
    setIsDialogOpen(true);
  };

  const closeDialog = () => {
    setIsDialogOpen(false);
    setEditTarget(null);
    setForm(EMPTY_FORM);
    setError("");
  };

  const filtered = useMemo(() => {
    const term = search.toLowerCase();
    return students.filter((s) => {
      const haystack = [
        s.studentIdNumber,
        s.user.name,
        s.user.email,
        s.course,
        s.establishment?.name,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(term);
    });
  }, [students, search]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const stats = useMemo(() => {
    return {
      total: students.length,
      active: students.filter((s) => s.status === "ACTIVE").length,
      inProgress: students.filter(
        (s) => s.requiredHours > 0 && s.completedHours < s.requiredHours,
      ).length,
      completed: students.filter((s) => s.status === "COMPLETED").length,
    };
  }, [students]);

  return {
    form,
    error,
    students,
    establishments,
    isLoading,
    isCreating,
    isUpdating,
    deleteTarget,
    viewTarget,
    editTarget,
    isDialogOpen,
    credentials,
    search,
    page,
    paged,
    totalPages,
    filtered,
    stats,

    // Roster scope/filters (URL-persisted).
    roster,
    noBlocksAssigned,
    hasOwnBlocks: (myBlocks ?? []).length > 0,
    courses: activeCourses,
    filterBlocks: filterBlocks ?? [],

    STATUS_OPTIONS,
    formYearLevelOptions,
    formBlocks: formBlocks ?? [],

    setField,
    setCourseField,
    setYearLevelField,
    setSearch,
    setPage,
    setDeleteTarget,
    setViewTarget,
    closeCredentials: () => {
      setCredentials(null);
    },

    handleSubmit,
    handleDeleteConfirm,
    handleView,
    handleEdit,
    handleOpenAddDialog,
    closeDialog,
  };
}

/** Pulls the API's message out of an RTK Query error, with a fallback. */
function readError(err: unknown, fallback: string): string {
  const data = (err as { data?: { message?: string | string[] } })?.data;
  if (Array.isArray(data?.message)) return data.message.join(", ");
  return data?.message ?? fallback;
}
