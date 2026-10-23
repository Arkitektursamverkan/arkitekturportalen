/**
 * ESLint for the React frontend (flat config — ESLint 10).
 *
 * The rule that earns its keep here is react-hooks/rules-of-hooks: `tsc`
 * cannot see hook-order bugs, and a hook placed after an early return
 * crashes the whole page at runtime as soon as the guard stops firing.
 * That one is an error; everything else is tuned so `npm run lint` stays
 * quiet enough to be worth running on a codebase that predates linting.
 */
import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";

export default tseslint.config(
  { ignores: ["dist", "node_modules"] },
  {
    files: ["src/**/*.{ts,tsx}"],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: globals.browser,
    },
    plugins: {
      // Only the two classic hook rules: the plugin's own "recommended"
      // preset now also carries the React Compiler rules, which this
      // codebase is not written for.
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
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
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrors: "none" },
      ],
      "@typescript-eslint/ban-ts-comment": "warn",
    },
  },
);
