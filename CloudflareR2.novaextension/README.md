<!--
👋 Hello! As Nova users browse the extensions library, a good README can help them understand what your extension does, how it works, and what setup or configuration it may require.

Not every extension will need every item described below. Use your best judgement when deciding which parts to keep to provide the best experience for your new users.

💡 Quick Tip! As you edit this README template, you can preview your changes by selecting **Extensions → Activate Project as Extension**, opening the Extension Library, and selecting "Cloudflare R2" in the sidebar.

Let's get started!
-->

<!--
🎈 Include a brief description of the features your extension provides. For example:
-->

**Cloudflare R2** provides integration with Cloudflare's R2 service, allowing you to select files and upload them to any buckets you have configured.

<!--
🎈 It can also be helpful to include a screenshot or GIF showing your extension in action:
-->

![](https://nova.app/images/en/dark/editor.png)

## Requirements

<!--
🎈 If your extension depends on external processes or tools that users will need to have, it's helpful to list those and provide links to their installers:
-->

Cloudflare R2 uses aws-sdk-js (https://github.com/aws/aws-sdk-js) and is included in the extension.

## Usage

<!--
🎈 If users will interact with your extension manually, describe those options:
-->

To run Cloudflare R2:

- Enable the Cloudflare R2 extension
- Configure your Cloudflare R2 AWS SDK and account info, along with any buckets you want to be able to upload to
- Select file(s) in the Files viewer of Nova, then right click and choose to upload to Cloudflare R2 -> Bucket

<!--
🎈 Alternatively, if your extension runs automatically (as in the case of a validator), consider showing users what they can expect to see:
-->

### Configuration

<!--
🎈 If your extension offers global- or workspace-scoped preferences, consider pointing users toward those settings. For example:
-->

To configure global preferences, open **Extensions → Extension Library...** then select Cloudflare R2's **Preferences** tab.

You can also configure preferences on a per-project basis in **Project → Project Settings...**

<!--
👋 That's it! Happy developing!

P.S. If you'd like, you can remove these comments before submitting your extension 😉
-->
