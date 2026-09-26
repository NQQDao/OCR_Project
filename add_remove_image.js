const fs = require('fs');
let html = fs.readFileSync('templates/index.html', 'utf8');

// Add removeImageFromList
const removeFunc = `
        function removeImageFromList(index) {
            if (!selectedImageFiles || selectedImageFiles.length === 0) return;
            
            selectedImageFiles.splice(index, 1);
            if (ocrResults && ocrResults.length > index) {
                ocrResults.splice(index, 1);
            }
            
            if (selectedImageFiles.length === 0) {
                selectedImageIndex = 0;
                document.getElementById("imageGallery").innerHTML = "";
                const imageContainer = document.getElementById("imageContainer");
                // Remove existing image container content and reset to empty
                imageContainer.innerHTML = \`<div class="image-empty" id="imageEmptyPlaceholder">
                                <div class="big-icon">🖼️</div>
                                <strong>Chưa chọn ảnh</strong>
                                <div class="hint">Chọn ảnh phiếu để bắt đầu OCR</div>
                            </div>\`;
                setStatus("Chưa chọn ảnh", "info");
                const ocrBtn = document.getElementById("ocrButton");
                if (ocrBtn) ocrBtn.disabled = true;
                const fastBtn = document.getElementById("fastPassButton");
                if (fastBtn) fastBtn.disabled = true;
                
                const input = document.getElementById("imageInput");
                if (input) input.value = "";
                
                const title = document.getElementById("currentViewerTitle");
                if (title) title.innerHTML = \`<span class="panel-icon">🖼️</span> ẢNH PHIẾU\`;
            } else {
                if (selectedImageIndex >= selectedImageFiles.length) {
                    selectedImageIndex = selectedImageFiles.length - 1;
                } else if (selectedImageIndex > index) {
                    selectedImageIndex--;
                } else if (selectedImageIndex === index) {
                    // Do nothing, selectedImageIndex points to the new item at this index
                }
                
                renderImageGallery(selectedImageFiles);
                selectThumbnail(selectedImageIndex);
            }
        }
`;

if (!html.includes('function removeImageFromList(index)')) {
    html = html.replace('        async function selectThumbnail(index) {', removeFunc + '        async function selectThumbnail(index) {');
}

// Add CSS for the delete button
const cssAdd = `        .image-delete-btn {
            position: absolute;
            top: -5px;
            right: -5px;
            width: 20px;
            height: 20px;
            border-radius: 50%;
            background: #ef4444;
            color: white;
            font-size: 16px;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            border: 2px solid white;
            z-index: 10;
            line-height: 1;
            display: none;
        }
        .image-thumb-wrapper:hover .image-delete-btn {
            display: flex;
        }
        .image-delete-btn:hover {
            background: #dc2626;
            transform: scale(1.1);
        }
        
        .image-status {`;

html = html.replace(`        .image-status {`, cssAdd);

// Add the button to renderImageGallery
const jsAdd = `
                const deleteBtn = document.createElement("div");
                deleteBtn.className = "image-delete-btn";
                deleteBtn.innerHTML = "×";
                deleteBtn.title = "Xóa ảnh này";
                deleteBtn.onclick = function(e) {
                    e.stopPropagation();
                    removeImageFromList(index);
                };
                wrapper.appendChild(deleteBtn);

                wrapper.appendChild(img);`;

html = html.replace(`                wrapper.appendChild(img);`, jsAdd);

fs.writeFileSync('templates/index.html', html, 'utf8');

