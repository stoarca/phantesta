import child_process from 'child_process';
import { createPage, HtmlServer, safeRequest, sleep, startServer, syncify } from 'jasmine_test_utils';
import fs from 'fs';
import path from 'path';
import phantom from 'phantom';
import { Builder, By, until } from 'selenium-webdriver';
import chrome from 'selenium-webdriver/chrome';
import firefox from 'selenium-webdriver/firefox';
import rp from 'request-promise';

import Phantesta from '../../src/phantesta';

describe('phantesta', function() {
  var htmlServer = null;
  var phantesta = null;
  var page = null;
  beforeAll(syncify(async function() {
    htmlServer = new HtmlServer({
      host: 'localhost',
      port: '7555',
      dir: path.resolve(__dirname, '..'),
    });
    htmlServer.start();
  }));
  describe('phantomjs', function() {
    var instance = null;
    var diffPage = null;
    beforeAll(syncify(async function() {
      instance = await phantom.create(['--web-security=false']);
      diffPage = await instance.createPage();
    }));
    afterAll(syncify(async function() {
      await instance.exit();
    }));
    beforeEach(syncify(async function() {
      phantesta = new Phantesta(diffPage, {
        screenshotPath: path.resolve(__dirname, '../screenshots/unsaved'),
      });
      phantesta.destructiveClearAllSnapshots();
      page = await createPage(instance);
    }));
    afterEach(syncify(async function() {
      if (page) {
        await instance.execute('phantom', 'invokeMethod', ['clearCookies']);
        await page.close();
        page = null;
      }
    }));

    describe('functionality', function() {
      it('should test basic functionality', syncify(async function() {
        var url1 = htmlServer.getUrl('/html/page1.html');
        var url2 = htmlServer.getUrl('/html/page2.html');

        await page.open(url1);
        await phantesta.expectUnstable(page, 'html', 'page1');
        await phantesta.expectUnstable(page, 'html', 'page1_2');
        await phantesta.acceptDiff('page1');
        await phantesta.acceptDiff('page1_2');
        await phantesta.expectStable(page, 'html', 'page1');
        await phantesta.expectStable(page, 'html', 'page1_2');

        await page.open(url2);
        await phantesta.expectUnstable(page, 'html', 'page2');
        await phantesta.acceptDiff('page2');
        await phantesta.expectSame('page1', 'page1_2');
        await phantesta.expectDiff('page1', 'page2');
      }), 20000);
      it('should work with large pages', syncify(async function() {
        var url1 = htmlServer.getUrl('/html/image.html');

        await page.open(url1);
        await phantesta.expectUnstable(page, 'html', 'image1');
        await phantesta.acceptDiff('image1');
        await phantesta.expectStable(page, 'html', 'image1');

        await page.evaluate(function() {
          var t = document.createTextNode('blah');
          document.body.appendChild(t);
        });

        await phantesta.expectUnstable(page, 'html', 'image1');
        await phantesta.acceptDiff('image1');
        await phantesta.expectStable(page, 'html', 'image1');
      }), 50000);
      it('should be able to diff between different colors', syncify(async function() {
        var url1 = htmlServer.getUrl('/html/color.html?color=b7dfeb');
        var url2 = htmlServer.getUrl('/html/color.html?color=87cade');
        var url3 = htmlServer.getUrl('/html/color.html?color=cccccc');

        await page.open(url1);
        await phantesta.expectUnstable(page, 'html', 'colorlighter');
        await sleep(500);
        await phantesta.acceptDiff('colorlighter');
        await page.open(url2);
        await phantesta.expectUnstable(page, 'html', 'colorlight');
        await phantesta.acceptDiff('colorlight');
        await page.open(url3);
        await phantesta.expectUnstable(page, 'html', 'colorgrey');
        await phantesta.acceptDiff('colorgrey');
        await phantesta.expectDiff('colorlighter', 'colorlight');
        await phantesta.expectDiff('colorlighter', 'colorgrey');
      }), 20000);
      it('should serve diffs correctly', syncify(async function() {
        phantesta.startServer({host: 'localhost', port: '7992'});
        var url1 = htmlServer.getUrl('/html/page1.html');
        var url2 = htmlServer.getUrl('/html/page2.html');

        await page.open(url1);
        await phantesta.expectUnstable(page, 'html', 'page1');
        await phantesta.acceptDiff('page1');
        await phantesta.expectUnstable(page, 'html', 'page1_2');
        var response = JSON.parse(await rp('http://localhost:7992/list_of_diffs'));
        expect(response.diffs.length).toBe(1);
        expect(response.diffs[0].name).toBe('page1_2');
        expect(response.diffs[0].goodSrc).toBeTruthy();
        expect(response.diffs[0].newSrc).toBeTruthy();
        expect(response.diffs[0].diffSrc).toBeTruthy();

        await page.open(url2);
        await phantesta.expectUnstable(page, 'html', 'page1');
        var response = JSON.parse(await rp('http://localhost:7992/list_of_diffs'));
        expect(response.diffs.length).toBe(2);
        expect(response.diffs[1].name).toBe('page1');
        expect(response.diffs[1].goodSrc).toBeTruthy();
        expect(response.diffs[1].newSrc).toBeTruthy();
        expect(response.diffs[1].diffSrc).toBeTruthy();

        response.diffs[1].replace = true;
        var response = await rp({
          url: 'http://localhost:7992/submit_diffs',
          method: 'post',
          json: true,
          body: {
            diffs: response.diffs,
          },
        });
        expect(response.status).toBe('success');

        var response = JSON.parse(await rp('http://localhost:7992/list_of_diffs'));
        expect(response.diffs.length).toBe(1);
        expect(response.diffs[0].name).toBe('page1_2');

        var response = await rp({
          url: 'http://localhost:7992/clear_diffs',
          method: 'post',
          json: true,
        });
        expect(response.status).toBe('success');

        var response = JSON.parse(await rp('http://localhost:7992/list_of_diffs'));
        expect(response.diffs.length).toBe(0);
      }), 20000);
      it('should test polled screenshots', syncify(async function() {
        var url = htmlServer.getUrl('/html/animation.html');
        await page.open(url);
        await phantesta.expectUnstable(page, 'html', 'animation');
        await phantesta.acceptDiff('animation');
        await sleep(6000);
        await phantesta.expectStablePolled(page, 'html', 'animation');
      }), 60000);
      it('should take document screenshot', syncify(async function() {
        var phantesta2 = new Phantesta(diffPage, {
          screenshotPath: path.resolve(__dirname, '../screenshots/saved'),
        });
        var url = htmlServer.getUrl('/html/long.html');
        await page.open(url);
        await phantesta2.expectStable(page, null, 'phantomjs_full_page');
      }), 30000);
    });
  });
  describe('selenium', function() {
    var diffPage = null;
    var page = null;
    var createDriver = async function() {
      var tmpdir = fs.mkdtempSync('/tmp/phantesta');
      var chromeOpts = new chrome.Options();
      chromeOpts.addArguments('--user-data-dir=' + tmpdir);
      var profile = new firefox.Profile();
      var firefoxOpts = new firefox.Options();
      firefoxOpts.setProfile(profile);
      firefoxOpts.useGeckoDriver(false);
      return new Builder()
          .forBrowser('firefox')
          .setChromeOptions(chromeOpts)
          .setFirefoxOptions(firefoxOpts)
          .build();
    };
    beforeAll(syncify(async function() {
      diffPage = await createDriver();
    }));
    afterAll(syncify(async function() {
      await diffPage.quit();
    }));
    beforeEach(syncify(async function() {
      phantesta = new Phantesta(diffPage, {
        screenshotPath: path.resolve(__dirname, '../screenshots/unsaved'),
      });
      page = await createDriver();
    }));
    afterEach(syncify(async function() {
      await page.quit();
      phantesta.destructiveClearAllSnapshots();
    }));
    it('should test basic functionality', syncify(async function() {
      var url1 = htmlServer.getUrl('/html/page1.html');
      var url2 = htmlServer.getUrl('/html/page2.html');

      await page.get(url1);
      await phantesta.expectUnstable(page, 'html', 'selenium_page1');
      await phantesta.expectUnstable(page, 'html', 'selenium_page1_2');
      await phantesta.acceptDiff('selenium_page1');
      await phantesta.acceptDiff('selenium_page1_2');
      await phantesta.expectStable(page, 'html', 'selenium_page1');
      await phantesta.expectStable(page, 'html', 'selenium_page1_2');

      await page.get(url2);
      await phantesta.expectUnstable(page, 'html', 'selenium_page2');
      await phantesta.acceptDiff('selenium_page2');
      await phantesta.expectSame('selenium_page1', 'selenium_page1_2');
      await phantesta.expectDiff('selenium_page1', 'selenium_page2');
    }), 20000);
    it('should test skip boxes success', syncify(async function() {
      var url1 = htmlServer.getUrl('/html/some_diff1.html');
      var url2 = htmlServer.getUrl('/html/some_diff2.html');
      await page.get(url1);
      await phantesta.expectUnstable(page, 'html', 'some_diff');
      await phantesta.acceptDiff('some_diff');
      await page.get(url2);
      await phantesta.expectStable(page, 'html', 'some_diff', [
        { x: 100, y: 100, w: 100, h: 100 }
      ]);
    }), 60000);
    it('should take document screenshot', syncify(async function() {
      var phantesta2 = new Phantesta(diffPage, {
        screenshotPath: path.resolve(__dirname, '../screenshots/saved'),
      });
      var url = htmlServer.getUrl('/html/long.html');
      await page.get(url);
      await phantesta2.expectStable(page, null, 'selenium_full_page');
    }), 30000);
    describe('should test one level grouping', function() {
      beforeEach(function() {
        phantesta.group('group1');
      });

      afterEach(function() {
        phantesta.ungroup();
      });

      it('test current path', function() {
        expect(phantesta.getCurrentPath()).toBe(path.resolve(__dirname, '../screenshots/unsaved', 'group1'));
      });

      it('test groups', syncify(async function() {
        var url1 = htmlServer.getUrl('/html/page1.html');
        var url2 = htmlServer.getUrl('/html/page2.html');

        await page.get(url1);
        await phantesta.expectUnstable(page, 'html', 'group1_page1');
        await phantesta.expectUnstable(page, 'html', 'group1_page2');
        await phantesta.acceptDiff('group1_page1', 'group1_page2');
      }));

      describe('should test two level grouping', function() {
        beforeEach(function() {
          phantesta.group('group2');
        });

        afterEach(function() {
          phantesta.ungroup();
        });

        it('test current path', function() {
          expect(phantesta.getCurrentPath()).toBe(path.resolve(__dirname, '../screenshots/unsaved', 'group1', 'group2'));
        });

        it('test groups', syncify(async function() {
          var url1 = htmlServer.getUrl('/html/page1.html');
          var url2 = htmlServer.getUrl('/html/page2.html');

          await page.get(url1);
          await phantesta.expectUnstable(page, 'html', 'group2_page1');
          await phantesta.expectUnstable(page, 'html', 'group2_page2');
          await phantesta.acceptDiff('group2_page1', 'group2_page2');
        }));
      });
    })
  });
});
