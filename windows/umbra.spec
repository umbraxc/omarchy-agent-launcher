# PyInstaller recipe for "Umbra Wiki.exe" (run from the repository root:
#   pyinstaller windows/umbra.spec
# after windows/build.ps1 has fetched kiwix-serve and the font into
# windows/build/). The result is the folder dist/Umbra Wiki/, which the
# installer (windows/installer.iss) packs.

import os

ROOT = os.path.abspath(".")
APP = os.path.join(ROOT, "umbra-wiki")
BUILD = os.path.join(ROOT, "windows", "build")

datas = [
    (os.path.join(APP, "ui"), "ui"),
    (os.path.join(APP, "sounds"), "sounds"),
    (os.path.join(APP, "maps", "world.mbtiles"), "maps"),
    (os.path.join(APP, "maps", "countries.json"), "maps"),
    (os.path.join(APP, "maps", "atlas.json"), "maps"),
    (os.path.join(BUILD, "fonts"), os.path.join("ui", "fonts")),
    (os.path.join(BUILD, "kiwix"), "kiwix"),
    (os.path.join(ROOT, "CHANGELOG.md"), "."),
    (os.path.join(ROOT, "LICENSE"), "."),
    (os.path.join(ROOT, "CREDITS.md"), "."),
]
for name in ("manuals.json", "facts.json", "fieldmanual.json", "library.json", "packs.json", "achievements.json"):
    datas.append((os.path.join(APP, name), "."))

a = Analysis(
    [os.path.join(ROOT, "windows", "umbra_win.py")],
    pathex=[APP],
    datas=datas,
    hiddenimports=["server", "maps", "pmtiles", "radar", "winplat", "psutil"],
    excludes=["tkinter"],
)
pyz = PYZ(a.pure)
exe = EXE(
    pyz,
    a.scripts,
    # UTF-8 mode: Umbra's files are UTF-8, whatever Windows' own code page is.
    [("X utf8_mode=1", None, "OPTION")],
    exclude_binaries=True,
    name="Umbra Wiki",
    icon=os.path.join(ROOT, "windows", "umbra.ico"),
    console=False,
    version=os.path.join(BUILD, "version.txt"),
)
coll = COLLECT(exe, a.binaries, a.datas, name="Umbra Wiki")
