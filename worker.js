const API_PREFIX = "/api/broadcast";

function buildCorsHeaders(origin = "*") {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
  };
}

function withCors(response, origin = "*") {
  const headers = new Headers(response.headers);
  const corsHeaders = buildCorsHeaders(origin);
  Object.entries(corsHeaders).forEach(([key, value]) => headers.set(key, value));
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

async function handleApiProxy(request, env) {
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: buildCorsHeaders(request.headers.get("Origin") || "*"),
    });
  }

  const origin =
    String(env.TRIBE_SYNC_ORIGIN || env.ORACLE_ORIGIN || "").trim() ||
    "http://168.110.57.124.sslip.io";
  const requestUrl = new URL(request.url);
  const upstreamUrl = new URL(origin);
  upstreamUrl.pathname = requestUrl.pathname;
  upstreamUrl.search = requestUrl.search;

  const upstreamResponse = await fetch(upstreamUrl.toString(), {
    method: request.method,
    headers: request.headers,
    body: request.method === "GET" || request.method === "HEAD" ? undefined : request.body,
    redirect: "follow",
  });

  return withCors(upstreamResponse, request.headers.get("Origin") || "*");
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname.startsWith(API_PREFIX)) {
      return handleApiProxy(request, env);
    }

    return env.ASSETS.fetch(request);
  },
};
