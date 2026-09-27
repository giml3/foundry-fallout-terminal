"""Create a directly extractable Foundry module archive using the standard library."""
import json
import hashlib
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED

root = Path(__file__).resolve().parent.parent
manifest = json.loads((root / "module.json").read_text())
package = json.loads((root / "package.json").read_text())
if package["version"] != manifest["version"]:
    raise ValueError("package.json and module.json versions must match")
expected = f"{manifest['url']}/releases/download/v{manifest['version']}/{manifest['id']}-{manifest['version']}.zip"
if manifest["download"] != expected:
    raise ValueError("Manifest download URL must match this version and repository")
destination = root / "dist" / f"{manifest['id']}-{manifest['version']}.zip"
destination.parent.mkdir(exist_ok=True)
paths = [root / "module.json", root / "README.md"]
for folder in ("scripts", "styles", "templates", "assets"):
    paths.extend(path for path in (root / folder).rglob("*") if path.is_file() and path.suffix != ".py")
with ZipFile(destination, "w", ZIP_DEFLATED) as archive:
    for path in sorted(paths):
        archive.write(path, Path(manifest["id"]) / path.relative_to(root))
print(destination)
(destination.parent / "module.json").write_text((root / "module.json").read_text())
assets = [destination, destination.parent / "module.json"]
(destination.parent / "SHA256SUMS.txt").write_text("".join(
    f"{hashlib.sha256(path.read_bytes()).hexdigest()}  {path.name}\n" for path in assets
))
