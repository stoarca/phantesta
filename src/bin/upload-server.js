#! /usr/bin/env babel-node

import path from 'path';
import Phantesta from '../phantesta.js';
import request from 'request';
import fs from 'fs';
import argparse from 'argparse';

let parser = new argparse.ArgumentParser();
parser.addArgument(['--host'], {required: true});
parser.addArgument(['--port'], {required: true});
parser.addArgument(['--screenshotPath'], {required: true});
parser.addArgument(['--identifier'], {required: true});

let args = parser.parseArgs();
let screenshotPath = args.screenshotPath;
let identifier = args.identifier;
let host = args.host;
let port = args.port;

let phantesta = new Phantesta({
  screenshotPath: screenshotPath,
  makeUseOfPhantom: false,
});

const REMOTE_URL = `http://${host}:${port}`;

let sendScreenshots = function(identifier) {
  phantesta.listOfDiffFiles( function (files) {
    for (let i = 0; i < files.length; ++i) {
      let name = path.relative(path.resolve(phantesta.options.screenshotPath), files[i])
          .slice(0, -phantesta.options.diffExt.length);

      let goodImg = phantesta.getGoodPath(name);
      let newImg = phantesta.getNewPath(name);
      let diffImg = phantesta.getDiffPath(name);

      _sendFile(goodImg, name + phantesta.options.goodExt, identifier);
      _sendFile(newImg, name + phantesta.options.newExt, identifier);
      _sendFile(diffImg, name + phantesta.options.diffExt, identifier);
    }
    if (files.length) {
      console.log(`You can view the diffs at http://${host}:${port}/${identifier}/`);
    } else {
      console.log('No files to upload');
    }
  })
};

let _sendFile = function(file, fileName, identifier) {

  let newImageStream = fs.createReadStream(file);

  let newImageReq = request.post(`${REMOTE_URL}/${identifier}/upload/${encodeURIComponent(fileName)}`);

  newImageReq.on('drain', function () {
    newImageStream.resume();
  });
  newImageReq.on('error', function (err) {
    console.error('cannot send file' + ': ' + err);
  });
  newImageStream.on('end', function () {
    console.log('file uploaded');
  });
  newImageStream.on('error', function (err) {
    //consume error if no file exists
  });
  newImageStream.pipe(newImageReq);
};

sendScreenshots(identifier);