const fs = require('fs');
const https = require('https');
const FormData = require('form-data');

// Create a dummy image (just a tiny valid JPEG or just some bytes)
const dummyJpg = Buffer.from('ffd8ffe000104a46494600010101006000600000ffdb004300080606070605080707070909080a0c140d0c0b0b0c1912130f141d1a1f1e1d1a1c1c20242e2720222c231c1c2837292c30313434341f27393d38323c2e333432ffdb0043010909090c0b0c180d0d1832211c213232323232323232323232323232323232323232323232323232323232323232323232323232323232323232323232323232ffc00011080001000103012200021101031101ffc4001f0000010501010101010100000000000000000102030405060708090a0bffc400b5100002010303020403050504040000017d01020300041105122131410613516107227114328191a1082342b1c11552d1f02433627282090a161718191a25262728292a3435363738393a434445464748494a535455565758595a636465666768696a737475767778797a838485868788898a92939495969798999aa2a3a4a5a6a7a8a9aab2b3b4b5b6b7b8b9bac2c3c4c5c6c7c8c9cad2d3d4d5d6d7d8d9dae1e2e3e4e5e6e7e8e9eaf1f2f3f4f5f6f7f8f9faffc40014010100000000000000000000000000000000ffc40020110100000000000000000000000000000000ffda000c03010002110311003f00f27f00fffdd9', 'hex');

const form = new FormData();
form.append('files', dummyJpg, {
  filename: 'dummy_test.jpg',
  contentType: 'image/jpeg'
});

const req = https.request('https://ocr-r2-worker.ocr-r2-worker.workers.dev/api/ocr?mode=fast', {
  method: 'POST',
  headers: form.getHeaders()
}, (res) => {
  let data = '';
  res.on('data', c => data += c);
  res.on('end', () => {
    console.log("OCR Response:", data);
    
    // Now verify if it's in R2
    https.get('https://ocr-r2-worker.ocr-r2-worker.workers.dev/api/r2/files?type=image', (r2Res) => {
        let r2Data = '';
        r2Res.on('data', c => r2Data += c);
        r2Res.on('end', () => {
            console.log("R2 Image Files:", r2Data);
        });
    });
  });
});

form.pipe(req);

