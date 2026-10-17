// Same JSON shape as the API (apps/api/src/common/logging/log.ts) so both
// services read alike in Cloud Logging. Server-side only.
export type Severity = 'DEBUG' | 'INFO' | 'WARNING' | 'ERROR';

export const REPORTED_ERROR_TYPE =
  'type.googleapis.com/google.devtools.clouderrorreporting.v1beta1.ReportedErrorEvent';

export function writeLog(severity: Severity, message: string, fields: Record<string, unknown> = {}): void {
  let line: string;
  try {
    line = JSON.stringify({ severity, message, time: new Date().toISOString(), ...fields });
  } catch {
    line = JSON.stringify({ severity, message, time: new Date().toISOString() });
  }
  if (severity === 'ERROR') console.error(line);
  else console.log(line);
}
