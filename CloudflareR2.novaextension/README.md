**Cloudflare R2** provides integration with Cloudflare's R2 service, allowing you to select files and upload them to any bucket you have configured, as well as delete remote files from the R2 storage.

![](https://bitbucket.org/trekbikes/nova-cloudflarer2/raw/2ddb2cf917e6de9bfc9a0fe759de95f609b7ae63/CloudflareR2.novaextension/Images/cloudflarer2-screenshots/CloudflareR2-screenshot-01.png)

## Requirements

Cloudflare R2 uses awscli (https://aws.amazon.com/cli/) and must be installed for the extension to function.

## Usage

To use Cloudflare R2 Explorer:

- Enable the Cloudflare R2 extension
- Configure your Cloudflare R2 AWS SDK and account info
- Select file(s) in the Local Files section of the R2 Explorer sidebar, then right click and choose to upload to Cloudflare R2; they'll be uploaded to whichever directory you have selected last in the Cloudflare R2 Files section of the sidebar (e.g. clicking a folder, or a file within that folder will cause the upload action to place files into that prefix)

### Configuration

To configure global Cloudflare R2 Explorer extension, open **Extensions → Extension Library...** then select Cloudflare R2's **Settings** tab.

<!--
You can also configure preferences on a per-project basis in **Project → Project Settings...**
-->