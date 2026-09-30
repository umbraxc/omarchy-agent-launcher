# Umbra offline radio

These six long, evolving pieces are original audio generated for Umbra from the numeric
synthesis code and authored melodies in `scripts/generate-radio.py`. They contain no external samples,
recordings or third-party audio. They are distributed under Umbra's
MIT license. Run the generator with Python and NumPy to reproduce the WAV files;
NumPy is only a build-time dependency and is not needed by Umbra users.

The catalog's durations are rounded. Each file is stereo 16-bit PCM at
22,050 Hz. The Linux local backend streams PCM continuously through PipeWire
or PulseAudio; Windows plays the WAV file through its WebView audio support.
