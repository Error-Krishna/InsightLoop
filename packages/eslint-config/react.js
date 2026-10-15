import { createBaseConfig } from "./base.js";
import pluginReactHooks from "eslint-plugin-react-hooks";
import pluginJsxA11y from "eslint-plugin-jsx-a11y";

export function createReactConfig(tsconfigRootDir) {
  const base = createBaseConfig(tsconfigRootDir);
  return [
    ...base,
    {
      plugins: {
        "react-hooks": pluginReactHooks,
        "jsx-a11y": pluginJsxA11y,
      },
      rules: {
        ...pluginReactHooks.configs.recommended.rules,
        ...pluginJsxA11y.configs.recommended.rules,
        "react-hooks/set-state-in-effect": "off",
        "@typescript-eslint/no-explicit-any": "error",
        "@typescript-eslint/no-floating-promises": "error",
        "@typescript-eslint/no-misused-promises": [
          "error",
          {
            checksVoidReturn: {
              attributes: false,
            },
          },
        ],
        "@typescript-eslint/no-confusing-void-expression": [
          "error",
          {
            ignoreArrowShorthand: true,
          },
        ],
        "jsx-a11y/label-has-associated-control": [
          "error",
          {
            assert: "either",
            depth: 3,
          },
        ],
        "@typescript-eslint/no-unsafe-assignment": "off",
        "@typescript-eslint/no-unsafe-member-access": "off",
        "@typescript-eslint/no-unsafe-argument": "off",
        "@typescript-eslint/no-unsafe-call": "off",
        "@typescript-eslint/no-unsafe-return": "off",
      },
    },
  ];
}
