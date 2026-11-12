#!/bin/sh
# A copy of the trailer to send as a WhatsApp video: under 16 MB, so it plays inline in every client and the
# phone has no reason to squeeze it again. H.264 High, 8-bit 4:2:0 BT.709, AAC stereo, index first.
# The letterbox bars are cut away (the player letterboxes it the same) and the film grain is calmed, so the
# bits go to the picture rather than to black bars and noise.
#   sh edit/whatsapp.sh <in.mp4> <out.mp4> [width, default 1920] [budget MB, default 15.3]
set -e
in=$1 out=$2 w=${3:-1920} mb=${4:-15.3}
h=$(( (w * 804 / 1920 + 1) / 2 * 2 ))
secs=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$in")
kbps=$(python -c "print(int($mb * 8 * 1024 * 1024 * 0.97 / $secs / 1000 - 128))")
log=$(mktemp -u)
vf="crop=1920:804:0:138,hqdn3d=2:1.5:4:3,scale=$w:$h:flags=lanczos,format=yuv420p"
x264="colorprim=bt709:transfer=bt709:colormatrix=bt709"
ffmpeg -v error -y -i "$in" -vf "$vf" -c:v libx264 -preset slow -profile:v high -level:v 4.1 -b:v ${kbps}k \
  -x264-params "$x264" -pass 1 -passlogfile "$log" -an -f null -
ffmpeg -v error -y -i "$in" -vf "$vf" -c:v libx264 -preset slow -profile:v high -level:v 4.1 -b:v ${kbps}k \
  -maxrate $((kbps * 2))k -bufsize $((kbps * 2))k -x264-params "$x264" -pass 2 -passlogfile "$log" \
  -c:a aac -b:a 128k -ar 48000 -ac 2 -movflags +faststart -tag:v avc1 "$out"
rm -f "$log"-0.log "$log"-0.log.mbtree
echo "$out: $(( $(wc -c < "$out") / 1024 )) KB, ${w}x$h, ${kbps} kb/s video"
