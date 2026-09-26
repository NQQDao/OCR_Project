const fs = require('fs');
let html = fs.readFileSync('templates/index.html', 'utf8');

// Replace the <a> tag for preview with a <button> that opens the modal
const aTagRegex = /<a class="btn-action-sm" href="https:\/\/view\.officeapps\.live\.com\/op\/view\.aspx\?src=\$\{encodeURIComponent\(f\.public_url\)\}" target="_blank" style="background: #eff6ff; color: #1d4ed8; border-color: #bfdbfe; margin-right: 4px;" title="Xem trước file Excel trực tiếp trên trình duyệt">\s*<span>👁️ Xem trước<\/span>\s*<\/a>/;

html = html.replace(aTagRegex, `<button type="button" class="btn-action-sm" onclick="openExcelPreviewModal('\${escapeHtml(f.public_url)}')" style="background: #eff6ff; color: #1d4ed8; border-color: #bfdbfe; margin-right: 4px;" title="Xem trước file Excel trực tiếp trên trình duyệt">
                            <span>👁️ Xem trước</span>
                        </button>`);

// Add modal HTML
const modalHtml = `
    <!-- MODAL XEM TRƯỚC EXCEL -->
    <div id="excelPreviewModal" class="modal-backdrop" onclick="if(event.target===this) closeExcelPreviewModal()" style="z-index: 10000; display: none;">
        <div class="modal-card" style="max-width: 95vw; width: 1400px; height: 90vh;">
            <div class="modal-header">
                <div class="modal-title">
                    <span>👁️</span>
                    <span>XEM TRƯỚC FILE EXCEL TỪ CLOUDFLARE R2</span>
                </div>
                <button type="button" class="modal-close" onclick="closeExcelPreviewModal()" title="Đóng">✕</button>
            </div>
            <div class="modal-body" style="padding: 0; display: flex; flex-direction: column; overflow: hidden;">
                <iframe id="excelPreviewIframe" src="" style="width: 100%; height: 100%; border: none; flex-grow: 1;"></iframe>
            </div>
        </div>
    </div>
</body>
`;
html = html.replace('</body>', modalHtml);

// Add JS
const jsCode = `
        function openExcelPreviewModal(url) {
            const previewUrl = \`https://view.officeapps.live.com/op/embed.aspx?src=\${encodeURIComponent(url)}\`;
            document.getElementById("excelPreviewIframe").src = previewUrl;
            document.getElementById("excelPreviewModal").style.display = "flex";
            document.body.style.overflow = "hidden";
        }

        function closeExcelPreviewModal() {
            document.getElementById("excelPreviewModal").style.display = "none";
            document.getElementById("excelPreviewIframe").src = "";
            document.body.style.overflow = "";
        }
        
        // Add ESC key support for this modal too
        document.addEventListener("keydown", function (e) {
            if (e.key === "Escape") {
                const excelModal = document.getElementById("excelPreviewModal");
                if (excelModal && excelModal.style.display !== "none") {
                    closeExcelPreviewModal();
                }
            }
        });
    </script>
`;
html = html.replace('</script>', jsCode + '</script>');

fs.writeFileSync('templates/index.html', html, 'utf8');

