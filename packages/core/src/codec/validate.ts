import type { z } from 'zod';
import { BhaiyaPleaseError } from '../types';

/** Parse or throw INVALID_INPUT naming the field. */
export function parseOrThrow<S extends z.ZodType>(schema: S, value: unknown, what: string): z.output<S> {
  const r = schema.safeParse(value);
  if (!r.success) {
    const issue = r.error.issues[0];
    const path = issue && issue.path.length > 0 ? `.${issue.path.join('.')}` : '';
    throw new BhaiyaPleaseError('INVALID_INPUT', `${what}${path}: ${issue?.message ?? 'invalid'}`);
  }
  return r.data;
}
