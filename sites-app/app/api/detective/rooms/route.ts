import { createRoom } from "../../../../lib/game";

export async function POST() {
  return Response.json(createRoom(), { status: 201 });
}
