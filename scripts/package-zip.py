from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
import hashlib
import json

root = Path(__file__).resolve().parent.parent
extension = root / 'Demo' / 'chrome-mv3'
target = root / 'Demo' / 'VGenToolNya-UI-20261108.zip'
files = sorted(p for p in extension.rglob('*') if p.is_file())
with ZipFile(target, 'w', ZIP_DEFLATED) as archive:
    for file in files:
        archive.write(file, 'chrome-mv3/' + file.relative_to(extension).as_posix())
with ZipFile(target) as archive:
    assert len(archive.namelist()) == len(files)
    assert archive.testzip() is None
    for file in files:
        assert archive.read('chrome-mv3/' + file.relative_to(extension).as_posix()) == file.read_bytes()
    manifest = json.loads(archive.read('chrome-mv3/manifest.json'))
    assert manifest['manifest_version'] == 3
digest = hashlib.sha256(target.read_bytes()).hexdigest()
(root / 'Demo' / 'SHA256.txt').write_text(digest + '  ' + target.name + '\n', encoding='utf-8')
print(json.dumps({'archive': str(target), 'verifiedFiles': len(files), 'SHA256': digest}))
