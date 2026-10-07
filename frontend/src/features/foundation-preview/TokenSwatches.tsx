// Class names are written out in full so Tailwind can see them.
const SWATCHES = [
  { token: 'background', classes: 'bg-background text-foreground border' },
  { token: 'card', classes: 'bg-card text-card-foreground border' },
  { token: 'muted', classes: 'bg-muted text-muted-foreground' },
  { token: 'primary', classes: 'bg-primary text-primary-foreground' },
  { token: 'secondary', classes: 'bg-secondary text-secondary-foreground' },
  { token: 'accent', classes: 'bg-accent text-accent-foreground' },
  { token: 'destructive', classes: 'bg-destructive text-destructive-foreground' },
  { token: 'success', classes: 'bg-success text-success-foreground' },
  { token: 'warning', classes: 'bg-warning text-warning-foreground' },
  { token: 'info', classes: 'bg-info text-info-foreground' },
  { token: 'sidebar', classes: 'bg-sidebar text-sidebar-foreground border' },
] as const;

export function TokenSwatches() {
  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {SWATCHES.map(({ token, classes }) => (
        <li key={token} className={`rounded-md p-3 ${classes}`}>
          <p className="text-sm font-medium">{token}</p>
          <p className="text-xs opacity-90">Aa text on {token}</p>
        </li>
      ))}
    </ul>
  );
}
