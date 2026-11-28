// ESLint flat config. Follows Throttle's conventions (import order without
// blank lines, Prettier as warnings, no colour literals outside the theme),
// without Expo's preset.
import js from '@eslint/js';
import {importX} from 'eslint-plugin-import-x';
import prettierRecommended from 'eslint-plugin-prettier/recommended';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

// Matches colour values written as string literals: #rgb, #rrggbb(aa), rgb(),
// rgba(), hsl(), hsla(), oklch() and oklab(). Colours belong in
// src/renderer/theme only (CARRY-3).
const COLOR_LITERAL =
  '/^\\s*(#[0-9a-fA-F]{3,8}\\s*$|(rgb|rgba|hsl|hsla|oklch|oklab)\\s*\\()/';

const COLOR_SYNTAX = [
  {
    selector: `Literal[value=${COLOR_LITERAL}]`,
    message:
      'Hard-coded colour. Use a semantic token from the theme (see src/renderer/theme).',
  },
  {
    selector: `TemplateElement[value.raw=${COLOR_LITERAL}]`,
    message:
      'Hard-coded colour. Use a semantic token from the theme (see src/renderer/theme).',
  },
];

export default tseslint.config(
  {ignores: ['node_modules/', 'out/', 'dist/', 'release-builds/', 'coverage/']},
  js.configs.recommended,
  tseslint.configs.recommended,
  importX.flatConfigs.recommended,
  importX.flatConfigs.typescript,
  {
    languageOptions: {
      globals: {...globals.node},
    },
    settings: {
      'import-x/resolver-next': [
        importX.createNodeResolver({extensions: ['.ts', '.tsx', '.js']}),
      ],
    },
    rules: {
      'import-x/order': [
        'error',
        {
          'newlines-between': 'never',
          alphabetize: {order: 'asc', caseInsensitive: true},
          // Workspace packages sort with the other packages.
          pathGroups: [{pattern: '@lever/**', group: 'external'}],
          pathGroupsExcludedImportTypes: [],
        },
      ],
      // TypeScript already checks that imports resolve.
      'import-x/no-unresolved': 'off',
      'import-x/named': 'off',
      'import-x/namespace': 'off',
      'import-x/default': 'off',
      'import-x/no-named-as-default-member': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        {argsIgnorePattern: '^_', varsIgnorePattern: '^_'},
      ],
      eqeqeq: ['error', 'always'],
    },
  },
  {
    files: ['src/renderer/**/*.{ts,tsx}'],
    languageOptions: {
      globals: {...globals.browser},
    },
    plugins: {'react-hooks': reactHooks},
    rules: {
      ...reactHooks.configs.recommended.rules,
    },
  },
  {
    // The protocol packages must stay usable from React Native and Node:
    // no platform imports (REU-2).
    files: [
      'packages/z21-protocol/src/**/*.ts',
      'packages/driver-link-protocol/src/**/*.ts',
    ],
    ignores: ['**/__tests__/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                'node:*',
                'electron',
                'react',
                'react-native',
                'react-dom',
              ],
              message:
                'The protocol packages must not depend on a platform (see COPIED_FROM.md, README.md).',
            },
          ],
        },
      ],
    },
  },
  {
    // Pure layers: no Electron, React or DOM (STK-10, ARC-L2).
    files: [
      'src/model/**/*.ts',
      'src/interlocking/**/*.ts',
      'src/shared/**/*.ts',
    ],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['electron', 'react', 'react-dom', 'node:*'],
              message:
                'model/, interlocking/ and shared/ are pure TypeScript and must run without Electron.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['**/*.ts', '**/*.tsx'],
    ignores: ['src/renderer/theme/**'],
    rules: {
      'no-restricted-syntax': ['error', ...COLOR_SYNTAX],
    },
  },
  {
    // The driver link package runs in plain Node with type stripping
    // (scripts/link-probe.mjs) and in React Native: only erasable
    // TypeScript, and type-only imports marked as such.
    files: ['packages/driver-link-protocol/src/**/*.ts'],
    rules: {
      '@typescript-eslint/consistent-type-imports': [
        'error',
        {fixStyle: 'separate-type-imports'},
      ],
      'no-restricted-syntax': [
        'error',
        ...COLOR_SYNTAX,
        {
          selector: 'TSEnumDeclaration',
          message: 'No enums: Node cannot strip them. Use a const array.',
        },
        {
          selector: 'TSParameterProperty',
          message: 'No parameter properties: Node cannot strip them.',
        },
        {
          selector: 'TSModuleDeclaration',
          message: 'No namespaces: Node cannot strip them.',
        },
        {
          selector:
            'ImportDeclaration[source.value=/^[.]/]:not([source.value=/[.](ts|json)$/])',
          message:
            'Relative imports carry their .ts extension (Node type stripping).',
        },
      ],
    },
  },
  prettierRecommended,
  {
    rules: {
      'prettier/prettier': 'warn',
    },
  },
);
