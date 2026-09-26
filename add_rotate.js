const fs = require('fs');
let html = fs.readFileSync('templates/index.html', 'utf8');

// 1. Add rotate button to HTML UI
const oldUI = `<button type="button" class="btn-action-sm" onclick="zoomBatchImage(0.2)" style="background: #334155; color: white; border: none; padding: 4px 10px;">+</button>
                </div>`;

const newUI = `<button type="button" class="btn-action-sm" onclick="zoomBatchImage(0.2)" style="background: #334155; color: white; border: none; padding: 4px 10px;">+</button>
                    <button type="button" class="btn-action-sm" onclick="rotateBatchImage()" style="background: #334155; color: white; border: none; padding: 4px 10px; margin-left: 10px;" title="Xoay ảnh 90 độ">↻ Xoay</button>
                </div>`;

if (html.includes(oldUI)) {
    html = html.replace(oldUI, newUI);
} else {
    console.error("Could not find UI to replace!");
}


// 2. Add batchImgRotation and modify applyBatchImageTransform
const oldLogic1 = `        let batchImgScale = 1;
        let batchImgPanX = 0;
        let batchImgPanY = 0;
        let isBatchPanning = false;`;

const newLogic1 = `        let batchImgScale = 1;
        let batchImgPanX = 0;
        let batchImgPanY = 0;
        let batchImgRotation = 0;
        let isBatchPanning = false;`;

if (html.includes(oldLogic1)) {
    html = html.replace(oldLogic1, newLogic1);
} else {
    console.error("Could not find logic 1!");
}

const oldLogic2 = `img.style.transform = \`translate(\${batchImgPanX}px, \${batchImgPanY}px) scale(\${batchImgScale})\`;`;
const newLogic2 = `img.style.transform = \`translate(\${batchImgPanX}px, \${batchImgPanY}px) scale(\${batchImgScale}) rotate(\${batchImgRotation}deg)\`;`;

if (html.includes(oldLogic2)) {
    html = html.replace(oldLogic2, newLogic2);
} else {
    console.error("Could not find logic 2!");
}

const oldLogic3 = `        function resetBatchZoom() {
            batchImgScale = 1;
            batchImgPanX = 0;
            batchImgPanY = 0;
            applyBatchImageTransform();
        }`;

const newLogic3 = `        function rotateBatchImage() {
            batchImgRotation = (batchImgRotation + 90) % 360;
            applyBatchImageTransform(false);
        }

        function resetBatchZoom() {
            batchImgScale = 1;
            batchImgPanX = 0;
            batchImgPanY = 0;
            batchImgRotation = 0;
            applyBatchImageTransform();
        }`;

if (html.includes(oldLogic3)) {
    html = html.replace(oldLogic3, newLogic3);
} else {
    console.error("Could not find logic 3!");
}

fs.writeFileSync('templates/index.html', html, 'utf8');

