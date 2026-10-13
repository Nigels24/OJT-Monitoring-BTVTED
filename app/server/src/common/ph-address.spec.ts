import { BadRequestException } from '@nestjs/common';
import {
  addressProblems,
  assertValidAddress,
  barangaysOf,
  citiesOf,
  postalCodeFor,
  provinceGroupsOf,
} from './ph-address';

const REGION_IX = '0900000000';
const names = (options: { name: string }[]) => options.map((o) => o.name);

describe('provinceGroupsOf', () => {
  it('lists a region’s provinces and its independent cities together', () => {
    const groups = names(provinceGroupsOf(REGION_IX));
    expect(groups).toEqual(
      expect.arrayContaining([
        'Zamboanga del Norte',
        'Zamboanga del Sur',
        'Zamboanga Sibugay',
        // Not in any province in the PSGC data — unreachable without this.
        'Zamboanga City',
        'Isabela City',
      ]),
    );
  });

  it('makes an independent city reachable down to its barangays', () => {
    const group = provinceGroupsOf(REGION_IX).find(
      (g) => g.name === 'Zamboanga City',
    )!;
    const cities = citiesOf(group.code);
    expect(names(cities)).toEqual(['Zamboanga City']);
    expect(barangaysOf(cities[0].code).length).toBeGreaterThan(50);
  });

  it('offers Metro Manila for the capital, which has no provinces', () => {
    const groups = provinceGroupsOf('1300000000');
    const metro = groups.find((g) => g.name === 'Metro Manila')!;
    expect(names(citiesOf(metro.code))).toEqual(
      expect.arrayContaining(['Quezon City', 'Makati City', 'Pateros']),
    );
  });

  it('does not leak another region’s independent cities in', () => {
    expect(names(provinceGroupsOf(REGION_IX))).not.toContain('Cebu City');
    expect(names(provinceGroupsOf('0700000000'))).toContain('Cebu City');
  });
});

describe('addressProblems — consistency', () => {
  const dipolog = {
    region: 'Region IX',
    province: 'Zamboanga del Norte',
    cityMunicipality: 'Dipolog City',
    barangay: 'Central',
  };

  it('accepts a real region -> province -> city -> barangay chain', () => {
    expect(addressProblems(dipolog)).toEqual([]);
    expect(
      addressProblems({
        region: 'Region IX',
        province: 'Zamboanga City',
        cityMunicipality: 'Zamboanga City',
        barangay: 'Tetuan',
      }),
    ).toEqual([]);
  });

  it('accepts an empty address, and one filled in only from the top', () => {
    expect(addressProblems({})).toEqual([]);
    expect(
      addressProblems({ region: '', province: null, barangay: '  ' }),
    ).toEqual([]);
    expect(addressProblems({ region: 'Region IX' })).toEqual([]);
    expect(
      addressProblems({ region: 'Region IX', province: 'Zamboanga del Sur' }),
    ).toEqual([]);
  });

  it('matches names without regard to case or stray spaces', () => {
    expect(
      addressProblems({
        region: ' region ix ',
        province: 'ZAMBOANGA DEL NORTE',
        cityMunicipality: 'dipolog city',
        barangay: 'central',
      }),
    ).toEqual([]);
  });

  it('rejects an unknown region', () => {
    expect(addressProblems({ region: 'Region 99' })).toEqual([
      '"Region 99" is not a region',
    ]);
  });

  it('rejects a province that is not in the region', () => {
    expect(
      addressProblems({
        ...dipolog,
        province: 'Cebu',
        cityMunicipality: '',
        barangay: '',
      }),
    ).toEqual(['"Cebu" is not a province of Region IX']);
  });

  it('rejects a city that is not in the province', () => {
    expect(
      addressProblems({
        ...dipolog,
        cityMunicipality: 'Pagadian City',
        barangay: '',
      }),
    ).toEqual([
      '"Pagadian City" is not a city or municipality of Zamboanga del Norte',
    ]);
  });

  it('rejects a barangay that is not in the city', () => {
    expect(addressProblems({ ...dipolog, barangay: 'Tetuan' })).toEqual([
      '"Tetuan" is not a barangay of Dipolog City',
    ]);
  });

  it('rejects a level whose parent is missing', () => {
    expect(addressProblems({ province: 'Zamboanga del Norte' })).toEqual([
      'Choose a region before a province',
    ]);
    expect(
      addressProblems({
        region: 'Region IX',
        cityMunicipality: 'Dipolog City',
      }),
    ).toEqual(['Choose a province before a city/municipality']);
    expect(
      addressProblems({
        region: 'Region IX',
        province: 'Zamboanga del Norte',
        barangay: 'Central',
      }),
    ).toEqual(['Choose a city/municipality before a barangay']);
  });

  it('throws a 400 naming every problem', () => {
    expect(() => assertValidAddress(dipolog)).not.toThrow();
    expect(() =>
      assertValidAddress({ ...dipolog, barangay: 'Tetuan', postalCode: '71' }),
    ).toThrow(BadRequestException);
    expect(() =>
      assertValidAddress({ ...dipolog, barangay: 'Tetuan', postalCode: '71' }),
    ).toThrow(
      'Invalid address: "Tetuan" is not a barangay of Dipolog City; Postal code must be exactly 4 digits.',
    );
  });
});

