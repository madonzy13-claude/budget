/**
 * chart-ticks.ts — thin a numeric TIME axis so its labels don't collide (260801).
 *
 * The planned chart puts ticks ON the data points (a plain numeric axis would
 * invent dates nothing sits on), but a daily range has one point per spend day:
 * recharts drew them all and the labels printed over each other. Keeping the
 * first and last and requiring a minimum TIME gap between the rest keeps every
 * tick a real data point while leaving each label room to breathe.
 */
export function thinTimeTicks(values: number[], max = 6): number[] {
  if (values.length <= 2 || max < 2) return values;
  const first = values[0]!;
  const last = values[values.length - 1]!;
  const span = last - first;
  if (span <= 0) return values;

  const minGap = span / max;
  const out = [first];
  for (const v of values.slice(1, -1)) {
    if (v - out[out.length - 1]! >= minGap) out.push(v);
  }
  // The last point always gets its label — drop whatever crowds it.
  while (out.length > 1 && last - out[out.length - 1]! < minGap) out.pop();
  out.push(last);
  return out;
}
