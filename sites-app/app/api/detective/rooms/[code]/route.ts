import { roomGet } from "../../../../../lib/game";

export async function GET(request: Request, context: { params: Promise<{ code: string }> }) {
  try {
    const { code } = await context.params;
    const url = new URL(request.url);
    return Response.json(await roomGet(code, { playerKey: url.searchParams.get("player"), hostKey: url.searchParams.get("host") }), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    const failure = error as Error & { status?: number };
    return Response.json({ error: failure.message }, { status: failure.status ?? 500 });
  }
}
