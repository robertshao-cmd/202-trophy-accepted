export async function GET() {
  let storage = "edge-demo-memory";
  try {
    const { env } = await import("cloudflare:workers");
    if ((env as { DB?: D1Database }).DB) storage = "cloudflare-d1-shared";
  } catch {
    // Direct Node tests do not provide Cloudflare runtime bindings.
  }
  return Response.json({ ok: true, service: "invoice-detective", storage });
}
