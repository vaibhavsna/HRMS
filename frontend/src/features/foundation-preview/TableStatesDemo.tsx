import { Inbox, RotateCw, TriangleAlert } from 'lucide-react';
import { useState } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

type TableState = 'ready' | 'loading' | 'refetching' | 'empty-new' | 'empty-filtered' | 'error';
type EmploymentStatus = 'active' | 'on_leave' | 'terminated';

const STATE_BUTTONS: { key: TableState; label: string }[] = [
  { key: 'ready', label: 'Ready' },
  { key: 'loading', label: 'First load' },
  { key: 'refetching', label: 'Refetching' },
  { key: 'empty-new', label: 'Empty: no data yet' },
  { key: 'empty-filtered', label: 'Empty: filter has no results' },
  { key: 'error', label: 'Error' },
];

const STATE_MESSAGE: Record<TableState, string> = {
  ready: '4 employees',
  loading: 'Loading employees…',
  refetching: 'Updating results…',
  'empty-new': 'No employees yet',
  'empty-filtered': 'No employees match the filters',
  error: 'Could not load employees',
};

// A missing status here fails `npm run typecheck`; the same technique guards filters (S5-3).
const STATUS_BADGE = {
  active: { label: 'Active', variant: 'success' },
  on_leave: { label: 'On leave', variant: 'warning' },
  terminated: { label: 'Terminated', variant: 'secondary' },
} as const satisfies Record<
  EmploymentStatus,
  { label: string; variant: 'success' | 'warning' | 'secondary' }
>;

// Sample data only; no real employees.
const SAMPLE_ROWS: { code: string; name: string; department: string; status: EmploymentStatus }[] =
  [
    { code: 'EMP-1001', name: 'Sample Employee One', department: 'Engineering', status: 'active' },
    {
      code: 'EMP-1002',
      name: 'Sample Employee Two',
      department: 'People Operations',
      status: 'on_leave',
    },
    { code: 'EMP-1003', name: 'Sample Employee Three', department: 'Finance', status: 'active' },
    {
      code: 'EMP-1004',
      name: 'Sample Employee Four',
      department: 'Engineering',
      status: 'terminated',
    },
  ];

const COLUMNS = 3;

function LoadingRows() {
  return (
    <>
      {[0, 1, 2, 3].map((row) => (
        <TableRow key={row}>
          <TableCell colSpan={COLUMNS}>
            <Skeleton className="h-4 w-full" />
          </TableCell>
        </TableRow>
      ))}
    </>
  );
}

function DataRows() {
  return (
    <>
      {SAMPLE_ROWS.map((row) => {
        const badge = STATUS_BADGE[row.status];
        return (
          <TableRow key={row.code}>
            <TableCell>
              <span className="font-medium">{row.name}</span>
              <span className="block text-xs text-muted-foreground tabular-nums">{row.code}</span>
            </TableCell>
            <TableCell>{row.department}</TableCell>
            <TableCell>
              <Badge variant={badge.variant}>{badge.label}</Badge>
            </TableCell>
          </TableRow>
        );
      })}
    </>
  );
}

function EmptyRow({ filtered }: { filtered: boolean }) {
  return (
    <TableRow>
      <TableCell colSpan={COLUMNS} className="py-10 text-center">
        <Inbox className="mx-auto mb-2 size-6 text-muted-foreground" aria-hidden="true" />
        <p className="font-medium">
          {filtered ? 'No employees match these filters' : 'No employees yet'}
        </p>
        <p className="mb-3 text-sm text-muted-foreground">
          {filtered
            ? 'Try a different department or status.'
            : 'Add the first employee to get started.'}
        </p>
        <Button type="button" variant={filtered ? 'outline' : 'default'} size="sm">
          {filtered ? 'Clear filters' : 'Add employee'}
        </Button>
      </TableCell>
    </TableRow>
  );
}

function ErrorRow() {
  return (
    <TableRow>
      <TableCell colSpan={COLUMNS} className="p-3">
        <Alert variant="destructive">
          <TriangleAlert aria-hidden="true" />
          <AlertTitle>Could not load employees</AlertTitle>
          <AlertDescription>
            <p>The server did not answer. Your filters are kept.</p>
            <Button type="button" variant="outline" size="sm" className="mt-2">
              <RotateCw aria-hidden="true" />
              Try again
            </Button>
          </AlertDescription>
        </Alert>
      </TableCell>
    </TableRow>
  );
}

function Body({ state }: { state: TableState }) {
  switch (state) {
    case 'loading':
      return <LoadingRows />;
    case 'empty-new':
      return <EmptyRow filtered={false} />;
    case 'empty-filtered':
      return <EmptyRow filtered />;
    case 'error':
      return <ErrorRow />;
    default:
      return <DataRows />;
  }
}

/** Data table pattern: every state renders something; the table never goes blank. */
export function TableStatesDemo() {
  const [state, setState] = useState<TableState>('ready');
  const busy = state === 'loading' || state === 'refetching';

  return (
    <div className="grid grid-cols-1 gap-3">
      <fieldset className="flex min-w-0 flex-wrap items-center gap-2">
        <legend className="mb-1 text-sm font-medium">Show the table as</legend>
        {STATE_BUTTONS.map(({ key, label }) => (
          <Button
            key={key}
            type="button"
            size="sm"
            variant={key === state ? 'default' : 'outline'}
            aria-pressed={key === state}
            onClick={() => setState(key)}
          >
            {label}
          </Button>
        ))}
      </fieldset>

      <p role="status" className="text-sm text-muted-foreground">
        {STATE_MESSAGE[state]}
      </p>

      <div aria-busy={busy} className="relative min-w-0 rounded-md border">
        {state === 'refetching' ? (
          <div
            aria-hidden="true"
            className="absolute inset-x-0 top-0 z-10 h-0.5 animate-pulse bg-primary"
          />
        ) : null}
        <div className={state === 'refetching' ? 'opacity-60' : undefined}>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Employee</TableHead>
                <TableHead>Department</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <Body state={state} />
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
