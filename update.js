const fs = require('fs');
let html = fs.readFileSync('templates/index.html', 'utf8');
const lines = html.split('\n');

const newFunc = `        async function runOCR() {
            const input = document.getElementById("imageInput");
            const button = document.getElementById("ocrButton");

            if (!input.files.length) {
                alert("Hãy chọn ảnh trước.");
                return;
            }

            const files = Array.from(input.files);
            selectedImageFiles = files;
            ocrResults = [];

            renderImageGallery(files);
            showImage(files[0]);

            button.disabled = true;
            button.style.opacity = ".65";

            document.querySelectorAll(".image-status").forEach(status => {
                status.textContent = "⏳";
                status.className = "image-status processing";
            });

            const total = files.length;
            let success = 0;
            let errors = 0;

            setStatus(\`⏳ Đang OCR: 0/\${total} ảnh...\`, "processing");

            for (let i = 0; i < total; i++) {
                const file = files[i];
                
                // Cập nhật trạng thái đang chạy cho ảnh hiện tại
                const currentStatusBadge = document.querySelector(\`.image-status[data-index="\${i}"]\`);
                if (currentStatusBadge) {
                    currentStatusBadge.textContent = "⚙️";
                    currentStatusBadge.style.background = "var(--primary)";
                }

                // Cập nhật thanh tiêu đề file đang xem
                const viewerTitle = document.getElementById("currentViewerTitle");
                if (viewerTitle) viewerTitle.innerHTML = \`Đang xử lý: <strong>\${i + 1}</strong> (\${file.name})\`;
                
                const formData = new FormData();
                formData.append("files", file);
                
                try {
                    const response = await fetch("/api/ocr", { method: "POST", body: formData });
                    const result = await response.json();
                    
                    if (!response.ok) {
                        throw new Error(result.detail || result.error || "OCR thất bại");
                    }
                    
                    const resData = Array.isArray(result.results) ? result.results[0] : (Array.isArray(result) ? result[0] : result);
                    ocrResults.push(resData);
                    
                    if (resData.status === "success") {
                        success++;
                        if (currentStatusBadge) {
                            currentStatusBadge.textContent = "✅";
                            currentStatusBadge.className = "image-status ok";
                            currentStatusBadge.style.background = "";
                        }
                        
                        // Tự động load JSON của ảnh thành công đầu tiên
                        if (success === 1) {
                            currentJsonFile = resData.json_file;
                            selectedImageIndex = i;
                            showImage(files[i]);
                            await loadJSON(currentJsonFile);
                        }
                    } else {
                        errors++;
                        if (currentStatusBadge) {
                            currentStatusBadge.textContent = "❌";
                            currentStatusBadge.className = "image-status error";
                            currentStatusBadge.style.background = "";
                        }
                    }
                } catch (err) {
                    console.error("Lỗi OCR file", file.name, err);
                    errors++;
                    ocrResults.push({ file: file.name, status: "error", error: err.message });
                    if (currentStatusBadge) {
                        currentStatusBadge.textContent = "❌";
                        currentStatusBadge.className = "image-status error";
                        currentStatusBadge.style.background = "";
                    }
                }
                
                // Cập nhật thanh status bar
                setStatus(\`⏳ Đang OCR: \${i + 1}/\${total} ảnh (Thành công: \${success}, Lỗi: \${errors})...\`, "processing");
            }

            button.disabled = false;
            button.style.opacity = "1";
            
            if (success > 0) {
                setStatus(\`✅ Đã hoàn tất OCR! Trạng thái: \${success}/\${total} ảnh thành công.\`, "success");
            } else {
                setStatus(\`❌ OCR thất bại toàn bộ \${total} ảnh.\`, "error");
            }

            if (errors > 0) {
                const errorList = ocrResults.filter(item => item.status === "error").map(item => item.file + ": " + item.error).join("\\n");
                alert(\`Quá trình OCR hoàn tất nhưng có \${errors} ảnh bị lỗi:\\n\\n\${errorList}\`);
            }
        }`;
const newLines = [...lines.slice(0, 2394), newFunc, ...lines.slice(2564)];
fs.writeFileSync('templates/index.html', newLines.join('\n'), 'utf8');

