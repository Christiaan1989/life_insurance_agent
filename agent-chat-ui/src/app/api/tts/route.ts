import { NextRequest, NextResponse } from "next/server";

/**
 * Server-side TTS proxy — keeps the OpenAI API key secret.
 * Accepts { text, voice? } and streams back audio/mpeg from OpenAI TTS.
 */
export async function POST(req: NextRequest) {
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "OPENAI_API_KEY not configured" },
        { status: 500 },
      );
    }

    const { text, voice = "nova" } = await req.json();
    if (!text || typeof text !== "string") {
      return NextResponse.json(
        { error: "Missing 'text' field" },
        { status: 400 },
      );
    }

    const resp = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "tts-1",
        input: text,
        voice,
        response_format: "mp3",
      }),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      return NextResponse.json(
        { error: errText || `OpenAI TTS error (${resp.status})` },
        { status: 502 },
      );
    }

    const audioBuffer = await resp.arrayBuffer();
    return new NextResponse(audioBuffer, {
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "no-cache",
      },
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
