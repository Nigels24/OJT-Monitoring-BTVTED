import {
  getAllMunicipalities,
  getAllProvinces,
  getAllRegions,
  getBarangaysByMunicipality,
  getMunicipalitiesByProvince,
  getMunicipalityByCode,
  getProvincesByRegion,
} from "@aivangogh/ph-address";

/**
 * Philippine places for the address picker: region -> province ->
 * city/municipality -> barangay, from the PSGC data in `@aivangogh/ph-address`.
 *
 * The forms store and send the *names* a user picks, not PSGC codes (the
 * database keeps names), so everything here can be looked up by name as well
 * as listed by code.
 *
 * Mirrored on the server at `app/server/src/common/ph-address.ts`, which
 * checks every submitted address against the same data. The projects share no
 * code — keep `provinceGroupsOf` identical on both sides.
 */
export interface PlaceOption {
  code: string;
  name: string;
}

const NCR_REGION_CODE = "1300000000";

const realProvinceCodes = new Set(getAllProvinces().map((p) => p.psgcCode));

export function regionOptions(): PlaceOption[] {
  return getAllRegions().map((r) => ({ code: r.psgcCode, name: r.name }));
}

/**
 * The second level of the cascade for a region: its provinces, **plus** the
 * cities that belong to no province.
 *
 * The PSGC data files a highly urbanized or independent city (Zamboanga City,
 * Isabela City, Cebu City, all of Metro Manila…) under a parent code that is
 * not a province, so a plain region -> province lookup never offers them and
 * they could not be chosen at all. Each such parent is surfaced here as one
 * more entry at the province level, named for what it is: the city itself when
 * it holds one city, "Metro Manila" for the capital's cities, the parent city
 * for a city's districts.
 */
export function provinceGroupsOf(regionCode: string): PlaceOption[] {
  const provinces = getProvincesByRegion(regionCode).map((p) => ({
    code: p.psgcCode,
    name: p.name,
  }));

  const regionPrefix = regionCode.slice(0, 2);
  const independent = new Map<string, string[]>();
  for (const municipality of getAllMunicipalities()) {
    if (realProvinceCodes.has(municipality.provinceCode)) continue;
    if (municipality.psgcCode.slice(0, 2) !== regionPrefix) continue;
    const members = independent.get(municipality.provinceCode) ?? [];
    members.push(municipality.name);
    independent.set(municipality.provinceCode, members);
  }

  const groups = [...independent.entries()].map(([code, members]) => ({
    code,
    name:
      code === NCR_REGION_CODE
        ? "Metro Manila"
        : (getMunicipalityByCode(code)?.name ??
          (members.length === 1 ? members[0] : "Special Geographic Area")),
  }));

  return [...provinces, ...groups].sort((a, b) => a.name.localeCompare(b.name));
}

/** The cities and municipalities of a province, or of an independent group. */
export function citiesOf(provinceGroupCode: string): PlaceOption[] {
  return getMunicipalitiesByProvince(provinceGroupCode).map((m) => ({
    code: m.psgcCode,
    name: m.name,
  }));
}

export function barangaysOf(cityCode: string): PlaceOption[] {
  return getBarangaysByMunicipality(cityCode).map((b) => ({
    code: b.psgcCode,
    name: b.name,
  }));
}

/** The four names of an address, as the forms hold them ("" = not chosen). */
export interface AddressNames {
  region: string;
  province: string;
  city: string;
  barangay: string;
}

const byName = (options: PlaceOption[], name: string) =>
  name ? options.find((option) => option.name === name) : undefined;

/**
 * The option lists for an address as it stands, and the PSGC code of each
 * level that is chosen. Resolved from the names every time — there is no
 * second copy of the selection held as codes to fall out of step with them,
 * which is what the old establishment form needed a ref and four effects to
 * keep straight.
 */
export function resolveAddress(names: AddressNames) {
  const regions = regionOptions();
  const region = byName(regions, names.region);
  const provinces = region ? provinceGroupsOf(region.code) : [];
  const province = byName(provinces, names.province);
  const cities = province ? citiesOf(province.code) : [];
  const city = byName(cities, names.city);
  const barangays = city ? barangaysOf(city.code) : [];
  return { regions, provinces, cities, barangays, region, province, city };
}

/**
 * One line for display: "Purok 2, Tetuan, Zamboanga City, Region IX 7000".
 * A province named the same as its city (an independent city) is not repeated.
 */
export function formatAddress(address: {
  streetAddress?: string | null;
  barangay?: string | null;
  city?: string | null;
  province?: string | null;
  region?: string | null;
  postalCode?: string | null;
}): string {
  const parts = [
    address.streetAddress,
    address.barangay,
    address.city,
    address.province && address.province !== address.city
      ? address.province
      : null,
    address.region,
  ]
    .map((part) => part?.trim())
    .filter(Boolean);
  const line = parts.join(", ");
  return [line, address.postalCode?.trim()].filter(Boolean).join(" ");
}
