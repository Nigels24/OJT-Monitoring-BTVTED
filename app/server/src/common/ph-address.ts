import { BadRequestException } from '@nestjs/common';
import {
  getAllMunicipalities,
  getAllProvinces,
  getAllRegions,
  getBarangaysByMunicipality,
  getMunicipalitiesByProvince,
  getMunicipalityByCode,
  getProvincesByRegion,
} from '@aivangogh/ph-address';
import {
  PHLPOST_POSTAL_CODES,
  REGION_IX_POSTAL_CODES,
} from './postal-codes.data';

/**
 * Philippine addresses, as the PSGC lists them: region -> province ->
 * city/municipality -> barangay, plus the postal code of a city/municipality
 * where one is known.
 *
 * The database stores the *names* the user picked, not PSGC codes (the same
 * call Establishment made), so this is what checks that a submitted set of
 * names is real and consistent — the province is in that region, the city in
 * that province, the barangay in that city. The pickers in the client offer
 * only valid combinations; this is the check that does not take their word
 * for it.
 *
 * Mirrored on the client at `app/client/lib/address/ph-locations.ts` (the
 * projects share no code). The one piece of logic both must agree on is
 * `provinceGroupsOf`, below.
 */
export interface PlaceOption {
  code: string;
  name: string;
}

const NCR_REGION_CODE = '1300000000';

const realProvinceCodes = new Set(getAllProvinces().map((p) => p.psgcCode));

/**
 * The second level of the cascade for a region: its provinces, **plus** the
 * cities that belong to no province.
 *
 * The PSGC data files a highly urbanized or independent city (Zamboanga City,
 * Isabela City, Cebu City, all of Metro Manila…) under a parent code that is
 * not a province, so a plain region -> province lookup never offers them and
 * they cannot be chosen at all. Each such parent is surfaced here as one more
 * entry at the province level, named for what it is: the city itself when it
 * holds one city, "Metro Manila" for the capital's cities, the parent city for
 * a city's districts.
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
        ? 'Metro Manila'
        : (getMunicipalityByCode(code)?.name ??
          (members.length === 1 ? members[0] : 'Special Geographic Area')),
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

/** The known postal code of a city/municipality, by PSGC code; else `null`. */
export function postalCodeFor(
  cityCode: string | null | undefined,
): string | null {
  if (!cityCode) return null;
  return (
    PHLPOST_POSTAL_CODES[cityCode] ?? REGION_IX_POSTAL_CODES[cityCode] ?? null
  );
}

export interface AddressNames {
  region?: string | null;
  province?: string | null;
  cityMunicipality?: string | null;
  barangay?: string | null;
  postalCode?: string | null;
}

const same = (a: string, b: string) =>
  a.trim().toLowerCase() === b.trim().toLowerCase();
const given = (value?: string | null): value is string =>
  typeof value === 'string' && value.trim() !== '';

/**
 * Every reason a set of address names is not a real, consistent address.
 * An empty list means it is fine.
 *
 * The address is optional, and may be filled in from the top down: a region
 * alone, or region and province, is acceptable. What is not acceptable is a
 * level whose parent is missing or does not contain it.
 *
 * The postal code must be four digits; and where the chosen city/municipality
 * has a known code it must be that one — the form fills it in and locks it
 * there, so a different value can only be a mistake or a tampered request.
 */
export function addressProblems(address: AddressNames): string[] {
  const problems: string[] = [];
  const { region, province, cityMunicipality, barangay, postalCode } = address;

  const regionMatch = given(region)
    ? getAllRegions().find((r) => same(r.name, region))
    : undefined;
  if (given(region) && !regionMatch) {
    problems.push(`"${region}" is not a region`);
  }

  let provinceMatch: PlaceOption | undefined;
  if (given(province)) {
    if (!given(region)) {
      problems.push('Choose a region before a province');
    } else if (regionMatch) {
      provinceMatch = provinceGroupsOf(regionMatch.psgcCode).find((p) =>
        same(p.name, province),
      );
      if (!provinceMatch) {
        problems.push(`"${province}" is not a province of ${regionMatch.name}`);
      }
    }
  }

  let cityMatch: PlaceOption | undefined;
  if (given(cityMunicipality)) {
    if (!given(province)) {
      problems.push('Choose a province before a city/municipality');
    } else if (provinceMatch) {
      cityMatch = citiesOf(provinceMatch.code).find((c) =>
        same(c.name, cityMunicipality),
      );
      if (!cityMatch) {
        problems.push(
          `"${cityMunicipality}" is not a city or municipality of ${provinceMatch.name}`,
        );
      }
    }
  }

  if (given(barangay)) {
    if (!given(cityMunicipality)) {
      problems.push('Choose a city/municipality before a barangay');
    } else if (
      cityMatch &&
      !barangaysOf(cityMatch.code).some((b) => same(b.name, barangay))
    ) {
      problems.push(`"${barangay}" is not a barangay of ${cityMatch.name}`);
    }
  }

  if (given(postalCode)) {
    if (!/^\d{4}$/.test(postalCode.trim())) {
      problems.push('Postal code must be exactly 4 digits');
    } else {
      const known = postalCodeFor(cityMatch?.code);
      if (known && known !== postalCode.trim()) {
        problems.push(`The postal code of ${cityMatch!.name} is ${known}`);
      }
    }
  }

  return problems;
}

/** Throws a 400 listing every problem with the address, if there is one. */
export function assertValidAddress(address: AddressNames): void {
  const problems = addressProblems(address);
  if (problems.length > 0) {
    throw new BadRequestException(`Invalid address: ${problems.join('; ')}.`);
  }
}
