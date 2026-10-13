import { useMemo, useState } from "react";
import {
  useGetSupervisorsQuery,
  useCreateSupervisorMutation,
  useDeleteSupervisorMutation,
  CoordinatorSupervisor,
} from "@/lib/api/supervisorManagementApi";
import { useGetEstablishmentsQuery } from "@/lib/api/establishmentApi";
import { useSnackbar } from "@/lib/contexts/SnackbarContext";
import { credentialsEmailReason } from "@/lib/api/credentialsEmail";

const EMPTY_FORM = {
  email: "",
  username: "",
  password: "",
  name: "",
  establishmentId: "",
  position: "",
};

export type SupervisorForm = typeof EMPTY_FORM;

const PAGE_SIZE = 5;

export function useSupervisorManagement() {
  const [form, setForm] = useState<SupervisorForm>(EMPTY_FORM);
  const [error, setError] = useState("");
  const [resetTarget, setResetTarget] = useState<CoordinatorSupervisor | null>(
    null,
  );
  const [deleteTarget, setDeleteTarget] = useState<CoordinatorSupervisor | null>(
    null,
  );
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  // Set only when createSupervisor's response carries a system-generated
  // temporaryPassword — see use-students.ts's identical field for why.
  const [credentials, setCredentials] = useState<{
    name: string;
    identifier: string;
    temporaryPassword: string;
    /** Why it was not emailed — shown above the password. */
    reason: string;
  } | null>(null);

  const { showSuccess, showError } = useSnackbar();

  const { data: supervisors, isLoading } = useGetSupervisorsQuery();
  const { data: establishments } = useGetEstablishmentsQuery();
  const [createSupervisor, { isLoading: isCreating }] =
    useCreateSupervisorMutation();
  const [deleteSupervisor] = useDeleteSupervisorMutation();

  const setField =
    (key: keyof SupervisorForm) =>
    (e: { target: { value: string } }) => {
      setForm((f) => ({ ...f, [key]: e.target.value }));
    };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    try {
      const result = await createSupervisor({
        email: form.email,
        username: form.username,
        // Blank -> undefined, not "": an empty string is a too-short
        // password to the server's validator, not "please generate one".
        password: form.password || undefined,
        name: form.name,
        establishmentId: form.establishmentId,
        position: form.position || undefined,
      }).unwrap();

      if (result.credentialsEmail.status === "SENT") {
        // Emailed: the password went to their inbox and never came here.
        showSuccess(`Login sent to ${result.email}`);
      } else if (result.temporaryPassword) {
        // Not emailed: the one-time dialog, with the reason, so the
        // coordinator can hand the login over.
        setCredentials({
          name: result.name,
          identifier: result.username ?? result.email,
          temporaryPassword: result.temporaryPassword,
          reason: credentialsEmailReason(result.credentialsEmail),
        });
      } else {
        showSuccess(
          `"${result.name}" has been added. Give them the username and password you set.`,
        );
      }
      closeDialog();
    } catch (err: unknown) {
      const message = readError(err, "Failed to add supervisor.");
      setError(message);
      showError(message);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    try {
      await deleteSupervisor(deleteTarget.id).unwrap();
      showSuccess(`"${deleteTarget.user.name}" has been removed.`);
      setDeleteTarget(null);
    } catch (err: unknown) {
      const message = readError(err, "Failed to remove supervisor.");
      showError(message);
    }
  };

  const handleOpenAddDialog = () => {
    setForm(EMPTY_FORM);
    setError("");
    setIsDialogOpen(true);
  };

  const closeDialog = () => {
    setIsDialogOpen(false);
    setForm(EMPTY_FORM);
    setError("");
  };

  const filtered = useMemo(() => {
    const term = search.toLowerCase();
    return (supervisors ?? []).filter((s) => {
      const haystack = [
        s.user.name,
        s.user.username,
        s.user.email,
        s.position,
        s.establishment?.name,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(term);
    });
  }, [supervisors, search]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const stats = useMemo(() => {
    const all = supervisors ?? [];
    return {
      total: all.length,
      establishmentsCovered: new Set(all.map((s) => s.establishmentId)).size,
      withoutPosition: all.filter((s) => !s.position).length,
    };
  }, [supervisors]);

  return {
    form,
    error,
    establishments,
    isLoading,
    isCreating,
    resetTarget,
    deleteTarget,
    isDialogOpen,
    credentials,
    search,
    page,
    paged,
    totalPages,
    stats,

    setField,
    setSearch,
    setPage,
    setResetTarget,
    closeCredentials: () => {
      setCredentials(null);
    },
    setDeleteTarget,

    handleSubmit,
    handleDeleteConfirm,
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
