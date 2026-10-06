import globals from 'globals';

export default [{
  files: ['src/**/*.js'],
  languageOptions: { ecmaVersion: 2024, sourceType: 'module', globals: { ...globals.browser } },
  rules: { 'no-undef': 'error', 'no-unused-vars': 'off', 'no-import-assign': 'error' },
}];
