"""Download and verify benchmark binaries, opening books, Maia weights, and EPD suites."""

from __future__ import annotations

import pathlib
import shutil
import urllib.request
import zipfile

ROOT = pathlib.Path(__file__).resolve().parents[2]
DEST = ROOT / "tools" / "bench-bin"

ARCHIVES = {
    "fastchess": "https://github.com/Disservin/fastchess/releases/download/v1.8.3-alpha/fastchess-windows-x86-64.zip",
    "stockfish": "https://github.com/official-stockfish/Stockfish/releases/download/sf_19/stockfish-windows-x86-64-universal.zip",
    "lc0": "https://github.com/LeelaChessZero/lc0/releases/download/v0.32.1/lc0-v0.32.1-windows-cpu-dnnl.zip",
    "ordo": "https://github.com/michiguel/Ordo/releases/download/1.0/ordo-1.0-win.zip",
    "8moves": "https://raw.githubusercontent.com/official-stockfish/books/master/8moves_v3.pgn.zip",
    "noob": "https://raw.githubusercontent.com/official-stockfish/books/master/noob_3moves.epd.zip",
}

FILES = {
    "maia-1100.pb.gz": "https://raw.githubusercontent.com/CSSLab/maia-chess/master/maia_weights/maia-1100.pb.gz",
    "maia-1500.pb.gz": "https://raw.githubusercontent.com/CSSLab/maia-chess/master/maia_weights/maia-1500.pb.gz",
    "maia-1900.pb.gz": "https://raw.githubusercontent.com/CSSLab/maia-chess/master/maia_weights/maia-1900.pb.gz",
    "wacnew.epd": "https://raw.githubusercontent.com/jdart1/arasan-chess/master/tests/wacnew.epd",
    "bk.epd": "https://raw.githubusercontent.com/ChrisWhittington/Chess-EPDs/master/bratko-kopec.epd",
}


def download(url: str, target: pathlib.Path) -> None:
    if target.exists() and target.stat().st_size > 0:
        print(f"cached  {target.name} ({target.stat().st_size:,} B)")
        return
    print(f"fetch   {target.name} <- {url}")
    req = urllib.request.Request(url, headers={"User-Agent": "NablaBench/1.0"})
    tmp = target.with_suffix(target.suffix + ".part")
    with urllib.request.urlopen(req, timeout=120) as resp, tmp.open("wb") as fh:
        shutil.copyfileobj(resp, fh)
    tmp.replace(target)


def extract_zip(zip_path: pathlib.Path, out_dir: pathlib.Path) -> None:
    out_dir.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(zip_path) as zf:
        zf.extractall(out_dir)


def flatten_exe(folder: pathlib.Path, exe_name: str, keep_dir_contents: bool = False) -> pathlib.Path:
    matches = list(folder.rglob(exe_name))
    if not matches:
        raise FileNotFoundError(f"Could not find {exe_name} inside {folder}")
    src = matches[0]
    if keep_dir_contents:
        # Copy all files from src.parent into DEST/src_dir (keeps DLLs next to exe).
        dest_dir = DEST / folder.name
        if dest_dir != src.parent:
            for item in src.parent.iterdir():
                target = dest_dir / item.name
                if item.is_file() and not target.exists():
                    shutil.copy2(item, target)
        return dest_dir / exe_name
    dst = DEST / exe_name
    shutil.copy2(src, dst)
    return dst


def main() -> None:
    DEST.mkdir(parents=True, exist_ok=True)
    cache = DEST / "_zips"
    cache.mkdir(exist_ok=True)

    for name, url in ARCHIVES.items():
        zpath = cache / f"{name}.zip"
        download(url, zpath)
        extract_dir = DEST / name
        if not any(extract_dir.iterdir()) if extract_dir.exists() else True:
            extract_zip(zpath, extract_dir)

    flatten_exe(DEST / "fastchess", "fastchess.exe")
    sf_exe = next((DEST / "stockfish").rglob("stockfish*.exe"))
    shutil.copy2(sf_exe, DEST / "stockfish.exe")
    lc0_exe = flatten_exe(DEST / "lc0", "lc0.exe", keep_dir_contents=True)
    ordo_exe = next((DEST / "ordo").rglob("ordo*win64*.exe"), None) or next((DEST / "ordo").rglob("ordo*.exe"))
    shutil.copy2(ordo_exe, DEST / "ordo.exe")

    for pat, out_name in [("8moves_v3.pgn", "8moves_v3.pgn"), ("noob_3moves.epd", "noob_3moves.epd")]:
        found = next(DEST.rglob(pat))
        dst = DEST / out_name
        if found != dst:
            shutil.copy2(found, dst)

    for name, url in FILES.items():
        download(url, DEST / name)

    print("\nProvisioned files:")
    for item in [
        DEST / "fastchess.exe",
        DEST / "stockfish.exe",
        lc0_exe,
        DEST / "ordo.exe",
        DEST / "8moves_v3.pgn",
        DEST / "noob_3moves.epd",
        DEST / "wacnew.epd",
        DEST / "bk.epd",
        DEST / "maia-1100.pb.gz",
        DEST / "maia-1500.pb.gz",
        DEST / "maia-1900.pb.gz",
    ]:
        print(f"  {item.relative_to(ROOT)}  ({item.stat().st_size:,} B)")


if __name__ == "__main__":
    main()
