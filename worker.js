export default {
  async fetch(request) {
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: corsHeaders()
      });
    }
    if (request.method !== "GET") {
      return json({ error: "GET only" }, 405);
    }

    const url = new URL(request.url);
    const domain = url.searchParams.get("domain");
    const token  = url.searchParams.get("token");
    if (!domain) return json({ error: "Missing domain" }, 400);
    if (!token)  return json({ error: "Missing token" }, 400);

    const passthru = ["size", "format", "theme", "greyscale", "fallback"];
    const upstream = new URL(`https://img.logo.dev/${domain}`);
    upstream.searchParams.set("token", token);
    for (const k of passthru) {
      if (url.searchParams.has(k)) upstream.searchParams.set(k, url.searchParams.get(k));
    }

    const res = await fetch(upstream.toString(), { cf: { cacheTtl: 86400, cacheEverything: true }});
    if (!res.ok) {
      return json({ error: "Upstream error", status: res.status }, 502);
    }

    const buf = await res.arrayBuffer();
    const b64 = toBase64(buf); // chunked, avoids call-stack limits

    return json(
      {
        img_base64: b64,
        mime: pickMime(url.searchParams.get("format")),
        bytes: buf.byteLength
      },
      200
    );
  }
}

function toBase64(buf) {
  // Convert ArrayBuffer -> base64 safely (chunks prevent stack overflow)
  const bytes = new Uint8Array(buf);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin);
}

function pickMime(fmt) {
  const f = (fmt || "jpg").toLowerCase();
  if (f === "png") return "image/png";
  if (f === "webp") return "image/webp";
  return "image/jpeg";
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Cache-Control": "public, max-age=86400",
    "Content-Type": "application/json; charset=utf-8",
    "X-Content-Type-Options": "nosniff",
    "Cache-Tag": "logo-b64",
    "Vary": "Origin",
    // Prevent intermediaries from transforming the payload
    "Cache-Control": "public, max-age=86400, no-transform"
  };
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: corsHeaders()
  });
}
