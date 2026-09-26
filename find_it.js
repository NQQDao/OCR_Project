const fs = require('fs');
const lines = fs.readFileSync('templates/index.html', 'utf8').split('\n');
lines.forEach((l, i) => {
    if (l.includes('id="kich_thuoc_xe"')) {
        console.log(i + 1 + ': ' + l);
    }
});
