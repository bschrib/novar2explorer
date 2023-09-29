class CloudflareR2App {
	constructor() {
		this.localFileProvider = new FileProvider();
		this.localFileTreeView = new TreeView("localFiles", { dataProvider: this.localFileProvider });
		nova.subscriptions.add(this.localFileTreeView);

		this.cloudflareR2FileProvider = new CloudflareR2FileProvider();
		this.cloudflareR2FileTreeView = new TreeView("cloudflareR2Files", { dataProvider: this.cloudflareR2FileProvider });
		nova.subscriptions.add(this.cloudflareR2FileTreeView);
		
		// Add this line to refresh the Cloudflare R2 files when the app is initialized
		this.cloudflareR2FileProvider.refreshFiles().then(() => {
			this.cloudflareR2FileTreeView.reload();
		});
		
		// Add this event listener:
		this.cloudflareR2FileTreeView.onDidChangeSelection(() => {
			if (this.cloudflareR2FileProvider.files.length === 0) {
				this.cloudflareR2FileProvider.refreshFiles().then(() => {
					this.cloudflareR2FileTreeView.reload();
				});
			}
		});

		this.init();
	}

	init() {
		if (typeof URL === 'undefined') {
			this.URL = function(urlString) {
				let anchor = document.createElement('a');
				anchor.href = urlString;
				return anchor;
			};
		}

		this.registerCommands();
	}

	registerCommands() {
		nova.commands.register("cloudflarer2.upload", async () => {
			const selectedFiles = this.getLocalFileSelection();
			for (const file of selectedFiles) {
				await this.cloudflareR2FileProvider.uploadFileToCloudflareR2(file.uri);
			}
			// Refresh the Cloudflare R2 Files section after the upload
			await this.cloudflareR2FileProvider.refreshFiles();
			this.cloudflareR2FileTreeView.reload();
		});

		nova.commands.register("cloudflarer2.refreshR2", async () => {
			await this.cloudflareR2FileProvider.refreshFiles();
			this.cloudflareR2FileTreeView.reload();
		});

		nova.commands.register("cloudflarer2.refresh", async () => {
			await this.localFileProvider.refreshFiles();
			this.localFileTreeView.reload();
		});

		nova.commands.register("cloudflarer2.deleteR2", async () => {
			const selectedFiles = this.getCurrentSelection();
			for (const file of selectedFiles) {
				await this.cloudflareR2FileProvider.deleteFileFromCloudflareR2(file.key);
			}
			this.cloudflareR2FileTreeView.reload();
		});
	}
	
	getCurrentSelection() {
		return this.cloudflareR2FileTreeView.selection;
	}
	
	getLocalFileSelection() {
		return this.localFileTreeView.selection;
	}
}

function buildFileTree(contents) {
	const rootNode = { children: {} };

	for (const item of contents) {
		const parts = item.Key.split('/');
		let currentNode = rootNode;

		for (let i = 0; i < parts.length; i++) {
			const part = parts[i];
			if (!currentNode.children[part]) {
				if (i === parts.length - 1) {
					currentNode.children[part] = item; // It's a file
				} else {
					currentNode.children[part] = { children: {} }; // It's a folder
				}
			}
			currentNode = currentNode.children[part];
		}
	}

	return rootNode;
}

class File {
	constructor(uri, isFolder = false) {
		this.uri = uri;
		this.name = nova.path.basename(uri);
		this.isFolder = isFolder;
	}
}

class FileProvider {
	constructor() {
		this.files = [];
		this.refreshFiles();
	}

	async refreshFiles(parentUri = nova.workspace.path) {
	
		try {
			const fileURIs = await nova.fs.listdir(parentUri);
	
			const absoluteFileURIs = fileURIs.map(uri => nova.path.join(parentUri, uri)); // Convert to absolute paths
	
			const fileStatsPromises = absoluteFileURIs.map(async absoluteUri => {
				try {
					const stats = await nova.fs.stat(absoluteUri);
	
					if (stats) { 
						const isDir = stats.isDirectory();
						return new File(absoluteUri, isDir);
					}
				} catch (error) {
					console.error("Error processing URI:", absoluteUri, error);
				}
				return null;
			});
	
			this.files = (await Promise.all(fileStatsPromises)).filter(file => file !== null);
		} catch (error) {
			console.error("Error listing URIs for:", parentUri, error);
		}
	}

	async getChildren(element) {
		if (!element) {
			return this.files;
		}
		if (element.isFolder) {
			await this.refreshFiles(element.uri); // Refresh files for the clicked folder
			return this.files; // Return the refreshed files
		}
		return [];
	}


	getTreeItem(element) {
		let item = new TreeItem(element.name);
		if (element.isFolder) {
			item.collapsibleState = TreeItemCollapsibleState.Collapsed;
		} else {
			item.command = "cloudflarer2.upload";
		}
		return item;
	}

}

