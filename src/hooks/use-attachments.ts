"use client";

import { useCallback, useRef, useState } from "react";
import { addAttachments, type Attachment } from "@/lib/attachments";

/** The text files attached to the message that is being written. */
export function useAttachments() {
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [error, setError] = useState<string | null>(null);
  // Files are read one after the other, so a second pick sees the files of the first.
  const latest = useRef<Attachment[]>([]);

  const add = useCallback(async (files: File[]) => {
    const { list, error: problem } = await addAttachments(latest.current, files);
    latest.current = list;
    setAttachments(list);
    setError(problem);
  }, []);

  const remove = useCallback((index: number) => {
    latest.current = latest.current.filter((_, i) => i !== index);
    setAttachments(latest.current);
    setError(null);
  }, []);

  const clear = useCallback(() => {
    latest.current = [];
    setAttachments([]);
    setError(null);
  }, []);

  return { attachments, error, add, remove, clear };
}
