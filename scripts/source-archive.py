"""Make a portable, credential-free source bundle from an explicit allowlist."""
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED

root = Path(__file__).resolve().parents[1]
target = root / 'public' / 'afterzero-source.zip'
paths = [root / p for p in ('README.md', 'AGENTS.md', 'package.json', '.gitignore', 'vite.config.ts', 'tsconfig.json', 'cloudflare-env.d.ts', 'drizzle.config.ts', 'next.config.ts', 'postcss.config.mjs', 'package-lock.json', 'render.yaml')]
for directory in ('public', 'scripts', 'tests', 'server', 'worker', 'db', 'drizzle', 'app', 'lib', 'vendor', '.github', 'docs'):
    paths.extend(p for p in (root / directory).rglob('*') if p.is_file() and p != target)
with ZipFile(target, 'w', ZIP_DEFLATED) as archive:
    for path in sorted(paths):
        archive.write(path, Path('afterzero') / path.relative_to(root))
    archive.writestr('afterzero/.openai/hosting.json', '{"d1":"DB","r2":null}\n')
print(f'{target.name}: {target.stat().st_size:,} bytes; {len(paths)} source files')
