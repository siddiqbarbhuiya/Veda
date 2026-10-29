"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, SectionLabel } from "@/components/ui/card";
import PackRadioGroup from "@/components/payments/pack-radio-group";
import { TOPUP_PACKS } from "@/lib/razorpay/packs";
import { formatRupees } from "@/lib/money";

const DEFAULT_AMOUNT = TOPUP_PACKS[1].amountPaise;

export default function TopupSection({ onChoose }: { onChoose: (amountPaise: number) => void }) {
  const [amount, setAmount] = useState(DEFAULT_AMOUNT);
  return (
    <Card className="p-6">
      <SectionLabel id="topup-packs-label">Top-up packs</SectionLabel>
      <div className="mt-4">
        <PackRadioGroup
          name="dashboard-pack"
          labelledBy="topup-packs-label"
          value={amount}
          onChange={setAmount}
        />
      </div>
      <div className="mt-4 flex justify-end">
        <Button variant="secondary" size="lg" className="w-full sm:h-9 sm:w-auto sm:text-sm" onClick={() => onChoose(amount)}>
          Continue with {formatRupees(amount)}
        </Button>
      </div>
    </Card>
  );
}
