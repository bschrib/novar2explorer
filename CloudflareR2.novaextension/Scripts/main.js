const { AwsClient } = require('../Libraries/aws4fetch.umd.js');

let awsClient;

nova.commands.register("uploadToCloudflareR2", displayBucketSelectionUI);

exports.activate = function() {
    // Do work when the extension is activated

    const bucketString = nova.workspace.config.get('com.trekbikes.cloudflarer2.cloudflareR2Buckets');
    const buckets = bucketString ? bucketString.split(",") : []; // Split the string into an array only if it's not null
    
    if (buckets.length > 0) {
        buckets.forEach(bucket => {
            const commandIdentifier = `uploadToBucket_${bucket}`;
            if (!nova.commands.registeredCommands[commandIdentifier]) {
                nova.commands.register(commandIdentifier, () => uploadToBucket(bucket));
            }
        });
    }
}

exports.deactivate = function() {
    // Clean up state before the extension is deactivated
}

async function uploadToBucket(bucketName) {
    const credentials = getCloudflareR2Credentials();
    const selectedFiles = nova.workspace.selectedPaths;
    
    if (!credentials.accessKey || credentials.accessKey === "default" || !credentials.secretKey || credentials.secretKey === "default") {
        nova.workspace.showInformativeMessage("Please set your Cloudflare R2 Access Key and Secret Key in the extension settings.");
        return; // Exit the function if the credentials are not set or are default
    }
    
    // Initialize the AwsClient from aws4fetch
    if (!awsClient) {
        awsClient = new AwsClient({
            accessKeyId: credentials.accessKey,
            secretAccessKey: credentials.secretKey,
            service: 's3',
            region: 'us-east-1' // or your specific region
        });
    }
    
    for (const filePath of selectedFiles) {
        const fileName = nova.path.basename(filePath);
        const fileContent = await nova.fs.open(filePath).read();

        const url = `https://${bucketName}.r2.cloudflarestorage.com/${fileName}`;
        const request = new Request(url, {
            method: 'PUT',
            body: fileContent
        });

        const signedRequest = await awsClient.sign(request);
        const response = await fetch(signedRequest);

        if (!response.ok) {
            console.error("Error uploading file:", response.statusText);
            nova.workspace.showInformativeMessage(`Error uploading ${fileName} to ${bucketName}`);
        } else {
            console.log(`File ${fileName} uploaded successfully to ${url}`);
            nova.workspace.showInformativeMessage(`File ${fileName} uploaded successfully to ${bucketName}`);
        }
    }
}

function getCloudflareR2Credentials() {
    const accessKey = nova.workspace.config.get('com.trekbikes.cloudflarer2.cloudflareR2AccessKey');
    const secretKey = nova.workspace.config.get('com.trekbikes.cloudflarer2.cloudflareR2SecretKey');
    const accountId = nova.workspace.config.get('com.trekbikes.cloudflarer2.cloudflareR2AccountId');

    const credentials = {
        accessKey: accessKey,
        secretKey: secretKey,
        accountId: accountId
    };

    console.log("Retrieved credentials:", credentials);

    return credentials;
}

function displayBucketSelectionUI() {
    const bucketString = nova.workspace.config.get('com.trekbikes.cloudflarer2.cloudflareR2Buckets');
    const buckets = bucketString ? bucketString.split(",") : [];
    
    if (buckets.length === 0) {
        nova.workspace.showInformativeMessage("No Cloudflare R2 Buckets are configured.");
        return;
    }

    // Display a dropdown or a list for bucket selection
    // This is a simplified example using a dropdown; you might want to use a more advanced UI
    const selectedBucket = nova.ui.showChoicePalette(buckets, "Select a Cloudflare R2 Bucket to upload to:");
    
    if (selectedBucket) {
        uploadToBucket(selectedBucket);
    }
}
