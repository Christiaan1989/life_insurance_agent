import { NextRequest, NextResponse } from "next/server";

// Whisper transcription via OpenAI — server-side to keep API key secret
export async function POST(req: NextRequest) {
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "OPENAI_API_KEY not configured" }, { status: 500 });
    }

    const contentType = req.headers.get("content-type") || "";
    if (!contentType.includes("multipart/form-data")) {
      return NextResponse.json({ error: "Expected multipart/form-data" }, { status: 400 });
    }

    const form = await req.formData();
    const file = form.get("file");
    if (!file || !(file instanceof Blob)) {
      return NextResponse.json({ error: "Missing 'file'" }, { status: 400 });
    }

    const outForm = new FormData();
    // Prefer the latest Whisper model name if available, fallback to whisper-1
    outForm.set("model", process.env.WHISPER_MODEL ?? "whisper-1");
    outForm.set("response_format", "json");
    outForm.set("temperature", "0");
    outForm.set("file", file, file instanceof File ? file.name : "audio.webm");

    const resp = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      body: outForm,
    });

    if (!resp.ok) {
      const text = await resp.text();
      return NextResponse.json({ error: text || `OpenAI error (${resp.status})` }, { status: 502 });
    }

    const data = await resp.json();
    // OpenAI returns { text: "..." }
    return NextResponse.json({ text: data?.text ?? "" });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unexpected error" }, { status: 500 });
  }
}
