"use strict";

const AWS  = require('aws-sdk');
const fs = require('fs');
const path = require('path');
const fsp  = require('fs-promise');
const exec = require('child_process').exec;

const s3 = new AWS.S3({
  apiVersion: '2006-03-01'
});

function AppNotFoundError(message) {
  let error = new Error(message);
  error.name = 'AppNotFoundError';

  return error;
}

function parseExt(archivePath) {
  return archivePath.match(/(\.tar|\.tar\.gz|\.zip)$/)[0];
}
/*
 * Downloader class that downloads the latest version of the deployed
 * app from S3 and extracts it.
 */
class S3Downloader {
  constructor(options) {
    this.ui = options.ui;
    this.configBucket = options.bucket;
    this.configKey = options.key;
    this.currentPath = options.currentPath || 'current';
  }

  download() {
    if (!this.configBucket || !this.configKey) {
      this.ui.writeError('no S3 bucket or key provided; not downloading app');
      return Promise.reject(new AppNotFoundError());
    }

    return this.fetchCurrentVersion()
      .then(() => this.downloadAppArchive())
      .then(() => this.symlink())
      .then(() => this.currentPath);
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
        this.archivePath = path.basename(config.key);
      });
  }

  downloadAppArchive() {
    let ext = parseExt(this.archivePath);
    let newPath = path.basename(this.archivePath, ext);

    return fsp.stat(newPath)
      .then(() => {
        this.ui.writeLine('app alrady exists, skipping download');
        this.outputPath = newPath
        return this.outputPath;
      })
      .catch(() => {
	 return new Promise((res, rej) => {
	   let bucket = this.appBucket;
	   let key = this.appKey;

	   let params = {
	     Bucket: bucket,
	     Key: key
	   };

	   let archivePath = this.archivePath;
	   let file = fs.createWriteStream(archivePath);
	   let request = s3.getObject(params);

	   this.ui.writeLine("saving S3 object " + bucket + "/" + key + " to " + archivePath);

	   request.createReadStream().pipe(file)
             .on('close', res)
             .on('error', rej);
	 })
	 .then(() => this.extractApp())
         .then(() => this.cleanupArchive())
	 .then(() => this.renameAppPath())
	 .then(() => this.installNPMDependencies());
      });
  }

  extractApp() {
    let archivePath = this.archivePath;
    let cmds = {
      '.zip': 'unzip',
      '.tar': 'tar -xvf',
      '.tar.gz': 'tar -xvf'
    };

    let cmd = cmds[parseExt(archivePath)];

    this.ui.writeLine(`extracting archive...`);
    return this.exec(`${cmd} ${archivePath}`)
      .then(() => {
        this.ui.writeLine(`extracted ${archivePath}`);
      });
  }

  cleanupArchive() {
    return fsp.unlink(this.archivePath, function() {});
  }

  renameAppPath() {
    let ext = parseExt(this.archivePath);
    this.outputPath  = path.basename(this.archivePath, ext);
    return fsp.rename('deploy-dist', this.outputPath)
      .catch((error) => {
        this.ui.writeLine(error);
      });
  }

  symlink() {
    try {
      fs.unlink(this.currentPath);
    } finally {
      return fsp.symlink(this.outputPath, this.currentPath);
    }
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

function outputPathFor(archivePath) {
  let ext = parseExt(archivePath);
  let name = path.basename(archivePath, ext);

  // Remove MD5 hash
  return name.split('-').slice(0, -1).join('-');
}

module.exports = S3Downloader;
