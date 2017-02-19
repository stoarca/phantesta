import path from 'path';
import phantom from 'phantom';
import rp from 'request-promise';
import { createPage, HtmlServer, safeRequest, sleep, startServer, syncify } from 'jasmine_test_utils';

import Phantesta from '../../src/phantesta';

describe('phantesta', function() {
  var htmlServer = null;
  var instance = null;
  var page = null;
  var diffPage = null;
  var phantesta = null;
  beforeAll(syncify(async function() {
    htmlServer = new HtmlServer({
      host: 'localhost',
      port: '7555',
      dir: path.resolve(__dirname, '..'),
    });
    htmlServer.start();
    instance = await phantom.create(['--web-security=false']);
    diffPage = await instance.createPage();
  }));
  afterAll(syncify(async function() {
    await instance.exit();
  }));
  beforeEach(syncify(async function() {
    phantesta = new Phantesta(diffPage, {
      screenshotPath: path.resolve(__dirname, '../screenshots'),
    });
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
    afterEach(syncify(async function() {
      phantesta.destructiveClearAllSnapshots();
    }));
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
  });
});
