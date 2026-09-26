const fs = require('fs');
let html = fs.readFileSync('templates/index.html', 'utf8');

const selectFunc = `
        async function selectThumbnail(index) {
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
        }
        
        function prevImage() {
            if (!selectedImageFiles || selectedImageFiles.length <= 1) return;
            let newIndex = selectedImageIndex - 1;
            if (newIndex < 0) newIndex = selectedImageFiles.length - 1;
            selectThumbnail(newIndex);
        }

        function nextImage() {
            if (!selectedImageFiles || selectedImageFiles.length <= 1) return;
            let newIndex = selectedImageIndex + 1;
            if (newIndex >= selectedImageFiles.length) newIndex = 0;
            selectThumbnail(newIndex);
        }
`;

if (!html.includes('function selectThumbnail(index)')) {
    html = html.replace('        function renderImageGallery(files) {', selectFunc + '        function renderImageGallery(files) {');
}

// Add the navigation buttons to HTML
const navHtml = `                        <button class="nav-btn prev-btn" onclick="prevImage()" title="Ảnh trước">❮</button>
                        <button class="nav-btn next-btn" onclick="nextImage()" title="Ảnh tiếp theo">❯</button>
                        <div id="imageContainer" class="image-container">`;

html = html.replace(`<div id="imageContainer" class="image-container">`, navHtml);

// Make the thumbnail click use selectThumbnail
html = html.replace(/img\.addEventListener\("click", async function \(\) \{[\s\S]*?renderData\(\);\n\s*\}\n\s*\}\);\n/g, 
`img.addEventListener("click", function () { selectThumbnail(index); });\n`);

// Update image viewer CSS
const navCss = `        .nav-btn {
            position: absolute;
            top: 50%;
            transform: translateY(-50%);
            background: rgba(255, 255, 255, 0.9);
            border: 1px solid #cbd5e1;
            border-radius: 50%;
            width: 44px;
            height: 44px;
            font-size: 20px;
            color: #334155;
            cursor: pointer;
            z-index: 100;
            display: flex;
            align-items: center;
            justify-content: center;
            box-shadow: 0 4px 6px rgba(0,0,0,0.1);
            transition: all 0.2s ease;
        }
        .nav-btn:hover {
            background: #fff;
            color: var(--primary);
            transform: translateY(-50%) scale(1.1);
        }
        .nav-btn:active {
            transform: translateY(-50%) scale(0.95);
        }
        .prev-btn { left: 16px; }
        .next-btn { right: 16px; }

        .image-viewer-wrapper {`;

html = html.replace(`.image-viewer-wrapper {`, navCss);

fs.writeFileSync('templates/index.html', html, 'utf8');

