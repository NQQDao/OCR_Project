const fs = require('fs');
let html = fs.readFileSync('templates/index.html', 'utf8');

// 1. Remove JSON button
const jsonBtnRegex = /<a class="btn-action-sm" href="\/output\/\$\{encodeURIComponent\(doc\.file_name\)\}" target="_blank" style="background: #fffbeb; color: #b45309; border-color: #fde68a;" title="Xem file JSON kết quả OCR trên Cloudflare R2">\s*<span>📄 JSON<\/span>\s*<\/a>/g;
html = html.replace(jsonBtnRegex, "");

// 2. Add Preview Button to toolbar
const exportBtnRegex = /<button type="button" class="btn btn-info" id="btnExportBatchHistory"/;
html = html.replace(exportBtnRegex, `<button type="button" class="btn btn-secondary" id="btnPreviewBatchHistory" onclick="previewSelectedHistoryImages()" style="margin-right: 8px; background: #f1f5f9; color: #0f172a; border-color: #cbd5e1;" disabled>👁️ Xem trước ảnh đã chọn</button>\n                                    <button type="button" class="btn btn-info" id="btnExportBatchHistory"`);

// 3. Update updateSelectedHistoryCount
// Find precisely this block
const oldUpdateFn = `        function updateSelectedHistoryCount() {
            const items = document.querySelectorAll(".history-select-item:checked");
            const btnExport = document.getElementById("btnExportBatchHistory");
            const btnDelete = document.getElementById("btnDeleteBatchHistory");
            const badgeExport = document.getElementById("selectedCountBadge");
            const badgeDelete = document.getElementById("selectedCountBadgeDelete");
            const count = items.length;

            if (badgeExport) badgeExport.textContent = count;
            if (badgeDelete) badgeDelete.textContent = count;
            if (btnExport) btnExport.disabled = (count === 0);
            if (btnDelete) btnDelete.disabled = (count === 0);
        }`;

const newUpdateFn = `        function updateSelectedHistoryCount() {
            const items = document.querySelectorAll(".history-select-item:checked");
            const btnExport = document.getElementById("btnExportBatchHistory");
            const btnDelete = document.getElementById("btnDeleteBatchHistory");
            const btnPreview = document.getElementById("btnPreviewBatchHistory");
            const badgeExport = document.getElementById("selectedCountBadge");
            const badgeDelete = document.getElementById("selectedCountBadgeDelete");
            const count = items.length;

            if (badgeExport) badgeExport.textContent = count;
            if (badgeDelete) badgeDelete.textContent = count;
            if (btnExport) btnExport.disabled = (count === 0);
            if (btnDelete) btnDelete.disabled = (count === 0);
            if (btnPreview) btnPreview.disabled = (count === 0);
        }`;

if (html.includes(oldUpdateFn)) {
    html = html.replace(oldUpdateFn, newUpdateFn);
} else {
    console.error("COULD NOT FIND updateSelectedHistoryCount!");
}

// 4. Add the Preview Modal HTML
const modalHtml = `
    <!-- MODAL XEM TRƯỚC ẢNH TỔNG HỢP -->
    <div id="previewBatchImagesModal" class="modal-backdrop" onclick="if(event.target===this) closePreviewBatchModal()" style="z-index: 10000; display: none;">
        <div class="modal-card" style="max-width: 90vw; width: 1200px; height: 85vh; padding: 0; background: #0f172a; color: white;">
            <div class="modal-header" style="background: #1e293b; border-bottom: 1px solid #334155; padding: 12px 20px;">
                <div class="modal-title" style="color: #f8fafc; font-size: 16px;">
                    <span>👁️</span>
                    <span>XEM TRƯỚC ẢNH CÁC PHIẾU ĐÃ CHỌN (<span id="previewBatchCount">0</span>)</span>
                </div>
                <button type="button" class="modal-close" onclick="closePreviewBatchModal()" title="Đóng" style="color: #cbd5e1;">✕</button>
            </div>
            <div class="modal-body" style="padding: 0; display: flex; flex-direction: column; overflow: hidden; position: relative;">
                
                <div style="flex-grow: 1; display: flex; align-items: center; justify-content: center; position: relative; padding: 20px;">
                    <img id="previewBatchImage" src="" style="max-width: 100%; max-height: 100%; object-fit: contain; border-radius: 8px; box-shadow: 0 4px 20px rgba(0,0,0,0.5);">
                    <div id="previewBatchTitle" style="position: absolute; bottom: 20px; left: 50%; transform: translateX(-50%); background: rgba(0,0,0,0.7); padding: 8px 16px; border-radius: 20px; font-weight: bold; font-size: 16px; backdrop-filter: blur(4px);">
                        Số xẻ: ...
                    </div>
                </div>

                <button type="button" class="nav-btn prev-btn" onclick="prevBatchImage()" style="position: absolute; left: 20px; top: 50%; transform: translateY(-50%); z-index: 10; background: rgba(255,255,255,0.2); color: white; border-color: rgba(255,255,255,0.3);">❮</button>
                <button type="button" class="nav-btn next-btn" onclick="nextBatchImage()" style="position: absolute; right: 20px; top: 50%; transform: translateY(-50%); z-index: 10; background: rgba(255,255,255,0.2); color: white; border-color: rgba(255,255,255,0.3);">❯</button>

            </div>
            <div class="modal-footer" style="background: #1e293b; border-top: 1px solid #334155; padding: 16px; display: flex; justify-content: center;">
                <button type="button" class="btn btn-primary" onclick="confirmExportBatchFromPreview()" style="font-size: 16px; padding: 10px 30px;">
                    📥 Xác nhận Xuất Excel chuẩn
                </button>
            </div>
        </div>
    </div>
</body>`;
html = html.replace('</body>', modalHtml);

