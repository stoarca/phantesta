# Phantesta

Phantesta is a testing library built on top of selenium.
It allows you to
write regression tests to ensure a rendered portion of a page does not change.

## Requirements
`Phantesta` depends on [ImageMagick][].

Please install this before continuing.

[ImageMagick]: http://www.imagemagick.org/

## Installation

```bash
npm install --save-dev phantesta
```

## Usage

```js
import { syncify } from 'jasmine_test_utils';
import path from 'path';
import Phantesta from 'phantesta';

describe('my test suite', function() {
  var page = null;
  var phantesta = null;

  var createDriver = async function() {
    var tmpdir = fs.mkdtempSync('/tmp/phantesta');
    var chromeOpts = new chrome.Options();
    chromeOpts.addArguments('--user-data-dir=' + tmpdir);
    var profile = new firefox.Profile();
    var firefoxOpts = new firefox.Options();
    firefoxOpts.setProfile(profile);
    return new Builder()
        .forBrowser('firefox')
        .setChromeOptions(chromeOpts)
        .setFirefoxOptions(firefoxOpts)
        .build();
  };

  beforeEach(syncify(async function() {
    phantesta = new Phantesta({
      screenshotPath: path.resolve(__dirname, '../screenshots'),
    });
    phantesta.group(__dirname);

    page = await createDriver();
  }));

  afterEach(syncify(async function() {
    phantesta.ungroup();

    await page.quit();
    phantesta.destructiveClearAllSnapshots();
  }));

  it('should do some tests', syncify(async function() {
    await page.open('http://www.google.com');
    await phantesta.expect(page).toMatchScreenshot('unique_snapshot_name');
    await phantesta.expect(page).toMatchScreenshot('unique_snapshot_name2');
    await phantesta.expectSame('unique_snapshot_name', 'unique_snapshot_name2');
    await page.open('http://www.asdf.com');
    await phantesta.expect(page).toMatchScreenshot('another_website');
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

## Remote Phantesta Server

The remote phantesta server will allow to upload and download snaphots to and from
a Remote Server along with the ability to view and review them. To deploy this remote server, simply run
```bash
    remote-phantesta-server --port 3000 --savePath /tmp/phantesta
```
The remote server `optionally` takes in the following arguments:
   - `port` defaults to 3000
   - `savePath` is the path where screenshots uploaded will be saved in the remote host. Defaults to ~/phantesta

then visit `localhost:3000`. This site will have a list of phantesta servers created.
Phantesta Servers are created when snapshots are uploaded to the server so that
they can be viewed and reviewed.

To upload snapshots to the server, run
```bash
    upload-to-remote-phantesta --url localhost:3000 --screenshotPath /home/screenshot --identifier uniqueIdentifier
```
upload-to-remote-phantesta takes in the following arguments:
  - `url` specifies where the remote server is running
  - `screenshotPath` is the path where all snapshots are located locally.
     This should be the same as the path which is used when initializing phantesta
  - `identifier` is a unique identifier that will be used to set the screenshots
     and phantesta-servers apart

To download snapshots from the server, run
```bash
    download-from-remote-phantesta --url localhost:3000 --downloadPath /home/screenshot --identifier identifierUsedWhenUploading
```
download-from-remote-phantesta takes in the following arguments:
  - `url` specifies where the remote server is running
  - `downloadPath` is the path the where all snapshots would be saved locally when downloading
  - `identifier` is a unique identifier that was used used when uploading screenshots to the remote server
  - `allFiles (optional)` if this is set to true, all files including diffs would be downloaded.
                          If set to false (default), it would only let you download files after
                          all diffs have been resolved on the remote server.


## API

### new Phantesta(options)

 - `options` is a dict with the keys
   - `screenshotPath` defaults to `"tests/visual/screenshots"`
   - `goodExt` defaults to `".good.png"`
   - `newExt` defaults to `".new.png"`
   - `diffExt` defaults to `".diff.png"`
   - `expectToBe` defaults to `function(actual, expected) { expect(actual).toBe(expected) }`
   - `expectNotToBe` defaults to `function(actual, expected) { expect(actual).not.toBe(expected) }`

Override the expectToBe and expectNotToBe calls with methods from your test
framework if you're not using jasmine.

### async Phantesta.prototype.expect(page, target) -> ScreenshotExpect

 - `page` is the selenium driver of which a screenshot is to be taken
 - `target` is a selector used to target a portion of the page

Passes if the screenshot is unchanged relative to the good `name` screenshot.
Fails and leaves `.new.png` and `.diff.png` images in the `screenshotPath` if
the screenshot has changed relative to the good `name` screenshot

#### async ScreenshotExpect.prototype.censorMatching(selector) -> ScreenshotExpect
 - `selector` is a CSS selector with which you mean to ignore a part of the screenshot for comparison
 - For example, `phantesta.expect(page).censorMatching('.ignore-in-ui-test').toMatchScreenshot('name');`

#### async ScreenshotExpect.prototype.censorRect(x, y, width, height) -> ScreenshotExpect
 - takes parameters for a box (with 0,0 in the top left), and censors that box so that it is excluded from any comparison
 - that is, the box censored by this method will contain pixels that can contain anything without failing the test

#### async ScreenshotExpect.prototype.includeOnlyRect(x, y, width, height) -> ScreenshotExpect
 - takes parameters for a box (with 0,0 in the top left), and censors anything not in that box from being included in the image comparison
 - if you include only multiple elements, their union is included and all other things are excluded
 - if you don't specify anything to include only, everything is included by default

#### async ScreenshotExpect.prototype.includeOnlyMatching(selector) -> ScreenshotExpect
 - finds all elements in the page matching `selector` and calls `includeOnlyRect` on them.

### async Phantesta.prototype.expectSame(name1, name2, boxes)

Passes if the screenshot `name1` is the same as `name2`. Fails otherwise.

 - `boxes` is an array of objects defining regions to ignore in the comparison where each region is defined with `x`, and `y` of the top left corner, as well as `w`, and `h` for width and height
  - e.g. `{ x: 100, y: 100, w: 100, h: 100 }` for a region positioned at (100, 100) that is 100 pixels in width and height

### async Phantesta.prototype.expectDiff(name1, name2, boxes)

Passes if the screenshot `name1` is different than `name2`. Fails otherwise.

 - `boxes` is an array of objects defining regions to ignore in the comparison where each region is defined with `x`, and `y` of the top left corner, as well as `w`, and `h` for width and height
  - e.g. `{ x: 100, y: 100, w: 100, h: 100 }` for a region positioned at (100, 100) that is 100 pixels in width and height

### Phantesta.prototype.group(groupName)

Change the current screenshot directory to a subdirectory named `groupName`.
Can be called multiple times.

Returns the current screenshot directory

### Phantesta.prototype.group()

Change the current screenshot directory to the parent.
Can be called multiple times.

If the current screenshot directory is the root screenshot directory,
this has no effect.

Returns the current screenshot directory

__NOTE:__ Place the call to `group` and `ungroup` inside
`beforeEach` and `afterEach` respectively when using jasmine.
