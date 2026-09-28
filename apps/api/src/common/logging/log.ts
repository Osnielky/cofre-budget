import { currentRequestContext } from './request-context';

export type Severity = 'DEBUG' | 'INFO' | 'WARNING' | 'ERROR';

export const REPORTED_ERROR_TYPE =
  'type.googleapis.com/google.devtools.clouderrorreporting.v1beta1.ReportedErrorEvent';

type Sink = (line: string, severity: Severity) => void;

const defaultSink: Sink = (line, severity) =>
  (severity === 'ERROR' ? process.stderr : process.stdout).write(line + '\n');
let sink: Sink = defaultSink;

/** Tests capture output here; null restores stdout/stderr. */
export function setLogSink(next: Sink | null): void {
  sink = next ?? defaultSink;
}

const pretty = () => process.env.NODE_ENV !== 'production' && sink === defaultSink;

/**
 * One JSON object per line — the shape Cloud Logging parses into severity,
 * message, trace link and jsonPayload fields. Never throws.
 */
export function log(severity: Severity, message: string, fields: Record<string, unknown> = {}): void {
  const entry: Record<string, unknown> = { severity, message, time: new Date().toISOString(), ...fields };
  const ctx = currentRequestContext();
  if (ctx) {
    entry.requestId = ctx.requestId;
    if (ctx.userId) entry.userId = ctx.userId;
    if (ctx.trace) entry['logging.googleapis.com/trace'] = ctx.trace;
  }
  let line: string;
  try {
    line = pretty() ? prettyLine(entry) : JSON.stringify(entry);
  } catch {
    line = JSON.stringify({ severity, message, time: entry.time, note: 'fields not serialisable' });
  }
  try {
    sink(line, severity);
  } catch {
    // Logging must never take a request down.
  }
}

function prettyLine(entry: Record<string, unknown>): string {
  const { severity, message, time, context, ...rest } = entry;
  const extra = Object.keys(rest).length ? ' ' + JSON.stringify(rest) : '';
  return `${String(time).slice(11, 23)} ${severity}${context ? ` [${context}]` : ''} ${message}${extra}`;
}

/** Fields that make GCP Error Reporting pick the entry up and group it. */
export function errorFields(err: unknown): Record<string, unknown> {
  const fields: Record<string, unknown> = { '@type': REPORTED_ERROR_TYPE };
  if (err instanceof Error && err.stack) fields.stack_trace = err.stack;
  else if (typeof err === 'string' && err.includes('\n')) fields.stack_trace = err;
  return fields;
}

export function describeError(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}
