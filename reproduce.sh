#!/bin/bash
set -e

WORK=$(cd "$(dirname "$0")" && pwd)
REPO=$(dirname "$(dirname "$WORK")")
cd "$WORK"
rm -rf patch_a.patch patch_b.patch patch_c.patch idx_* patch

cd "$REPO"
git checkout -- .

GIT_DIR="$REPO/.git"
export GIT_DIR

BASE_TREE=$(git rev-parse HEAD^{tree})

cd "$WORK"

cat > patch_a.patch << 'EOF'
diff --git a/foo/bar/kram.md b/foo/bar/kram.md
index 56fbd64..afa1745 100644
--- a/foo/bar/kram.md
+++ b/foo/bar/kram.md
@@ -1,7 +1,16 @@
 here's a change
 
+kjfahsdlfjhas asdf asdf asdf sadfasdf
 
 and one here
 
 
 and here!
+
+
+ sdaf
+s
+sdf
+asdfj
+
+dfasdfa
EOF

cat > patch_b.patch << 'EOF'
diff --git a/foo/bar/kram.md b/foo/bar/kram.md
index 56fbd64..9445a69 100644
--- a/foo/bar/kram.md
+++ b/foo/bar/kram.md
@@ -1,7 +1,20 @@
 here's a change
 
+kjfahsdlfjhas asdf asdf asdf sadfasdf
+
+MODIFIED LINE FOR PATCH B
 
 and one here
 
 
 and here!
+
+
+ sdaf
+s
+sdf
+asdfj
+
+dfasdfa
+
+ADDITIONAL CONTENT AT END
diff --git a/foo/bar/quz.md b/foo/bar/quz.md
index e69de29..c55f103 100644
--- a/foo/bar/quz.md
+++ b/foo/bar/quz.md
@@ -0,0 +1,2 @@
+
+new content in quz.md
diff --git a/foo/baz/skam.md b/foo/baz/skam.md
index e69de29..3e428e6 100644
--- a/foo/baz/skam.md
+++ b/foo/baz/skam.md
@@ -0,0 +1,2 @@
+
+skam modified too
EOF

GIT_INDEX_FILE="$WORK/idx_a" git read-tree HEAD
GIT_INDEX_FILE="$WORK/idx_a" git apply --cached "$WORK/patch_a.patch"
TREE_A=$(GIT_INDEX_FILE="$WORK/idx_a" git write-tree)

GIT_INDEX_FILE="$WORK/idx_b" git read-tree HEAD
GIT_INDEX_FILE="$WORK/idx_b" git apply --cached "$WORK/patch_b.patch"
TREE_B=$(GIT_INDEX_FILE="$WORK/idx_b" git write-tree)

git diff-tree -p $TREE_A $TREE_B > "$WORK/patch_c.patch"

mkdir -p patch/a patch/b patch/c

GIT_INDEX_FILE="$WORK/idx_base" git read-tree HEAD
GIT_INDEX_FILE="$WORK/idx_base" git checkout-index -a --prefix="$WORK/patch/a/"
patch -s -p1 -d "$WORK/patch/a" < "$WORK/patch_a.patch"

GIT_INDEX_FILE="$WORK/idx_base" git checkout-index -a --prefix="$WORK/patch/b/"
patch -s -p1 -d "$WORK/patch/b" < "$WORK/patch_b.patch"

GIT_INDEX_FILE="$WORK/idx_base" git checkout-index -a --prefix="$WORK/patch/c/"
patch -s -p1 -d "$WORK/patch/c" < "$WORK/patch_a.patch"
patch -s -p1 -d "$WORK/patch/c" < "$WORK/patch_c.patch"

hash_dir() {
    find "$1" -type f | sort | xargs -I{} sh -c 'echo "$(basename {}): $(sha256sum < "{}" | cut -d" " -f1)"'
}

echo "=== patch/b hashes ==="
HASH_B=$(hash_dir patch/b)
echo "$HASH_B"

echo "=== patch/c hashes (base + a + c) ==="
HASH_C=$(hash_dir patch/c)
echo "$HASH_C"

if [ "$HASH_B" = "$HASH_C" ]; then
    echo "VERIFIED: patch/b == patch/c"
else
    echo "MISMATCH"
    exit 1
fi
