const fs = require('fs');
let html = fs.readFileSync('templates/index.html', 'utf8');
const lines = html.split('\n');
lines[1773] = '            <button id="fastPassButton" class="btn btn-warning" onclick="runFastPassFilter()" style="color: #92400e; background: #fef08a; border-color: #fde047; font-weight: bold;">🔍 Lọc trùng nhanh</button>\n' + lines[1773];

const newFunc = `        async function runFastPassFilter() {
            if (!selectedImageFiles || selectedImageFiles.length === 0) {
                const input = document.getElementById("imageInput");
                if (input.files.length > 0) {
                   selectedImageFiles = Array.from(input.files);
                } else {
                   alert("Hãy chọn ảnh trước.");
                   return;
                }
            }

            const button = document.getElementById("fastPassButton");
            const ocrBtn = document.getElementById("ocrButton");
            button.disabled = true;
            ocrBtn.disabled = true;
            button.style.opacity = ".65";
            
            document.querySelectorAll(".image-status").forEach(status => {
                status.textContent = "⏳";
                status.className = "image-status processing";
            });

            const total = selectedImageFiles.length;
            setStatus(\`⏳ Đang quét nhanh (Lọc trùng): 0/\${total} ảnh...\`, "processing");
            
            const fastResults = [];

            for (let i = 0; i < total; i++) {
                const file = selectedImageFiles[i];
                const currentStatusBadge = document.querySelector(\`.image-status[data-index="\${i}"]\`);
                if (currentStatusBadge) {
                    currentStatusBadge.textContent = "⚡";
                    currentStatusBadge.style.background = "var(--warning)";
                }
                
                const viewerTitle = document.getElementById("currentViewerTitle");
                if (viewerTitle) viewerTitle.innerHTML = \`Đang quét nhanh: <strong>\${i + 1}</strong> (\${file.name})\`;
                showImage(file);
                
                const formData = new FormData();
                formData.append("files", file);
                
                try {
                    const response = await fetch("/api/ocr?mode=fast", { method: "POST", body: formData });
                    const result = await response.json();
                    if (!response.ok) throw new Error("API failed");
                    
                    const resData = Array.isArray(result.results) ? result.results[0] : (Array.isArray(result) ? result[0] : result);
                    const fastJson = typeof resData.raw_json === "string" ? JSON.parse(resData.raw_json) : resData.raw_json;
                    
                    fastResults.push({
                        file: file,
                        so_xe: fastJson.so_xe ? fastJson.so_xe.replace(/\\s+/g, "").toUpperCase() : "",
                        so_dong: parseInt(fastJson.so_dong) || 0,
                        originalName: file.name
                    });
                    
                    if (currentStatusBadge) {
                        currentStatusBadge.textContent = "✔️";
                        currentStatusBadge.style.background = "";
                    }
                } catch (err) {
                    fastResults.push({ file: file, so_xe: "", so_dong: 0, originalName: file.name });
                    if (currentStatusBadge) {
                        currentStatusBadge.textContent = "⚠️";
                        currentStatusBadge.style.background = "";
                    }
                }
                setStatus(\`⏳ Đang quét nhanh: \${i + 1}/\${total} ảnh...\`, "processing");
            }
            
            const groups = {};
            fastResults.forEach(item => {
                if (!item.so_xe) return; 
                if (!groups[item.so_xe]) groups[item.so_xe] = [];
                groups[item.so_xe].push(item);
            });
            
            const filesToKeep = new Set();
            
            fastResults.forEach(item => {
                if (!item.so_xe) filesToKeep.add(item.file);
            });
            
            for (const so_xe in groups) {
                const group = groups[so_xe];
                let maxDong = -1;
                let bestItem = null;
                for (const item of group) {
                    if (item.so_dong > maxDong) {
                        maxDong = item.so_dong;
                        bestItem = item;
                    }
                }
                if (bestItem) filesToKeep.add(bestItem.file);
            }
            
            const newSelectedFiles = [];
            let removedCount = 0;
            fastResults.forEach(item => {
                if (filesToKeep.has(item.file)) {
                    newSelectedFiles.push(item.file);
                } else {
                    removedCount++;
                }
            });
            
            selectedImageFiles = newSelectedFiles;
            renderImageGallery(selectedImageFiles);
            if (selectedImageFiles.length > 0) showImage(selectedImageFiles[0]);
            
            button.disabled = false;
            ocrBtn.disabled = false;
            button.style.opacity = "1";
            
            setStatus(\`✅ Quét nhanh hoàn tất! Đã tự động loại bỏ \${removedCount} ảnh trùng lặp.\`, "success");
            if (removedCount > 0) {
               alert(\`Đã hoàn tất quét nhanh!\\nGiữ lại: \${newSelectedFiles.length} ảnh\\nLoại bỏ: \${removedCount} ảnh trùng lặp (chỉ lấy ảnh có nhiều dòng nhất).\`);
            }
        }`;

const newLines = [...lines.slice(0, 2394), newFunc, ...lines.slice(2394)];
fs.writeFileSync('templates/index.html', newLines.join('\n'), 'utf8');

