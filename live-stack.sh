#!/bin/zsh
# Live-стек Moment Mints под launchd: захват + минтер + live-паблишер.
# Управляется агентом com.momentmints.live (см. README-DEMO.md):
#   запустить:   launchctl load ~/Library/LaunchAgents/com.momentmints.live.plist
#   остановить:  launchctl unload ~/Library/LaunchAgents/com.momentmints.live.plist
# caffeinate -s не даёт Маку заснуть, пока он на питании от сети.
cd "$(dirname "$0")"
export PATH="/usr/local/bin:/opt/homebrew/bin:$PATH"
node day1/capture.mjs >> day1/capture.log 2>&1 &
node mint/minter.mjs >> mint/minter.log 2>&1 &
node gallery/publish.mjs >> gallery/publish.log 2>&1 &
exec caffeinate -s
