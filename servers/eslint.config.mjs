// @ts-check
import eslint from '@eslint/js'
import tseslint from 'typescript-eslint'
import prettier from 'eslint-config-prettier'
import globals from 'globals'

export default tseslint.config(
  // 1. 基础推荐规则
  eslint.configs.recommended,

  // 2. TypeScript 推荐规则
  ...tseslint.configs.recommended,

  // 3. 全局配置:语言选项、Node/Jest 全局变量、项目规则
  {
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: {
        ...globals.node,
        ...globals.jest,
      },
    },
    rules: {
      // 项目里已存在的规则
      '@typescript-eslint/semi': [2, 'never'],
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': 0,
      'eqeqeq': [2, 'allow-null'],
      // 格式化规则交给 Prettier(项目 .prettierrc)
      'indent': 'off',
      'quotes': 'off',
      'semi': 'off',
      'eol-last': 'off',
      'array-bracket-spacing': 'off',
    },
  },

  // 4. 测试文件单独配置:补齐 jest globals(若上面已合并,这里仅留位)
  {
    files: ['**/*.spec.ts', '**/*.e2e-spec.ts', 'test/**/*.ts'],
    languageOptions: {
      globals: { ...globals.jest },
    },
  },

  // 5. 必须放在最后:关闭所有与 Prettier 冲突的规则
  prettier,

  // 6. 全局忽略
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'coverage/**',
      '**/*.d.ts',
    ],
  },
)
