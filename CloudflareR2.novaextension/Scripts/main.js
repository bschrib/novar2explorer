class File {
    constructor(uri) {
        this.uri = uri;
        this.name = nova.path.basename(uri);
    }
}

class FileProvider {
    constructor() {
        this.files = [];
        this.refreshFiles();
    }

    refreshFiles() {
        // Here, you can populate the 'this.files' array with the local files you want to display.
        // For simplicity, let's assume you want to show all files in the workspace root.
        const workspacePath = nova.workspace.path;
        const fileURIs = nova.fs.listdir(workspacePath);
        this.files = fileURIs.map(uri => new File(uri));
    }

    getChildren(element) {
        if (!element) {
            return this.files;
        }
        return [];
    }

    getTreeItem(element) {
        let item = new TreeItem(element.name);
        item.command = "cloudflarer2.upload"; // Set default action to upload when clicked
        return item;
    }
}

class CloudflareR2File {
    constructor(name) {
        this.name = name;
    }
}

class CloudflareR2FileProvider {
    constructor() {
        this.files = [];
        this.bucketName = ""; // Add this line to store the current bucket name
        this.refreshFiles();
    }
    
    async refreshFiles() {
        return new Promise((resolve, reject) => {
            try {
                // Fetch the bucket names and other necessary credentials from the config
                this.bucket = nova.config.get("com.trekbikes.cloudflarer2.cloudflareR2Bucket", "string");
                const accessKey = nova.config.get("com.trekbikes.cloudflarer2.cloudflareR2AccessKey", "string");
                const secretKey = nova.config.get("com.trekbikes.cloudflarer2.cloudflareR2SecretKey", "string");
                const accountId = nova.config.get("com.trekbikes.cloudflarer2.cloudflareR2AccountId", "string");
                
                // Use Nova's Process API to run the AWS CLI command with the provided arguments
                let process = new Process("/usr/bin/env", {
                    args: [
                        "AWS_ENDPOINT_URL=https://" + accountId + ".r2.cloudflarestorage.com",
                        "AWS_DEFAULT_OUTPUT=json",
                        "AWS_DEFAULT_REGION=auto",
                        "AWS_ACCESS_KEY_ID=" + accessKey,
                        "AWS_SECRET_ACCESS_KEY=" + secretKey,
                        "aws", "s3", "ls", `s3://${this.bucket}`
                    ],
                    shell: true
                });
                
                let accumulatedOutput = ""; // Variable to accumulate the output
                
                process.onStdout((output) => {
                    accumulatedOutput += output; // Accumulate the output
                });
                
                process.onStderr((error) => {
                    console.error("Error:", error);
                });
                
                process.onDidExit((exitCode) => {
                    if (exitCode === 0) { // Check if the process exited successfully
                        // Split the accumulated output by newline to get individual lines
                        let lines = accumulatedOutput.trim().split('\n');
                
                        // Extract file names from each line
                        this.files = lines.map(line => {
                            // Assuming the file name is the last space-separated value in each line
                            let parts = line.trim().split(/\s+/);
                            return new CloudflareR2File(parts[parts.length - 1]);
                        });
                        resolve(); // Resolve the promise when the process completes successfully
                    } else {
                        console.error("Process exited with code:", exitCode);
                        reject(new Error("Process exited with code: " + exitCode)); // Reject the promise if there's an error
                    }
                });
                
                process.start();
            
            } catch (error) {
                console.error("Error fetching files from Cloudflare R2:", error);
                reject(error); // Reject the promise if there's an error
            }
        });
    }
    
    // Override the getRoot method to return a custom root element
    getRoot() {
        return new TreeItem(this.bucket, TreeItemCollapsibleState.Expanded);
    }

    getChildren(element) {
        if (!element || element.name === this.bucket) { // Check if the element is the bucket name
            return this.files;
        }
        return [];
    }

    getTreeItem(element) {
        let item = new TreeItem(element.name);
        item.command = "cloudflarer2.deleteR2"; // Set default action to delete when clicked
        return item;
    }
}

exports.activate = function() {
    if (typeof URL === 'undefined') {
        this.URL = function(urlString) {
            let anchor = document.createElement('a');
            anchor.href = urlString;
            return anchor;
        };
    }
    
    const localFileProvider = new FileProvider();
    const localFileTreeView = new TreeView("localFiles", { dataProvider: localFileProvider });
    nova.subscriptions.add(localFileTreeView);
    
    const cloudflareR2FileProvider = new CloudflareR2FileProvider();
    const cloudflareR2FileTreeView = new TreeView("cloudflareR2Files", { dataProvider: cloudflareR2FileProvider });
    nova.subscriptions.add(cloudflareR2FileTreeView);


    // Register commands
    nova.commands.register("cloudflarer2.upload", (file) => {
        // Implement the upload functionality here
        // Use the 'file.uri' to get the file path
    });

    nova.commands.register("cloudflarer2.delete", (file) => {
        // Implement the delete functionality here
        // Use the 'file.uri' to get the file path
    });

    nova.commands.register("cloudflarer2.refresh", () => {
        localFileProvider.refreshFiles();
        localFileTreeView.reload();
    });
    
    nova.commands.register("cloudflarer2.refreshR2", () => {
        cloudflareR2FileProvider.refreshFiles();
        cloudflareR2FileTreeView.reload();
    });
}

exports.deactivate = function() {
    // Clean up any state or listeners here if needed
}
