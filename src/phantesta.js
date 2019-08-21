import bodyParser from 'body-parser';
import child_process from 'child_process';
import express from 'express';
import fs from 'fs';
import glob from 'glob';
import path from 'path';
import { By, until } from 'selenium-webdriver';
import q from 'q';
import imageMagickDoDiff from './imageMagickDiff';
import phantom from 'phantom';
import exitHook from 'async-exit-hook';

var safeUnlinkSync = function(file) {
  try {
    fs.unlinkSync(file);
  } catch (e) {
    if (e.code === 'ENOENT') {
      // intentionally swallow if file does not exist
    } else {
      throw e;
    }
  }
};

var copy = function(src, dst) {
  // TODO: injection
  child_process.execSync('cp ' + src + ' ' + dst);
};

var isSelenium = function(page) {
  return !!page.takeScreenshot;
};

var isPhantom = function(page) {
  return !!page.render;
};

var isPositiveInt = function(x) {
    var n = Math.floor(Number(x));
    return String(n) === String(x) && n > 0;
};

var ScreenshotExpect = function(phantesta, page, rootElement) {
  if(typeof rootElement === 'undefined') {
    rootElement = 'html';
  }
  this.defaultAttempt = 1;
  this.defaultWait = 1000;
  this.phantesta = phantesta;
  this.rootElement = rootElement;
  this.page = page;
  this.skipBoxes = [];
  this.includeOnlyBoxes = [];
  this.skipElementSelectors = [];
  this.includeOnlyElementSelectors = [];
};

ScreenshotExpect.prototype.censorRect = function(x, y, w, h) {
  this.skipBoxes.push({x: x, y: y, w: w, h: h});
  return this;
};

ScreenshotExpect.prototype.includeOnlyRect = function(x, y, w, h) {
  if(this.skipBoxes.length > 0 || this.skipElementSelectors > 0) {
    throw new Error('You need to set includeOnly options before censoring!')
  }
  this.includeOnlyBoxes.push({x: x, y: y, w: w, h: h});
  return this;
};

ScreenshotExpect.prototype.censorMatching = function(selector) {
  this.skipElementSelectors.push(selector);
  return this;
};

ScreenshotExpect.prototype.includeOnlyMatching = function(selector) {
  if(this.skipBoxes.length > 0 || this.skipElementSelectors > 0) {
    throw new Error('You need to set includeOnly options before censoring!')
  }
  this.includeOnlyElementSelectors.push(selector);
  return this;
};

ScreenshotExpect.prototype.testSingle = async function(ssInfo, allowDiff) {
  if (!fs.existsSync(this.phantesta.getGoodPath(ssInfo.name))) {
    copy(this.phantesta.getNewPath(ssInfo.name), this.phantesta.getDiffPath(ssInfo.name));
    this.phantesta.ssInfoExpect(
      ssInfo,
      'new screenshot: ' + ssInfo.name,
      'screenshot success: ' + ssInfo.name);
    return;
  }

  var includeOnlyBoxes = [];
  includeOnlyBoxes = includeOnlyBoxes.concat(this.includeOnlyBoxes);
  for(var i = 0; i < this.includeOnlyElementSelectors.length; i++) {
    var elements = await this.page.findElements(By.css(this.includeOnlyElementSelectors[i]));
    for(var j = 0; j < elements.length; j++) {
      var location = await elements[j].getLocation();
      var size = await elements[j].getSize();
      includeOnlyBoxes.push({x: location.x, y: location.y, w: size.width, h: size.height});
    }
  }
  var skipBoxes = [];
  skipBoxes = skipBoxes.concat(this.skipBoxes);
  for(var i = 0; i < this.skipElementSelectors.length; i++) {
    var elements = await this.page.findElements(By.css(this.skipElementSelectors[i]));
    for(var j = 0; j < elements.length; j++) {
      var location = await elements[j].getLocation();
      var size = await elements[j].getSize();
      skipBoxes.push({x: location.x, y: location.y, w: size.width, h: size.height});
    }
  }

  if (await this.phantesta.isDiff(
      this.phantesta.getNewPath(ssInfo.name),
      this.phantesta.getGoodPath(ssInfo.name),
      this.phantesta.getDiffPath(ssInfo.name),
      ssInfo.offset,
      skipBoxes,
      includeOnlyBoxes
  )) {
    if (allowDiff) {
      return 'diff detected';
    }

    if (includeOnlyBoxes && includeOnlyBoxes.length && this.phantesta.options.makeUseOfPhantom) {
      await this.phantesta.screenshot(
          this.phantesta.diffPage,
          '#result > img',
          this.phantesta.getDiffPath(ssInfo.name)
      );
    }

    var showPaths = JSON.stringify({
      goodPath: this.phantesta.getGoodPath(ssInfo.name),
      newPath: this.phantesta.getNewPath(ssInfo.name),
      diffPath: this.phantesta.getDiffPath(ssInfo.name),
    });
    this.phantesta.ssInfoExpect(
      ssInfo,
      'screenshot fail: ' + ssInfo.name + ' ' + showPaths,
      'screenshot success: ' + ssInfo.name);
  } else {

    this.phantesta.ssInfoExpect(
      ssInfo,
      'screenshot success: ' + ssInfo.name,
      'screenshot success: ' + ssInfo.name);
    safeUnlinkSync(this.phantesta.getNewPath(ssInfo.name));
    safeUnlinkSync(this.phantesta.getDiffPath(ssInfo.name));
  }
};

