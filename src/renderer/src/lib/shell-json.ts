const OID_PLACEHOLDER = '@@OID:';

function convert(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(convert);
  if (value !== null && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    if (typeof obj.$oid === 'string' && Object.keys(obj).length === 1) {
      return `${OID_PLACEHOLDER}${obj.$oid}@@`;
    }
    const out: Record<string, unknown> = {};
    for (const [key, inner] of Object.entries(obj)) out[key] = convert(inner);
    return out;
  }
  return value;
}

export function toShellJson(value: unknown): string {
  const text = JSON.stringify(convert(value), null, 2);
  return text.replace(new RegExp('"@@OID:([^@]+)@@"', 'g'), 'ObjectId("$1")');
}

export function parseShellJson(text: string): unknown {
  const withPlaceholders = text.replace(/ObjectId\(\s*"([^"]+)"\s*\)/g, (_match, hex: string) =>
    JSON.stringify({ $oid: hex })
  );
  return JSON.parse(withPlaceholders);
}
