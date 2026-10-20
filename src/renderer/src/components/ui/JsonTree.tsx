import { useState, type ReactNode } from 'react';

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function summaryOf(value: unknown): string {
  if (Array.isArray(value)) return `[${value.length} item${value.length === 1 ? '' : 's'}]`;
  if (isPlainObject(value)) return `{${Object.keys(value).length} key${Object.keys(value).length === 1 ? '' : 's'}}`;
  return '';
}

function scalarText(value: unknown): string {
  if (value === null) return 'null';
  if (typeof value === 'string') return JSON.stringify(value);
  return String(value);
}

function scalarClass(value: unknown): string {
  if (typeof value === 'string') return 'text-success';
  if (typeof value === 'number') return 'text-accent-active';
  if (typeof value === 'boolean') return 'text-accent';
  if (value === null) return 'text-label-tertiary';
  return 'text-label';
}

function keyClass(key: string): string {
  return key.startsWith('$') ? 'text-label-secondary' : 'text-label';
}

function JsonNode({
  label,
  value,
  depth,
  defaultOpen
}: {
  label: string | null;
  value: unknown;
  depth: number;
  defaultOpen: boolean;
}): ReactNode {
  const container = Array.isArray(value) || isPlainObject(value);
  const [open, setOpen] = useState(defaultOpen);

  if (!container) {
    return (
      <div className="flex items-baseline gap-1.5 py-px text-[length:var(--dt-font-size,12px)] [font-family:var(--font-code,ui-monospace)]" style={{ paddingLeft: depth * 14 }}>
        {label !== null ? <span className={keyClass(label)}>{label}</span> : null}
        {label !== null ? <span className="text-label-tertiary">:</span> : null}
        <span className={scalarClass(value)}>{scalarText(value)}</span>
      </div>
    );
  }

  const entries: Array<[string, unknown]> = Array.isArray(value)
    ? value.map((item, index) => [String(index), item])
    : Object.entries(value as Record<string, unknown>);
  const openLabel = Array.isArray(value) ? '[' : '{';
  const closeLabel = Array.isArray(value) ? ']' : '}';

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="flex w-full items-baseline gap-1.5 py-px text-left text-[length:var(--dt-font-size,12px)] [font-family:var(--font-code,ui-monospace)] hover:bg-well"
        style={{ paddingLeft: depth * 14 }}
      >
        <span
          className={`inline-block w-3 shrink-0 text-label-tertiary transition-transform duration-100 ${open ? 'rotate-90' : ''}`}
          aria-hidden="true"
        >
          ›
        </span>
        {label !== null ? <span className={keyClass(label)}>{label}</span> : null}
        {label !== null ? <span className="text-label-tertiary">:</span> : null}
        <span className="text-label-tertiary">{openLabel}</span>
        {!open ? (
          <>
            <span className="text-label-tertiary">{summaryOf(value)}</span>
            <span className="text-label-tertiary">{closeLabel}</span>
          </>
        ) : null}
      </button>
      {open ? (
        <div>
          {entries.map(([key, item]) => (
            <JsonNode
              key={key}
              label={Array.isArray(value) ? null : key}
              value={item}
              depth={depth + 1}
              defaultOpen={depth + 1 < 2}
            />
          ))}
          <div
            className="py-px text-[length:var(--dt-font-size,12px)] text-label-tertiary [font-family:var(--font-code,ui-monospace)]"
            style={{ paddingLeft: depth * 14 + 18 }}
          >
            {closeLabel}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default function JsonTree({ value, className }: { value: unknown; className?: string }) {
  return (
    <div className={`overflow-auto px-3 py-2 ${className ?? ''}`}>
      <JsonNode label={null} value={value} depth={0} defaultOpen />
    </div>
  );
}
