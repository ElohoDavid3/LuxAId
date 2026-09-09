import { AppError } from './errors';

/**
 * Read and parse a JSON request body, mapping malformed JSON to a
 * VALIDATION_ERROR (HTTP 400) instead of letting the SyntaxError bubble up
 * as an unhandled 500.
 */
export async function readJsonBody(req: Request): Promise<Record<string, unknown>> {
  try {
    return (await req.json()) as Record<string, unknown>;
  } catch {
    throw new AppError('VALIDATION_ERROR', 'Request body must be valid JSON.');
  }
}