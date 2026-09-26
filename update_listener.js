const fs = require('fs');
let html = fs.readFileSync('templates/index.html', 'utf8');

html = html.replace(`        document.getElementById("imageInput").addEventListener("change", function () {

            if (!this.files.length) {
                return;
            }

            selectedImageIndex = 0;

            renderImageGallery(this.files);

            showImage(this.files[0]);

            setStatus(\`✅ Đã chọn \${this.files.length} ảnh\`);
        });`, `        document.getElementById("imageInput").addEventListener("change", function () {

            if (!this.files.length) {
                return;
            }

            selectedImageFiles = Array.from(this.files);
            selectedImageIndex = 0;

            renderImageGallery(selectedImageFiles);

            showImage(selectedImageFiles[0]);

            setStatus(\`✅ Đã chọn \${selectedImageFiles.length} ảnh\`);
        });`);

fs.writeFileSync('templates/index.html', html, 'utf8');

