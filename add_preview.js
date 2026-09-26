const fs = require('fs');
let html = fs.readFileSync('templates/index.html', 'utf8');

const targetStr = `<a class="btn-action-sm" href="\${escapeHtml(f.public_url)}" target="_blank" download style="background: #ecfdf5; color: #047857; border-color: #a7f3d0;" title="Tải trực tiếp file Excel từ Cloudflare R2">
                            <span>📥 Tải Excel</span>
                        </a>`;

const replacement = `<a class="btn-action-sm" href="https://view.officeapps.live.com/op/view.aspx?src=\${encodeURIComponent(f.public_url)}" target="_blank" style="background: #eff6ff; color: #1d4ed8; border-color: #bfdbfe; margin-right: 4px;" title="Xem trước file Excel trực tiếp trên trình duyệt">
                            <span>👁️ Xem trước</span>
                        </a>
                        <a class="btn-action-sm" href="\${escapeHtml(f.public_url)}" target="_blank" download style="background: #ecfdf5; color: #047857; border-color: #a7f3d0;" title="Tải trực tiếp file Excel từ Cloudflare R2">
                            <span>📥 Tải Excel</span>
                        </a>`;

if (html.includes(targetStr)) {
    html = html.replace(targetStr, replacement);
    fs.writeFileSync('templates/index.html', html, 'utf8');
    console.log("Success exact match");
} else {
    console.log("Not exactly found, using regex");
    // Fallback if formatting was slightly different
    const regex = /<a class="btn-action-sm" href="\$\{escapeHtml\(f\.public_url\)\}" target="_blank" download style="[^"]*" title="[^"]*">\s*<span>.*?Tải Excel<\/span>\s*<\/a>/;
    html = html.replace(regex, `<a class="btn-action-sm" href="https://view.officeapps.live.com/op/view.aspx?src=\${encodeURIComponent(f.public_url)}" target="_blank" style="background: #eff6ff; color: #1d4ed8; border-color: #bfdbfe; margin-right: 4px;" title="Xem trước file Excel trực tiếp trên trình duyệt">
                            <span>👁️ Xem trước</span>
                        </a>
                        $&`);
    fs.writeFileSync('templates/index.html', html, 'utf8');
}

