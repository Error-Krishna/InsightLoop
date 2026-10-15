import js from "@eslint/js";
import tseslint from "typescript-eslint";
import pluginSecurity from "eslint-plugin-security";
import pluginImport from "eslint-plugin-import-x";

export function createBaseConfig(tsconfigRootDir) {
  return tseslint.config(
    js.configs.recommended,
    pluginSecurity.configs.recommended,
    {
      files: ["**/*.{ts,tsx}"],
      extends: [
        ...tseslint.configs.strictTypeChecked,
        ...tseslint.configs.stylisticTypeChecked,
      ],
      plugins: {
        "import-x": pluginImport,
      },
      languageOptions: {
        parserOptions: {
          projectService: true,
          tsconfigRootDir,
        },
      },
      rules: {
        "@typescript-eslint/no-explicit-any": "error",
        "@typescript-eslint/no-floating-promises": "error",
        "@typescript-eslint/no-unused-vars": [
          "error",
          { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
        ],
        "@typescript-eslint/unbound-method": ["error", { ignoreStatic: true }],
        "@typescript-eslint/restrict-template-expressions": ["error", { allowNumber: true, allowBoolean: true }],
        "@typescript-eslint/no-extraneous-class": ["error", { allowStaticOnly: true }],
        "@typescript-eslint/no-non-null-assertion": "off",
        "@typescript-eslint/no-unnecessary-type-conversion": "off",
        "@typescript-eslint/no-unnecessary-condition": "off",
        "@typescript-eslint/no-base-to-string": "off",
        "@typescript-eslint/prefer-nullish-coalescing": "off",
        "@typescript-eslint/no-deprecated": "off",
        "no-console": "off",
        "security/detect-object-injection": "off",
      },
    },
    {
      ignores: [
        "dist/**",
        "node_modules/**",
        "coverage/**",
        "*.config.*",
        "vite.config.*",
        "vitest.config.*",
        "test/**",
        "scripts/**",
        "packages/eslint-config/**",
      ],
    },
  );
}
