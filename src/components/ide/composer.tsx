"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { ArrowUp, Clock, FileText, Mic, Plus, Square, SquareSlash, X } from "lucide-react";
import { appendSpoken, useSpeech } from "@/hooks/use-speech";
import { cn } from "@/lib/cn";
import type { Attachment } from "@/lib/attachments";
import { ContextRing } from "./context-ring";
import { MenuPopover, type MenuItem } from "./menu-popover";

/** An action in the `/` menu. Typing `/<id>` and pressing Enter runs it too. */
export type SlashCommand = {
  id: string;
  label: string;
  description?: string;
  icon?: ReactNode;
  disabled?: boolean;
  run: () => void;
};

const iconButton =
  "flex size-6 shrink-0 items-center justify-center rounded text-fg-3 transition-colors hover:bg-fg/[0.07] hover:text-fg " +
  "focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-45";

/**
 * The message box of both AI tabs, laid out like the Claude Code box in VS Code:
 * attached files on top, a one-line input that grows, and a thin footer with
 * `+` (attach), `/` (commands), the context ring, a timer, the model, the mode, and an icon-only send button.
 *
 * The menus and the model list open against the nearest positioned ancestor, so put the composer inside the
 * sticky box at the bottom of the panel.
 */
export function Composer({
  value,
  onChange,
  onSubmit,
  placeholder,
  ariaLabel,
  textareaRef,
  running,
  onStop,
  canSend,
  sendTitle = "Send",
  attachments,
  onAttach,
  onRemoveAttachment,
  attachError,
  commands,
  context,
  time,
  model,
  mode,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  placeholder: string;
  ariaLabel: string;
  textareaRef?: RefObject<HTMLTextAreaElement | null>;
  running: boolean;
  onStop: () => void;
  canSend: boolean;
  sendTitle?: string;
  attachments: Attachment[];
  onAttach: (files: File[]) => void;
  onRemoveAttachment: (index: number) => void;
  attachError?: string | null;
  commands: SlashCommand[];
  context: { used: number; limit: number } | null;
  /** Elapsed or last run time, like "0:12". */
  time: string | null;
  model: ReactNode;
  mode?: ReactNode;
}) {
  const ownRef = useRef<HTMLTextAreaElement>(null);
  const taRef = textareaRef ?? ownRef;
  const fileRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const slashButtonRef = useRef<HTMLButtonElement>(null);
  const [slashOpen, setSlashOpen] = useState(false);
  // Dictated text goes to the end of what is typed. `value` is read through a ref so a long dictation keeps all of it.
  const valueRef = useRef(value);
  useEffect(() => {
    valueRef.current = value;
  });
  const speech = useSpeech((spoken) => {
    const next = appendSpoken(valueRef.current, spoken);
    valueRef.current = next;
    onChange(next);
  });

  // Grow with the text, up to about 7 lines.
  useLayoutEffect(() => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [value, taRef]);

  const typed = value.trim().startsWith("/") ? commands.find((c) => value.trim() === `/${c.id}`) : undefined;

  const items: MenuItem[] = commands.map((c) => ({
    id: c.id,
    label: c.label,
    description: c.description,
    icon: c.icon,
    disabled: c.disabled,
    onSelect: c.run,
  }));

  const closeSlash = () => {
    setSlashOpen(false);
    slashButtonRef.current?.focus();
  };

  return (
    <div
      ref={rootRef}
      className="@container rounded-xl border border-control bg-sunken transition-colors focus-within:border-accent"
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes("Files")) e.preventDefault();
      }}
      onDrop={(e) => {
        if (e.dataTransfer.files.length > 0) {
          e.preventDefault();
          onAttach(Array.from(e.dataTransfer.files));
        }
      }}
    >
      {attachments.length > 0 ? (
        <ul aria-label="Attached files" className="flex flex-wrap gap-1.5 border-b border-line px-2 py-1.5">
          {attachments.map((a, i) => (
            <li key={a.name} className="flex max-w-full items-center gap-1 rounded-md bg-fg/[0.08] py-0.5 pl-1.5 pr-0.5 text-caption text-fg">
              <FileText size={12} aria-hidden="true" className="shrink-0 text-fg-3" />
              <span className="min-w-0 truncate" title={a.name}>
                {a.name}
              </span>
              <button
                type="button"
                aria-label={`Remove ${a.name}`}
                onClick={() => onRemoveAttachment(i)}
                className="flex size-4 shrink-0 items-center justify-center rounded text-fg-3 hover:bg-fg/[0.12] hover:text-fg focus-visible:outline-2 focus-visible:outline-ring"
              >
                <X size={12} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {attachError ? (
        <p role="alert" className="border-b border-line px-3 py-1 text-caption text-danger">
          {attachError}
        </p>
      ) : null}

      <div className="relative">
      <textarea
        ref={taRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            // IME: Enter confirms the composed Indic character, not the message.
            // This check must run BEFORE preventDefault, or the composition is cancelled.
            // keyCode 229 covers Safari, which sends Enter after compositionend.
            if (e.nativeEvent.isComposing || e.keyCode === 229) return;
            e.preventDefault();
            if (typed) {
              if (!typed.disabled) {
                onChange("");
                typed.run();
              }
              return;
            }
            onSubmit();
          }
        }}
        rows={1}
        placeholder={placeholder}
        title="Enter to send. Shift+Enter for a new line. Type / for commands."
        aria-label={ariaLabel}
        className={cn(
          "block max-h-40 min-h-9 w-full resize-none bg-transparent py-2 pl-3 text-ui leading-snug text-fg outline-none placeholder:text-fg-3",
          speech.supported ? "pr-9" : "pr-3",
        )}
      />
      {speech.supported ? (
        <button
          type="button"
          aria-label={speech.listening ? "Stop dictation" : "Dictate with the microphone"}
          title={speech.listening ? "Stop dictation" : "Dictate with the microphone"}
          aria-pressed={speech.listening}
          onClick={speech.toggle}
          className={cn(
            iconButton,
            "absolute right-1.5 top-1.5",
            speech.listening ? "bg-danger-subtle text-danger hover:bg-danger-subtle hover:text-danger" : "",
          )}
        >
          <Mic size={16} aria-hidden="true" className={speech.listening ? "animate-dot-pulse" : ""} />
        </button>
      ) : null}
      </div>
      {speech.error ? (
        <p role="alert" className="border-t border-line px-3 py-1 text-caption text-danger">
          {speech.error}
        </p>
      ) : null}

      <div className="flex items-center gap-0.5 border-t border-line px-1 py-1">
        <button type="button" aria-label="Attach files" title="Attach text or code files" onClick={() => fileRef.current?.click()} className={iconButton}>
          <Plus size={16} aria-hidden="true" />
        </button>
        <input
          ref={fileRef}
          type="file"
          multiple
          hidden
          aria-hidden="true"
          tabIndex={-1}
          accept="text/*,.md,.js,.jsx,.ts,.tsx,.json,.css,.html,.py,.java,.c,.cpp,.h,.go,.rs,.sh,.yml,.yaml,.toml,.sql,.csv,.xml,.env,.txt"
          onChange={(e) => {
            const picked = Array.from(e.target.files ?? []);
            e.target.value = ""; // the same file can be picked again later
            if (picked.length > 0) onAttach(picked);
          }}
        />
        <button
          ref={slashButtonRef}
          type="button"
          aria-label="Commands"
          title="Commands (/)"
          aria-haspopup="menu"
          aria-expanded={slashOpen}
          onClick={() => setSlashOpen((o) => !o)}
          className={iconButton}
        >
          <SquareSlash size={16} aria-hidden="true" />
        </button>
        {context ? <ContextRing used={context.used} limit={context.limit} /> : null}
        {time ? (
          <span className="hidden items-center gap-1 px-1 text-caption text-fg-3 tnum @[290px]:flex" title="Time of the current or last reply">
            <Clock size={12} aria-hidden="true" />
            {time}
          </span>
        ) : null}
        <div className="min-w-0 flex-1 pl-0.5">{model}</div>
        {mode}
        {running ? (
          <button
            type="button"
            aria-label="Stop"
            title="Stop"
            onClick={onStop}
            className="ml-0.5 flex size-7 shrink-0 items-center justify-center rounded-md bg-danger text-app transition-colors hover:brightness-110 focus-visible:outline-2 focus-visible:outline-ring"
          >
            <Square size={12} fill="currentColor" aria-hidden="true" />
          </button>
        ) : (
          <button
            type="button"
            aria-label="Send"
            title={sendTitle}
            onClick={onSubmit}
            disabled={!canSend}
            className="ml-0.5 flex size-7 shrink-0 items-center justify-center rounded-md bg-accent text-accent-fg transition-colors hover:bg-accent-hover active:bg-accent-active focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-45"
          >
            <ArrowUp size={16} aria-hidden="true" />
          </button>
        )}
      </div>

      {slashOpen ? <MenuPopover label="Commands" items={items} rootRef={rootRef} onClose={closeSlash} /> : null}
    </div>
  );
}
