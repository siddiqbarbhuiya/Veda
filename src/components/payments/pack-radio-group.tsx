"use client";

import { Check } from "lucide-react";
import { PackBody, TOPUP_PACKS } from "./topup-packs";

// Radio-style cards. Native radio inputs give arrow-key navigation and screen reader state.
export default function PackRadioGroup({
  name,
  value,
  onChange,
  labelledBy,
  disabled = false,
}: {
  name: string;
  value: number;
  onChange: (amountPaise: number) => void;
  labelledBy: string;
  disabled?: boolean;
}) {
  return (
    <div role="radiogroup" aria-labelledby={labelledBy} className="grid gap-3 sm:grid-cols-3">
      {TOPUP_PACKS.map((pack) => {
        const selected = pack.amountPaise === value;
        return (
          <label
            key={pack.amountPaise}
            className={
              "relative block min-h-11 rounded-lg border p-4 transition-colors duration-150 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ring " +
              (selected
                ? "border-accent bg-accent-subtle"
                : "border-line-strong bg-elevated hover:border-control") +
              (disabled ? " cursor-not-allowed opacity-50" : " cursor-pointer")
            }
          >
            <input
              type="radio"
              name={name}
              value={pack.amountPaise}
              checked={selected}
              disabled={disabled}
              aria-disabled={disabled || undefined}
              onChange={() => onChange(pack.amountPaise)}
              className="sr-only"
            />
            {selected ? (
              <Check
                size={16}
                aria-hidden="true"
                className="absolute bottom-3 right-3 text-accent-text"
              />
            ) : null}
            <PackBody pack={pack} />
          </label>
        );
      })}
    </div>
  );
}
