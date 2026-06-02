const fs = require('fs');
const path = require('path');

const directoryPath = path.join(__dirname, 'src');

const replacements = {
  'bg-[#0a0a0f]': 'bg-background',
  'bg-[#0f0f17]': 'bg-card',
  'bg-[#12121a]': 'bg-card',
  'border-[#1e1e2e]': 'border-border',
  'hover:border-[#2e2e3e]': 'hover:border-primary/50',
  'border-[#1e1e2e]': 'border-border',
  'text-slate-300': 'text-muted-foreground',
  'text-white': 'text-foreground',
  'bg-emerald-600': 'bg-primary',
  'hover:bg-emerald-700': 'hover:bg-primary/90',
  'bg-slate-800/80': 'bg-muted',
  'hover:bg-slate-700': 'hover:bg-muted/80',
  'bg-slate-700 ring-2 ring-slate-400': 'bg-muted ring-2 ring-primary',
  'bg-indigo-900/60': 'bg-primary/10 text-primary',
  'hover:bg-indigo-800/80': 'hover:bg-primary/20 text-primary',
  'bg-indigo-800 ring-2 ring-indigo-400': 'bg-primary/20 ring-2 ring-primary text-primary',
  'bg-blue-900/60': 'bg-blue-100 text-blue-700',
  'hover:bg-blue-800/80': 'hover:bg-blue-200 text-blue-700',
  'bg-blue-800 ring-2 ring-blue-400': 'bg-blue-200 ring-2 ring-blue-500 text-blue-700',
  'bg-teal-900/60': 'bg-teal-100 text-teal-700',
  'hover:bg-teal-800/80': 'hover:bg-teal-200 text-teal-700',
  'bg-teal-800 ring-2 ring-teal-400': 'bg-teal-200 ring-2 ring-teal-500 text-teal-700',
  'bg-emerald-900/60': 'bg-emerald-100 text-emerald-700',
  'hover:bg-emerald-800/80': 'hover:bg-emerald-200 text-emerald-700',
  'bg-emerald-800 ring-2 ring-emerald-400': 'bg-emerald-200 ring-2 ring-emerald-500 text-emerald-700',
  'bg-green-900/60': 'bg-green-100 text-green-700',
  'hover:bg-green-800/80': 'hover:bg-green-200 text-green-700',
  'bg-green-800 ring-2 ring-green-400': 'bg-green-200 ring-2 ring-green-500 text-green-700',
  'text-emerald-400 mt-1 font-medium': 'text-emerald-600 mt-1 font-medium',
  'text-[10px] text-emerald-400': 'text-[10px] text-emerald-600',
  'text-slate-600': 'text-slate-400',
  'text-slate-500': 'text-slate-600',
  'border-slate-500/20': 'border-slate-200',
  'bg-slate-500/10': 'bg-slate-100',
};

function processDirectory(dir) {
  fs.readdirSync(dir).forEach(file => {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      processDirectory(fullPath);
    } else if (fullPath.endsWith('.tsx') || fullPath.endsWith('.ts')) {
      let content = fs.readFileSync(fullPath, 'utf8');
      let modified = false;
      for (const [key, value] of Object.entries(replacements)) {
        if (content.includes(key)) {
          content = content.split(key).join(value);
          modified = true;
        }
      }
      if (modified) {
        fs.writeFileSync(fullPath, content, 'utf8');
        console.log(`Updated ${fullPath}`);
      }
    }
  });
}

processDirectory(directoryPath);
