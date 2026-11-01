#!/usr/bin/env bash
# Usage: live.sh OUT_DIR [SITE]. Needs only bash, curl and grep, so it runs on any host
# that can reach production. It collects. It does not judge: checks.mjs reads OUT_DIR.
# Prints LIVE_RESULT=done, or LIVE_RESULT=fail when a page could not be fetched at all.
set -uo pipefail
out=${1:?usage: live.sh OUT_DIR [SITE]}
site=${2:-https://littleaicompany.com}
mkdir -p "$out/pages" || exit 1
ua='littleaicompany-verify/1 (+https://github.com/The-Little-AI-Company/website)'

fetch() { # fetch URL FILE: body to FILE, headers to FILE.headers, prints the status
  curl -sS -A "$ua" --max-time 30 -D "$2.headers" -o "$2" -w '%{http_code}' "$1" 2>"$2.err" || true
}

status=done
printf 'site %s\nstarted %s\nepoch %s\n' "$site" "$(date -u +%FT%TZ)" "$(date -u +%s)" > "$out/meta.txt"
for pair in home=/ callout=/callout/ vivary=/vivary/ about=/about/ contact=/contact/ \
            notfound=/does-not-exist/ robots=/robots.txt sitemap=/sitemap.xml; do
  name=${pair%%=*} path=${pair#*=}
  code=$(fetch "$site$path" "$out/pages/$name")
  printf '%s\t%s\t%s\n' "$name" "$path" "$code" >> "$out/pages.tsv"
  case $code in 200|404) ;; *) status=fail ;; esac
done

# Every URL the pages and their stylesheets load or link, one per line.
{
  cat "$out"/pages/{home,callout,vivary,about,contact,notfound} |
    grep -oE '(href|src|content)="[^"]*"' | sed -E 's/^[a-z]+="//; s/"$//'
  cat "$out"/pages/{home,callout,vivary,about,contact,notfound} |
    grep -oE 'srcset="[^"]*"' | sed -E 's/^srcset="//; s/"$//' | tr ',' '\n' | sed -E 's/^ +//; s/ .*$//'
} | sed 's/&amp;/\&/g' | sort -u > "$out/urls.txt"

: > "$out/same-origin.tsv"
: > "$out/external.tsv"
: > "$out/css.txt"
while IFS= read -r url; do
  case $url in
    //*) url="https:$url" ;;
    /*) url="$site$url" ;;
  esac
  case $url in
    "$site"|"$site"/*)
      code=$(curl -sS -A "$ua" --max-time 30 -o /dev/null -w '%{http_code}' "$url" 2>/dev/null || true)
      printf '%s\t%s\n' "${code:-000}" "$url" >> "$out/same-origin.tsv"
      case $url in *.css) curl -sS -A "$ua" --max-time 30 "$url" >> "$out/css.txt" 2>/dev/null ;; esac ;;
    http://*|https://*)
      code=$(curl -sS -A "$ua" --max-time 20 -L -o /dev/null -w '%{http_code}' "$url" 2>/dev/null || true)
      printf '%s\t%s\n' "${code:-000}" "$url" >> "$out/external.tsv" ;;
  esac
done < "$out/urls.txt"

# Assets the stylesheets pull in (fonts, images) are same-origin requests too.
grep -oE 'url\([^)]*\)' "$out/css.txt" | sed -E "s/^url\(['\"]?//; s/['\"]?\)$//" | sort -u |
while IFS= read -r ref; do
  case $ref in
    data:*) continue ;;
    /*) url="$site$ref" ;;
    http://*|https://*) url=$ref ;;
    *) url="$site/_astro/$ref" ;;
  esac
  code=$(curl -sS -A "$ua" --max-time 30 -o /dev/null -w '%{http_code}' "$url" 2>/dev/null || true)
  printf '%s\t%s\n' "${code:-000}" "$url" >> "$out/same-origin.tsv"
done

printf 'finished %s\n' "$(date -u +%FT%TZ)" >> "$out/meta.txt"
echo "LIVE_RESULT=$status pages $(wc -l < "$out/pages.tsv") same-origin $(wc -l < "$out/same-origin.tsv") external $(wc -l < "$out/external.tsv") out $out"
[ "$status" = done ]
