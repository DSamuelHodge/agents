import { ErrorResponse, SuccessResponse } from './types';

const CORS_HEADERS: Record<string, string> = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
};

export function jsonSuccess<T>(data: T, metadata?: Record<string, unknown>): Response {
  const body: SuccessResponse<T> = { ok: true, data, metadata };
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: CORS_HEADERS
  });
}

export function jsonError(
  message: string,
  status: number = 500,
  details?: string,
  code?: string
): Response {
  const body: ErrorResponse = { ok: false, message, details, code };
  return new Response(JSON.stringify(body), {
    status,
    headers: CORS_HEADERS
  });
}

export function validateRequestSize(request: Request, maxBytes: number = 256 * 1024): string | null {
  const contentLength = request.headers.get('content-length');
  if (contentLength && parseInt(contentLength) > maxBytes) {
    return `Request body exceeds ${maxBytes} bytes limit`;
  }
  return null;
}

export function summarizeIfNeeded(text: string, maxChars: number = 8000): string {
  if (text.length <= maxChars) {
    return text;
  }
  const summary = text.substring(0, maxChars);
  return `${summary}... [Truncated from ${text.length} chars. Original length exceeded ${maxChars} char limit.]`;
}

export function preflightResponse(): Response {
  return new Response(null, {
    status: 204,
    headers: CORS_HEADERS,
  });
}
