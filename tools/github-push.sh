#!/usr/bin/env bash
# Publish this project to a NEW PRIVATE GitHub repository, safely.
#
#   tools/github-push.sh [repo-name] [--collab user1,user2] [--public] [--dry-run]
#
# Defaults to a private repo named after the package. Safe to re-run: it skips
# whatever is already done (init, commit, repo creation, remote) and just pushes.
#
# Auth, in order of preference:
#   1. gh CLI, already logged in            (brew install gh && gh auth login)
#   2. $GITHUB_TOKEN / $GH_TOKEN            (a classic PAT with the `repo` scope)
# Without one of those it stops and tells you the exact command to run.

set -euo pipefail

cd "$(dirname "$0")/.."
REPO_ROOT="$(pwd)"

REPO_NAME=""
COLLABS=""
VISIBILITY="private"
DRY_RUN=0

while [ $# -gt 0 ]; do
  case "$1" in
    --collab) COLLABS="${2:-}"; shift 2 ;;
    --collab=*) COLLABS="${1#*=}"; shift ;;
    --public) VISIBILITY="public"; shift ;;
    --dry-run) DRY_RUN=1; shift ;;
    -h|--help) sed -n '2,14p' "$0"; exit 0 ;;
    -*) echo "unknown flag: $1" >&2; exit 2 ;;
    *) REPO_NAME="$1"; shift ;;
  esac
done

[ -n "$REPO_NAME" ] || REPO_NAME="$(node -p "require('./package.json').name" 2>/dev/null || basename "$REPO_ROOT")"

say()  { printf '\033[1;32m›\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m!\033[0m %s\n' "$*"; }
die()  { printf '\033[1;31m✗\033[0m %s\n' "$*" >&2; exit 1; }

# ---------------------------------------------------------------- 1. git repo
if [ ! -d .git ]; then
  say "git init (branch: main)"
  git init -q -b main
else
  say "git repository already present"
  git symbolic-ref -q HEAD >/dev/null || git checkout -q -b main
fi

git config user.name  >/dev/null || die "set your identity first:  git config --global user.name  'Your Name'"
git config user.email >/dev/null || die "set your identity first:  git config --global user.email 'you@example.com'"

# ---------------------------------------------------------------- 2. stage
say "staging (respecting .gitignore)"
git add -A

STAGED="$(git diff --cached --name-only)"
[ -n "$STAGED" ] || [ -n "$(git log --oneline -1 2>/dev/null || true)" ] || die "nothing to commit"

# ---------------------------------------------------------------- 3. refuse to leak
# Paths that must never be tracked, whatever .gitignore says.
BANNED="$(printf '%s\n' "$STAGED" | grep -E '(^|/)\.env($|\.)|(^|/)data/|\.(pem|key|p12|pfx)$|(^|/)(secrets|credentials)\.json$|service-account.*\.json$|(^|/)\.netrc$' | grep -v '^\.env\.example$' || true)"
if [ -n "$BANNED" ]; then
  die "refusing to commit files that look sensitive:
$BANNED
Remove them from the index (git rm --cached <path>) or fix .gitignore, then re-run."
fi

# Content scan: a real key pasted into a source file would sail past .gitignore.
SECRET_RE='sk-[A-Za-z0-9_-]{20,}|sk-ant-[A-Za-z0-9_-]{20,}|gsk_[A-Za-z0-9]{20,}|xai-[A-Za-z0-9]{20,}|ghp_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}|AIza[0-9A-Za-z_-]{30,}|-----BEGIN [A-Z ]*PRIVATE KEY-----'
HITS=""
while IFS= read -r f; do
  [ -f "$f" ] || continue
  case "$f" in *.png|*.jpg|*.jpeg|*.webp|*.pdf|*.pptx|*.ico|*.woff*|*.db) continue ;; esac
  if grep -nEI "$SECRET_RE" "$f" >/dev/null 2>&1; then
    HITS="$HITS
$f: $(grep -nEIo "$SECRET_RE" "$f" | head -2 | cut -c1-60)"
  fi
done <<< "$STAGED"
if [ -n "$HITS" ]; then
  die "possible live secret inside tracked files:$HITS
Replace it with a placeholder (see .env.example), then re-run."
fi

# `git add` has already written every blob, so the object store is an honest
# measure of what is about to be uploaded — and it is portable, unlike du --exclude.
say "safety scan clean — $(printf '%s\n' "$STAGED" | grep -c . || true) files staged, $(git count-objects -vH | awk '/^size:/ {print $2 $3}') of objects"

