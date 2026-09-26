
        let currentJsonFile = null;
        let currentData = null;
        let currentImageUrl = "";
        let imageScale = 1;
        let imageRotation = 0;
        let imagePanX = 0;
        let imagePanY = 0;
        let isImagePanning = false;
        let panStartX = 0;
        let panStartY = 0;
        let isMagnifierActive = false;

        let lightboxScale = 1;
        let lightboxRotation = 0;
        let lightboxPanX = 0;
        let lightboxPanY = 0;
        let isLightboxPanning = false;
        let lightboxStartX = 0;
        let lightboxStartY = 0;
        function escapeHtml(value) {
            if (value === null || value === undefined) {
                return "";
            }

            return String(value)
                .replace(/&/g, "&amp;")
                .replace(/</g, "&lt;")
                .replace(/>/g, "&gt;")
                .replace(/"/g, "&quot;")
                .replace(/'/g, "&#039;");
        }
        function setStatus(text, type = "") {
            const el = document.getElementById("status");
            if (!el) return;
            el.textContent = text;
            el.className = "status" + (type ? ` ${type}` : "");
        }
        let ocrResults = [];
        let selectedImageIndex = 0;
        let selectedImageFiles = [];

        function renderImageGallery(files) {

            const gallery = document.getElementById("imageGallery");

            gallery.innerHTML = "";

            selectedImageFiles = Array.from(files);

            selectedImageFiles.forEach((file, index) => {

                const wrapper = document.createElement("div");
                wrapper.className = "image-thumb-wrapper";

                const url = URL.createObjectURL(file);

                const img = document.createElement("img");

                img.src = url;
                img.className = "image-thumb";

                if (index === selectedImageIndex) {
                    img.classList.add("active");
                }

                img.title = file.name;

                const status = document.createElement("div");

                status.className = "image-status";
                status.textContent = "○";
                status.dataset.index = index;

                img.addEventListener("click", async function () {

                    // Ảnh đang chọn
                    selectedImageIndex = index;

                    document.querySelectorAll(".image-thumb")
                        .forEach(el => el.classList.remove("active"));

                    img.classList.add("active");

                    // Hiển thị ảnh
                    showImage(selectedImageFiles[index]);

                    // Lấy kết quả OCR tương ứng
                    const result = ocrResults[index];

                    // Nếu ảnh chưa OCR thành công
                    if (
                        !result ||
                        result.status !== "success" ||
                        !result.json_file
                    ) {
                        setStatus(`● Đang xem: ${file.name}`);
                        return;
                    }

                    // Đọc JSON tương ứng
                    try {

                        currentJsonFile = result.json_file;

                        setStatus(
                            `⏳ Đang tải dữ liệu: ${file.name}`
                        );

                        await loadJSON(currentJsonFile);

                        setStatus(
                            `✓ Đang xem: ${file.name}`
                        );

                    } catch (error) {

                        console.error(error);

                        setStatus(
                            `⚠ Không đọc được dữ liệu: ${file.name}`
                        );

                        alert(
                            `Không đọc được JSON của ảnh:\n${file.name}`
                        );
                    }
                });

                wrapper.appendChild(img);
                wrapper.appendChild(status);

                gallery.appendChild(wrapper);
            });
        }
        function showImage(file) {
            if (!file) return;
            if (typeof file === "string") {
                currentImageUrl = file;
            } else {
                currentImageUrl = URL.createObjectURL(file);
            }
            imageScale = 1;
            imageRotation = 0;
            imagePanX = 0;
            imagePanY = 0;

            const container = document.getElementById("imageContainer");
            if (container) {
                container.classList.add("has-image");
                container.innerHTML = `
                    <div class="preview-image-stage" id="previewImageStage">
                        <img src="${currentImageUrl}" class="preview-image" id="previewImage" alt="Ảnh phiếu" title="Click đúp để mở toàn màn hình" ondblclick="openFullscreenModal()">
                    </div>
                `;
            }

            const slider = document.getElementById("zoomSlider");
            if (slider) slider.value = 100;
            const badge = document.getElementById("zoomPercentBadge");
            if (badge) badge.textContent = "100%";

            const magnifier = document.getElementById("imageMagnifier");
            if (magnifier) {
                magnifier.style.display = "none";
            }

            applyImageTransform();
        }

        function onSliderZoom(val) {
            const num = parseFloat(val);
            if (isNaN(num)) return;
            imageScale = Math.min(3, Math.max(0.4, num / 100));
            applyImageTransform();
        }

        function zoomStep(delta) {
            const img = document.getElementById("previewImage");
            if (!img) return;
            imageScale = Math.min(3, Math.max(0.4, Math.round((imageScale + delta) * 100) / 100));
            applyImageTransform();
        }

        function zoomImage(factor) {
            const img = document.getElementById("previewImage");
            if (!img) return;
            imageScale = Math.min(3, Math.max(0.4, Math.round((imageScale * factor) * 100) / 100));
            applyImageTransform();
        }

        function rotateImage() {
            const img = document.getElementById("previewImage");
            if (!img) return;
            imageRotation = (imageRotation + 90) % 360;
            applyImageTransform();
        }

        function resetImageView() {
            const img = document.getElementById("previewImage");
            if (!img) return;
            imageScale = 1;
            imageRotation = 0;
            imagePanX = 0;
            imagePanY = 0;
            applyImageTransform();
        }

        function applyImageTransform(isInstant = false) {
            const stage = document.getElementById("previewImageStage");
            if (stage) {
                stage.classList.toggle("panning", isInstant);
                stage.style.transform = `translate(${imagePanX}px, ${imagePanY}px) scale(${imageScale}) rotate(${imageRotation}deg)`;
            }
            const badge = document.getElementById("zoomPercentBadge");
            if (badge) {
                badge.textContent = Math.round(imageScale * 100) + "%";
            }
            const slider = document.getElementById("zoomSlider");
            if (slider) {
                slider.value = Math.round(imageScale * 100);
            }
        }

        async function runFastPassFilter() {
            if (!selectedImageFiles || selectedImageFiles.length === 0) {
                const input = document.getElementById("imageInput");
                if (input.files.length > 0) {
                   selectedImageFiles = Array.from(input.files);
                } else {
                   alert("Hãy chọn ảnh trước.");
                   return;
                }
            }

            const button = document.getElementById("fastPassButton");
            const ocrBtn = document.getElementById("ocrButton");
            button.disabled = true;
            ocrBtn.disabled = true;
            button.style.opacity = ".65";
            
            document.querySelectorAll(".image-status").forEach(status => {
                status.textContent = "⏳";
                status.className = "image-status processing";
            });

            const total = selectedImageFiles.length;
            setStatus(`⏳ Đang quét nhanh (Lọc trùng): 0/${total} ảnh...`, "processing");
            
            const fastResults = [];

            for (let i = 0; i < total; i++) {
                const file = selectedImageFiles[i];
                const currentStatusBadge = document.querySelector(`.image-status[data-index="${i}"]`);
                if (currentStatusBadge) {
                    currentStatusBadge.textContent = "⚡";
                    currentStatusBadge.style.background = "var(--warning)";
                }
                
                const viewerTitle = document.getElementById("currentViewerTitle");
                if (viewerTitle) viewerTitle.innerHTML = `Đang quét nhanh: <strong>${i + 1}</strong> (${file.name})`;
                showImage(file);
                
                const formData = new FormData();
                formData.append("files", file);
                
                try {
                    const response = await fetch("/api/ocr?mode=fast", { method: "POST", body: formData });
                    const result = await response.json();
                    if (!response.ok) throw new Error("API failed");
                    
                    const resData = Array.isArray(result.results) ? result.results[0] : (Array.isArray(result) ? result[0] : result);
                    const fastJson = typeof resData.raw_json === "string" ? JSON.parse(resData.raw_json) : resData.raw_json;
                    
                    fastResults.push({
                        file: file,
                        so_xe: fastJson.so_xe ? fastJson.so_xe.replace(/\s+/g, "").toUpperCase() : "",
                        so_dong: parseInt(fastJson.so_dong) || 0,
                        originalName: file.name
                    });
                    
                    if (currentStatusBadge) {
                        currentStatusBadge.textContent = "✔️";
                        currentStatusBadge.style.background = "";
                    }
                } catch (err) {
                    fastResults.push({ file: file, so_xe: "", so_dong: 0, originalName: file.name });
                    if (currentStatusBadge) {
                        currentStatusBadge.textContent = "⚠️";
                        currentStatusBadge.style.background = "";
                    }
                }
                setStatus(`⏳ Đang quét nhanh: ${i + 1}/${total} ảnh...`, "processing");
            }
            
            const groups = {};
            fastResults.forEach(item => {
                if (!item.so_xe) return; 
                if (!groups[item.so_xe]) groups[item.so_xe] = [];
                groups[item.so_xe].push(item);
            });
            
            const filesToKeep = new Set();
            
            fastResults.forEach(item => {
                if (!item.so_xe) filesToKeep.add(item.file);
            });
            
            for (const so_xe in groups) {
                const group = groups[so_xe];
                let maxDong = -1;
                let bestItem = null;
                for (const item of group) {
                    if (item.so_dong > maxDong) {
                        maxDong = item.so_dong;
                        bestItem = item;
                    }
                }
                if (bestItem) filesToKeep.add(bestItem.file);
            }
            
            const newSelectedFiles = [];
            let removedCount = 0;
            fastResults.forEach(item => {
                if (filesToKeep.has(item.file)) {
                    newSelectedFiles.push(item.file);
                } else {
                    removedCount++;
                }
            });
            
            selectedImageFiles = newSelectedFiles;
            renderImageGallery(selectedImageFiles);
            if (selectedImageFiles.length > 0) showImage(selectedImageFiles[0]);
            
            button.disabled = false;
            ocrBtn.disabled = false;
            button.style.opacity = "1";
            
            setStatus(`✅ Quét nhanh hoàn tất! Đã tự động loại bỏ ${removedCount} ảnh trùng lặp.`, "success");
            if (removedCount > 0) {
               alert(`Đã hoàn tất quét nhanh!\nGiữ lại: ${newSelectedFiles.length} ảnh\nLoại bỏ: ${removedCount} ảnh trùng lặp (chỉ lấy ảnh có nhiều dòng nhất).`);
            }
        }
        async function runOCR() {
            const input = document.getElementById("imageInput");
            const button = document.getElementById("ocrButton");

            if (!selectedImageFiles || selectedImageFiles.length === 0) {
                if (input.files.length > 0) {
                    selectedImageFiles = Array.from(input.files);
                } else {
                    alert("Hãy chọn ảnh trước.");
                    return;
                }
            }

            const files = selectedImageFiles;
            ocrResults = [];

            renderImageGallery(files);
            showImage(files[0]);

            button.disabled = true;
            button.style.opacity = ".65";

            document.querySelectorAll(".image-status").forEach(status => {
                status.textContent = "⏳";
                status.className = "image-status processing";
            });

            const total = files.length;
            let success = 0;
            let errors = 0;

            setStatus(`⏳ Đang OCR: 0/${total} ảnh...`, "processing");

            for (let i = 0; i < total; i++) {
                const file = files[i];
                
                // Cập nhật trạng thái đang chạy cho ảnh hiện tại
                const currentStatusBadge = document.querySelector(`.image-status[data-index="${i}"]`);
                if (currentStatusBadge) {
                    currentStatusBadge.textContent = "⚙️";
                    currentStatusBadge.style.background = "var(--primary)";
                }

                // Cập nhật thanh tiêu đề file đang xem
                const viewerTitle = document.getElementById("currentViewerTitle");
                if (viewerTitle) viewerTitle.innerHTML = `Đang xử lý: <strong>${i + 1}</strong> (${file.name})`;
                
                const formData = new FormData();
                formData.append("files", file);
                
                try {
                    const response = await fetch("/api/ocr", { method: "POST", body: formData });
                    const result = await response.json();
                    
                    if (!response.ok) {
                        throw new Error(result.detail || result.error || "OCR thất bại");
                    }
                    
                    const resData = Array.isArray(result.results) ? result.results[0] : (Array.isArray(result) ? result[0] : result);
                    ocrResults.push(resData);
                    
                    if (resData.status === "success") {
                        success++;
                        if (currentStatusBadge) {
                            currentStatusBadge.textContent = "✅";
                            currentStatusBadge.className = "image-status ok";
                            currentStatusBadge.style.background = "";
                        }
                        
                        // Tự động load JSON của ảnh thành công đầu tiên
                        if (success === 1) {
                            currentJsonFile = resData.json_file;
                            selectedImageIndex = i;
                            showImage(files[i]);
                            await loadJSON(currentJsonFile);
                        }
                    } else {
                        errors++;
                        if (currentStatusBadge) {
                            currentStatusBadge.textContent = "❌";
                            currentStatusBadge.className = "image-status error";
                            currentStatusBadge.style.background = "";
                        }
                    }
                } catch (err) {
                    console.error("Lỗi OCR file", file.name, err);
                    errors++;
                    ocrResults.push({ file: file.name, status: "error", error: err.message });
                    if (currentStatusBadge) {
                        currentStatusBadge.textContent = "❌";
                        currentStatusBadge.className = "image-status error";
                        currentStatusBadge.style.background = "";
                    }
                }
                
                // Cập nhật thanh status bar
                setStatus(`⏳ Đang OCR: ${i + 1}/${total} ảnh (Thành công: ${success}, Lỗi: ${errors})...`, "processing");
            }

            button.disabled = false;
            button.style.opacity = "1";
            
            if (success > 0) {
                setStatus(`✅ Đã hoàn tất OCR! Trạng thái: ${success}/${total} ảnh thành công.`, "success");
            } else {
                setStatus(`❌ OCR thất bại toàn bộ ${total} ảnh.`, "error");
            }

            if (errors > 0) {
                const errorList = ocrResults.filter(item => item.status === "error").map(item => item.file + ": " + item.error).join("\n");
                alert(`Quá trình OCR hoàn tất nhưng có ${errors} ảnh bị lỗi:\n\n${errorList}`);
            }
        }

        async function loadJSON(filename) {
            const response = await fetch("/api/json/" + encodeURIComponent(filename));
            if (!response.ok) throw new Error("Không đọc được JSON");
            currentData = await response.json();
            renderData();
        }

        function renderData() {
            if (!currentData) return;
            const header = currentData.header || {};
            document.getElementById("so_xe").value = header.so_xe || "";
            document.getElementById("ngay_xe").value = header.ngay_xe || "";
            document.getElementById("kich_thuoc_go_tron").value = header.kich_thuoc_go_tron || "";
            document.getElementById("khoi_luong_go_tron").value = header.khoi_luong_go_tron || "";
            document.getElementById("kich_thuoc_xe").value = header.kich_thuoc_xe || "";

            const tbody = document.getElementById("itemsTable");
            tbody.innerHTML = "";
            const items = currentData.items || [];
            items.forEach((item, index) => {
                const tr = document.createElement("tr");
                tr.innerHTML = `
            <td>${item.dong ?? index + 1}</td>
            <td><input data-field="ngay" value="${escapeHtml(item.ngay || "")}"></td>
            <td><input data-field="kich_thuoc_so_luong" value="${escapeHtml(item.kich_thuoc_so_luong || "")}"></td>
            <td><input data-field="khoi_luong" value="${escapeHtml(item.khoi_luong || "")}"></td>
            <td><input data-field="cong_trinh" value="${escapeHtml(item.cong_trinh || "")}"></td>
            <td><input data-field="stt_cau_kien" value="${escapeHtml(item.stt_cau_kien || "")}"></td>
            <td><input data-field="ten_cau_kien" value="${escapeHtml(item.ten_cau_kien || "")}"></td>
            <td><input data-field="ghi_chu" value="${escapeHtml(item.ghi_chu || "")}"></td>
        `;
                tr.querySelectorAll("input").forEach(input => {
                    input.addEventListener("input", () => {
                        item[input.dataset.field] = input.value;
                        updateJSONFromForm();
                    });
                });
                tbody.appendChild(tr);
            });
            updateJSONFromForm();
            renderValidation();
        }

        function renderValidation() {
            const validation = currentData.validation || {};
            const lineVolume = validation.line_volume || [];
            const warnings = lineVolume.filter(x => x.trang_thai && x.trang_thai !== "OK");
            const box = document.getElementById("validation");
            if (warnings.length) {
                box.className = "validation warning-box";
                box.innerHTML = `⚠ Có <strong>${warnings.length}</strong> dòng cần kiểm tra khối lượng.`;
            } else {
                box.className = "validation success-box";
                box.innerHTML = `✓ Khối lượng các dòng đang khớp.`;
            }
        }

        function updateJSONFromForm() {

            if (!currentData) return;

            if (!currentData.header) {
                currentData.header = {};
            }

            currentData.header.so_xe =
                document.getElementById("so_xe").value;

            currentData.header.ngay_xe =
                document.getElementById("ngay_xe").value;

            currentData.header.kich_thuoc_go_tron =
                document.getElementById("kich_thuoc_go_tron").value;

            currentData.header.khoi_luong_go_tron =
                document.getElementById("khoi_luong_go_tron").value;

            currentData.header.kich_thuoc_xe =
                document.getElementById("kich_thuoc_xe").value;

            // Cập nhật JSON viewer
            document.getElementById("jsonViewer").value =
                JSON.stringify(currentData, null, 2);

            // Cập nhật cảnh báo
            renderValidation();
        }

        async function saveJSON() {
            if (!currentData || !currentJsonFile) {
                alert("Chưa có JSON.");
                return;
            }
            updateJSONFromForm();
            try {
                const response = await fetch("/api/json/" + encodeURIComponent(currentJsonFile), {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(currentData)
                });
                const result = await response.json();
                if (!response.ok) throw new Error(result.detail || "Không lưu được JSON");
                setStatus("✓ Đã lưu JSON & CSDL");
                fetch("/api/documents?limit=1")
                    .then(r => r.json())
                    .then(d => {
                        const b = document.getElementById("historyBadgeCount");
                        if (b && d.total !== undefined) b.textContent = d.total;
                    })
                    .catch(() => {});
            } catch (error) {
                alert(error.message);
            }
        }

        async function downloadExcelSingle() {
            if (!currentData || !currentJsonFile) {
                alert("Chưa có dữ liệu OCR nào để xuất Excel.");
                return;
            }

            setStatus(`⏳ Đang tải file Excel cho phiếu hiện tại...`);

            try {
                // Sử dụng API lấy Excel đơn đã có: GET /api/excel?json_file=...
                const url = `/api/excel?json_file=${encodeURIComponent(currentJsonFile)}`;
                
                const a = document.createElement("a");
                a.href = url;
                a.target = "_blank";
                document.body.appendChild(a);
                a.click();
                a.remove();
                
                setStatus(`✓ Đã xuất Excel thành công!`);
            } catch (error) {
                console.error("Lỗi xuất Excel:", error);
                setStatus("⚠ Lỗi xuất Excel");
                alert("❌ Lỗi xuất Excel:\n\n" + error.message);
            }
        }

        async function downloadExcelBatch() {

            // Lấy danh sách JSON từ kết quả OCR batch
            const jsonFiles = (ocrResults || [])
                .filter(item => item.status === "success" && item.json_file)
                .map(item => item.json_file);
            console.log("===== EXCEL BATCH =====");
            console.log("ocrResults:", ocrResults);
            console.log("Số JSON gửi lên:", jsonFiles.length);
            console.log("Danh sách JSON:", jsonFiles); 

            if (jsonFiles.length === 0) {
                alert("Chưa có JSON nào để xuất Excel.");
                return;
            }

            try {

                setStatus(`⏳ Đang tạo Excel từ ${jsonFiles.length} JSON...`);

                const response = await fetch("/api/excel/batch", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify({
                        json_files: jsonFiles
                    })
                });

                if (!response.ok) {

                    const errorData =
                        await response.json().catch(() => ({}));

                    throw new Error(
                        errorData.detail ||
                        "Không thể tạo Excel hàng loạt."
                    );
                }

                const blob = await response.blob();

                const url = window.URL.createObjectURL(blob);

                const a = document.createElement("a");

                a.href = url;
                a.download = "NHAT_KY_XE_GO_BATCH_v5.xlsx";

                document.body.appendChild(a);

                a.click();

                a.remove();

                window.URL.revokeObjectURL(url);

                setStatus(
                    `✓ Đã xuất Excel từ ${jsonFiles.length} JSON`
                );

                alert(
                    `✅ Đã xuất Excel hàng loạt thành công.\n\n` +
                    `Số JSON: ${jsonFiles.length}`
                );

            } catch (error) {

                console.error("Lỗi xuất Excel hàng loạt:", error);

                setStatus("⚠ Lỗi xuất Excel");

                alert(
                    "❌ Lỗi xuất Excel hàng loạt:\n\n" +
                    error.message
                );
            }
        }

        document.getElementById("imageInput").addEventListener("change", function () {

            if (!this.files.length) {
                return;
            }

            selectedImageIndex = 0;

            renderImageGallery(this.files);

            showImage(this.files[0]);

            setStatus(`● Đã chọn ${this.files.length} ảnh`);
        });

        ["so_xe", "ngay_xe", "kich_thuoc_go_tron", "khoi_luong_go_tron", "kich_thuoc_xe"].forEach(id => {
            document.getElementById(id).addEventListener("input", updateJSONFromForm);
        });

        const jsonViewer = document.getElementById("jsonViewer");
        jsonViewer.addEventListener("input", () => {
            try {
                currentData = JSON.parse(jsonViewer.value);
                renderData();
            } catch (_) {
                // Cho phép người dùng đang nhập JSON chưa hoàn chỉnh.
            }

        });
        // ===== BỘ ĐIỀU KHIỂN THU PHÓNG & KÍNH LÚP THÔNG MINH =====
        function toggleMagnifier() {
            isMagnifierActive = !isMagnifierActive;
            const btn = document.getElementById("magnifierToggleBtn");
            const magnifier = document.getElementById("imageMagnifier");
            const container = document.getElementById("imageContainer");
            if (btn) {
                btn.classList.toggle("active", isMagnifierActive);
            }
            if (container) {
                container.classList.toggle("magnifier-active", isMagnifierActive);
            }
            if (!isMagnifierActive && magnifier) {
                magnifier.style.display = "none";
            }
        }

        let imageInteractionsInitialized = false;

        function setupImageInteractions() {
            const container = document.getElementById("imageContainer");
            const magnifier = document.getElementById("imageMagnifier");
            if (!container) return;
            if (imageInteractionsInitialized) return;
            imageInteractionsInitialized = true;

            // 1. Phóng to / Thu nhỏ bằng con lăn chuột (Mouse Wheel)
            container.addEventListener("wheel", function (e) {
                const img = document.getElementById("previewImage");
                if (!img) return;
                e.preventDefault();
                const delta = e.deltaY < 0 ? 0.12 : -0.12;
                zoomStep(delta);
            }, { passive: false });

            // 2. Kéo (Pan) ảnh trong khung xem trước bằng chuột
            container.addEventListener("mousedown", function (e) {
                if (e.button !== 0 || isMagnifierActive) return;
                const stage = document.getElementById("previewImageStage");
                if (!stage) return;
                isImagePanning = true;
                panStartX = e.clientX - imagePanX;
                panStartY = e.clientY - imagePanY;
                container.classList.add("is-panning");
                e.preventDefault();
            });

            // Hỗ trợ kéo cảm ứng trên thiết bị di động / màn hình cảm ứng
            container.addEventListener("touchstart", function (e) {
                if (isMagnifierActive || e.touches.length !== 1) return;
                const stage = document.getElementById("previewImageStage");
                if (!stage) return;
                isImagePanning = true;
                panStartX = e.touches[0].clientX - imagePanX;
                panStartY = e.touches[0].clientY - imagePanY;
                container.classList.add("is-panning");
            }, { passive: true });

            // 3. Kính lúp thông minh soi chi tiết chữ viết tay khi rê chuột (hỗ trợ ảnh chụp dọc, nghiêng và xoay mọi góc)
            container.addEventListener("mousemove", function (e) {
                const img = document.getElementById("previewImage");
                const canvas = document.getElementById("magnifierCanvas");
                if (!img || !magnifier || !canvas) return;

                if (!isMagnifierActive) {
                    magnifier.style.display = "none";
                    return;
                }

                // Chờ ảnh nạp xong kích thước gốc
                if (!img.naturalWidth || !img.naturalHeight) {
                    magnifier.style.display = "none";
                    return;
                }

                const imgRect = img.getBoundingClientRect();
                const containerRect = container.getBoundingClientRect();

                // Tâm của ảnh trên màn hình (viewport coordinates)
                const centerX = (imgRect.left + imgRect.right) / 2;
                const centerY = (imgRect.top + imgRect.bottom) / 2;

                const dx = e.clientX - centerX;
                const dy = e.clientY - centerY;

                // Nghịch đảo góc xoay và tỉ lệ để tìm tọa độ trên ảnh gốc chưa xoay
                const rad = -(imageRotation * Math.PI) / 180;
                const cos = Math.cos(rad);
                const sin = Math.sin(rad);

                const u = (dx * cos - dy * sin) / imageScale;
                const v = (dx * sin + dy * cos) / imageScale;

                const unscaledW = img.offsetWidth;
                const unscaledH = img.offsetHeight;

                const posImgX = unscaledW / 2 + u;
                const posImgY = unscaledH / 2 + v;

                // Kiểm tra xem chuột có nằm trong vùng hiển thị thực tế của ảnh hay không
                if (posImgX < 0 || posImgX > unscaledW || posImgY < 0 || posImgY > unscaledH) {
                    magnifier.style.display = "none";
                    return;
                }

                magnifier.style.display = "block";

                // Vị trí tâm kính lúp tương đối so với container
                const mouseXInContainer = e.clientX - containerRect.left;
                const mouseYInContainer = e.clientY - containerRect.top;
                magnifier.style.left = `${mouseXInContainer}px`;
                magnifier.style.top = `${mouseYInContainer}px`;

                // Tọa độ trên ảnh gốc độ phân giải đầy đủ
                const ratioX = img.naturalWidth / unscaledW;
                const ratioY = img.naturalHeight / unscaledH;
                const origX = posImgX * ratioX;
                const origY = posImgY * ratioY;

                // Vẽ ảnh phóng to lên Canvas theo đúng góc xoay và tỉ lệ
                const ctx = canvas.getContext("2d");
                if (ctx) {
                    ctx.imageSmoothingEnabled = true;
                    ctx.imageSmoothingQuality = "high";
                    ctx.clearRect(0, 0, canvas.width, canvas.height);
                    ctx.save();

                    // Di chuyển gốc tọa độ về tâm kính lúp
                    ctx.translate(canvas.width / 2, canvas.height / 2);

                    // Xoay theo đúng góc xoay hiện tại của ảnh trên màn hình (để chữ luôn xuôi chiều đọc)
                    ctx.rotate((imageRotation * Math.PI) / 180);

                    // Mức phóng đại kính lúp (phóng to chi tiết gấp 2.6 lần)
                    const zoomRatio = 2.6;
                    const dpiScale = canvas.width / (magnifier.offsetWidth || 210);
                    const renderScale = (unscaledW / img.naturalWidth) * imageScale * zoomRatio * dpiScale;
                    ctx.scale(renderScale, renderScale);

                    // Vẽ ảnh với điểm (origX, origY) nằm chính xác tại tâm kính lúp
                    ctx.drawImage(img, -origX, -origY);

                    ctx.restore();
                }
            });

            container.addEventListener("mouseleave", function () {
                if (magnifier) magnifier.style.display = "none";
            });

            // Window mousemove & mouseup cho Preview Image Pan
            window.addEventListener("mousemove", function (e) {
                if (!isImagePanning) return;
                imagePanX = e.clientX - panStartX;
                imagePanY = e.clientY - panStartY;
                applyImageTransform(true);
            });

            window.addEventListener("mouseup", function () {
                if (isImagePanning) {
                    isImagePanning = false;
                    container.classList.remove("is-panning");
                    applyImageTransform(false);
                }
            });

            window.addEventListener("touchmove", function (e) {
                if (!isImagePanning || e.touches.length !== 1) return;
                imagePanX = e.touches[0].clientX - panStartX;
                imagePanY = e.touches[0].clientY - panStartY;
                applyImageTransform(true);
            }, { passive: false });

            window.addEventListener("touchend", function () {
                if (isImagePanning) {
                    isImagePanning = false;
                    container.classList.remove("is-panning");
                    applyImageTransform(false);
                }
            });

            // Chặn kéo ảnh mặc định của trình duyệt
            document.addEventListener("dragstart", function (e) {
                if (e.target.id === "previewImage" || e.target.id === "lightboxImage") {
                    e.preventDefault();
                }
            });
        }

        // ===== BỘ ĐIỀU KHIỂN & KÉO THẢ (PAN) CHO LIGHTBOX TOÀN MÀN HÌNH =====
        let lightboxInteractionsInitialized = false;

        function setupLightboxInteractions() {
            const lightboxBody = document.getElementById("lightboxBody");
            const lightboxImage = document.getElementById("lightboxImage");
            if (!lightboxBody) return;
            if (lightboxInteractionsInitialized) return;
            lightboxInteractionsInitialized = true;

            // 1. Phóng to / Thu nhỏ trong Lightbox bằng con lăn chuột (Mouse Wheel)
            lightboxBody.addEventListener("wheel", function (e) {
                e.preventDefault();
                const delta = e.deltaY < 0 ? 0.15 : -0.15;
                lightboxZoom(delta);
            }, { passive: false });

            // Hàm kích hoạt kéo Pan
            function startLightboxPan(clientX, clientY) {
                isLightboxPanning = true;
                lightboxStartX = clientX - lightboxPanX;
                lightboxStartY = clientY - lightboxPanY;
                lightboxBody.classList.add("is-panning");
            }

            // 2. Kéo bằng chuột trái
            lightboxBody.addEventListener("mousedown", function (e) {
                if (e.button !== 0) return;
                const img = document.getElementById("lightboxImage");
                if (!img || !img.src) return;
                e.preventDefault();
                startLightboxPan(e.clientX, e.clientY);
            });

            if (lightboxImage) {
                lightboxImage.addEventListener("mousedown", function (e) {
                    if (e.button !== 0) return;
                    e.preventDefault();
                    startLightboxPan(e.clientX, e.clientY);
                });
            }

            // 3. Kéo bằng cảm ứng (Touch)
            lightboxBody.addEventListener("touchstart", function (e) {
                if (e.touches.length !== 1) return;
                const img = document.getElementById("lightboxImage");
                if (!img || !img.src) return;
                startLightboxPan(e.touches[0].clientX, e.touches[0].clientY);
            }, { passive: true });

            if (lightboxImage) {
                lightboxImage.addEventListener("touchstart", function (e) {
                    if (e.touches.length !== 1) return;
                    startLightboxPan(e.touches[0].clientX, e.touches[0].clientY);
                }, { passive: true });
            }

            // Sự kiện toàn cục cho chuyển động chuột và thả chuột
            window.addEventListener("mousemove", function (e) {
                if (!isLightboxPanning) return;
                lightboxPanX = e.clientX - lightboxStartX;
                lightboxPanY = e.clientY - lightboxStartY;
                applyLightboxTransform(true);
            });

            window.addEventListener("mouseup", function () {
                if (isLightboxPanning) {
                    isLightboxPanning = false;
                    const lb = document.getElementById("lightboxBody");
                    if (lb) lb.classList.remove("is-panning");
                    applyLightboxTransform(false);
                }
            });

            window.addEventListener("touchmove", function (e) {
                if (!isLightboxPanning || e.touches.length !== 1) return;
                lightboxPanX = e.touches[0].clientX - lightboxStartX;
                lightboxPanY = e.touches[0].clientY - lightboxStartY;
                applyLightboxTransform(true);
            }, { passive: false });

            window.addEventListener("touchend", function () {
                if (isLightboxPanning) {
                    isLightboxPanning = false;
                    const lb = document.getElementById("lightboxBody");
                    if (lb) lb.classList.remove("is-panning");
                    applyLightboxTransform(false);
                }
            });
        }

        // ===== XEM ẢNH TOÀN MÀN HÌNH (LIGHTBOX) =====
        function openFullscreenModal(src = null) {
            setupLightboxInteractions();
            const targetSrc = src || currentImageUrl;
            if (!targetSrc) {
                alert("Hãy chọn ảnh trước khi xem toàn màn hình.");
                return;
            }
            const modal = document.getElementById("imageLightboxModal");
            const img = document.getElementById("lightboxImage");
            if (!modal || !img) return;

            img.src = targetSrc;
            lightboxScale = 1;
            lightboxRotation = imageRotation || 0;
            lightboxPanX = 0;
            lightboxPanY = 0;
            applyLightboxTransform();

            modal.style.display = "flex";
            document.body.style.overflow = "hidden";
        }

        function closeFullscreenModal() {
            const modal = document.getElementById("imageLightboxModal");
            if (modal) {
                modal.style.display = "none";
                document.body.style.overflow = "";
            }
            isLightboxPanning = false;
            const lb = document.getElementById("lightboxBody");
            if (lb) lb.classList.remove("is-panning");
        }

        function lightboxZoom(delta) {
            lightboxScale = Math.min(4, Math.max(0.3, Math.round((lightboxScale + delta) * 100) / 100));
            applyLightboxTransform();
        }

        function lightboxRotate() {
            lightboxRotation = (lightboxRotation + 90) % 360;
            applyLightboxTransform();
        }

        function lightboxReset() {
            lightboxScale = 1;
            lightboxRotation = 0;
            lightboxPanX = 0;
            lightboxPanY = 0;
            applyLightboxTransform();
        }

        function applyLightboxTransform(isInstant = false) {
            const img = document.getElementById("lightboxImage");
            const badge = document.getElementById("lightboxZoomBadge");
            if (img) {
                img.classList.toggle("panning", isInstant);
                img.style.transform = `translate(${lightboxPanX}px, ${lightboxPanY}px) scale(${lightboxScale}) rotate(${lightboxRotation}deg)`;
            }
            if (badge) {
                badge.textContent = Math.round(lightboxScale * 100) + "%";
            }
        }

        // Phím ESC đóng modal
        document.addEventListener("keydown", function (e) {
            if (e.key === "Escape") {
                closeFullscreenModal();
            }
        });

        // Khởi tạo tương tác ảnh khi nạp trang
        window.addEventListener("DOMContentLoaded", function () {
            setupImageInteractions();
            setupLightboxInteractions();
        });
        setupImageInteractions();
        setupLightboxInteractions();

        // ===== QUẢN LÝ BỘ TỪ ĐIỂN CHỮ VIẾT TẮT =====
        let allAbbreviations = [];
        let abbrCategories = {};

        function escapeHtml(str) {
            if (!str) return "";
            return String(str)
                .replace(/&/g, "&amp;")
                .replace(/</g, "&lt;")
                .replace(/>/g, "&gt;")
                .replace(/"/g, "&quot;")
                .replace(/'/g, "&#039;");
        }

        function openAbbreviationModal() {
            document.getElementById("dictModal").style.display = "flex";
            loadAbbreviations();
        }

        function closeAbbreviationModal() {
            document.getElementById("dictModal").style.display = "none";
            toggleAddAbbrForm(false);
        }

        function switchDictTab(tab) {
            const tabList = document.getElementById("tabDictList");
            const tabPrompt = document.getElementById("tabDictPrompt");
            const contentList = document.getElementById("dictTabContentList");
            const contentPrompt = document.getElementById("dictTabContentPrompt");

            if (tab === 'list') {
                tabList.classList.add("active");
                tabPrompt.classList.remove("active");
                contentList.style.display = "block";
                contentPrompt.style.display = "none";
            } else {
                tabPrompt.classList.add("active");
                tabList.classList.remove("active");
                contentList.style.display = "none";
                contentPrompt.style.display = "block";
                fetchDictPromptPreview();
            }
        }

        async function loadAbbreviations() {
            try {
                const res = await fetch("/api/abbreviations");
                const data = await res.json();
                if (data.status === "success") {
                    allAbbreviations = data.items || [];
                    abbrCategories = data.categories || {};
                    renderAbbreviationTable(allAbbreviations);
                } else {
                    alert("Lỗi tải từ điển: " + (data.detail || "Không xác định"));
                }
            } catch (err) {
                console.error("Lỗi fetch abbreviations:", err);
            }
        }

        function filterAbbreviations() {
            const cat = document.getElementById("dictCategoryFilter").value;
            const q = document.getElementById("dictSearchInput").value.toLowerCase().trim();

            const filtered = allAbbreviations.filter(item => {
                const matchCat = (cat === "all" || item.category === cat);
                if (!matchCat) return false;
                if (!q) return true;

                const s = (item.short || "").toLowerCase();
                const f = (item.full || "").toLowerCase();
                const d = (item.description || "").toLowerCase();
                const syn = (item.synonyms || []).join(" ").toLowerCase();

                return s.includes(q) || f.includes(q) || d.includes(q) || syn.includes(q);
            });

            renderAbbreviationTable(filtered);
        }

        function renderAbbreviationTable(items) {
            const tbody = document.getElementById("dictTableBody");
            if (!items.length) {
                tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 24px; color: var(--muted);">Không tìm thấy từ viết tắt nào.</td></tr>';
                return;
            }

            tbody.innerHTML = items.map(it => {
                const catName = abbrCategories[it.category] || it.category;
                const tagClass = `tag-${it.category || 'ghi_chu'}`;
                const syns = (it.synonyms && it.synonyms.length) 
                    ? it.synonyms.map(s => `<code style="background: #f1f5f9; padding: 2px 5px; border-radius: 4px; font-size: 11px;">${escapeHtml(s)}</code>`).join(" ")
                    : '<span style="color:#94a3b8;">—</span>';

                return `
                    <tr>
                        <td><span class="dict-badge">${escapeHtml(it.short)}</span></td>
                        <td style="font-weight: 600; color: var(--text);">${escapeHtml(it.full || '—')}</td>
                        <td><span class="dict-tag ${tagClass}">${escapeHtml(catName)}</span></td>
                        <td>${syns}</td>
                        <td style="font-size: 12px; color: var(--muted);">${escapeHtml(it.description || '—')}</td>
                        <td style="text-align: center;">
                            <button type="button" class="mini-btn" style="padding: 4px 8px; font-size: 12px; margin-right: 4px;" onclick="editAbbrItem('${it.id}')" title="Sửa">✏️</button>
                            <button type="button" class="mini-btn" style="padding: 4px 8px; font-size: 12px; color: var(--danger); border-color: #fca5a5;" onclick="deleteAbbrItem('${it.id}', '${escapeHtml(it.short)}')" title="Xóa">🗑️</button>
                        </td>
                    </tr>
                `;
            }).join("");
        }

        function toggleAddAbbrForm(show = null) {
            const box = document.getElementById("dictFormBox");
            const isVisible = box.style.display === "block";
            const willShow = (show === null) ? !isVisible : show;

            box.style.display = willShow ? "block" : "none";
            if (willShow && show === null) {
                document.getElementById("dictFormTitle").textContent = "➕ Thêm từ viết tắt mới vào từ điển";
                document.getElementById("dictFormId").value = "";
                document.getElementById("dictFormShort").value = "";
                document.getElementById("dictFormFull").value = "";
                document.getElementById("dictFormSynonyms").value = "";
                document.getElementById("dictFormDescription").value = "";
                document.getElementById("dictFormShort").focus();
            }
        }

        function editAbbrItem(id) {
            const item = allAbbreviations.find(it => it.id === id);
            if (!item) return;

            document.getElementById("dictFormTitle").textContent = `✏️ Chỉnh sửa từ viết tắt: "${item.short}"`;
            document.getElementById("dictFormId").value = item.id;
            document.getElementById("dictFormShort").value = item.short || "";
            document.getElementById("dictFormFull").value = item.full || "";
            document.getElementById("dictFormCategory").value = item.category || "cong_trinh";
            document.getElementById("dictFormSynonyms").value = (item.synonyms || []).join(", ");
            document.getElementById("dictFormDescription").value = item.description || "";

            toggleAddAbbrForm(true);
            document.getElementById("dictFormBox").scrollIntoView({ behavior: "smooth", block: "nearest" });
        }

        async function submitAbbrForm() {
            const id = document.getElementById("dictFormId").value;
            const short = document.getElementById("dictFormShort").value.trim();
            const full = document.getElementById("dictFormFull").value.trim();
            const category = document.getElementById("dictFormCategory").value;
            const synonymsStr = document.getElementById("dictFormSynonyms").value.trim();
            const description = document.getElementById("dictFormDescription").value.trim();

            if (!short) {
                alert("Vui lòng nhập chữ viết tắt!");
                return;
            }

            const synonyms = synonymsStr ? synonymsStr.split(",").map(s => s.trim()).filter(Boolean) : [];

            const payload = {
                id: id || undefined,
                short,
                full,
                category,
                synonyms,
                description
            };

            try {
                const res = await fetch("/api/abbreviations", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload)
                });
                const data = await res.json();
                if (data.status === "success") {
                    toggleAddAbbrForm(false);
                    await loadAbbreviations();
                } else {
                    alert("Lỗi lưu từ điển: " + (data.detail || "Không rõ"));
                }
            } catch (err) {
                alert("Lỗi kết nối khi lưu: " + err);
            }
        }

        async function deleteAbbrItem(id, short) {
            if (!confirm(`Bạn có chắc chắn muốn xóa từ viết tắt "${short}" khỏi từ điển không?`)) {
                return;
            }

            try {
                const res = await fetch(`/api/abbreviations/${id}`, { method: "DELETE" });
                const data = await res.json();
                if (data.status === "success") {
                    await loadAbbreviations();
                } else {
                    alert("Lỗi khi xóa: " + (data.detail || "Không rõ"));
                }
            } catch (err) {
                alert("Lỗi kết nối khi xóa: " + err);
            }
        }

        async function resetDictDefaults() {
            if (!confirm("Khôi phục toàn bộ từ điển về bộ mặc định ban đầu của xưởng mộc? Các từ bạn đã sửa sẽ được khôi phục.")) {
                return;
            }

            try {
                const res = await fetch("/api/abbreviations/reset-defaults", { method: "POST" });
                const data = await res.json();
                if (data.status === "success") {
                    await loadAbbreviations();
                    alert(data.message);
                } else {
                    alert("Lỗi: " + (data.detail || "Không rõ"));
                }
            } catch (err) {
                alert("Lỗi kết nối: " + err);
            }
        }

        async function fetchDictPromptPreview() {
            const editor = document.getElementById("dictPromptEditor");
            const box = document.getElementById("dictPromptPreviewBox");
            const badge = document.getElementById("promptStatusBadge");
            if (editor) editor.value = "Đang tải dữ liệu prompt từ máy chủ...";
            if (box) box.textContent = "Đang tải preview prompt...";
            try {
                const res = await fetch("/api/abbreviations/prompt-preview");
                const data = await res.json();
                if (data.status === "success") {
                    const txt = data.prompt_text || "(Trống)";
                    if (editor) editor.value = txt;
                    if (box) box.textContent = txt;

                    if (badge) {
                        if (data.is_custom) {
                            badge.textContent = "⚡ Đang dùng Prompt tùy chỉnh (Lưu trong SQLite)";
                            badge.style.background = "rgba(245, 158, 11, 0.2)";
                            badge.style.color = "#fcd34d";
                            badge.style.border = "1px solid #f59e0b";
                        } else {
                            badge.textContent = "✓ Đang dùng Prompt tự động sinh từ Từ điển";
                            badge.style.background = "rgba(16, 185, 129, 0.2)";
                            badge.style.color = "#6ee7b7";
                            badge.style.border = "1px solid #10b981";
                        }
                    }
                }
            } catch (err) {
                if (editor) editor.value = "Lỗi tải prompt preview: " + err;
                if (box) box.textContent = "Lỗi: " + err;
            }
        }

        async function saveCustomPrompt() {
            const editor = document.getElementById("dictPromptEditor");
            if (!editor) return;
            const text = editor.value.trim();
            if (!text) {
                alert("Nội dung prompt không được để trống!");
                return;
            }

            try {
                const res = await fetch("/api/prompt/custom", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ prompt_text: text })
                });
                const data = await res.json();
                if (data.status === "success") {
                    alert("Đã lưu Prompt tùy chỉnh thành công vào CSDL SQLite!\nGemini OCR sẽ áp dụng bộ quy tắc này ngay lập tức cho các lần đọc ảnh tiếp theo.");
                    await fetchDictPromptPreview();
                } else {
                    alert("Lỗi khi lưu prompt: " + (data.detail || "Không rõ"));
                }
            } catch (err) {
                alert("Lỗi kết nối khi lưu prompt: " + err);
            }
        }

        async function resetCustomPrompt() {
            if (!confirm("Khôi phục Prompt về mặc định tự động sinh từ bộ từ điển SQLite? Các chỉnh sửa viết tay riêng trong Prompt sẽ được xóa.")) {
                return;
            }

            try {
                const res = await fetch("/api/prompt/reset", { method: "POST" });
                const data = await res.json();
                if (data.status === "success") {
                    alert("Đã khôi phục Prompt mặc định ban đầu!");
                    await fetchDictPromptPreview();
                } else {
                    alert("Lỗi khôi phục: " + (data.detail || "Không rõ"));
                }
            } catch (err) {
                alert("Lỗi kết nối: " + err);
            }
        }

        function insertPromptTemplate(type) {
            const editor = document.getElementById("dictPromptEditor");
            if (!editor) return;

            let snippet = "";
            if (type === 'column') {
                snippet = '\n- PHÂN BIỆT CỘT: "tên_viết_tay" thuộc cột Công trình, KHÔNG tách chữ sang cột Cấu kiện (ví dụ: "cửa nga my" -> Công trình).\n';
            } else if (type === 'caukien') {
                snippet = '\n- CẤU KIỆN MỘC: "từ_viết_tắt" -> [Tên Cấu Kiện Chuẩn] (chống đọc nhầm thành [từ_sai]).\n';
            } else if (type === 'symbol') {
                snippet = '\n- KÝ HIỆU: "[Ký_hiệu]" -> [Ý nghĩa kỹ thuật] (giữ nguyên trong cột cấu kiện, không chuyển sang cột công trình).\n';
            }

            // Chèn tại vị trí con trỏ hoặc cuối văn bản
            const start = editor.selectionStart;
            const end = editor.selectionEnd;
            const text = editor.value;

            if (start !== undefined && end !== undefined) {
                editor.value = text.substring(0, start) + snippet + text.substring(end);
                editor.selectionStart = editor.selectionEnd = start + snippet.length;
            } else {
                editor.value += snippet;
            }
            editor.focus();
        }

        function copyDictPromptPreview() {
            const editor = document.getElementById("dictPromptEditor");
            const text = editor ? editor.value : (document.getElementById("dictPromptPreviewBox")?.textContent || "");
            navigator.clipboard.writeText(text).then(() => {
                alert("Đã sao chép nội dung Prompt vào Clipboard!");
            }).catch(() => {
                alert("Không thể sao chép tự động. Hãy bôi đen văn bản để sao chép.");
            });
        }


        // ============================================================
        // MODULE QUẢN LÝ LỊCH SỬ PHIẾU XẺ GỖ (DATABASE DASHBOARD)
        // ============================================================
        let historySearchTimeout = null;
        let cachedHistoryDocs = [];

        function switchTab(tabName) {
            const workspace = document.getElementById("workspaceTabContent");
            const history = document.getElementById("historyTabContent");
            const btnWorkspace = document.getElementById("tabBtnWorkspace");
            const btnHistory = document.getElementById("tabBtnHistory");

            if (tabName === "history") {
                workspace.style.display = "none";
                history.style.display = "block";
                btnWorkspace.classList.remove("active");
                btnHistory.classList.add("active");
                loadHistoryDocuments();
            } else {
                workspace.style.display = "block";
                history.style.display = "none";
                btnWorkspace.classList.add("active");
                btnHistory.classList.remove("active");
            }
        }

        let currentFilteredDocs = [];

        function parseViDate(str) {
            if (!str) return null;
            str = String(str).trim();
            if (!str) return null;

            // ISO format: YYYY-MM-DD...
            if (/^\d{4}-\d{1,2}-\d{1,2}/.test(str)) {
                const parts = str.split(/[-T :]/);
                const y = parseInt(parts[0], 10);
                const m = parseInt(parts[1], 10) - 1;
                const d = parseInt(parts[2], 10);
                return new Date(y, m, d);
            }

            // Vietnamese format: DD/MM/YYYY or D/M/YYYY or DD-MM-YYYY
            const parts = str.split(/[/.-]/);
            if (parts.length >= 3) {
                const d = parseInt(parts[0], 10);
                const m = parseInt(parts[1], 10) - 1;
                let y = parseInt(parts[2], 10);
                if (y < 100) y += 2000;
                if (!isNaN(d) && !isNaN(m) && !isNaN(y)) {
                    return new Date(y, m, d);
                }
            }

            const ts = Date.parse(str);
            return isNaN(ts) ? null : new Date(ts);
        }

        function onLinePresetChange(val) {
            const customDiv = document.getElementById("customLineInputs");
            const minInput = document.getElementById("historyFilterMinLines");
            const maxInput = document.getElementById("historyFilterMaxLines");

            if (val === "custom") {
                if (customDiv) customDiv.style.display = "inline-flex";
            } else {
                if (customDiv) customDiv.style.display = "none";
                if (minInput && maxInput) {
                    if (val === "1-5") {
                        minInput.value = 1;
                        maxInput.value = 5;
                    } else if (val === "6-15") {
                        minInput.value = 6;
                        maxInput.value = 15;
                    } else if (val === "16-999") {
                        minInput.value = 16;
                        maxInput.value = "";
                    } else {
                        // all
                        minInput.value = "";
                        maxInput.value = "";
                    }
                }
            }
            applyHistoryFilters();
        }

        function setQuickDateFilter(type, btnElement) {
            document.querySelectorAll(".filter-quick-chips .chip-btn").forEach(el => el.classList.remove("active"));
            if (btnElement) btnElement.classList.add("active");

            const fromInput = document.getElementById("historyFilterFromDate");
            const toInput = document.getElementById("historyFilterToDate");

            const now = new Date();
            const formatDate = (d) => {
                const year = d.getFullYear();
                const month = String(d.getMonth() + 1).padStart(2, '0');
                const day = String(d.getDate()).padStart(2, '0');
                return `${year}-${month}-${day}`;
            };

            if (type === "today") {
                if (fromInput) fromInput.value = formatDate(now);
                if (toInput) toInput.value = formatDate(now);
            } else if (type === "7days") {
                const past = new Date();
                past.setDate(past.getDate() - 7);
                if (fromInput) fromInput.value = formatDate(past);
                if (toInput) toInput.value = formatDate(now);
            } else if (type === "thisMonth") {
                const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
                if (fromInput) fromInput.value = formatDate(firstDay);
                if (toInput) toInput.value = formatDate(now);
            } else {
                // all
                if (fromInput) fromInput.value = "";
                if (toInput) toInput.value = "";
            }

            applyHistoryFilters();
        }

        function applyHistoryFilters() {
            if (!cachedHistoryDocs || cachedHistoryDocs.length === 0) {
                renderHistoryTable([]);
                updateHistoryFilterSummary(0, 0);
                return;
            }

            const keyword = (document.getElementById("historySearchInput")?.value || "").toLowerCase().trim();
            const dateType = document.getElementById("historyFilterDateType")?.value || "ngay_xe";
            const fromDateStr = document.getElementById("historyFilterFromDate")?.value;
            const toDateStr = document.getElementById("historyFilterToDate")?.value;

            const fromDate = fromDateStr ? new Date(fromDateStr + "T00:00:00") : null;
            const toDate = toDateStr ? new Date(toDateStr + "T23:59:59") : null;

            const minLinesStr = document.getElementById("historyFilterMinLines")?.value;
            const maxLinesStr = document.getElementById("historyFilterMaxLines")?.value;
            const minLines = minLinesStr !== "" && !isNaN(parseInt(minLinesStr, 10)) ? parseInt(minLinesStr, 10) : null;
            const maxLines = maxLinesStr !== "" && !isNaN(parseInt(maxLinesStr, 10)) ? parseInt(maxLinesStr, 10) : null;

            const sortBy = document.getElementById("historySortBy")?.value || "newest_created";

            let filtered = cachedHistoryDocs.filter(doc => {
                // 1. Lọc theo từ khóa tìm kiếm
                if (keyword) {
                    const searchField = [
                        doc.so_xe || "",
                        doc.ngay_xe || "",
                        doc.kich_thuoc_go_tron || "",
                        doc.file_name || ""
                    ].join(" ").toLowerCase();
                    if (!searchField.includes(keyword)) return false;
                }

                // 2. Lọc theo ngày
                if (fromDate || toDate) {
                    const rawDateStr = dateType === "created_at" ? doc.created_at : doc.ngay_xe;
                    const docDate = parseViDate(rawDateStr);
                    if (!docDate) {
                        return false;
                    }
                    if (fromDate && docDate < fromDate) return false;
                    if (toDate && docDate > toDate) return false;
                }

                // 3. Lọc theo số dòng
                const lines = typeof doc.total_items === "number" ? doc.total_items : (parseInt(doc.total_items, 10) || 0);
                if (minLines != null && lines < minLines) return false;
                if (maxLines != null && lines > maxLines) return false;

                return true;
            });

            // 4. Sắp xếp danh sách
            filtered.sort((a, b) => {
                if (sortBy === "newest_created") {
                    return (new Date(b.created_at || 0)) - (new Date(a.created_at || 0));
                } else if (sortBy === "oldest_created") {
                    return (new Date(a.created_at || 0)) - (new Date(b.created_at || 0));
                } else if (sortBy === "lines_desc") {
                    return (b.total_items || 0) - (a.total_items || 0);
                } else if (sortBy === "lines_asc") {
                    return (a.total_items || 0) - (b.total_items || 0);
                } else if (sortBy === "so_xe_asc") {
                    return String(a.so_xe || "").localeCompare(String(b.so_xe || ""), "vi", { numeric: true });
                } else if (sortBy === "ngay_xe_desc") {
                    const da = parseViDate(a.ngay_xe) || new Date(0);
                    const db = parseViDate(b.ngay_xe) || new Date(0);
                    return db - da;
                }
                return 0;
            });

            currentFilteredDocs = filtered;
            currentHistoryPage = 1;
            
            updateHistoryFilterSummary(filtered.length, cachedHistoryDocs.length);
            renderHistoryPage();
        }

        let currentHistoryPage = 1;
        const HISTORY_PAGE_SIZE = 20;

        function renderHistoryPage() {
            const totalDocs = currentFilteredDocs.length;
            const totalPages = Math.ceil(totalDocs / HISTORY_PAGE_SIZE) || 1;
            
            if (currentHistoryPage < 1) currentHistoryPage = 1;
            if (currentHistoryPage > totalPages) currentHistoryPage = totalPages;

            const startIndex = (currentHistoryPage - 1) * HISTORY_PAGE_SIZE;
            const endIndex = startIndex + HISTORY_PAGE_SIZE;
            
            const docsToRender = currentFilteredDocs.slice(startIndex, endIndex);
            renderHistoryTable(docsToRender, startIndex);

            const pageInfo = document.getElementById("historyPageInfo");
            if (pageInfo) {
                pageInfo.textContent = `Trang ${currentHistoryPage} / ${totalPages} (Tổng: ${totalDocs})`;
            }

            const btnPrev = document.getElementById("btnPrevHistory");
            const btnNext = document.getElementById("btnNextHistory");
            if (btnPrev) btnPrev.disabled = currentHistoryPage === 1;
            if (btnNext) btnNext.disabled = currentHistoryPage === totalPages;
        }

        function changeHistoryPage(delta) {
            currentHistoryPage += delta;
            renderHistoryPage();
            // Cuộn lên đầu bảng để xem rõ hơn
            document.getElementById("historyTableBody").scrollIntoView({ behavior: 'smooth', block: 'center' });
        }

        function updateHistoryFilterSummary(visibleCount, totalCount) {
            const summaryEl = document.getElementById("historyFilterSummary");
            if (summaryEl) {
                summaryEl.innerHTML = `Hiển thị <strong>${visibleCount}</strong> / <strong>${totalCount}</strong> phiếu`;
            }
        }

        function resetHistoryFilters() {
            const searchInput = document.getElementById("historySearchInput");
            if (searchInput) searchInput.value = "";

            const dateType = document.getElementById("historyFilterDateType");
            if (dateType) dateType.value = "ngay_xe";

            const fromInput = document.getElementById("historyFilterFromDate");
            if (fromInput) fromInput.value = "";

            const toInput = document.getElementById("historyFilterToDate");
            if (toInput) toInput.value = "";

            document.querySelectorAll(".filter-quick-chips .chip-btn").forEach(el => el.classList.remove("active"));
            const allChip = document.querySelector(".filter-quick-chips .chip-btn:first-child");
            if (allChip) allChip.classList.add("active");

            const linePreset = document.getElementById("historyFilterLinePreset");
            if (linePreset) linePreset.value = "all";

            const customLineDiv = document.getElementById("customLineInputs");
            if (customLineDiv) customLineDiv.style.display = "none";

            const minLines = document.getElementById("historyFilterMinLines");
            if (minLines) minLines.value = "";

            const maxLines = document.getElementById("historyFilterMaxLines");
            if (maxLines) maxLines.value = "";

            const sortBy = document.getElementById("historySortBy");
            if (sortBy) sortBy.value = "newest_created";

            applyHistoryFilters();
        }

        async function loadHistoryDocuments(searchQuery = "") {
            const tbody = document.getElementById("historyTableBody");
            const badgeCount = document.getElementById("historyBadgeCount");

            try {
                let url = "/api/documents?limit=300";
                if (searchQuery) {
                    url += `&search=${encodeURIComponent(searchQuery)}`;
                }

                const res = await fetch(url);
                if (!res.ok) {
                    throw new Error("Không thể kết nối cơ sở dữ liệu");
                }
                const data = await res.json();
                cachedHistoryDocs = data.documents || [];

                if (badgeCount) {
                    badgeCount.textContent = data.total !== undefined ? data.total : cachedHistoryDocs.length;
                }
                const d1Badge = document.getElementById("d1DocsCountBadge");
                if (d1Badge) {
                    d1Badge.textContent = data.total !== undefined ? data.total : cachedHistoryDocs.length;
                }

                applyHistoryFilters();
            } catch (err) {
                tbody.innerHTML = `<tr><td colspan="9" style="text-align: center; padding: 30px; color: var(--danger);">Lỗi tải danh sách phiếu: ${err.message}</td></tr>`;
            }
        }

        function renderHistoryTable(docs, startIndex = 0) {
            const tbody = document.getElementById("historyTableBody");
            const selectAll = document.getElementById("selectAllHistory");
            if (selectAll) selectAll.checked = false;
            updateSelectedHistoryCount();

            if (!docs || docs.length === 0) {
                tbody.innerHTML = `<tr><td colspan="9" style="text-align: center; padding: 40px 20px; color: var(--muted);">
                    <div style="font-size: 36px; margin-bottom: 8px;">📭</div>
                    <strong>Không tìm thấy phiếu nào phù hợp với bộ lọc</strong>
                    <div style="font-size: 12px; margin-top: 4px;">Hãy thử nới lỏng khoảng ngày, số lượng dòng hoặc bấm "Xóa lọc" để xem toàn bộ.</div>
                </td></tr>`;
                return;
            }

            tbody.innerHTML = docs.map((doc, idx) => {
                const thumbHtml = doc.image_path
                    ? `<img src="/web_uploads/${encodeURIComponent(doc.image_path)}" class="thumb-mini" alt="Ảnh phiếu" title="Bấm xem to" onclick="openFullscreenModal('/web_uploads/${encodeURIComponent(doc.image_path)}')">`
                    : `<div class="thumb-placeholder" title="Không có ảnh">📄</div>`;

                const timeStr = doc.created_at
                    ? new Date(doc.created_at).toLocaleString("vi-VN", { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' })
                    : "-";

                return `
                    <tr>
                        <td style="text-align: center;">
                            <input type="checkbox" class="history-select-item" value="${escapeHtml(doc.file_name)}" onchange="updateSelectedHistoryCount()">
                        </td>
                        <td style="text-align: center; color: var(--muted); font-weight: bold;">${startIndex + idx + 1}</td>
                        <td style="text-align: center;">${thumbHtml}</td>
                        <td><strong>${escapeHtml(doc.so_xe || "Chưa có số xẻ")}</strong></td>
                        <td>${escapeHtml(doc.ngay_xe || "-")}</td>
                        <td>${escapeHtml(doc.kich_thuoc_go_tron || "-")}</td>
                        <td style="text-align: center;"><span class="tag-pill success">${doc.total_items} dòng</span></td>
                        <td style="color: var(--muted); font-size: 12px;">${timeStr}</td>
                        <td>
                            <div class="history-action-btns">
                                <button type="button" class="btn-action-sm" onclick="reloadDocumentToWorkspace(${doc.id}, '${escapeHtml(doc.file_name)}')" title="Nạp toàn bộ ảnh và dữ liệu vào bàn làm việc">
                                    <span>👁️ Mở lại</span>
                                </button>
                                <a class="btn-action-sm" href="/api/excel?json_file=${encodeURIComponent(doc.file_name)}" target="_blank" title="Tải file Excel phiếu này (tự động sao lưu lên R2)">
                                    <span>📥 Excel</span>
                                </a>
                                <a class="btn-action-sm" href="/output/${encodeURIComponent(doc.file_name)}" target="_blank" style="background: #fffbeb; color: #b45309; border-color: #fde68a;" title="Xem file JSON kết quả OCR trên Cloudflare R2">
                                    <span>📄 JSON</span>
                                </a>
                                <button type="button" class="btn-action-sm danger" onclick="deleteHistoryDocument(${doc.id}, '${escapeHtml(doc.so_xe || ('ID #' + doc.id))}')" title="Xóa phiếu">
                                    <span>🗑️</span>
                                </button>
                            </div>
                        </td>
                    </tr>
                `;
            }).join("");
        }

        function debounceHistorySearch() {
            clearTimeout(historySearchTimeout);
            historySearchTimeout = setTimeout(() => {
                applyHistoryFilters();
            }, 150);
        }

        async function reloadDocumentToWorkspace(docId, fileName) {
            setStatus("⏳ Đang nạp dữ liệu phiếu...");
            try {
                let doc = null;
                let rawData = null;

                // 1. Thử lấy từ CSDL trước (nếu có docId)
                if (docId) {
                    try {
                        const res = await fetch(`/api/documents/${docId}`);
                        if (res.ok) {
                            const data = await res.json();
                            doc = data.document;
                            rawData = doc ? doc.raw_json : null;
                        }
                    } catch (e) {
                        console.warn("Lỗi nạp từ DB, chuyển sang thử nạp JSON:", e);
                    }
                }

                // 2. Dự phòng: Nếu CSDL chưa có hoặc lỗi, nạp trực tiếp qua API JSON
                if (!rawData && fileName) {
                    const resJson = await fetch(`/api/json/${encodeURIComponent(fileName)}`);
                    if (resJson.ok) {
                        rawData = await resJson.json();
                        doc = {
                            id: docId || 0,
                            file_name: fileName,
                            so_xe: (rawData.header && rawData.header.so_xe) || "",
                            image_path: (rawData.source && rawData.source.file) || "",
                            raw_json: rawData
                        };
                    }
                }

                if (!rawData) {
                    throw new Error("Không thể tải thông tin phiếu từ CSDL hoặc file JSON.");
                }

                currentJsonFile = (doc && doc.file_name) || fileName;
                currentData = rawData;

                // Nạp vào khung JSON
                document.getElementById("jsonViewer").value = JSON.stringify(currentData, null, 2);

                // Render form header và items
                renderData();

                // Nạp lại ảnh đối chiếu nếu có
                const imgName = (doc && doc.image_path) || (rawData.source && rawData.source.file);
                if (imgName) {
                    showImage(`/web_uploads/${encodeURIComponent(imgName)}`);
                }

                // Chuyển sang Tab 1
                switchTab("workspace");
                const label = (doc && doc.so_xe) || (doc && doc.id) || currentJsonFile;
                setStatus(`● Đã nạp phiếu số xẻ ${label} vào bàn làm việc!`);
                window.scrollTo({ top: 0, behavior: "smooth" });
            } catch (err) {
                alert("Lỗi nạp phiếu: " + err.message);
                setStatus("● Lỗi nạp phiếu");
            }
        }

        async function deleteHistoryDocument(docId, label) {
            if (!confirm(`Bạn có chắc chắn muốn xóa phiếu "${label}" khỏi cơ sở dữ liệu không?`)) {
                return;
            }

            try {
                const res = await fetch(`/api/documents/${docId}`, { method: "DELETE" });
                const data = await res.json();
                if (res.ok && data.status === "success") {
                    await loadHistoryDocuments(document.getElementById("historySearchInput").value.trim());
                    setStatus(`● Đã xóa phiếu ${label}`);
                } else {
                    alert("Lỗi xóa phiếu: " + (data.detail || "Không rõ"));
                }
            } catch (err) {
                alert("Lỗi kết nối khi xóa: " + err.message);
            }
        }

        function toggleSelectAllHistory(checked) {
            const items = document.querySelectorAll(".history-select-item");
            items.forEach(cb => cb.checked = checked);
            updateSelectedHistoryCount();
        }

        function updateSelectedHistoryCount() {
            const items = document.querySelectorAll(".history-select-item:checked");
            const btn = document.getElementById("btnExportBatchHistory");
            const badge = document.getElementById("selectedCountBadge");
            const count = items.length;

            if (badge) badge.textContent = count;
            if (btn) btn.disabled = (count === 0);
        }

        async function exportSelectedHistoryExcel() {
            const checkedBoxes = Array.from(document.querySelectorAll(".history-select-item:checked"));
            if (!checkedBoxes.length) {
                alert("Vui lòng tích chọn ít nhất 1 phiếu để xuất Excel!");
                return;
            }

            const jsonFiles = checkedBoxes.map(cb => cb.value).filter(Boolean);
            setStatus(`⏳ Đang xuất Excel gộp ${jsonFiles.length} phiếu...`);

            try {
                const res = await fetch("/api/excel/batch", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ json_files: jsonFiles })
                });

                if (!res.ok) {
                    const err = await res.json();
                    throw new Error(err.detail || "Lỗi tạo file Excel gộp");
                }

                const blob = await res.blob();
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = `VatTuGo_TongHop_LichSu_${new Date().toISOString().slice(0, 10)}.xlsx`;
                document.body.appendChild(a);
                a.click();
                a.remove();
                window.URL.revokeObjectURL(url);

                setStatus(`● Đã xuất Excel thành công ${jsonFiles.length} phiếu!`);
            } catch (err) {
                alert("Lỗi xuất Excel: " + err.message);
                setStatus("● Lỗi xuất Excel");
            }
        }

        // ===== QUẢN LÝ KHO LƯU TRỮ CLOUDFLARE R2 TRONG TAB LỊCH SỬ =====
        let cachedR2Files = [];
        let currentR2FilterType = "all";

        function switchHistorySubTab(subTab) {
            const btnD1 = document.getElementById("viewBtnD1Docs");
            const btnR2 = document.getElementById("viewBtnR2Files");
            const secD1 = document.getElementById("historyD1Section");
            const secR2 = document.getElementById("historyR2Section");

            if (subTab === "r2") {
                if (btnD1) btnD1.classList.remove("active");
                if (btnR2) btnR2.classList.add("active");
                if (secD1) secD1.style.display = "none";
                if (secR2) secR2.style.display = "block";
                loadR2FilesHistoryTab();
            } else {
                if (btnD1) btnD1.classList.add("active");
                if (btnR2) btnR2.classList.remove("active");
                if (secD1) secD1.style.display = "block";
                if (secR2) secR2.style.display = "none";
            }
        }

        async function loadR2FilesHistoryTab() {
            const tbody = document.getElementById("r2FilesHistoryTableBody");
            if (tbody) {
                tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 30px; color: var(--muted);">⏳ Đang kết nối Cloudflare R2 để tải danh sách file...</td></tr>';
            }

            try {
                const res = await fetch("/api/r2/files?limit=1000");
                const data = await res.json();

                if (data.status !== "success") {
                    throw new Error(data.message || data.error || "Không thể lấy danh sách file từ R2");
                }

                cachedR2Files = data.files || [];
                const stats = data.stats || {
                    total: cachedR2Files.length,
                    excel_count: cachedR2Files.filter(f => f.file_type === "excel").length,
                    json_count: cachedR2Files.filter(f => f.file_type === "json").length,
                    image_count: cachedR2Files.filter(f => f.file_type === "image").length
                };

                // Cập nhật thẻ thống kê
                const elTot = document.getElementById("r2StatTotal");
                const elXls = document.getElementById("r2StatExcel");
                const elJsn = document.getElementById("r2StatJson");
                const elImg = document.getElementById("r2StatImage");
                if (elTot) elTot.textContent = stats.total;
                if (elXls) elXls.textContent = stats.excel_count;
                if (elJsn) elJsn.textContent = stats.json_count;
                if (elImg) elImg.textContent = stats.image_count;

                // Cập nhật số lượng trên chip lọc
                const chipAll = document.getElementById("r2ChipCountAll");
                const chipXls = document.getElementById("r2ChipCountExcel");
                const chipJsn = document.getElementById("r2ChipCountJson");
                const chipImg = document.getElementById("r2ChipCountImage");
                if (chipAll) chipAll.textContent = stats.total;
                if (chipXls) chipXls.textContent = stats.excel_count;
                if (chipJsn) chipJsn.textContent = stats.json_count;
                if (chipImg) chipImg.textContent = stats.image_count;

                // Cập nhật badge trên sub-tab switcher
                const r2Badge = document.getElementById("r2FilesCountBadge");
                if (r2Badge) r2Badge.textContent = stats.total;

                filterR2FilesHistory();
            } catch (err) {
                if (tbody) {
                    tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; padding: 30px; color: var(--danger);">Lỗi tải file Cloudflare R2: ${escapeHtml(err.message)}</td></tr>`;
                }
            }
        }

        function setR2FilterType(type, btn) {
            currentR2FilterType = type;
            document.querySelectorAll("#historyR2Section .chip-btn").forEach(el => el.classList.remove("active"));
            if (btn) btn.classList.add("active");
            filterR2FilesHistory();
        }

        function filterR2FilesHistory() {
            if (!cachedR2Files) {
                renderR2FilesHistoryTable([]);
                return;
            }

            const searchVal = (document.getElementById("r2SearchInput")?.value || "").toLowerCase().trim();
            const fromDateVal = document.getElementById("r2FilterFromDate")?.value;
            const toDateVal = document.getElementById("r2FilterToDate")?.value;
            const sortVal = document.getElementById("r2SortBy")?.value || "newest";

            let filtered = cachedR2Files.filter(file => {
                // 1. Lọc theo Phân loại (all, excel, json, image)
                if (currentR2FilterType !== "all" && file.file_type !== currentR2FilterType) {
                    return false;
                }
                // 2. Lọc theo từ khóa tìm kiếm
                if (searchVal) {
                    const searchStr = `${file.name} ${file.key} ${file.folder}`.toLowerCase();
                    if (!searchStr.includes(searchVal)) return false;
                }
                // 3. Lọc theo ngày tải lên
                if (fromDateVal || toDateVal) {
                    let uploadDate;
                    if (file.uploaded) {
                        uploadDate = new Date(file.uploaded);
                    } else if (file.last_modified) {
                        uploadDate = new Date(file.last_modified);
                    } else if (file.uploaded_at) {
                        // fallback parse from string like "HH:MM DD/MM/YYYY" or "DD/MM/YYYY"
                        const parts = file.uploaded_at.split(" ");
                        const dateStr = parts.length > 1 ? parts[1] : parts[0];
                        const dateParts = dateStr.split("/");
                        if (dateParts.length === 3) {
                            uploadDate = new Date(`${dateParts[2]}-${dateParts[1]}-${dateParts[0]}`);
                        }
                    }

                    if (uploadDate && !isNaN(uploadDate.getTime())) {
                        uploadDate.setHours(0,0,0,0);
                        if (fromDateVal) {
                            const fDate = new Date(fromDateVal);
                            fDate.setHours(0,0,0,0);
                            if (uploadDate < fDate) return false;
                        }
                        if (toDateVal) {
                            const tDate = new Date(toDateVal);
                            tDate.setHours(0,0,0,0);
                            if (uploadDate > tDate) return false;
                        }
                    }
                }

                return true;
            });

            // 4. Sắp xếp
            filtered.sort((a, b) => {
                let dateA = 0;
                let dateB = 0;
                
                if (a.uploaded) dateA = new Date(a.uploaded).getTime();
                else if (a.last_modified) dateA = new Date(a.last_modified).getTime();
                
                if (b.uploaded) dateB = new Date(b.uploaded).getTime();
                else if (b.last_modified) dateB = new Date(b.last_modified).getTime();

                let sizeA = a.size || 0;
                let sizeB = b.size || 0;
                
                switch (sortVal) {
                    case "newest": return dateB - dateA;
                    case "oldest": return dateA - dateB;
                    case "largest": return sizeB - sizeA;
                    case "smallest": return sizeA - sizeB;
                    case "name_asc": return (a.name || "").localeCompare(b.name || "");
                    default: return dateB - dateA;
                }
            });

            // Cập nhật thống kê
            const summaryBadge = document.getElementById("r2FilterSummary");
            if (summaryBadge) {
                summaryBadge.innerHTML = `Hiển thị <strong>${filtered.length}</strong> / <strong>${cachedR2Files.length}</strong> file`;
            }

            renderR2FilesHistoryTable(filtered);
        }

        function resetR2Filters() {
            document.getElementById("r2SearchInput").value = "";
            document.getElementById("r2FilterFromDate").value = "";
            document.getElementById("r2FilterToDate").value = "";
            document.getElementById("r2SortBy").value = "newest";
            
            setR2FilterType('all', document.getElementById("chipR2All"));
            // filterR2FilesHistory() is called inside setR2FilterType
        }

        function renderR2FilesHistoryTable(files) {
            const tbody = document.getElementById("r2FilesHistoryTableBody");
            if (!tbody) return;

            // Reset "Select All" checkbox state
            const selectAllCheck = document.getElementById("r2SelectAll");
            if (selectAllCheck) selectAllCheck.checked = false;
            updateR2BatchActions();

            if (!files || files.length === 0) {
                tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 40px 20px; color: var(--muted);">
                    <div style="font-size: 32px; margin-bottom: 8px;">📭</div>
                    <strong>Không tìm thấy file nào trên Cloudflare R2 phù hợp</strong>
                    <div style="font-size: 12px; margin-top: 4px;">Hãy thử tìm kiếm với từ khóa khác hoặc bấm nút "Tất cả".</div>
                </td></tr>`;
                return;
            }

            tbody.innerHTML = files.map((f, idx) => {
                let typeBadge = '';
                if (f.file_type === 'excel') {
                    typeBadge = '<span class="r2-badge-type excel">📊 Excel (.xlsx)</span>';
                } else if (f.file_type === 'json') {
                    typeBadge = '<span class="r2-badge-type json">📄 JSON OCR</span>';
                } else if (f.file_type === 'image') {
                    typeBadge = '<span class="r2-badge-type image">🖼️ Ảnh gốc</span>';
                } else {
                    typeBadge = '<span class="r2-badge-type other">📁 Khác</span>';
                }

                const timeStr = f.last_modified
                    ? new Date(f.last_modified).toLocaleString("vi-VN", { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' })
                    : "-";

                let actionBtns = '';
                if (f.file_type === 'excel') {
                    actionBtns = `
                        <a class="btn-action-sm" href="${escapeHtml(f.public_url)}" target="_blank" download style="background: #ecfdf5; color: #047857; border-color: #a7f3d0;" title="Tải trực tiếp file Excel từ Cloudflare R2">
                            <span>📥 Tải Excel</span>
                        </a>
                    `;
                } else if (f.file_type === 'json') {
                    actionBtns = `
                        <button type="button" class="btn-action-sm" onclick="reloadJsonFileToWorkspace('${escapeHtml(f.name)}')" title="Nạp dữ liệu JSON này vào bàn làm việc Tab 1">
                            <span>👁️ Nạp phiếu</span>
                        </button>
                        <a class="btn-action-sm" href="${escapeHtml(f.public_url)}" target="_blank" style="background: #fffbeb; color: #b45309; border-color: #fde68a;" title="Xem nội dung JSON thô trên R2">
                            <span>📄 Xem JSON</span>
                        </a>
                    `;
                } else if (f.file_type === 'image') {
                    actionBtns = `
                        <button type="button" class="btn-action-sm" onclick="openFullscreenModal('${escapeHtml(f.public_url)}')" title="Xem phóng to ảnh gốc toàn màn hình">
                            <span>🖼️ Xem ảnh</span>
                        </button>
                        <a class="btn-action-sm" href="${escapeHtml(f.public_url)}" target="_blank" download title="Tải ảnh gốc về máy">
                            <span>📥 Tải ảnh</span>
                        </a>
                    `;
                } else {
                    actionBtns = `
                        <a class="btn-action-sm" href="${escapeHtml(f.public_url)}" target="_blank" download>
                            <span>📥 Tải file</span>
                        </a>
                    `;
                }

                actionBtns += `
                    <button type="button" class="btn-action-sm danger" onclick="deleteR2File('${escapeHtml(f.key)}')" title="Xóa file này khỏi Cloudflare R2">
                        <span>🗑️ Xóa</span>
                    </button>
                `;

                return `
                    <tr>
                        <td style="text-align: center;"><input type="checkbox" class="r2-row-checkbox" value="${escapeHtml(f.key)}" data-url="${escapeHtml(f.public_url)}" onclick="updateR2BatchActions()"></td>
                        <td style="text-align: center; color: var(--muted); font-weight: bold;">${idx + 1}</td>
                        <td style="text-align: center;">${typeBadge}</td>
                        <td>
                            <strong style="color: var(--text);">${escapeHtml(f.name)}</strong>
                            <div style="font-size: 11px; color: var(--muted); font-family: monospace; margin-top: 3px;">${escapeHtml(f.key)}</div>
                        </td>
                        <td style="font-size: 12px; font-weight: 500; color: #475569;">${escapeHtml(f.size_formatted)}</td>
                        <td style="font-size: 12px; color: var(--muted);">${timeStr}</td>
                        <td style="text-align: center;">
                            <div class="history-action-btns" style="justify-content: center;">
                                ${actionBtns}
                            </div>
                        </td>
                    </tr>
                `;
            }).join("");
        }

        function toggleR2SelectAll() {
            const selectAllCheck = document.getElementById("r2SelectAll");
            const checkboxes = document.querySelectorAll(".r2-row-checkbox");
            
            checkboxes.forEach(cb => {
                cb.checked = selectAllCheck.checked;
            });
            
            updateR2BatchActions();
        }

        function updateR2BatchActions() {
            const checkboxes = document.querySelectorAll(".r2-row-checkbox:checked");
            const count = checkboxes.length;
            
            const batchPanel = document.getElementById("r2BatchActions");
            const countSpan = document.getElementById("r2SelectedCount");
            
            if (batchPanel && countSpan) {
                countSpan.textContent = count;
                if (count > 0) {
                    batchPanel.style.display = "flex";
                } else {
                    batchPanel.style.display = "none";
                }
            }
            
            // Cập nhật trạng thái checkbox "Select All"
            const selectAllCheck = document.getElementById("r2SelectAll");
            const allCheckboxes = document.querySelectorAll(".r2-row-checkbox");
            if (selectAllCheck && allCheckboxes.length > 0) {
                selectAllCheck.checked = count === allCheckboxes.length;
            }
        }
        async function downloadSelectedR2Files() {
            const checkboxes = document.querySelectorAll('.r2-row-checkbox:checked');
            if (checkboxes.length === 0) return;

            const jsonFiles = [];
            const otherUrls = [];

            for (let i = 0; i < checkboxes.length; i++) {
                const url = checkboxes[i].getAttribute('data-url');
                const key = checkboxes[i].value;
                if (key.toLowerCase().endsWith('.json')) {
                    jsonFiles.push(key);
                } else if (url) {
                    otherUrls.push(url);
                }
            }

            if (jsonFiles.length > 0) {
                setStatus('⏳ Đang xuất file tổng hợp cho ' + jsonFiles.length + ' phiếu...');
                try {
                    const res = await fetch('/api/excel/batch', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ json_files: jsonFiles })
                    });
                    if (!res.ok) throw new Error('Lỗi API xuất Excel');
                    
                    const blob = await res.blob();
                    const a = document.createElement('a');
                    a.href = URL.createObjectURL(blob);
                    a.download = 'Phieu_Tong_Hop_' + new Date().getTime() + '.xlsx';
                    document.body.appendChild(a);
                    a.click();
                    a.remove();
                    setStatus('✅ Xuất và tải xuống Excel tổng hợp thành công!');
                } catch (err) {
                    alert('Lỗi xuất Excel: ' + err.message);
                    setStatus('❌ Xuất Excel thất bại.');
                }
            }

            if (otherUrls.length > 0) {
                setStatus('⏳ Đang tải ' + otherUrls.length + ' file khác...');
                for (let i = 0; i < otherUrls.length; i++) {
                    const a = document.createElement('a');
                    a.href = otherUrls[i];
                    a.target = '_blank';
                    a.download = '';
                    document.body.appendChild(a);
                    a.click();
                    a.remove();
                    if (i < otherUrls.length - 1) {
                        await new Promise(resolve => setTimeout(resolve, 600));
                    }
                }
                setStatus('✅ Hoàn tất tải file.');
            }
        }

        async function deleteSelectedR2Files() {
            const checkboxes = document.querySelectorAll(".r2-row-checkbox:checked");
            if (checkboxes.length === 0) return;

            const keysToDelete = Array.from(checkboxes).map(cb => cb.value);

            if (!confirm(`⚠️ Bạn có chắc chắn muốn xóa vĩnh viễn ${keysToDelete.length} file đã chọn khỏi Cloudflare R2?\n\nHành động này không thể hoàn tác!`)) {
                return;
            }

            setStatus(`⏳ Đang xóa ${keysToDelete.length} file...`);
            let successCount = 0;
            let errorCount = 0;

            // Chạy xóa lần lượt hoặc song song. Xóa tuần tự an toàn hơn.
            for (let i = 0; i < keysToDelete.length; i++) {
                const key = keysToDelete[i];
                try {
                    const response = await fetch("/api/r2/files?key=" + encodeURIComponent(key), {
                        method: "DELETE"
                    });
                    
                    if (response.ok) {
                        successCount++;
                    } else {
                        errorCount++;
                    }
                } catch (err) {
                    errorCount++;
                }
            }

            if (errorCount > 0) {
                alert(`⚠️ Xóa xong. Thành công: ${successCount}, Lỗi: ${errorCount}`);
                setStatus(`⚠ Lỗi khi xóa ${errorCount} file`);
            } else {
                setStatus(`✓ Đã xóa ${successCount} file thành công`);
            }

            // Ẩn panel và tải lại danh sách
            document.getElementById("r2BatchActions").style.display = "none";
            await loadR2FilesHistoryTab();
        }

        async function reloadJsonFileToWorkspace(fileName) {
            if (!fileName) return;
            // Tìm trong cachedHistoryDocs xem có doc nào khớp file_name không để lấy kèm metadata CSDL
            const foundDoc = cachedHistoryDocs ? cachedHistoryDocs.find(d => d.file_name === fileName) : null;
            await reloadDocumentToWorkspace(foundDoc ? foundDoc.id : null, fileName);
        }

        async function exportAllExcelToR2() {
            const btn = document.getElementById("btnExportAllR2");
            if (btn) btn.disabled = true;
            setStatus("⏳ Đang xuất toàn bộ phiếu ra Excel và lưu vào Cloudflare R2...");

            try {
                const res = await fetch("/api/r2/export-all-excel", { method: "POST" });
                const data = await res.json();

                if (!res.ok || data.status !== "success") {
                    throw new Error(data.error || data.detail || "Không thể xuất Excel");
                }

                alert(`✓ ${data.message}\nFile đã lưu tại: ${data.r2_key}`);
                setStatus("● Đã xuất và lưu Excel lên Cloudflare R2!");

                // Tự động tải xuống file Excel vừa tạo
                if (data.public_url) {
                    const a = document.createElement("a");
                    a.href = data.public_url;
                    a.download = data.file_name;
                    document.body.appendChild(a);
                    a.click();
                    a.remove();
                }

                // Tải lại danh sách R2
                await loadR2FilesHistoryTab();
            } catch (err) {
                alert("Lỗi xuất Excel lên R2: " + err.message);
                setStatus("● Lỗi xuất Excel R2");
            } finally {
                if (btn) btn.disabled = false;
            }
        }

        async function deleteR2File(key) {
            if (!key) return;
            if (!confirm(`Bạn có chắc chắn muốn xóa file "${key}" trên Cloudflare R2 không? Hành động này không thể hoàn tác.`)) {
                return;
            }

            setStatus(`⏳ Đang xóa file ${key} trên Cloudflare R2...`);
            try {
                const res = await fetch(`/api/r2/files?key=${encodeURIComponent(key)}`, { method: "DELETE" });
                const data = await res.json();

                if (!res.ok || data.status !== "success") {
                    throw new Error(data.error || data.message || "Lỗi xóa file");
                }

                setStatus(`● ${data.message}`);
                await loadR2FilesHistoryTab();
            } catch (err) {
                alert("Lỗi xóa file R2: " + err.message);
                setStatus("● Lỗi xóa file R2");
            }
        }

        // ===== CLOUDFLARE R2 OBJECT STORAGE =====
        function openR2Modal() {
            const modal = document.getElementById("r2Modal");
            if (modal) modal.style.display = "flex";
            checkR2Status();
        }

        function closeR2Modal() {
            const modal = document.getElementById("r2Modal");
            if (modal) modal.style.display = "none";
        }

        async function checkR2Status(showFeedback = false) {
            try {
                const res = await fetch("/api/r2/status");
                const data = await res.json();

                // Cập nhật badge trên header
                const hBadge = document.getElementById("r2HeaderBadge");
                if (hBadge) {
                    if (data.connected) {
                        hBadge.innerHTML = "☁️ R2: <span style='color: #86efac; font-weight: bold;'>Đã kết nối</span>";
                    } else if (data.configured) {
                        hBadge.innerHTML = "☁️ R2: <span style='color: #fde047; font-weight: bold;'>Lỗi kết nối</span>";
                    } else {
                        hBadge.innerHTML = "☁️ R2: <span style='color: #cbd5e1;'>Chưa cấu hình</span>";
                    }
                }

                // Cập nhật trong modal
                const mBadge = document.getElementById("r2ModalStatusBadge");
                if (mBadge) {
                    if (data.connected) {
                        mBadge.textContent = "● ĐÃ KẾT NỐI (R2 NATIVE)";
                        mBadge.style.background = "#dcfce7";
                        mBadge.style.color = "#15803d";
                    } else if (data.configured) {
                        mBadge.textContent = "⚠ LỖI XÁC THỰC";
                        mBadge.style.background = "#fef3c7";
                        mBadge.style.color = "#b45309";
                    } else {
                        mBadge.textContent = "○ CHƯA CẤU HÌNH";
                        mBadge.style.background = "#f1f5f9";
                        mBadge.style.color = "#64748b";
                    }
                }

                const bName = document.getElementById("r2BucketName");
                if (bName) bName.textContent = data.bucket || data.bucket_name || "ocr-vn01";

                const pubUrl = document.getElementById("r2PublicUrlDisplay");
                if (pubUrl) {
                    if (data.public_url) {
                        pubUrl.innerHTML = `<a href="${escapeHtml(data.public_url)}" target="_blank" style="color:#0284c7; text-decoration: underline;">${escapeHtml(data.public_url)}</a>`;
                    } else {
                        pubUrl.textContent = "Chưa cấu hình (đang dùng S3 Direct)";
                    }
                }

                const msgBox = document.getElementById("r2StatusMessage");
                if (msgBox) {
                    msgBox.textContent = data.message || "Sẵn sàng kết nối.";
                    msgBox.style.borderLeftColor = data.connected ? "#10b981" : (data.configured ? "#f59e0b" : "#64748b");
                }

                if (showFeedback) {
                    alert(`Trạng thái R2: ${data.message}`);
                }
                return data;
            } catch (err) {
                console.error("Lỗi lấy trạng thái R2:", err);
            }
        }

        async function testR2Connection() {
            const btn = document.getElementById("btnTestR2");
            const out = document.getElementById("r2ActionOutput");
            if (btn) btn.disabled = true;
            if (out) {
                out.style.display = "block";
                out.textContent = "⏳ Đang thực hiện kiểm tra ghi và đọc file test trên Cloudflare R2...";
            }

            try {
                const res = await fetch("/api/r2/test-connection", { method: "POST" });
                const data = await res.json();
                if (out) {
                    out.textContent = JSON.stringify(data, null, 2);
                }
                await checkR2Status();
                if (data.success) {
                    alert("✓ " + data.message);
                } else {
                    alert("⚠ " + data.message);
                }
            } catch (e) {
                if (out) out.textContent = "Lỗi: " + e.message;
                alert("Lỗi kiểm tra R2: " + e.message);
            } finally {
                if (btn) btn.disabled = false;
            }
        }

        async function syncAllR2Files() {
            if (!confirm("Bắt đầu đồng bộ tất cả ảnh phiếu, file JSON và file Excel lên Cloudflare R2?")) {
                return;
            }

            const btn = document.getElementById("btnSyncR2");
            const out = document.getElementById("r2ActionOutput");
            if (btn) btn.disabled = true;
            if (out) {
                out.style.display = "block";
                out.textContent = "⏳ Đang quét và đồng bộ các file lên Cloudflare R2... Vui lòng đợi...";
            }

            try {
                const res = await fetch("/api/r2/sync-all", { method: "POST" });
                const data = await res.json();
                if (out) {
                    out.textContent = JSON.stringify(data, null, 2);
                }
                if (data.status === "success") {
                    alert(`✓ Đồng bộ thành công: ${data.synced_count} file đã được đẩy lên Cloudflare R2!`);
                    await loadR2FilesList();
                } else {
                    alert("⚠ " + (data.message || "Không thể đồng bộ."));
                }
            } catch (e) {
                if (out) out.textContent = "Lỗi đồng bộ: " + e.message;
                alert("Lỗi đồng bộ: " + e.message);
            } finally {
                if (btn) btn.disabled = false;
            }
        }

        async function loadR2FilesList() {
            const container = document.getElementById("r2FilesContainer");
            const tbody = document.getElementById("r2FilesTableBody");
            if (container) container.style.display = "block";
            if (tbody) tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: var(--muted); padding: 15px;">Đang tải danh sách file từ Cloudflare R2...</td></tr>';

            try {
                const res = await fetch("/api/r2/files");
                const data = await res.json();
                if (data.status !== "success" || !data.files || data.files.length === 0) {
                    tbody.innerHTML = `<tr><td colspan="4" style="text-align: center; color: var(--muted); padding: 15px;">${data.message || "Chưa có file nào trên Cloudflare R2."}</td></tr>`;
                    return;
                }

                tbody.innerHTML = data.files.map(f => {
                    const viewLink = f.public_url
                        ? `<a href="${escapeHtml(f.public_url)}" target="_blank" class="mini-btn" style="color: #0284c7; text-decoration: none; padding: 3px 8px; font-size: 11px;">Xem ↗</a>`
                        : `<span style="color: #94a3b8; font-size: 11px;">Chưa gắn URL</span>`;
                    const sizeKb = (f.size / 1024).toFixed(1) + " KB";
                    const dateStr = f.last_modified ? new Date(f.last_modified).toLocaleString("vi-VN") : "—";
                    return `
                        <tr>
                            <td style="font-family: monospace; font-size: 12px; word-break: break-all;">${escapeHtml(f.key)}</td>
                            <td style="font-size: 12px;">${sizeKb}</td>
                            <td style="font-size: 12px; color: var(--muted);">${dateStr}</td>
                            <td style="text-align: center;">${viewLink}</td>
                        </tr>
                    `;
                }).join("");
            } catch (e) {
                if (tbody) tbody.innerHTML = `<tr><td colspan="4" style="text-align: center; color: var(--danger); padding: 15px;">Lỗi tải danh sách: ${escapeHtml(e.message)}</td></tr>`;
            }
        }

        // Tự động tải số lượng phiếu lịch sử và trạng thái Cloudflare R2 khi trang sẵn sàng
        window.addEventListener("DOMContentLoaded", () => {
            fetch("/api/documents?limit=1")
                .then(r => r.json())
                .then(d => {
                    const b = document.getElementById("historyBadgeCount");
                    if (b && d.total !== undefined) b.textContent = d.total;
                    const d1b = document.getElementById("d1DocsCountBadge");
                    if (d1b && d.total !== undefined) d1b.textContent = d.total;
                })
                .catch(() => {});

            checkR2Status();
            loadR2FilesHistoryTab();
        });
    