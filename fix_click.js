const fs = require('fs');
let html = fs.readFileSync('templates/index.html', 'utf8');

// Find the whole addEventListener("click" ... block and replace it
const startStr = '                img.addEventListener("click", async function () {';
const endStr = '                });\n\n                wrapper.appendChild(img);';

const startIndex = html.indexOf(startStr);
const endIndex = html.indexOf(endStr);

if (startIndex !== -1 && endIndex !== -1) {
    const originalBlock = html.substring(startIndex, endIndex + '                });'.length);
    html = html.replace(originalBlock, '                img.addEventListener("click", function () { selectThumbnail(index); });');
}

// Modify selectThumbnail to include the full error handling logic that was present before
html = html.replace(`        async function selectThumbnail(index) {
            if (!selectedImageFiles || index < 0 || index >= selectedImageFiles.length) return;
            selectedImageIndex = index;
            
            const thumbs = document.querySelectorAll(".image-thumb");
            thumbs.forEach(el => el.classList.remove("active"));
            
            const wrapper = document.querySelectorAll(".image-thumb-wrapper")[index];
            if (wrapper) {
                const img = wrapper.querySelector(".image-thumb");
                if (img) {
                    img.classList.add("active");
                    wrapper.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
                }
            }

            showImage(selectedImageFiles[index]);

            const result = ocrResults[index];
            if (result && result.status === "success") {
                currentJsonFile = result.json_file;
                if (currentJsonFile) await loadJSON(currentJsonFile);
            } else {
                currentData = null;
                currentJsonFile = null;
                renderData();
            }
        }`, `        async function selectThumbnail(index) {
            if (!selectedImageFiles || index < 0 || index >= selectedImageFiles.length) return;
            selectedImageIndex = index;
            
            const thumbs = document.querySelectorAll(".image-thumb");
            thumbs.forEach(el => el.classList.remove("active"));
            
            const wrapper = document.querySelectorAll(".image-thumb-wrapper")[index];
            if (wrapper) {
                const img = wrapper.querySelector(".image-thumb");
                if (img) {
                    img.classList.add("active");
                    wrapper.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
                }
            }

            const file = selectedImageFiles[index];
            showImage(file);

            const result = ocrResults[index];
            if (!result || result.status !== "success" || !result.json_file) {
                setStatus(\`👀 Đang xem: \${file.name}\`);
                return;
            }

            try {
                currentJsonFile = result.json_file;
                setStatus(\`⏳ Đang tải dữ liệu: \${file.name}\`);
                await loadJSON(currentJsonFile);
                setStatus(\`✅ Đang xem: \${file.name}\`);
            } catch (error) {
                console.error(error);
                setStatus(\`❌ Không đọc được dữ liệu: \${file.name}\`);
                alert(\`Không đọc được JSON của ảnh:\\n\${file.name}\`);
            }
        }`);

fs.writeFileSync('templates/index.html', html, 'utf8');

