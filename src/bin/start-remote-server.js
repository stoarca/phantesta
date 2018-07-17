#! /usr/bin/env babel-node

import RemoteServer from '../remote_server.js';
import argparse from 'argparse';

let parser = new argparse.ArgumentParser();
parser.addArgument(['--port'], {required: false});
parser.addArgument(['--savePath'], {required: false});
parser.addArgument(['--maxPhantestaServers'], {required: false});

let args = parser.parseArgs();
let port = args.port;
let screenshotPath = args.savePath;
let maxPhantesta = args.maxPhantestaServers;

let options = {
  port: port,
  screenshotPath: screenshotPath,
  maxPhantestaServers: maxPhantesta,
};


new RemoteServer(options).startServer();