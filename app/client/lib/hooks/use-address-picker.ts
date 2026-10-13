import { useMemo } from "react";
import { AddressNames, resolveAddress } from "@/lib/address/ph-locations";
import { postalCodeFor } from "@/lib/address/postal-codes";

/** An address as a form holds it: four chosen names and the postal code. */
export interface AddressValue extends AddressNames {
  postalCode: string;
}

export const EMPTY_ADDRESS: AddressValue = {
  region: "",
  province: "",
  city: "",
  barangay: "",
  postalCode: "",
};

/**
 * The region -> province -> city/municipality -> barangay cascade, with the
 * postal code filled in from the city/municipality. One hook for every form
 * that takes an address — the coordinator's student form, the student's own
 * profile, and the establishment form.
 *
 * The form owns the value (names); this derives the option lists from it and
 * returns the handlers that change it. Picking a level clears everything below
 * it, in the same update — there are no effects here, and so nothing that can
 * wipe a value while an existing record is being loaded for editing.
 */
export function useAddressPicker(
  value: AddressValue,
  onChange: (next: AddressValue) => void,
) {
  const { region, province, city, barangay } = value;
  const resolved = useMemo(
    () => resolveAddress({ region, province, city, barangay }),
    [region, province, city, barangay],
  );
  const knownPostalCode = postalCodeFor(resolved.city?.code);

  const setRegion = (name: string) => {
    onChange({ ...EMPTY_ADDRESS, region: name });
  };

  const setProvince = (name: string) => {
    const next = { ...EMPTY_ADDRESS, region: value.region, province: name };
    // An independent city is its own province-level entry with exactly one
    // city inside — choosing it has already chosen the city.
    const cities = resolveAddress(next).cities;
    onChange(cities.length === 1 ? withCity(next, cities[0].name) : next);
  };

  const setCity = (name: string) => {
    onChange(withCity({ ...value, barangay: "", postalCode: "" }, name));
  };

  const setBarangay = (name: string) => {
    onChange({ ...value, barangay: name });
  };

  const setPostalCode = (postalCode: string) => {
    // Digits only, four at most — it is typed only where no code is known.
    onChange({ ...value, postalCode: postalCode.replace(/\D/g, "").slice(0, 4) });
  };

  return {
    options: {
      regions: toSelectOptions(resolved.regions),
      provinces: toSelectOptions(resolved.provinces),
      cities: toSelectOptions(resolved.cities),
      barangays: toSelectOptions(resolved.barangays),
    },
    /** The automatic code for the chosen city/municipality, if one is known. */
    knownPostalCode,
    /** What the postal code box shows: the known code, else what was typed. */
    postalCode: knownPostalCode ?? value.postalCode,
    /** A city is chosen but no code is known for it — the box is editable. */
    postalCodeMissing: !!resolved.city && knownPostalCode === null,
    setRegion,
    setProvince,
    setCity,
    setBarangay,
    setPostalCode,
  };
}

/** Sets the city and, with it, its postal code where one is known. */
function withCity(value: AddressValue, city: string): AddressValue {
  const next = { ...value, city };
  return {
    ...next,
    postalCode: postalCodeFor(resolveAddress(next).city?.code) ?? "",
  };
}

/** Names are both the label and the value — the forms store names. */
function toSelectOptions(options: { name: string }[]) {
  return options.map((option) => ({ label: option.name, value: option.name }));
}
