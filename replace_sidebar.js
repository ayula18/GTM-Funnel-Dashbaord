const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, 'src/components/sidebar.tsx');
let content = fs.readFileSync(file, 'utf8');

content = content.replace(/bg-emerald-500\/20 text-emerald-500/g, 'bg-primary/20 text-primary');
content = content.replace(/bg-emerald-500\/10 text-emerald-500 relative/g, 'bg-primary/10 text-primary relative');
content = content.replace(/bg-emerald-500 rounded-r-full/g, 'bg-primary rounded-r-full');

fs.writeFileSync(file, content, 'utf8');
console.log('Sidebar updated');
