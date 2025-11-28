const { FlatCompat } = require('@eslint/eslintrc');
const path = require('path');

const compat = new FlatCompat({
    baseDirectory: __dirname,
});

module.exports = [
  ...compat.extends('next/core-web-vitals'),
  {
    ignores: ['.next/', 'dist/', 'build/', 'node_modules/'],
    rules: {
      "no-console": "warn",
    },
  }
];
