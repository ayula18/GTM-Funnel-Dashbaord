import sys, re, os

with open('../db.ts', 'r') as f:
    content = f.read()

sections = re.split(r'\n// ── (.+?) ──[^\n]*\n', content)

groups = {
    'funnels': ['Funnel Queries', 'Funnel Step Counts (with drop counts)', 'Filter Options (for Excel-like dropdowns)'],
    'companies': ['Company Queries', 'Discard Reason Computation', 'Scrape Cache', 'Stats', 'Unclassified companies for pipeline'],
    'merges': ['Domain Alias Resolution', 'Merge Candidates', 'Merging Companies'],
    'master': ['Master ICP']
}

imports_core = "import { qp, qdb, withTx } from './core';\n"
imports_utils = "import { extractRootName, extractCoreRoot, normalizeCompanyName } from '../domain-utils';\n"

files = {
    'funnels.ts': imports_core + "import { computeDiscardReasons } from './companies';\n",
    'companies.ts': imports_core + "import { pool } from './core';\nimport { getMasterIcpCount } from './master';\n",
    'merges.ts': imports_core + imports_utils + "import { getCompanyById, computeDiscardReasons } from './companies';\n",
    'master.ts': imports_core
}

# Add core.ts explicitly
files['core.ts'] = sections[0].replace('max:      1,', 'max:      20,')

# Populate the rest
for i in range(1, len(sections), 2):
    name = sections[i].strip()
    text = sections[i+1]
    for filename, group_names in groups.items():
        if any(name.startswith(g) for g in group_names):
            files[filename + '.ts'] += f'\n// ── {name} ────────────────────────────────────────────────────────\n' + text

for filename, content in files.items():
    with open(filename, 'w') as f:
        f.write(content)

with open('index.ts', 'w') as f:
    f.write('''export * from './core';
export * from './funnels';
export * from './companies';
export * from './merges';
export * from './master';
''')

print('Splitting successful!')
