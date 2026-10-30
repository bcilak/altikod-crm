import js from '@eslint/js';
import tseslint from 'typescript-eslint';
export default tseslint.config(
  { ignores: ['**/dist/**', '**/.next/**', '**/.next-e2e/**', '**/node_modules/**', '**/next-env.d.ts', '**/generated/**', '**/test-results/**', '**/playwright-report/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  { files: ['**/*.mjs'], languageOptions: { globals: { process: 'readonly', console: 'readonly', URL: 'readonly' } } },
  { files: ['apps/web/public/sw.js'], languageOptions: { sourceType: 'script', globals: { self: 'readonly', URL: 'readonly' } } },
);
