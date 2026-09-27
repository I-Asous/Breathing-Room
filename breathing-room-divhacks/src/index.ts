import { Spectrum, text } from "spectrum-ts";
import { imessage } from "@spectrum-ts/imessage";

// iMessage front door for the Breathing Room rental desk.
// Spectrum holds the iMessage connection; each text is sent to the atlas's
// POST /api/agent, and the desk's reply goes back into the chat.
// Docs: https://photon.codes/docs/spectrum-ts

const projectId = process.env.PROJECT_ID;
const projectSecret = process.env.PROJECT_SECRET;
// Where the atlas is running: the local preview, or the deployed app.
const atlas = (process.env.ATLAS_ORIGIN ?? "http://127.0.0.1:44731").replace(/\/$/, "");
// The map link the desk puts in its replies. Phones can't open 127.0.0.1, so
// point this at the deployed app when texting from a real phone.
const publicOrigin = (process.env.PUBLIC_ORIGIN ?? atlas).replace(/\/$/, "");

if (!projectId || !projectSecret) {
  console.error("Fill in PROJECT_ID and PROJECT_SECRET in .env (Photon dashboard → Settings).");
  process.exit(1);
}

type DeskReply = { text: string; neighborhoodId: string | null };

async function ask(body: string, priorId: string | null): Promise<DeskReply> {
  const response = await fetch(`${atlas}/api/agent`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: body, priorId, origin: publicOrigin }),
  });
  if (!response.ok) throw new Error(`desk answered ${response.status}`);
  const payload = (await response.json()) as { text?: unknown; neighborhoodId?: unknown };
  return {
    text: typeof payload.text === "string" ? payload.text : "The desk had nothing to add.",
    neighborhoodId: typeof payload.neighborhoodId === "string" ? payload.neighborhoodId : null,
  };
}

const app = await Spectrum({
  projectId,
  projectSecret,
  providers: [imessage.config()],
});

console.log(`iMessage desk is listening. Replies come from ${atlas}/api/agent`);

// The neighborhood each person last asked about, so "what about the toll?"
// stays on it. Held in memory: it resets when this process restarts.
const lastNeighborhood = new Map<string, string>();
const seen = new Set<string>();

for await (const [space, message] of app.messages) {
  if (!message?.id || seen.has(message.id)) continue;
  seen.add(message.id);
  const sender = message.sender?.id ?? space.id;
  try {
    await space.responding(async () => {
      const inbound = message.content.type === "text" ? message.content.text : "";
      if (!inbound.trim()) {
        await space.send(text("Text a neighborhood name, like East Harlem or Astoria."));
        return;
      }
      try {
        const reply = await ask(inbound, lastNeighborhood.get(sender) ?? null);
        if (reply.neighborhoodId) lastNeighborhood.set(sender, reply.neighborhoodId);
        await space.send(text(reply.text));
      } catch (error) {
        console.error("desk unreachable", error);
        await space.send(text("The desk is offline right now. Try again in a minute."));
      }
    });
  } catch (error) {
    console.error("reply failed", error);
  }
}
