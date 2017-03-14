"use strict";

const AWS  = require('aws-sdk');
const fs = require('fs');
const path = require('path');
const fsp  = require('fs-promise');
const exec = require('child_process').exec;
const AdmZip = require('adm-zip');

const s3 = new AWS.S3({
  apiVersion: '2006-03-01',
  signatureVersion: 'v4'
});

function AppNotFoundError(message) {
  let error = new Error(message);
  error.name = 'AppNotFoundError';

  return error;
}
/*
 * Downloader class that downloads the latest version of the deployed
 * app from S3 and unzips it.
 */
class S3Downloader {
  constructor(options) {
    this.ui = options.ui;
    this.configBucket = options.bucket;
    this.configKey = options.key;
  }

  download() {
    if (!this.configBucket || !this.configKey) {
      this.ui.writeError('no S3 bucket or key provided; not downloading app');
      return Promise.reject(new AppNotFoundError());
    }

    return this.fetchCurrentVersion()
      .then(() => this.removeOldApp())
      .then(() => this.downloadAppZip())
      .then(() => this.unzipApp())
      .then(() => this.installNPMDependencies())
      .then(() => this.outputPath);
  }

  removeOldApp() {
    if (!this.outputPath) {
      return Promise.resolve();
    }
    
    this.ui.writeLine('removing ' + this.outputPath);
    return fsp.remove(this.outputPath);
  }

  fetchCurrentVersion() {
    let bucket = this.configBucket;
    let key = this.configKey;

    this.ui.writeLine('fetching current app version from ' + bucket + '/' + key);

    let params = {
      Bucket: bucket,
      Key: key
    };

    return s3.getObject(params).promise()
      .then(data => {
        let config = JSON.parse(data.Body);
        this.ui.writeLine('got config', config);

        this.appBucket = config.bucket;
        this.appKey = config.key;
        this.zipPath = path.basename(config.key);
        this.outputPath = outputPathFor(this.zipPath);
      });
  }

  downloadAppZip() {
    return new Promise((res, rej) => {
      let bucket = this.appBucket;
      let key = this.appKey;

      let params = {
        Bucket: bucket,
        Key: key
      };

      let zipPath = this.zipPath;
      let file = fs.createWriteStream(zipPath);
      let request = s3.getObject(params);

      this.ui.writeLine("saving S3 object " + bucket + "/" + key + " to " + zipPath);

      request.createReadStream().pipe(file)
        .on('close', res)
        .on('error', rej);
    });
  }

  unzipApp() {
    var zip = new AdmZip( this.zipPath; );
    zip.extractAllTo("./", true);
  }

  installNPMDependencies() {
    return this.exec(`cd ${this.outputPath} && npm install`)
      .then(() => this.ui.writeLine('installed npm dependencies'))
      .catch(() => this.ui.writeError('unable to install npm dependencies'));
  }

  exec(command) {
    return new Promise((resolve, reject) => {
      exec(command, (error, stdout, stderr) => {
        if (error) {
          this.ui.writeError(`error running command ${command}`);
          this.ui.writeError(stderr);
          reject(error);
        } else {
          resolve();
        }
      });
    });
  }
}

function outputPathFor(zipPath) {
  let name = path.basename(zipPath, '.zip');

  // Remove MD5 hash
  return name.split('-').slice(0, -1).join('-');
}

module.exports = S3Downloader;
