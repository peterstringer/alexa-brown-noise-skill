# Prerequisites:
#   brew install sox
#   brew install ffmpeg  (or however you installed it)

import os
import subprocess
import sys
import tempfile

SAMPLE_RATE = 44100
DURATION_SECONDS = 12 * 60 * 60   # 43200 s = 12 hours
FADE_SECONDS = 2
TARGET_DBFS = -1                   # dBFS, passed to sox norm
OUTPUT_FILE = "brown_noise_12h.mp3"
BITRATE = "128k"


def run(cmd, description):
    """Run a subprocess, streaming its stderr so progress is visible."""
    print(f"\n{description}")
    print(" ".join(cmd))
    result = subprocess.run(cmd, stderr=sys.stderr)
    if result.returncode != 0:
        sys.exit(f"\nERROR: command failed with exit code {result.returncode}")


with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
    wav_path = tmp.name

try:
    # 1. Generate brown noise with SoX
    #    synth <duration> brownnoise  — correct 1/f² brown noise
    #    fade t <in> <dur> <out>      — linear fade in/out
    #    norm <dBFS>                  — peak normalise
    run(
        [
            "sox", "-n",
            "-r", str(SAMPLE_RATE),
            "-c", "1",
            "-b", "16",
            wav_path,
            "synth", str(DURATION_SECONDS), "brownnoise",
            # High-pass at 20 Hz to remove sub-bass (<20 Hz) that causes slow
            # amplitude undulation. Everything above ~30 Hz passes untouched,
            # so the audible bass character is preserved.
            "highpass", "20", "0.707q",
            "fade", "t", str(FADE_SECONDS), str(DURATION_SECONDS), str(FADE_SECONDS),
            "norm", str(TARGET_DBFS),
        ],
        f"Generating {DURATION_SECONDS // 3600}h brown noise WAV with SoX...",
    )

    # 2. Encode to MP3 with ffmpeg
    run(
        [
            "ffmpeg", "-y",
            "-i", wav_path,
            "-codec:a", "libmp3lame",
            "-b:a", BITRATE,
            OUTPUT_FILE,
        ],
        f"Encoding to MP3 at {BITRATE}bps with ffmpeg...",
    )

finally:
    # Remove the temporary WAV (~3.8 GB) regardless of success or failure
    if os.path.exists(wav_path):
        os.unlink(wav_path)

file_size_mb = os.path.getsize(OUTPUT_FILE) / (1024 * 1024)
print(f"\nDone.")
print(f"  Output:   {OUTPUT_FILE}")
print(f"  Duration: 12 hours")
print(f"  Size:     {file_size_mb:.1f} MB")
