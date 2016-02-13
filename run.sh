#!/usr/bin/env sh

SEP=$1
BUILD=$2

cd /drone-ecs-node
node app.js $SEP $BUILD | bunyan