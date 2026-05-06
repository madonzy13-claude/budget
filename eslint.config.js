import tsParser from '@typescript-eslint/parser';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const localRules = require('./eslint-rules/index.cjs');

export default [
  { ignores: ['node_modules/**', 'dist/**', '.next/**', 'coverage/**', 'playwright-report/**'] },
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: { parser: tsParser, parserOptions: { project: false, ecmaVersion: 2024, sourceType: 'module' } },
    plugins: { '@typescript-eslint': tsPlugin, local: localRules },
    rules: {
      'local/no-float-money': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
];
