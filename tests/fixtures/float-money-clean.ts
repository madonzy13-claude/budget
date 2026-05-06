// Money.add usage — rule does not flag method calls
declare const a: { add(b: unknown): unknown };
declare const b: unknown;
void a.add(b);
export {};