ScreenshotExpect.prototype.toMatchScreenshot = async function(name, kwargs) {
  kwargs = kwargs || {};
  var attempts = isPositiveInt(kwargs.attempts) ? kwargs.attempts : this.defaultAttempt;
  var wait = isPositiveInt(kwargs.wait) ? kwargs.wait : this.defaultWait;
  var result;
  while (true) {
    let offset = await this.phantesta.screenshot(this.page, this.rootElement, this.phantesta.getNewPath(name));
    result = await this.testSingle({
      type: 'stable',
      name: name,
      offset: offset,
    }, attempts > 1);
    attempts -= 1;
    if (result !== 'diff detected' || attempts === 0) {
      break;
    }
    await new Promise(function(resolve) {
      setTimeout(resolve, wait);
    });
  }
};

ScreenshotExpect.prototype.toNotMatchScreenshot = async function(name, kwargs) {
  kwargs = kwargs || {};
  var attempts = isPositiveInt(kwargs.attempts) ? kwargs.attempts : this.defaultAttempt;
  var wait = isPositiveInt(kwargs.wait) ? kwargs.wait : this.defaultWait;
  var result;
  while (true) {
    var offset = await this.phantesta.screenshot(this.page, this.rootElement, this.phantesta.getNewPath(name));
    result = await this.testSingle({
      type: 'unstable',
      name: name,
      offset: offset,
    }, attempts > 1);
    attempts -= 1;
    if (result !== 'diff detected' || attempts === 0) {
      break;
    }
    await new Promise(function(resolve) {
      setTimeout(resolve, wait);
    });
  }
};

