import { useState } from "react";
import {
  useGetEstablishmentsQuery,
  useCreateEstablishmentMutation,
  useUpdateEstablishmentMutation,
  useDeleteEstablishmentMutation,
  Establishment,
} from "@/lib/api/establishmentApi";
import { useSnackbar } from "@/lib/contexts/SnackbarContext";
import type { AddressValue } from "@/lib/hooks/use-address-picker";
import { effectivePostalCode } from "@/lib/address/postal-codes";

const INDUSTRY_OPTIONS = [
  "Information Technology",
  "Business Process Outsourcing",
  "Banking & Finance",
  "Hospitality & Tourism",
  "Manufacturing",
  "Healthcare",
  "Education",
  "Retail",
  "Construction",
  "Other",
];

const GENDER_OPTIONS = ["Male", "Female", "Other"];

const EMPTY_FORM = {
  name: "",
  industryType: "",
  streetAddress: "",
  region: "",
  barangay: "",
  city: "",
  province: "",
  zipCode: "",
  status: "ACTIVE" as "ACTIVE" | "INACTIVE",
  /** "" = no limit recorded. */
  traineeSlots: "",
  coordinatorFirstName: "",
  coordinatorLastName: "",
  coordinatorMiddleInitial: "",
  coordinatorAge: "",
  coordinatorGender: "",
  coordinatorPosition: "",
  coordinatorAddress: "",
  coordinatorContact: "",
  coordinatorEmail: "",
};

export type EstablishmentFormValues = typeof EMPTY_FORM;

