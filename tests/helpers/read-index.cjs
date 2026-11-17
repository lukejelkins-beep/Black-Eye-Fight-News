// index.html keeps its large scripts in assets/app-inline-N.js. Tests that
// assert on page behaviour want the page as a whole, so put those scripts
// back inline (same order, same position) before returning the HTML.
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..', '..');
module.exports = function readIndex() {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  return html.replace(
    /<script src="(assets\/app-inline-\d+\.js)(?:\?[^"]*)?"([^>]*)><\/script>/g,
    (_, file, attrs) => '<script' + attrs + '>' + fs.readFileSync(path.join(root, file), 'utf8') + '</script>');
};
