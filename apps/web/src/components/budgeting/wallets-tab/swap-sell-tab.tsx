"use client";
// ponytail: placeholder until 13.1-09 Task 3 lands the Sell tab.
import type { SwapTabProps } from "./swap-buy-tab";
import { NumericInput } from "./holding-sheet";

export function SwapSellTab(_props: SwapTabProps) {
  return <NumericInput testId="swap-sell-left" value="" onChange={() => {}} />;
}
