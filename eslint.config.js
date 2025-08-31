// Flat ESLint config for ESLint v9+
import js from "@eslint/js";
import ts from "typescript-eslint";
import pluginImport from "eslint-plugin-import";
import pluginPromise from "eslint-plugin-promise";
import pluginJsdoc from "eslint-plugin-jsdoc";

export default [
  { ignores: ["dist/**", "node_modules/**"] },
  js.configs.recommended,
  ...ts.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: { window: true, document: true, navigator: true },
      parserOptions: { project: false },
    },
    plugins: { import: pluginImport, promise: pluginPromise, jsdoc: pluginJsdoc },
    rules: {
      "@typescript-eslint/ban-ts-comment": ["warn", { "ts-ignore": "allow-with-description" }],
      "@typescript-eslint/no-explicit-any": "off",
      "import/no-unresolved": "off",
      "jsdoc/require-jsdoc": "off",
      "no-console": ["warn", { allow: ["warn", "error"] }],
    },
  },
];

