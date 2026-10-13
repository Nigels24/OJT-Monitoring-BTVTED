import {
  Building2,
  MapPin,
  User,
  Phone,
  Mail,
} from "lucide-react";
import TextField from "@/components/ui/TextField";
import AddressPicker from "@/components/ui/AddressPicker";
import type { AddressValue } from "@/lib/hooks/use-address-picker";
import type { Establishment } from "@/lib/api/establishmentApi";
import type { EstablishmentFormValues } from "../hooks/use-establishment";
import Button from "@/components/ui/Button";
import SelectField from "@/components/ui/SelectField";

interface EstablishmentFormProps {
  form: EstablishmentFormValues;
  editTarget: Establishment | null;
  isCreating: boolean;
  isUpdating: boolean;
  error: string;
  industryOptions: string[];
  genderOptions: string[];
  setField: (
    key: keyof EstablishmentFormValues,
  ) => (e: { target: { value: string } }) => void;
  onSubmit: (e: React.FormEvent) => void;
  onReset: () => void;
  /** Region, province, city, barangay and postal code, for the shared picker. */
  address: AddressValue;
  setAddress: (next: AddressValue) => void;
}

export default function EstablishmentForm({
  form,
  editTarget,
  isCreating,
  isUpdating,
  error,
  industryOptions,
  genderOptions,
  setField,
  onSubmit,
  onReset,
  address,
  setAddress,
}: EstablishmentFormProps) {
  return (
    <form onSubmit={onSubmit} className="mt-6 space-y-6 md:space-y-8">
      {/* Establishment Details */}
      <div className="border-l-4 border-blue-400 pl-4 md:pl-6">
        <div className="flex items-center gap-2 mb-4 max-w-4xl mx-auto">
          <Building2 size={16} className="text-gray-700" />
          <h3 className="font-semibold text-gray-900 text-base md:text-lg">
            Establishment Details
          </h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4 max-w-4xl mx-auto">
          <TextField
            label="Establishment Name"
            labelIcon={Building2}
            fieldIcon={Building2}
            required
            value={form.name}
            onChange={setField("name")}
            placeholder="e.g., Tech Solutions Inc."
          />
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Industry Type <span className="text-red-500">*</span>
            </label>
            <SelectField
              value={form.industryType}
              onChange={(value) =>
                setField("industryType")({ target: { value } })
              }
              placeholder="Select Industry"
              options={industryOptions.map((opt) => ({
                label: opt,
                value: opt,
              }))}
              className="w-full"
            />
          </div>
          <TextField
            label="Street Address"
            labelIcon={MapPin}
            fieldIcon={MapPin}
            value={form.streetAddress}
            onChange={setField("streetAddress")}
            placeholder="Street building, unit"
          />
          <AddressPicker
            value={address}
            onChange={setAddress}
            required
            idPrefix="establishment"
          />
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Status <span className="text-red-500">*</span>
            </label>
            <SelectField
              value={form.status}
              onChange={(value) =>
                setField("status")({ target: { value } })
              }
              placeholder="Select Status"
              options={[
                { label: "Active", value: "ACTIVE" },
                { label: "Inactive", value: "INACTIVE" },
              ]}
              className="w-full"
            />
          </div>
          <div>
            <TextField
              label="Trainee Slots"
              type="number"
              min={0}
              max={10000}
              step={1}
              value={form.traineeSlots}
              onChange={setField("traineeSlots")}
              placeholder="No limit"
            />
            <p className="text-xs text-gray-500 mt-1.5">
              How many trainees this establishment can take at once. Leave
              blank if there is no limit.
            </p>
          </div>
        </div>
      </div>

      {/* Establishment Coordinator Details */}
      <div className="border-l-4 border-blue-400 pl-4 md:pl-6">
        <div className="flex items-center gap-2 mb-4 max-w-4xl mx-auto">
          <User size={16} className="text-gray-700" />
          <h3 className="font-semibold text-gray-900 text-base md:text-lg">
            Establishment Coordinator Details
          </h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-4 max-w-4xl mx-auto">
          <TextField
            label="First Name"
            required
            value={form.coordinatorFirstName}
            onChange={setField("coordinatorFirstName")}
            placeholder="First name"
          />
          <TextField
            label="Last Name"
            required
            value={form.coordinatorLastName}
            onChange={setField("coordinatorLastName")}
            placeholder="Last name"
          />
          <TextField
            label="Middle Initial"
            value={form.coordinatorMiddleInitial}
            onChange={setField("coordinatorMiddleInitial")}
            placeholder="M.I."
          />
          <TextField
            label="Age"
            required
            type="number"
            value={form.coordinatorAge}
            onChange={setField("coordinatorAge")}
            placeholder="Age"
          />
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Gender <span className="text-red-500">*</span>
            </label>
            <SelectField
              value={form.coordinatorGender}
              onChange={(value) =>
                setField("coordinatorGender")({ target: { value } })
              }
              placeholder="Select Gender"
              options={genderOptions.map((opt) => ({
                label: opt,
                value: opt,
              }))}
              className="w-full"
            />
          </div>
          <TextField
            label="Position"
            value={form.coordinatorPosition}
            onChange={setField("coordinatorPosition")}
            placeholder="Position"
          />
          <TextField
            label="Address"
            labelIcon={MapPin}
            fieldIcon={MapPin}
            value={form.coordinatorAddress}
            onChange={setField("coordinatorAddress")}
            placeholder="Address"
          />
          <TextField
            label="Contact"
            labelIcon={Phone}
            fieldIcon={Phone}
            value={form.coordinatorContact}
            onChange={setField("coordinatorContact")}
            placeholder="Contact number"
          />
          <TextField
            label="Email"
            labelIcon={Mail}
            fieldIcon={Mail}
            value={form.coordinatorEmail}
            onChange={setField("coordinatorEmail")}
            placeholder="Email address"
          />
        </div>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex justify-end gap-3">
        <Button
          type="button"
          variant="secondary"
          onClick={onReset}
        >
          {editTarget ? "Cancel" : "Clear"}
        </Button>
        <Button
          type="submit"
          loading={isCreating || isUpdating}
        >
          {editTarget ? "Update Establishment" : "Save Establishment"}
        </Button>
      </div>
    </form>
  );
}