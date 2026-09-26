const fs = require('fs');
let html = fs.readFileSync('templates/index.html', 'utf8');

const regex = /img\.addEventListener\("click", async function \(\) \{[\s\S]*?wrapper\.appendChild\(img\);/;

if (regex.test(html)) {
    html = html.replace(regex, 'img.addEventListener("click", function () { selectThumbnail(index); });\n\n                wrapper.appendChild(img);');
    fs.writeFileSync('templates/index.html', html, 'utf8');
    console.log("Success");
} else {
    console.log("Not found");
}

