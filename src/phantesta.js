import bodyParser from 'body-parser';
import child_process from 'child_process';
import express from 'express';
import fs from 'fs';
import glob from 'glob';
import path from 'path';
import { By, until } from 'selenium-webdriver';
import q from 'q';

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

var isPositiveInt = function(str) {
    var n = Math.floor(Number(str));
    return String(n) === str && n > 0;
};

var Phantesta = function(diffPage, options) {
  this.diffPage = diffPage;
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
  };
  this.options = {
    ...defaults,
    ...options,
  };
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
Phantesta.prototype.screenshot = async function(page, target, filename, modifierCallback) {
  if (isPhantom(page)) {
    var prevClip = await page.property('clipRect');
    var clipRect = await page.evaluate(function(target) {
      return document.querySelectorAll(target)[0].getBoundingClientRect();
    }, target);
    if (!clipRect) {
      console.log(
          'Unable to take screenshot of target: ' + target + ' with path ' + filename);
    }
    await page.property('clipRect', {
      top: clipRect.top,
      left: clipRect.left,
      width: clipRect.width,
      height: clipRect.height,
    });
    await page.render(filename);
    await page.property('clipRect', prevClip);
  } else if (isSelenium(page)) {
    var element = await page.findElement(By.css(target));
    var image = await element.takeScreenshot();
    child_process.spawnSync('mkdir', ['-p', path.dirname(filename)]);
    fs.writeFileSync(filename, image, 'base64');
  } else {
    throw new Error('Unable to determine type of page');
  }
  if (typeof(modifierCallback) == 'function') {
    await modifierCallback(filename);
  }
};
Phantesta.prototype.expectStable = async function(page, target, name, modifierCallback) {
  await this.screenshot(page, target, this.getNewPath(name), modifierCallback);
  await this.testSingle({
    type: 'stable',
    name: name,
  });
};
Phantesta.prototype.expectUnstable = async function(page, target, name) {
  await this.screenshot(page, target, this.getNewPath(name));
  await this.testSingle({
    type: 'unstable',
    name: name,
  });
};
Phantesta.prototype.expectStablePolled = async function(page, target, name, attempts, wait, modifierCallback) {
  attempts = isPositiveInt(attempts) ? attempts : 10;
  wait = isPositiveInt(wait) ? wait : 1000;
  var result;
  while (true) {
    await this.screenshot(page, target, this.getNewPath(name), modifierCallback);
    result = await this.testSingle({
      type: 'stable',
      name: name,
    }, true);
    if (result !== 'diff detected' || attempts === 0) {
      break;
    }
    attempts -= 1;
    await new Promise(function(resolve) {
      setTimeout(resolve, wait);
    });
  }
};
Phantesta.prototype.expectSame = async function(name1, name2) {
  if (await this.isDiff(this.getGoodPath(name1), this.getGoodPath(name2))) {
    this.options.expectToBe(
        'fail: ' + name1 + ' is the same as ' + name2,
        'success: ' + name1 + ' is the same as ' + name2);
  } else {
    this.options.expectToBe(
        'success: ' + name1 + ' is the same as ' + name2,
        'success: ' + name1 + ' is the same as ' + name2);
  }
};
Phantesta.prototype.expectDiff = async function(name1, name2) {
  if (await this.isDiff(this.getGoodPath(name1), this.getGoodPath(name2))) {
    this.options.expectToBe(
        'success: ' + name1 + ' is different than ' + name2,
        'success: ' + name1 + ' is different than ' + name2);
  } else {
    this.options.expectToBe(
        'fail: ' + name1 + ' is different than ' + name2,
        'success: ' + name1 + ' is different than ' + name2);
  }
};
Phantesta.prototype.isDiff = async function(filename1, filename2) {
  if (isPhantom(this.diffPage)) {
    await this.diffPage.open('about:blank');
    var url = 'file:///' + path.resolve(__dirname, '../resemble.html');
    var stat = await this.diffPage.open(url);
    this.options.expectToBe(stat, 'success');
    await this.diffPage.uploadFile('#a', filename1);
    await this.diffPage.uploadFile('#b', filename2);
    await this.diffPage.evaluate(function() {
      window.imageDiffer = new ImageDiffer();
      return window.imageDiffer.doDiff();
    });
    var ret = null;
    while (ret === null) {
      ret = await this.diffPage.evaluate(function() {
        return window.imageDiffer.getResult();
      });
    }
    return ret.rawMisMatchPercentage > 0;
  } else if (isSelenium(this.diffPage)) {
    await this.diffPage.get('about:blank');
    var url = 'file:///' + path.resolve(__dirname, '../resemble.html');
    await this.diffPage.get(url);
    await this.diffPage.findElement(By.css('#a')).sendKeys(filename1);
    await this.diffPage.findElement(By.css('#b')).sendKeys(filename2);
    await this.diffPage.executeScript(function() {
      window.imageDiffer = new ImageDiffer();
      return window.imageDiffer.doDiff();
    });
    var ret = null;
    while (ret === null) {
      try {
        ret = await this.diffPage.executeScript(function() {
          return window.imageDiffer.getResult();
        });
      } catch (e) {
        // intentionally eat error, result may be not ready yet
        console.log(e);
      }
    }
    return ret.rawMisMatchPercentage > 0;
  } else {
    throw new Error('Unable to determine type of page');
  }
}
Phantesta.prototype.ssInfoExpect = function(ssInfo, actual, expected) {
  if (ssInfo.type === 'stable') {
    this.options.expectToBe(actual, expected);
  } else {
    this.options.expectNotToBe(actual, expected);
  }
}
Phantesta.prototype.testSingle = async function(ssInfo, allowDiff) {
  if (!fs.existsSync(this.getGoodPath(ssInfo.name))) {
    copy(this.getNewPath(ssInfo.name), this.getDiffPath(ssInfo.name));
    this.ssInfoExpect(
        ssInfo,
        'new screenshot: ' + ssInfo.name,
        'screenshot success: ' + ssInfo.name);
    return;
  }
  if (await this.isDiff(this.getNewPath(ssInfo.name), this.getGoodPath(ssInfo.name))) {
    if (allowDiff) {
      return 'diff detected';
    }
    await this.screenshot(
        this.diffPage, '#result > img', this.getDiffPath(ssInfo.name));
    var showPaths = JSON.stringify({
      goodPath: this.getGoodPath(ssInfo.name),
      newPath: this.getNewPath(ssInfo.name),
      diffPath: this.getDiffPath(ssInfo.name),
    });
    this.ssInfoExpect(
        ssInfo,
        'screenshot fail: ' + ssInfo.name + ' ' + showPaths,
        'screenshot success: ' + ssInfo.name);
  } else {
    this.ssInfoExpect(
        ssInfo,
        'screenshot success: ' + ssInfo.name,
        'screenshot success: ' + ssInfo.name);
    safeUnlinkSync(this.getNewPath(ssInfo.name));
    safeUnlinkSync(this.getDiffPath(ssInfo.name));
  }
};
Phantesta.prototype.destructiveClearAllSnapshots = async function() {
  child_process.execSync('rm -rf ' + this.options.screenshotPath + '/*');
};

Phantesta.prototype.listOfDiffFiles = function(f) {
  var dir = path.resolve(this.options.screenshotPath, '**/*' + this.options.diffExt);
  var failedFiles = glob(dir, function(err, files) {
    f(files);
  });
};
Phantesta.prototype.clearDiffs = function(f) {
  var self = this;
  this.listOfDiffFiles(function(files) {
    for (var i = 0; i < files.length; ++i) {
      var name = path.relative(path.resolve(self.options.screenshotPath), files[i])
          .slice(0, -self.options.diffExt.length);
      console.log('removing ' + name);
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
        goodSrc: '/images/' + encodeURIComponent(self.getGoodPath(name)),
        newSrc: '/images/' + encodeURIComponent(self.getNewPath(name)),
        diffSrc: '/images/' + encodeURIComponent(self.getDiffPath(name)),
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

  app.use(bodyParser.json());
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
