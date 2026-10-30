#!/bin/bash
set -e
study_sandbox_root="$1"
shift
mount --make-rprivate /
for study_mount_dir in usr bin lib lib64 etc; do
    if [ -e "/$study_mount_dir" ]; then
        mount --bind "/$study_mount_dir" "$study_sandbox_root/$study_mount_dir"
        mount -o remount,bind,ro "$study_sandbox_root/$study_mount_dir"
    fi
done
for study_device in null zero random urandom; do
    touch "$study_sandbox_root/dev/$study_device"
    mount --bind "/dev/$study_device" "$study_sandbox_root/dev/$study_device"
done
mount -t proc proc "$study_sandbox_root/proc"
exec chroot "$study_sandbox_root" /usr/bin/env -i \
    HOME=/codex-home CODEX_HOME=/codex-home TMPDIR=/tmp PATH=/usr/bin:/bin \
    HTTP_PROXY="${HTTP_PROXY:-}" HTTPS_PROXY="${HTTPS_PROXY:-}" ALL_PROXY="${ALL_PROXY:-}" \
    http_proxy="${http_proxy:-}" https_proxy="${https_proxy:-}" all_proxy="${all_proxy:-}" \
    WS_PROXY="${WS_PROXY:-}" WSS_PROXY="${WSS_PROXY:-}" \
    /codex exec -m gpt-6-luna -c 'model_reasoning_effort="high"' \
    -c 'approval_policy="never"' -s danger-full-access --skip-git-repo-check \
    --json -C /data -o /data/answer.json -
