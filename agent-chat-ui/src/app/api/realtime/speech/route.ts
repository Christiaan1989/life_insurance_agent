import { NextRequest, NextResponse } from "next/server";

const REALTIME_SPEECH_INSTRUCTIONS = [
  "You are Sentinel's realtime voice renderer.",
  "Your only job is to speak the exact text the application provides.",
  "Do not answer the user, ask follow-up questions, add claims advice, summarize, or change wording.",
  "Use a calm, clear, professional insurance-assistant voice.",
].join(" ");

async function createRealtimeCall(sdp: string) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return {
      error: NextResponse.json(
        { error: "OPENAI_API_KEY not configured" },
        { status: 500 },
      ),
    };
  }

  const session = {
    type: "realtime",
    model: process.env.OPENAI_REALTIME_MODEL ?? "gpt-realtime",
    instructions: REALTIME_SPEECH_INSTRUCTIONS,
    output_modalities: ["audio"],
    audio: {
      output: {
        voice: process.env.OPENAI_REALTIME_VOICE ?? "marin",
      },
    },
  };

  const form = new FormData();
  form.set("sdp", sdp);
  form.set("session", JSON.stringify(session));

  const response = await fetch("https://api.openai.com/v1/realtime/calls", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    body: form,
  });

  const answer = await response.text();
  if (!response.ok) {
    return {
      error: NextResponse.json(
        { error: answer || `OpenAI Realtime error (${response.status})` },
        { status: 502 },
      ),
    };
  }

  return { answer };
}

export async function POST(req: NextRequest) {
  try {
    const sdp = await req.text();
    if (!sdp.trim()) {
      return NextResponse.json({ error: "Missing SDP offer" }, { status: 400 });
    }

    const result = await createRealtimeCall(sdp);
    if (result.error) return result.error;

    return new NextResponse(result.answer, {
      status: 201,
      headers: {
        "Content-Type": "application/sdp",
        "Cache-Control": "no-cache",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