describe('addressProblems — postal code', () => {
  const pagadian = {
    region: 'Region IX',
    province: 'Zamboanga del Sur',
    cityMunicipality: 'Pagadian City',
  };

  it('must be exactly four digits', () => {
    for (const postalCode of ['701', '70166', '70A6', '7 016']) {
      expect(addressProblems({ ...pagadian, postalCode })).toEqual([
        'Postal code must be exactly 4 digits',
      ]);
    }
  });

  it('must be the known code where the city has one', () => {
    expect(addressProblems({ ...pagadian, postalCode: '7016' })).toEqual([]);
    expect(addressProblems({ ...pagadian, postalCode: '7000' })).toEqual([
      'The postal code of Pagadian City is 7016',
    ]);
  });

  it('accepts any four digits where no code is known, so it can be typed', () => {
    const godod = {
      region: 'Region IX',
      province: 'Zamboanga del Norte',
      cityMunicipality: 'Godod',
    };
    expect(addressProblems({ ...godod, postalCode: '7100' })).toEqual([]);
    expect(addressProblems({ ...godod, postalCode: '1234' })).toEqual([]);
    expect(addressProblems({ postalCode: '7000' })).toEqual([]);
  });
});

describe('postalCodeFor', () => {
  const cityCode = (province: string, city: string) => {
    const group = provinceGroupsOf(REGION_IX).find((g) => g.name === province)!;
    return citiesOf(group.code).find((c) => c.name === city)!.code;
  };

  it.each([
    ['Zamboanga City', 'Zamboanga City', '7000'],
    ['Isabela City', 'Isabela City', '7300'],
    ['Zamboanga del Norte', 'Dipolog City', '7100'],
    ['Zamboanga del Norte', 'Dapitan City', '7101'],
    ['Zamboanga del Sur', 'Pagadian City', '7016'],
    ['Zamboanga del Sur', 'Molave', '7023'],
    ['Zamboanga Sibugay', 'Ipil', '7001'],
    ['Zamboanga Sibugay', 'Kabasalan', '7005'],
  ])('%s / %s -> %s', (province, city, code) => {
    expect(postalCodeFor(cityCode(province, city))).toBe(code);
  });

  it('is null for a place with no known code, and for nothing', () => {
    expect(postalCodeFor(cityCode('Zamboanga del Norte', 'Godod'))).toBeNull();
    expect(postalCodeFor('0000000000')).toBeNull();
    expect(postalCodeFor(null)).toBeNull();
    expect(postalCodeFor(undefined)).toBeNull();
  });

  it('covers every Region IX city and municipality except Godod', () => {
    const unmapped: string[] = [];
    for (const province of [
      'Zamboanga del Norte',
      'Zamboanga del Sur',
      'Zamboanga Sibugay',
      'Zamboanga City',
      'Isabela City',
    ]) {
      const group = provinceGroupsOf(REGION_IX).find(
        (g) => g.name === province,
      )!;
      for (const city of citiesOf(group.code)) {
        const code = postalCodeFor(city.code);
        if (code === null) unmapped.push(city.name);
        else expect(code).toMatch(/^7\d{3}$/);
      }
    }
    expect(unmapped).toEqual(['Godod']);
  });
});
