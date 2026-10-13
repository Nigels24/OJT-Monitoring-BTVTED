import { Phone, MapPin, Save, X } from "lucide-react";
import TextField from "@/components/ui/TextField";
import AddressPicker from "@/components/ui/AddressPicker";
import type { AddressValue } from "@/lib/hooks/use-address-picker";
import Button from "@/components/ui/Button";
import type { ProfileFormValues } from "../hooks/use-profile";

interface ProfileEditFormProps {
  form: ProfileFormValues;
  error: string;
  isSubmitting: boolean;
  setField: (
    key: keyof ProfileFormValues,
  ) => (e: { target: { value: string } }) => void;
  /** Region, province, city, barangay and postal code, for the shared picker. */
  address: AddressValue;
  setAddress: (next: AddressValue) => void;
  onSubmit: (e: React.FormEvent) => void;
  onCancel: () => void;
}

export default function ProfileEditForm({
  form,
  error,
  isSubmitting,
  setField,
  address,
  setAddress,
  onSubmit,
  onCancel,
}: ProfileEditFormProps) {
  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <TextField
        label="Contact Number"
        labelIcon={Phone}
        fieldIcon={Phone}
        placeholder="09123456789"
        value={form.contactNumber}
        onChange={setField("contactNumber")}
      />

      {/* The picker renders one cell per field; here they simply stack. */}
      <div className="grid grid-cols-1 gap-4">
        <AddressPicker
          value={address}
          onChange={setAddress}
          idPrefix="profile"
        />
        <TextField
          label="House No. / Street (optional)"
          labelIcon={MapPin}
          fieldIcon={MapPin}
          value={form.streetAddress}
          onChange={setField("streetAddress")}
          placeholder="House no., street, purok"
          maxLength={255}
        />
      </div>

      <p className="text-xs text-gray-500">
        Only your contact number and address can be updated here. Everything
        else on your profile is managed by your coordinator.
      </p>

      {error && (
        <p className="text-sm text-red-600 border border-red-200 bg-red-50 rounded-lg px-3 py-2">
          {error}
        </p>
      )}

      <div className="flex gap-3">
        <Button type="submit" icon={Save} loading={isSubmitting}>
          Save Changes
        </Button>
        <Button
          type="button"
          variant="secondary"
          icon={X}
          onClick={onCancel}
          disabled={isSubmitting}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}
