const http = require('https');
http.get('https://ocr-r2-worker.ocr-r2-worker.workers.dev/api/r2/files?type=all&limit=1000', (resp) => {
  let data = '';
  resp.on('data', (chunk) => { data += chunk; });
  resp.on('end', () => {
    const json = JSON.parse(data);
    const types = {};
    if (json.files) {
        json.files.forEach(f => {
            types[f.file_type] = (types[f.file_type] || 0) + 1;
        });
    }
    console.log(types);
    const images = json.files ? json.files.filter(f => f.file_type === 'image') : [];
    console.log("Images count:", images.length);
    console.log("First 5 images:", images.slice(0, 5).map(f => f.key));
  });
});

