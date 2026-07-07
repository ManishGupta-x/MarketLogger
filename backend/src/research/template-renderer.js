// Fills [PLACEHOLDER NAME] tokens in a prompt template body with supplied values.
// Any placeholder without a supplied value is left as-is so the gap is obvious.
function render(body, values = {}) {
  return body.replace(/\[([A-Z0-9 _-]+)\]/g, (match, name) => {
    const key = name.trim();
    return Object.prototype.hasOwnProperty.call(values, key) && values[key] !== ''
      ? values[key]
      : match;
  });
}

function extractPlaceholders(body) {
  const found = new Set();
  const regex = /\[([A-Z0-9 _-]+)\]/g;
  let m;
  while ((m = regex.exec(body)) !== null) found.add(m[1].trim());
  return [...found];
}

module.exports = { render, extractPlaceholders };
