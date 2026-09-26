const fs = require('fs');
let html = fs.readFileSync('templates/index.html', 'utf8');

const updateFnRegex = /function updateSelectedHistoryCount\(\) \{[\s\S]*?btnDelete\.disabled = \(count === 0\);\s*\}/;

const newUpdateFn = `function updateSelectedHistoryCount() {
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

html = html.replace(updateFnRegex, newUpdateFn);
fs.writeFileSync('templates/index.html', html, 'utf8');

