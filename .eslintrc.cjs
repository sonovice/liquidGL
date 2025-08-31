module.exports = {
  root: true,
  env: { browser: true, es2022: true },
  parser: "@typescript-eslint/parser",
  parserOptions: { sourceType: "module", ecmaVersion: "latest" },
  plugins: ["@typescript-eslint", "import", "promise", "jsdoc"],
  extends: [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
    "plugin:import/recommended",
    "plugin:promise/recommended",
    "plugin:jsdoc/recommended",
    "prettier",
  ],
  settings: {
    "import/resolver": {
      typescript: {
        alwaysTryTypes: true,
        project: ["./tsconfig.json"],
      },
    },
  },
  rules: {
    "@typescript-eslint/ban-ts-comment": ["warn", { "ts-ignore": "allow-with-description" }],
    "@typescript-eslint/no-explicit-any": "off",
    "import/no-unresolved": "off",
    "jsdoc/require-jsdoc": "off",
    "no-console": ["warn", { allow: ["warn", "error"] }],
  },
  ignorePatterns: ["dist/**", "node_modules/**"],
};

