"""Copy the user's original public apps into isolated, locally served pages."""
from pathlib import Path
from urllib.request import urlopen
from zipfile import ZipFile
from io import BytesIO
import re
import json

ROOT = Path(__file__).resolve().parent.parent

def source(repo, slug):
    data = urlopen(f'https://codeload.github.com/evmdev101/{repo}/zip/refs/heads/main').read()
    target = ROOT / 'original-sites' / slug
    target.mkdir(parents=True, exist_ok=True)
    with ZipFile(BytesIO(data)) as archive:
        prefix = archive.namelist()[0]
        for item in archive.infolist():
            relative = item.filename[len(prefix):]
            if not relative or item.is_dir() or relative.startswith(('.git', '.claude')):
                continue
            dest = (target / relative).resolve()
            if not dest.is_relative_to(target.resolve()):
                raise ValueError('Archive path escaped destination')
            dest.parent.mkdir(parents=True, exist_ok=True)
            dest.write_bytes(archive.read(item))
    print(slug, 'source copied', flush=True)

if __name__ == '__main__':
    source('Limited-Exchange', 'exchange')
    source('cashx-10000-nft-mint', 'cashx-nft')
    source('cashmoney-mint', 'cashmoney')
