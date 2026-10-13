import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { getMunicipalityByCode } from '@aivangogh/ph-address';
import {
  PHLPOST_POSTAL_CODES,
  REGION_IX_POSTAL_CODES,
} from './postal-codes.data';

const CLIENT_DATA = join(__dirname, '../../../client/lib/address');
const readClient = (file: string) =>
  JSON.parse(readFileSync(join(CLIENT_DATA, file), 'utf8')) as Record<
    string,
    string
  >;

describe('postal code data', () => {
  const all = { ...PHLPOST_POSTAL_CODES, ...REGION_IX_POSTAL_CODES };

  it('is four digits for a real city/municipality, every time', () => {
    for (const [code, postal] of Object.entries(all)) {
      expect(postal).toMatch(/^\d{4}$/);
      expect(getMunicipalityByCode(code)).toBeDefined();
    }
  });

  it('never lists one place in both sets', () => {
    const overlap = Object.keys(PHLPOST_POSTAL_CODES).filter(
      (code) => code in REGION_IX_POSTAL_CODES,
    );
    expect(overlap).toEqual([]);
  });

  // The two projects share no code, so the data exists twice. This is what
  // keeps the copies from drifting. Skipped only where the client is absent
  // (a server-only checkout).
  (existsSync(CLIENT_DATA) ? it : it.skip)(
    'is identical to the client’s copy',
    () => {
      expect(PHLPOST_POSTAL_CODES).toEqual(
        readClient('postal-codes.phlpost.json'),
      );
      expect(REGION_IX_POSTAL_CODES).toEqual(
        readClient('postal-codes.region-ix.json'),
      );
    },
  );
});
