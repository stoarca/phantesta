import express from 'express';
import fs from 'fs';
import path from 'path';

const expandPath = function(p) {
  if (p[0] === '~') {
    return p.join(process.env.HOME, p.slice(1));
  }
  return p;
}

class RemoteServer {
  constructor(options) {
    this.port = options.port || 8000;
    this.screenshotPath = options.screenshotPath || '/tmp/phantesta';
    this.phantestaHost = options.phantestaHost || '0.0.0.0';
  }

  identifierPath(identifier) {
    // TODO: not safe in case of malicious identifier
    return expandPath(`${this.screenshotPath}/${identifier}`);
  }

  startServer() {
    if (!fs.existsSync(this.screenshotPath)) {
      fs.mkdirSync(this.screenshotPath);
    }
    let app = express();

    app.get('/',  (req, res) => {
      res.sendFile(path.resolve(__dirname, '../identifiers.html'));
    });

    app.get('/identifiers',  (req, res) => {
      try {
        const jobs = fs.readdirSync(this.screenshotPath, { withFileTypes: true})
          .filter(f => f.isDirectory())
          .map(d => {
            return {
              identifier: d.name,
              url: `/${d.name}/`,
              date: new Date()
            }
          })
          .sort(d => d.identifier)
          .reverse();
        res.send({
          servers: jobs,
          dir: this.screenshotPath
        });
      } catch (error) {
        console.error('Error while loading identifiers');
        console.error(error);
        throw error;
      }
    });

    app.get('/:identifier/start',  (req, res) => {
      res.send(`deprecated`);
    });

    app.get('/:identifier/image/:name',  (req, res) => {
      const {identifier, name} = req.params;
      try {
        const imagePath = `${this.screenshotPath}/${identifier}/${name}`;
        res.sendFile(imagePath);
      } catch (error) {
        console.error(`Failed to serve image ${identifier} > ${name}`);
        console.error(error);
        throw error;
      }
    });

    app.get('/:identifier/files', (req, res) => {
      const {identifier} = req.params;
      try {
        const identifierFolder = this.identifierPath(identifier);
        const files = fs.readdirSync(identifierFolder, { withFileTypes: true})
          .filter(f => f.isFile())
          .map(d => d.name);
        const fileNames = files.map(f => f.split('.')[0]);
        const dedupedFileNames = new Set(fileNames);

        const types = ['good', 'new', 'diff'];
        const imageDiffs = Array.from(dedupedFileNames)
        .map(fileName => {
          const element = {
            name: fileName
          };
          for (let i = 0; i < types.length; i++) {
            const type = types[i];
            const typeFile = `${fileName}.${type}.png`;
            if (files.indexOf(typeFile) >= 0) {
              const propName = `${type}Src`;
              const imageEndpoint = `./image/${typeFile}`;
              element[propName] = imageEndpoint;
            }
          }
          return element;
        });

        res.send({
          diffs: imageDiffs
        });
      } catch (error) {
        console.error(`Failed to get files for ${identifier}`);
        console.error(error);
        throw error;
      }
    });

    app.post('/:identifier/upload/:fileName',  (req, res) => {
      const {identifier, fileName} = req.params;
      try {
        let dir = path.dirname(fileName);
        let name = path.basename(fileName);

        let identifierFolderPath = `${this.identifierPath(identifier)}`;
        let filePath = `${this.identifierPath(identifier)}/${dir}`;

        if (!fs.existsSync(identifierFolderPath)) {
          fs.mkdirSync(identifierFolderPath);
        }
        //pipe it to /commitNumber/screenShots
        let stream = fs.createWriteStream(`${filePath}/${name}`);

        req.pipe(stream);

        stream.on('drain', function() {
          req.resume();
        });
        req.on('error', function (err) {
          console.error(`Failed to receive ${identifier} > ${fileName}`, err);
        });
        req.on('end', function () {
          console.log(`${identifier} > ${fileName} received`);
          res.send(200);
        });
      } catch (error) {
        console.error(
          `Error while uploading ${identifier} > ${fileName}`
        );
        console.error(error);
        throw error;
      }
    });

    app.all('/:identifier/images/:name(*)',  (req, res) => {
      try {
        const {identifier, name} = req.params;
        const imagePath = `${this.identifierPath(identifier)}/${name}`;
        res.sendFile(imagePath);
      } catch (error) {
        console.error(
          `Failed to serve image ${req.params.identifier} > ${req.params.name}`
        );
        console.error(error);
        throw error;
      }
    });

    app.get('/:identifier/',  (req, res) => {
      if (!req.url.endsWith('/')) {
        res.redirect(301, `${req.url}/`);
      }
      res.sendFile(path.resolve(__dirname,'../identifier-details.html'));
    });

    app.listen(this.port, () => {
      console.log(`Server started on ${this.port}`);
    })

  }
}

export default RemoteServer;
