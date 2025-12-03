const shadowDomFix = require("./postcss-shadow-dom-fix.cjs");

module.exports = {
  plugins: [
    require("@tailwindcss/postcss"),
    shadowDomFix(),
  ],
};
