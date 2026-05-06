const expense = { amount: 0 };
let total = 0;
total += expense.amount;          // BAD — flagged by rule
const sum = total + expense.amount; // BAD — flagged
export {};