var Phantesta = function(options) {

  //check to make sure imageMagick is installed
  try {
    child_process.execSync('which convert compare');
  } catch (e) {
    throw new Error("imageMagick not installed");
  }

  var defaults = {
    screenshotPath: 'tests/visual/screenshots',
    subPath: [],
    goodExt: '.good.png',
    newExt: '.new.png',
    diffExt: '.diff.png',
    expectToBe: function(actual, expected) {
      expect(actual).toBe(expected);
    },
    expectNotToBe: function(actual, expected) {
      expect(actual).not.toBe(expected);
    },
    makeUseOfPhantom: true,
    defaultAttempt: 1,
    defaultWait: 1000
  };
  this.options = {
    ...defaults,
    ...options,
  };

  if (this.options.makeUseOfPhantom) {
    var self = this;
    this.diffPagePromise = phantom.create(['--web-security=false'])
        .then(function(instance) {
          self.instance = instance;
          return self.instance.createPage();
        })
        .then(function(diffPage) {
          self.diffPage = diffPage;
        });

    exitHook(callback => {
      this.instance.exit().then(() => callback);
    });
  }
};
Phantesta.prototype.group = function(groupName) {
  this.options.subPath.push(groupName);
  return this.getCurrentPath();
};
Phantesta.prototype.ungroup = function() {
  this.options.subPath.pop();
  return this.getCurrentPath();
};
Phantesta.prototype.getCurrentPath = function() {
  return this.options.screenshotPath + '/' + this.options.subPath.join('/');
};
Phantesta.prototype.getGoodPath = function(name) {
  return path.resolve(this.getCurrentPath(), name + this.options.goodExt);
};
Phantesta.prototype.getNewPath = function(name) {
  return path.resolve(this.getCurrentPath(), name + this.options.newExt);
};
Phantesta.prototype.getDiffPath = function(name) {
  return path.resolve(this.getCurrentPath(), name + this.options.diffExt);
};
Phantesta.prototype.expect = function(page, rootElement) {
  let screenshotExpect = new ScreenshotExpect(this, page, rootElement);
  screenshotExpect.defaultAttempt = this.options.defaultAttempt;
  screenshotExpect.defaultWait = this.options.defaultWait;
  return screenshotExpect;
};
Phantesta.prototype.screenshot = async function(page, target, filename) {
  if (isPhantom(page)) {
    var prevClip = await page.property('clipRect');
    var clipRect = await page.evaluate(function(target) {
      if (target === null) {
        return {
          left: 0,
          top: 0,
          right: document.body.scrollWidth,
          bottom: document.body.scrollHeight,
          x: 0,
          y: 0,
          width: document.body.scrollWidth,
          height: document.body.scrollHeight
        }
      } else {
        return document.querySelectorAll(target)[0].getBoundingClientRect();
      }
    }, target);
    if (!clipRect) {
      throw new Error(
        `Unable to take screenshot of target: ${target} with path ${filename}`
      );
    }
    await page.property('clipRect', {
      top: clipRect.top,
      left: clipRect.left,
      width: clipRect.width,
      height: clipRect.height,
    });
    await page.render(filename);
    await page.property('clipRect', prevClip);
    return clipRect;
  } else if (isSelenium(page)) {
    var image;
    var ret = null;
    if (target === null) {
      image = await page.takeScreenshot();
      ret = await page.findElement(By.css('html')).getLocation();
    } else {
      var element = await page.findElement(By.css(target));
      image = await element.takeScreenshot();
      ret = await page.findElement(By.css(target)).getLocation();
    }
    if (!image) {
      throw new Error(
        `Unable to take screenshot of target: ${target} with path ${filename}`
      );
    }
    child_process.spawnSync('mkdir', ['-p', path.dirname(filename)]);
    fs.writeFileSync(filename, image, 'base64');
    return ret;
  } else {
    throw new Error('Unable to determine type of page');
  }
};

Phantesta.prototype.expectSame = async function(name1, name2, excludeBoxes, includeBoxes) {
  if (await this.isDiff(this.getGoodPath(name1), this.getGoodPath(name2), undefined, {}, excludeBoxes, includeBoxes)) {
    this.options.expectToBe(
        'fail: ' + name1 + ' is the same as ' + name2,
        'success: ' + name1 + ' is the same as ' + name2);
  } else {
    this.options.expectToBe(
        'success: ' + name1 + ' is the same as ' + name2,
        'success: ' + name1 + ' is the same as ' + name2);
  }
};
Phantesta.prototype.expectDiff = async function(name1, name2, excludeBoxes, includeBoxes) {
  if (await this.isDiff(this.getGoodPath(name1), this.getGoodPath(name2), undefined, {}, excludeBoxes, includeBoxes)) {
    this.options.expectToBe(
        'success: ' + name1 + ' is different than ' + name2,
        'success: ' + name1 + ' is different than ' + name2);
  } else {
    this.options.expectToBe(
        'fail: ' + name1 + ' is different than ' + name2,
        'success: ' + name1 + ' is different than ' + name2);
  }
};
Phantesta.prototype.isDiff = async function(filename1, filename2, diffPath, offset, excludeBoxes, includeBoxes) {
  if (!this.options.makeUseOfPhantom || !includeBoxes || !includeBoxes.length) {
    return imageMagickDoDiff(filename1, filename2, diffPath, offset, excludeBoxes, includeBoxes);
  }

  if (!this.diffPage) {
    await this.diffPagePromise;
  }

  await this.diffPage.open('about:blank');
  var url = 'file:///' + path.resolve(__dirname, '../resemble.html');
  var stat = await this.diffPage.open(url);
  this.options.expectToBe(stat, 'success');
  await this.diffPage.uploadFile('#a', filename1);
  await this.diffPage.uploadFile('#b', filename2);
  await this.diffPage.evaluate(function() {
    window.imageDiffer = new ImageDiffer();
    return window.imageDiffer
        .includeOnlyBoxes(arguments[1])
        .censorBoxes(arguments[0])
        .doDiff();
  }, excludeBoxes, includeBoxes);
  var ret = null;
  while (ret === null || ret === 'RESULT NOT READY') {
    ret = await this.diffPage.evaluate(function() {
      if (!window.imageDiffer.isReady()) {
        return 'RESULT NOT READY';
      }
      return window.imageDiffer.getResult();
    });
  }
  return ret.rawMisMatchPercentage > 0;
};