if [ "$DRY_RUN" = 1 ]; then
  say "dry run — files that would be published:"
  printf '%s\n' "$STAGED" | sed 's/^/    /'
  exit 0
fi

# ---------------------------------------------------------------- 4. commit
if git diff --cached --quiet; then
  say "no staged changes — nothing new to commit"
else
  MSG="${COMMIT_MESSAGE:-PaisaPath: AI financial mentor for first-time earners in India}"
  git commit -qm "$MSG"
  say "committed: $(git log --oneline -1)"
fi

# ---------------------------------------------------------------- 5. auth
TOKEN="${GITHUB_TOKEN:-${GH_TOKEN:-}}"
MODE=""
if command -v gh >/dev/null 2>&1 && gh auth status >/dev/null 2>&1; then
  MODE="gh"
elif [ -n "$TOKEN" ]; then
  MODE="api"
else
  cat >&2 <<'EOF'
✗ No GitHub credentials found. Pick one, then re-run this script.

  A. GitHub CLI (recommended — also sets up git auth for every future push)
       brew install gh
       gh auth login            # choose: GitHub.com → HTTPS → login with a web browser

  B. Personal access token (no extra tooling)
       Create one at https://github.com/settings/tokens/new
         - "Tokens (classic)", scope: repo
       Then:
         export GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxxx
EOF
  exit 1
fi

# ---------------------------------------------------------------- 6. owner + repo
if [ "$MODE" = gh ]; then
  OWNER="$(gh api user --jq .login)"
else
  OWNER="$(curl -fsSL -H "Authorization: Bearer $TOKEN" https://api.github.com/user | node -p 'JSON.parse(require("fs").readFileSync(0,"utf8")).login')"
fi
[ -n "$OWNER" ] || die "could not resolve the GitHub account for that credential"
say "account: $OWNER · repo: $OWNER/$REPO_NAME · visibility: $VISIBILITY"

repo_exists() {
  if [ "$MODE" = gh ]; then gh repo view "$OWNER/$REPO_NAME" >/dev/null 2>&1
  else curl -fsSL -o /dev/null -H "Authorization: Bearer $TOKEN" "https://api.github.com/repos/$OWNER/$REPO_NAME"; fi
}

if repo_exists; then
  say "repository already exists — reusing it"
else
  say "creating $VISIBILITY repository"
  if [ "$MODE" = gh ]; then
    gh repo create "$REPO_NAME" "--$VISIBILITY" --disable-wiki >/dev/null
  else
    PRIVATE=true
    if [ "$VISIBILITY" = public ]; then PRIVATE=false; fi
    curl -fsSL -o /dev/null -X POST \
      -H "Authorization: Bearer $TOKEN" -H 'Accept: application/vnd.github+json' \
      https://api.github.com/user/repos \
      -d "{\"name\":\"$REPO_NAME\",\"private\":$PRIVATE,\"has_wiki\":false}" \
      || die "repository creation failed (name already taken on this account?)"
  fi
fi

# ---------------------------------------------------------------- 7. remote + push
REMOTE_URL="https://github.com/$OWNER/$REPO_NAME.git"
if git remote get-url origin >/dev/null 2>&1; then
  git remote set-url origin "$REMOTE_URL"
else
  git remote add origin "$REMOTE_URL"
fi

say "pushing to $REMOTE_URL"
if [ "$MODE" = api ]; then
  # Token goes on stdin-ish via an ephemeral header, never into .git/config.
  git -c "http.$REMOTE_URL.extraheader=Authorization: Bearer $TOKEN" push -u origin main
else
  git push -u origin main
fi

# ---------------------------------------------------------------- 8. collaborators
if [ -n "$COLLABS" ]; then
  IFS=',' read -ra USERS <<< "$COLLABS"
  for u in "${USERS[@]}"; do
    u="$(echo "$u" | tr -d '[:space:]')"; [ -n "$u" ] || continue
    say "inviting $u (push access)"
    if [ "$MODE" = gh ]; then
      gh api -X PUT "repos/$OWNER/$REPO_NAME/collaborators/$u" -f permission=push >/dev/null \
        && echo "    invited" || warn "could not invite $u — check the username"
    else
      curl -fsSL -o /dev/null -X PUT -H "Authorization: Bearer $TOKEN" \
        "https://api.github.com/repos/$OWNER/$REPO_NAME/collaborators/$u" -d '{"permission":"push"}' \
        && echo "    invited" || warn "could not invite $u — check the username"
    fi
  done
fi

say "done → https://github.com/$OWNER/$REPO_NAME"
[ -n "$COLLABS" ] || say "share it later:  tools/github-push.sh $REPO_NAME --collab friend1,friend2"
