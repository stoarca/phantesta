#! /usr/bin/env bash

set -eu -o pipefail

rm -rf /tmp/.X50-lock && Xvfb :50 -screen 0 2560x1600x24 -ac -noreset &

sleep 1

export DISPLAY=:50

fluxbox > /var/log/fluxbox.log 2>&1 &

cd /phantesta
npm test