Phantesta.prototype.ssInfoExpect = function(ssInfo, actual, expected) {
  if (ssInfo.type === 'stable') {
    this.options.expectToBe(actual, expected);
  } else {
    this.options.expectNotToBe(actual, expected);
  }
}
Phantesta.prototype.destructiveClearAllSnapshots = async function() {
  child_process.execSync('rm -rf ' + this.options.screenshotPath + '/*');
};

Phantesta.prototype.listOfDiffFiles = function(f) {
  var dir = path.resolve(this.options.screenshotPath, '**/*' + this.options.diffExt);
  var failedFiles = glob(dir, function(err, files) {
    files = files.map(function(filename) {
      return {
        name: filename,
        time: fs.statSync(filename).mtime.getTime(),
      };
    }).sort(function(a, b) {
      return a.time - b.time;
    }).map(function(v) {
      return v.name;
    });
    f(files);
  });
};
Phantesta.prototype.clearDiffs = function(f) {
  var self = this;
  this.listOfDiffFiles(function(files) {
    for (var i = 0; i < files.length; ++i) {
      var name = path.relative(path.resolve(self.options.screenshotPath), files[i])
          .slice(0, -self.options.diffExt.length);
      safeUnlinkSync(self.getNewPath(name));
      safeUnlinkSync(self.getDiffPath(name));
    }
    f();
  });
};
Phantesta.prototype.listOfDiffs = function(f) {
  var self = this;
  this.listOfDiffFiles(function(files) {
    var diffs = [];
    for (var i = 0; i < files.length; ++i) {
      var name = path.relative(path.resolve(self.options.screenshotPath), files[i])
          .slice(0, -self.options.diffExt.length);
      diffs.push({
        name: name,
        goodSrc: './images/' + encodeURIComponent(self.getGoodPath(name)),
        newSrc: './images/' + encodeURIComponent(self.getNewPath(name)),
        diffSrc: './images/' + encodeURIComponent(self.getDiffPath(name)),
      });
    }
    f({diffs: diffs});
  });
};
Phantesta.prototype.acceptDiff = function(name) {
  fs.renameSync(this.getNewPath(name), this.getGoodPath(name));
  safeUnlinkSync(this.getDiffPath(name));
};
Phantesta.prototype.startServer = function(options) {
  var self = this;

  var defaults = {
    host: 'localhost',
    port: 7995,
  }
  options = {...defaults, ...options};

  var app = express();

  app.use(bodyParser.json({limit: '200mb'}));
  app.get('/', function(req, resp) {
    resp.sendFile(path.resolve(__dirname, '../phantesta-server.html'));
  });

  app.get('/list_of_diffs', function(req, resp) {
    self.listOfDiffs(function(diffs) {
      resp.send(diffs);
    });
  });

  app.get('/images/:path', function(req, resp) {
    resp.sendFile(req.params.path);
  });

  app.post('/submit_diffs', function(req, resp) {
    for (var i = 0; i < req.body.diffs.length; ++i) {
      var diff = req.body.diffs[i];
      if (diff.replace) {
        self.acceptDiff(diff.name);
      }
    }
    resp.send({
      status: 'success',
    });
  });

  app.post('/clear_diffs', function(req, resp) {
    self.clearDiffs(function() {
      resp.send({
        status: 'success',
      });
    });
  });

  app.listen(options.port, options.host, function() {
    console.log('started server on ' + options.host + ':' + options.port);
  });
};
export default Phantesta;
