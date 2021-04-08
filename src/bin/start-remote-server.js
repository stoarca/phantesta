#! /usr/bin/env babel-node

import RemoteServer from '../remote_server.js';
import argparse from 'argparse';

let parser = new argparse.ArgumentParser();
parser.add_argument(['--port'], {required: false});
parser.add_argument(['--savePath'], {required: false});

let args = parser.parseArgs();
let port = args.port;
let screenshotPath = args.savePath;

let options = {
  port: port,
  screenshotPath: screenshotPath
};

new RemoteServer(options).startServer();