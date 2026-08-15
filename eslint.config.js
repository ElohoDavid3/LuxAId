const { FlatCompat } = require('@eslint/eslintrc');

const compat = new FlatCompat({ baseDirectory: __dirname });

const eslintConfig = [
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
  {
    ignores: [
      'eslint.config.js',
      'node_modules/',
      '.next/',
      'out/',
      'build/',
      'dist/',
      'prisma/',
      'public/',
      'tokens/',
    ],
  },
];

module.exports = eslintConfig;
