"use client";

import { useState } from "react";
import KeyForm from "@/components/keys/key-form";
import KeyList from "@/components/keys/key-list";
import { Card } from "@/components/ui/card";

export default function KeysSection() {
  const [refresh, setRefresh] = useState(0);
  return (
    <section aria-labelledby="keys-heading" className="space-y-3">
      <h2 id="keys-heading" className="font-display text-xl font-semibold tracking-[-0.01em]">
        API keys
      </h2>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <Card className="p-6">
          <h3 className="mb-4 text-base font-semibold text-fg">Add API key</h3>
          <KeyForm onSaved={() => setRefresh((n) => n + 1)} />
        </Card>
        <Card className="overflow-hidden">
          <KeyList refreshToken={refresh} />
        </Card>
      </div>
    </section>
  );
}
