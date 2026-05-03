import { NextRequest, NextResponse } from "next/server";

async function createRealtimeTranscriptionCall(sdp: string) {
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
    type: "transcription",
    audio: {
      input: {
        noise_reduction: {
          type: "near_field",
        },
        transcription: {
          model:
            process.env.OPENAI_REALTIME_TRANSCRIBE_MODEL ??
            "gpt-4o-transcribe",
          language: process.env.OPENAI_REALTIME_TRANSCRIBE_LANGUAGE ?? "en",
          prompt:
            "Sentinel life insurance claims conversation. Common words: death claim, disability claim, critical illness, policyholder, beneficiary, ID number, claim outcome.",
        },
        turn_detection: {
          type: "server_vad",
          threshold: 0.5,
          prefix_padding_ms: 300,
          silence_duration_ms: 650,
        },
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

    const result = await createRealtimeTranscriptionCall(sdp);
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
