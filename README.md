## FastBoot S3 Downloader

This downloader for the [FastBoot App Server][app-server] works with AWS
S3 to download and unzip the latest version of your deployed
application.

[app-server]: https://github.com/ember-fastboot/fastboot-app-server

To use the downloader, configure it with an S3 bucket and key:

```js
let downloader = new S3Downloader({
  bucket: S3_BUCKET,
  key: S3_KEY,
  s3_options: { // optional - any S3 SDK option
    accessKeyId: S3_ACCESS_KEY_ID,
    secretAccessKey: S3_SECRET_ACCESS_KEY,
    region: AWS_REGION
  }
});

let server = new FastBootAppServer({
  downloader: downloader
});
```

When the downloader runs, it will download the file at the specified
bucket and key. That file should be a JSON file that points at the
_real_ application, and looks like this:

```json
{
  "bucket": "S3_BUCKET",
  "key": "path/to/dist.zip"
}
```

Once downloaded, this file is parsed to find the location of the actual
app bundle, which should be a zip file somewhere else on S3.

Why this layer of indirection? By configuring the app server to look in
a static location on S3, you don't need to propagate config changes to
all of your app servers when you deploy a new version. Instead, they can
just grab a fixed file to determine the current version.

If you like this, you may also be interested in the companion
[fastboot-s3-notifier](https://github.com/tomdale/fastboot-s3-notifier).
