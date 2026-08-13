import next from "eslint-config-next";
import coreWebVitals from "eslint-config-next/core-web-vitals";
import typescript from "eslint-config-next/typescript";

/**
 * ESLint flat config.
 *
 * `eslint-config-next` ships native flat config in Next 16 — the legacy
 * `FlatCompat` wrapper is no longer needed and in fact fails against it.
 */
const eslintConfig = [
  ...next,
  ...coreWebVitals,
  ...typescript,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "next-env.d.ts",
      "prisma/migrations/**",
    ],
  },
];

export default eslintConfig;
