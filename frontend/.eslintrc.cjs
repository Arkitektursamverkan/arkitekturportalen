/**
 * ESLint for the React frontend (eslintrc format — ESLint 8, matching the
 * `--ext ts,tsx` lint script).
 *
 * The rule that earns its keep here is react-hooks/rules-of-hooks: `tsc`
 * cannot see hook-order bugs, and a hook placed after an early return
 * crashes the whole page at runtime as soon as the guard stops firing.
 * That one is an error; everything else is tuned so `npm run lint` stays
 * quiet enough to be worth running on a codebase that predates linting.
 */
module.exports = {
  root: true,
  env: { browser: true, es2022: true },
  parser: "@typescript-eslint/parser",
  parserOptions: {
    ecmaVersion: "latest",
    sourceType: "module",
    ecmaFeatures: { jsx: true },
  },
  plugins: ["@typescript-eslint", "react-hooks", "react-refresh"],
  extends: [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
    "plugin:react-hooks/recommended",
  ],
  ignorePatterns: ["dist", "node_modules"],
  rules: {
    // The point of this config.
    "react-hooks/rules-of-hooks": "error",
    // Missing deps are usually deliberate here (effects that must run once
    // per mount, or per id), so this stays advisory rather than blocking.
    "react-hooks/exhaustive-deps": "warn",
    "react-refresh/only-export-components": "off",
    // `any` shows up in graph/cytoscape and chart glue where the upstream
    // types are loose; flagged, not fatal.
    "@typescript-eslint/no-explicit-any": "warn",
    // Warnings, not errors: the pre-existing code has ~35 of these (mostly
    // leftover imports). Keeping them visible but non-fatal means a non-zero
    // exit from `npm run lint` always signals something that actually breaks
    // at runtime, rather than drowning in cruft nobody is fixing today.
    "@typescript-eslint/no-unused-vars": [
      "warn",
      { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
    ],
    "@typescript-eslint/ban-ts-comment": "warn",
  },
};
