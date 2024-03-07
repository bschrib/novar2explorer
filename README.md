**Cloudflare R2** provides integration with Cloudflare's R2 service, allowing you to select files and upload them to any bucket you have configured, as well as delete remote files from R2 storage.

![](https://github.com/bschrib/novar2explorer/blob/main/images/CloudflareR2screenshot.png?raw=true)

## Requirements

Cloudflare R2 uses awscli (https://aws.amazon.com/cli/) and must be installed for the extension to function.

## Usage

To use Cloudflare R2 Explorer:

- Enable the Cloudflare R2 extension
- Configure your Cloudflare R2 AWS SDK and account info in the project settings.
- Select file(s) in the Local Files section of the R2 Explorer sidebar, then right click and choose to upload to Cloudflare R2; they'll be uploaded to whichever directory you have selected last in the Cloudflare R2 Files section of the sidebar (e.g. clicking a folder, or a file within that folder will cause the upload action to place files into that prefix)

### Configuration

To configure project level settings for Cloudflare R2 Explorer extension, open **Project → Projnect Settings...** then select Cloudflare R2 Explorer's **Settings** icon and configure the Cloudflare account ID, S3 access key ID, S3 secret access key, and the name of the R2 bucket.