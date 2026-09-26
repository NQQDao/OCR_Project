const fs = require('fs');
let html = fs.readFileSync('templates/index.html', 'utf8');

// I need to add back the missing start of deleteSelectedHistory()
// Where is it? It's right before `setStatus(\`⏳ Đang xóa \${docIds.length} phiếu...\`);`

const missingCode = `
        async function deleteSelectedHistory() {
            const checkedBoxes = Array.from(document.querySelectorAll(".history-select-item:checked"));
            if (!checkedBoxes.length) return;

            const docIds = checkedBoxes.map(cb => cb.dataset.id).filter(Boolean);
            
            if (!confirm(\`⚠️ Bạn có chắc chắn muốn xóa vĩnh viễn \${docIds.length} phiếu đã chọn khỏi Database D1?\\n\\nHành động này không thể hoàn tác!\`)) {
                return;
            }

            setStatus`;

html = html.replace(/setStatus\(`⏳ Đang xóa \$\{docIds\.length\} phiếu\.\.\.`\);/g, missingCode + '(`⏳ Đang xóa ${docIds.length} phiếu...`);');

// Let's also check if there are extra `</script>` tags from my previous script injections
html = html.replace(/<\/script>\s*<\/script>/g, '</script>');

fs.writeFileSync('templates/index.html', html, 'utf8');

