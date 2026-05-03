#!/usr/bin/env bash
set -euo pipefail

# Bareter logo asset builder
# Source of truth: this script. Re-run any time to regenerate the full asset set.

OUT_PUB="client/public"
OUT_BRAND="attached_assets/brand"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

mkdir -p "$OUT_PUB" "$OUT_BRAND"

TEAL="#1A7272"
TEAL_LIGHT="#22A0A0"
TEAL_MUTED="#E6F4F4"
WHITE="#FFFFFF"
BLACK="#0F1419"

FONT="DejaVu-Sans-Bold"
WORDMARK_TEXT="BARETER"

# ----- helpers -----------------------------------------------------------------

# Render the wordmark "BARETER" centered inside a 2000x500 transparent canvas
# in the requested fill color. Letter-spacing is tightened for a polished
# Sony/Zara feel. The text is sized to ~340pt which gives generous whitespace
# above and below the cap height.
render_wordmark() {
  local color="$1"; local out="$2"
  magick -size 2000x500 xc:none \
    -font "$FONT" -fill "$color" -kerning 14 -pointsize 340 -gravity center \
    -annotate +0+0 "$WORDMARK_TEXT" \
    -strip "$out"
}

# Render an icon: 1024x1024, rounded-square teal background with a white "B".
# The background color is the variant param so we can also produce
# black-on-transparent and white-on-transparent variants.
render_icon() {
  local bg="$1"        # background color or "none"
  local fg="$2"        # letter color
  local out="$3"
  if [[ "$bg" == "none" ]]; then
    magick -size 1024x1024 xc:none \
      -font "$FONT" -fill "$fg" -pointsize 760 -gravity center \
      -annotate +0+30 "B" \
      -strip "$out"
  else
    magick -size 1024x1024 xc:none \
      -fill "$bg" -draw "roundrectangle 0,0 1023,1023 180,180" \
      -font "$FONT" -fill "$fg" -pointsize 760 -gravity center \
      -annotate +0+30 "B" \
      -strip "$out"
  fi
}

emit_wordmark_svg() {
  local color="$1"; local out="$2"
  cat > "$out" <<EOF
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 2000 500" role="img" aria-label="Bareter">
  <text x="1000" y="340"
        text-anchor="middle"
        font-family="Inter, 'Helvetica Neue', Helvetica, Arial, 'DejaVu Sans', sans-serif"
        font-weight="800"
        font-size="340"
        letter-spacing="14"
        fill="$color">BARETER</text>
</svg>
EOF
}

emit_icon_svg() {
  local bg="$1"; local fg="$2"; local out="$3"
  if [[ "$bg" == "none" ]]; then
    cat > "$out" <<EOF
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" role="img" aria-label="Bareter">
  <text x="512" y="760" text-anchor="middle"
        font-family="Inter, 'Helvetica Neue', Helvetica, Arial, 'DejaVu Sans', sans-serif"
        font-weight="800" font-size="760" fill="$fg">B</text>
</svg>
EOF
  else
    cat > "$out" <<EOF
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" role="img" aria-label="Bareter">
  <rect x="0" y="0" width="1024" height="1024" rx="180" ry="180" fill="$bg"/>
  <text x="512" y="760" text-anchor="middle"
        font-family="Inter, 'Helvetica Neue', Helvetica, Arial, 'DejaVu Sans', sans-serif"
        font-weight="800" font-size="760" fill="$fg">B</text>
</svg>
EOF
  fi
}

# Copy a built file into both client/public and attached_assets/brand.
publish() {
  local src="$1"; local name="$2"
  cp "$src" "$OUT_PUB/$name"
  cp "$src" "$OUT_BRAND/$name"
}

# ----- wordmark variants -------------------------------------------------------

render_wordmark "$TEAL"  "$TMP/logo-full-color.png"
render_wordmark "$WHITE" "$TMP/logo-full-white.png"
render_wordmark "$BLACK" "$TMP/logo-full-black.png"

publish "$TMP/logo-full-color.png" logo-full-color.png
publish "$TMP/logo-full-white.png" logo-full-white.png
publish "$TMP/logo-full-black.png" logo-full-black.png

