const DNI_LETTERS = 'TRWAGMYFPDXBNJZSQVHLCKE';

export function normalizeSpanishPersonId(value: string): string {
  const normalized = value.replace(/[\s-]+/g, '').toUpperCase();
  let expectedLetter: string;

  if (/^\d{8}[A-Z]$/.test(normalized)) {
    expectedLetter = DNI_LETTERS[Number(normalized.slice(0, 8)) % 23];
  } else if (/^[XYZ]\d{7}[A-Z]$/.test(normalized)) {
    const prefixValue = { X: '0', Y: '1', Z: '2' }[normalized[0] as 'X' | 'Y' | 'Z'];
    expectedLetter = DNI_LETTERS[Number(`${prefixValue}${normalized.slice(1, 8)}`) % 23];
  } else {
    throw new Error('El DNI/NIE debe tener un formato válido.');
  }

  if (normalized.at(-1) !== expectedLetter) {
    throw new Error('La letra de control del DNI/NIE no es válida.');
  }
  return normalized;
}
