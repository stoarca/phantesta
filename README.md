# Phantesta

Phantesta is a testing library built on top of phantomjs-node or selenium.
It allows you to
write regression tests to ensure a rendered portion of a page does not change.

## Installation

```bash
npm install --save-dev phantesta
```

## Usage

```js
import { syncify } from 'jasmine_test_utils';
import path from 'path';
import phantom from 'phantom';
import Phantesta from 'phantesta';

describe('my test suite', function() {
  var instance = null;
  var page = null;
  var diffPage = null;
  var phantesta = null;

  beforeAll(syncify(async function() {
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
    page = await instance.createPage();
  }));
  afterEach(syncify(async function() {
    if (page) {
      await instance.execute('phantom', 'invokeMethod', ['clearCookies']);
      await page.close();
      page = null;
    }
  }));

  it('should do some tests', syncify(async function() {
    await page.open('http://www.google.com');
    await phantesta.expectStable(page, 'html', 'unique_snapshot_name');
    await phantesta.expectStable(page, 'html', 'unique_snapshot_name2');
    await phantesta.expectSame('unique_snapshot_name', 'unique_snapshot_name2');
    await page.open('http://www.asdf.com');
    await phantesta.expectStable(page, 'html', 'another_website');
    await phantesta.expectDiff('unique_snapshot_name', 'another_website');
  }));
});
```

Snapshots will be stored in the `screenshotPath` directory with (default)
suffixes of `.good.png`, `.new.png`, `.diff.png`. You should commit all the
`.good.png` images to your git repository, and add all the `.new.png` and
`.diff.png` images to your `.gitignore`.

If an image is expected to be stable and it hasn't changed, it will only
have a `.good.png` in the screenshots directory. If it has changed, there will
be a `.new.png` and `.diff.png`, which represent the new screenshot and the
diff between the new screenshot and the old (good) one. If a change is
expected and intentional, overwrite the `.good.png` image with the `.new.png` image.
Because the `.good.png` images are committed to your repository, they will also
show up as changes in your code review tool.

## UI for managing screenshots

Eventually, you will have enough snapshots that it becomes a burden to manually
inspect and move them around. There is a UI that comes with Phantesta that
makes it significantly easier to review and accept changed snapshots. To do so,
run
```bash
    phantesta-server --host localhost --port 7991 --screenshotPath tests/visual/screenshots
```
then visit `localhost:7991` after running tests. This site will have all the
failed snapshots, with the option to view and accept diffs to snapshots.

## API

### new Phantesta(diffPage, options)

 - `diffPage` is one of:
   - a node-phantomjs page which is not used for anything else
   - a selenium driver which is not used for anything else
 - `options` is a dict with the keys
   - `screenshotPath` defaults to `"tests/visual/screenshots"`
   - `goodExt` defaults to `".good.png"`
   - `newExt` defaults to `".new.png"`
   - `diffExt` defaults to `".diff.png"`
   - `expectToBe` defaults to `function(actual, expected) { expect(actual).toBe(expected) }`
   - `expectNotToBe` defaults to `function(actual, expected) { expect(actual).not.toBe(expected) }`

Override the expectToBe and expectNotToBe calls with methods from your test
framework if you're not using jasmine.

### async Phantesta.prototype.expectStable(page, target, name)

 - `page` is one of:
   - the node-phantomjs page of which a screenshot is to be taken
   - the selenium driver of which a screenshot is to be taken
 - `target` is a selector used to target a portion of the page
 - `name` is a unique name for the snapshot

Passes if the screenshot is unchanged relative to the good `name` screenshot.
Fails and leaves `.new.png` and `.diff.png` images in the `screenshotPath` if
the screenshot has changed relative to the good `name` screenshot

### async Phantesta.prototype.expectSame(name1, name2)

Passes if the screenshot `name1` is the same as `name2`. Fails otherwise.

### async Phantesta.prototype.expectDiff(name1, name2)

Passes if the screenshot `name1` is different than `name2`. Fails otherwise.
