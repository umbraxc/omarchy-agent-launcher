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
    (os.path.join(APP, "maps", "atlas-more.json"), "maps"),
    (os.path.join(BUILD, "fonts"), os.path.join("ui", "fonts")),
    (os.path.join(BUILD, "kiwix"), "kiwix"),
    (os.path.join(ROOT, "CHANGELOG.md"), "."),
    (os.path.join(ROOT, "LICENSE"), "."),
    (os.path.join(ROOT, "CREDITS.md"), "."),
]
for name in ("manuals.json", "facts.json", "fieldmanual.json", "knowledge.json", "library.json", "packs.json", "achievements.json", "farming.json"):
    datas.append((os.path.join(APP, name), "."))

# Umbra's voice: the speech engine ships inside the app (the model is
# downloaded on request), with the phoneme library and its data.
from PyInstaller.utils.hooks import collect_all, collect_data_files, collect_dynamic_libs, collect_submodules
binaries = []
hidden_voice = []
for pkg in ("kokoro_onnx", "espeakng_loader", "pywhispercpp", "sounddevice", "_sounddevice_data", "phonemizer", "language_tags", "segments", "csvw", "meshtastic", "pubsub", "serial"):
    try:
        d, b, h = collect_all(pkg)
        datas += d; binaries += b; hidden_voice += h
    except Exception:
        pass
# onnxruntime: only the runtime itself (its quantization and training tools
# crash when PyInstaller imports them, and the voice doesn't need them).
ORT_SKIP = ("onnxruntime.quantization", "onnxruntime.transformers", "onnxruntime.tools", "onnxruntime.training", "onnxruntime.backend")
try:
    binaries += collect_dynamic_libs("onnxruntime")
    datas += collect_data_files("onnxruntime")
    hidden_voice += collect_submodules("onnxruntime", filter=lambda n: not n.startswith(ORT_SKIP))
except Exception:
    pass

a = Analysis(
    [os.path.join(ROOT, "windows", "umbra_win.py")],
    pathex=[APP],
    datas=datas,
    binaries=binaries,
    hiddenimports=["server", "maps", "pmtiles", "radar", "transfers", "linked_library", "outpost", "outpost_data", "camp", "sky", "winplat", "psutil", "pypdf", "cryptography",
                   "speech", "speech_worker", "lora", "lora_worker", "listen", "listen_worker", *hidden_voice],
    excludes=["tkinter", *ORT_SKIP],
)
pyz = PYZ(a.pure)
exe = EXE(
    pyz,
    a.scripts,
    # UTF-8 mode: Umbra's files are UTF-8, whatever Windows' own code page is.
    [("X utf8", None, "OPTION")],
    exclude_binaries=True,
    name="Umbra Wiki",
    icon=os.path.join(ROOT, "windows", "umbra.ico"),
    console=False,
    version=os.path.join(BUILD, "version.txt"),
)
coll = COLLECT(exe, a.binaries, a.datas, name="Umbra Wiki")
