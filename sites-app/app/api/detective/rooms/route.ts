import { createRoom } from "../../../../lib/game";

export async function POST() {
  return Response.json(await createRoom(), { status: 201 });
}
