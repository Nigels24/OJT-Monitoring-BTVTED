import phlpost from "./postal-codes.phlpost.json";
import regionIx from "./postal-codes.region-ix.json";
import { AddressNames, resolveAddress } from "./ph-locations";

/**
 * Postal (ZIP) codes by PSGC city/municipality code — what fills the postal
 * code in automatically once a city or municipality is chosen.
 *
 * `@aivangogh/ph-address` carries no postal codes, so they are static data
 * here, in two files kept apart by where they came from. **`SOURCES.md` in
 * this folder says exactly which places are covered, where each set was
 * taken from and how it was checked.** A place that is not in either file has
 * no known code: the form then lets the user type it. Codes are never guessed.
 *
 * Copied on the server as `src/common/postal-codes.data.ts`, which rejects a
 * postal code that contradicts a known one; a server test fails if the two
 * copies differ.
 */
const PHLPOST: Record<string, string> = phlpost;
const REGION_IX: Record<string, string> = regionIx;

/** The known postal code of a city/municipality, by PSGC code; else `null`. */
export function postalCodeFor(cityCode: string | null | undefined): string | null {
  if (!cityCode) return null;
  return PHLPOST[cityCode] ?? REGION_IX[cityCode] ?? null;
}

/** The known postal code of the city/municipality an address names, if any. */
export function knownPostalCode(names: AddressNames): string | null {
  return postalCodeFor(resolveAddress(names).city?.code);
}

/**
 * The postal code to save: the known one where there is one — whatever an
 * older record or a stale form field holds — and otherwise what was typed.
 */
export function effectivePostalCode(names: AddressNames, typed: string): string {
  return knownPostalCode(names) ?? typed.trim();
}
