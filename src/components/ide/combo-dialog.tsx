"use client";

import { useId, useState } from "react";
import { ArrowDown, ArrowUp, Layers, Pencil, Plus, Trash2 } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/field";
import { KEY_PROVIDERS } from "@/lib/key-providers";
import { MAX_COMBO_ENTRIES, type Combo, type ComboEntry } from "@/lib/combos";
import { readActiveCombo, readCombos, writeActiveCombo, writeCombos } from "@/lib/combo-storage";
import type { ModelItem } from "@/hooks/use-model-catalog";
import { cn } from "@/lib/cn";

const newId = () => `combo-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

type Draft = { id: string; name: string; strategy: Combo["strategy"]; entries: ComboEntry[] };

function emptyDraft(): Draft {
  return { id: newId(), name: "", strategy: "priority", entries: [{ provider: "openrouter", model: "" }] };
}

/**
 * Create, edit, choose and delete combos. A combo is an ordered list of models.
 * When a model fails with a limit or a server error, the next one runs.
 */
export function ComboDialog({
  open,
  onClose,
  items,
}: {
  open: boolean;
  onClose: () => void;
  items: ModelItem[];
}) {
  const [combos, setCombos] = useState<Combo[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const listId = useId();

  // Read the saved state each time the dialog opens, so two tabs stay in step.
  // State is adjusted during render (React pattern), not in an effect.
  const [wasOpen, setWasOpen] = useState(false);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setCombos(readCombos());
      setActive(readActiveCombo());
      setDraft(null);
      setError(null);
    }
  }

  const persist = (next: Combo[]) => {
    setCombos(next);
    writeCombos(next);
  };

  const choose = (id: string | null) => {
    setActive(id);
    writeActiveCombo(id);
  };

  const remove = (id: string) => {
    persist(combos.filter((c) => c.id !== id));
    if (active === id) choose(null);
  };

  const save = () => {
    if (!draft) return;
    const name = draft.name.trim();
    const entries = draft.entries.map((e) => ({ provider: e.provider, model: e.model.trim() })).filter((e) => e.model);
    if (!name) return setError("Give the combo a name.");
    if (entries.length === 0) return setError("Add at least one model.");
    const combo: Combo = { id: draft.id, name, strategy: draft.strategy, entries };
    persist(combos.some((c) => c.id === combo.id) ? combos.map((c) => (c.id === combo.id ? combo : c)) : [...combos, combo]);
    setDraft(null);
    setError(null);
  };

  const setEntry = (i: number, patch: Partial<ComboEntry>) =>
    setDraft((d) => d && { ...d, entries: d.entries.map((e, j) => (j === i ? { ...e, ...patch } : e)) });

  const moveEntry = (i: number, by: -1 | 1) =>
    setDraft((d) => {
      if (!d) return d;
      const j = i + by;
      if (j < 0 || j >= d.entries.length) return d;
      const entries = d.entries.slice();
      [entries[i], entries[j]] = [entries[j], entries[i]];
      return { ...d, entries };
    });

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Model combos"
      description="A combo tries its models in order. If one hits a limit or goes down, the next one runs."
    >
      {draft ? (
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1.5 text-ui font-medium text-fg">
            Name
            <Input value={draft.name} maxLength={40} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Free first" />
          </label>
          <label className="flex flex-col gap-1.5 text-ui font-medium text-fg">
            Strategy
            <Select value={draft.strategy} onChange={(e) => setDraft({ ...draft, strategy: e.target.value as Combo["strategy"] })}>
              <option value="priority">Priority: always start with the first model</option>
              <option value="round_robin">Round robin: start with a different model each time</option>
            </Select>
          </label>
          <div className="flex flex-col gap-2">
            <p className="text-ui font-medium text-fg">Models, in order</p>
            {draft.entries.map((e, i) => (
              <div key={i} className="flex flex-wrap items-center gap-1.5">
                <span className="w-4 text-center text-caption text-fg-3 tnum">{i + 1}</span>
                <div className="w-32">
                  <Select aria-label={`Provider for model ${i + 1}`} value={e.provider} onChange={(ev) => setEntry(i, { provider: ev.target.value })}>
                    {KEY_PROVIDERS.map((p) => (
                      <option key={p.value} value={p.value}>
                        {p.label}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="min-w-40 flex-1">
                  <Input
                    aria-label={`Model id ${i + 1}`}
                    list={`${listId}-${e.provider}`}
                    value={e.model}
                    onChange={(ev) => setEntry(i, { model: ev.target.value })}
                    placeholder="model id"
                  />
                </div>
                <Button variant="ghost" size="icon-sm" aria-label="Move up" onClick={() => moveEntry(i, -1)} disabled={i === 0}>
                  <ArrowUp size={14} aria-hidden="true" />
                </Button>
                <Button variant="ghost" size="icon-sm" aria-label="Move down" onClick={() => moveEntry(i, 1)} disabled={i === draft.entries.length - 1}>
                  <ArrowDown size={14} aria-hidden="true" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Remove model"
                  onClick={() => setDraft({ ...draft, entries: draft.entries.filter((_, j) => j !== i) })}
                  disabled={draft.entries.length === 1}
                >
                  <Trash2 size={14} aria-hidden="true" />
                </Button>
              </div>
            ))}
            {KEY_PROVIDERS.map((p) => (
              <datalist key={p.value} id={`${listId}-${p.value}`}>
                {items
                  .filter((i) => i.provider === p.value)
                  .slice(0, 500)
                  .map((i) => (
                    <option key={i.key} value={i.model} label={i.label} />
                  ))}
              </datalist>
            ))}
            <Button
              variant="secondary"
              size="sm"
              className="self-start"
              leadingIcon={<Plus size={14} aria-hidden="true" />}
              disabled={draft.entries.length >= MAX_COMBO_ENTRIES}
              onClick={() => setDraft({ ...draft, entries: [...draft.entries, { provider: "openrouter", model: "" }] })}
            >
              Add model
            </Button>
          </div>
          {error ? (
            <p role="alert" className="text-ui text-danger">
              {error}
            </p>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setDraft(null)}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" onClick={save}>
              Save combo
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <ul role="radiogroup" aria-label="Model mode" className="flex flex-col gap-1.5">
            <li>
              <Row selected={active === null} onSelect={() => choose(null)} title="Single model" detail="Use the model chosen next to the message box." />
            </li>
            {combos.map((c) => (
              <li key={c.id}>
                <Row
                  selected={active === c.id}
                  onSelect={() => choose(c.id)}
                  title={c.name}
                  detail={`${c.strategy === "priority" ? "Priority" : "Round robin"}: ${c.entries.map((e) => e.model.split("/").pop()).join(" → ")}`}
                  actions={
                    <>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Edit ${c.name}`}
                        onClick={() => setDraft({ id: c.id, name: c.name, strategy: c.strategy, entries: c.entries.map((e) => ({ ...e })) })}
                      >
                        <Pencil size={14} aria-hidden="true" />
                      </Button>
                      <Button variant="ghost" size="icon-sm" aria-label={`Delete ${c.name}`} onClick={() => remove(c.id)}>
                        <Trash2 size={14} aria-hidden="true" />
                      </Button>
                    </>
                  }
                />
              </li>
            ))}
          </ul>
          <Button
            variant="secondary"
            size="sm"
            className="self-start"
            leadingIcon={<Plus size={14} aria-hidden="true" />}
            onClick={() => setDraft(emptyDraft())}
          >
            New combo
          </Button>
        </div>
      )}
    </Dialog>
  );
}

function Row({
  selected,
  onSelect,
  title,
  detail,
  actions,
}: {
  selected: boolean;
  onSelect: () => void;
  title: string;
  detail: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className={cn("flex items-center gap-2 rounded-md border px-3 py-2", selected ? "border-accent bg-accent-subtle" : "border-line-strong")}>
      <button
        type="button"
        role="radio"
        aria-checked={selected}
        onClick={onSelect}
        className="flex min-w-0 flex-1 items-start gap-2 text-left focus-visible:outline-2 focus-visible:outline-ring"
      >
        <Layers size={14} aria-hidden="true" className="mt-0.5 shrink-0 text-fg-3" />
        <span className="min-w-0">
          <span className="block truncate text-ui font-medium text-fg">{title}</span>
          <span className="block truncate text-caption text-fg-2">{detail}</span>
        </span>
      </button>
      {actions}
    </div>
  );
}
