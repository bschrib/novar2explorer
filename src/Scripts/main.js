const s3Client = require('s3-client');

exports.activate = function() {
    const credentials = getCloudflareR2Credentials();
    const buckets = nova.workspace.config.get('com.trekbikes.cloudflarer2.cloudflareR2Buckets');
    const action = nova.commands.registeredActions.get('uploadToCloudflareR2');
    
    if (buckets && action) {
        action.subactions = buckets.map(bucket => {
            return {
                "identifier": `uploadToBucket_${bucket}`,
                "title": bucket,
                "callback": () => uploadToBucket(bucket, credentials)
            };
        });
    }
}

exports.deactivate = function() {
    // Clean up state before the extension is deactivated
}

function uploadToBucket(bucketName, credentials) {
    const selectedFiles = nova.workspace.selectedPaths;

    const client = s3Client.createClient({
        s3Options: {
            accessKeyId: credentials.accessKey,
            secretAccessKey: credentials.secretKey,
            region: 'us-east-1',
            endpoint: `https://${credentials.accountId}.r2.cloudflarestorage.com`
        }
    });

    selectedFiles.forEach(filePath => {
        const fileName = nova.path.basename(filePath);
        const fileStream = nova.fs.createReadStream(filePath);

        const uploader = client.uploadFile({
            localFile: filePath,
            s3Params: {
                Bucket: bucketName,
                Key: fileName,
                Body: fileStream
            }
        });

        uploader.on('error', function(err) {
            console.error("Error uploading file:", err);
            nova.workspace.showInformativeMessage(`Error uploading ${fileName} to ${bucketName}`);
        });

        uploader.on('end', function(data) {
            console.log(`File ${fileName} uploaded successfully to ${data.Location}`);
            nova.workspace.showInformativeMessage(`File ${fileName} uploaded successfully to ${bucketName}`);
        });
    });
}

function getCloudflareR2Credentials() {
    const accessKey = nova.workspace.config.get('com.trekbikes.cloudflarer2.cloudflareR2AccessKey');
    const secretKey = nova.workspace.config.get('com.trekbikes.cloudflarer2.cloudflareR2SecretKey');
    const accountId = nova.workspace.config.get('com.trekbikes.cloudflarer2.cloudflareR2AccountId');

    return {
        accessKey: accessKey,
        secretKey: secretKey,
        accountId: accountId
    };
}
