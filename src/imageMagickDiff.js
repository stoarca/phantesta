import child_process from 'child_process';
import path from 'path';

var DimensionOfImage;

//TODO: for very large images, perhaps split it into smaller pieces and
// then compare to optimize ?
var doDiff = async function(filename1, filename2, diffFile,
                            includeOnlyBoxes, skipBoxes) {

  var colourOfDiff = '"rgba(255, 0, 255, 255)"';//inner double quotes necessary

  var paddedImages = await resizeImages(filename1, filename2);
  var paddedImage1 = paddedImages[0];
  var paddedImage2 = paddedImages[1];

  if(!!includeOnlyBoxes && includeOnlyBoxes.length) {
    await includeOnlyAsync([paddedImage1, paddedImage2], includeOnlyBoxes);
  }

  if(!!skipBoxes && skipBoxes.length) {
    await maskOutAsync([paddedImage1, paddedImage2], skipBoxes);
  }

  return new Promise(function (resolve) {

    diffFile = diffFile || 'miff:';

    var compare_process = child_process.exec('compare -metric AE' + ' '
        + '-highlight-color'  + ' ' + colourOfDiff + ' '
        + paddedImage1 + ' ' + paddedImage2 + ' ' + diffFile  + ' && '
        + 'rm' + ' ' + paddedImage1 + ' ' + paddedImage2);

    compare_process.on('exit', function (code) {
      if(code === 0) {
        resolve(false);
      } else {
        resolve(true);
      }
    })
  });
};

var extensionAddedName = function (extension, filePath) {
  return path.join(path.dirname(filePath), extension + path.basename(filePath));
};

var resizeImages = async function(filename1, filename2) {

  var paddedImage1 = extensionAddedName('padded+', filename1);
  var paddedImage2 = extensionAddedName('padded+', filename2);

  var [height1, height2, width1, width2] = (await Promise.all([
    checkStdOut('convert' + ' ' + filename1 + ' ' + '-ping -format "%h" info:'),
    checkStdOut('convert' + ' ' + filename2 + ' ' + '-ping -format "%h" info:'),
    checkStdOut('convert' + ' ' + filename1 + ' ' + '-ping -format "%w" info:'),
    checkStdOut('convert' + ' ' + filename2 + ' ' + '-ping -format "%w" info:')
  ])).map((value => parseInt(value, 10)));

  DimensionOfImage = Math.max(width1, width2) + 'x' + Math.max(height1, height2);

  var process1 = runCmdAsPromise('convert' + ' ' +  filename1 +  ' '
      + '-resize' + ' ' + DimensionOfImage + ' ' +
      '-gravity center' + ' ' + '-background white' + ' '
      + '-extent' + ' ' + DimensionOfImage + ' ' + paddedImage1);

  var process2 = runCmdAsPromise('convert' + ' ' +  filename2 +  ' '
      + '-resize' + ' ' + DimensionOfImage + ' ' +
      '-gravity center' + ' ' + '-background white' + ' '
      + '-extent' + ' ' + DimensionOfImage + ' ' + paddedImage2);

  await Promise.all([process1, process2]);

  return [ paddedImage1, paddedImage2 ];
};

var includeOnlyAsync = function (imagePaths, includeBoxes) {

  var colourOfCanvas = '"rgba(0, 255, 255, 255)"';//inner double quotes necessary

  return Promise.all(imagePaths.map(function(imagePath) {

    return new Promise(function (resolve) {

      var canvas = extensionAddedName('canvas+', imagePath);

      var imageMagickCmd = '' ;

      includeBoxes.forEach(function(includeBox, index) {

        var dimensionOfBox = includeBox.w + 'x' + includeBox.h;
        var coordinatesOfBox = '+' + includeBox.x + '+' + includeBox.y;

        var imageToCrop = index === 0 ? canvas : '+clone';
        var ifSave = index === includeBoxes.length - 1 ? '-write' + ' '
            + canvas + ' ' : '';

        //chain up a command to crop out all pieces in single command
        imageMagickCmd = imageMagickCmd + ' ' + '\\(' + ' ' + imageToCrop + ' '
            + '\\(' + ' ' + imagePath + ' ' + '-crop' + ' ' + dimensionOfBox +
            coordinatesOfBox + ' ' + '\\)' + ' ' + '-geometry' + ' ' +
            coordinatesOfBox + ' '  + '-composite' + ' ' + ifSave + '\\)';

      });
      //create a canvas of size DimensionOfImage and
      // then compose cropped required areas on it
      child_process.execSync('convert' + ' ' + '-size' + ' ' + DimensionOfImage
          + ' ' + 'canvas:' + colourOfCanvas + ' ' + canvas + ' && '
          + 'convert' + imageMagickCmd + ' ' + 'miff:' + ' && '
          + 'cp' + ' ' + canvas + ' ' + imagePath);  //overwrite imagePath

      resolve();
    })
  }));
};

var maskOutAsync = function (imagePaths, skipBoxes) {

  var colourOfBox = '"rgba(0, 255, 255, 255)"'; //inner double quotes necessary

  return Promise.all(imagePaths.map(function(imagePath) {
    return new Promise(function (resolve) {

      var imageMagickCmd = '' ;

      skipBoxes.forEach(function(skipBox, index) {

        var dimensionOfBox = skipBox.w + 'x' + skipBox.h;
        var coordinatesOfBox = '+' + skipBox.x + '+' + skipBox.y;

        var imageToDrawOn = index === 0 ? imagePath : '+clone';
        var ifSave = index === skipBoxes.length - 1 ? '-write' + ' '
            + imagePath + ' ' : '';

        //chain up a command to draw all the skip boxes in one command
        imageMagickCmd = imageMagickCmd + ' ' + '\\(' + ' ' + imageToDrawOn + ' '
            + '-size' + ' ' + dimensionOfBox + ' ' + 'xc:' + colourOfBox + ' '
            + '-geometry' + ' ' +  coordinatesOfBox + ' '
            + '-compose over -composite' + ' ' + ifSave + '\\)';
      });

      //overlay black box over skipped areas
      child_process.execSync('convert' + imageMagickCmd + ' ' + 'miff:');
      resolve();
    });
  }));
};

var runCmdAsPromise = function(cmdToRun) {

  return new Promise(function (resolve, reject) {
    var process_to_run = child_process.exec(cmdToRun);
    process_to_run.on('exit', function (code) {
      if (code === 0) {
        resolve(0);
      } else {
        reject();
      }
    })
  })
};

var checkStdOut = function(cmdToRun) {

  return new Promise(function (resolve, reject) {

    var stdOut = '';
    var running_process = child_process.exec(cmdToRun);

    running_process.stdout.on('data', function(data) {
      stdOut = stdOut.concat(data);
    });
    running_process.on('exit', function(code) {
      if(code === 0) {
        resolve(stdOut);
      } else {
        reject();
      }
    })
  });
};

export default doDiff;


