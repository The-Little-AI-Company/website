#!/usr/bin/env bash
# Usage: live.sh OUT_DIR [SITE]. Needs only bash, curl, grep and sed, so it runs on any
# host that can reach production. It collects. It does not judge: checks.mjs and the live
# replay in browser.mjs read OUT_DIR.
# Prints LIVE_RESULT=done, or LIVE_RESULT=fail when a page could not be fetched at all.
set -uo pipefail
out=${1:?usage: live.sh OUT_DIR [SITE]}
site=${2:-https://littleaicompany.com}
mkdir -p "$out/pages" "$out/files" || exit 1
ua='littleaicompany-verify/1 (+https://github.com/The-Little-AI-Company/website)'

fetch() { # fetch URL FILE: body to FILE, headers to FILE.headers, prints the status
  curl -sS -A "$ua" --max-time 30 -D "$2.headers" -o "$2" -w '%{http_code}' "$1" 2>"$2.err" || true
}

# resolve BASE REF: prints REF as an absolute URL against BASE, without its fragment.
# Prints nothing for a same-page fragment and for mailto:, tel:, data: and javascript:.
resolve() {
  local base=$1 ref=${2%%#*} query='' path seg
  local -a parts=() out=()
  case $ref in
    '' | mailto:* | tel:* | data:* | javascript:*) return ;;
    http://* | https://*) echo "$ref"; return ;;
    //*) echo "https:$ref"; return ;;
  esac
  local rest=${base#*://}; local origin="${base%%://*}://${rest%%/*}"
  case $ref in
    /*) path=$ref ;;
    *) local dir=${base#"$origin"}; dir=${dir%%\?*}; path="${dir%/*}/$ref" ;;
  esac
  case $path in *\?*) query="?${path#*\?}"; path=${path%%\?*} ;; esac
  IFS=/ read -ra parts <<< "${path#/}"
  for seg in "${parts[@]}"; do
    case $seg in
      . | '') ;;
      ..) [ ${#out[@]} -gt 0 ] && unset 'out[${#out[@]}-1]' ;;
      *) out+=("$seg") ;;
    esac
  done
  local joined; joined=$(IFS=/; echo "${out[*]}")
  case $path in */ | */. | */..) [ -n "$joined" ] && joined="$joined/" ;; esac
  echo "$origin/$joined$query"
}

# refs FILE: the URL in every href, src, poster, data and srcset attribute (double-quoted,
# single-quoted or bare), the og/twitter image, and every url() in an HTML file. The same set
# checks.mjs collects from the local build.
refs() {
  local value="(\"[^\"]*\"|'[^']*'|[^[:space:]\"'>]+)"
  local unquote="s/^[^=]*=[[:space:]]*//; s/^[\"']//; s/[\"']\$//"
  { grep -oiE "[[:space:]](href|src|poster|data)[[:space:]]*=[[:space:]]*$value" "$1" | sed -E "$unquote"
    grep -oiE "[[:space:]]srcset[[:space:]]*=[[:space:]]*$value" "$1" | sed -E "$unquote" |
      tr ',' '\n' | sed -E 's/^[[:space:]]+//; s/[[:space:]].*$//'
    grep -oiE "<meta [^>]*(og:image|twitter:image)[\"'][^>]*>" "$1" |
      grep -oiE "[[:space:]]content[[:space:]]*=[[:space:]]*$value" | sed -E "$unquote"
    grep -oE 'url\([^)]*\)' "$1" | sed -E "s/^url\(['\"]?//; s/['\"]?\)$//"
  } | sed '/^$/d; s/&amp;/\&/g'
}

status=done
printf 'site %s\nstarted %s\nepoch %s\n' "$site" "$(date -u +%FT%TZ)" "$(date -u +%s)" > "$out/meta.txt"
: > "$out/pages.tsv"
: > "$out/urls.tsv"
for pair in home=/ callout=/callout/ vivary=/vivary/ about=/about/ contact=/contact/ \
            notfound=/does-not-exist/ robots=/robots.txt sitemap=/sitemap.xml; do
  name=${pair%%=*} path=${pair#*=}
  code=$(fetch "$site$path" "$out/pages/$name")
  printf '%s\t%s\t%s\n' "$name" "$path" "$code" >> "$out/pages.tsv"
  case $code in 200 | 404) ;; *) status=fail ;; esac
  case $name in robots | sitemap) continue ;; esac
  refs "$out/pages/$name" | while IFS= read -r ref; do
    abs=$(resolve "$site$path" "$ref"); [ -n "$abs" ] && printf '%s\t%s\n' "$abs" "$path" >> "$out/urls.tsv"
  done
done

: > "$out/same-origin.tsv"
: > "$out/external.tsv"
: > "$out/css.txt"
check_own() { # check_own URL: status of a same-origin URL. Stylesheets are kept and read too.
  local url=$1 rel=${1#"$site"} file
  rel=${rel%%\?*}; [ -z "$rel" ] && rel=/
  case $rel in
    *.css)
      file="$out/files$rel"; mkdir -p "$(dirname "$file")"
      code=$(curl -sS -A "$ua" --max-time 30 -o "$file" -w '%{http_code}' "$url" 2>/dev/null || true)
      printf '%s\t%s\n' "${code:-000}" "$url" >> "$out/same-origin.tsv"
      { printf '/* %s */\n' "$rel"; cat "$file"; echo; } >> "$out/css.txt"
      grep -oE 'url\([^)]*\)' "$file" | sed -E "s/^url\(['\"]?//; s/['\"]?\)$//" | sort -u |
        while IFS= read -r ref; do
          abs=$(resolve "$url" "$ref"); [ -n "$abs" ] && printf '%s\t%s\n' "$abs" "$rel" >> "$out/urls.tsv"
        done ;;
    *)
      code=$(curl -sS -A "$ua" --max-time 30 -o /dev/null -w '%{http_code}' "$url" 2>/dev/null || true)
      printf '%s\t%s\n' "${code:-000}" "$url" >> "$out/same-origin.tsv" ;;
  esac
}
# Pages first, so stylesheet assets join the list before the second pass.
for _ in 1 2; do
  cut -f1 "$out/urls.tsv" | sort -u | while IFS= read -r url; do
    grep -qxF "$url" <(cut -f2 "$out/same-origin.tsv"; cut -f2 "$out/external.tsv") && continue
    case $url in
      "$site" | "$site"/*) check_own "$url" ;;
      http://* | https://*)
        code=$(curl -sS -A "$ua" --max-time 20 -L -o /dev/null -w '%{http_code}' "$url" 2>/dev/null || true)
        printf '%s\t%s\n' "${code:-000}" "$url" >> "$out/external.tsv" ;;
    esac
  done
done

printf 'finished %s\n' "$(date -u +%FT%TZ)" >> "$out/meta.txt"
echo "LIVE_RESULT=$status pages $(wc -l < "$out/pages.tsv") same-origin $(wc -l < "$out/same-origin.tsv") external $(wc -l < "$out/external.tsv") out $out"
[ "$status" = done ]
