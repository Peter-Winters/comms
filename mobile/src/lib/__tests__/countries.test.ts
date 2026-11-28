import { COUNTRIES, flag, toInternational } from '../countries';

const ireland = COUNTRIES.find((c) => c.iso === 'IE')!;
const italy = COUNTRIES.find((c) => c.iso === 'IT')!;

describe('toInternational', () => {
  it('adds the country code and drops the leading 0', () => {
    expect(toInternational(ireland, '089 701 2345')).toBe('+353897012345');
  });
  it('keeps a number typed with its own +', () => {
    expect(toInternational(ireland, '+44 7700 900123')).toBe('+447700900123');
  });
  it('understands 00 dialling', () => {
    expect(toInternational(ireland, '0044 7700 900123')).toBe('+447700900123');
  });
  it('keeps the 0 for Italy', () => {
    expect(toInternational(italy, '06 1234 5678')).toBe('+390612345678');
  });
  it('returns nothing for an empty number', () => {
    expect(toInternational(ireland, '  ')).toBe('');
  });
});

describe('countries', () => {
  it('starts with Ireland and has a flag for each', () => {
    expect(COUNTRIES[0].iso).toBe('IE');
    expect(flag('IE')).toBe('🇮🇪');
    expect(COUNTRIES.every((c) => /^[A-Z]{2}$/.test(c.iso) && /^\d+$/.test(c.dial) && c.name)).toBe(true);
  });
});
