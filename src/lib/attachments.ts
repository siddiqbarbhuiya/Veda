/** A text file that the student attached to a message. */
export type Attachment = { name: string; text: string };

export const MAX_ATTACHMENTS = 5;
/** Each file may hold this many characters. */
export const MAX_ATTACHMENT_CHARS = 40_000;
/** All attached files together may hold this many characters. */
export const MAX_ATTACHMENT_TOTAL_CHARS = 100_000;

export type ReadResult = { ok: true; attachment: Attachment } | { ok: false; error: string };

/** Read one file as text. Binary files (images, PDF, archives) and large files are refused with a reason. */
export async function readAttachment(file: Pick<File, "name" | "size" | "text">): Promise<ReadResult> {
  // A text file of 40,000 characters is at most about 160 KB in UTF-8. Refuse far larger files before reading.
  if (file.size > MAX_ATTACHMENT_CHARS * 4) {
    return { ok: false, error: `${file.name} is too large. Attach files under ${MAX_ATTACHMENT_CHARS / 1000} thousand characters.` };
  }
  let text: string;
  try {
    text = await file.text();
  } catch {
    return { ok: false, error: `Could not read ${file.name}.` };
  }
  if (text.includes("\u0000") || text.includes("�")) {
    return { ok: false, error: `${file.name} is not a text file. Only text and code files can be attached.` };
  }
  if (text.length > MAX_ATTACHMENT_CHARS) {
    return { ok: false, error: `${file.name} is too large. Attach files under ${MAX_ATTACHMENT_CHARS / 1000} thousand characters.` };
  }
  return { ok: true, attachment: { name: file.name, text } };
}

/** Add files to the current list. Returns the new list and the first problem, if any. */
export async function addAttachments(
  current: Attachment[],
  files: Pick<File, "name" | "size" | "text">[]
): Promise<{ list: Attachment[]; error: string | null }> {
  const list = [...current];
  let error: string | null = null;
  for (const file of files) {
    if (list.length >= MAX_ATTACHMENTS) {
      error ??= `You can attach up to ${MAX_ATTACHMENTS} files.`;
      break;
    }
    if (list.some((a) => a.name === file.name)) {
      error ??= `${file.name} is already attached.`;
      continue;
    }
    const r = await readAttachment(file);
    if (!r.ok) {
      error ??= r.error;
      continue;
    }
    const total = list.reduce((n, a) => n + a.text.length, 0) + r.attachment.text.length;
    if (total > MAX_ATTACHMENT_TOTAL_CHARS) {
      error ??= "The attached files are too large together.";
      continue;
    }
    list.push(r.attachment);
  }
  return { list, error };
}

/** The message text with every attached file added as a fenced block. A fence inside a file is lengthened. */
export function withAttachments(text: string, attachments: Attachment[]): string {
  if (attachments.length === 0) return text;
  const blocks = attachments.map((a) => {
    const longest = Math.max(2, ...(a.text.match(/`+/g) ?? []).map((m) => m.length));
    const fence = "`".repeat(longest + 1);
    return `Attached file "${a.name}":\n${fence}\n${a.text}\n${fence}`;
  });
  return `${text}\n\n${blocks.join("\n\n")}`;
}
