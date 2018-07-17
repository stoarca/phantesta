import child_process from 'child_process';
import path from 'path';
import fs from 'fs'

var dimensionOfImage;

//TODO: for very large images, perhaps split it into smaller pieces and
// then compare to optimize ?
var doDiff = async function(filename1, filename2, diffFile, skipBoxes, includeBoxes) {

  var colourOfDiff = '"rgba(255, 0, 255, 255)"';//inner double quotes necessary

  var paddedImages = await resizeImages(filename1, filename2); //necessary since images might not be of same size
  var paddedImage1 = paddedImages[0];
  var paddedImage2 = paddedImages[1];

  if(!!includeBoxes && includeBoxes.length) {
    await includeOnlyAsync([paddedImage1, paddedImage2], includeBoxes);
  }

  if (!!skipBoxes && skipBoxes.length) {
    await maskOutAsync([paddedImage1, paddedImage2], skipBoxes);
  }

  return new Promise(function(resolve) {

    diffFile = diffFile || 'null:';

    var compare_process = child_process.exec(
        `compare \\
        -metric AE \\
        -highlight-color ${colourOfDiff} \\
        ${paddedImage1} ${paddedImage2} ${diffFile}`
    );

    compare_process.on('exit', function(code) {
      if (code === 0) {
        resolve(false);
      } else {
        resolve(true);
      }
    })
  });
};

var extensionAddedName = function(extension, filePath) {
  return path.join('/dev/shm', extension + path.basename(filePath));
};

var resizeImages = async function(filename1, filename2) {

  var colourOfBkg = '"rgba(0, 255, 255, 255)"'; //inner double quotes necessary

  var paddedImage1 = extensionAddedName('padded+', filename1);
  var paddedImage2 = extensionAddedName('padded+', filename2);

  var [height1, height2, width1, width2] = (
      await Promise.all([
    checkStdOut(`identify -format "%h" ${filename1}`),
    checkStdOut(`identify -format "%h" ${filename2}`),
    checkStdOut(`identify -format "%w" ${filename1}`),
    checkStdOut(`identify -format "%w" ${filename2}`)
  ])).map((value => parseInt(value, 10)));

  dimensionOfImage = `${Math.max(width1, width2)}x${Math.max(height1, height2)}`;

  var process1, process2;

  if (height1 === height2 && width1 === width2) {

    process1 = runCmdAsPromise(`cp ${filename1} ${paddedImage1}`);
    process2 = runCmdAsPromise(`cp ${filename2} ${paddedImage2}`);

  } else {

    process1 = runCmdAsPromise(
        `convert ${filename1} \\
        -background ${colourOfBkg} \\
        -gravity center \\
        ${paddedImage1}`
    );
    process2 = runCmdAsPromise(
        `convert ${filename2} \\
        -background ${colourOfBkg} \\
        -gravity center \\
        ${paddedImage2}`
    );
    
  }

  await Promise.all([process1, process2]);

  return [ paddedImage1, paddedImage2 ];
};

var includeOnlyAsync = function (imagePaths, includeBoxes) {

  var colourOfCanvas = '"rgba(0, 255, 255, 255)"';//inner double quotes necessary

  return Promise.all(imagePaths.map(function(imagePath) {
    return new Promise(function (resolve) {

      var canvas = extensionAddedName('canvas+', imagePath);

      var imageMagickCmd = '' ;

      includeBoxes.forEach(function(includeBox) {

        var dimensionOfBox = `${includeBox.w}x${includeBox.h}`;
        var coordinatesOfBox = `+${includeBox.x}+${includeBox.y}`;

        //chain up a command to crop out all pieces in single command
        imageMagickCmd +=
            ` \\( ${imagePath} -crop ${dimensionOfBox}${coordinatesOfBox} \\) \\
            -geometry ${coordinatesOfBox} \\
            -composite`;

      });

      //create a canvas of size DimensionOfImage and
      // then compose cropped required areas on it
      child_process.execSync(
          `convert -size ${dimensionOfImage} \\
          canvas:${colourOfCanvas} \\
          ${imageMagickCmd} \\
          ${canvas} && \\
          cp ${canvas} ${imagePath}` //overwrite imagePath
          );

      resolve();
    })
  }));
};


var maskOutAsync = function(imagePaths, skipBoxes) {

  var colourOfBox = '"rgba(0, 255, 255, 255)"'; //inner double quotes necessary

  return Promise.all(imagePaths.map(function(imagePath) {
    return new Promise(async function(resolve) {

      var rectanglesToDraw = '';

      await Promise.all(skipBoxes.map(function(skipBox) {
        return new Promise(function(resolve) {
          var topLeftCoordinatesOfBox =
              `${skipBox.x},${skipBox.y}`;
          var bottomRightCoordinatesOfBox =
              `${skipBox.x + skipBox.w},${skipBox.y + skipBox.h}`;

          //chain up a command to draw all the skip boxes in one command
          rectanglesToDraw = `${rectanglesToDraw} \\
          rectangle ${topLeftCoordinatesOfBox} ${bottomRightCoordinatesOfBox}`;

          resolve();
        })
      }));

      //overlay box over skipped areas
      child_process.execSync(
          `convert ${imagePath} \\
          -fill ${colourOfBox} \\
          -draw "${rectanglesToDraw}" \\
          ${imagePath}`
      );

      resolve();
    });
  }));
};

var runCmdAsPromise = function(cmdToRun) {

  return new Promise(function(resolve, reject) {
    var process_to_run = child_process.exec(cmdToRun);
    process_to_run.on('exit', function(code) {
      if (code === 0) {
        resolve();
      } else {
        reject();
      }
    })
  })
};

var checkStdOut = function(cmdToRun) {
  return new Promise(function(resolve, reject) {
    var stdOut = '';
    var running_process = child_process.exec(cmdToRun);

    running_process.stdout.on('data', function(data) {
      stdOut = stdOut.concat(data);
    });
    running_process.on('exit', async function(code) {

      //to get around the fact that
      // fs.writeFileSync doesnt actually synchronously write to the file system
      if (!stdOut) {
        resolve(await checkStdOut(cmdToRun));
      }

      if (code === 0) {
        resolve(stdOut);
      } else {
        reject();
      }
    })
  });
};

var deleteFiles = function(filenames) {
  return Promise.all(filenames.map(function(filename) {
    return new Promise(function(resolve) {
      fs.unlinkSync(filename);
      resolve();
    })
  }))
};

export default doDiff;


