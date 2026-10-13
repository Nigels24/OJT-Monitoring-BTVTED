"use client";

import { Info, Lock } from "lucide-react";
import SelectField from "@/components/ui/SelectField";
import {
  AddressValue,
  useAddressPicker,
} from "@/lib/hooks/use-address-picker";

interface AddressPickerProps {
  value: AddressValue;
  onChange: (next: AddressValue) => void;
  /** Marks the four selects as required in their labels. */
  required?: boolean;
  disabled?: boolean;
  /** Unique per form on a page, for the postal code input's id. */
  idPrefix?: string;
}

/**
 * A standardized Philippine address: region, province, city/municipality and
 * barangay chosen from the PSGC lists, each narrowing the next, with the
 * postal code supplied automatically.
 *
 * When the chosen city/municipality has a known postal code it is filled in
 * and locked. When none is known the box unlocks and says so — a code is never
 * guessed (see `lib/address/SOURCES.md` for what is covered).
 *
 * Renders five grid cells and no wrapper, so it drops into a form's existing
 * `grid`. The street / house line is the form's own field.
 */
export default function AddressPicker({
  value,
  onChange,
  required = false,
  disabled = false,
  idPrefix = "address",
}: AddressPickerProps) {
  const picker = useAddressPicker(value, onChange);
  const postalId = `${idPrefix}-postal-code`;
  const locked = picker.knownPostalCode !== null;

  const label = (text: string) => (
    <span className="block text-sm font-medium text-gray-700 mb-2">
      {text} {required && <span className="text-red-500">*</span>}
    </span>
  );

  return (
    <>
      <div>
        {label("Region")}
        <SelectField
          value={value.region}
          onChange={picker.setRegion}
          placeholder="Select Region"
          options={picker.options.regions}
          disabled={disabled}
          className="w-full"
        />
      </div>
      <div>
        {label("Province")}
        <SelectField
          value={value.province}
          onChange={picker.setProvince}
          placeholder={value.region ? "Select Province" : "Select a region first"}
          options={picker.options.provinces}
          disabled={disabled || !value.region}
          className="w-full"
        />
      </div>
      <div>
        {label("City / Municipality")}
        <SelectField
          value={value.city}
          onChange={picker.setCity}
          placeholder={
            value.province
              ? "Select City / Municipality"
              : "Select a province first"
          }
          options={picker.options.cities}
          disabled={disabled || !value.province}
          className="w-full"
        />
      </div>
      <div>
        {label("Barangay")}
        <SelectField
          value={value.barangay}
          onChange={picker.setBarangay}
          placeholder={
            value.city ? "Select Barangay" : "Select a city / municipality first"
          }
          options={picker.options.barangays}
          disabled={disabled || !value.city}
          className="w-full"
        />
      </div>
      <div>
        <label
          htmlFor={postalId}
          className="block text-sm font-medium text-gray-700 mb-2"
        >
          Postal Code
        </label>
        <div
          className={`flex items-center border border-gray-300 rounded-lg overflow-hidden focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-blue-500 ${
            locked ? "bg-gray-50" : "bg-white"
          }`}
        >
          <input
            id={postalId}
            type="text"
            inputMode="numeric"
            pattern="\d{4}"
            maxLength={4}
            value={picker.postalCode}
            readOnly={locked}
            disabled={disabled || !value.city}
            onChange={(e) => {
              picker.setPostalCode(e.target.value);
            }}
            placeholder={value.city ? "4 digits" : "Filled in from the city"}
            aria-describedby={`${postalId}-hint`}
            className="flex-1 h-11 px-4 outline-none text-sm text-gray-900 bg-transparent disabled:text-gray-400"
          />
          {locked && (
            <span className="px-3 text-gray-400" title="Filled in automatically">
              <Lock size={14} />
            </span>
          )}
        </div>
        <p
          id={`${postalId}-hint`}
          className={`text-xs mt-1.5 flex items-start gap-1 ${
            picker.postalCodeMissing ? "text-amber-700" : "text-gray-500"
          }`}
        >
          {picker.postalCodeMissing ? (
            <>
              <Info size={12} className="shrink-0 mt-0.5" />
              Postal code not found — please type it
            </>
          ) : locked ? (
            "Filled in automatically from the city / municipality."
          ) : (
            "Filled in when a city / municipality is chosen."
          )}
        </p>
      </div>
    </>
  );
}
