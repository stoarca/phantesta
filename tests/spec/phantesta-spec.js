import { HtmlServer, syncify } from 'jasmine_test_utils';
import fs from 'fs';
import path from 'path';
import { Builder } from 'selenium-webdriver';
import chrome from 'selenium-webdriver/chrome';
import firefox from 'selenium-webdriver/firefox';

import Phantesta from '../../src/phantesta';

const createDriver = async function() {
  var tmpdir = fs.mkdtempSync('/tmp/phantesta');
  //var chromeOpts = new chrome.Options();
  //chromeOpts.addArguments('--user-data-dir=' + tmpdir);
  //var profile = new firefox.Profile();
  var firefoxOpts = new firefox.Options();
  firefoxOpts.setProfile(tmpdir);
  return new Builder()
      .forBrowser('firefox')
      //.setChromeOptions(chromeOpts)
      .setFirefoxOptions(firefoxOpts)
      .build();
};

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

  describe('selenium', function() {
    var page = null;

    beforeEach(syncify(async function() {
      phantesta = new Phantesta({
        screenshotPath: path.resolve(__dirname, '../screenshots/unsaved'),
      });
      phantesta.destructiveClearAllSnapshots();

      page = await createDriver();
    }));

    afterEach(syncify(async function() {
      await page.quit();
    }));

    it('should test basic functionality', syncify(async function() {
      var url1 = htmlServer.getUrl('/html/page1.html');
      var url2 = htmlServer.getUrl('/html/page2.html');

      await page.get(url1);
      await phantesta.expect(page).toNotMatchScreenshot('selenium_page1');
      await phantesta.expect(page).toNotMatchScreenshot('selenium_page1_2');
      await phantesta.acceptDiff('selenium_page1');
      await phantesta.acceptDiff('selenium_page1_2');
      await phantesta.expect(page).toMatchScreenshot('selenium_page1');
      await phantesta.expect(page).toMatchScreenshot('selenium_page1_2');

      await page.get(url2);
      await phantesta.expect(page).toNotMatchScreenshot('selenium_page2');
      await phantesta.acceptDiff('selenium_page2');
      await phantesta.expectSame('selenium_page1', 'selenium_page1_2');
      await phantesta.expectDiff('selenium_page1', 'selenium_page2');
    }), 20000);
    it('should be able to skip diffs', syncify(async function() {
      var url1 = htmlServer.getUrl('/html/outer_diff1.html');
      var url2 = htmlServer.getUrl('/html/outer_diff2.html');
      await page.get(url1);
      await phantesta.expect(page).toNotMatchScreenshot('exclude_diff');
      await phantesta.acceptDiff('exclude_diff');
      await page.get(url2);
      await phantesta.expect(page).censorRect(100, 0, 100, 100).toMatchScreenshot('exclude_diff');
      await phantesta.expect(page).censorMatching('#right-changing-div').toMatchScreenshot('exclude_diff');
    }), 60000);
    it('should be able to select specific diffs', syncify(async function() {
      //we load two divs that are side by side, where the right-most of the two changes
      var url1 = htmlServer.getUrl('/html/outer_diff1.html');
      var url2 = htmlServer.getUrl('/html/outer_diff2.html');
      await page.get(url1);
      await phantesta.expect(page).toNotMatchScreenshot('include_diff');
      await phantesta.acceptDiff('include_diff');
      await page.get(url2);
      await phantesta.expect(page).includeOnlyRect(0, 0, 100, 100).toMatchScreenshot('include_diff');
      await phantesta.expect(page).includeOnlyRect(0, 0, 101, 100).toNotMatchScreenshot('include_diff');
      await phantesta.expect(page).includeOnlyMatching('#left-unchanging-div').toMatchScreenshot('include_diff');
      await phantesta.expect(page).includeOnlyMatching('#right-changing-div').toNotMatchScreenshot('include_diff');
    }), 60000);
    it('should take document screenshot', syncify(async function() {
      var phantesta2 = new Phantesta({
        screenshotPath: path.resolve(__dirname, '../screenshots/saved'),
      });
      var url = htmlServer.getUrl('/html/long.html');
      await page.get(url);
      //this should pass with null but html element is smaller than div
      // await phantesta2.expect(page, null).toMatchScreenshot('selenium_full_page');
      await phantesta2.expect(page, 'div').toMatchScreenshot('selenium_full_page');
    }), 30000);
    it('should be able to ignore selected elements', syncify(async function() {
      var phantesta2 = new Phantesta({
        screenshotPath: path.resolve(__dirname, '../screenshots/saved'),
      });
      var url = htmlServer.getUrl('/html/censor.html');
      await page.get(url);
      // HACK: this screenshot was originally taken with a different color
      // in #inner-rect inside censor.html and saved
      // After the color was changed in censor.html, we expect the test to
      // still pass, even though the screenshot hasn't changed, due to censoring
      await phantesta2.expect(page, '#outer-rect').censorMatching(
        '#inner-rect'
      ).toMatchScreenshot('selenium_censor_offset');
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

        await page.get(url1);
        await phantesta.expect(page).toNotMatchScreenshot('group1_page1');
        await phantesta.expect(page).toNotMatchScreenshot('group1_page2');
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

          await page.get(url1);
          await phantesta.expect(page).toNotMatchScreenshot('group2_page1');
          await phantesta.expect(page).toNotMatchScreenshot('group2_page2');
          await phantesta.acceptDiff('group2_page1', 'group2_page2');
        }));
      });
    })
  });

  describe('functionality', function() {
    var page = null;

    beforeEach(syncify(async function() {
      phantesta = new Phantesta({
        screenshotPath: path.resolve(__dirname, '../screenshots/unsaved')
      });
      phantesta.destructiveClearAllSnapshots();

      page = await createDriver();
    }));

    afterEach(syncify(async function() {
      await page.quit();
    }));

    it('should test basic functionality', syncify(async function() {
      var url1 = htmlServer.getUrl('/html/page1.html');
      var url2 = htmlServer.getUrl('/html/page2.html');

      await page.get(url1);
      await phantesta.expect(page).toNotMatchScreenshot('selenium_page1');
      await phantesta.expect(page).toNotMatchScreenshot('selenium_page1_2');
      await phantesta.acceptDiff('selenium_page1');
      await phantesta.acceptDiff('selenium_page1_2');
      await phantesta.expect(page).toMatchScreenshot('selenium_page1');
      await phantesta.expect(page).toMatchScreenshot('selenium_page1_2');

      await page.get(url2);
      await phantesta.expect(page).toNotMatchScreenshot('selenium_page2');
      await phantesta.acceptDiff('selenium_page2');
      await phantesta.expectSame('selenium_page1', 'selenium_page1_2');
      await phantesta.expectDiff('selenium_page1', 'selenium_page2');
    }), 20000);
    it('should be able to diff between different sizes', syncify(async function() {
      var url1 = htmlServer.getUrl('/html/size.html?size=500x500');
      var url2 = htmlServer.getUrl('/html/size.html?size=500x490');

      await page.get(url1);
      await phantesta.expect(page).toNotMatchScreenshot('bigger');
      await phantesta.acceptDiff('bigger');

      await page.get(url2);
      await phantesta.expect(page).toNotMatchScreenshot('bigger');
      expect(fs.existsSync(phantesta.getDiffPath('bigger'))).toBeTruthy();
    }), 5000);
    it('should be able to skip diffs', syncify(async function() {
      var url1 = htmlServer.getUrl('/html/outer_diff1.html');
      var url2 = htmlServer.getUrl('/html/outer_diff2.html');
      await page.get(url1);
      await phantesta.expect(page).toNotMatchScreenshot('exclude_diff');
      await phantesta.acceptDiff('exclude_diff');
      await page.get(url2);
      await phantesta.expect(page).censorRect(100, 0, 100, 100).toMatchScreenshot('exclude_diff');
      await phantesta.expect(page).censorMatching('#right-changing-div').toMatchScreenshot('exclude_diff');
    }), 60000);
    it('should be able to select specific diffs', syncify(async function() {
      //we load two divs that are side by side, where the right-most of the two changes
      var url1 = htmlServer.getUrl('/html/outer_diff1.html');
      var url2 = htmlServer.getUrl('/html/outer_diff2.html');
      await page.get(url1);
      await phantesta.expect(page).toNotMatchScreenshot('include_diff');
      await phantesta.acceptDiff('include_diff');
      await page.get(url2);
      await phantesta.expect(page).includeOnlyRect(0, 0, 100, 100).toMatchScreenshot('include_diff');
      await phantesta.expect(page).includeOnlyRect(0, 0, 101, 100).toNotMatchScreenshot('include_diff');
      await phantesta.expect(page).includeOnlyMatching('#left-unchanging-div').toMatchScreenshot('include_diff');
      await phantesta.expect(page).includeOnlyMatching('#right-changing-div').toNotMatchScreenshot('include_diff');
    }), 60000);
    it('should take document screenshot', syncify(async function() {
      var phantesta2 = new Phantesta({
        screenshotPath: path.resolve(__dirname, '../screenshots/saved'),
      });
      var url = htmlServer.getUrl('/html/long.html');
      await page.get(url);
      //this should pass with null but html element is smaller than div
      // await phantesta2.expect(page, null).toMatchScreenshot('selenium_full_page');
      await phantesta2.expect(page, 'div').toMatchScreenshot('selenium_full_page');
    }), 30000);

  });
});