export function useEstablishment() {
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<Establishment | null>(null);
  const [viewTarget, setViewTarget] = useState<Establishment | null>(null);
  const [editTarget, setEditTarget] = useState<Establishment | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const { showSuccess, showError } = useSnackbar();

  const { data: establishments, isLoading } = useGetEstablishmentsQuery();
  const [createEstablishment, { isLoading: isCreating }] =
    useCreateEstablishmentMutation();
  const [updateEstablishment, { isLoading: isUpdating }] =
    useUpdateEstablishmentMutation();
  const [deleteEstablishment] = useDeleteEstablishmentMutation();

  const setField =
    (key: keyof EstablishmentFormValues) =>
    (e: { target: { value: string } }) =>
      setForm((f) => ({ ...f, [key]: e.target.value }));

  /**
   * The address as the shared picker takes it. The form keeps the four names
   * and the postal code under the establishment's own column names; nothing
   * else is held — no PSGC codes, and so nothing to keep in step with them.
   */
  const address: AddressValue = {
    region: form.region,
    province: form.province,
    city: form.city,
    barangay: form.barangay,
    postalCode: form.zipCode,
  };
  const setAddress = (next: AddressValue) =>
    setForm((f) => ({
      ...f,
      region: next.region,
      province: next.province,
      city: next.city,
      barangay: next.barangay,
      zipCode: next.postalCode,
    }));
  /** The known postal code for the chosen city, else what was typed. */
  const zipCode = () => effectivePostalCode(address, form.zipCode) || undefined;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    try {
      if (editTarget) {
        await handleUpdate(e);
      } else {
        await createEstablishment({
          name: form.name,
          industryType: form.industryType || undefined,
          streetAddress: form.streetAddress || undefined,
          region: form.region || undefined,
          barangay: form.barangay || undefined,
          city: form.city || undefined,
          province: form.province || undefined,
          zipCode: zipCode(),
          status: form.status,
          traineeSlots: form.traineeSlots
            ? Number(form.traineeSlots)
            : undefined,
          coordinatorFirstName: form.coordinatorFirstName || undefined,
          coordinatorLastName: form.coordinatorLastName || undefined,
          coordinatorMiddleInitial: form.coordinatorMiddleInitial || undefined,
          coordinatorAge: form.coordinatorAge
            ? Number(form.coordinatorAge)
            : undefined,
          coordinatorGender: form.coordinatorGender || undefined,
          coordinatorPosition: form.coordinatorPosition || undefined,
          coordinatorAddress: form.coordinatorAddress || undefined,
          coordinatorContact: form.coordinatorContact || undefined,
          coordinatorEmail: form.coordinatorEmail || undefined,
        }).unwrap();
        setForm(EMPTY_FORM);
        setIsDialogOpen(false);
        showSuccess(`"${form.name}" has been created successfully.`);
      }
    } catch (err: unknown) {
      const errorMessage = readError(
        err,
        editTarget
          ? "Failed to update establishment."
          : "Failed to create establishment.",
      );
      setError(errorMessage);
      showError(errorMessage);
    }
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editTarget) return;
    setError("");
    try {
      await updateEstablishment({
        id: editTarget.id,
        name: form.name,
        industryType: form.industryType || undefined,
        streetAddress: form.streetAddress || undefined,
        region: form.region || undefined,
        barangay: form.barangay || undefined,
        city: form.city || undefined,
        province: form.province || undefined,
        zipCode: zipCode(),
        status: form.status,
        // `null`, not `undefined`: emptying the field clears the limit.
        traineeSlots: form.traineeSlots ? Number(form.traineeSlots) : null,
        coordinatorFirstName: form.coordinatorFirstName || undefined,
        coordinatorLastName: form.coordinatorLastName || undefined,
        coordinatorMiddleInitial: form.coordinatorMiddleInitial || undefined,
        coordinatorAge: form.coordinatorAge
          ? Number(form.coordinatorAge)
          : undefined,
        coordinatorGender: form.coordinatorGender || undefined,
        coordinatorPosition: form.coordinatorPosition || undefined,
        coordinatorAddress: form.coordinatorAddress || undefined,
        coordinatorContact: form.coordinatorContact || undefined,
        coordinatorEmail: form.coordinatorEmail || undefined,
      }).unwrap();
      setEditTarget(null);
      setForm(EMPTY_FORM);
      setIsDialogOpen(false);
      showSuccess(`"${form.name}" has been updated successfully.`);
    } catch (err: unknown) {
      const errorMessage = readError(err, "Failed to update establishment.");
      setError(errorMessage);
      showError(errorMessage);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    try {
      await deleteEstablishment(deleteTarget.id).unwrap();
      setDeleteTarget(null);
      showSuccess(`"${deleteTarget.name}" has been deleted successfully.`);
    } catch (err: unknown) {
      const errorMessage = readError(err, "Failed to delete establishment.");
      setError(errorMessage);
      showError(errorMessage);
    }
  };

  const handleView = (establishment: Establishment) => {
    setViewTarget(establishment);
  };

  const handleEdit = (establishment: Establishment) => {
    setEditTarget(establishment);
    // The saved names go straight into the form; the picker resolves its
    // lists from them.
    setForm({
      name: establishment.name || "",
      industryType: establishment.industryType || "",
      streetAddress: establishment.streetAddress || "",
      region: establishment.region || "",
      barangay: establishment.barangay || "",
      city: establishment.city || "",
      province: establishment.province || "",
      zipCode: establishment.zipCode || "",
      status: establishment.status || "ACTIVE",
      traineeSlots: establishment.traineeSlots?.toString() ?? "",
      coordinatorFirstName: establishment.coordinatorFirstName || "",
      coordinatorLastName: establishment.coordinatorLastName || "",
      coordinatorMiddleInitial: establishment.coordinatorMiddleInitial || "",
      coordinatorAge: establishment.coordinatorAge?.toString() || "",
      coordinatorGender: establishment.coordinatorGender || "",
      coordinatorPosition: establishment.coordinatorPosition || "",
      coordinatorAddress: establishment.coordinatorAddress || "",
      coordinatorContact: establishment.coordinatorContact || "",
      coordinatorEmail: establishment.coordinatorEmail || "",
    });
    setIsDialogOpen(true);
  };

  const resetForm = () => {
    setEditTarget(null);
    setForm(EMPTY_FORM);
  };

  const handleOpenAddDialog = () => {
    setEditTarget(null);
    setForm(EMPTY_FORM);
    setIsDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setIsDialogOpen(false);
    resetForm();
  };

  const filteredEstablishments =
    establishments?.filter((est: Establishment) => {
      const searchLower = search.toLowerCase();
      return (
        est.name.toLowerCase().includes(searchLower) ||
        est.industryType?.toLowerCase().includes(searchLower) ||
        `${est.coordinatorFirstName} ${est.coordinatorLastName}`
          .toLowerCase()
          .includes(searchLower)
      );
    }) || [];

  const PAGE_SIZE = 5;
  const totalPages = Math.ceil(filteredEstablishments.length / PAGE_SIZE);
  const paged = filteredEstablishments.slice(
    (page - 1) * PAGE_SIZE,
    page * PAGE_SIZE,
  );

  return {
    form,
    error,
    deleteTarget,
    viewTarget,
    editTarget,
    search,
    page,
    establishments,
    isLoading,
    isCreating,
    isUpdating,
    paged,
    totalPages,
    filteredEstablishments,
    isDialogOpen,

    address,
    setAddress,

    INDUSTRY_OPTIONS,
    GENDER_OPTIONS,

    setForm,
    setError,
    setDeleteTarget,
    setViewTarget,
    setSearch,
    setPage,
    setField,
    setIsDialogOpen,

    handleSubmit,
    handleUpdate,
    handleDeleteConfirm,
    handleView,
    handleEdit,
    handleOpenAddDialog,
    handleCloseDialog,
  };
}

function readError(err: unknown, fallback: string): string {
  const data = (err as { data?: { message?: string | string[] } })?.data;
  if (Array.isArray(data?.message)) return data.message.join(", ");
  return data?.message ?? fallback;
}