// 5. Add JS functions
const jsLogic = `
        let previewBatchImages = [];
        let previewBatchIndex = 0;

        function previewSelectedHistoryImages() {
            const checkboxes = document.querySelectorAll('.history-select-item:checked');
            if (checkboxes.length === 0) return;
            
            previewBatchImages = [];
            checkboxes.forEach(cb => {
                const fileName = cb.value;
                const doc = cachedHistoryDocs ? cachedHistoryDocs.find(d => d.file_name === fileName) : null;
                if (doc) {
                    previewBatchImages.push({
                        image_path: doc.image_path,
                        so_xe: doc.so_xe || "Chưa có số xẻ",
                        file_name: fileName
                    });
                }
            });
            
            if (previewBatchImages.length === 0) {
                alert("Không tìm thấy dữ liệu ảnh cho các phiếu đã chọn.");
                return;
            }
            
            previewBatchIndex = 0;
            document.getElementById("previewBatchCount").textContent = previewBatchImages.length;
            updatePreviewBatchUI();
            
            document.getElementById("previewBatchImagesModal").style.display = "flex";
            document.body.style.overflow = "hidden";
        }

        function updatePreviewBatchUI() {
            const data = previewBatchImages[previewBatchIndex];
            const imgEl = document.getElementById("previewBatchImage");
            const titleEl = document.getElementById("previewBatchTitle");
            
            if (data && data.image_path) {
                imgEl.src = "/web_uploads/" + encodeURIComponent(data.image_path);
                imgEl.style.display = "block";
            } else {
                imgEl.src = "";
                imgEl.style.display = "none";
            }
            
            titleEl.textContent = \`(\${previewBatchIndex + 1}/\${previewBatchImages.length}) Số xẻ: \${data ? data.so_xe : "Không rõ"}\`;
        }

        function prevBatchImage() {
            if (previewBatchImages.length <= 1) return;
            previewBatchIndex--;
            if (previewBatchIndex < 0) previewBatchIndex = previewBatchImages.length - 1;
            updatePreviewBatchUI();
        }

        function nextBatchImage() {
            if (previewBatchImages.length <= 1) return;
            previewBatchIndex++;
            if (previewBatchIndex >= previewBatchImages.length) previewBatchIndex = 0;
            updatePreviewBatchUI();
        }

        function closePreviewBatchModal() {
            document.getElementById("previewBatchImagesModal").style.display = "none";
            document.body.style.overflow = "";
        }

        function confirmExportBatchFromPreview() {
            closePreviewBatchModal();
            exportSelectedHistoryExcel();
        }

        // Catch ESC key for the new modal
        document.addEventListener("keydown", function (e) {
            if (e.key === "Escape") {
                const pModal = document.getElementById("previewBatchImagesModal");
                if (pModal && pModal.style.display !== "none") {
                    closePreviewBatchModal();
                }
            }
        });
    </script>`;

// Find the last </script> in the file
const lastScriptTagIndex = html.lastIndexOf('</script>');
if (lastScriptTagIndex !== -1) {
    html = html.substring(0, lastScriptTagIndex) + jsLogic + html.substring(lastScriptTagIndex + 9);
} else {
    console.error("COULD NOT FIND </script>");
}

fs.writeFileSync('templates/index.html', html, 'utf8');

