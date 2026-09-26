const fs = require('fs');
let html = fs.readFileSync('templates/index.html', 'utf8');

function addUTC(str) {
    return str.replace(/new Date\((b\.created_at \|\| 0)\)/g, 'new Date($1 ? $1.replace(" ", "T") + "Z" : 0)')
              .replace(/new Date\((a\.created_at \|\| 0)\)/g, 'new Date($1 ? $1.replace(" ", "T") + "Z" : 0)');
}

html = addUTC(html);

// For the UI rendering:
html = html.replace(
    /const timeStr = doc\.created_at\s*\?\s*new Date\(doc\.created_at\)\.toLocaleString/g,
    `const timeStr = doc.created_at\n                    ? new Date(doc.created_at.replace(" ", "T") + "Z").toLocaleString`
);

fs.writeFileSync('templates/index.html', html, 'utf8');

