const fs = require('fs');
const html = fs.readFileSync('templates/index.html', 'utf8');
const scriptMatch = html.match(/<script>([\s\S]*?)<\/script>/);

if (scriptMatch) {
    fs.writeFileSync('test_syntax.js', scriptMatch[1], 'utf8');
} else {
    console.log("No script tag found");
}

