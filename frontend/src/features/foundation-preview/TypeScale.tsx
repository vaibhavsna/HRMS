const SCALE = [
  { name: 'Page title', size: '30 / 36', classes: 'text-3xl font-semibold' },
  { name: 'Section heading', size: '24 / 32', classes: 'text-2xl font-semibold' },
  { name: 'Card title', size: '20 / 28', classes: 'text-xl font-semibold' },
  { name: 'Lead text', size: '18 / 28', classes: 'text-lg' },
  { name: 'Body and form fields', size: '16 / 24', classes: 'text-base' },
  { name: 'Dense UI and table cells', size: '14 / 20', classes: 'text-sm' },
  { name: 'Captions, hints, badges', size: '12 / 16', classes: 'text-xs' },
] as const;

export function TypeScale() {
  return (
    <dl className="grid grid-cols-1 gap-3">
      {SCALE.map(({ name, size, classes }) => (
        <div
          key={name}
          className="grid gap-0.5 border-b pb-3 last:border-b-0 sm:grid-cols-[14rem_1fr] sm:items-baseline sm:gap-4"
        >
          <dt className="text-xs text-muted-foreground">
            {name} <span className="tabular-nums">({size} px)</span>
          </dt>
          <dd className={classes}>Leave request for 12 to 14 March</dd>
        </div>
      ))}
    </dl>
  );
}