class CloudflareR2File {
	constructor(key, isFolder = false) {
		this.key = key;
		this.name = key.split('/').pop();
		this.isFolder = isFolder;
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
						"aws", "s3api", "list-objects", "--bucket", this.bucket
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
					if (exitCode === 0) {
						const parsedOutput = JSON.parse(accumulatedOutput);
						this.files = parsedOutput.Contents.map(item => {
							const isFolder = item.Key.endsWith('/');
							return new CloudflareR2File(item.Key, isFolder);
						});
						this.fileTree = buildFileTree(parsedOutput.Contents);
						resolve();
					} else {
						console.error("Process exited with code:", exitCode);
						reject(new Error("Process exited with code: " + exitCode));
					}
				});
				
				process.start();
			
			} catch (error) {
				console.error("Error fetching files from Cloudflare R2:", error);
				reject(error); // Reject the promise if there's an error
			}
		});
	}
	
	async deleteFileFromCloudflareR2(fileName) {
		return new Promise((resolve, reject) => {
			try {
				// Fetch the necessary credentials from the config
				const bucket = nova.config.get("com.trekbikes.cloudflarer2.cloudflareR2Bucket", "string");
				const accessKey = nova.config.get("com.trekbikes.cloudflarer2.cloudflareR2AccessKey", "string");
				const secretKey = nova.config.get("com.trekbikes.cloudflarer2.cloudflareR2SecretKey", "string");
				const accountId = nova.config.get("com.trekbikes.cloudflarer2.cloudflareR2AccountId", "string");
				
				// Use Nova's Process API to run the AWS CLI command with the provided arguments
				let process = new Process("/usr/bin/env", {
					args: [
						`AWS_ENDPOINT_URL=https://${accountId}.r2.cloudflarestorage.com`,
						"AWS_DEFAULT_OUTPUT=json",
						"AWS_DEFAULT_REGION=auto",
						`AWS_ACCESS_KEY_ID=${accessKey}`,
						`AWS_SECRET_ACCESS_KEY=${secretKey}`,
						"aws", "s3api", "delete-object", "--bucket", bucket, "--key", fileName
					],
					shell: true
				});
				
				process.onStdout((output) => {
					// console.log("Output:", output);
				});
				
				process.onStderr((error) => {
					console.error("Error:", error);
				});
				
				process.onDidExit((exitCode) => {
					if (exitCode === 0) {
						console.log("File deleted successfully:", fileName);
						this.files = this.files.filter(file => file.key !== fileName);
						this.fileTree = buildFileTree(this.files.map(file => ({ Key: file.key })));
						resolve();
					} else {
						console.error("Process exited with code:", exitCode);
						reject(new Error("Process exited with code: " + exitCode));
					}
				});
				
				process.start();
			
			} catch (error) {
				console.error("Error deleting file from Cloudflare R2:", error);
				reject(error);
			}
		});
	}
	
	async uploadFileToCloudflareR2(filePath) {
		return new Promise((resolve, reject) => {
			try {
				const bucket = nova.config.get("com.trekbikes.cloudflarer2.cloudflareR2Bucket", "string");
				const accessKey = nova.config.get("com.trekbikes.cloudflarer2.cloudflareR2AccessKey", "string");
				const secretKey = nova.config.get("com.trekbikes.cloudflarer2.cloudflareR2SecretKey", "string");
				const accountId = nova.config.get("com.trekbikes.cloudflarer2.cloudflareR2AccountId", "string");
				const fileName = nova.path.basename(filePath);
	
				let process = new Process("/usr/bin/env", {
					args: [
						`AWS_ENDPOINT_URL=https://${accountId}.r2.cloudflarestorage.com`,
						"AWS_DEFAULT_OUTPUT=json",
						"AWS_DEFAULT_REGION=auto",
						`AWS_ACCESS_KEY_ID=${accessKey}`,
						`AWS_SECRET_ACCESS_KEY=${secretKey}`,
						"aws", "s3api", "put-object", "--bucket", bucket, "--key", fileName, "--body", filePath
					],
					shell: true
				});
	
				process.onStdout((output) => {
					console.log("Output:", output);
				});
	
				process.onStderr((error) => {
					console.error("Error:", error);
				});
	
				process.onDidExit((exitCode) => {
					if (exitCode === 0) {
						console.log("File uploaded successfully:", fileName);
						this.files.push(new CloudflareR2File(fileName)); // Add the uploaded file to the files array
						resolve();
					} else {
						console.error("Process exited with code:", exitCode);
						reject(new Error("Process exited with code: " + exitCode));
					}
				});
	
				process.start();
	
			} catch (error) {
				console.error("Error uploading file to Cloudflare R2:", error);
				reject(error);
			}
		});
	}
	
	// Override the getRoot method to return a custom root element
	getRoot() {
		return new TreeItem(this.bucket, TreeItemCollapsibleState.Expanded);
	}

	getChildren(element) {
		if (!this.fileTree || !this.fileTree.children) {
			return []; // Return an empty array if the fileTree is not yet populated
		}
	
		if (!element) {
			return Object.keys(this.fileTree.children).map(key => new CloudflareR2File(key, this.fileTree.children[key].children !== undefined));
		}
		if (element.isFolder && this.fileTree.children[element.name]) {
			return Object.keys(this.fileTree.children[element.name].children).map(key => new CloudflareR2File(key, this.fileTree.children[element.name].children[key].children !== undefined));
		}
		return [];
	}
	
	getTreeItem(element) {
		let item = new TreeItem(element.name);
		if (element.isFolder) {
			item.collapsibleState = TreeItemCollapsibleState.Collapsed;
		} else {
			item.command = "cloudflarer2.deleteR2";
		}
		return item;
	}
}

exports.activate = function() {
	new CloudflareR2App();
}

exports.deactivate = function() {
	// Clean up any state or listeners here if needed
}
