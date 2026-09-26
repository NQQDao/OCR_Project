const fs = require('fs');
let html = fs.readFileSync('templates/index.html', 'utf8');

html = html.replace(`        async function runOCR() {
            const input = document.getElementById("imageInput");
            const button = document.getElementById("ocrButton");

            if (!input.files.length) {
                alert("Hãy chọn ảnh trước.");
                return;
            }

            const files = Array.from(input.files);
            selectedImageFiles = files;`, `        async function runOCR() {
            const input = document.getElementById("imageInput");
            const button = document.getElementById("ocrButton");

            if (!selectedImageFiles || selectedImageFiles.length === 0) {
                if (input.files.length > 0) {
                    selectedImageFiles = Array.from(input.files);
                } else {
                    alert("Hãy chọn ảnh trước.");
                    return;
                }
            }

            const files = selectedImageFiles;`);

fs.writeFileSync('templates/index.html', html, 'utf8');

