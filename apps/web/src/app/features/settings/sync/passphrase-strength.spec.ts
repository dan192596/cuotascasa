import { describe, expect, it } from 'vitest';
import { MIN_RECOMMENDED_LENGTH, passphraseStrength } from './passphrase-strength.ts';

describe('passphraseStrength', () => {
  it('rates an empty phrase as none', () => {
    expect(passphraseStrength('')).toEqual({ level: 0, label: 'Escribe una frase' });
  });

  it('rates short phrases as weak, whatever their characters', () => {
    expect(passphraseStrength('Ab1!').level).toBe(1);
    expect(passphraseStrength('Zq9$Zq9$').label).toBe('Débil');
  });

  it('rates a long phrase of lowercase words as acceptable and a longer varied one as strong', () => {
    expect(passphraseStrength('casa azul junto al rio').level).toBe(2);
    expect(passphraseStrength('Mi casa azul, junto al río 2031').level).toBe(3);
    expect(passphraseStrength('Mi casa azul, junto al río 2031').label).toBe('Fuerte');
  });

  it('penalises a single repeated character', () => {
    expect(passphraseStrength('a'.repeat(30)).level).toBe(1);
  });

  it('exposes the recommended minimum length', () => {
    expect(MIN_RECOMMENDED_LENGTH).toBe(12);
  });
});
