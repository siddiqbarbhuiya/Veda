"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Rec = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
};
type RecCtor = new () => Rec;

function ctor(): RecCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: RecCtor; webkitSpeechRecognition?: RecCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

const MESSAGES: Record<string, string> = {
  "not-allowed": "Microphone access is blocked. Allow the microphone in the browser address bar.",
  "service-not-allowed": "Microphone access is blocked. Allow the microphone in the browser address bar.",
  "no-speech": "No speech heard. Try again.",
  "audio-capture": "No microphone found.",
  network: "Speech recognition needs an internet connection.",
};

/**
 * Speech to text with the browser's own recognizer. The final text of each phrase goes to `onText`.
 * `supported` is false in browsers without it (for example Firefox): the mic button is then hidden.
 * The language follows the page language, so Hindi, Bengali and Tamil work when the browser has them.
 */
export function useSpeech(onText: (text: string) => void) {
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recRef = useRef<Rec | null>(null);
  const cb = useRef(onText);
  useEffect(() => {
    cb.current = onText;
  });
  // Decided after mount, so the server render and the first client render agree.
  const [supported, setSupported] = useState(false);
  useEffect(() => {
    const id = setTimeout(() => setSupported(ctor() !== null), 0);
    return () => clearTimeout(id);
  }, []);

  const stop = useCallback(() => recRef.current?.stop(), []);

  const start = useCallback(() => {
    const C = ctor();
    if (!C || recRef.current) return;
    setError(null);
    const rec = new C();
    rec.lang = document.documentElement.lang || navigator.language || "en-IN";
    rec.continuous = true;
    rec.interimResults = false;
    rec.onresult = (e) => {
      let text = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) text += e.results[i][0].transcript;
      }
      if (text.trim()) cb.current(text.trim());
    };
    rec.onerror = (e) => setError(MESSAGES[e.error] ?? "Speech recognition stopped.");
    rec.onend = () => {
      recRef.current = null;
      setListening(false);
    };
    recRef.current = rec;
    try {
      rec.start();
      setListening(true);
    } catch {
      recRef.current = null;
      setError("Could not start the microphone.");
    }
  }, []);

  const toggle = useCallback(() => (recRef.current ? stop() : start()), [start, stop]);

  useEffect(() => () => recRef.current?.stop(), []);

  return { supported, listening, error, toggle };
}

/** Join dictated text to what is already typed with one space. */
export function appendSpoken(current: string, spoken: string): string {
  if (!current) return spoken;
  return /\s$/.test(current) ? current + spoken : `${current} ${spoken}`;
}
