#!/bin/bash

npm install
[ -f menumotron.zip ] && rm menumotron.zip
zip -r menumotron.zip *.js node_modules
