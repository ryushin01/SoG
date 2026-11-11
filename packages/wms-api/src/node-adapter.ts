import type { IncomingMessage, ServerResponse } from 'node:http';

/** Node의 req/res와 표준 Request/Response 사이를 잇습니다. */
export async function toRequest(req: IncomingMessage, origin: string): Promise<Request> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (typeof value === 'string') headers.set(key, value);
    else if (Array.isArray(value)) headers.set(key, value.join(', '));
  }
  const method = req.method ?? 'GET';
  return new Request(new URL(req.url ?? '/', origin), {
    method,
    headers,
    body:
      method === 'GET' || method === 'HEAD' || chunks.length === 0
        ? undefined
        : Buffer.concat(chunks),
  });
}

export async function sendResponse(res: ServerResponse, response: Response): Promise<void> {
  res.statusCode = response.status;
  response.headers.forEach((value, key) => res.setHeader(key, value));
  res.end(response.status === 204 ? undefined : Buffer.from(await response.arrayBuffer()));
}
