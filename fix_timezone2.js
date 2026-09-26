const fs = require('fs');
let html = fs.readFileSync('templates/index.html', 'utf8');

html = html.replace(
    /return \(new Date\(b\.created_at \|\| 0 \? b\.created_at \|\| 0\.replace\(" ", "T"\) \+ "Z" : 0\)\) - \(new Date\(a\.created_at \|\| 0 \? a\.created_at \|\| 0\.replace\(" ", "T"\) \+ "Z" : 0\)\);/g,
    `return (new Date(b.created_at ? b.created_at.replace(" ", "T") + "Z" : 0)) - (new Date(a.created_at ? a.created_at.replace(" ", "T") + "Z" : 0));`
);

html = html.replace(
    /return \(new Date\(a\.created_at \|\| 0 \? a\.created_at \|\| 0\.replace\(" ", "T"\) \+ "Z" : 0\)\) - \(new Date\(b\.created_at \|\| 0 \? b\.created_at \|\| 0\.replace\(" ", "T"\) \+ "Z" : 0\)\);/g,
    `return (new Date(a.created_at ? a.created_at.replace(" ", "T") + "Z" : 0)) - (new Date(b.created_at ? b.created_at.replace(" ", "T") + "Z" : 0));`
);

fs.writeFileSync('templates/index.html', html, 'utf8');

