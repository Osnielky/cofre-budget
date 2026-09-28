import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { CloudLogger } from './cloud-logger';
import { log, errorFields, setLogSink, REPORTED_ERROR_TYPE } from './log';
import { runWithRequestContext, setRequestUser } from './request-context';

let lines: Array<Record<string, any>> = [];
beforeEach(() => { lines = []; setLogSink((line) => lines.push(JSON.parse(line))); });
afterEach(() => setLogSink(null));

describe('log()', () => {
  it('writes severity, message and time', () => {
    log('INFO', 'hello', { a: 1 });
    expect(lines[0]).toMatchObject({ severity: 'INFO', message: 'hello', a: 1 });
    expect(typeof lines[0].time).toBe('string');
  });

  it('adds request id, trace and user inside a request context', () => {
    runWithRequestContext({ requestId: 'req-1', trace: 'projects/p/traces/t' }, () => {
      setRequestUser('user-1');
      log('INFO', 'inside');
    });
    expect(lines[0]).toMatchObject({ requestId: 'req-1', userId: 'user-1', 'logging.googleapis.com/trace': 'projects/p/traces/t' });
  });

  it('adds no context fields outside a request', () => {
    log('INFO', 'outside');
    expect(lines[0].requestId).toBeUndefined();
    expect(lines[0].userId).toBeUndefined();
  });

  it('never throws on an unserialisable field', () => {
    const circular: any = {}; circular.self = circular;
    expect(() => log('INFO', 'circular', { circular })).not.toThrow();
    expect(lines[0].message).toBe('circular');
  });
});

describe('errorFields()', () => {
  it('marks the entry for Error Reporting with the stack', () => {
    const f = errorFields(new Error('boom'));
    expect(f['@type']).toBe(REPORTED_ERROR_TYPE);
    expect(String(f.stack_trace)).toContain('Error: boom');
  });

  it('handles a thrown non-Error value', () => {
    expect(errorFields('just a string')['@type']).toBe(REPORTED_ERROR_TYPE);
  });
});

describe('CloudLogger', () => {
  const logger = new CloudLogger();

  it('maps Nest levels to Cloud Logging severities with the context name', () => {
    logger.log('a', 'PlaidService');
    logger.warn('b', 'PlaidService');
    logger.debug('c', 'PlaidService');
    expect(lines.map((l) => l.severity)).toEqual(['INFO', 'WARNING', 'DEBUG']);
    expect(lines[0].context).toBe('PlaidService');
  });

  it('logs error(message, stack, context) for Error Reporting', () => {
    const err = new Error('db down');
    logger.error('sync failed', err.stack, 'PlaidService');
    expect(lines[0]).toMatchObject({ severity: 'ERROR', message: 'sync failed', context: 'PlaidService', '@type': REPORTED_ERROR_TYPE });
    expect(lines[0].stack_trace).toContain('db down');
  });

  it('logs error(message, errorObject, context)', () => {
    logger.error('sync failed', new Error('inner'), 'PlaidService');
    expect(lines[0].stack_trace).toContain('inner');
  });

  it('logs an object message as JSON text', () => {
    logger.log({ event: 'x' }, 'Ctx');
    expect(lines[0].message).toBe('{"event":"x"}');
  });
});
