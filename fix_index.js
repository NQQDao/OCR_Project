const fs = require('fs');
let content = fs.readFileSync('cloudflare_worker/src/index.js', 'utf8');

const replacement = `              env
            });

            if (isFastMode) {
                let cleanText = aiResp.text.trim();
                if (cleanText.startsWith("\`\`\`")) {
                    const lines = cleanText.split("\\n");
                    cleanText = lines.slice(1, lines[lines.length - 1].trim() === "\`\`\`" ? -1 : undefined).join("\\n").trim();
                }
                const fastJson = JSON.parse(cleanText);
                results.push({
                   status: "success",
                   file: originalName,
                   raw_json: fastJson,
                   model_used: aiResp.modelUsed
                });
                continue;
            }

            // 3. Parse và kiểm tra đối chiếu khối lượng
            const finalDoc = parseAndValidateOcrResponse(aiResp.text, originalName, aiResp.modelUsed);`;

content = content.replace(`              env
            });

            // 3. Parse và kiểm tra đối chiếu khối lượng
            const finalDoc = parseAndValidateOcrResponse(aiResp.text, originalName, aiResp.modelUsed);`, replacement);

fs.writeFileSync('cloudflare_worker/src/index.js', content, 'utf8');