# logo-{white,black}.png are alt aliases historically used in the codebase.
# Keep them in sync so any consumer continues to render the new wordmark.
publish "$TMP/logo-full-white.png" logo-white.png
publish "$TMP/logo-full-black.png" logo-black.png

emit_wordmark_svg "$TEAL"  "$TMP/logo-full-color.svg"
emit_wordmark_svg "$WHITE" "$TMP/logo-full-white.svg"
emit_wordmark_svg "$BLACK" "$TMP/logo-full-black.svg"

publish "$TMP/logo-full-color.svg" logo-full-color.svg
publish "$TMP/logo-full-white.svg" logo-full-white.svg
publish "$TMP/logo-full-black.svg" logo-full-black.svg
publish "$TMP/logo-full-white.svg" logo-white.svg
publish "$TMP/logo-full-black.svg" logo-black.svg

# ----- icon variants -----------------------------------------------------------

# logo-icon.png is the brand color icon: teal rounded square with white "B".
render_icon "$TEAL"  "$WHITE" "$TMP/logo-icon.png"
# logo-icon-white.png is the on-dark variant: white "B" on transparent.
render_icon "none"   "$WHITE" "$TMP/logo-icon-white.png"
# logo-icon-black.png is the on-light single-color variant: black "B" on transparent.
render_icon "none"   "$BLACK" "$TMP/logo-icon-black.png"

publish "$TMP/logo-icon.png"       logo-icon.png
publish "$TMP/logo-icon-white.png" logo-icon-white.png
publish "$TMP/logo-icon-black.png" logo-icon-black.png

emit_icon_svg "$TEAL" "$WHITE" "$TMP/logo-icon.svg"
emit_icon_svg "none"  "$WHITE" "$TMP/logo-icon-white.svg"
emit_icon_svg "none"  "$BLACK" "$TMP/logo-icon-black.svg"

publish "$TMP/logo-icon.svg"       logo-icon.svg
publish "$TMP/logo-icon-white.svg" logo-icon-white.svg
publish "$TMP/logo-icon-black.svg" logo-icon-black.svg

# ----- favicons ---------------------------------------------------------------

for size in 16 32 48 192 512; do
  magick "$TMP/logo-icon.png" -resize "${size}x${size}" -strip "$TMP/favicon-${size}.png"
  publish "$TMP/favicon-${size}.png" "favicon-${size}.png"
done

# favicon.png is the legacy single-favicon path (used by some service workers).
cp "$TMP/favicon-32.png" "$OUT_PUB/favicon.png"
cp "$TMP/favicon-32.png" "$OUT_BRAND/favicon.png"

# Multi-resolution .ico for legacy browsers + Windows tiles.
magick "$TMP/favicon-16.png" "$TMP/favicon-32.png" "$TMP/favicon-48.png" "$TMP/favicon.ico"
publish "$TMP/favicon.ico" favicon.ico

# Apple touch icon @ 180x180 — uses the colored teal-square version so it looks
# right on iOS home screens (which auto-mask transparent icons to a flat tile).
magick "$TMP/logo-icon.png" -resize 180x180 -strip "$TMP/apple-touch-icon.png"
publish "$TMP/apple-touch-icon.png" apple-touch-icon.png

# ----- social images ----------------------------------------------------------

# Open Graph image @ 1200x630 — white wordmark centered on teal background.
magick -size 1200x630 "xc:$TEAL" \
  \( "$TMP/logo-full-white.png" -resize 800x200 \) -gravity center -composite \
  -strip "$TMP/og-image.png"
publish "$TMP/og-image.png" og-image.png

# Square social card @ 1080x1080 — colored icon centered on muted-teal background.
magick -size 1080x1080 "xc:$TEAL_MUTED" \
  \( "$TMP/logo-icon.png" -resize 600x600 \) -gravity center -composite \
  -strip "$TMP/social-square.png"
publish "$TMP/social-square.png" social-square.png

echo "Logo asset set rebuilt:"
ls -la "$OUT_PUB"/logo-*.{png,svg} "$OUT_PUB"/favicon* "$OUT_PUB"/apple-touch-icon.png "$OUT_PUB"/og-image.png "$OUT_PUB"/social-square.png
