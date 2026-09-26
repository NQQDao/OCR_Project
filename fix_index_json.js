const fs = require('fs');
let content = fs.readFileSync('cloudflare_worker/src/index.js', 'utf8');

const regexReplace = /if \(mode === 'fast'\) \{[\s\S]*?continue;\n            \}/;

const replacement = `if (mode === 'fast') {
                let fastJson = { so_xe: "", so_dong: 0 };
                const match = aiResp.text.match(/\\{[\\s\\S]*?\\}/);
                if (match) {
                    try {
                        fastJson = JSON.parse(match[0]);
                    } catch (e) {}
                }
                results.push({
                   status: "success",
                   file: originalName,
                   raw_json: fastJson,
                   model_used: aiResp.modelUsed
                });
                continue;
            }`;

content = content.replace(regexReplace, replacement);
fs.writeFileSync('cloudflare_worker/src/index.js', content, 'utf8');

