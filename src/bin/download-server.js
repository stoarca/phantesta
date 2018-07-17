#! /usr/bin/env babel-node

import request_promise from 'request-promise';
import request from 'request';
import mkdirp from 'mkdirp';
import fs from 'fs';
import path from  'path';
import argparse from  'argparse';
import _  from 'underscore';

let parser = new argparse.ArgumentParser();
parser.addArgument(['--host'], {required: true});
parser.addArgument(['--port'], {required: true});
parser.addArgument(['--identifier'], {required: true});
parser.addArgument(['--downloadPath'], {required: true});
parser.addArgument(['--allFiles'], {required: false});

let args = parser.parseArgs();
let downloadPath = args.downloadPath;
let identifier = args.identifier;
let host = args.host;
let port = args.port;
let allFiles = args.allFiles === 'true' || false;

const REMOTE_URL = `http://${host}:${port}/${identifier}`;

let downloadFile = function (filePath) {

  let encodedFilePath = encodeURIComponent(filePath);
  let dir = path.dirname(filePath);
  let name = path.basename(filePath);

  //make sure directory exists
  mkdirp(`${downloadPath}/${dir}`, function (err) {
    if (err) {
      console.error(err);
      return ;
    }

    let req = request.get(`${REMOTE_URL}/download/${encodedFilePath}`);

    let dst = fs.createWriteStream(`${downloadPath}/${dir}/${name}`);

    dst.on('drain', function() {
      req.resume();
    });

    req.on('end', function () {
      console.log(`downloaded ${filePath}`);
    });

    dst.on('error', function (err) {
      console.error(err);
    });

    req.pipe(dst);
  });

};

(async function () {

  let file_list = await request_promise({
    method: 'POST',
    uri: `${REMOTE_URL}/list_files`,
    body: {allFiles: allFiles},
    json: true,
  });

  if (!file_list) {
    console.log('No files to download. Please make sure you have uploaded the files');
    return;
  }

  file_list = JSON.parse(JSON.stringify(file_list));

  if (_.isEmpty(file_list)) {
    let additionalMsg = allFiles && ' ' || 'Please make sure you have accepted/deleted ' +
        'all diffs on the remote server or use --allFiles true';
    console.log(`No files to download ${additionalMsg}`);
    return;
  }

  for (let i in file_list) {
    if(file_list.hasOwnProperty(i)) {
      downloadFile(file_list[i]);
    }
  }
})();