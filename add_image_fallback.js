const fs = require('fs');
let html = fs.readFileSync('templates/index.html', 'utf8');

// Add fallback to previewBatchImage
html = html.replace(
    `img id="previewBatchImage" src=""`,
    `img id="previewBatchImage" src="" onerror="this.onerror=null; this.src='data:image/svg+xml;utf8,<svg xmlns=\\'http://www.w3.org/2000/svg\\' width=\\'400\\' height=\\'300\\' viewBox=\\'0 0 400 300\\'><rect width=\\'400\\' height=\\'300\\' fill=\\'%230f172a\\'/><text x=\\'50%\\' y=\\'50%\\' font-family=\\'Arial\\' font-size=\\'16\\' fill=\\'%2364748b\\' text-anchor=\\'middle\\' dy=\\'.3em\\'>Ảnh không tồn tại hoặc đã bị xóa khỏi R2</text></svg>';"`
);

// Add fallback to lightboxImage
html = html.replace(
    `img id="lightboxImage" src=""`,
    `img id="lightboxImage" src="" onerror="this.onerror=null; this.src='data:image/svg+xml;utf8,<svg xmlns=\\'http://www.w3.org/2000/svg\\' width=\\'400\\' height=\\'300\\' viewBox=\\'0 0 400 300\\'><rect width=\\'400\\' height=\\'300\\' fill=\\'%230f172a\\'/><text x=\\'50%\\' y=\\'50%\\' font-family=\\'Arial\\' font-size=\\'16\\' fill=\\'%2364748b\\' text-anchor=\\'middle\\' dy=\\'.3em\\'>Ảnh không tồn tại hoặc đã bị xóa khỏi R2</text></svg>';"`
);

// Add fallback to previewImage
html = html.replace(
    `img id="previewImage" src=""`,
    `img id="previewImage" src="" onerror="this.onerror=null; this.src='data:image/svg+xml;utf8,<svg xmlns=\\'http://www.w3.org/2000/svg\\' width=\\'400\\' height=\\'300\\' viewBox=\\'0 0 400 300\\'><rect width=\\'400\\' height=\\'300\\' fill=\\'%23f1f5f9\\'/><text x=\\'50%\\' y=\\'50%\\' font-family=\\'Arial\\' font-size=\\'16\\' fill=\\'%2394a3b8\\' text-anchor=\\'middle\\' dy=\\'.3em\\'>Ảnh bị thiếu hoặc đã xóa</text></svg>';"`
);

// Add fallback to thumb-mini (in JS render)
html = html.replace(
    `class="thumb-mini" alt="Ảnh phiếu"`,
    `class="thumb-mini" alt="Ảnh phiếu" onerror="this.onerror=null; this.src='data:image/svg+xml;utf8,<svg xmlns=\\'http://www.w3.org/2000/svg\\' width=\\'40\\' height=\\'40\\' viewBox=\\'0 0 40 40\\'><rect width=\\'40\\' height=\\'40\\' fill=\\'%23f1f5f9\\'/><text x=\\'50%\\' y=\\'50%\\' font-family=\\'Arial\\' font-size=\\'10\\' fill=\\'%2394a3b8\\' text-anchor=\\'middle\\' dy=\\'.3em\\'>Lỗi</text></svg>';"`
);

fs.writeFileSync('templates/index.html', html, 'utf8');

