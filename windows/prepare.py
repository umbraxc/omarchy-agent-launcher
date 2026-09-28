"""Fetch what the Windows app bundles, checked against pinned checksums:
kiwix-serve (the library server) and the JetBrains Mono Nerd Font. Also
writes the exe's version details. Run from the repository root before
`pyinstaller windows/umbra.spec`; the build workflow does this."""

import hashlib
import io
import os
import re
import urllib.request
import zipfile

ROOT = os.path.abspath(".")
BUILD = os.path.join(ROOT, "windows", "build")

KIWIX = ("https://download.kiwix.org/release/kiwix-tools/kiwix-tools_win-x86_64-3.8.1.zip",
         "fcd01ed2b93e9a68632c7863c83b9f66bf64406a66357be1df7b8b75596f3e45")
FONT = ("https://github.com/ryanoasis/nerd-fonts/releases/download/v3.5.1/JetBrainsMono.zip",
        "fab782a66f7d3019da64f6572db9fc5d3a4bcb19f9fa13e2d8a62e3693d6396e")
FONT_FILES = [f"JetBrainsMonoNerdFont-{w}.ttf" for w in ("Regular", "SemiBold", "Bold", "ExtraBold", "Italic")]


def fetch(url, sha):
    print("fetching", url, flush=True)
    with urllib.request.urlopen(url, timeout=300) as r:
        data = r.read()
    got = hashlib.sha256(data).hexdigest()
    if got != sha:
        raise SystemExit(f"checksum mismatch for {url}: {got}")
    return zipfile.ZipFile(io.BytesIO(data))


def main():
    kiwix = os.path.join(BUILD, "kiwix")
    fonts = os.path.join(BUILD, "fonts")
    os.makedirs(kiwix, exist_ok=True)
    os.makedirs(fonts, exist_ok=True)

    z = fetch(*KIWIX)
    for name in z.namelist():
        base = os.path.basename(name)
        if base == "kiwix-serve.exe" or base.lower().endswith(".dll"):
            with open(os.path.join(kiwix, base), "wb") as f:
                f.write(z.read(name))
    with open(os.path.join(kiwix, "SOURCE.txt"), "w", encoding="utf-8") as f:
        f.write("kiwix-serve 3.8.1 by the Kiwix project, GPL-3.0-or-later.\n"
                "Source code: https://github.com/kiwix/kiwix-tools/releases/tag/3.8.1\n"
                "Binaries: " + KIWIX[0] + "\n")

    z = fetch(*FONT)
    for name in FONT_FILES + ["OFL.txt"]:
        with open(os.path.join(fonts, name), "wb") as f:
            f.write(z.read(name))

    version = re.search(r'^VERSION = "([^"]+)"', open(os.path.join(ROOT, "umbra-wiki", "server.py"), encoding="utf-8").read(), re.M)[1]
    nums = (tuple(int(x) for x in re.findall(r"\d+", version)[:3]) + (0, 0, 0))[:3]
    with open(os.path.join(BUILD, "version.txt"), "w", encoding="utf-8") as f:
        f.write(f"""VSVersionInfo(
  ffi=FixedFileInfo(filevers=({nums[0]}, {nums[1]}, {nums[2]}, 0), prodvers=({nums[0]}, {nums[1]}, {nums[2]}, 0)),
  kids=[StringFileInfo([StringTable('040904B0', [
    StringStruct('CompanyName', 'umbraxc'),
    StringStruct('FileDescription', 'Umbra Wiki'),
    StringStruct('FileVersion', '{version}'),
    StringStruct('InternalName', 'Umbra Wiki'),
    StringStruct('LegalCopyright', 'MIT license'),
    StringStruct('OriginalFilename', 'Umbra Wiki.exe'),
    StringStruct('ProductName', 'Umbra Wiki'),
    StringStruct('ProductVersion', '{version}')])]),
    VarFileInfo([VarStruct('Translation', [1033, 1200])])]
)
""")
    with open(os.path.join(BUILD, "version"), "w") as f:
        f.write(version)
    print("prepared version", version, flush=True)


if __name__ == "__main__":
    main()
