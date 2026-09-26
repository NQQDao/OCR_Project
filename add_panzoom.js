const fs = require('fs');
let html = fs.readFileSync('templates/index.html', 'utf8');

// 1. Find the modal body container to add an ID (so we can attach events to it)
const oldContainerHtml = `<div style="flex-grow: 1; display: flex; align-items: center; justify-content: center; position: relative; padding: 20px;">
                    <img id="previewBatchImage" src="" style="max-width: 100%; max-height: 100%; object-fit: contain; border-radius: 8px; box-shadow: 0 4px 20px rgba(0,0,0,0.5);">`;

const newContainerHtml = `<div id="previewBatchContainer" style="flex-grow: 1; display: flex; align-items: center; justify-content: center; position: relative; padding: 20px; overflow: hidden; cursor: grab;">
                    <img id="previewBatchImage" src="" style="max-width: 100%; max-height: 100%; object-fit: contain; border-radius: 8px; box-shadow: 0 4px 20px rgba(0,0,0,0.5); transform-origin: center; cursor: inherit;" draggable="false">`;

html = html.replace(oldContainerHtml, newContainerHtml);

// 2. Add zoom controls to the footer
const oldFooterHtml = `<div class="modal-footer" style="background: #1e293b; border-top: 1px solid #334155; padding: 16px; display: flex; justify-content: center;">
                <button type="button" class="btn btn-primary" onclick="confirmExportBatchFromPreview()" style="font-size: 16px; padding: 10px 30px;">
                    📥 Xác nhận Xuất Excel chuẩn
                </button>
            </div>`;

const newFooterHtml = `<div class="modal-footer" style="background: #1e293b; border-top: 1px solid #334155; padding: 16px; display: flex; justify-content: center; align-items: center; gap: 20px; position: relative;">
                
                <div style="position: absolute; left: 20px; display: flex; gap: 10px; align-items: center; color: #cbd5e1; font-size: 14px;">
                    <span title="Dùng con lăn chuột hoặc bấm nút để phóng to/thu nhỏ, kéo chuột để xem các góc ảnh">🔍 Pan & Zoom:</span>
                    <button type="button" class="btn-action-sm" onclick="zoomBatchImage(-0.2)" style="background: #334155; color: white; border: none; padding: 4px 10px;">-</button>
                    <span id="batchZoomBadge" style="width: 45px; text-align: center; cursor: pointer;" onclick="resetBatchZoom()" title="Bấm để đặt lại 100%">100%</span>
                    <button type="button" class="btn-action-sm" onclick="zoomBatchImage(0.2)" style="background: #334155; color: white; border: none; padding: 4px 10px;">+</button>
                </div>

                <button type="button" class="btn btn-primary" onclick="confirmExportBatchFromPreview()" style="font-size: 16px; padding: 10px 30px;">
                    📥 Xác nhận Xuất Excel chuẩn
                </button>
            </div>`;

html = html.replace(oldFooterHtml, newFooterHtml);

// 3. Add JS logic
const jsLogic = `
        // === PAN VÀ ZOOM CHO BATCH PREVIEW MODAL ===
        let batchImgScale = 1;
        let batchImgPanX = 0;
        let batchImgPanY = 0;
        let isBatchPanning = false;
        let batchStartX = 0;
        let batchStartY = 0;

        function applyBatchImageTransform(isInstant = false) {
            const img = document.getElementById("previewBatchImage");
            const badge = document.getElementById("batchZoomBadge");
            if (!img) return;
            
            img.style.transition = isInstant ? "none" : "transform 0.2s ease-out";
            img.style.transform = \`translate(\${batchImgPanX}px, \${batchImgPanY}px) scale(\${batchImgScale})\`;
            
            if (badge) {
                badge.textContent = Math.round(batchImgScale * 100) + "%";
            }
        }

        function zoomBatchImage(delta) {
            batchImgScale = Math.min(4, Math.max(0.3, Math.round((batchImgScale + delta) * 100) / 100));
            applyBatchImageTransform();
        }

        function resetBatchZoom() {
            batchImgScale = 1;
            batchImgPanX = 0;
            batchImgPanY = 0;
            applyBatchImageTransform();
        }

        document.addEventListener("DOMContentLoaded", function() {
            const container = document.getElementById("previewBatchContainer");
            if (!container) return;

            // Phóng to thu nhỏ bằng con lăn chuột
            container.addEventListener("wheel", function(e) {
                e.preventDefault();
                const delta = e.deltaY < 0 ? 0.15 : -0.15;
                zoomBatchImage(delta);
            }, { passive: false });

            // Bắt đầu kéo (Pan)
            container.addEventListener("mousedown", function(e) {
                if (e.button !== 0) return; // Chỉ chuột trái
                isBatchPanning = true;
                batchStartX = e.clientX - batchImgPanX;
                batchStartY = e.clientY - batchImgPanY;
                container.style.cursor = "grabbing";
            });

            // Đang kéo
            window.addEventListener("mousemove", function(e) {
                if (!isBatchPanning) return;
                e.preventDefault();
                batchImgPanX = e.clientX - batchStartX;
                batchImgPanY = e.clientY - batchStartY;
                applyBatchImageTransform(true); // không dùng transition khi đang kéo
            });

            // Kết thúc kéo
            window.addEventListener("mouseup", function() {
                if (isBatchPanning) {
                    isBatchPanning = false;
                    const c = document.getElementById("previewBatchContainer");
                    if (c) c.style.cursor = "grab";
                    applyBatchImageTransform(false); // bật lại transition
                }
            });
        });
        // ==========================================

        let previewBatchImages = [];
`;

// Insert the js logic right before `let previewBatchImages = [];`
html = html.replace("let previewBatchImages = [];", jsLogic);

// Wait, we need to make sure that when a new image is loaded (prev/next), the zoom is reset
const updateFnCode = `function updatePreviewBatchUI() {
            const data = previewBatchImages[previewBatchIndex];`;
            
const newUpdateFnCode = `function updatePreviewBatchUI() {
            resetBatchZoom();
            const data = previewBatchImages[previewBatchIndex];`;

html = html.replace(updateFnCode, newUpdateFnCode);

fs.writeFileSync('templates/index.html', html, 'utf8');

