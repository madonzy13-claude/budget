// Fixture for `local/no-float-money` rule tests. Deliberately violates the
// rule so the linter has positive cases. ESLint must not flag this file
// itself — it's parsed by rule tests, not run.
/* eslint-disable local/no-float-money, @typescript-eslint/no-unused-vars */
const expense = { amount: 0 };
let total = 0;
total += expense.amount;
const sum = total + expense.amount;
export {};
