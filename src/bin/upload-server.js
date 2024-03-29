#! /usr/bin/env babel-node

import path from 'path';
import Phantesta from '../phantesta.js';
import request from 'request';
import fs from 'fs';
import argparse from 'argparse';

let parser = new argparse.ArgumentParser();
parser.add_argument(['--url'], {required: true});
parser.add_argument(['--screenshotPath'], {required: true});
parser.add_argument(['--identifier'], {required: true});
parser.add_argument(['--goodExt'], {required: false});
parser.add_argument(['--newExt'], {required: false});
parser.add_argument(['--diffExt'], {required: false});

let args = parser.parseArgs();
let screenshotPath = args.screenshotPath;
let identifier = args.identifier;
let url = args.url;
let goodExt = args.goodExt;
let newExt = args.newExt;
let diffExt = args.diffExt;

let phantesta = new Phantesta({
  screenshotPath: screenshotPath,
  goodExt: goodExt,
  newExt: newExt,
  diffExt: diffExt
});

const REMOTE_URL = `${url}/${identifier}`;

let sendScreenshots = function(identifier) {
  phantesta.listOfDiffFiles( function (files) {
    for (let i = 0; i < files.length; ++i) {
      let name = path.relative(
        path.resolve(phantesta.options.screenshotPath), files[i]
      ).slice(0, -phantesta.options.diffExt.length);

      let goodImg = phantesta.getGoodPath(name);
      let newImg = phantesta.getNewPath(name);
      let diffImg = phantesta.getDiffPath(name);

      _sendFile(
        goodImg,
        _getFileName(name, 'good', _getFileType(phantesta.options.goodExt)),
        identifier
      );

      _sendFile(
        newImg,
        _getFileName(name, 'new', _getFileType(phantesta.options.newExt)),
        identifier
      );

      _sendFile(
        diffImg,
        _getFileName(name, 'diff', _getFileType(phantesta.options.diffExt)),
        identifier
      );
    }
    if (files.length) {
      console.log(
        `You can view the diffs at ${REMOTE_URL}`
      );
    } else {
      console.log('No files to upload');
    }
  })
};

const _getFileType = function(ext) {
  const splitExt = ext.split('.');
  return splitExt[splitExt.length - 1];
};

const _getFileName = function(fileName, remoteExt, fileType) {
  return `${fileName}.${remoteExt}.${fileType}`;
};

let _sendFile = function(file, fileName) {
  let newImageStream = fs.createReadStream(file);

  let newImageReq = request.post(
    `${REMOTE_URL}/upload/${encodeURIComponent(fileName)}`
  );

  newImageReq.on('drain', function () {
    newImageStream.resume();
  });

  newImageReq.on('error', function (err) {
    console.error('cannot send file ' + fileName + ': ' + err);
  });

  newImageReq.on('response', function(resp) {
    if (resp.statusCode !== 200) {
      resp.on('data', function(data) {
        console.error('cannot send file ' + fileName);
        console.error(data.toString('utf8'));
      });
    }
  });

  newImageStream.on('end', function () {
    console.log('file uploaded');
  });

  newImageStream.on('error', function (err) {
    console.error('cannot send file ' + fileName + ': ' + err);
  });

  newImageStream.pipe(newImageReq);
};

sendScreenshots(identifier);
