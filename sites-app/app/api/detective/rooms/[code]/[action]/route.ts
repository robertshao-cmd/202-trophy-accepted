import { answerRoom, roomAction } from "../../../../../../lib/game";

export async function POST(request: Request, context: { params: Promise<{ code: string; action: string }> }) {
  try {
    const { code, action } = await context.params;
    const body = await request.json() as Record<string, string>;
    if (action === "answer") return Response.json(answerRoom(code, body));
    const result = roomAction(code, action, body);
    return Response.json(result.body, { status: result.status });
  } catch (error) {
    const failure = error as Error & { status?: number };
    return Response.json({ error: failure.message }, { status: failure.status ?? 500 });
  }
}
