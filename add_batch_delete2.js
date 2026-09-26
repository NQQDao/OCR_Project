const fs = require('fs');
let html = fs.readFileSync('templates/index.html', 'utf8');

// 1. Add data-id to checkbox
html = html.replace(
    /value="\$\{escapeHtml\(doc\.file_name\)\}" onchange="updateSelectedHistoryCount\(\)"/g,
    `value="\${escapeHtml(doc.file_name)}" data-id="\${doc.id}" onchange="updateSelectedHistoryCount()"`
);

// 2. Add Delete button next to Export button
html = html.replace(
    /<button type="button" class="btn btn-info" id="btnExportBatchHistory"/g,
    `<button type="button" class="btn btn-danger" id="btnDeleteBatchHistory" onclick="deleteSelectedHistory()" style="margin-right: 8px;" disabled>🗑️ Xóa đã chọn (<span id="selectedCountBadgeDelete">0</span>)</button>\n                                    <button type="button" class="btn btn-info" id="btnExportBatchHistory"`
);

// 3. Update updateSelectedHistoryCount
html = html.replace(
    /function updateSelectedHistoryCount\(\) \{[\s\S]*?if \(btn\) btn\.disabled = \(count === 0\);\n\s*\}/g,
    `function updateSelectedHistoryCount() {
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
        }`
);

// 4. Add deleteSelectedHistory function
const deleteFunc = `
        async function deleteSelectedHistory() {
            const checkedBoxes = Array.from(document.querySelectorAll(".history-select-item:checked"));
            if (!checkedBoxes.length) return;

            const docIds = checkedBoxes.map(cb => cb.dataset.id).filter(Boolean);
            
            if (!confirm(\`⚠️ Bạn có chắc chắn muốn xóa vĩnh viễn \${docIds.length} phiếu đã chọn khỏi Database D1?\\n\\nHành động này không thể hoàn tác!\`)) {
                return;
            }

            setStatus(\`⏳ Đang xóa \${docIds.length} phiếu...\`);
            let successCount = 0;
            let errorCount = 0;

            for (let i = 0; i < docIds.length; i++) {
                const docId = docIds[i];
                try {
                    const res = await fetch(\`/api/documents/\${docId}\`, { method: "DELETE" });
                    if (res.ok) {
                        successCount++;
                    } else {
                        errorCount++;
                    }
                } catch (err) {
                    errorCount++;
                }
            }

            if (errorCount > 0) {
                alert(\`❌ Xóa xong. Thành công: \${successCount}, Lỗi: \${errorCount}\`);
                setStatus(\`❌ Lỗi khi xóa \${errorCount} phiếu\`);
            } else {
                setStatus(\`✅ Đã xóa \${successCount} phiếu thành công\`);
            }

            await loadHistoryDocuments(document.getElementById("historySearchInput").value.trim());
        }

`;
if (!html.includes('async function deleteSelectedHistory')) {
    html = html.replace(`async function exportSelectedHistoryExcel() {`, deleteFunc + `async function exportSelectedHistoryExcel() {`);
}

fs.writeFileSync('templates/index.html', html, 'utf8');

