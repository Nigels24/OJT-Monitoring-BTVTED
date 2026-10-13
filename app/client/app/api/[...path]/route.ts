import type { NextRequest } from "next/server";

/**
 * The same-origin door to the API: `/api/<anything>` on the website is passed
 * on to the NestJS server, and its answer is passed back.
 *
 * This is what lets the system run on one computer on the school network
 * (CLAUDE.md §20). A browser on a phone or laptop only ever talks to the
 * website's own address — `http://<host-ip>:3001` — so no address is written
 * into the built pages, and nothing has to be rebuilt when the host
 * computer's IP changes. The API itself is reached from *this* computer, at
 * `API_INTERNAL_URL` (default `http://127.0.0.1:3000`).
 *
 * A route handler rather than a `rewrites()` entry in `next.config.ts` on
 * purpose: rewrites are worked out by `next build` and frozen into the build,
 * while this reads `API_INTERNAL_URL` each time the server starts.
 *
 * It adds nothing and decides nothing — authentication and authorization are
 * the API's (the `Authorization` header is forwarded untouched). Bodies are
 * streamed both ways, so a multipart upload or a file download is never held
 * in memory here; `proxy.ts` leaves `/api` alone for the same reason.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function apiBase(): string {
  return (process.env.API_INTERNAL_URL || "http://127.0.0.1:3000").replace(
    /\/+$/,
    "",
  );
}

/**
 * Headers that describe one hop's connection, not the message — they must
 * not be copied across. `host` is replaced by fetch with the API's own, and
 * `content-length`/`content-encoding` no longer describe a body that is being
 * re-streamed (and, for a response, was already decompressed by fetch).
 */
const HOP_BY_HOP = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
  "host",
  "content-length",
  // `Expect: 100-continue` is a conversation with this server, already had.
  "expect",
]);

function forwardHeaders(source: Headers, extraSkip: string[] = []): Headers {
  const headers = new Headers();
  source.forEach((value, key) => {
    const name = key.toLowerCase();
    if (HOP_BY_HOP.has(name) || extraSkip.includes(name)) return;
    headers.append(key, value);
  });
  return headers;
}

async function forward(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
): Promise<Response> {
  const { path } = await context.params;
  const target = `${apiBase()}/${path.map(encodeURIComponent).join("/")}${request.nextUrl.search}`;

  const headers = forwardHeaders(request.headers);
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) headers.set("x-forwarded-for", forwardedFor);
  headers.set("x-forwarded-host", request.headers.get("host") ?? "");

  const hasBody = request.method !== "GET" && request.method !== "HEAD";

  let upstream: Response;
  try {
    upstream = await fetch(target, {
      method: request.method,
      headers,
      body: hasBody ? request.body : undefined,
      // Required by Node's fetch to send a streamed request body.
      ...(hasBody ? { duplex: "half" } : {}),
      redirect: "manual",
      cache: "no-store",
      signal: request.signal,
    } as RequestInit);
  } catch (err) {
    // The API is not running, or API_INTERNAL_URL points at the wrong place.
    // Logged for whoever looks after the host computer; the path only, never
    // the request's contents.
    const cause = (err as { cause?: { code?: string; message?: string } })
      ?.cause;
    console.error(
      `[api] ${request.method} /${path.join("/")} could not reach ${apiBase()}: ${
        cause?.code ??
        cause?.message ??
        (err as Error)?.message ??
        "unknown error"
      }`,
    );
    return Response.json(
      {
        message:
          "The system's server is not responding. Please try again in a moment, or tell the coordinator.",
        code: "API_UNREACHABLE",
      },
      { status: 502 },
    );
  }

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: forwardHeaders(upstream.headers, ["content-encoding"]),
  });
}

export {
  forward as GET,
  forward as POST,
  forward as PUT,
  forward as PATCH,
  forward as DELETE,
  forward as HEAD,
  forward as OPTIONS,
};
