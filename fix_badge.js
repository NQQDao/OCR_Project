const fs = require('fs');
let html = fs.readFileSync('templates/index.html', 'utf8');

const regex = /function updateSelectedHistoryCount\(\) \{[\s\S]*?if \(btn\) btn\.disabled = \(count === 0\);\s*\}/;

const replacement = `function updateSelectedHistoryCount() {
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

if (regex.test(html)) {
    html = html.replace(regex, replacement);
    fs.writeFileSync('templates/index.html', html, 'utf8');
} else {
    console.error("Not found!");
}

