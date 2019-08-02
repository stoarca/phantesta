#! /usr/bin/env bash

set -eu -o pipefail

docker build -t phantesta:latest .

docker rm -v phantesta_tests || true

docker run -it -v "$(pwd)/:/phantesta" --name phantesta_tests phantesta:latest /phantesta/test.sh
