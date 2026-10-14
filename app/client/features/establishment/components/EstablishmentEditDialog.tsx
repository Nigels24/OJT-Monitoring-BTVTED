import { Building2, X } from "lucide-react";
import EstablishmentForm from "./EstablishmentForm";
import Overlay from "@/components/ui/Overlay";
import type { AddressValue } from "@/lib/hooks/use-address-picker";
import type { Establishment } from "@/lib/api/establishmentApi";
import type { EstablishmentFormValues } from "../hooks/use-establishment";

interface EstablishmentEditDialogProps {
  open: boolean;
  form: EstablishmentFormValues;
  editTarget: Establishment | null;
  isCreating: boolean;
  isUpdating: boolean;
  error: string;
  industryOptions: string[];
  genderOptions: string[];
  address: AddressValue;
  setAddress: (next: AddressValue) => void;
  setField: (
    key: keyof EstablishmentFormValues,
  ) => (e: { target: { value: string } }) => void;
  onSubmit: (e: React.FormEvent) => void;
  onReset: () => void;
  onClose: () => void;
}

export default function EstablishmentEditDialog({
  open,
  form,
  editTarget,
  isCreating,
  isUpdating,
  error,
  industryOptions,
  genderOptions,
  address,
  setAddress,
  setField,
  onSubmit,
  onReset,
  onClose,
}: EstablishmentEditDialogProps) {
  if (!open) return null;

  return (
    <Overlay
      open
      label={editTarget ? "Edit Establishment" : "Add Establishment"}
      onClose={onClose}
      closeOnBackdrop={false}
    >
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90dvh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 md:p-6 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <Building2 size={20} className="text-blue-600" />
            <h2 className="text-lg md:text-xl font-semibold text-gray-900">
              {editTarget ? "Edit Establishment" : "Add Establishment"}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-md hover:bg-gray-100 text-gray-500 hover:text-gray-700"
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>

        {/* Form Content */}
        <div className="flex-1 overflow-y-auto p-4 md:p-6">
          <EstablishmentForm
            form={form}
            editTarget={editTarget}
            isCreating={isCreating}
            isUpdating={isUpdating}
            error={error}
            industryOptions={industryOptions}
            genderOptions={genderOptions}
            setField={setField}
            onSubmit={onSubmit}
            onReset={onReset}
            address={address}
            setAddress={setAddress}
          />
        </div>
      </div>
    </Overlay>
  );
}
