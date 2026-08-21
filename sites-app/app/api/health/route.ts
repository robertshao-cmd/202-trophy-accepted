export async function GET() {
  return Response.json({ ok: true, service: "invoice-detective", storage: "edge-demo-memory" });
}
