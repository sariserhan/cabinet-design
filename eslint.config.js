import tseslint from 'typescript-eslint';
export default tseslint.config({ignores:['convex/_generated/**','.next/**','node_modules/**']},...tseslint.configs.recommended, {
  rules: { '@typescript-eslint/no-non-null-assertion': 'error' }
});
