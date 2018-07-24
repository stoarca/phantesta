import express from 'express';
import child_process from 'child_process';
import fs from 'fs-extra'; //need fs extra to remove files recursively
import mkdirp from 'mkdirp';
import path from 'path';
import getPort from 'get-port';
import httpProxy from 'http-proxy';
import recursive from 'recursive-readdir';
import request from 'request';
import bodyParser from 'body-parser';

class RemoteServer {

  constructor(options) {
    this.port = options.port || 8000;
    this.maxPhantesta = options.maxPhantestaServers || 20;
    this.screenshotPath = options.screenshotPath || '/home/phantesta';
    this.phantestaHost = options.phantestaHost || '0.0.0.0';

    this.serversInUse = {};
    this.serverQueue = [];
  }

  startServer() {

    let app = express();

    app.use('/*/list_files', bodyParser.json());
    app.use('/settings/set_max_phantesta', bodyParser.json());
    app.use('/settings/set_max_phantesta', bodyParser.urlencoded({ extended: true }));

    app.get('/',  (req, res) => {
      res.sendFile(path.resolve(__dirname, '../list_of_phantesta_server.html'));
    });

    app.get('/settings',  (req, res) => {
      res.sendFile(path.resolve(__dirname,'../remote_server_settings.html'));
    });

    app.get('/settings/get_max_phantesta',  (req, res) => {
      res.send({max_phantesta: this.maxPhantesta});
    });

    app.post('/settings/set_max_phantesta',  (req, res) => {
      this.maxPhantesta = req.body.max_number;
      res.sendFile(path.resolve(__dirname, '../list_of_phantesta_server.html'));
    });

    app.get('/list_of_servers',  (req, res) => {

      let servers = [];

      for (let key in this.serversInUse) {
        if( this.serversInUse.hasOwnProperty(key) ) {
          servers.push({
            identifier: key,
            url: `/${key}/`,
            date: this.serversInUse[key].date,
          })
        }
      }
      res.send({servers: servers});
    });

    app.get('/:identifier/start',  (req, res) => {
      this._spawnPhantestaServer(req.params.identifier);
      res.send(`started phantesta server for ${req.params.identifier}`);
    });

    app.post('/:identifier/list_files', (req, res) => {

      if (!this.serversInUse[req.params.identifier]) {
        res.send(null);
        return;
      }

      if (req.body.allFiles) {
        recursive(`${this.screenshotPath}/${req.params.identifier}`,  (err, files) => {
          res.send(files.map( (file) => {
            return path.relative(`${this.screenshotPath}/${req.params.identifier}`, file);
          }));
        });
      } else {
        request(
            `http://${this.phantestaHost}:${this.serversInUse[req.params.identifier].port}/list_of_diffs`,
            (error, response, body) => {
              //dont send any files if diffs have not all been accepted/deleted
              if (JSON.parse(body).diffs.length) {
                res.send({});
                return;
              }
              recursive(`${this.screenshotPath}/${req.params.identifier}`,  (err, files) => {
                res.send(files.map( (file) => {
                  return path.relative(`${this.screenshotPath}/${req.params.identifier}`, file);
                }));
              });
            });
      }
    });

    app.get('/:identifier/download/:filePath', (req, res) => {

      let filePath = path.resolve(`${this.screenshotPath}/${req.params.identifier}`, req.params.filePath);
      let imageStream = fs.createReadStream(filePath);

      res.on('drain', function () {
        imageStream.resume();
      });
      res.on('error', function (err) {
        console.error('cannot send file' + ': ' + err);
      });
      imageStream.on('end', function () {
        console.log('file sent');
      });
      imageStream.on('error', function (err) {
        //consumes error if no file exists
        console.error(err);
      });
      imageStream.pipe(res);
    });

    app.post('/:identifier/upload/:fileName',  (req, res) => {

      let identifier = req.params.identifier;
      let fileName = req.params.fileName;

      let dir = path.dirname(fileName);
      let name = path.basename(fileName);

      let filePath = `${this.screenshotPath}/${identifier}/${dir}`;

      //make sure directory exists
      mkdirp(filePath,  (err) => {
        if (err) {
          console.error(err)
        }
        else {

          if (!(identifier in this.serversInUse)) {
            this._spawnPhantestaServer(identifier);
          }

          //pipe it to /commitNumber/screenShots
          let dst = fs.createWriteStream(`${filePath}/${name}`);

          req.pipe(dst);

          dst.on('drain', function() {
            req.resume();
          });
          req.on('error', function (err) {
            console.error(err);
          });
          req.on('end', function () {
            console.log('file recieved');
            res.send(200);
          });
        }
      });

    });

    app.all('/:identifier/images/:imgPath(*)',  (req, res) => {
      this._reverseProxy(req.params.identifier, req, res, `images/${encodeURIComponent(req.params.imgPath)}`);
    });

    app.all('/:identifier/:action(*)',  (req, res) => {
      this._reverseProxy(req.params.identifier, req, res, req.params.action);
    });

    app.listen(this.port, () => {
      console.log(`Server started on ${this.port}`);
    })

  }

  _reverseProxy(identifier, req, res, modifiedPath) {

    if (!this.serversInUse[req.params.identifier]) {
      res.send(`Could not find ${identifier}`);
      return;
    }

    if (modifiedPath) {
      req.url = modifiedPath;
    } else {
      req.url = '';
    }

    let localServer = `http://${this.phantestaHost}:${this.serversInUse[identifier].port}`;
    let proxy = new httpProxy.createProxyServer({
      target: localServer,
    });

    proxy.on('error', function(err) {
      console.error('hello', err);
    });

    proxy.web(req, res);
  }

  _spawnPhantestaServer(identifier) {

    if (identifier in this.serversInUse) {
      console.log('Phantesta Server already running for this identifier');
      return ;
    }

    if (this.serverQueue.length >= this.maxPhantesta) {
      this._removePhantestaServer(this.serverQueue.shift());
    }

    getPort().then(port => {

      let path = path.resolve(__dirname, 'bin/phantesta-server.js');

      let phantestaProcess = child_process.exec(
          `babel-node ${path} \\
          --host ${this.phantestaHost} --port ${port} \\
          --screenshotPath ${this.screenshotPath}/${identifier}`
      );

      phantestaProcess.stdout.on('data', (data) => {
        console.log(`${identifier} stdout: ${data}`);
      });

      phantestaProcess.stderr.on('data', (data) => {
        console.error(`${identifier} stderr: ${data}`);
      });

      this.serversInUse[identifier] = {port: port, date: getDate()};
      this.serverQueue.push(identifier);
    })
  }

  _removePhantestaServer(identifier) {

    request(`${this.phantestaHost}:${this.serversInUse[identifier].port}/stop_server`,  () => {

      delete this.serversInUse[identifier];

      //remove the screenshots dir
      // fs.remove(`${this.screenshotPath}/${identifier}`, () => {
      //   delete this.serversInUse[identifier];
      // });
    });
  }

}

let getDate = function () {

  let today = new Date();
  let day = today.getDate();
  let month = today.getMonth() + 1; //January is 0
  let year = today.getFullYear();

  let hour = today.getHours();
  let min = today.getMinutes();

  if(day < 10) {
    day = '0'+day
  }

  if(month < 10) {
    month = '0'+month
  }

  return `${month}/${day}/${year} ${hour}:${min}`;
};

export default RemoteServer;