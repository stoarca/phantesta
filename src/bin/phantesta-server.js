#! /usr/bin/env babel-node

import argparse from 'argparse';
import Phantesta from '../phantesta';

var parser = new argparse.ArgumentParser();
parser.addArgument(['--host'], {required: true});
parser.addArgument(['--port'], {required: true});
parser.addArgument(['--screenshotPath'], {required: true});
var args = parser.parseArgs();

var phantesta = new Phantesta(
    { screenshotPath: args.screenshotPath,
      makeUseOfPhantom: false,
    });
phantesta.startServer({
  host: args.host,
  port: args.port,
});
