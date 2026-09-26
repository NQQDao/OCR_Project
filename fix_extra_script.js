const fs = require('fs');
let html = fs.readFileSync('templates/index.html', 'utf8');

// The file currently has:
// </script>
//     let previewBatchImages = [];
//     ...
// </script>

// I will replace `</script>\s*let previewBatchImages` with `let previewBatchImages`
html = html.replace(/<\/script>\s*let previewBatchImages/, 'let previewBatchImages');

fs.writeFileSync('templates/index.html', html, 'utf8');

